import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.daily import DailyLog
from app.models.project import Project, ProjectMember
from app.models.report import ReportSnapshot, ReportScopeType, ReportType
from app.models.task import Task, TaskAssignee, TaskStatus
from app.models.user import User, UserRole

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


# ---------------------------------------------------------------------------
# Weekly summary (aggregated from daily logs, tasks, projects)
# ---------------------------------------------------------------------------


class CarryoverRequest(BaseModel):
    week_start: date


@router.get("/summary")
async def get_weekly_summary(
    week_start: date = Query(..., description="Monday of the target week (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Generate a structured weekly summary from daily logs and tasks.

    Aggregates per-student task counts (filtered by due_date within the week)
    and daily log counts for the given week (week_start to week_start + 6 days).

    Returns ``{ data: [...] }`` where each entry contains:
    - student_id, student_name, project
    - done, in_progress, not_started (task counts by status)
    - daily_count (number of daily logs submitted that week)
    """
    week_end = week_start + timedelta(days=6)

    # 1) Fetch all students
    students_result = await db.execute(
        select(User).where(User.role == UserRole.student)
    )
    students = students_result.scalars().all()
    student_ids = [s.id for s in students]

    if not student_ids:
        return {"data": []}

    # 2) Build a mapping: student_id -> first project name
    # We pick the first project membership alphabetically for display purposes.
    pm_query = (
        select(ProjectMember.user_id, Project.name)
        .join(Project, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id.in_(student_ids))
        .order_by(Project.name)
    )
    pm_result = await db.execute(pm_query)
    student_project: dict[uuid.UUID, str] = {}
    for row in pm_result.all():
        # Keep only the first (alphabetically) project per student
        if row.user_id not in student_project:
            student_project[row.user_id] = row.name

    # 3) Count tasks per student grouped by status, filtered to week range
    task_query = (
        select(
            TaskAssignee.user_id,
            Task.status,
            func.count().label("cnt"),
        )
        .join(Task, TaskAssignee.task_id == Task.id)
        .where(
            TaskAssignee.user_id.in_(student_ids),
            Task.due_date >= week_start,
            Task.due_date <= week_end,
        )
        .group_by(TaskAssignee.user_id, Task.status)
    )
    task_result = await db.execute(task_query)
    task_rows = task_result.all()

    task_by_student: dict[uuid.UUID, dict[str, int]] = {}
    for row in task_rows:
        stats = task_by_student.setdefault(
            row.user_id, {"done": 0, "in_progress": 0, "not_started": 0}
        )
        status_key = row.status.value if hasattr(row.status, "value") else row.status
        if status_key == "done":
            stats["done"] += row.cnt
        elif status_key == "in_progress":
            stats["in_progress"] += row.cnt
        elif status_key in ("todo", "not_started", "blocked", "review"):
            stats["not_started"] += row.cnt

    # 4) Count daily logs per student for the week
    log_count_query = (
        select(DailyLog.author_id, func.count().label("cnt"))
        .where(
            DailyLog.author_id.in_(student_ids),
            DailyLog.date >= week_start,
            DailyLog.date <= week_end,
        )
        .group_by(DailyLog.author_id)
    )
    log_result = await db.execute(log_count_query)
    daily_counts: dict[uuid.UUID, int] = {
        row.author_id: row.cnt for row in log_result.all()
    }

    # 5) Build response
    data = []
    for student in students:
        ts = task_by_student.get(
            student.id, {"done": 0, "in_progress": 0, "not_started": 0}
        )
        data.append({
            "student_id": str(student.id),
            "student_name": student.name,
            "project": student_project.get(student.id),
            "done": ts["done"],
            "in_progress": ts["in_progress"],
            "not_started": ts["not_started"],
            "daily_count": daily_counts.get(student.id, 0),
        })

    return {"data": data}


@router.post("/carryover")
async def carryover_tasks(
    body: CarryoverRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Carry over incomplete tasks to the next week.

    Finds all tasks assigned to students that are NOT done and have
    due_date <= week_end, then updates their due_date to next Monday
    (week_start + 7 days).

    Returns the count of carried-over tasks.
    """
    week_end = body.week_start + timedelta(days=6)
    next_monday = body.week_start + timedelta(days=7)

    # Find all student user ids
    students_result = await db.execute(
        select(User.id).where(User.role == UserRole.student)
    )
    student_ids = [row[0] for row in students_result.all()]

    if not student_ids:
        return {"count": 0, "next_monday": str(next_monday)}

    # Find task IDs assigned to students that are not done and due <= week_end
    task_ids_query = (
        select(Task.id)
        .join(TaskAssignee, TaskAssignee.task_id == Task.id)
        .where(
            TaskAssignee.user_id.in_(student_ids),
            Task.status != TaskStatus.done,
            Task.due_date <= week_end,
        )
        .distinct()
    )
    task_ids_result = await db.execute(task_ids_query)
    task_ids = [row[0] for row in task_ids_result.all()]

    if not task_ids:
        return {"count": 0, "next_monday": str(next_monday)}

    # Update due_date for all matched tasks
    stmt = (
        update(Task)
        .where(Task.id.in_(task_ids))
        .values(due_date=next_monday)
    )
    await db.execute(stmt)
    await db.commit()

    return {"count": len(task_ids), "next_monday": str(next_monday)}
