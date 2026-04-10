# Bug Fixes & Daily Feed Conversion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub 이슈 #1~5를 모두 해결하고, 데일리 로그를 멤버/프로젝트/전체 필터링과 키워드 검색이 가능한 통합 피드 형식으로 전환한다.

**Architecture:**
- 백엔드 PostgreSQL TSVECTOR FTS와 기존 `list_daily_logs` 엔드포인트를 확장하여 키워드 검색 + 필터를 지원한다.
- 프론트엔드 `DailyFeed.tsx`에 필터 바와 무한 스크롤을 추가하여 통합 피드 UI를 제공한다.
- 가시성 권한 필터링은 기존 `_filter_blocks_by_visibility` 헬퍼를 그대로 활용한다.

**Tech Stack:** FastAPI + SQLAlchemy 2.x async + PostgreSQL 16 (TSVECTOR + GIN), React 18 + TypeScript + Vite

**Issue Coverage:**
- Chunk 1: #1 (Alembic 중복), #2 (tzdata), #3 (TS 빌드 오류)
- Chunk 2: #4 (external user 프로젝트 노출), #5 (BlockSection enum 불일치)
- Chunk 3: 백엔드 피드 검색/필터 확장
- Chunk 4: 프론트엔드 통합 피드 UI

**Out of scope:**
- #6 (하이브리드 BM25 + 벡터 검색) — 데이터가 누적된 후 별도 플랜으로 진행

---

## File Structure

### Backend
- `backend/requirements.txt` — `tzdata` 추가
- `backend/alembic/versions/a1b2c3d4e5f6_add_attachments_table.py` — no-op 처리 (이미 작업 트리에 적용됨, 커밋 필요)
- `backend/app/api/v1/projects.py` — external user 멤버십 필터링 추가
- `backend/app/api/v1/daily.py` — `list_daily_logs`에 `q` 키워드 검색 파라미터 추가
- `backend/tests/api/test_projects.py` — external user 프로젝트 격리 테스트
- `backend/tests/api/test_daily_search.py` — 키워드 검색 + 필터 테스트

### Frontend
- `frontend/src/pages/DailyWrite.tsx` — `SectionType` enum을 백엔드 값(`yesterday`/`today`/`issue`/`misc`)에 맞춤
- `frontend/src/pages/Admin.tsx` — 미사용 변수 제거 (`roleLabels`, `statusLabels`)
- `frontend/src/pages/DailyFeed.tsx` — 미사용 `commentCount`, `inputRef` 제거 + 필터 바/검색/무한스크롤 추가
- `frontend/src/pages/MemberDetail.tsx` — `userInfo?.` optional chaining 적용
- `frontend/src/api/client.ts` — `dailyApi.list({ q, author_id, project_id, ... })` 시그니처 확장
- `frontend/src/components/FeedFilterBar.tsx` — 새 컴포넌트 (멤버/프로젝트/검색 필터 UI)

---

## Chunk 1: 환경/빌드 버그 수정 (#1, #2, #3)

### Task 1.1: tzdata 의존성 추가 (Issue #2)

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: requirements.txt에 tzdata 추가**

`backend/requirements.txt` 마지막 줄에 추가:
```
tzdata>=2024.1
```

- [ ] **Step 2: 설치 확인**

```bash
cd backend
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
python -c "from zoneinfo import ZoneInfo; print(ZoneInfo('Asia/Seoul'))"
```
Expected: `Asia/Seoul` (no `ZoneInfoNotFoundError`)

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "fix: add tzdata for Windows timezone support (#2)"
```

---

### Task 1.2: Alembic 중복 마이그레이션 no-op 커밋 (Issue #1)

**Files:**
- Modify: `backend/alembic/versions/a1b2c3d4e5f6_add_attachments_table.py` (이미 작업 트리에 수정됨)

- [ ] **Step 1: 변경 확인**

```bash
git diff backend/alembic/versions/a1b2c3d4e5f6_add_attachments_table.py
```
Expected: `upgrade()`와 `downgrade()`가 모두 `pass`로 되어 있음

- [ ] **Step 2: 빈 DB에서 마이그레이션 검증**

```bash
cd backend
alembic downgrade base
alembic upgrade head
```
Expected: 에러 없이 모든 리비전 적용 완료

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/a1b2c3d4e5f6_add_attachments_table.py
git commit -m "fix: make duplicate attachments migration a no-op (#1)"
```

---

### Task 1.3: TypeScript 미사용 변수 제거 (Issue #3 - part 1)

**Files:**
- Modify: `frontend/src/pages/Admin.tsx:62-69`
- Modify: `frontend/src/pages/DailyFeed.tsx:608-611`
- Modify: `frontend/src/pages/DailyWrite.tsx:437`

- [ ] **Step 1: Admin.tsx에서 `roleLabels`, `statusLabels` 제거**

`frontend/src/pages/Admin.tsx`의 62~69행에 있는 `const roleLabels = ...`, `const statusLabels = ...` 선언을 삭제. 다른 곳에서 사용되지 않는지 grep 확인:
```bash
cd frontend
grep -rn "roleLabels\|statusLabels" src/
```
Expected: Admin.tsx 외 다른 매치 없음

- [ ] **Step 2: DailyFeed.tsx에서 `commentCount`, `inputRef` 제거**

`frontend/src/pages/DailyFeed.tsx`의 608행 `commentCount`, 611행 `inputRef` 선언을 삭제하거나 사용하는 코드를 추가. 사용 여부 확인:
```bash
grep -n "commentCount\|inputRef" frontend/src/pages/DailyFeed.tsx
```

- [ ] **Step 3: DailyWrite.tsx에서 `taskIds` 제거**

437행 `const taskIds = ...` 선언 확인 후 삭제. (이 작업은 Task 2.2의 enum 수정과 함께 진행해도 무관)

- [ ] **Step 4: TypeScript 컴파일 검증**

```bash
cd frontend
npx tsc -b
```
Expected: TS6133 에러 5건 모두 해결됨 (MemberDetail의 TS18047은 Task 1.4에서 처리)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Admin.tsx frontend/src/pages/DailyFeed.tsx frontend/src/pages/DailyWrite.tsx
git commit -m "fix(ts): remove unused locals (Admin, DailyFeed, DailyWrite) (#3)"
```

---

### Task 1.4: MemberDetail null 체크 (Issue #3 - part 2)

**Files:**
- Modify: `frontend/src/pages/MemberDetail.tsx:633,636,641,644`

- [ ] **Step 1: optional chaining 적용**

633, 636, 641, 644행의 `userInfo.last_login_at`, `userInfo.created_at`을 `userInfo?.last_login_at`, `userInfo?.created_at`으로 변경.

- [ ] **Step 2: TypeScript 빌드 전체 검증**

```bash
cd frontend
npm run build
```
Expected: `tsc -b && vite build` 모두 성공

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MemberDetail.tsx
git commit -m "fix(ts): add optional chaining for nullable userInfo (#3)"
```

---

## Chunk 2: 데이터/권한 버그 수정 (#4, #5)

### Task 2.1: External user 프로젝트 멤버십 필터링 (Issue #4)

**Files:**
- Modify: `backend/app/api/v1/projects.py` (list 엔드포인트)
- Test: `backend/tests/api/test_projects.py`

- [ ] **Step 1: 현재 list_projects 구현 확인**

```bash
grep -n "def list_projects\|@router.get" backend/app/api/v1/projects.py
```
어떤 쿼리가 사용되는지 파악.

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/api/test_projects.py`에 추가:
```python
import pytest
from httpx import AsyncClient

async def test_external_user_only_sees_their_projects(
    async_client: AsyncClient,
    external_user_token: str,
    seed_two_projects_with_external_in_one,
):
    """External user는 본인이 멤버인 프로젝트만 봐야 한다."""
    response = await async_client.get(
        "/api/v1/projects/",
        headers={"Authorization": f"Bearer {external_user_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    project_names = [p["name"] for p in data["data"]]
    assert "KOCCA" in project_names  # 멤버임
    assert "NRF" not in project_names  # 멤버 아님
```

- [ ] **Step 3: 테스트 실행 - 실패 확인**

```bash
cd backend
pytest tests/api/test_projects.py::test_external_user_only_sees_their_projects -v
```
Expected: FAIL (현재는 NRF도 보임)

- [ ] **Step 4: list_projects에 멤버십 필터 추가**

`backend/app/api/v1/projects.py`의 `list_projects` 함수에서, `current_user.role == UserRole.external`인 경우에만 다음 필터를 적용:
```python
from app.models.project import ProjectMember
from app.models.user import UserRole

if current_user.role == UserRole.external:
    member_project_ids = select(ProjectMember.project_id).where(
        ProjectMember.user_id == current_user.id
    )
    query = query.where(Project.id.in_(member_project_ids))
```
admin/professor/student는 기존 동작 유지.

- [ ] **Step 5: 테스트 실행 - 통과 확인**

```bash
pytest tests/api/test_projects.py::test_external_user_only_sees_their_projects -v
```
Expected: PASS

- [ ] **Step 6: 회귀 테스트 - 다른 역할은 영향 없는지**

기존 admin/professor/student 테스트를 실행하여 모두 통과하는지 확인:
```bash
pytest tests/api/test_projects.py -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/projects.py backend/tests/api/test_projects.py
git commit -m "fix: filter projects by membership for external users (#4)"
```

---

### Task 2.2: BlockSection enum 동기화 (Issue #5)

**Files:**
- Modify: `frontend/src/pages/DailyWrite.tsx` (line 5의 `SectionType`, line 317/405/446/638의 default `'progress'`, `sectionOptions`)
- Modify: `frontend/src/pages/DailyWrite.tsx:684` (silent catch 개선)

**중요:** Option A를 선택 (프론트엔드가 백엔드 값에 맞춤). 이유: 기존 DB 데이터와 `DailyFeed.tsx`가 이미 백엔드 값을 사용 중이므로 마이그레이션 불필요.

- [ ] **Step 1: 백엔드 enum 재확인**

```bash
grep -A 6 "class BlockSection" backend/app/models/daily.py
```
Expected: `yesterday`, `today`, `issue`, `misc`

- [ ] **Step 2: SectionType 타입 변경**

`frontend/src/pages/DailyWrite.tsx:5`:
```typescript
// Before
type SectionType = 'progress' | 'issue' | 'plan' | 'misc'

// After
type SectionType = 'yesterday' | 'today' | 'issue' | 'misc'
```

- [ ] **Step 3: 모든 default 값을 'today'로 변경**

317, 405, 446, 638행의 `section: 'progress'`를 `section: 'today'`로 변경 (task 블록의 기본 의미는 "오늘 할 일").

- [ ] **Step 4: sectionOptions 라벨 매핑 업데이트**

`DailyWrite.tsx`의 `sectionOptions`(또는 동등한 라벨 매핑)를 다음과 같이 변경:
```typescript
const sectionOptions = [
  { value: 'yesterday', label: '어제 한 일' },
  { value: 'today', label: '오늘 할 일' },
  { value: 'issue', label: '이슈/논의' },
  { value: 'misc', label: '기타' },
]
```

- [ ] **Step 5: silent catch 개선**

684행 부근의 `catch` 블록에서 에러를 콘솔에 로깅하고 사용자에게 더 구체적인 메시지를 표시:
```typescript
} catch (err) {
  console.error('[DailyWrite] save failed:', err)
  const msg = err instanceof Error ? err.message : '알 수 없는 오류'
  setSaveStatus(`저장 실패: ${msg}`)
}
```

- [ ] **Step 6: 수동 검증 (백엔드 + 프론트엔드 실행)**

```bash
# 터미널 1
cd backend && uvicorn app.main:app --reload

# 터미널 2
cd frontend && npm run dev

# 브라우저에서 학생 계정으로 /daily/write 접속
# - 텍스트 입력 후 "최종 저장" 클릭
# - Network 탭에서 POST .../blocks 가 200 OK 인지 확인
# - DailyFeed로 이동하여 새 블록이 표시되는지 확인
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/DailyWrite.tsx
git commit -m "fix: align DailyWrite section enum with backend (#5)

- Change SectionType from progress/issue/plan/misc
  to yesterday/today/issue/misc
- Default task blocks to 'today'
- Improve error logging in save handler"
```

---

## Chunk 3: 백엔드 피드 검색/필터 확장

### Task 3.1: 키워드 검색 파라미터 추가

**Files:**
- Modify: `backend/app/api/v1/daily.py` (`list_daily_logs` 함수, line 165~224)
- Test: `backend/tests/api/test_daily_search.py` (신규)

**배경:** `daily_blocks.search_vector`(TSVECTOR + GIN)는 이미 모델에 정의되어 있으나, 검색 트리거(INSERT/UPDATE 시 자동 업데이트)가 있는지 확인 필요. 없으면 마이그레이션으로 추가.

- [ ] **Step 1: search_vector 트리거 존재 확인**

```bash
grep -rn "search_vector\|tsvector_update_trigger\|to_tsvector" backend/alembic/versions/
```
- 트리거가 없으면 새 마이그레이션 추가 (Step 2)
- 있으면 Step 3으로

- [ ] **Step 2: (필요시) 트리거 마이그레이션 추가**

```bash
cd backend
alembic revision -m "add daily_blocks search_vector trigger"
```

생성된 파일에 다음 추가 (한국어 검색을 위해 `simple` 사용):
```python
def upgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION daily_blocks_search_vector_update()
        RETURNS trigger AS $$
        BEGIN
            NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content, ''));
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS daily_blocks_search_vector_trigger ON daily_blocks;
        CREATE TRIGGER daily_blocks_search_vector_trigger
            BEFORE INSERT OR UPDATE OF content ON daily_blocks
            FOR EACH ROW
            EXECUTE FUNCTION daily_blocks_search_vector_update();

        -- Backfill existing rows
        UPDATE daily_blocks SET search_vector = to_tsvector('simple', COALESCE(content, ''));
    """)

def downgrade():
    op.execute("""
        DROP TRIGGER IF EXISTS daily_blocks_search_vector_trigger ON daily_blocks;
        DROP FUNCTION IF EXISTS daily_blocks_search_vector_update();
    """)
```

마이그레이션 적용:
```bash
alembic upgrade head
```

- [ ] **Step 3: 실패하는 검색 테스트 작성**

`backend/tests/api/test_daily_search.py` 신규:
```python
import pytest

async def test_keyword_search_finds_block(
    async_client, student_token, seed_block_with_content
):
    """q 파라미터로 블록 내용을 검색할 수 있다."""
    # seed_block_with_content fixture가 content="모션캡처 데이터 정리"인 블록 생성
    response = await async_client.get(
        "/api/v1/daily-logs/?q=모션캡처",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["meta"]["total"] >= 1
    assert any(
        "모션캡처" in block["content"]
        for log in data["data"]
        for block in log["blocks"]
    )

async def test_keyword_search_empty_when_no_match(
    async_client, student_token, seed_block_with_content
):
    response = await async_client.get(
        "/api/v1/daily-logs/?q=존재하지않는키워드xyz",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200
    assert response.json()["meta"]["total"] == 0
```

- [ ] **Step 4: 테스트 실행 - 실패 확인**

```bash
pytest tests/api/test_daily_search.py -v
```
Expected: FAIL (q 파라미터가 아직 없음)

- [ ] **Step 5: list_daily_logs에 q 파라미터 추가**

`backend/app/api/v1/daily.py`의 `list_daily_logs` 시그니처에 추가:
```python
q: str | None = Query(None, description="Keyword search across block content"),
```

쿼리 빌더에 추가 (project_id 필터 다음):
```python
if q:
    # Search across daily_blocks.search_vector via tsquery
    # Use plainto_tsquery for safe escaping
    query = query.where(
        DailyLog.id.in_(
            select(DailyBlock.daily_log_id).where(
                DailyBlock.search_vector.op("@@")(
                    func.plainto_tsquery("simple", q)
                )
            )
        )
    )
```

- [ ] **Step 6: 테스트 실행 - 통과 확인**

```bash
pytest tests/api/test_daily_search.py -v
```
Expected: PASS

- [ ] **Step 7: 회귀 테스트**

```bash
pytest tests/api/test_daily.py -v  # 기존 daily 테스트
```
Expected: 모든 기존 테스트 통과

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/daily.py backend/tests/api/test_daily_search.py backend/alembic/versions/
git commit -m "feat(daily): add keyword search via search_vector"
```

---

### Task 3.2: 멤버/프로젝트 필터 회귀 검증

**Files:**
- Test: `backend/tests/api/test_daily_search.py` (확장)

기존 `author_id`, `project_id` 파라미터는 이미 존재하므로 새 코드는 불필요하지만, 회귀 방지 테스트를 추가.

- [ ] **Step 1: author_id 필터 테스트 추가**

```python
async def test_filter_by_author(
    async_client, professor_token, seed_two_students_with_logs
):
    student_a_id = ...  # fixture에서 가져옴
    response = await async_client.get(
        f"/api/v1/daily-logs/?author_id={student_a_id}",
        headers={"Authorization": f"Bearer {professor_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    for log in data["data"]:
        assert log["author_id"] == str(student_a_id)
```

- [ ] **Step 2: project_id 필터 테스트 추가**

```python
async def test_filter_by_project(
    async_client, student_token, seed_block_in_project
):
    project_id = ...
    response = await async_client.get(
        f"/api/v1/daily-logs/?project_id={project_id}",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["meta"]["total"] >= 1
```

- [ ] **Step 3: 복합 필터 (q + author_id) 테스트**

```python
async def test_combined_filters(
    async_client, professor_token, seed_complex_logs
):
    response = await async_client.get(
        "/api/v1/daily-logs/?q=렌더링&author_id=...&page=1&limit=10",
        headers={"Authorization": f"Bearer {professor_token}"},
    )
    assert response.status_code == 200
```

- [ ] **Step 4: 테스트 실행**

```bash
pytest tests/api/test_daily_search.py -v
```
Expected: 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/api/test_daily_search.py
git commit -m "test(daily): add regression tests for member/project filters"
```

---

## Chunk 4: 프론트엔드 통합 피드 UI

### Task 4.1: API 클라이언트 시그니처 확장

**Files:**
- Modify: `frontend/src/api/client.ts` (`dailyApi.list` 또는 동등 함수)

- [ ] **Step 1: 현재 dailyApi.list 시그니처 확인**

```bash
grep -A 10 "dailyApi\|daily-logs" frontend/src/api/client.ts
```

- [ ] **Step 2: list 함수에 q, author_id, project_id, page, limit 옵션 추가**

```typescript
export const dailyApi = {
  list: async (params: {
    q?: string
    author_id?: string
    project_id?: string
    date_from?: string
    date_to?: string
    page?: number
    limit?: number
  } = {}) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return api.get(`/daily-logs/${qs ? '?' + qs : ''}`)
  },
  // ... 기존 함수들
}
```

- [ ] **Step 3: 타입 체크**

```bash
cd frontend
npx tsc -b
```
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(api): extend dailyApi.list with search/filter params"
```

---

### Task 4.2: FeedFilterBar 컴포넌트 작성

**Files:**
- Create: `frontend/src/components/FeedFilterBar.tsx`

- [ ] **Step 1: 컴포넌트 골격 작성**

```typescript
import { useEffect, useState } from 'react'
import { membersApi, projectsApi } from '../api/client'

export interface FeedFilters {
  scope: 'all' | 'member' | 'project'
  authorId?: string
  projectId?: string
  q: string
}

interface Props {
  value: FeedFilters
  onChange: (next: FeedFilters) => void
}

export default function FeedFilterBar({ value, onChange }: Props) {
  const [members, setMembers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [qDraft, setQDraft] = useState(value.q)

  useEffect(() => {
    membersApi.list().then((r) => setMembers(r.data ?? r))
    projectsApi.list().then((r) => setProjects(r.data ?? r))
  }, [])

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      if (qDraft !== value.q) onChange({ ...value, q: qDraft })
    }, 300)
    return () => clearTimeout(t)
  }, [qDraft])

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      padding: 12,
      background: '#f8fafc',
      borderRadius: 12,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}>
      {/* Scope toggle */}
      <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        {(['all', 'member', 'project'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onChange({ ...value, scope: s, authorId: undefined, projectId: undefined })}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              border: 'none',
              cursor: 'pointer',
              background: value.scope === s ? '#4f46e5' : 'transparent',
              color: value.scope === s ? '#fff' : '#64748b',
            }}
          >
            {s === 'all' ? '전체' : s === 'member' ? '멤버별' : '프로젝트별'}
          </button>
        ))}
      </div>

      {/* Member dropdown */}
      {value.scope === 'member' && (
        <select
          value={value.authorId ?? ''}
          onChange={(e) => onChange({ ...value, authorId: e.target.value || undefined })}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}
        >
          <option value="">멤버 선택...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}

      {/* Project dropdown */}
      {value.scope === 'project' && (
        <select
          value={value.projectId ?? ''}
          onChange={(e) => onChange({ ...value, projectId: e.target.value || undefined })}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}
        >
          <option value="">프로젝트 선택...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {/* Search input */}
      <input
        type="search"
        placeholder="🔍 키워드 검색..."
        value={qDraft}
        onChange={(e) => setQDraft(e.target.value)}
        style={{
          flex: 1,
          minWidth: 200,
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          fontSize: 13,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd frontend
npx tsc -b
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FeedFilterBar.tsx
git commit -m "feat(feed): add FeedFilterBar component"
```

---

### Task 4.3: DailyFeed에 필터 통합 + URL 동기화

**Files:**
- Modify: `frontend/src/pages/DailyFeed.tsx`

- [ ] **Step 1: react-router의 useSearchParams import**

`DailyFeed.tsx` 상단에 추가:
```typescript
import { useSearchParams } from 'react-router-dom'
import FeedFilterBar, { FeedFilters } from '../components/FeedFilterBar'
```

- [ ] **Step 2: URL ↔ filters 양방향 동기화 훅 추가**

```typescript
const [searchParams, setSearchParams] = useSearchParams()

const filters: FeedFilters = {
  scope: (searchParams.get('scope') as FeedFilters['scope']) ?? 'all',
  authorId: searchParams.get('author_id') ?? undefined,
  projectId: searchParams.get('project_id') ?? undefined,
  q: searchParams.get('q') ?? '',
}

const updateFilters = (next: FeedFilters) => {
  const params = new URLSearchParams()
  if (next.scope !== 'all') params.set('scope', next.scope)
  if (next.authorId) params.set('author_id', next.authorId)
  if (next.projectId) params.set('project_id', next.projectId)
  if (next.q) params.set('q', next.q)
  setSearchParams(params, { replace: true })
}
```

- [ ] **Step 3: 데이터 fetch에 filters 반영**

기존 `dailyApi.list(...)` 호출을 다음과 같이 변경:
```typescript
const fetchFeed = useCallback(async (page: number) => {
  const res = await dailyApi.list({
    q: filters.q || undefined,
    author_id: filters.authorId,
    project_id: filters.projectId,
    page,
    limit: 20,
  })
  return res
}, [filters.q, filters.authorId, filters.projectId])
```

- [ ] **Step 4: 필터 변경 시 page=1로 리셋**

```typescript
useEffect(() => {
  setPage(1)
  setLogs([])  // 기존 결과 비우기
  fetchFeed(1).then((res) => setLogs(res.data))
}, [filters.q, filters.authorId, filters.projectId])
```

- [ ] **Step 5: FeedFilterBar 렌더링**

화면 상단(미니캘린더 위 또는 아래)에 추가:
```tsx
<FeedFilterBar value={filters} onChange={updateFilters} />
```

- [ ] **Step 6: 무한 스크롤 (선택)**

만약 시간이 부족하면 페이지네이션 버튼만 추가. 충분하면 IntersectionObserver로 무한 스크롤:
```typescript
const sentinelRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!sentinelRef.current) return
  const obs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loading && hasMore) {
      setPage((p) => p + 1)
    }
  })
  obs.observe(sentinelRef.current)
  return () => obs.disconnect()
}, [loading, hasMore])

// JSX 하단:
<div ref={sentinelRef} style={{ height: 20 }} />
```

- [ ] **Step 7: 수동 검증**

```bash
cd backend && uvicorn app.main:app --reload  # 터미널 1
cd frontend && npm run dev                     # 터미널 2
```
브라우저에서 `/daily/feed`로 이동하여:
- 전체/멤버별/프로젝트별 토글 작동 확인
- 멤버 선택 드롭다운에서 특정 학생 선택 → 그 학생 글만 표시
- 검색창에 키워드 입력 → 디바운스 후 결과 필터링
- URL이 `?scope=member&author_id=...&q=...`로 업데이트되는지 확인
- 새로고침해도 동일 필터가 유지되는지 확인

- [ ] **Step 8: TypeScript + 빌드 확인**

```bash
cd frontend
npm run build
```
Expected: 성공

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/DailyFeed.tsx
git commit -m "feat(feed): unified feed with member/project/keyword filters

- Add FeedFilterBar with scope toggle (all/member/project)
- Sync filters to URL query params (shareable links)
- Wire up backend ?q=, ?author_id=, ?project_id= params
- Reset pagination on filter change"
```

---

## Verification Checklist (전체 완료 후)

- [ ] `git status` — 작업 트리 깨끗함 (또는 의도된 변경만)
- [ ] `cd backend && pytest` — 모든 백엔드 테스트 통과
- [ ] `cd frontend && npm run build` — TypeScript + Vite 빌드 성공
- [ ] 백엔드/프론트엔드 동시 실행 후 수동 시나리오:
  1. 학생 로그인 → DailyWrite에서 블록 저장 → 200 OK
  2. DailyFeed에서 새 블록 표시 확인
  3. "전체" 모드에서 본인+다른 멤버 글 표시
  4. "멤버별" 모드에서 특정 학생 선택 → 해당 글만 표시
  5. "프로젝트별" 모드에서 KOCCA 선택 → KOCCA 관련 블록만 표시
  6. 검색창에 키워드 입력 → 매칭되는 블록만 표시
  7. external 계정 로그인 → /projects에서 본인 멤버 프로젝트만 보임
- [ ] 6개 이슈 모두 GitHub에서 close
  ```bash
  gh issue close 1 2 3 4 5 --repo jsdavid88-dsu/glocal30Hub --comment "Fixed in <commit>"
  ```

---

## Notes for Implementer

- **테스트 fixture가 없으면 만들어야 함:** `backend/tests/conftest.py`에 `student_token`, `professor_token`, `external_user_token`, `seed_*` fixture가 있는지 확인. 없으면 기존 패턴(`backend/seed.py`)을 참고하여 추가.
- **한국어 FTS 한계:** PostgreSQL의 `simple` config는 단순 토큰화만 함. 형태소 분석이 필요하면 `pg_trgm` 익스텐션 추가 또는 향후 #6 (벡터 검색)으로 해결.
- **DailyWrite enum 변경 시 데이터 마이그레이션 불필요:** 기존 DB의 `daily_blocks.section`은 이미 백엔드 enum 값(`yesterday`/`today`/`issue`/`misc`)만 사용 중. 잘못된 값은 애초에 422로 거부되어 저장되지 않았기 때문.
- **Issue #6은 이 플랜에 포함하지 않음.** 데이터 누적 후 별도 진행.
- **commit 메시지 컨벤션:** 기존 레포의 git log를 보면 `feat:`, `fix:`, `docs:` 사용. 일관성 유지.
