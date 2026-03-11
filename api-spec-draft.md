# 글로컬30 R&D Hub v3 — API 초안 명세

이 문서는 프론트엔드와 백엔드가 주고받을 주요 API 방향을 정리한 초안이다.
아직 최종 확정 문서는 아니지만, 구현 순서를 잡고 엔드포인트를 분해하는 데 충분한 수준으로 작성한다.

기본 규칙:
- API 스타일: REST
- Base path: `/api/v1`
- 인증: Google OAuth 로그인 후 세션 또는 토큰 기반
- 응답 형식: JSON
- 권한 오류: `403`
- 인증 오류: `401`
- 없음: `404`
- validation 오류: `422`

---

## 1. 공통 설계 원칙

### 1.1 버전 관리
- 모든 API는 `/api/v1` 하위에 둔다.
- 이후 변경 시 `/api/v2`로 분리 가능하게 한다.

### 1.2 페이지네이션
목록 API는 페이지네이션을 사용한다.
- query: `page`, `limit`
- 응답 meta: `page`, `limit`, `total`

### 1.3 검색/필터
목록 API는 query string 필터를 사용한다.
예시:
- `status=active`
- `projectId=...`
- `authorId=...`
- `dateFrom=...`
- `dateTo=...`
- `q=검색어`

### 1.4 summary vs detail
- 목록 API는 summary 중심 응답
- 상세 API는 관련 데이터 포함 가능

### 1.5 알림 채널
- v1 알림 기본 채널은 인앱
- Rocket.Chat 전달은 후속 단계에서 이벤트 핸들러로 추가 가능

---

## 2. 인증/세션
- `GET /api/v1/me`
- `POST /api/v1/auth/logout`

## 3. 사용자/프로필
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id`
- `GET /api/v1/users`
- `POST /api/v1/advisor-relations`
- `PATCH /api/v1/advisor-relations/:id`

## 4. 프로젝트
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:id`
- `PATCH /api/v1/projects/:id`
- `GET /api/v1/projects/:id/members`
- `POST /api/v1/projects/:id/members`
- `PATCH /api/v1/projects/:id/members/:memberId`
- `DELETE /api/v1/projects/:id/members/:memberId`

## 5. 태스크
- `GET /api/v1/projects/:id/tasks`
- `POST /api/v1/projects/:id/tasks`
- `GET /api/v1/tasks/:id`
- `PATCH /api/v1/tasks/:id`
- `POST /api/v1/tasks/:id/assignees`
- `DELETE /api/v1/tasks/:id/assignees/:userId`
- `PATCH /api/v1/tasks/:id/status`

## 6. 데일리
- `GET /api/v1/daily-logs`
- `POST /api/v1/daily-logs`
- `GET /api/v1/daily-logs/:id`
- `PATCH /api/v1/daily-logs/:id`
- `GET /api/v1/daily-logs/:id/blocks`
- `POST /api/v1/daily-logs/:id/blocks`
- `PATCH /api/v1/daily-blocks/:id`
- `POST /api/v1/daily-blocks/:id/tags`
- `DELETE /api/v1/daily-blocks/:id/tags/:tagId`

주의:
- 원문 재편집 API는 block 재생성 흐름을 탈 수 있다.
- 텍스트 검색은 `q` 파라미터로 받는다.

## 7. 댓글
- `GET /api/v1/daily-blocks/:id/comments`
- `POST /api/v1/daily-blocks/:id/comments`
- `PATCH /api/v1/comments/:id`
- `DELETE /api/v1/comments/:id`

## 8. 출결
- `GET /api/v1/attendance`
- `POST /api/v1/attendance/check-in`
- `POST /api/v1/attendance/check-out`
- `PATCH /api/v1/attendance/:id`

## 9. 일정/캘린더
- `GET /api/v1/events`
- `POST /api/v1/events`
- `GET /api/v1/events/:id`
- `PATCH /api/v1/events/:id`
- `DELETE /api/v1/events/:id`
- `POST /api/v1/events/:id/participants`
- `DELETE /api/v1/events/:id/participants/:userId`

## 10. 태그
- `GET /api/v1/tags`
- `POST /api/v1/tags`
- `PATCH /api/v1/tags/:id`

## 11. 첨부
- `POST /api/v1/attachments`
- `GET /api/v1/attachments`
- `DELETE /api/v1/attachments/:id`

## 12. 알림
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/:id/read`
- `PATCH /api/v1/notifications/read-all`

## 13. 리포트
- `GET /api/v1/reports`
- `GET /api/v1/reports/:id`
- `POST /api/v1/reports`

## 14. SOTA
- `GET /api/v1/sota/items`
- `POST /api/v1/sota/items`
- `GET /api/v1/sota/assignments`
- `POST /api/v1/sota/assignments`
- `PATCH /api/v1/sota/assignments/:id`
- `POST /api/v1/sota/assignments/:id/review`

## 15. 관리자
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:id/role`
- `PATCH /api/v1/admin/users/:id/status`
- `GET /api/v1/admin/projects`
- `GET /api/v1/admin/permissions`
- `GET /api/v1/admin/audit-logs`

---

## 16. 응답 구조 권장안

성공 응답:
```json
{
  "data": {},
  "meta": {}
}
```

목록 응답:
```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120
  }
}
```

에러 응답:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource."
  }
}
```
