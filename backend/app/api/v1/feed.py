"""Unified feed endpoint — merges 5 data sources into a single time-ordered stream."""

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.announcement import Announcement, AnnouncementAudience, AnnouncementRead
from app.models.attendance import Attendance
from app.models.comment import Comment
from app.models.daily import BlockVisibility, DailyBlock, DailyLog
from app.models.project import ProjectMember
from app.models.task import Task, TaskAssignee
from app.models.user import User, UserRole

router = APIRouter()

VALID_TYPES = {"announcement", "comment", "task", "daily", "attendance"}


def _author_dict(user: User | None) -> dict[str, Any] | None:
    if user is None:
        return None
    return {"id": str(user.id), "name": user.name}


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Per-source query helpers
# ---------------------------------------------------------------------------

async def _query_announcements(
    db: AsyncSession,
    current_user: User,
    cursor_dt: datetime | None,
    limit: int,
    my_only: bool,
) -> tuple[list[dict], list[dict]]:
    """Return (pinned_items, regular_items). Pinned announcements are separated."""
    now = datetime.now(timezone.utc)

    # Build audience visibility filter (same logic as announcements list endpoint)
    filters = [Announcement.audience == AnnouncementAudience.everyone]

    if current_user.role in (UserRole.admin, UserRole.professor):
        filters.append(Announcement.audience == AnnouncementAudience.professors)

    if current_user.role == UserRole.student:
        filters.append(Announcement.audience == AnnouncementAudience.students)

    member_project_ids = select(ProjectMember.project_id).where(
        ProjectMember.user_id == current_user.id
    )
    filters.append(
        (Announcement.audience == AnnouncementAudience.project)
        & (Announcement.project_id.in_(member_project_ids))
    )

    visibility_filter = or_(*filters)

    base_query = (
        select(Announcement)
        .options(selectinload(Announcement.author))
        .where(visibility_filter)
        .where(
            (Announcement.expires_at.is_(None)) | (Announcement.expires_at >= now)
        )
    )

    if my_only:
        base_query = base_query.where(Announcement.author_id == current_user.id)

    # --- Pinned (always returned, no cursor filtering) ---
    pinned_query = (
        base_query
        .where(Announcement.pinned.is_(True))
        .order_by(Announcement.created_at.desc())
        .limit(10)
    )
    pinned_result = await db.execute(pinned_query)
    pinned_rows = list(pinned_result.scalars().all())

    # Batch read status for pinned
    pinned_ids = [a.id for a in pinned_rows]
    pinned_read_set: set[uuid.UUID] = set()
    if pinned_ids:
        rr = await db.execute(
            select(AnnouncementRead.announcement_id).where(
                AnnouncementRead.announcement_id.in_(pinned_ids),
                AnnouncementRead.user_id == current_user.id,
            )
        )
        pinned_read_set = set(rr.scalars().all())

    pinned_items = [
        {
            "type": "announcement",
            "id": str(a.id),
            "title": a.title,
            "body": a.body[:200] if a.body else "",
            "author": _author_dict(a.author),
            "pinned": True,
            "is_read": a.id in pinned_read_set,
            "created_at": _iso(a.created_at),
        }
        for a in pinned_rows
    ]

    # --- Regular (non-pinned, cursor paginated) ---
    regular_query = (
        base_query
        .where(Announcement.pinned.is_(False))
    )
    if cursor_dt:
        regular_query = regular_query.where(Announcement.created_at < cursor_dt)

    regular_query = (
        regular_query
        .order_by(Announcement.created_at.desc())
        .limit(limit + 1)
    )
    regular_result = await db.execute(regular_query)
    regular_rows = list(regular_result.scalars().all())

    # Batch read status for regular
    regular_ids = [a.id for a in regular_rows]
    regular_read_set: set[uuid.UUID] = set()
    if regular_ids:
        rr = await db.execute(
            select(AnnouncementRead.announcement_id).where(
                AnnouncementRead.announcement_id.in_(regular_ids),
                AnnouncementRead.user_id == current_user.id,
            )
        )
        regular_read_set = set(rr.scalars().all())

    regular_items = [
        {
            "type": "announcement",
            "id": str(a.id),
            "title": a.title,
            "body": a.body[:200] if a.body else "",
            "author": _author_dict(a.author),
            "pinned": False,
            "is_read": a.id in regular_read_set,
            "created_at": _iso(a.created_at),
        }
        for a in regular_rows
    ]

    return pinned_items, regular_items


async def _query_comments(
    db: AsyncSession,
    current_user: User,
    cursor_dt: datetime | None,
    limit: int,
    my_only: bool,
) -> list[dict]:
    """Query comments with visibility filtering through DailyBlock."""
    query = (
        select(Comment, DailyBlock.visibility, DailyBlock.id.label("block_id_col"))
        .join(DailyBlock, Comment.daily_block_id == DailyBlock.id)
        .options(selectinload(Comment.author))
    )

    # Visibility filtering per role
    if current_user.role in (UserRole.admin, UserRole.professor):
        pass  # can see all
    elif current_user.role == UserRole.student:
        # Students see internal + project visibility blocks
        query = query.where(
            DailyBlock.visibility.in_([BlockVisibility.internal, BlockVisibility.project])
        )
    elif current_user.role == UserRole.external:
        # External users see only project visibility blocks
        query = query.where(DailyBlock.visibility == BlockVisibility.project)

    if my_only:
        query = query.where(Comment.author_id == current_user.id)

    if cursor_dt:
        query = query.where(Comment.created_at < cursor_dt)

    query = query.order_by(Comment.created_at.desc()).limit(limit + 1)

    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        comment = row[0]
        block_id = row[2]
        items.append({
            "type": "comment",
            "id": str(comment.id),
            "title": None,
            "body": comment.content[:200] if comment.content else "",
            "author": _author_dict(comment.author),
            "pinned": False,
            "is_read": None,
            "target": {"type": "daily_block", "id": str(block_id)},
            "created_at": _iso(comment.created_at),
        })

    return items


async def _query_tasks(
    db: AsyncSession,
    current_user: User,
    cursor_dt: datetime | None,
    limit: int,
    my_only: bool,
) -> list[dict]:
    """Query task assignments. Uses assigned_at for time ordering."""
    query = (
        select(TaskAssignee)
        .options(
            selectinload(TaskAssignee.task),
            selectinload(TaskAssignee.user),
        )
    )

    # For non-privileged users, only show tasks from projects they are members of
    if current_user.role not in (UserRole.admin, UserRole.professor):
        member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == current_user.id
        )
        query = query.join(Task, TaskAssignee.task_id == Task.id).where(
            Task.project_id.in_(member_project_ids)
        )

    if my_only:
        query = query.where(TaskAssignee.user_id == current_user.id)

    if cursor_dt:
        query = query.where(TaskAssignee.assigned_at < cursor_dt)

    query = query.order_by(TaskAssignee.assigned_at.desc()).limit(limit + 1)

    result = await db.execute(query)
    assignees = list(result.scalars().all())

    items = []
    for ta in assignees:
        task = ta.task
        items.append({
            "type": "task",
            "id": str(ta.id),
            "title": task.title if task else None,
            "body": task.description[:200] if task and task.description else "",
            "author": _author_dict(ta.user),
            "pinned": False,
            "is_read": None,
            "created_at": _iso(ta.assigned_at),
        })

    return items


async def _query_dailylogs(
    db: AsyncSession,
    current_user: User,
    cursor_dt: datetime | None,
    limit: int,
    my_only: bool,
) -> list[dict]:
    """Query daily logs with author info."""
    query = (
        select(DailyLog)
        .options(selectinload(DailyLog.author))
    )

    if my_only:
        query = query.where(DailyLog.author_id == current_user.id)

    if cursor_dt:
        query = query.where(DailyLog.created_at < cursor_dt)

    query = query.order_by(DailyLog.created_at.desc()).limit(limit + 1)

    result = await db.execute(query)
    logs = list(result.scalars().all())

    items = []
    for log in logs:
        items.append({
            "type": "daily",
            "id": str(log.id),
            "title": f"Daily Log — {log.date.isoformat()}",
            "body": "",
            "author": _author_dict(log.author),
            "pinned": False,
            "is_read": None,
            "created_at": _iso(log.created_at),
        })

    return items


async def _query_attendance(
    db: AsyncSession,
    current_user: User,
    cursor_dt: datetime | None,
    limit: int,
    my_only: bool,
) -> list[dict]:
    """Query attendance records. Students/external see only their own."""
    query = (
        select(Attendance)
        .options(selectinload(Attendance.user))
    )

    # Students and external users can only see their own attendance
    if current_user.role in (UserRole.student, UserRole.external) or my_only:
        query = query.where(Attendance.user_id == current_user.id)

    if cursor_dt:
        query = query.where(Attendance.created_at < cursor_dt)

    query = query.order_by(Attendance.created_at.desc()).limit(limit + 1)

    result = await db.execute(query)
    records = list(result.scalars().all())

    items = []
    for att in records:
        check_in_str = _iso(att.check_in) if att.check_in else ""
        items.append({
            "type": "attendance",
            "id": str(att.id),
            "title": f"Attendance — {att.date.isoformat()}",
            "body": f"Check-in: {check_in_str}" if att.check_in else "",
            "author": _author_dict(att.user),
            "pinned": False,
            "is_read": None,
            "created_at": _iso(att.created_at),
        })

    return items


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------

@router.get("/")
async def unified_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    type: str | None = Query(None, description="Filter by type (comma-separated): announcement,comment,task,daily,attendance"),
    my: bool = Query(False, description="Show only user-related items"),
    cursor: str | None = Query(None, description="ISO datetime cursor for pagination"),
    limit: int = Query(20, ge=1, le=50),
):
    """Unified feed merging announcements, comments, tasks, daily logs, and attendance.

    Returns pinned announcements on top, then regular items sorted by created_at desc.
    """
    # Parse requested types
    requested_types = VALID_TYPES
    if type:
        requested_types = set(t.strip() for t in type.split(","))
        invalid = requested_types - VALID_TYPES
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid feed types: {', '.join(invalid)}. Valid: {', '.join(sorted(VALID_TYPES))}",
            )

    # Parse cursor
    cursor_dt: datetime | None = None
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid cursor format. Use ISO 8601 datetime.",
            )

    # Collect items from each source
    pinned_items: list[dict] = []
    all_items: list[dict] = []

    if "announcement" in requested_types:
        pinned, regular = await _query_announcements(db, current_user, cursor_dt, limit, my)
        pinned_items.extend(pinned)
        all_items.extend(regular)

    if "comment" in requested_types:
        comments = await _query_comments(db, current_user, cursor_dt, limit, my)
        all_items.extend(comments)

    if "task" in requested_types:
        tasks = await _query_tasks(db, current_user, cursor_dt, limit, my)
        all_items.extend(tasks)

    if "daily" in requested_types:
        dailies = await _query_dailylogs(db, current_user, cursor_dt, limit, my)
        all_items.extend(dailies)

    if "attendance" in requested_types:
        attendance = await _query_attendance(db, current_user, cursor_dt, limit, my)
        all_items.extend(attendance)

    # Sort all items by created_at descending
    all_items.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    # Check has_more and trim to limit
    has_more = len(all_items) > limit
    items = all_items[:limit]

    # Determine next cursor from last item
    next_cursor: str | None = None
    if has_more and items:
        next_cursor = items[-1]["created_at"]

    return {
        "pinned": pinned_items,
        "items": items,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }
