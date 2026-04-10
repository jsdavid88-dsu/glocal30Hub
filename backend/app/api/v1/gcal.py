"""Google Calendar sync API endpoints."""
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
    return {
        "connected": current_user.google_calendar_connected,
    }


@router.post("/disconnect")
async def gcal_disconnect(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    current_user.google_refresh_token = None
    current_user.google_calendar_connected = False
    await db.commit()
    return {"message": "Google Calendar 연결이 해제되었습니다."}


@router.post("/sync-push")
async def gcal_sync_push(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if not current_user.google_refresh_token:
        raise HTTPException(400, "Google Calendar가 연결되지 않았습니다.")

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

        existing = await db.execute(
            select(Event).where(Event.google_event_id == gcal_id)
        )
        if existing.scalar_one_or_none():
            continue

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
