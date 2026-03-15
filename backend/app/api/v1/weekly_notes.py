from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.report import ReportSnapshot, ReportScopeType, ReportType
from app.models.user import User

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class WeeklyNoteCreate(BaseModel):
    week_start: date
    content: str


class WeeklyNoteResponse(BaseModel):
    id: str
    week_start: date
    week_end: date
    content: str
    created_at: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/", status_code=201)
async def save_weekly_note(
    body: WeeklyNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save or update weekly meeting notes for a given week.

    Uses ReportSnapshot with report_type='weekly'. If a note already exists
    for the same week and user, it is updated (upsert).
    """
    week_end = body.week_start + timedelta(days=6)

    # Check if a note already exists for this week by this user
    result = await db.execute(
        select(ReportSnapshot).where(
            ReportSnapshot.report_type == ReportType.weekly,
            ReportSnapshot.scope_type == ReportScopeType.professor,
            ReportSnapshot.generated_by == current_user.id,
            ReportSnapshot.period_start == body.week_start,
        )
    )
    existing = result.scalar_one_or_none()

    if existing is not None:
        existing.content = {"notes": body.content}
        existing.period_end = week_end
        await db.commit()
        await db.refresh(existing)
        return {
            "id": str(existing.id),
            "week_start": str(existing.period_start),
            "week_end": str(existing.period_end),
            "content": existing.content.get("notes", ""),
            "created_at": str(existing.created_at),
        }

    snapshot = ReportSnapshot(
        report_type=ReportType.weekly,
        title=f"Weekly Notes - {body.week_start}",
        scope_type=ReportScopeType.professor,
        scope_id=None,
        period_start=body.week_start,
        period_end=week_end,
        content={"notes": body.content},
        generated_by=current_user.id,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    return {
        "id": str(snapshot.id),
        "week_start": str(snapshot.period_start),
        "week_end": str(snapshot.period_end),
        "content": snapshot.content.get("notes", ""),
        "created_at": str(snapshot.created_at),
    }


@router.get("/")
async def get_weekly_note(
    week_start: date = Query(..., description="Monday of the target week (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve weekly meeting notes for a given week."""
    result = await db.execute(
        select(ReportSnapshot).where(
            ReportSnapshot.report_type == ReportType.weekly,
            ReportSnapshot.scope_type == ReportScopeType.professor,
            ReportSnapshot.generated_by == current_user.id,
            ReportSnapshot.period_start == week_start,
        )
    )
    snapshot = result.scalar_one_or_none()

    if snapshot is None:
        return {
            "id": None,
            "week_start": str(week_start),
            "week_end": str(week_start + timedelta(days=6)),
            "content": "",
            "created_at": None,
        }

    return {
        "id": str(snapshot.id),
        "week_start": str(snapshot.period_start),
        "week_end": str(snapshot.period_end),
        "content": snapshot.content.get("notes", ""),
        "created_at": str(snapshot.created_at),
    }
