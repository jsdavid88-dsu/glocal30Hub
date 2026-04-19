# Announcement + Feed Panel + Web Push + Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an announcement system with audience-scoped broadcasts, a persistent right-side feed panel showing 5 activity types, browser push notifications via VAPID, and automatic Google Calendar sync for tasks and announcements.

**Architecture:** New Announcement/AnnouncementRead/PushSubscription models with Alembic migration. Feed API merges 5 sources (announcements, comments, tasks, dailylogs, attendance) via Python-side merge sort with cursor pagination. Web Push uses pywebpush + VAPID keys. Frontend gets a FeedPanel component in Layout.tsx with filter tabs, infinite scroll, and inline announcement creation. Task/announcement creation auto-generates Event records and pushes to Google Calendar.

**Tech Stack:** FastAPI, SQLAlchemy 2.x async, PostgreSQL, pywebpush, React 18 + TypeScript, Vite, Service Worker (Push API)

**Spec:** `docs/superpowers/specs/2026-04-20-announcement-feed-push-design.md`

---

## Chunk 1: Backend Models, Schemas, and Migration

### Task 1: Create Announcement and PushSubscription models

**Files:**
- Create: `backend/app/models/announcement.py`
- Create: `backend/app/models/push_subscription.py`
- Modify: `backend/app/models/__init__.py` (if exists, add imports)

- [ ] **Step 1: Create announcement model file**

Create `backend/app/models/announcement.py`:

```python
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class AnnouncementAudience(str, enum.Enum):
    everyone = "everyone"
    professors = "professors"
    students = "students"
    project = "project"


class Announcement(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "announcements"
    __table_args__ = (
        CheckConstraint(
            "(audience = 'project' AND project_id IS NOT NULL) OR "
            "(audience != 'project' AND project_id IS NULL)",
            name="ck_announcements_project_audience",
        ),
        Index("ix_announcements_audience", "audience"),
        Index("ix_announcements_author_id", "author_id"),
        Index("ix_announcements_project_id", "project_id"),
        Index("ix_announcements_pinned", "pinned"),
        Index("ix_announcements_expires_at", "expires_at"),
    )

    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[AnnouncementAudience] = mapped_column(
        Enum(AnnouncementAudience, values_callable=lambda e: [x.value for x in e]),
        nullable=False,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    author: Mapped["User"] = relationship()
    project: Mapped["Project | None"] = relationship()
    reads: Mapped[list["AnnouncementRead"]] = relationship(
        back_populates="announcement", cascade="all, delete-orphan"
    )


class AnnouncementRead(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "announcement_reads"
    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_announcement_reads"),
        Index("ix_announcement_reads_announcement_id", "announcement_id"),
        Index("ix_announcement_reads_user_id_announcement_id", "user_id", "announcement_id"),
    )

    announcement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    announcement: Mapped["Announcement"] = relationship(back_populates="reads")
```

- [ ] **Step 2: Create push subscription model file**

Create `backend/app/models/push_subscription.py`:

```python
import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class PushSubscription(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "endpoint", name="uq_push_subscriptions_user_endpoint"),
        Index("ix_push_subscriptions_user_id", "user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(256), nullable=False)
    auth: Mapped[str] = mapped_column(String(256), nullable=False)
```

- [ ] **Step 3: Add `announcement` to NotificationType enum**

Modify `backend/app/models/notification.py` — add to `NotificationType`:

```python
announcement = "announcement"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/announcement.py backend/app/models/push_subscription.py backend/app/models/notification.py
git commit -m "feat: add Announcement, AnnouncementRead, PushSubscription models"
```

---

### Task 2: Create Pydantic schemas

**Files:**
- Create: `backend/app/schemas/announcement.py`
- Create: `backend/app/schemas/push_subscription.py`

- [ ] **Step 1: Create announcement schemas**

Create `backend/app/schemas/announcement.py`:

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.announcement import AnnouncementAudience


class AnnouncementCreate(BaseModel):
    title: str = Field(max_length=200)
    body: str
    audience: AnnouncementAudience
    project_id: uuid.UUID | None = None
    pinned: bool = False
    expires_at: datetime | None = None


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = None
    pinned: bool | None = None
    expires_at: datetime | None = None


class AnnouncementAuthor(BaseModel):
    id: uuid.UUID
    name: str
    model_config = {"from_attributes": True}


class AnnouncementResponse(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    audience: AnnouncementAudience
    project_id: uuid.UUID | None
    pinned: bool
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime
    author: AnnouncementAuthor | None = None
    read_count: int = 0
    total_target: int = 0
    is_read: bool = False
    model_config = {"from_attributes": True}


class AnnouncementListResponse(BaseModel):
    data: list[AnnouncementResponse]
    next_cursor: str | None = None
    has_more: bool = False
```

- [ ] **Step 2: Create push subscription schemas**

Create `backend/app/schemas/push_subscription.py`:

```python
from pydantic import BaseModel


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/announcement.py backend/app/schemas/push_subscription.py
git commit -m "feat: add Announcement and PushSubscription Pydantic schemas"
```

---

### Task 3: Create Alembic migrations

**Files:**
- Create: `backend/alembic/versions/<hash1>_add_notification_type_announcement.py`
- Create: `backend/alembic/versions/<hash2>_add_announcement_tables.py`

- [ ] **Step 1: Generate migration 1 — enum extension**

```bash
cd backend
alembic revision --autogenerate -m "add_notification_type_announcement"
```

Then edit the generated file. The `upgrade()` must use raw SQL outside transaction:

```python
def upgrade() -> None:
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'announcement'")

def downgrade() -> None:
    # PostgreSQL cannot remove enum values; no-op
    pass
```

**Important:** Remove any auto-generated table operations — this migration only touches the enum.

- [ ] **Step 2: Run migration 1**

```bash
alembic upgrade head
```

Expected: Migration applies without error.

- [ ] **Step 3: Generate migration 2 — tables**

```bash
alembic revision --autogenerate -m "add_announcement_and_push_tables"
```

Verify the generated file creates:
- `announcements` table with all columns, indexes, check constraint
- `announcement_reads` table with unique constraint and indexes
- `push_subscriptions` table with unique constraint and index

- [ ] **Step 4: Run migration 2**

```bash
alembic upgrade head
```

Expected: 3 tables created. Verify with `\dt` in psql or equivalent.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: add Alembic migrations for announcement and push tables"
```

---

## Chunk 2: Backend API — Announcements CRUD + Feed + Push

### Task 4: Create announcements API

**Files:**
- Create: `backend/app/api/v1/announcements.py`
- Modify: `backend/app/api/v1/router.py` (add router)

- [ ] **Step 1: Create announcements API module**

Create `backend/app/api/v1/announcements.py`:

```python
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_project_membership
from app.models.announcement import Announcement, AnnouncementAudience, AnnouncementRead
from app.models.notification import Notification, NotificationType
from app.models.project import ProjectMember, ProjectMemberRole
from app.models.user import User, UserRole
from app.schemas.announcement import AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse

router = APIRouter()


def _audience_filter(user: User):
    """Build SQLAlchemy filter for announcements visible to this user."""
    filters = [Announcement.audience == AnnouncementAudience.everyone]
    if user.role in (UserRole.professor, UserRole.admin):
        filters.append(Announcement.audience == AnnouncementAudience.professors)
    if user.role == UserRole.student:
        filters.append(Announcement.audience == AnnouncementAudience.students)
    # project-scoped handled separately via subquery
    return filters


async def _get_user_project_ids(db: AsyncSession, user: User) -> list[uuid.UUID]:
    """Get project IDs user is a member of."""
    if user.role in (UserRole.admin, UserRole.professor):
        return []  # they see all project announcements
    result = await db.execute(
        select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    )
    return [r[0] for r in result.all()]


@router.post("/", status_code=201)
async def create_announcement(
    body: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an announcement. Permission depends on audience."""
    # Permission check
    if body.audience == AnnouncementAudience.everyone:
        if current_user.role != UserRole.admin:
            raise HTTPException(status_code=403, detail="Only admin can post to everyone")
    elif body.audience == AnnouncementAudience.professors:
        if current_user.role != UserRole.admin:
            raise HTTPException(status_code=403, detail="Only admin can post to professors")
    elif body.audience == AnnouncementAudience.students:
        if current_user.role not in (UserRole.admin, UserRole.professor):
            raise HTTPException(status_code=403, detail="Only admin/professor can post to students")
    elif body.audience == AnnouncementAudience.project:
        if body.project_id is None:
            raise HTTPException(status_code=400, detail="project_id required for project audience")
        # Check user is lead/manager or admin
        if current_user.role != UserRole.admin:
            result = await db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == body.project_id,
                    ProjectMember.user_id == current_user.id,
                    ProjectMember.project_role.in_([ProjectMemberRole.lead, ProjectMemberRole.manager]),
                )
            )
            if result.scalar_one_or_none() is None:
                raise HTTPException(status_code=403, detail="Must be project lead/manager or admin")

    announcement = Announcement(
        author_id=current_user.id,
        title=body.title,
        body=body.body,
        audience=body.audience,
        project_id=body.project_id,
        pinned=body.pinned,
        expires_at=body.expires_at,
    )
    db.add(announcement)
    await db.flush()

    # Determine target users for notifications
    target_query = select(User.id)
    if body.audience == AnnouncementAudience.everyone:
        target_query = target_query.where(User.status == UserStatus.active)
    elif body.audience == AnnouncementAudience.professors:
        target_query = target_query.where(User.role.in_([UserRole.professor, UserRole.admin]))
    elif body.audience == AnnouncementAudience.students:
        target_query = target_query.where(User.role == UserRole.student)
    elif body.audience == AnnouncementAudience.project:
        target_query = (
            select(ProjectMember.user_id)
            .where(ProjectMember.project_id == body.project_id)
        )

    result = await db.execute(target_query)
    target_user_ids = [r[0] for r in result.all()]

    # Create notifications for each target (excluding author)
    for uid in target_user_ids:
        if uid == current_user.id:
            continue
        notif = Notification(
            user_id=uid,
            notification_type=NotificationType.announcement,
            title=f"📢 {body.title}",
            body=body.body[:200] if body.body else None,
            target_type="announcement",
            target_id=announcement.id,
        )
        db.add(notif)

    await db.commit()
    await db.refresh(announcement)

    return AnnouncementResponse(
        id=announcement.id,
        title=announcement.title,
        body=announcement.body,
        audience=announcement.audience,
        project_id=announcement.project_id,
        pinned=announcement.pinned,
        expires_at=announcement.expires_at,
        created_at=announcement.created_at,
        updated_at=announcement.updated_at,
        read_count=0,
        total_target=len(target_user_ids),
        is_read=False,
    )


@router.get("/")
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=50),
    pinned_only: bool = False,
):
    """List announcements visible to current user."""
    from sqlalchemy import or_

    filters = _audience_filter(current_user)

    # Project-scoped: admin/prof see all, others see their projects only
    if current_user.role in (UserRole.admin, UserRole.professor):
        filters.append(Announcement.audience == AnnouncementAudience.project)
    else:
        project_ids = await _get_user_project_ids(db, current_user)
        if project_ids:
            filters.append(
                and_(
                    Announcement.audience == AnnouncementAudience.project,
                    Announcement.project_id.in_(project_ids),
                )
            )

    query = select(Announcement).where(or_(*filters))

    # Exclude expired
    now = datetime.now(timezone.utc)
    query = query.where(
        (Announcement.expires_at.is_(None)) | (Announcement.expires_at > now)
    )

    if pinned_only:
        query = query.where(Announcement.pinned == True)

    if cursor:
        cursor_dt = datetime.fromisoformat(cursor)
        query = query.where(Announcement.created_at < cursor_dt)

    query = (
        query.options(selectinload(Announcement.author))
        .order_by(Announcement.pinned.desc(), Announcement.created_at.desc())
        .limit(limit + 1)
    )

    result = await db.execute(query)
    items = list(result.scalars().all())
    has_more = len(items) > limit
    items = items[:limit]

    # Get read status for current user
    if items:
        read_result = await db.execute(
            select(AnnouncementRead.announcement_id).where(
                AnnouncementRead.user_id == current_user.id,
                AnnouncementRead.announcement_id.in_([a.id for a in items]),
            )
        )
        read_ids = {r[0] for r in read_result.all()}
    else:
        read_ids = set()

    data = []
    for a in items:
        data.append(AnnouncementResponse(
            id=a.id,
            title=a.title,
            body=a.body,
            audience=a.audience,
            project_id=a.project_id,
            pinned=a.pinned,
            expires_at=a.expires_at,
            created_at=a.created_at,
            updated_at=a.updated_at,
            author=a.author,
            is_read=a.id in read_ids,
        ))

    return {
        "data": data,
        "next_cursor": items[-1].created_at.isoformat() if items and has_more else None,
        "has_more": has_more,
    }


@router.get("/{announcement_id}")
async def get_announcement(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get announcement detail with read stats."""
    result = await db.execute(
        select(Announcement)
        .options(selectinload(Announcement.author))
        .where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if ann is None:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # Read stats
    read_count = (await db.execute(
        select(func.count()).where(AnnouncementRead.announcement_id == announcement_id)
    )).scalar() or 0

    # Check if current user has read
    read_result = await db.execute(
        select(AnnouncementRead).where(
            AnnouncementRead.announcement_id == announcement_id,
            AnnouncementRead.user_id == current_user.id,
        )
    )
    is_read = read_result.scalar_one_or_none() is not None

    return AnnouncementResponse(
        id=ann.id,
        title=ann.title,
        body=ann.body,
        audience=ann.audience,
        project_id=ann.project_id,
        pinned=ann.pinned,
        expires_at=ann.expires_at,
        created_at=ann.created_at,
        updated_at=ann.updated_at,
        author=ann.author,
        read_count=read_count,
        is_read=is_read,
    )


@router.patch("/{announcement_id}")
async def update_announcement(
    announcement_id: uuid.UUID,
    body: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update announcement. Author or admin only."""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if ann is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    if ann.author_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Permission denied")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(ann, field, value)

    await db.commit()
    await db.refresh(ann)
    return {"id": str(ann.id), "status": "updated"}


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete announcement. Author or admin only."""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if ann is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    if ann.author_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Permission denied")

    await db.delete(ann)
    await db.commit()
    return {"status": "deleted"}


@router.post("/{announcement_id}/read")
async def mark_announcement_read(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark announcement as read. Idempotent."""
    # Check announcement exists
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # Check if already read
    existing = await db.execute(
        select(AnnouncementRead).where(
            AnnouncementRead.announcement_id == announcement_id,
            AnnouncementRead.user_id == current_user.id,
        )
    )
    read = existing.scalar_one_or_none()
    if read:
        return {"status": "already_read", "read_at": read.read_at.isoformat()}

    read = AnnouncementRead(
        announcement_id=announcement_id,
        user_id=current_user.id,
    )
    db.add(read)
    await db.commit()
    await db.refresh(read)
    return {"status": "read", "read_at": read.read_at.isoformat()}
```

- [ ] **Step 2: Register router**

Add to `backend/app/api/v1/router.py`:

```python
from app.api.v1 import announcements
api_router.include_router(announcements.router, prefix="/announcements", tags=["announcements"])
```

- [ ] **Step 3: Test manually**

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Visit `http://localhost:8000/docs` — verify `/announcements` endpoints appear.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/announcements.py backend/app/api/v1/router.py
git commit -m "feat: add announcements CRUD API with audience permissions and read tracking"
```

---

### Task 5: Create feed API

**Files:**
- Create: `backend/app/api/v1/feed.py`
- Modify: `backend/app/api/v1/router.py` (add router)

- [ ] **Step 1: Create feed API module**

Create `backend/app/api/v1/feed.py`:

```python
import uuid
from datetime import datetime, timezone
from heapq import merge

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.announcement import Announcement, AnnouncementAudience, AnnouncementRead
from app.models.daily import DailyLog, DailyBlock, BlockVisibility
from app.models.task import Task, TaskAssignee
from app.models.comment import Comment
from app.models.attendance import Attendance
from app.models.project import ProjectMember
from app.models.user import User, UserRole, UserStatus

router = APIRouter()


async def _query_announcements(
    db: AsyncSession, user: User, cursor_dt: datetime | None, limit: int, my_only: bool,
) -> list[dict]:
    """Query announcements visible to user."""
    from sqlalchemy import or_

    filters = [Announcement.audience == AnnouncementAudience.everyone]
    if user.role in (UserRole.professor, UserRole.admin):
        filters.append(Announcement.audience == AnnouncementAudience.professors)
        filters.append(Announcement.audience == AnnouncementAudience.project)
    if user.role == UserRole.student:
        filters.append(Announcement.audience == AnnouncementAudience.students)

    if user.role not in (UserRole.admin, UserRole.professor):
        proj_result = await db.execute(
            select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        )
        proj_ids = [r[0] for r in proj_result.all()]
        if proj_ids:
            filters.append(
                and_(
                    Announcement.audience == AnnouncementAudience.project,
                    Announcement.project_id.in_(proj_ids),
                )
            )

    query = select(Announcement).options(selectinload(Announcement.author)).where(or_(*filters))

    now = datetime.now(timezone.utc)
    query = query.where(
        (Announcement.expires_at.is_(None)) | (Announcement.expires_at > now)
    )
    if cursor_dt:
        query = query.where(Announcement.created_at < cursor_dt)

    query = query.order_by(Announcement.created_at.desc()).limit(limit)
    result = await db.execute(query)

    # Get read status
    items = list(result.scalars().all())
    read_ids = set()
    if items:
        read_result = await db.execute(
            select(AnnouncementRead.announcement_id).where(
                AnnouncementRead.user_id == user.id,
                AnnouncementRead.announcement_id.in_([a.id for a in items]),
            )
        )
        read_ids = {r[0] for r in read_result.all()}

    return [
        {
            "type": "announcement",
            "id": str(a.id),
            "title": a.title,
            "body": a.body[:200] if a.body else "",
            "author": {"id": str(a.author.id), "name": a.author.name} if a.author else None,
            "pinned": a.pinned,
            "is_read": a.id in read_ids,
            "created_at": a.created_at.isoformat(),
            "_sort_key": a.created_at,
        }
        for a in items
    ]


async def _query_comments(
    db: AsyncSession, user: User, cursor_dt: datetime | None, limit: int, my_only: bool,
) -> list[dict]:
    """Query recent comments visible to user."""
    query = (
        select(Comment)
        .options(selectinload(Comment.author))
        .join(DailyBlock, Comment.daily_block_id == DailyBlock.id)
    )

    # Visibility filter: admin/professor see all internal+; student see internal+project
    if user.role == UserRole.student:
        query = query.where(DailyBlock.visibility.in_([
            BlockVisibility.internal, BlockVisibility.project
        ]))
    elif user.role == UserRole.external:
        query = query.where(DailyBlock.visibility == BlockVisibility.project)

    if my_only:
        query = query.join(DailyLog, DailyBlock.daily_log_id == DailyLog.id)
        query = query.where(DailyLog.author_id == user.id)

    if cursor_dt:
        query = query.where(Comment.created_at < cursor_dt)

    query = query.order_by(Comment.created_at.desc()).limit(limit)
    result = await db.execute(query)

    return [
        {
            "type": "comment",
            "id": str(c.id),
            "body": c.content[:100] if c.content else "",
            "author": {"id": str(c.author.id), "name": c.author.name} if c.author else None,
            "target": {"type": "daily_block", "id": str(c.daily_block_id)},
            "created_at": c.created_at.isoformat(),
            "_sort_key": c.created_at,
        }
        for c in result.scalars().all()
    ]


async def _query_tasks(
    db: AsyncSession, user: User, cursor_dt: datetime | None, limit: int, my_only: bool,
) -> list[dict]:
    """Query recent task assignments."""
    query = (
        select(TaskAssignee)
        .options(selectinload(TaskAssignee.task), selectinload(TaskAssignee.user))
    )

    if my_only:
        query = query.where(TaskAssignee.user_id == user.id)
    elif user.role not in (UserRole.admin, UserRole.professor):
        # Only show assignments for projects user is member of
        proj_result = await db.execute(
            select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        )
        proj_ids = [r[0] for r in proj_result.all()]
        if proj_ids:
            query = query.join(Task, TaskAssignee.task_id == Task.id)
            query = query.where(Task.project_id.in_(proj_ids))
        else:
            return []

    if cursor_dt:
        query = query.where(TaskAssignee.assigned_at < cursor_dt)

    query = query.order_by(TaskAssignee.assigned_at.desc()).limit(limit)
    result = await db.execute(query)

    return [
        {
            "type": "task",
            "id": str(ta.id),
            "title": ta.task.title if ta.task else "",
            "author": {"id": str(ta.user.id), "name": ta.user.name} if ta.user else None,
            "created_at": ta.assigned_at.isoformat(),
            "_sort_key": ta.assigned_at,
        }
        for ta in result.scalars().all()
    ]


async def _query_dailylogs(
    db: AsyncSession, user: User, cursor_dt: datetime | None, limit: int, my_only: bool,
) -> list[dict]:
    """Query recent daily logs."""
    query = select(DailyLog).options(selectinload(DailyLog.author))

    if my_only:
        query = query.where(DailyLog.author_id == user.id)

    if cursor_dt:
        query = query.where(DailyLog.created_at < cursor_dt)

    query = query.order_by(DailyLog.created_at.desc()).limit(limit)
    result = await db.execute(query)

    return [
        {
            "type": "daily",
            "id": str(d.id),
            "title": f"{d.author.name}의 데일리" if d.author else "데일리",
            "author": {"id": str(d.author.id), "name": d.author.name} if d.author else None,
            "created_at": d.created_at.isoformat(),
            "_sort_key": d.created_at,
        }
        for d in result.scalars().all()
    ]


async def _query_attendance(
    db: AsyncSession, user: User, cursor_dt: datetime | None, limit: int, my_only: bool,
) -> list[dict]:
    """Query recent attendance check-ins."""
    query = select(Attendance).options(selectinload(Attendance.user))

    if my_only or user.role in (UserRole.student, UserRole.external):
        query = query.where(Attendance.user_id == user.id)

    if cursor_dt:
        query = query.where(Attendance.created_at < cursor_dt)

    query = query.order_by(Attendance.created_at.desc()).limit(limit)
    result = await db.execute(query)

    return [
        {
            "type": "attendance",
            "id": str(a.id),
            "title": f"{a.user.name} 체크인" if a.user else "체크인",
            "author": {"id": str(a.user.id), "name": a.user.name} if a.user else None,
            "created_at": a.created_at.isoformat(),
            "_sort_key": a.created_at,
        }
        for a in result.scalars().all()
    ]


FEED_QUERIES = {
    "announcement": _query_announcements,
    "comment": _query_comments,
    "task": _query_tasks,
    "daily": _query_dailylogs,
    "attendance": _query_attendance,
}


@router.get("/")
async def get_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    type: str | None = Query(None, description="Filter by type: announcement|comment|task|daily|attendance"),
    my: bool = Query(False, description="Show only my-related items"),
    cursor: str | None = Query(None, description="ISO datetime cursor for pagination"),
    limit: int = Query(20, ge=1, le=50),
):
    """Unified feed merging 5 sources by created_at desc."""
    cursor_dt = datetime.fromisoformat(cursor) if cursor else None

    # Determine which sources to query
    if type:
        types = [t.strip() for t in type.split(",") if t.strip() in FEED_QUERIES]
    else:
        types = list(FEED_QUERIES.keys())

    # Query each source independently with limit+1 for has_more
    all_items: list[dict] = []
    for t in types:
        items = await FEED_QUERIES[t](db, current_user, cursor_dt, limit + 1, my)
        all_items.extend(items)

    # Sort by created_at desc (merge sort)
    all_items.sort(key=lambda x: x["_sort_key"], reverse=True)

    # Separate pinned announcements for top position
    pinned = [i for i in all_items if i.get("type") == "announcement" and i.get("pinned")]
    regular = [i for i in all_items if not (i.get("type") == "announcement" and i.get("pinned"))]

    # Apply limit to regular items
    has_more = len(regular) > limit
    regular = regular[:limit]

    # Clean up internal sort key
    for item in pinned + regular:
        item.pop("_sort_key", None)

    return {
        "pinned": pinned,
        "items": regular,
        "next_cursor": regular[-1]["created_at"] if regular and has_more else None,
        "has_more": has_more,
    }
```

- [ ] **Step 2: Register router**

Add to `backend/app/api/v1/router.py`:

```python
from app.api.v1 import feed
api_router.include_router(feed.router, prefix="/feed", tags=["feed"])
```

- [ ] **Step 3: Verify feed endpoint in Swagger**

```bash
# With backend running
# Visit http://localhost:8000/docs → GET /feed should appear
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/feed.py backend/app/api/v1/router.py
git commit -m "feat: add unified feed API merging 5 sources with cursor pagination"
```

---

### Task 6: Create push subscription API + Web Push service

**Files:**
- Create: `backend/app/api/v1/push.py`
- Create: `backend/app/services/web_push.py`
- Modify: `backend/app/api/v1/router.py` (add router)
- Modify: `backend/app/config.py` (add VAPID env vars)
- Modify: `backend/requirements.txt` (add pywebpush)

- [ ] **Step 1: Add pywebpush to requirements**

Add to `backend/requirements.txt`:

```
pywebpush==2.0.1
```

Run:
```bash
cd backend
pip install pywebpush==2.0.1
```

- [ ] **Step 2: Add VAPID config to config.py**

Add to `backend/app/config.py` Settings class:

```python
VAPID_PRIVATE_KEY: str = ""
VAPID_PUBLIC_KEY: str = ""
VAPID_SUBJECT: str = "mailto:admin@glocal30hub.com"
```

- [ ] **Step 3: Create web push service**

Create `backend/app/services/web_push.py`:

```python
import json
import logging

from pywebpush import webpush, WebPushException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


async def send_push_to_user(
    db: AsyncSession,
    user_id,
    title: str,
    body: str,
    url: str = "/",
    push_type: str = "notification",
):
    """Send web push notification to all subscriptions of a user. Best-effort."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.debug("VAPID keys not configured, skipping push")
        return

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    subscriptions = result.scalars().all()

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url,
        "type": push_type,
    })

    for sub in subscriptions:
        try:
            import asyncio
            await asyncio.to_thread(
                webpush,
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
            )
        except WebPushException as e:
            logger.warning(f"Push failed for user {user_id}: {e}")
            if "410" in str(e) or "404" in str(e):
                # Subscription expired, remove it
                await db.delete(sub)
                await db.commit()
        except Exception as e:
            logger.warning(f"Push error for user {user_id}: {e}")


async def send_push_to_users(
    db: AsyncSession,
    user_ids: list,
    title: str,
    body: str,
    url: str = "/",
    push_type: str = "notification",
):
    """Send push to multiple users."""
    for uid in user_ids:
        await send_push_to_user(db, uid, title, body, url, push_type)
```

- [ ] **Step 4: Create push subscription API**

Create `backend/app/api/v1/push.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.push_subscription import PushSubscriptionCreate
from app.config import settings

router = APIRouter()


@router.post("/subscribe", status_code=201)
async def subscribe_push(
    body: PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register a push subscription for current user."""
    # Check duplicate
    existing = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == body.endpoint,
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_subscribed"}

    sub = PushSubscription(
        user_id=current_user.id,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
    )
    db.add(sub)
    await db.commit()
    return {"status": "subscribed"}


@router.delete("/subscribe")
async def unsubscribe_push(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove all push subscriptions for current user."""
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == current_user.id)
    )
    subs = result.scalars().all()
    for sub in subs:
        await db.delete(sub)
    await db.commit()
    return {"status": "unsubscribed", "removed": len(subs)}


@router.get("/vapid-key")
async def get_vapid_public_key(
    _current_user: User = Depends(get_current_user),
):
    """Get VAPID public key for push subscription."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    return {"publicKey": settings.VAPID_PUBLIC_KEY}
```

- [ ] **Step 5: Register router**

Add to `backend/app/api/v1/router.py`:

```python
from app.api.v1 import push
api_router.include_router(push.router, prefix="/push", tags=["push"])
```

- [ ] **Step 6: Add push sending to announcement creation**

In `backend/app/api/v1/announcements.py`, add after the notification loop in `create_announcement`:

```python
    # Send web push to target users (best-effort, after commit)
    from app.services.web_push import send_push_to_users
    push_targets = [uid for uid in target_user_ids if uid != current_user.id]
    await send_push_to_users(
        db, push_targets,
        title=f"📢 {body.title}",
        body=body.body[:100] if body.body else "",
        url="/",
        push_type="announcement",
    )
```

- [ ] **Step 7: Add push sending to existing comment/task notification triggers**

Find where `create_notification` is called in `comments.py` and `tasks.py`. After each call, add:

```python
from app.services.web_push import send_push_to_user
await send_push_to_user(db, target_user_id, title="...", body="...")
```

Specific locations:
- `comments.py` — after creating comment notification, push to block author
- `tasks.py` — after task assignment notification, push to assigned user

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/push.py backend/app/services/web_push.py backend/app/api/v1/router.py backend/app/config.py backend/requirements.txt backend/app/api/v1/announcements.py backend/app/api/v1/comments.py backend/app/api/v1/tasks.py
git commit -m "feat: add Web Push via VAPID + push subscription API + notification triggers"
```

---

## Chunk 3: Google Calendar Auto-Sync for Tasks and Announcements

### Task 7: Add task → Google Calendar sync

**Files:**
- Modify: `backend/app/api/v1/tasks.py` (create/update/delete endpoints)

- [ ] **Step 1: Create helper for task-event sync**

Add to `backend/app/api/v1/tasks.py` (top of file, after imports):

```python
from app.models.event import Event, EventType, EventSource, EventParticipant
from app.models.daily import BlockVisibility
from app.config import settings


async def _sync_task_to_calendar(db: AsyncSession, task: Task, creator_id: uuid.UUID):
    """Create or update an Event linked to this task when due_date exists."""
    if not task.due_date:
        # Remove linked event if due_date cleared
        result = await db.execute(
            select(Event).where(Event.task_id == task.id, Event.source == EventSource.task)
        )
        existing = result.scalar_one_or_none()
        if existing:
            if existing.google_event_id and settings.GOOGLE_CALENDAR_ENABLED:
                try:
                    from app.services.google_calendar import delete_gcal_event
                    from app.models.user import User
                    user = await db.get(User, creator_id)
                    if user and user.google_refresh_token:
                        await delete_gcal_event(user.google_refresh_token, existing.google_event_id)
                except Exception:
                    pass
            await db.delete(existing)
        return

    from datetime import datetime, time, timezone

    start_dt = datetime.combine(task.due_date, time(0, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(task.due_date, time(23, 59, 59), tzinfo=timezone.utc)

    # Check if event already exists for this task
    result = await db.execute(
        select(Event).where(Event.task_id == task.id, Event.source == EventSource.task)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.title = task.title
        existing.start_at = start_dt
        existing.end_at = end_dt
        # Update Google Calendar if connected
        if existing.google_event_id and settings.GOOGLE_CALENDAR_ENABLED:
            try:
                from app.services.google_calendar import update_gcal_event
                from app.models.user import User
                user = await db.get(User, creator_id)
                if user and user.google_refresh_token:
                    await update_gcal_event(
                        user.google_refresh_token, existing.google_event_id, existing
                    )
            except Exception:
                pass
    else:
        event = Event(
            title=task.title,
            event_type=EventType.deadline,
            start_at=start_dt,
            end_at=end_dt,
            all_day=True,
            creator_id=creator_id,
            project_id=task.project_id,
            task_id=task.id,
            visibility=BlockVisibility.project,
            source=EventSource.task,
        )
        db.add(event)
        await db.flush()

        # Push to Google Calendar if enabled
        if settings.GOOGLE_CALENDAR_ENABLED:
            try:
                from app.services.google_calendar import create_gcal_event
                from app.models.user import User
                user = await db.get(User, creator_id)
                if user and user.google_refresh_token:
                    google_event_id = await create_gcal_event(
                        user.google_refresh_token, event
                    )
                    if google_event_id:
                        event.google_event_id = google_event_id
            except Exception:
                pass
```

- [ ] **Step 2: Add sync calls to create_task endpoint**

In the `create_task` function, after `await db.commit()`, add:

```python
    await _sync_task_to_calendar(db, task, current_user.id)
    await db.commit()
```

- [ ] **Step 3: Add sync calls to update_task endpoint**

In the `update_task` function, after updating fields and before/after commit:

```python
    await _sync_task_to_calendar(db, task, current_user.id)
    await db.commit()
```

- [ ] **Step 4: Note on task deletion**

There is no `delete_task` endpoint in the current codebase. Calendar event cleanup for tasks happens via:
- `_sync_task_to_calendar` when `due_date` is set to `None` (removes linked Event)
- SQLAlchemy CASCADE: `Event.task_id` FK has `ondelete="SET NULL"`, so if a task delete endpoint is added later, the Event's `task_id` will be nulled but the Event will remain. This is acceptable.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/tasks.py
git commit -m "feat: auto-sync tasks with due_date to Google Calendar via Event model"
```

---

### Task 8: Add announcement → Google Calendar sync

**Files:**
- Modify: `backend/app/api/v1/announcements.py` (create/delete endpoints)

- [ ] **Step 1: Add calendar sync to announcement creation**

In `create_announcement`, after commit and push notifications, add:

```python
    # Create calendar event if expires_at is set
    if body.expires_at and settings.GOOGLE_CALENDAR_ENABLED:
        from app.models.event import Event, EventType, EventSource
        from app.models.daily import BlockVisibility

        visibility_map = {
            AnnouncementAudience.everyone: BlockVisibility.internal,
            AnnouncementAudience.professors: BlockVisibility.internal,
            AnnouncementAudience.students: BlockVisibility.internal,
            AnnouncementAudience.project: BlockVisibility.project,
        }

        event = Event(
            title=f"📢 {body.title}",
            description=body.body[:500] if body.body else None,
            event_type=EventType.admin,
            start_at=announcement.created_at,
            end_at=body.expires_at,
            all_day=False,
            creator_id=current_user.id,
            project_id=body.project_id,
            visibility=visibility_map.get(body.audience, BlockVisibility.internal),
            source=EventSource.manual,
        )
        db.add(event)
        await db.flush()

        # Push to creator's Google Calendar
        try:
            from app.services.google_calendar import create_gcal_event
            if current_user.google_refresh_token:
                google_event_id = await create_gcal_event(
                    current_user.google_refresh_token, event
                )
                if google_event_id:
                    event.google_event_id = google_event_id
        except Exception:
            pass

        await db.commit()
```

- [ ] **Step 2: Add calendar cleanup to announcement deletion**

In `delete_announcement`, before `await db.delete(ann)`:

```python
    # Remove linked calendar events
    from app.models.event import Event
    event_result = await db.execute(
        select(Event).where(
            Event.title.startswith("📢 "),
            Event.creator_id == ann.author_id,
            Event.start_at == ann.created_at,
        )
    )
    linked_event = event_result.scalar_one_or_none()
    if linked_event:
        if linked_event.google_event_id:
            try:
                from app.services.google_calendar import delete_gcal_event
                if current_user.google_refresh_token:
                    await delete_gcal_event(current_user.google_refresh_token, linked_event.google_event_id)
            except Exception:
                pass
        await db.delete(linked_event)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/announcements.py
git commit -m "feat: auto-sync announcements with expires_at to Google Calendar"
```

---

## Chunk 4: Frontend — API Client, Service Worker, Feed Panel

### Task 9: Add API client methods + service worker

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/public/sw.js`

- [ ] **Step 1: Add API methods to client.ts**

Add to the `api` object in `frontend/src/api/client.ts`:

```typescript
// Announcements
announcements: {
  create: (data: Record<string, unknown>) =>
    request('/announcements/', { method: 'POST', body: JSON.stringify(data) }),
  list: (params?: Record<string, string>) =>
    request(`/announcements/?${new URLSearchParams(params)}`),
  get: (id: string) => request(`/announcements/${id}`),
  update: (id: string, data: Record<string, unknown>) =>
    request(`/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request(`/announcements/${id}`, { method: 'DELETE' }),
  markRead: (id: string) =>
    request(`/announcements/${id}/read`, { method: 'POST' }),
},

// Feed
feed: {
  list: (params?: Record<string, string>) =>
    request(`/feed/?${new URLSearchParams(params)}`),
},

// Push
push: {
  subscribe: (data: Record<string, string>) =>
    request('/push/subscribe', { method: 'POST', body: JSON.stringify(data) }),
  unsubscribe: () =>
    request('/push/subscribe', { method: 'DELETE' }),
  vapidKey: () => request('/push/vapid-key'),
},
```

- [ ] **Step 2: Create service worker**

Create `frontend/public/sw.js`:

```javascript
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
    tag: data.type || 'notification',
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'glocal30Hub', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts frontend/public/sw.js
git commit -m "feat: add announcement/feed/push API client + service worker"
```

---

### Task 10: Create FeedItem component

**Files:**
- Create: `frontend/src/components/FeedItem.tsx`

- [ ] **Step 1: Create FeedItem component**

Create `frontend/src/components/FeedItem.tsx`:

```tsx
import { api } from '../api/client'

interface FeedItemData {
  type: 'announcement' | 'comment' | 'task' | 'daily' | 'attendance'
  id: string
  title?: string
  body?: string
  author?: { id: string; name: string } | null
  pinned?: boolean
  is_read?: boolean
  target?: { type: string; id: string }
  created_at: string
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  announcement: { icon: '📢', label: '공지', color: '#f59e0b' },
  comment: { icon: '💬', label: '댓글', color: '#6366f1' },
  task: { icon: '✅', label: '태스크', color: '#10b981' },
  daily: { icon: '📝', label: '데일리', color: '#3b82f6' },
  attendance: { icon: '🕐', label: '출결', color: '#8b5cf6' },
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

export default function FeedItem({ item, onRead }: { item: FeedItemData; onRead?: () => void }) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.daily

  const handleClick = async () => {
    if (item.type === 'announcement' && !item.is_read) {
      try {
        await api.announcements.markRead(item.id)
        onRead?.()
      } catch {}
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f1f5f9',
        cursor: item.type === 'announcement' ? 'pointer' : 'default',
        background: item.type === 'announcement' && !item.is_read ? '#fffbeb' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{config.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: config.color,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {config.label}
            </span>
            {item.pinned && (
              <span style={{
                fontSize: 9,
                background: '#fef3c7',
                color: '#92400e',
                padding: '1px 5px',
                borderRadius: 4,
                fontWeight: 600,
              }}>
                PIN
              </span>
            )}
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto', flexShrink: 0 }}>
              {timeAgo(item.created_at)}
            </span>
          </div>
          {item.title && (
            <div style={{
              fontSize: 13,
              fontWeight: item.type === 'announcement' && !item.is_read ? 600 : 400,
              color: '#1e293b',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {item.title}
            </div>
          )}
          {item.body && (
            <div style={{
              fontSize: 12,
              color: '#64748b',
              lineHeight: 1.3,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {item.body}
            </div>
          )}
          {item.author && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {item.author.name}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export type { FeedItemData }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FeedItem.tsx
git commit -m "feat: add FeedItem component with type-based rendering"
```

---

### Task 11: Create AnnouncementForm component

**Files:**
- Create: `frontend/src/components/AnnouncementForm.tsx`

- [ ] **Step 1: Create AnnouncementForm**

Create `frontend/src/components/AnnouncementForm.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface Props {
  onCreated: () => void
  onCancel: () => void
}

export default function AnnouncementForm({ onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('everyone')
  const [projectId, setProjectId] = useState('')
  const [pinned, setPinned] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (audience === 'project') {
      api.projects.list().then((res: any) => setProjects(res.data || []))
    }
  }, [audience])

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) return
    setSubmitting(true)
    try {
      const data: Record<string, unknown> = { title, body, audience, pinned }
      if (audience === 'project' && projectId) data.project_id = projectId
      if (expiresAt) data.expires_at = new Date(expiresAt).toISOString()
      await api.announcements.create(data)
      onCreated()
    } catch (err) {
      console.error('Failed to create announcement:', err)
      alert('공지 작성에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '6px 8px',
    fontSize: 13,
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      padding: 12,
      borderBottom: '2px solid #e2e8f0',
      background: '#f8fafc',
    }}>
      <input
        placeholder="공지 제목"
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ ...inputStyle, fontWeight: 600, marginBottom: 6 }}
      />
      <textarea
        placeholder="공지 내용"
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        style={{ ...inputStyle, marginBottom: 6, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <select
          value={audience}
          onChange={e => setAudience(e.target.value)}
          style={{ ...inputStyle, width: 'auto', flex: 1 }}
        >
          <option value="everyone">전체</option>
          <option value="professors">교수</option>
          <option value="students">학생</option>
          <option value="project">프로젝트</option>
        </select>
        {audience === 'project' && (
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            style={{ ...inputStyle, width: 'auto', flex: 1 }}
          >
            <option value="">프로젝트 선택</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
          상단 고정
        </label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={e => setExpiresAt(e.target.value)}
          placeholder="만료일"
          style={{ ...inputStyle, width: 'auto', flex: 1 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{
          padding: '5px 12px', fontSize: 12, border: '1px solid #e2e8f0',
          borderRadius: 6, background: '#fff', cursor: 'pointer',
        }}>
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !body.trim()}
          style={{
            padding: '5px 12px', fontSize: 12, border: 'none',
            borderRadius: 6, background: '#4f46e5', color: '#fff',
            cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? '작성 중...' : '공지 작성'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AnnouncementForm.tsx
git commit -m "feat: add AnnouncementForm inline component for feed panel"
```

---

### Task 12: Create FeedPanel component

**Files:**
- Create: `frontend/src/components/FeedPanel.tsx`

- [ ] **Step 1: Create FeedPanel**

Create `frontend/src/components/FeedPanel.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole, isPrivileged } from '../contexts/RoleContext'
import { api } from '../api/client'
import FeedItem, { type FeedItemData } from './FeedItem'
import AnnouncementForm from './AnnouncementForm'

type FilterTab = 'all' | 'announcement' | 'activity'

const TAB_TYPE_MAP: Record<FilterTab, string | undefined> = {
  all: undefined,
  announcement: 'announcement',
  activity: 'comment,task,daily,attendance',
}

export default function FeedPanel({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { currentRole } = useRole()
  const [tab, setTab] = useState<FilterTab>('all')
  const [myOnly, setMyOnly] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [pinned, setPinned] = useState<FeedItemData[]>([])
  const [items, setItems] = useState<FeedItemData[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchFeed = useCallback(async (reset = false) => {
    setLoading(true)
    try {
      const params: Record<string, string> = { limit: '20' }
      if (TAB_TYPE_MAP[tab]) params.type = TAB_TYPE_MAP[tab]!
      if (myOnly) params.my = 'true'
      if (!reset && cursor) params.cursor = cursor

      const res = await api.feed.list(params)
      if (reset) {
        setPinned(res.pinned || [])
        setItems(res.items || [])
      } else {
        setItems(prev => [...prev, ...(res.items || [])])
      }
      setCursor(res.next_cursor || null)
      setHasMore(res.has_more || false)
    } catch (err) {
      console.error('Feed fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [tab, myOnly, cursor])

  // Reload on tab/filter change
  useEffect(() => {
    setCursor(null)
    fetchFeed(true)
  }, [tab, myOnly])

  // Polling every 30s (only when visible)
  useEffect(() => {
    if (collapsed) return
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setCursor(null)
        fetchFeed(true)
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [collapsed, tab, myOnly])

  const handleScroll = () => {
    if (!scrollRef.current || !hasMore || loading) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchFeed(false)
    }
  }

  if (collapsed) {
    return (
      <div
        onClick={onToggle}
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          background: '#4f46e5',
          color: '#fff',
          padding: '12px 6px',
          borderRadius: '8px 0 0 8px',
          cursor: 'pointer',
          writingMode: 'vertical-rl',
          fontSize: 12,
          fontWeight: 600,
          zIndex: 100,
        }}
      >
        피드 ▶
      </div>
    )
  }

  const tabStyle = (active: boolean) => ({
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    border: 'none',
    borderBottom: active ? '2px solid #4f46e5' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#4f46e5' : '#64748b',
    cursor: 'pointer',
  })

  return (
    <div style={{
      width: 320,
      height: '100%',
      borderLeft: '1px solid #e2e8f0',
      background: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>피드</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, color: '#64748b' }}>
            <input
              type="checkbox"
              checked={myOnly}
              onChange={e => setMyOnly(e.target.checked)}
              style={{ width: 14, height: 14 }}
            />
            내 피드
          </label>
          <button
            onClick={onToggle}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 16, color: '#94a3b8', padding: 2,
            }}
          >
            ◀
          </button>
        </div>
      </div>

      {/* New announcement button */}
      {isPrivileged(currentRole) && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            margin: '8px 12px', padding: '6px 12px', fontSize: 12, fontWeight: 600,
            border: '1px dashed #c7d2fe', borderRadius: 8, background: '#eef2ff',
            color: '#4f46e5', cursor: 'pointer',
          }}
        >
          + 새 공지 작성
        </button>
      )}

      {/* Announcement form */}
      {showForm && (
        <AnnouncementForm
          onCreated={() => { setShowForm(false); fetchFeed(true) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        <button onClick={() => setTab('all')} style={tabStyle(tab === 'all')}>전체</button>
        <button onClick={() => setTab('announcement')} style={tabStyle(tab === 'announcement')}>공지</button>
        <button onClick={() => setTab('activity')} style={tabStyle(tab === 'activity')}>활동</button>
      </div>

      {/* Feed items */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {/* Pinned announcements */}
        {pinned.length > 0 && (
          <div style={{ borderBottom: '2px solid #fef3c7' }}>
            {pinned.map(item => (
              <FeedItem key={`pin-${item.id}`} item={item} onRead={() => fetchFeed(true)} />
            ))}
          </div>
        )}

        {/* Regular items */}
        {items.map(item => (
          <FeedItem key={`${item.type}-${item.id}`} item={item} onRead={() => fetchFeed(true)} />
        ))}

        {loading && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            로딩 중...
          </div>
        )}

        {!loading && items.length === 0 && pinned.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
            피드가 비어있습니다
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FeedPanel.tsx
git commit -m "feat: add FeedPanel component with filter tabs, infinite scroll, announcement form"
```

---

### Task 13: Integrate FeedPanel into Layout + Push subscription

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Read current Layout.tsx structure**

Read `frontend/src/components/Layout.tsx` to identify:
- Where the main content area is rendered
- The outer flex container structure
- Where to add the FeedPanel alongside content

- [ ] **Step 2: Add FeedPanel to Layout**

Key changes to `Layout.tsx`:

1. Import FeedPanel:
```tsx
import FeedPanel from './FeedPanel'
```

2. Add state for panel collapse:
```tsx
const [feedCollapsed, setFeedCollapsed] = useState(false)
```

3. Add push subscription setup (in a useEffect):
```tsx
useEffect(() => {
  async function setupPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      const vapidRes = await api.push.vapidKey()
      if (!vapidRes.publicKey) return

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidRes.publicKey,
      })
      const subJson = sub.toJSON()
      await api.push.subscribe({
        endpoint: subJson.endpoint!,
        p256dh: subJson.keys!.p256dh,
        auth: subJson.keys!.auth,
      })
    } catch (err) {
      console.error('Push setup failed:', err)
    }
  }
  setupPush()
}, [])
```

4. Wrap main content area to include FeedPanel on the right:
```tsx
<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
  <div style={{ flex: 1, overflow: 'auto' }}>
    {/* existing page content (Outlet) */}
  </div>
  <FeedPanel
    collapsed={feedCollapsed}
    onToggle={() => setFeedCollapsed(c => !c)}
  />
</div>
```

5. Add responsive: hide panel on mobile via media query or width check.

- [ ] **Step 3: Test in browser**

```bash
cd frontend && npm run dev -- --host 0.0.0.0
```

Open `http://localhost:3000` — verify:
- Feed panel appears on the right
- Collapse/expand toggle works
- Filter tabs switch content
- "새 공지 작성" appears for admin/professor
- Announcements show with pinned on top

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: integrate FeedPanel into Layout with push subscription setup"
```

---

## Chunk 5: VAPID Key Generation + Environment Setup + Final Verification

### Task 14: Generate VAPID keys and update .env

- [ ] **Step 1: Generate VAPID key pair**

```bash
cd backend
python -c "
from pywebpush import webpush
from py_vapid import Vapid
v = Vapid()
v.generate_keys()
print('VAPID_PRIVATE_KEY=' + v.private_pem().decode().replace('\n','\\\\n'))
print('VAPID_PUBLIC_KEY=' + v.public_key_urlsafe_base64())
"
```

Or use `openssl`:
```bash
openssl ecparam -genkey -name prime256v1 -out vapid_private.pem
openssl ec -in vapid_private.pem -pubout -outform DER | tail -c 65 | base64 | tr '/+' '_-' | tr -d '='
```

- [ ] **Step 2: Add to .env**

```
VAPID_PRIVATE_KEY=<generated private key>
VAPID_PUBLIC_KEY=<generated public key>
VAPID_SUBJECT=mailto:jsdavid88@g.dongseo.ac.kr
```

- [ ] **Step 3: Verify .env is in .gitignore**

```bash
grep ".env" .gitignore
```

Expected: `.env` is listed. Do NOT commit the keys.

---

### Task 15: End-to-end verification

- [ ] **Step 1: Run backend**

```bash
cd backend
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- [ ] **Step 2: Run frontend**

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

- [ ] **Step 3: Test announcement flow**

1. Login as admin via dev-login
2. Feed panel should appear on the right
3. Click "새 공지 작성"
4. Fill in title, body, audience=전체, pinned=true
5. Submit → announcement appears in feed with PIN badge
6. Login as student in another browser → announcement visible in their feed
7. Click announcement → turns read (background changes)

- [ ] **Step 4: Test push notification**

1. Browser should prompt for notification permission on login
2. Allow → subscription saved to DB
3. When new announcement is created, push notification should appear

- [ ] **Step 5: Test feed filters**

1. Click "공지" tab → only announcements
2. Click "활동" tab → comments, tasks, daily, attendance
3. Toggle "내 피드" → filters to user-related items
4. Scroll to bottom → infinite scroll loads more

- [ ] **Step 6: Test task calendar sync**

1. Create a task with due_date in a project
2. Check Calendar page → Event should appear
3. If Google Calendar is connected → verify event appears there too
4. Update due_date → Event updates
5. Clear due_date → Event removed

- [ ] **Step 7: Test announcement calendar sync**

1. Create announcement with expires_at set
2. Check Calendar page → Event should appear with 📢 prefix
3. Delete announcement → Event removed

- [ ] **Step 8: Final commit**

```bash
git add -A
git status  # verify no secrets
git commit -m "feat: complete announcement system + feed panel + web push + calendar sync"
```
