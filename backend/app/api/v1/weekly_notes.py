import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.daily import DailyBlock, DailyLog
from app.models.project import Project
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


@router.get("/summary")
async def get_weekly_summary(
    week_start: date = Query(..., description="Monday of the target week (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Generate a structured weekly summary from daily logs and tasks.

    Aggregates all student daily logs, daily blocks, and task stats
    for the given week (week_start to week_start + 6 days).
    """
    week_end = week_start + timedelta(days=6)

    # 1) Fetch all students
    students_result = await db.execute(
        select(User).where(User.role == UserRole.student)
    )
    students = students_result.scalars().all()
    student_ids = [s.id for s in students]

    # 2) Fetch daily logs for the week (all students)
    if student_ids:
        logs_query = (
            select(DailyLog)
            .options(selectinload(DailyLog.blocks))
            .where(
                DailyLog.author_id.in_(student_ids),
                DailyLog.date >= week_start,
                DailyLog.date <= week_end,
            )
        )
        logs_result = await db.execute(logs_query)
        logs = logs_result.scalars().unique().all()
    else:
        logs = []

    # Index logs by author_id
    logs_by_author: dict[uuid.UUID, list] = {}
    for log in logs:
        logs_by_author.setdefault(log.author_id, []).append(log)

    # 3) Fetch task assignments for students
    if student_ids:
        task_query = (
            select(TaskAssignee.user_id, Task.status, func.count().label("cnt"))
            .join(Task, TaskAssignee.task_id == Task.id)
            .where(TaskAssignee.user_id.in_(student_ids))
            .group_by(TaskAssignee.user_id, Task.status)
        )
        task_result = await db.execute(task_query)
        task_rows = task_result.all()
    else:
        task_rows = []

    task_by_student: dict[uuid.UUID, dict[str, int]] = {}
    for row in task_rows:
        stats = task_by_student.setdefault(
            row.user_id, {"done": 0, "in_progress": 0, "todo": 0, "blocked": 0}
        )
        status_key = row.status.value if hasattr(row.status, "value") else row.status
        if status_key == "done":
            stats["done"] += row.cnt
        elif status_key == "in_progress":
            stats["in_progress"] += row.cnt
        elif status_key == "todo":
            stats["todo"] += row.cnt
        elif status_key == "blocked":
            stats["blocked"] += row.cnt

    # 4) Build student summaries
    student_summaries = []
    for student in students:
        author_logs = logs_by_author.get(student.id, [])
        blocks_data = []
        for log in author_logs:
            for block in log.blocks:
                blocks_data.append({
                    "section": block.section.value if hasattr(block.section, "value") else block.section,
                    "content": block.content,
                    "date": str(log.date),
                })

        ts = task_by_student.get(
            student.id, {"done": 0, "in_progress": 0, "todo": 0, "blocked": 0}
        )

        student_summaries.append({
            "id": str(student.id),
            "name": student.name,
            "daily_count": len(author_logs),
            "blocks": blocks_data,
            "tasks": ts,
        })

    # 5) Project-level task stats
    project_task_query = (
        select(
            Task.project_id,
            Task.status,
            func.count().label("cnt"),
        )
        .group_by(Task.project_id, Task.status)
    )
    pt_result = await db.execute(project_task_query)
    pt_rows = pt_result.all()

    project_stats: dict[uuid.UUID, dict[str, int]] = {}
    project_ids_set: set[uuid.UUID] = set()
    for row in pt_rows:
        project_ids_set.add(row.project_id)
        ps = project_stats.setdefault(
            row.project_id, {"task_done": 0, "task_in_progress": 0, "task_todo": 0}
        )
        status_key = row.status.value if hasattr(row.status, "value") else row.status
        if status_key == "done":
            ps["task_done"] += row.cnt
        elif status_key == "in_progress":
            ps["task_in_progress"] += row.cnt
        elif status_key == "todo":
            ps["task_todo"] += row.cnt

    # Fetch project names
    project_summaries = []
    if project_ids_set:
        proj_result = await db.execute(
            select(Project).where(Project.id.in_(list(project_ids_set)))
        )
        projects_list = proj_result.scalars().all()
        for proj in projects_list:
            ps = project_stats.get(proj.id, {})
            project_summaries.append({
                "id": str(proj.id),
                "name": proj.name,
                "task_done": ps.get("task_done", 0),
                "task_in_progress": ps.get("task_in_progress", 0),
                "task_todo": ps.get("task_todo", 0),
            })

    return {
        "week_start": str(week_start),
        "week_end": str(week_end),
        "students": student_summaries,
        "projects": project_summaries,
    }
