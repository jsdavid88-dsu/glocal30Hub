import uuid
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore[no-redef]

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.attendance import Attendance, AttendanceType
from app.models.user import User, UserRole
from app.schemas.attendance import (
    AttendanceCheckIn,
    AttendanceResponse,
    MonthlyStatsResponse,
    StudentAttendanceResponse,
)

router = APIRouter()

KST = ZoneInfo("Asia/Seoul")

LATE_THRESHOLD = time(9, 30)  # 09:30 KST
EARLY_LEAVE_THRESHOLD = time(18, 0)  # 18:00 KST


# ── Helpers ──────────────────────────────────────────────────────────────────


def _now_kst() -> datetime:
    return datetime.now(KST)


def _today_kst() -> date:
    return _now_kst().date()


def _attendance_to_response(att: Attendance, user_name: str | None = None) -> AttendanceResponse:
    """Convert an Attendance ORM object to an AttendanceResponse."""
    return AttendanceResponse(
        id=att.id,
        user_id=att.user_id,
        user_name=user_name,
        date=att.date,
        check_in=att.check_in,
        check_out=att.check_out,
        type=att.type,
        created_at=att.created_at,
        updated_at=att.updated_at,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/today", response_model=AttendanceResponse | None)
async def get_today_attendance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's attendance record for today."""
    today = _today_kst()
    result = await db.execute(
        select(Attendance).where(
            Attendance.user_id == current_user.id,
            Attendance.date == today,
            Attendance.type == AttendanceType.daily,
        )
    )
    att = result.scalar_one_or_none()
    if att is None:
        return None
    return _attendance_to_response(att, user_name=current_user.name)


@router.post("/check-in", response_model=AttendanceResponse, status_code=201)
async def check_in(
    body: AttendanceCheckIn = AttendanceCheckIn(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record check-in time. Creates a new Attendance record for today."""
    today = _today_kst()
    now = _now_kst()

    # Check for duplicate check-in
    result = await db.execute(
        select(Attendance).where(
            Attendance.user_id == current_user.id,
            Attendance.date == today,
            Attendance.type == body.type,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 출근 처리되었습니다.",
        )

    att = Attendance(
        user_id=current_user.id,
        date=today,
        check_in=now,
        check_out=None,
        type=body.type,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)

    return _attendance_to_response(att, user_name=current_user.name)


@router.post("/check-out", response_model=AttendanceResponse)
async def check_out(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record check-out time. Updates today's existing attendance record."""
    today = _today_kst()
    now = _now_kst()

    result = await db.execute(
        select(Attendance).where(
            Attendance.user_id == current_user.id,
            Attendance.date == today,
            Attendance.type == AttendanceType.daily,
        )
    )
    att = result.scalar_one_or_none()

    if att is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="오늘의 출근 기록이 없습니다. 먼저 출근하세요.",
        )

    if att.check_out is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 퇴근 처리되었습니다.",
        )

    att.check_out = now
    await db.commit()
    await db.refresh(att)

    return _attendance_to_response(att, user_name=current_user.name)


@router.get("/history")
async def list_attendance_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    user_id: uuid.UUID | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    type_filter: AttendanceType | None = Query(None, alias="type"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List attendance records with optional filters and pagination.

    Students can only see their own records.
    Professors can see any student's records via user_id.
    """
    # Determine target user
    target_user_id = current_user.id
    if user_id is not None:
        if current_user.role not in (UserRole.admin, UserRole.professor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="학생은 본인의 기록만 조회할 수 있습니다.",
            )
        target_user_id = user_id

    query = select(Attendance).where(Attendance.user_id == target_user_id)

    if start_date is not None:
        query = query.where(Attendance.date >= start_date)
    if end_date is not None:
        query = query.where(Attendance.date <= end_date)
    if type_filter is not None:
        query = query.where(Attendance.type == type_filter)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(Attendance.date.desc())
    result = await db.execute(query)
    records = result.scalars().all()

    # Get user name
    user_result = await db.execute(select(User.name).where(User.id == target_user_id))
    user_name = user_result.scalar_one_or_none()

    return {
        "data": [_attendance_to_response(r, user_name=user_name) for r in records],
        "meta": {"page": page, "limit": limit, "total": total},
    }


@router.get("/stats", response_model=MonthlyStatsResponse)
async def get_monthly_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    user_id: uuid.UUID | None = Query(None),
    year: int | None = Query(None),
    month: int | None = Query(None),
):
    """Get monthly attendance statistics.

    Defaults to current month if year/month not provided.
    Students can only see their own stats.
    """
    # Determine target user
    target_user_id = current_user.id
    if user_id is not None:
        if current_user.role not in (UserRole.admin, UserRole.professor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="학생은 본인의 통계만 조회할 수 있습니다.",
            )
        target_user_id = user_id

    # Determine month range
    today = _today_kst()
    target_year = year or today.year
    target_month = month or today.month

    month_start = date(target_year, target_month, 1)
    if target_month == 12:
        month_end = date(target_year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(target_year, target_month + 1, 1) - timedelta(days=1)

    # Fetch all attendance records for the month
    result = await db.execute(
        select(Attendance).where(
            Attendance.user_id == target_user_id,
            Attendance.date >= month_start,
            Attendance.date <= month_end,
            Attendance.type == AttendanceType.daily,
        )
    )
    records = result.scalars().all()

    total_days = len(records)
    late_days = 0
    early_leaves = 0
    total_hours = 0.0
    days_with_hours = 0

    for r in records:
        if r.check_in is not None:
            check_in_time = r.check_in.astimezone(KST).time()
            if check_in_time > LATE_THRESHOLD:
                late_days += 1

        if r.check_in is not None and r.check_out is not None:
            delta = r.check_out - r.check_in
            hours = delta.total_seconds() / 3600
            total_hours += hours
            days_with_hours += 1

            check_out_time = r.check_out.astimezone(KST).time()
            if check_out_time < EARLY_LEAVE_THRESHOLD:
                early_leaves += 1

    avg_hours = round(total_hours / days_with_hours, 1) if days_with_hours > 0 else 0.0

    # Count absent days (weekdays in the month range up to today with no record)
    absent_days = 0
    check_end = min(month_end, today)
    current = month_start
    attendance_dates = {r.date for r in records}
    while current <= check_end:
        # weekday: 0=Mon ... 4=Fri, 5=Sat, 6=Sun
        if current.weekday() < 5 and current not in attendance_dates:
            absent_days += 1
        current += timedelta(days=1)

    return MonthlyStatsResponse(
        total_days=total_days,
        avg_hours=avg_hours,
        late_days=late_days,
        early_leaves=early_leaves,
        absent_days=absent_days,
    )


@router.get("/students")
async def get_students_attendance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.admin, UserRole.professor)
    ),
    target_date: date | None = Query(None, alias="date"),
):
    """Professor/Admin only: get all students' attendance for a given date.

    Defaults to today if no date is provided.
    """
    target = target_date or _today_kst()

    # Get all students
    result = await db.execute(
        select(User).where(User.role == UserRole.student).order_by(User.name)
    )
    students = result.scalars().all()

    if not students:
        return {"data": [], "date": target.isoformat()}

    student_ids = [s.id for s in students]

    # Get attendance records for all students on the target date
    result = await db.execute(
        select(Attendance).where(
            Attendance.user_id.in_(student_ids),
            Attendance.date == target,
            Attendance.type == AttendanceType.daily,
        )
    )
    records = result.scalars().all()
    att_by_user = {r.user_id: r for r in records}

    data = []
    for student in students:
        att = att_by_user.get(student.id)
        data.append(
            StudentAttendanceResponse(
                user_id=student.id,
                user_name=student.name,
                attendance=_attendance_to_response(att, user_name=student.name) if att else None,
            )
        )

    return {"data": [d.model_dump() for d in data], "date": target.isoformat()}
