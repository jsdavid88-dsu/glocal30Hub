# Google Calendar 양방향 동기화 구현 플랜

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hub 이벤트/태스크 마감일/마일스톤을 각 사용자의 Google Calendar에 양방향 동기화

**Architecture:** OAuth 로그인 시 calendar scope 추가 + refresh_token 저장 → Hub에서 이벤트 생성/수정/삭제 시 Google Calendar API로 push → 프론트엔드에서 Google Calendar 연결 상태 표시 및 수동 동기화 트리거

**Tech Stack:** google-api-python-client, google-auth, authlib (기존), FastAPI, SQLAlchemy async

---

## File Structure

### 신규 파일
| 파일 | 역할 |
|------|------|
| `backend/app/services/google_calendar.py` | Google Calendar API 래퍼 (생성/수정/삭제/목록) |
| `backend/app/api/v1/gcal.py` | Google Calendar 연동 API 엔드포인트 |
| `backend/alembic/versions/g1h2i3j4k5l6_add_gcal_sync.py` | DB 마이그레이션 |

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `backend/requirements.txt` | google-api-python-client, google-auth 추가 |
| `backend/app/models/user.py` | google_refresh_token, google_calendar_connected 필드 추가 |
| `backend/app/models/event.py` | google_event_id 필드 추가 |
| `backend/app/api/v1/auth.py` | OAuth scope에 calendar 추가, refresh_token 저장 |
| `backend/app/api/v1/events.py` | 이벤트 CUD 시 Google Calendar 자동 동기화 호출 |
| `backend/app/api/v1/router.py` | gcal 라우터 등록 |
| `backend/app/config.py` | GOOGLE_CALENDAR_ENABLED 설정 추가 |
| `frontend/src/api/client.ts` | gcal API 메서드 추가 |
| `frontend/src/pages/Calendar.tsx` | Google Calendar 연결 버튼 + 동기화 UI |
| `frontend/src/contexts/AuthContext.tsx` | UserInfo에 google_calendar_connected 추가 |
| `frontend/src/pages/Profile.tsx` | Google Calendar 연결/해제 버튼 |

---

## Chunk 1: 백엔드 기반 (DB + 의존성 + 서비스)

### Task 1: 의존성 추가

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: requirements.txt에 Google Calendar 패키지 추가**

```
google-api-python-client==2.114.0
google-auth==2.27.0
google-auth-httplib2==0.2.0
```

- [ ] **Step 2: 패키지 설치**

Run: `cd Z:/Antigravity_prj/glocal30Hub/backend && pip install google-api-python-client google-auth google-auth-httplib2`

- [ ] **Step 3: 커밋**

```bash
git add backend/requirements.txt
git commit -m "feat: add Google Calendar API dependencies"
```

---

### Task 2: DB 마이그레이션 — User + Event 필드 추가

**Files:**
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/event.py`
- Create: `backend/alembic/versions/g1h2i3j4k5l6_add_gcal_sync.py`

- [ ] **Step 1: User 모델에 google_refresh_token 추가**

`backend/app/models/user.py`의 User 클래스에 추가:
```python
google_refresh_token = Column(String, nullable=True)  # 암호화 저장 권장
google_calendar_connected = Column(Boolean, default=False, server_default="false")
```

- [ ] **Step 2: Event 모델에 google_event_id 추가**

`backend/app/models/event.py`의 Event 클래스에 추가:
```python
google_event_id = Column(String(255), nullable=True, unique=True, index=True)
```

- [ ] **Step 3: Alembic 마이그레이션 생성**

Run: `cd Z:/Antigravity_prj/glocal30Hub/backend && alembic revision --autogenerate -m "add_gcal_sync_fields"`

- [ ] **Step 4: 마이그레이션 적용**

Run: `cd Z:/Antigravity_prj/glocal30Hub/backend && alembic upgrade head`

- [ ] **Step 5: 커밋**

```bash
git add backend/app/models/user.py backend/app/models/event.py backend/alembic/versions/
git commit -m "feat: add Google Calendar sync fields to User and Event models"
```

---

### Task 3: 설정 추가

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: config.py에 Calendar 설정 추가**

```python
# Google Calendar
GOOGLE_CALENDAR_ENABLED: bool = True
```

- [ ] **Step 2: 커밋**

```bash
git add backend/app/config.py
git commit -m "feat: add GOOGLE_CALENDAR_ENABLED config"
```

---

### Task 4: Google Calendar 서비스 모듈

**Files:**
- Create: `backend/app/services/google_calendar.py`

- [ ] **Step 1: Google Calendar API 래퍼 작성**

```python
"""Google Calendar API 서비스 모듈.

사용자의 refresh_token으로 Google Calendar에 이벤트를 생성/수정/삭제한다.
Hub 이벤트 ↔ Google Calendar 이벤트 양방향 변환을 담당한다.
"""
from datetime import datetime
from typing import Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def _get_calendar_service(refresh_token: str):
    """refresh_token으로 Google Calendar API 서비스 객체 생성."""
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
    )
    return build("calendar", "v3", credentials=creds)


def hub_event_to_gcal(event) -> dict[str, Any]:
    """Hub Event 모델 → Google Calendar 이벤트 dict 변환."""
    gcal_event: dict[str, Any] = {
        "summary": event.title,
        "description": event.description or "",
    }

    if event.all_day:
        gcal_event["start"] = {"date": event.start_at.strftime("%Y-%m-%d")}
        gcal_event["end"] = {"date": event.end_at.strftime("%Y-%m-%d")}
    else:
        gcal_event["start"] = {
            "dateTime": event.start_at.isoformat(),
            "timeZone": "Asia/Seoul",
        }
        gcal_event["end"] = {
            "dateTime": event.end_at.isoformat(),
            "timeZone": "Asia/Seoul",
        }

    # Hub 메타데이터를 extendedProperties에 저장
    gcal_event["extendedProperties"] = {
        "private": {
            "hub_event_id": str(event.id),
            "hub_event_type": event.event_type.value if event.event_type else "",
        }
    }

    return gcal_event


def gcal_to_hub_dict(gcal_event: dict) -> dict[str, Any]:
    """Google Calendar 이벤트 dict → Hub 이벤트 생성용 dict 변환."""
    start = gcal_event.get("start", {})
    end = gcal_event.get("end", {})

    all_day = "date" in start
    if all_day:
        start_at = datetime.strptime(start["date"], "%Y-%m-%d")
        end_at = datetime.strptime(end["date"], "%Y-%m-%d")
    else:
        start_at = datetime.fromisoformat(start.get("dateTime", ""))
        end_at = datetime.fromisoformat(end.get("dateTime", ""))

    return {
        "title": gcal_event.get("summary", "(제목 없음)"),
        "description": gcal_event.get("description", ""),
        "start_at": start_at,
        "end_at": end_at,
        "all_day": all_day,
        "google_event_id": gcal_event["id"],
        "source": "google_calendar",
    }


async def create_gcal_event(refresh_token: str, event) -> str | None:
    """Hub 이벤트를 Google Calendar에 생성. google_event_id 반환."""
    try:
        service = _get_calendar_service(refresh_token)
        gcal_event = hub_event_to_gcal(event)
        result = service.events().insert(
            calendarId="primary", body=gcal_event
        ).execute()
        return result.get("id")
    except HttpError:
        return None


async def update_gcal_event(
    refresh_token: str, google_event_id: str, event
) -> bool:
    """Google Calendar 이벤트 수정."""
    try:
        service = _get_calendar_service(refresh_token)
        gcal_event = hub_event_to_gcal(event)
        service.events().update(
            calendarId="primary", eventId=google_event_id, body=gcal_event
        ).execute()
        return True
    except HttpError:
        return False


async def delete_gcal_event(refresh_token: str, google_event_id: str) -> bool:
    """Google Calendar 이벤트 삭제."""
    try:
        service = _get_calendar_service(refresh_token)
        service.events().delete(
            calendarId="primary", eventId=google_event_id
        ).execute()
        return True
    except HttpError:
        return False


async def list_gcal_events(
    refresh_token: str,
    time_min: datetime | None = None,
    time_max: datetime | None = None,
    max_results: int = 100,
) -> list[dict]:
    """Google Calendar에서 이벤트 목록 가져오기."""
    try:
        service = _get_calendar_service(refresh_token)
        params: dict[str, Any] = {
            "calendarId": "primary",
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if time_min:
            params["timeMin"] = time_min.isoformat() + "Z"
        if time_max:
            params["timeMax"] = time_max.isoformat() + "Z"

        result = service.events().list(**params).execute()
        return result.get("items", [])
    except HttpError:
        return []


async def push_event_to_attendees(
    event, attendee_users: list, db
) -> None:
    """이벤트를 여러 사용자의 Google Calendar에 동기화.

    각 사용자의 refresh_token이 있으면 해당 캘린더에 이벤트를 생성한다.
    """
    for user in attendee_users:
        if not user.google_refresh_token or not user.google_calendar_connected:
            continue
        google_event_id = await create_gcal_event(user.google_refresh_token, event)
        # 각 사용자별 sync 기록은 별도 처리 가능
```

- [ ] **Step 2: 커밋**

```bash
git add backend/app/services/google_calendar.py
git commit -m "feat: add Google Calendar API service module"
```

---

## Chunk 2: 인증 흐름 수정 + API 엔드포인트

### Task 5: OAuth scope 확장 + refresh_token 저장

**Files:**
- Modify: `backend/app/api/v1/auth.py`

- [ ] **Step 1: OAuth scope에 calendar 추가**

`auth.py`의 oauth.register 부분:
```python
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile https://www.googleapis.com/auth/calendar",
    },
)
```

- [ ] **Step 2: login 엔드포인트에 access_type=offline 추가**

```python
@router.get("/login")
async def login(request: Request):
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        access_type="offline",
        prompt="consent",
    )
```

- [ ] **Step 3: callback에서 refresh_token 저장**

callback 함수에서 user upsert 후, token에서 refresh_token 추출하여 저장:
```python
# 기존 user upsert 로직 뒤에 추가
refresh_token = token.get("refresh_token")
if refresh_token:
    user.google_refresh_token = refresh_token
    user.google_calendar_connected = True
```

- [ ] **Step 4: UserResponse 스키마에 google_calendar_connected 추가**

`backend/app/schemas/user.py`에서 UserResponse에 필드 추가:
```python
google_calendar_connected: bool = False
```

- [ ] **Step 5: 커밋**

```bash
git add backend/app/api/v1/auth.py backend/app/schemas/user.py
git commit -m "feat: extend OAuth scope for Google Calendar + store refresh_token"
```

---

### Task 6: Google Calendar API 엔드포인트

**Files:**
- Create: `backend/app/api/v1/gcal.py`
- Modify: `backend/app/api/v1/router.py`

- [ ] **Step 1: gcal.py 엔드포인트 작성**

```python
"""Google Calendar 동기화 API 엔드포인트."""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.event import Event, EventSource
from app.models.user import User
from app.services.google_calendar import (
    list_gcal_events,
    gcal_to_hub_dict,
    create_gcal_event,
    delete_gcal_event,
)

router = APIRouter(prefix="/gcal", tags=["Google Calendar"])


@router.get("/status")
async def gcal_status(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """현재 사용자의 Google Calendar 연결 상태."""
    return {
        "connected": current_user.google_calendar_connected,
        "has_refresh_token": current_user.google_refresh_token is not None,
    }


@router.post("/disconnect")
async def gcal_disconnect(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Google Calendar 연결 해제."""
    current_user.google_refresh_token = None
    current_user.google_calendar_connected = False
    await db.commit()
    return {"message": "Google Calendar 연결이 해제되었습니다."}


@router.post("/sync-push")
async def gcal_sync_push(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Hub 이벤트 → Google Calendar 일괄 푸시.

    google_event_id가 없는 Hub 이벤트를 Google Calendar에 생성한다.
    """
    if not current_user.google_refresh_token:
        raise HTTPException(400, "Google Calendar가 연결되지 않았습니다.")

    # 현재 사용자가 생성한 이벤트 중 Google에 아직 동기화 안 된 것
    result = await db.execute(
        select(Event).where(
            Event.creator_id == current_user.id,
            Event.google_event_id.is_(None),
            Event.source != EventSource.google_calendar,
        )
    )
    events = result.scalars().all()

    synced = 0
    for event in events:
        google_event_id = await create_gcal_event(
            current_user.google_refresh_token, event
        )
        if google_event_id:
            event.google_event_id = google_event_id
            synced += 1

    await db.commit()
    return {"synced": synced, "total": len(events)}


@router.post("/sync-pull")
async def gcal_sync_pull(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    days: int = 30,
):
    """Google Calendar → Hub 이벤트 가져오기.

    Google Calendar의 이벤트를 Hub에 동기화한다.
    이미 동기화된 이벤트(google_event_id 매칭)는 건너뛴다.
    """
    if not current_user.google_refresh_token:
        raise HTTPException(400, "Google Calendar가 연결되지 않았습니다.")

    now = datetime.now(timezone.utc)
    time_min = now - timedelta(days=7)
    time_max = now + timedelta(days=days)

    gcal_events = await list_gcal_events(
        current_user.google_refresh_token, time_min, time_max
    )

    imported = 0
    for gcal_ev in gcal_events:
        gcal_id = gcal_ev.get("id")
        if not gcal_id:
            continue

        # 이미 동기화된 이벤트인지 확인
        existing = await db.execute(
            select(Event).where(Event.google_event_id == gcal_id)
        )
        if existing.scalar_one_or_none():
            continue

        # Hub에서 생성된 이벤트가 Google에 있는 건 건너뛰기
        ext_props = gcal_ev.get("extendedProperties", {}).get("private", {})
        if ext_props.get("hub_event_id"):
            continue

        hub_dict = gcal_to_hub_dict(gcal_ev)
        new_event = Event(
            title=hub_dict["title"],
            description=hub_dict["description"],
            start_at=hub_dict["start_at"],
            end_at=hub_dict["end_at"],
            all_day=hub_dict["all_day"],
            google_event_id=hub_dict["google_event_id"],
            source=EventSource.google_calendar,
            creator_id=current_user.id,
        )
        db.add(new_event)
        imported += 1

    await db.commit()
    return {"imported": imported, "total_google_events": len(gcal_events)}
```

- [ ] **Step 2: router.py에 gcal 라우터 등록**

`backend/app/api/v1/router.py`에 추가:
```python
from app.api.v1 import gcal
router.include_router(gcal.router)
```

- [ ] **Step 3: 커밋**

```bash
git add backend/app/api/v1/gcal.py backend/app/api/v1/router.py
git commit -m "feat: add Google Calendar sync API endpoints (push/pull/status/disconnect)"
```

---

### Task 7: 이벤트 CUD 시 자동 Google Calendar 동기화

**Files:**
- Modify: `backend/app/api/v1/events.py`

- [ ] **Step 1: events.py에서 이벤트 생성 시 자동 push**

이벤트 생성(POST /) 엔드포인트에서 `db.commit()` 후:
```python
# Google Calendar 자동 동기화
if (
    settings.GOOGLE_CALENDAR_ENABLED
    and current_user.google_refresh_token
    and current_user.google_calendar_connected
):
    from app.services.google_calendar import create_gcal_event
    google_event_id = await create_gcal_event(
        current_user.google_refresh_token, event
    )
    if google_event_id:
        event.google_event_id = google_event_id
        await db.commit()
```

- [ ] **Step 2: 이벤트 수정 시 Google Calendar도 업데이트**

이벤트 수정(PATCH /{event_id}) 엔드포인트에서 `db.commit()` 후:
```python
if (
    settings.GOOGLE_CALENDAR_ENABLED
    and event.google_event_id
    and current_user.google_refresh_token
):
    from app.services.google_calendar import update_gcal_event
    await update_gcal_event(
        current_user.google_refresh_token, event.google_event_id, event
    )
```

- [ ] **Step 3: 이벤트 삭제 시 Google Calendar에서도 삭제**

이벤트 삭제(DELETE /{event_id}) 엔드포인트에서 `db.delete()` 전:
```python
if (
    settings.GOOGLE_CALENDAR_ENABLED
    and event.google_event_id
    and current_user.google_refresh_token
):
    from app.services.google_calendar import delete_gcal_event
    await delete_gcal_event(
        current_user.google_refresh_token, event.google_event_id
    )
```

- [ ] **Step 4: 커밋**

```bash
git add backend/app/api/v1/events.py
git commit -m "feat: auto-sync event CUD to Google Calendar"
```

---

## Chunk 3: 프론트엔드 연동

### Task 8: API 클라이언트에 gcal 메서드 추가

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: client.ts에 gcal 섹션 추가**

```typescript
// Google Calendar
gcal: {
  status: () => request('/gcal/status'),
  disconnect: () => request('/gcal/disconnect', { method: 'POST' }),
  syncPush: () => request('/gcal/sync-push', { method: 'POST' }),
  syncPull: (days?: number) =>
    request(`/gcal/sync-pull${days ? `?days=${days}` : ''}`, { method: 'POST' }),
},
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add Google Calendar API client methods"
```

---

### Task 9: AuthContext에 google_calendar_connected 추가

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx`

- [ ] **Step 1: UserInfo 인터페이스에 필드 추가**

```typescript
interface UserInfo {
  id: string
  email: string
  name: string
  role: 'professor' | 'student' | 'external' | 'admin'
  profile_image_url?: string | null
  google_calendar_connected?: boolean  // 추가
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/contexts/AuthContext.tsx
git commit -m "feat: add google_calendar_connected to UserInfo"
```

---

### Task 10: Calendar 페이지에 Google Calendar 연결 UI

**Files:**
- Modify: `frontend/src/pages/Calendar.tsx`

- [ ] **Step 1: Google Calendar 연결 상태 + 동기화 버튼 추가**

Calendar.tsx 상단에 상태 추가:
```typescript
const [gcalConnected, setGcalConnected] = useState(false)
const [syncing, setSyncing] = useState(false)
```

useEffect에서 gcal 상태 확인:
```typescript
useEffect(() => {
  api.gcal.status().then((res: any) => setGcalConnected(res.connected)).catch(() => {})
}, [])
```

동기화 핸들러:
```typescript
const handleSync = async () => {
  setSyncing(true)
  try {
    const pushResult = await api.gcal.syncPush() as any
    const pullResult = await api.gcal.syncPull() as any
    alert(`동기화 완료: Hub→Google ${pushResult.synced}건, Google→Hub ${pullResult.imported}건`)
    loadEvents()  // 이벤트 목록 새로고침
  } catch { alert('동기화 실패') }
  finally { setSyncing(false) }
}
```

헤더 영역에 버튼 추가:
```tsx
{gcalConnected ? (
  <button onClick={handleSync} disabled={syncing}
    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13,
      background: '#e0e7ff', color: '#4338ca', border: 'none', cursor: 'pointer' }}>
    {syncing ? '동기화 중...' : '📅 Google Calendar 동기화'}
  </button>
) : (
  <a href="/api/v1/auth/login"
    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13,
      background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0',
      textDecoration: 'none', cursor: 'pointer' }}>
    Google Calendar 연결
  </a>
)}
```

- [ ] **Step 2: Google Calendar에서 가져온 이벤트에 뱃지 표시**

이벤트 렌더링에서 source가 google_calendar인 경우:
```tsx
{event.source === 'google_calendar' && (
  <span style={{ fontSize: 9, color: '#94a3b8' }}>📅 Google</span>
)}
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/pages/Calendar.tsx
git commit -m "feat: add Google Calendar connect/sync UI to Calendar page"
```

---

### Task 11: Profile 페이지에 Google Calendar 연결/해제

**Files:**
- Modify: `frontend/src/pages/Profile.tsx`

- [ ] **Step 1: Profile에 Google Calendar 섹션 추가**

연동 상태 표시 + 해제 버튼:
```tsx
// 상태
const [gcalConnected, setGcalConnected] = useState(false)

// 초기 로드
useEffect(() => {
  api.gcal.status().then((r: any) => setGcalConnected(r.connected)).catch(() => {})
}, [])

// 연결 해제 핸들러
const handleDisconnectGcal = async () => {
  if (!confirm('Google Calendar 연결을 해제하시겠습니까?')) return
  await api.gcal.disconnect()
  setGcalConnected(false)
}
```

프로필 섹션에 UI 추가:
```tsx
<div style={{ ...cardStyle, padding: 24, marginTop: 16 }}>
  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>외부 서비스 연동</h3>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 22 }}>📅</span>
      <div>
        <div style={{ fontWeight: 500 }}>Google Calendar</div>
        <div style={{ fontSize: 13, color: gcalConnected ? '#047857' : '#94a3b8' }}>
          {gcalConnected ? '연결됨' : '연결 안 됨'}
        </div>
      </div>
    </div>
    {gcalConnected ? (
      <button onClick={handleDisconnectGcal}
        style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13,
          background: '#fee2e2', color: '#be123c', border: 'none', cursor: 'pointer' }}>
        연결 해제
      </button>
    ) : (
      <a href="/api/v1/auth/login"
        style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13,
          background: '#e0e7ff', color: '#4338ca', border: 'none',
          textDecoration: 'none', cursor: 'pointer' }}>
        연결하기
      </a>
    )}
  </div>
</div>
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/pages/Profile.tsx
git commit -m "feat: add Google Calendar connect/disconnect to Profile page"
```

---

## Chunk 4: 태스크 마감일 → Google Calendar 연동

### Task 12: 태스크 마감일 자동 캘린더 등록

**Files:**
- Modify: `backend/app/api/v1/tasks.py`

- [ ] **Step 1: 태스크 생성/수정 시 마감일이 있으면 Google Calendar에 등록**

태스크 생성(POST) 및 수정(PATCH) 엔드포인트에서 due_date가 있을 때:
```python
# 태스크 마감일 → 배정된 학생들의 Google Calendar에 이벤트 생성
if settings.GOOGLE_CALENDAR_ENABLED and task.due_date:
    from app.services.google_calendar import create_gcal_event
    from app.models.event import Event, EventSource, EventType

    # 태스크용 캘린더 이벤트 생성 (Hub Event로)
    task_event = await db.execute(
        select(Event).where(
            Event.task_id == task.id,
            Event.source == EventSource.task,
        )
    )
    existing_task_event = task_event.scalar_one_or_none()

    if not existing_task_event:
        task_cal_event = Event(
            title=f"[마감] {task.title}",
            event_type=EventType.deadline,
            start_at=task.due_date,
            end_at=task.due_date,
            all_day=True,
            creator_id=current_user.id,
            project_id=task.project_id,
            task_id=task.id,
            source=EventSource.task,
        )
        db.add(task_cal_event)
        await db.commit()
        await db.refresh(task_cal_event)

        # 배정된 학생들의 Google Calendar에 push
        for assignee in task.assignees:
            user = assignee.user
            if user.google_refresh_token and user.google_calendar_connected:
                gcal_id = await create_gcal_event(
                    user.google_refresh_token, task_cal_event
                )
                # 메인 이벤트의 google_event_id는 생성자 기준으로 저장
```

- [ ] **Step 2: 커밋**

```bash
git add backend/app/api/v1/tasks.py
git commit -m "feat: auto-create calendar event for task deadlines"
```

---

### Task 13: 통합 테스트

- [ ] **Step 1: 백엔드 서버 시작 후 gcal 엔드포인트 확인**

Run: `curl http://localhost:8001/api/v1/gcal/status -H "Authorization: Bearer <token>"`
Expected: `{"connected": false, "has_refresh_token": false}`

- [ ] **Step 2: 프론트엔드에서 Calendar 페이지 확인**

Playwright로 확인:
- Calendar 페이지에 "Google Calendar 연결" 링크 표시
- Profile 페이지에 "Google Calendar" 섹션 표시

- [ ] **Step 3: 최종 커밋**

```bash
git add -A
git commit -m "feat: Google Calendar bidirectional sync - complete implementation"
```
