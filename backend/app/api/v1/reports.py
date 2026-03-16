import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.attendance import Attendance
from app.models.daily import DailyBlock, DailyLog
from app.models.report import ReportSnapshot, ReportScopeType, ReportType
from app.models.task import Task, TaskAssignee, TaskStatus
from app.models.user import User, UserRole
from app.schemas.report import ReportCreate, ReportGenerateRequest, ReportResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_report_or_404(db: AsyncSession, report_id: uuid.UUID) -> ReportSnapshot:
    result = await db.execute(
        select(ReportSnapshot).where(ReportSnapshot.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )
    return report


def _build_title(body: ReportGenerateRequest) -> str:
    """Generate a default title from the request parameters."""
    type_labels = {
        ReportType.weekly: "주간 리포트",
        ReportType.project_summary: "프로젝트 요약",
        ReportType.advisor_summary: "지도교수 요약",
        ReportType.student_summary: "학생 요약",
        ReportType.tag_summary: "태그 요약",
        ReportType.organization_summary: "조직 요약",
    }
    label = type_labels.get(body.report_type, "리포트")
    return f"{label} ({body.period_start} ~ {body.period_end})"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[ReportResponse])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    report_type: ReportType | None = Query(None),
    scope_type: ReportScopeType | None = Query(None),
    period_start: date | None = Query(None),
    period_end: date | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List reports with optional filters and pagination."""
    query = select(ReportSnapshot)

    if report_type is not None:
        query = query.where(ReportSnapshot.report_type == report_type)
    if scope_type is not None:
        query = query.where(ReportSnapshot.scope_type == scope_type)
    if period_start is not None:
        query = query.where(ReportSnapshot.period_start >= period_start)
    if period_end is not None:
        query = query.where(ReportSnapshot.period_end <= period_end)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = (
        query.offset(offset)
        .limit(limit)
        .order_by(ReportSnapshot.created_at.desc())
    )
    result = await db.execute(query)
    reports = result.scalars().all()

    return [ReportResponse.model_validate(r) for r in reports]


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get a single report by ID."""
    report = await _get_report_or_404(db, report_id)
    return ReportResponse.model_validate(report)


@router.post("/", response_model=ReportResponse, status_code=201)
async def create_report(
    body: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a report manually."""
    report = ReportSnapshot(
        report_type=body.report_type,
        title=body.title,
        scope_type=body.scope_type,
        scope_id=body.scope_id,
        period_start=body.period_start,
        period_end=body.period_end,
        content=body.content,
        generated_by=current_user.id,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return ReportResponse.model_validate(report)


@router.post("/generate", response_model=ReportResponse, status_code=201)
async def generate_report(
    body: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a report by collecting dailies, tasks, and attendance data
    for the given scope and period.

    The structured content is saved as a ReportSnapshot.
    """
    p_start = body.period_start
    p_end = body.period_end

    # ── 1. Collect daily logs ──────────────────────────────────────────────
    daily_query = select(DailyLog).where(
        DailyLog.date >= p_start,
        DailyLog.date <= p_end,
    )
    if body.scope_type == ReportScopeType.student and body.scope_id:
        daily_query = daily_query.where(DailyLog.author_id == body.scope_id)
    elif body.scope_type == ReportScopeType.project and body.scope_id:
        # Filter daily logs that have blocks linked to the project
        daily_query = daily_query.where(
            DailyLog.id.in_(
                select(DailyBlock.daily_log_id).where(
                    DailyBlock.project_id == body.scope_id
                )
            )
        )

    daily_result = await db.execute(daily_query)
    daily_logs = daily_result.scalars().all()
    daily_count = len(daily_logs)

    # Collect recent daily highlights (last 5 log snippets)
    daily_highlights = []
    for log in sorted(daily_logs, key=lambda l: l.date, reverse=True)[:5]:
        snippet = (log.raw_content or "")[:200]
        daily_highlights.append({
            "date": str(log.date),
            "author_id": str(log.author_id),
            "snippet": snippet,
        })

    # ── 2. Collect task summary ────────────────────────────────────────────
    task_query = select(Task.status, func.count().label("cnt"))
    if body.scope_type == ReportScopeType.project and body.scope_id:
        task_query = task_query.where(Task.project_id == body.scope_id)
    elif body.scope_type == ReportScopeType.student and body.scope_id:
        task_query = task_query.where(
            Task.id.in_(
                select(TaskAssignee.task_id).where(
                    TaskAssignee.user_id == body.scope_id
                )
            )
        )
    task_query = task_query.group_by(Task.status)
    task_result = await db.execute(task_query)
    task_rows = task_result.all()

    task_summary = {"done": 0, "in_progress": 0, "todo": 0, "blocked": 0, "review": 0}
    for row in task_rows:
        status_key = row.status.value if hasattr(row.status, "value") else row.status
        if status_key in task_summary:
            task_summary[status_key] = row.cnt

    # ── 3. Collect attendance summary ──────────────────────────────────────
    att_query = select(Attendance).where(
        Attendance.date >= p_start,
        Attendance.date <= p_end,
    )
    if body.scope_type == ReportScopeType.student and body.scope_id:
        att_query = att_query.where(Attendance.user_id == body.scope_id)

    att_result = await db.execute(att_query)
    attendances = att_result.scalars().all()

    total_days = len(attendances)
    total_hours = 0.0
    for att in attendances:
        if att.check_in and att.check_out:
            delta = att.check_out - att.check_in
            total_hours += delta.total_seconds() / 3600.0

    avg_hours = round(total_hours / total_days, 1) if total_days > 0 else 0

    # ── 4. Build content dict ──────────────────────────────────────────────
    content = {
        "daily_count": daily_count,
        "task_summary": task_summary,
        "attendance_summary": {
            "total_days": total_days,
            "avg_hours": avg_hours,
        },
        "daily_highlights": daily_highlights,
        # TODO: LLM integration point — pass collected_data to LLM for natural language summary
        "llm_summary": None,
    }

    # ── 5. Save report snapshot ────────────────────────────────────────────
    title = _build_title(body)
    report = ReportSnapshot(
        report_type=body.report_type,
        title=title,
        scope_type=body.scope_type,
        scope_id=body.scope_id,
        period_start=p_start,
        period_end=p_end,
        content=content,
        generated_by=current_user.id,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return ReportResponse.model_validate(report)


@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.professor)),
):
    """Delete a report. Professor only."""
    report = await _get_report_or_404(db, report_id)
    await db.delete(report)
    await db.commit()
