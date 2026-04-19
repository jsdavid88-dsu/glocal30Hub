# 공지 시스템 + 피드 패널 + Web Push 설계

> 작성일: 2026-04-20
> 상태: Draft

## 1. 개요

연구실 협업 허브에 **공지 시스템**, **실시간 피드 패널**, **브라우저 푸시 알림**을 추가한다.

**목표:**
- 교수/관리자가 대상별 공지를 발행하고 읽음을 추적
- 모든 페이지에서 오른쪽 사이드 패널로 활동 흐름을 실시간 확인
- 크롬/엣지 브라우저 푸시로 공지/댓글/태스크 배정을 놓치지 않게

**스코프 외:**
- 1:1 메시지 (카톡/슬랙 사용)
- SOTA 리뷰 피드 연동 (별도 개발 후 통합)
- 태스크/데일리 → Google Calendar 동기화 (별도 이슈)

---

## 2. DB 모델

### 2.1 Announcement

```python
class AnnouncementAudience(str, Enum):
    everyone = "everyone"     # 전원
    professors = "professors" # professor + admin
    students = "students"     # student 전체
    project = "project"       # 특정 프로젝트 멤버

class Announcement(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "announcements"

    author_id: UUID → users.id
    title: String(200)
    body: Text
    audience: AnnouncementAudience
    project_id: UUID | None → projects.id  # audience=project일 때 필수
    pinned: bool (default False)
    expires_at: DateTime(timezone=True) | None
```

**제약조건:**
- `audience = 'project'`이면 `project_id IS NOT NULL` (CHECK)
- `audience != 'project'`이면 `project_id IS NULL` (CHECK)

### 2.2 AnnouncementRead

```python
class AnnouncementRead(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "announcement_reads"

    announcement_id: UUID → announcements.id (CASCADE)
    user_id: UUID → users.id
    read_at: DateTime(timezone=True) (server_default=func.now())

    __table_args__ = (UniqueConstraint('announcement_id', 'user_id'),)
```

**인덱스:** `(announcement_id)`, `(user_id, announcement_id)`

### 2.3 PushSubscription

```python
class PushSubscription(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "push_subscriptions"

    user_id: UUID → users.id (CASCADE)
    endpoint: Text
    p256dh: String(256)
    auth: String(256)

    __table_args__ = (UniqueConstraint('user_id', 'endpoint'),)
```

---

## 3. 피드 패널

### 3.1 위치 및 동작

- **데스크탑**: Layout 오른쪽 고정 사이드 패널 (width ~320px), 접기/펼치기 토글
- **모바일**: 숨김 상태, 하단 아이콘 탭 → 풀스크린 오버레이
- **모든 페이지에서 표시** (Layout 컴포넌트에 포함)

### 3.2 구조

```
┌─ 피드 패널 ─────────────────┐
│ [새 공지 ✏️] (admin/prof만)  │
│ [전체 | 공지 | 활동] 필터탭   │
│ ─────────────────────────── │
│ 📢 [pinned] 세미나 안내      │  ← pinned 공지 상단 고정
│ 📢 [pinned] 서버 점검        │
│ ─────────────────────────── │
│ 📢 신규 공지: 회의실 변경     │  ← 시간순
│ 💬 교수→student1 댓글        │
│ ✅ KOCCA 태스크 배정됨       │
│ 📝 student2 데일리 올림      │
│ 🕐 student3 체크인           │
│ ...무한 스크롤...            │
│                             │
│              [접기 ◀]       │
└─────────────────────────────┘
```

### 3.3 피드 아이템 5종

| 타입 | 소스 테이블 | 표시 형태 | 권한 필터 |
|------|------------|----------|----------|
| announcement | Announcement | 📢 title + body 미리보기 + 읽음배지 | audience 기반 |
| comment | Comment (기존) | 💬 "작성자 → 대상 데일리에 댓글" | block visibility 기반 |
| task | TaskAssignee (기존) | ✅ "태스크명 배정됨" | 프로젝트 멤버만 |
| daily | DailyLog (기존) | 📝 "작성자가 데일리 올림" | block visibility 기반 |
| attendance | Attendance (기존) | 🕐 "사용자 체크인/아웃" | admin/professor: 전체, student: 본인만 |

### 3.4 필터 탭

- **전체**: 5종 모두
- **공지**: announcement만
- **활동**: comment + task + daily + attendance

### 3.5 "내 피드" vs "전체 피드"

쿼리 파라미터 `?my=true`로 구분:
- **전체 피드**: 내가 볼 권한 있는 모든 아이템
- **내 피드**: 나한테 온 댓글, 내 태스크 배정, 내 프로젝트 공지, 내 출결

---

## 4. 공지 CRUD

### 4.1 작성 권한

| audience | 작성 가능 역할 |
|----------|--------------|
| everyone | admin |
| professors | admin |
| students | admin, professor |
| project | 해당 프로젝트 lead/manager + admin |

### 4.2 공지 생성 플로우

1. 프론트: 피드 패널 상단 "새 공지" → 인라인 폼 (title, body, audience, project선택, pinned, expires_at)
2. `POST /api/v1/announcements` → Announcement 저장
3. 대상자 결정 (audience 기준 User 조회)
4. 대상자 전원에게 Notification 생성 (type: `announcement`)
5. PushSubscription 있는 대상자에게 Web Push 발송

### 4.3 읽음 처리

- 피드에서 공지 클릭/확장 시 → `POST /announcements/:id/read`
- 작성자/admin은 읽음 통계 조회 가능 (N명 중 M명 확인)

### 4.4 만료 처리

- `expires_at`이 지난 공지: 피드 조회 시 자동 제외 (pinned 해제 불필요)
- DB에서 삭제하지 않음 (아카이브 조회 가능)

---

## 5. API 엔드포인트

### 5.1 공지 (`/api/v1/announcements`)

| Method | Path | 설명 | 권한 |
|--------|------|------|------|
| POST | `/` | 공지 작성 | admin/professor (audience별 세분화) |
| GET | `/` | 공지 목록 (audience 자동 필터) | 로그인 유저 |
| GET | `/:id` | 공지 상세 + 읽음 통계 | 로그인 유저 |
| PATCH | `/:id` | 공지 수정 | 작성자 또는 admin |
| DELETE | `/:id` | 공지 삭제 | 작성자 또는 admin |
| POST | `/:id/read` | 읽음 처리 | 로그인 유저 |

### 5.2 피드 (`/api/v1/feed`)

| Method | Path | 설명 | 권한 |
|--------|------|------|------|
| GET | `/` | 통합 피드 (5종 merge, 시간순, cursor 기반 페이지네이션) | 로그인 유저 |

**쿼리 파라미터:**
- `my=true` — 내 관련 피드만
- `type=announcement|comment|task|daily|attendance` — 타입 필터
- `cursor` — 무한 스크롤용 커서 (ISO datetime 기반)
- `limit` — 기본 20

**Merge 전략 (5개 소스 통합):**

UNION ALL은 권한 필터링이 소스마다 다르므로 비실용적. 대신 **Python-side merge** 방식:

1. 요청된 `type` 필터에 해당하는 소스만 쿼리 (최대 5개)
2. 각 소스별로 `created_at < cursor` + `LIMIT limit+1` + 권한 필터 적용하여 독립 쿼리
3. Python에서 5개 결과를 `created_at` 기준 merge sort → 상위 `limit`개 반환
4. 각 쿼리에 `limit+1`을 걸어서 `has_more` 판단

**성능 고려:**
- 각 소스 테이블의 `created_at`에 인덱스 필수 (기존 테이블은 TimestampMixin으로 이미 있음)
- type 필터로 불필요한 쿼리 스킵 (예: `type=announcement`이면 1개만 쿼리)
- 연구실 규모 (~수십 명)에서 5개 × 20건 쿼리는 충분히 빠름

**폴링 간격:**
- 프론트에서 30초 간격 폴링 (새 아이템 유무만 확인하는 lightweight HEAD 요청)
- 탭 비활성 시 폴링 중단 (`document.visibilityState`)
- 향후 WebSocket/SSE로 교체 가능

**응답 구조:**
```json
{
  "items": [
    {
      "type": "announcement",
      "id": "uuid",
      "title": "...",
      "body": "...",
      "author": { "id": "...", "name": "..." },
      "pinned": true,
      "is_read": false,
      "created_at": "..."
    },
    {
      "type": "comment",
      "id": "uuid",
      "body": "댓글 내용...",
      "author": { "id": "...", "name": "..." },
      "target": { "type": "daily_block", "id": "...", "label": "student1 데일리" },
      "created_at": "..."
    }
  ],
  "next_cursor": "...",
  "has_more": true
}
```

### 5.3 Push 구독 (`/api/v1/push`)

| Method | Path | 설명 | 권한 |
|--------|------|------|------|
| POST | `/subscribe` | Push 구독 등록 | 로그인 유저 |
| DELETE | `/subscribe` | 구독 해제 | 로그인 유저 |

---

## 6. Web Push + VAPID

### 6.1 서버 구성

- `pywebpush` 패키지 추가
- `.env`에 `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` 추가
- `VAPID_SUBJECT=mailto:admin@glocal30hub.com`

### 6.2 발송 시점

| 이벤트 | 푸시 대상 |
|--------|----------|
| 공지 생성 | audience 대상자 전원 |
| 댓글 생성 | 블록 작성자 (본인 제외) |
| 태스크 배정 | 배정된 사용자 |

### 6.3 프론트 구성

1. `public/sw.js` — service worker, push 이벤트 수신 → `showNotification()`
2. 로그인 성공 후 → `Notification.requestPermission()` → 허용 시 `pushManager.subscribe()` → `POST /push/subscribe`
3. VAPID public key는 환경변수로 프론트에 전달

### 6.4 푸시 페이로드

```json
{
  "title": "📢 새 공지",
  "body": "내일 세미나 14시 회의실 변경",
  "url": "/",
  "type": "announcement"
}
```

service worker에서 클릭 시 `url`로 이동 + 피드 패널 포커스.

---

## 7. 알림 연동

### 7.1 기존 Notification 확장

`NotificationType` enum에 추가:
```python
announcement = "announcement"
```

### 7.2 공지 → 알림 생성 플로우

```
공지 생성 API
  → Announcement INSERT
  → 대상 User 목록 조회 (audience 기반)
  → 각 User에 Notification INSERT (type=announcement, target_type=announcement, target_id=announcement.id)
  → 각 User의 PushSubscription 조회 → webpush 발송 (비동기, 실패 시 무시)
```

### 7.3 벨 vs 피드 역할 분리

- **벨 (Notification)**: 나한테 온 개인 알림 (댓글/배정/공지 알림). 읽음 처리.
- **피드 패널**: 전체 활동 흐름. 공지는 AnnouncementRead로 별도 읽음 추적. 나머지는 읽음 추적 없음.

---

## 8. 프론트엔드 변경

### 8.1 신규 컴포넌트

| 컴포넌트 | 위치 | 설명 |
|----------|------|------|
| `FeedPanel` | `components/FeedPanel.tsx` | 피드 사이드 패널 (접기/펼치기, 필터 탭, 무한 스크롤) |
| `FeedItem` | `components/FeedItem.tsx` | 피드 아이템 렌더러 (타입별 아이콘/레이아웃) |
| `AnnouncementForm` | `components/AnnouncementForm.tsx` | 공지 작성 인라인 폼 |
| `sw.js` | `public/sw.js` | Service Worker (Push 수신) |

### 8.2 기존 컴포넌트 수정

| 컴포넌트 | 변경 |
|----------|------|
| `Layout.tsx` | FeedPanel 삽입, 메인 콘텐츠 영역 width 조정, 접기 상태 관리 |

### 8.3 API 클라이언트 추가 (`api/client.ts`)

```typescript
announcements: {
  create(data): POST /announcements
  list(params): GET /announcements
  get(id): GET /announcements/:id
  update(id, data): PATCH /announcements/:id
  delete(id): DELETE /announcements/:id
  markRead(id): POST /announcements/:id/read
}
feed: {
  list(params): GET /feed
}
push: {
  subscribe(sub): POST /push/subscribe
  unsubscribe(): DELETE /push/subscribe
}
```

---

## 9. Alembic 마이그레이션

**2개 마이그레이션으로 분리:**

1. **마이그레이션 1**: `NotificationType` enum에 `announcement` 값 추가 (`ALTER TYPE ... ADD VALUE` — 트랜잭션 밖에서 실행 필요, `op.execute()` 사용)
2. **마이그레이션 2**: 3개 테이블 생성 (`announcements`, `announcement_reads`, `push_subscriptions`)

enum 변경과 테이블 생성을 분리하는 이유: PostgreSQL에서 `ALTER TYPE ADD VALUE`는 트랜잭션 내에서 실행 불가할 수 있음.

---

## 9.1 에러 응답

기존 패턴과 동일하게 `HTTPException(status_code=..., detail="...")` 사용:

| 상황 | 코드 | detail |
|------|------|--------|
| 권한 없음 (작성/수정/삭제) | 403 | "Permission denied" |
| 공지 없음 | 404 | "Announcement not found" |
| project audience인데 project_id 누락 | 400 | "project_id required for project audience" |
| 이미 읽음 처리됨 | 200 | 멱등성 유지 — 중복 요청 시 기존 read_at 반환 (409 대신) |

---

## 10. 미래 확장 (이번 스코프 외)

- SOTA 리뷰 피드 통합 (SOTA 별도 개발 후)
- 태스크/데일리 → Google Calendar 동기화
- 피드 패널 실시간 업데이트 (WebSocket or SSE, 현재는 폴링)
- 공지 → Google Calendar 이벤트 자동 생성
