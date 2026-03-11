# 글로컬30 R&D Hub v3 — 쉬운 설명 포함 DB 스키마 초안

이 문서는 프로그래머가 아닌 사람도 읽을 수 있도록 최대한 쉽게 쓴 데이터베이스 초안이다.

DB 스키마는 쉽게 말해:
- 어떤 정보를 저장할지
- 그 정보를 어떤 표로 나눌지
- 표와 표가 어떻게 연결되는지
정리한 구조도다.

이 문서는 구현팀이나 다른 AI가 실제 데이터베이스를 만들 때 기준으로 사용한다.

---

## 1. 전체 그림

이 시스템에서 저장해야 하는 핵심 정보는 아래와 같다.

- 사람: 교수, 학생, 외부업체, 관리자
- 관계: 누가 누구 지도교수인지
- 프로젝트: 어떤 프로젝트가 있는지
- 프로젝트 참여: 누가 어떤 프로젝트에 들어가 있는지
- 태스크: 누가 어떤 일을 맡았는지
- 데일리: 누가 오늘 무엇을 했는지
- 데일리 블록: 데일리 안에서 어떤 문단이 어느 프로젝트에 속하는지
- 댓글: 특정 블록에 대한 대화
- 출결: 출근/퇴근 기록
- 일정: 회의, 수업, 마감, 발표, 개인 일정
- 태그: 논문, 행정, 영상 같은 분류
- 알림: 댓글, 이슈, 마감, 배정 알림
- SOTA: 논문/리뷰/배정 관련 기록
- 리포트: 주간 요약이나 집계 결과

즉, 이 시스템은 단순 메모장이 아니라
`사람 + 프로젝트 + 데일리 + 일정 + 태스크`가 같이 연결되는 구조다.

---

## 2. 표(테이블)란?

데이터베이스는 보통 엑셀 같은 표 여러 개로 생각하면 된다.

예를 들어:
- 사용자 표
- 프로젝트 표
- 데일리 표
- 일정 표

그리고 각 표는 `id`라는 고유 번호를 가진다.
이 번호를 이용해서 표끼리 연결한다.

예:
- `projects.id = 3`
- `tasks.project_id = 3`

이 말은 그 태스크가 3번 프로젝트에 속한다는 뜻이다.

---

## 3. 핵심 테이블 설명

## 3.1 users
무슨 표인가:
- 시스템 사용자 정보를 저장하는 표

누가 들어가나:
- 관리자
- 교수
- 학생
- 외부업체 사용자

주요 컬럼:
- `id`: 사용자 고유번호
- `email`: 로그인 이메일
- `name`: 이름
- `role`: 역할 (`admin`, `professor`, `student`, `external`)
- `profile_image`: 프로필 이미지
- `major_field`: 주요 분야
- `company`: 외부업체 소속명
- `status`: 활성/비활성 상태
- `created_at`: 생성일시
- `last_login`: 마지막 로그인 시각

왜 필요한가:
- 모든 기능의 출발점이 사람 정보이기 때문

---

## 3.2 advisor_relations
무슨 표인가:
- 어떤 교수가 어떤 학생의 지도교수인지 저장하는 표

주요 컬럼:
- `id`
- `professor_id`: 교수 user id
- `student_id`: 학생 user id
- `created_at`

왜 필요한가:
- 교수는 자기 지도학생을 기준으로 볼 수 있어야 하기 때문

예시:
- 김교수(user 10)가 홍길동(user 25)의 지도교수다

---

## 3.3 projects
무슨 표인가:
- 프로젝트 자체 정보를 저장하는 표

주요 컬럼:
- `id`
- `name`: 프로젝트 이름
- `description`: 설명
- `status`: 상태 (`active`, `paused`, `completed`)
- `start_date`
- `end_date`
- `created_at`
- `updated_at`

왜 필요한가:
- 프로젝트별 태스크, 데일리, 일정, 리포트를 묶는 중심 축이기 때문

---

## 3.4 project_members
무슨 표인가:
- 누가 어떤 프로젝트에 참여하는지 저장하는 표

주요 컬럼:
- `id`
- `project_id`
- `user_id`
- `project_role`: 프로젝트 내 역할 (`viewer`, `member`, `manager`, `lead`)
- `joined_at`

왜 필요한가:
- 프로젝트 참여 여부에 따라 열람 권한이 달라지기 때문
- 교수와 프로젝트 리드는 다른 개념이기 때문

예시:
- 학생 A는 프로젝트 3의 member
- 외부업체 사용자 B는 프로젝트 3의 lead

---

## 3.5 tasks
무슨 표인가:
- 프로젝트 안에서 해야 할 일을 저장하는 표

주요 컬럼:
- `id`
- `project_id`
- `title`: 태스크 제목
- `description`: 상세 설명
- `status`: (`todo`, `in_progress`, `blocked`, `review`, `done`)
- `priority`: (`low`, `medium`, `high`)
- `due_date`: 마감일
- `created_by`: 누가 만들었는지
- `updated_by`: 마지막 수정자
- `created_at`
- `updated_at`

왜 필요한가:
- 프로젝트별 업무 진행 상황을 관리해야 하기 때문

---

## 3.6 task_assignees
무슨 표인가:
- 한 태스크에 누가 배정됐는지 저장하는 표

왜 별도 표가 필요한가:
- 한 태스크를 여러 명이 같이 맡을 수 있기 때문

주요 컬럼:
- `id`
- `task_id`
- `user_id`
- `assigned_by`: 누가 배정했는지
- `is_primary`: 대표 담당자인지
- `assigned_at`

예시:
- 태스크 12에 학생 A, 학생 B 둘 다 배정됨

---

## 3.7 daily_logs
무슨 표인가:
- 하루 단위 데일리 문서 자체를 저장하는 표

주요 컬럼:
- `id`
- `author_id`: 누가 썼는지
- `date`: 어느 날짜 데일리인지
- `raw_content`: 사용자가 처음 자유롭게 쓴 원문
- `created_at`
- `updated_at`

왜 필요한가:
- 사용자가 자유롭게 쓰는 원문 자체를 보관해야 하기 때문

중요:
- 이 표는 데일리 전체 껍데기
- 실제 프로젝트 연결/공개범위/섹션은 다음 표에서 관리

---

## 3.8 daily_blocks
무슨 표인가:
- 데일리 안의 문단 또는 블록 단위를 저장하는 표

이 표가 중요한 이유:
- 사용자는 자유롭게 쓰지만
- 시스템은 블록 단위로 프로젝트 연결, 공개범위, 섹션 분류를 해야 하기 때문

주요 컬럼:
- `id`
- `daily_log_id`: 어느 데일리에 속하는지
- `block_order`: 데일리 안에서 몇 번째 블록인지
- `content`: 블록 내용
- `section`: (`yesterday`, `today`, `issue`, `misc`)
- `project_id`: 연결된 프로젝트, 없으면 비워둠
- `visibility`: (`private`, `advisor`, `internal`, `project`)
- `created_at`
- `updated_at`

예시:
- 블록 1: 프로젝트 A / today / 공개범위 project
- 블록 2: 프로젝트 없음 / 행정 관련 / 공개범위 advisor

---

## 3.9 daily_block_tags
무슨 표인가:
- 데일리 블록에 어떤 태그가 붙어 있는지 저장하는 표

왜 필요한가:
- 태그는 여러 개 붙을 수 있기 때문

주요 컬럼:
- `id`
- `daily_block_id`
- `tag_id`

---

## 3.10 comments
무슨 표인가:
- 데일리 블록에 달린 댓글을 저장하는 표

주요 컬럼:
- `id`
- `daily_block_id`
- `author_id`
- `content`
- `created_at`
- `updated_at`

왜 필요한가:
- 특정 문단이나 이슈에 대해 바로 대화할 수 있어야 하기 때문

---

## 3.11 attendance
무슨 표인가:
- 출근/퇴근 기록을 저장하는 표

주요 컬럼:
- `id`
- `user_id`
- `date`
- `check_in`
- `check_out`
- `type`: (`daily`, `weekly` 등 필요시)
- `created_at`
- `updated_at`

왜 필요한가:
- 출결 현황을 날짜 기준으로 관리해야 하기 때문

---

## 3.12 tags
무슨 표인가:
- 태그 목록을 저장하는 표

주요 컬럼:
- `id`
- `name`: 태그 이름
- `color`: 태그 색상
- `scope_type`: `global` 또는 `project`
- `project_id`: 프로젝트 전용 태그일 때만 연결
- `created_at`

왜 필요한가:
- `논문`, `행정`, `회의`, `영상` 같은 전역 태그와
- 프로젝트 내부 전용 태그를 함께 관리하기 위해

중요:
- 프로젝트는 태그가 아니라 `project_id`로 직접 연결해야 함

---

## 3.13 attachments
무슨 표인가:
- 첨부 파일이나 이미지 링크를 저장하는 표

주요 컬럼:
- `id`
- `owner_type`: 무엇에 붙은 첨부인지 (`daily_block`, `task`, `report` 등)
- `owner_id`: 해당 대상 id
- `file_type`
- `file_url`
- `file_name`
- `created_at`

왜 필요한가:
- 이미지, NAS 링크, 문서 첨부 등을 공통 구조로 관리하기 위해

---

## 3.14 events
무슨 표인가:
- 캘린더 일정 정보를 저장하는 표

주요 컬럼:
- `id`
- `title`
- `description`
- `event_type`: (`class`, `meeting`, `deadline`, `presentation`, `leave`, `admin`, `personal`, `project`, `sota`)
- `start_at`
- `end_at`
- `all_day`
- `creator_id`
- `project_id`: 프로젝트 일정이면 연결
- `task_id`: 태스크 마감일과 연결 가능
- `visibility`: (`private`, `advisor`, `internal`, `project`)
- `source`: (`manual`, `task`, `google_calendar`)
- `created_at`
- `updated_at`

왜 필요한가:
- 학생 개인 일정, 프로젝트 일정, 수업, 회의, 발표, 마감을 함께 보여주기 위해

---

## 3.15 event_participants
무슨 표인가:
- 일정에 누가 참여하는지 저장하는 표

주요 컬럼:
- `id`
- `event_id`
- `user_id`
- `role`

왜 필요한가:
- 한 일정에 여러 사람이 참가할 수 있기 때문

---

## 3.16 notifications
무슨 표인가:
- 시스템 알림을 저장하는 표

주요 컬럼:
- `id`
- `user_id`: 누가 받는 알림인지
- `notification_type`
- `title`
- `body`
- `target_type`: 어떤 대상을 가리키는 알림인지 (`task`, `comment`, `daily_block`, `event` 등)
- `target_id`
- `is_read`
- `created_at`

왜 필요한가:
- Rocket.Chat, 앱 내부 알림, 나중의 푸시 알림의 공통 기반이 되기 때문

---

## 3.17 sota_items
무슨 표인가:
- SOTA 논문 또는 리뷰 대상 아이템 자체를 저장하는 표

주요 컬럼:
- `id`
- `title`
- `source`
- `published_at`
- `summary`
- `url`

---

## 3.18 sota_assignments
무슨 표인가:
- 어떤 SOTA 아이템이 누구에게 배정되었는지 저장하는 표

주요 컬럼:
- `id`
- `sota_item_id`
- `assignee_id`
- `assigned_by`
- `status`
- `due_date`
- `created_at`

왜 필요한가:
- 단순 추천이 아니라 실제 배정/검수/제출 추적까지 하기 위해

---

## 3.19 sota_reviews
무슨 표인가:
- SOTA 리뷰 결과를 저장하는 표

주요 컬럼:
- `id`
- `sota_assignment_id`
- `reviewer_id`
- `content`
- `submitted_at`

---

## 3.20 report_snapshots
무슨 표인가:
- 주간 리포트나 특정 시점 집계 결과를 저장하는 표

주요 컬럼:
- `id`
- `report_type`
- `title`
- `scope_type`: (`project`, `professor`, `student`, `tag`, `organization` 등)
- `scope_id`
- `period_start`
- `period_end`
- `content`
- `generated_by`
- `created_at`

왜 필요한가:
- 나중에 사람이 만든 요약이나 AI가 만든 리포트를 저장하기 위해

---

## 4. 테이블끼리 어떻게 연결되나

쉽게 그림처럼 보면 이렇다.

- 한 명의 교수는 여러 학생을 지도할 수 있다.
- 한 학생은 여러 프로젝트에 들어갈 수 있다.
- 한 프로젝트에는 여러 멤버가 있다.
- 한 프로젝트에는 여러 태스크가 있다.
- 한 태스크는 여러 담당자를 가질 수 있다.
- 한 사람은 하루에 하나의 데일리 문서를 가진다.
- 한 데일리 문서는 여러 블록으로 나뉜다.
- 각 블록은 프로젝트에 연결될 수도 있고 아닐 수도 있다.
- 각 블록에는 여러 태그가 붙을 수 있다.
- 각 블록에는 여러 댓글이 달릴 수 있다.
- 한 사람은 여러 일정에 참가할 수 있다.
- 한 일정은 프로젝트와 연결될 수도 있다.

---

## 5. 꼭 기억해야 하는 설계 원칙

### 5.1 프로젝트는 태그로 대체하지 않는다
프로젝트는 반드시 `project_id`로 직접 연결한다.
태그는 검색과 분류용 보조 수단이다.

### 5.2 데일리는 자유롭게 쓰되, 나중에 블록으로 구조화한다
원문은 `daily_logs.raw_content`에 저장한다.
구조화된 블록은 `daily_blocks`에 따로 저장한다.

### 5.3 교수 권한과 프로젝트 권한은 다르다
- 교수는 지도학생 기준으로 볼 수 있다.
- 프로젝트는 참여자 기준으로 볼 수 있다.
- 이 둘을 같은 규칙으로 처리하면 안 된다.

### 5.4 외부업체는 프로젝트 안에서는 넓게, 프로젝트 밖은 막는다
이 원칙이 권한 설계의 핵심이다.

### 5.5 일정은 단순 달력이 아니라 업무 상태를 보여주는 도구다
교수는 일정만이 아니라 학생의 상태를 이해할 수 있어야 한다.

---

## 6. 첫 구현에서 중요하게 만들 것

만약 바로 개발을 시작한다면, 테이블 생성 우선순위는 이 순서가 좋다.

1. `users`
2. `advisor_relations`
3. `projects`
4. `project_members`
5. `tasks`
6. `task_assignees`
7. `daily_logs`
8. `daily_blocks`
9. `comments`
10. `attendance`
11. `tags`
12. `daily_block_tags`
13. `events`
14. `event_participants`
15. `notifications`

그 다음 확장 기능으로:
- `attachments`
- `sota_items`
- `sota_assignments`
- `sota_reviews`
- `report_snapshots`

---

## 7. 한 줄 요약

이 DB 스키마의 핵심은 다음이다.

`사람, 프로젝트, 데일리 블록, 태스크, 일정이 서로 연결되도록 저장 구조를 만든다.`

이 문서가 있으면 다음 단계로는
- 실제 SQL 테이블 초안 만들기
- API 명세 만들기
- 화면별 필요한 데이터 정리하기
를 할 수 있다.
