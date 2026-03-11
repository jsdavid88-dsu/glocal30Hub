# 글로컬30 R&D Hub v3 — 개발용 DB 스키마 명세

이 문서는 실제 구현을 위한 데이터베이스 스키마 기준 문서다.
목표는 다른 AI 에이전트 또는 개발자가 이 문서를 바탕으로 PostgreSQL 테이블, migration, ORM 모델을 바로 작성할 수 있게 만드는 것이다.

기술 기준:
- DBMS: PostgreSQL
- 시간 컬럼: `timestamptz`
- 날짜 컬럼: `date`
- ID: 기본적으로 `uuid` 권장
- 상태값: PostgreSQL enum 또는 varchar + check constraint 중 택1
- soft delete는 초기에는 도입하지 않음. 필요 시 후속 추가
- 검색은 v1에서 PostgreSQL 기반으로 구현

---

## 1. 설계 원칙

### 1.1 권한 구조
권한은 role 기반과 relation 기반을 함께 사용한다.
- 전역 역할: `admin`, `professor`, `student`, `external`
- 관계 기반 권한: 지도교수 관계, 프로젝트 참여 관계, 프로젝트 내 역할 관계

### 1.2 프로젝트 연결 원칙
프로젝트는 태그로 대체하지 않는다.
프로젝트 관련 데이터는 반드시 `project_id`로 직접 연결한다.

### 1.3 데일리 구조 원칙
데일리는 아래 2계층 구조를 가진다.
- `daily_logs`: 하루 단위 원문 및 헤더
- `daily_blocks`: 구조화된 문단/블록 단위 데이터

### 1.4 데일리 동기화 원칙
- `raw_content`는 초기 자유 입력 상태 및 원문 백업 용도다.
- 구조화 이후 최종 표시와 운영 데이터의 source of truth는 `daily_blocks`다.
- raw_content와 daily_blocks는 완전 양방향 동기화하지 않는다.

### 1.5 공개 범위 원칙
프로젝트 없는 내용도 저장 가능해야 한다.
데이터 단위별 공개 범위를 둔다.

### 1.6 internal 범위 원칙
v1에서 `internal`은 전체 내부 사용자 범위를 의미한다.
별도 `lab` 또는 조직 단위 모델은 v1에서 도입하지 않는다.

### 1.7 공동 할당 원칙
태스크는 다중 담당자를 지원해야 하므로 assignee를 별도 테이블로 분리한다.

### 1.8 첨부 전략 원칙
- 대용량 원본은 링크 중심으로 관리
- 앱 내부 업로드는 경량 파일 위주
- 스토리지 백엔드는 추후 MinIO/S3 호환으로 확장 가능하게 설계

### 1.9 감사 로그 원칙
권한 변경 및 민감 액션은 AuditLog로 기록한다.

---

## 2. Enum 정의 권장안

### 2.1 user_role
- `admin`
- `professor`
- `student`
- `external`

### 2.2 user_status
- `active`
- `inactive`
- `pending`

### 2.3 project_status
- `active`
- `paused`
- `completed`

### 2.4 project_member_role
- `viewer`
- `member`
- `manager`
- `lead`

### 2.5 task_status
- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`

### 2.6 task_priority
- `low`
- `medium`
- `high`

### 2.7 daily_block_section
- `yesterday`
- `today`
- `issue`
- `misc`

### 2.8 visibility_scope
- `private`
- `advisor`
- `internal`
- `project`

### 2.9 attendance_type
- `daily`
- `weekly`

### 2.10 tag_scope_type
- `global`
- `project`

### 2.11 attachment_owner_type
- `daily_block`
- `task`
- `report_snapshot`
- `project`
- `event`

### 2.12 event_type
- `class`
- `meeting`
- `deadline`
- `presentation`
- `leave`
- `admin`
- `personal`
- `project`
- `sota`

### 2.13 event_source
- `manual`
- `task`
- `google_calendar`

### 2.14 notification_type
- `task_assigned`
- `task_updated`
- `daily_comment`
- `daily_issue`
- `attendance_missing`
- `event_reminder`
- `report_published`
- `sota_assigned`

### 2.15 sota_assignment_status
- `recommended`
- `assigned`
- `in_review`
- `submitted`
- `approved`
- `rejected`

### 2.16 report_type
- `weekly`
- `project_summary`
- `advisor_summary`
- `student_summary`
- `tag_summary`
- `organization_summary`

### 2.17 report_scope_type
- `organization`
- `project`
- `professor`
- `student`
- `tag`

---

## 3. 테이블 명세

## 3.1 users
### 컬럼
- `id uuid primary key`
- `email varchar(255) not null unique`
- `name varchar(100) not null`
- `role user_role not null`
- `status user_status not null default 'active'`
- `profile_image_url text null`
- `major_field varchar(100) null`
- `interest_fields jsonb not null default '[]'::jsonb`
- `company varchar(150) null`
- `google_subject varchar(255) null unique`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `last_login_at timestamptz null`

### 인덱스
- unique index on `email`
- unique index on `google_subject` where not null
- index on `role`
- index on `status`

---

## 3.2 advisor_relations
### 컬럼
- `id uuid primary key`
- `professor_id uuid not null references users(id)`
- `student_id uuid not null references users(id)`
- `created_at timestamptz not null default now()`

### 제약
- unique (`professor_id`, `student_id`)

### 인덱스
- index on `student_id`

---

## 3.3 projects
### 컬럼
- `id uuid primary key`
- `name varchar(200) not null`
- `description text null`
- `status project_status not null default 'active'`
- `start_date date null`
- `end_date date null`
- `created_by uuid null references users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 인덱스
- index on `status`
- index on `start_date`
- index on `end_date`

---

## 3.4 project_members
### 컬럼
- `id uuid primary key`
- `project_id uuid not null references projects(id) on delete cascade`
- `user_id uuid not null references users(id) on delete cascade`
- `project_role project_member_role not null default 'member'`
- `joined_at timestamptz not null default now()`

### 제약
- unique (`project_id`, `user_id`)

### 인덱스
- index on `user_id`
- index on (`project_id`, `project_role`)

---

## 3.5 tasks
### 컬럼
- `id uuid primary key`
- `project_id uuid not null references projects(id) on delete cascade`
- `title varchar(255) not null`
- `description text null`
- `status task_status not null default 'todo'`
- `priority task_priority not null default 'medium'`
- `due_date date null`
- `created_by uuid null references users(id)`
- `updated_by uuid null references users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 인덱스
- index on `project_id`
- index on (`project_id`, `status`)
- index on `due_date`
- index on `priority`

---

## 3.6 task_assignees
### 컬럼
- `id uuid primary key`
- `task_id uuid not null references tasks(id) on delete cascade`
- `user_id uuid not null references users(id) on delete cascade`
- `assigned_by uuid null references users(id)`
- `is_primary boolean not null default false`
- `assigned_at timestamptz not null default now()`

### 제약
- unique (`task_id`, `user_id`)

### 인덱스
- index on `user_id`
- index on (`task_id`, `is_primary`)

---

## 3.7 daily_logs
### 컬럼
- `id uuid primary key`
- `author_id uuid not null references users(id) on delete cascade`
- `date date not null`
- `raw_content text not null default ''`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 제약
- unique (`author_id`, `date`)

### 비고
- raw_content는 원문 백업 성격
- 구조화 이후 최종 표시 source of truth는 daily_blocks

### 인덱스
- index on `date`

---

## 3.8 daily_blocks
### 컬럼
- `id uuid primary key`
- `daily_log_id uuid not null references daily_logs(id) on delete cascade`
- `block_order integer not null`
- `content text not null`
- `section daily_block_section not null default 'misc'`
- `project_id uuid null references projects(id) on delete set null`
- `visibility visibility_scope not null`
- `search_vector tsvector null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 제약
- unique (`daily_log_id`, `block_order`)
- check: `visibility <> 'project' OR project_id IS NOT NULL`

### 비고
- v1 검색 대상 핵심 테이블
- content 기반 full-text search 권장

### 인덱스
- index on `project_id`
- index on `section`
- index on `visibility`
- GIN index on `search_vector`

---

## 3.9 tags
### 컬럼
- `id uuid primary key`
- `name varchar(100) not null`
- `color varchar(20) null`
- `scope_type tag_scope_type not null default 'global'`
- `project_id uuid null references projects(id) on delete cascade`
- `created_at timestamptz not null default now()`

### 제약
- check: `(scope_type = 'global' AND project_id IS NULL) OR (scope_type = 'project' AND project_id IS NOT NULL)`

### 인덱스
- unique index on (`scope_type`, `project_id`, `name`)
- index on `project_id`

---

## 3.10 daily_block_tags
### 컬럼
- `id uuid primary key`
- `daily_block_id uuid not null references daily_blocks(id) on delete cascade`
- `tag_id uuid not null references tags(id) on delete cascade`

### 제약
- unique (`daily_block_id`, `tag_id`)

### 인덱스
- index on `tag_id`

---

## 3.11 comments
### 컬럼
- `id uuid primary key`
- `daily_block_id uuid not null references daily_blocks(id) on delete cascade`
- `author_id uuid not null references users(id) on delete cascade`
- `content text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 인덱스
- index on `daily_block_id`
- index on `author_id`
- index on `created_at`

---

## 3.12 attendance
### 컬럼
- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `date date not null`
- `check_in timestamptz null`
- `check_out timestamptz null`
- `type attendance_type not null default 'daily'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 제약
- unique (`user_id`, `date`, `type`)
- check 권장: `check_out >= check_in`

### 인덱스
- index on `date`

---

## 3.13 attachments
### 컬럼
- `id uuid primary key`
- `owner_type attachment_owner_type not null`
- `owner_id uuid not null`
- `file_type varchar(50) null`
- `file_url text not null`
- `file_name varchar(255) null`
- `file_size_bytes bigint null`
- `storage_kind varchar(50) null`
- `preview_status varchar(50) null`
- `created_by uuid null references users(id)`
- `created_at timestamptz not null default now()`

### 비고
- polymorphic 구조
- v1은 링크 중심
- 대용량 파일은 외부 링크 우선

### 인덱스
- index on (`owner_type`, `owner_id`)
- index on `created_by`

---

## 3.14 events
### 컬럼
- `id uuid primary key`
- `title varchar(255) not null`
- `description text null`
- `event_type event_type not null`
- `start_at timestamptz not null`
- `end_at timestamptz not null`
- `all_day boolean not null default false`
- `creator_id uuid not null references users(id)`
- `project_id uuid null references projects(id) on delete set null`
- `task_id uuid null references tasks(id) on delete set null`
- `visibility visibility_scope not null`
- `source event_source not null default 'manual'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 제약
- `end_at >= start_at`

### 인덱스
- index on `project_id`
- index on `task_id`
- index on `creator_id`
- index on `start_at`
- index on `end_at`
- index on `event_type`
- index on `visibility`

---

## 3.15 event_participants
### 컬럼
- `id uuid primary key`
- `event_id uuid not null references events(id) on delete cascade`
- `user_id uuid not null references users(id) on delete cascade`
- `participant_role varchar(50) null`

### 제약
- unique (`event_id`, `user_id`)

### 인덱스
- index on `user_id`

---

## 3.16 notifications
### 컬럼
- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `notification_type notification_type not null`
- `title varchar(255) not null`
- `body text null`
- `target_type varchar(50) null`
- `target_id uuid null`
- `delivery_channels jsonb not null default '["in_app"]'::jsonb`
- `is_read boolean not null default false`
- `created_at timestamptz not null default now()`

### 비고
- v1 기본 채널은 in-app
- Rocket.Chat 후속 연동을 위해 채널 메타데이터 유지 가능

### 인덱스
- index on `user_id`
- index on (`user_id`, `is_read`)
- index on `created_at`

---

## 3.17 audit_logs
### 컬럼
- `id uuid primary key`
- `actor_id uuid null references users(id) on delete set null`
- `action_type varchar(100) not null`
- `target_type varchar(100) not null`
- `target_id uuid null`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

### 비고
- v1은 중요 변경 행위만 기록
- 조회 로그 전체 저장은 초기 범위에서 제외

### 인덱스
- index on `actor_id`
- index on `action_type`
- index on (`target_type`, `target_id`)
- index on `created_at`

---

## 3.18 sota_items
### 컬럼
- `id uuid primary key`
- `title varchar(500) not null`
- `source varchar(255) null`
- `published_at timestamptz null`
- `summary text null`
- `url text null`
- `created_at timestamptz not null default now()`

### 인덱스
- index on `published_at`

---

## 3.19 sota_assignments
### 컬럼
- `id uuid primary key`
- `sota_item_id uuid not null references sota_items(id) on delete cascade`
- `assignee_id uuid not null references users(id) on delete cascade`
- `assigned_by uuid null references users(id)`
- `status sota_assignment_status not null default 'assigned'`
- `due_date date null`
- `created_at timestamptz not null default now()`

### 인덱스
- index on `assignee_id`
- index on `status`
- index on `due_date`

---

## 3.20 sota_reviews
### 컬럼
- `id uuid primary key`
- `sota_assignment_id uuid not null references sota_assignments(id) on delete cascade`
- `reviewer_id uuid not null references users(id)`
- `content text not null`
- `submitted_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 인덱스
- index on `sota_assignment_id`
- index on `reviewer_id`

---

## 3.21 report_snapshots
### 컬럼
- `id uuid primary key`
- `report_type report_type not null`
- `title varchar(255) not null`
- `scope_type report_scope_type not null`
- `scope_id uuid null`
- `period_start date not null`
- `period_end date not null`
- `content jsonb not null default '{}'::jsonb`
- `generated_by uuid null references users(id)`
- `created_at timestamptz not null default now()`

### 인덱스
- index on `report_type`
- index on (`scope_type`, `scope_id`)
- index on `period_start`
- index on `period_end`

---

## 4. 검색 및 인덱싱 전략

### 4.1 v1 기본 전략
- 구조 검색은 일반 인덱스로 처리
- 본문 검색은 PostgreSQL full-text search 사용 권장
- 대상은 우선 `daily_blocks.content`

### 4.2 기본 필터 대상
- `daily_blocks.project_id`
- `daily_logs.author_id`
- `daily_logs.date`
- `daily_blocks.section`
- `daily_blocks.visibility`
- `daily_block_tags.tag_id`
- `tasks.status`
- `tasks.due_date`
- `events.start_at`, `events.end_at`

### 4.3 검색 엔진 확장
- v1에서는 Elasticsearch/OpenSearch 미도입
- 성능 문제가 확인되면 후속 도입 검토

---

## 5. 권장 마이그레이션 순서

### 1단계
- users
- advisor_relations
- projects
- project_members

### 2단계
- tasks
- task_assignees

### 3단계
- daily_logs
- daily_blocks
- tags
- daily_block_tags
- comments

### 4단계
- attendance
- events
- event_participants
- notifications
- attachments
- audit_logs

### 5단계
- sota_items
- sota_assignments
- sota_reviews
- report_snapshots

---

## 6. 구현 메모

- 권한 체크는 서비스 레이어에서 명시적으로 구현
- `daily_blocks.visibility`, `project_members.project_role`, `users.role` 조합으로 접근 제어 수행
- daily_logs 저장 직후 daily_blocks를 생성 또는 갱신하는 로직 필요
- AuditLog 기록 포인트를 서비스 함수에 명시적으로 넣는다
