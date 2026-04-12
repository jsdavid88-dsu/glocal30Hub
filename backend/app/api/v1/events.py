import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_project_membership
from app.models.daily import BlockVisibility
from app.models.event import Event, EventSource, EventType
from app.models.project import ProjectMember
from app.models.user import User, UserRole

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class EventCreate(BaseModel):
    title: str = Field(..., max_length=255)
    description: str | None = None
    event_type: EventType
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    visibility: BlockVisibility = BlockVisibility.internal
    source: EventSource = EventSource.manual


class EventUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    description: str | None = None
    event_type: EventType | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    visibility: BlockVisibility | None = None


class EventResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    event_type: EventType
    start_at: datetime
    end_at: datetime
    all_day: bool
    creator_id: uuid.UUID
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    visibility: BlockVisibility
    source: EventSource
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/")
async def list_events(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """List events with optional date range filtering."""
    query = select(Event)

    if start_date is not None:
        query = query.where(Event.end_at >= start_date)
    if end_date is not None:
        query = query.where(Event.start_at <= end_date)

    # Visibility filtering for student/external users
    if current_user.role not in (UserRole.admin, UserRole.professor):
        user_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == current_user.id
        )
        query = query.where(
            (Event.creator_id == current_user.id)
            | (Event.project_id.in_(user_project_ids))
            | (Event.visibility == BlockVisibility.internal)
        )

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(Event.start_at.asc())
    result = await db.execute(query)
    events = result.scalars().all()

    return {
        "data": [EventResponse.model_validate(e) for e in events],
        "meta": {"page": page, "limit": limit, "total": total},
    }


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single event by ID."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Visibility check for student/external users
    if current_user.role not in (UserRole.admin, UserRole.professor):
        if event.creator_id != current_user.id and event.visibility != BlockVisibility.internal:
            # Check project membership if event has a project
            if event.project_id is not None:
                pm_result = await db.execute(
                    select(ProjectMember).where(
                        ProjectMember.project_id == event.project_id,
                        ProjectMember.user_id == current_user.id,
                    )
                )
                if pm_result.scalar_one_or_none() is None:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have access to this event",
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have access to this event",
                )

    return event


@router.post("/", response_model=EventResponse, status_code=201)
async def create_event(
    body: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new event."""
    if body.project_id is not None:
        await require_project_membership(body.project_id, current_user, db)

    if body.end_at < body.start_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_at must be >= start_at",
        )

    event = Event(
        title=body.title,
        description=body.description,
        event_type=body.event_type,
        start_at=body.start_at,
        end_at=body.end_at,
        all_day=body.all_day,
        creator_id=current_user.id,
        project_id=body.project_id,
        task_id=body.task_id,
        visibility=body.visibility,
        source=body.source,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    # Google Calendar auto-sync
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

    return event


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: uuid.UUID,
    body: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an event. Only the creator can update."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the event creator can update this event",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(event, field, value)

    # Validate end >= start after update
    if event.end_at < event.start_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_at must be >= start_at",
        )

    await db.commit()
    await db.refresh(event)

    if (
        settings.GOOGLE_CALENDAR_ENABLED
        and event.google_event_id
        and current_user.google_refresh_token
    ):
        from app.services.google_calendar import update_gcal_event
        await update_gcal_event(
            current_user.google_refresh_token, event.google_event_id, event
        )

    return event


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an event. Only the creator can delete."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the event creator can delete this event",
        )

    if (
        settings.GOOGLE_CALENDAR_ENABLED
        and event.google_event_id
        and current_user.google_refresh_token
    ):
        from app.services.google_calendar import delete_gcal_event
        await delete_gcal_event(
            current_user.google_refresh_token, event.google_event_id
        )

    await db.delete(event)
    await db.commit()
