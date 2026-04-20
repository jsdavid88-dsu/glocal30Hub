import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.announcement import Announcement, AnnouncementAudience, AnnouncementRead
from app.models.notification import NotificationType
from app.models.project import ProjectMember, ProjectMemberRole
from app.models.user import User, UserRole, UserStatus
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementListResponse,
    AnnouncementResponse,
    AnnouncementUpdate,
)
from app.models.notification import Notification
from app.services.web_push import send_push_to_users

router = APIRouter()


async def _check_create_permission(
    audience: AnnouncementAudience,
    project_id: uuid.UUID | None,
    current_user: User,
    db: AsyncSession,
) -> None:
    """Validate that the current user can create an announcement for the given audience."""
    if audience == AnnouncementAudience.everyone:
        if current_user.role != UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin can create announcements for everyone",
            )
    elif audience == AnnouncementAudience.professors:
        if current_user.role != UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin can create announcements for professors",
            )
    elif audience == AnnouncementAudience.students:
        if current_user.role not in (UserRole.admin, UserRole.professor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin or professor can create announcements for students",
            )
    elif audience == AnnouncementAudience.project:
        if project_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="project_id is required for project audience",
            )
        if current_user.role == UserRole.admin:
            return
        # Check project lead/manager
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
                ProjectMember.project_role.in_([ProjectMemberRole.lead, ProjectMemberRole.manager]),
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only project lead, manager, or admin can create project announcements",
            )


async def _get_target_user_ids(
    audience: AnnouncementAudience,
    project_id: uuid.UUID | None,
    db: AsyncSession,
) -> list[uuid.UUID]:
    """Determine target user IDs based on audience type."""
    if audience == AnnouncementAudience.everyone:
        result = await db.execute(
            select(User.id).where(User.status == UserStatus.active)
        )
    elif audience == AnnouncementAudience.professors:
        result = await db.execute(
            select(User.id).where(
                User.status == UserStatus.active,
                User.role.in_([UserRole.professor, UserRole.admin]),
            )
        )
    elif audience == AnnouncementAudience.students:
        result = await db.execute(
            select(User.id).where(
                User.status == UserStatus.active,
                User.role == UserRole.student,
            )
        )
    elif audience == AnnouncementAudience.project:
        result = await db.execute(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == project_id
            )
        )
    else:
        return []

    return list(result.scalars().all())


def _build_visibility_filter(current_user: User):
    """Build SQLAlchemy filter clauses for announcement visibility."""
    from sqlalchemy import or_

    filters = []
    # Everyone audience is visible to all
    filters.append(Announcement.audience == AnnouncementAudience.everyone)

    if current_user.role in (UserRole.admin, UserRole.professor):
        filters.append(Announcement.audience == AnnouncementAudience.professors)

    if current_user.role == UserRole.student:
        filters.append(Announcement.audience == AnnouncementAudience.students)

    # Project announcements: visible if user is a member
    # This is handled by a subquery
    member_project_ids = select(ProjectMember.project_id).where(
        ProjectMember.user_id == current_user.id
    )
    filters.append(
        (Announcement.audience == AnnouncementAudience.project)
        & (Announcement.project_id.in_(member_project_ids))
    )

    return or_(*filters)


async def _enrich_response(
    announcement: Announcement,
    current_user: User,
    db: AsyncSession,
) -> AnnouncementResponse:
    """Build AnnouncementResponse with read stats and is_read status."""
    # Read count
    read_count_result = await db.execute(
        select(func.count()).where(
            AnnouncementRead.announcement_id == announcement.id
        )
    )
    read_count = read_count_result.scalar() or 0

    # Total target count
    target_ids = await _get_target_user_ids(
        announcement.audience, announcement.project_id, db
    )
    total_target = len(target_ids)

    # Is read by current user
    is_read_result = await db.execute(
        select(AnnouncementRead.id).where(
            AnnouncementRead.announcement_id == announcement.id,
            AnnouncementRead.user_id == current_user.id,
        )
    )
    is_read = is_read_result.scalar_one_or_none() is not None

    resp = AnnouncementResponse.model_validate(announcement)
    resp.read_count = read_count
    resp.total_target = total_target
    resp.is_read = is_read
    return resp


@router.post("/", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    body: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an announcement with audience-based permissions and notifications."""
    await _check_create_permission(body.audience, body.project_id, current_user, db)

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

    # Determine targets and create notifications (batch, no per-notification commit)
    target_ids = await _get_target_user_ids(body.audience, body.project_id, db)
    for user_id in target_ids:
        if user_id == current_user.id:
            continue
        notification = Notification(
            user_id=user_id,
            notification_type=NotificationType.announcement,
            title=f"New announcement: {body.title}",
            body=body.body[:200] if body.body else None,
            target_type="announcement",
            target_id=announcement.id,
        )
        db.add(notification)

    await db.commit()
    await db.refresh(announcement, attribute_names=["author", "reads"])

    # Send web push to target users (best-effort, after commit)
    push_targets = [uid for uid in target_ids if uid != current_user.id]
    await send_push_to_users(
        db, push_targets,
        title=f"\U0001f4e2 {body.title}",
        body=body.body[:100] if body.body else "",
        url="/",
        push_type="announcement",
    )

    return await _enrich_response(announcement, current_user, db)


@router.get("/", response_model=AnnouncementListResponse)
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    cursor: str | None = Query(None, description="ISO datetime cursor for pagination"),
    limit: int = Query(20, ge=1, le=100),
):
    """List announcements visible to the current user with cursor pagination."""
    now = datetime.now(timezone.utc)

    query = (
        select(Announcement)
        .options(selectinload(Announcement.author))
        .where(_build_visibility_filter(current_user))
        .where(
            (Announcement.expires_at.is_(None)) | (Announcement.expires_at >= now)
        )
    )

    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid cursor format",
            )
        query = query.where(Announcement.created_at < cursor_dt)

    query = query.order_by(
        Announcement.pinned.desc(),
        Announcement.created_at.desc(),
    ).limit(limit + 1)

    result = await db.execute(query)
    announcements = list(result.scalars().all())

    has_more = len(announcements) > limit
    if has_more:
        announcements = announcements[:limit]

    # Batch read status for current user
    ann_ids = [a.id for a in announcements]
    read_set: set[uuid.UUID] = set()
    if ann_ids:
        read_result = await db.execute(
            select(AnnouncementRead.announcement_id).where(
                AnnouncementRead.announcement_id.in_(ann_ids),
                AnnouncementRead.user_id == current_user.id,
            )
        )
        read_set = set(read_result.scalars().all())

    # Batch read counts
    read_counts: dict[uuid.UUID, int] = {}
    if ann_ids:
        rc_result = await db.execute(
            select(
                AnnouncementRead.announcement_id,
                func.count().label("cnt"),
            )
            .where(AnnouncementRead.announcement_id.in_(ann_ids))
            .group_by(AnnouncementRead.announcement_id)
        )
        for row in rc_result:
            read_counts[row.announcement_id] = row.cnt

    data = []
    for a in announcements:
        resp = AnnouncementResponse.model_validate(a)
        resp.is_read = a.id in read_set
        resp.read_count = read_counts.get(a.id, 0)
        data.append(resp)

    next_cursor = None
    if has_more and announcements:
        next_cursor = announcements[-1].created_at.isoformat()

    return AnnouncementListResponse(data=data, next_cursor=next_cursor, has_more=has_more)


@router.get("/{announcement_id}", response_model=AnnouncementResponse)
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
    announcement = result.scalar_one_or_none()
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    return await _enrich_response(announcement, current_user, db)


@router.patch("/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: uuid.UUID,
    body: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an announcement. Only author or admin can update."""
    result = await db.execute(
        select(Announcement)
        .options(selectinload(Announcement.author))
        .where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    if announcement.author_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only author or admin can update this announcement",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(announcement, field, value)

    await db.commit()
    await db.refresh(announcement, attribute_names=["author", "reads"])

    return await _enrich_response(announcement, current_user, db)


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an announcement. Only author or admin can delete."""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    if announcement.author_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only author or admin can delete this announcement",
        )

    await db.delete(announcement)
    await db.commit()


@router.post("/{announcement_id}/read")
async def mark_as_read(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an announcement as read. Idempotent — returns 200 if already read."""
    # Verify announcement exists
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    # Check if already read
    result = await db.execute(
        select(AnnouncementRead).where(
            AnnouncementRead.announcement_id == announcement_id,
            AnnouncementRead.user_id == current_user.id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return {"announcement_id": announcement_id, "read_at": existing.read_at}

    read_record = AnnouncementRead(
        announcement_id=announcement_id,
        user_id=current_user.id,
    )
    db.add(read_record)
    await db.commit()
    await db.refresh(read_record)

    return {"announcement_id": announcement_id, "read_at": read_record.read_at}
