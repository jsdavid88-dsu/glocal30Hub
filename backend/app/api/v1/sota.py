import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.sota import SotaAssignment, SotaAssignmentStatus, SotaItem, SotaReview
from app.models.user import User, UserRole
from app.schemas.sota import (
    SotaAssignmentCreate,
    SotaAssignmentResponse,
    SotaAssignmentUpdate,
    SotaItemCreate,
    SotaItemDetail,
    SotaItemResponse,
    SotaItemUpdate,
    SotaReviewCreate,
    SotaReviewResponse,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────


def _load_item_with_assignments():
    return selectinload(SotaItem.assignments).options(
        selectinload(SotaAssignment.assignee),
        selectinload(SotaAssignment.reviews).selectinload(SotaReview.reviewer),
    )


async def _get_item_or_404(db: AsyncSession, item_id: uuid.UUID) -> SotaItem:
    result = await db.execute(
        select(SotaItem)
        .options(_load_item_with_assignments())
        .where(SotaItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOTA item not found")
    return item


async def _get_assignment_or_404(db: AsyncSession, assignment_id: uuid.UUID) -> SotaAssignment:
    result = await db.execute(
        select(SotaAssignment)
        .options(
            selectinload(SotaAssignment.assignee),
            selectinload(SotaAssignment.reviews).selectinload(SotaReview.reviewer),
        )
        .where(SotaAssignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment


def _build_item_response(item: SotaItem) -> SotaItemResponse:
    return SotaItemResponse(
        id=item.id,
        title=item.title,
        source=item.source,
        url=item.url,
        summary=item.summary,
        published_at=item.published_at,
        created_at=item.created_at,
        assignments_count=len(item.assignments) if item.assignments else 0,
    )


def _build_review_response(review: SotaReview) -> SotaReviewResponse:
    return SotaReviewResponse(
        id=review.id,
        sota_assignment_id=review.sota_assignment_id,
        reviewer_id=review.reviewer_id,
        reviewer_name=review.reviewer.name if review.reviewer else "",
        content=review.content,
        submitted_at=review.submitted_at,
        created_at=review.created_at,
    )


def _build_assignment_response(assignment: SotaAssignment) -> SotaAssignmentResponse:
    return SotaAssignmentResponse(
        id=assignment.id,
        sota_item_id=assignment.sota_item_id,
        assignee_id=assignment.assignee_id,
        assignee_name=assignment.assignee.name if assignment.assignee else "",
        assigned_by=assignment.assigned_by,
        status=assignment.status,
        due_date=assignment.due_date,
        created_at=assignment.created_at,
        reviews=[_build_review_response(r) for r in (assignment.reviews or [])],
    )


def _build_item_detail(item: SotaItem) -> SotaItemDetail:
    return SotaItemDetail(
        id=item.id,
        title=item.title,
        source=item.source,
        url=item.url,
        summary=item.summary,
        published_at=item.published_at,
        created_at=item.created_at,
        assignments_count=len(item.assignments) if item.assignments else 0,
        assignments=[_build_assignment_response(a) for a in (item.assignments or [])],
    )


# ── SOTA Item Endpoints ──────────────────────────────────────────────────


@router.get("/", response_model=list[SotaItemResponse])
async def list_sota_items(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    search: str | None = Query(None),
    assignment_status: SotaAssignmentStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List SOTA items with optional search and assignment-status filter."""
    query = select(SotaItem).options(_load_item_with_assignments())

    if search:
        query = query.where(
            SotaItem.title.ilike(f"%{search}%")
            | SotaItem.source.ilike(f"%{search}%")
            | SotaItem.summary.ilike(f"%{search}%")
        )

    if assignment_status is not None:
        query = query.where(
            SotaItem.id.in_(
                select(SotaAssignment.sota_item_id).where(
                    SotaAssignment.status == assignment_status
                )
            )
        )

    # Total count
    count_query = select(func.count()).select_from(
        select(SotaItem.id).where(
            *([
                SotaItem.title.ilike(f"%{search}%")
                | SotaItem.source.ilike(f"%{search}%")
                | SotaItem.summary.ilike(f"%{search}%")
            ] if search else []),
            *([
                SotaItem.id.in_(
                    select(SotaAssignment.sota_item_id).where(
                        SotaAssignment.status == assignment_status
                    )
                )
            ] if assignment_status is not None else []),
        ).subquery()
    )
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(SotaItem.created_at.desc())
    result = await db.execute(query)
    items = result.scalars().unique().all()

    return [_build_item_response(item) for item in items]


@router.get("/my", response_model=list[SotaAssignmentResponse])
async def list_my_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    assignment_status: SotaAssignmentStatus | None = Query(None, alias="status"),
):
    """List SOTA assignments for the current user (student view)."""
    query = (
        select(SotaAssignment)
        .options(
            selectinload(SotaAssignment.assignee),
            selectinload(SotaAssignment.reviews).selectinload(SotaReview.reviewer),
            selectinload(SotaAssignment.sota_item),
        )
        .where(SotaAssignment.assignee_id == current_user.id)
    )

    if assignment_status is not None:
        query = query.where(SotaAssignment.status == assignment_status)

    query = query.order_by(SotaAssignment.created_at.desc())
    result = await db.execute(query)
    assignments = result.scalars().unique().all()

    return [_build_assignment_response(a) for a in assignments]


@router.get("/{item_id}", response_model=SotaItemDetail)
async def get_sota_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get SOTA item detail with assignments and reviews."""
    item = await _get_item_or_404(db, item_id)
    return _build_item_detail(item)


@router.post("/", response_model=SotaItemResponse, status_code=201)
async def create_sota_item(
    body: SotaItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Create a new SOTA item. Professor or admin only."""
    item = SotaItem(
        title=body.title,
        source=body.source,
        url=body.url,
        summary=body.summary,
        published_at=body.published_at,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return SotaItemResponse(
        id=item.id,
        title=item.title,
        source=item.source,
        url=item.url,
        summary=item.summary,
        published_at=item.published_at,
        created_at=item.created_at,
        assignments_count=0,
    )


@router.patch("/{item_id}", response_model=SotaItemResponse)
async def update_sota_item(
    item_id: uuid.UUID,
    body: SotaItemUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Update a SOTA item."""
    item = await _get_item_or_404(db, item_id)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)

    # Re-fetch with assignments
    item = await _get_item_or_404(db, item_id)
    return _build_item_response(item)


@router.delete("/{item_id}", status_code=204)
async def delete_sota_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Delete a SOTA item. Professor or admin only."""
    item = await _get_item_or_404(db, item_id)
    await db.delete(item)
    await db.commit()


# ── Assignment Endpoints ──────────────────────────────────────────────────


@router.post("/{item_id}/assign", response_model=SotaAssignmentResponse, status_code=201)
async def assign_sota_item(
    item_id: uuid.UUID,
    body: SotaAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Assign a SOTA item to a student. Professor or admin only."""
    # Verify item exists
    await _get_item_or_404(db, item_id)

    # Verify assignee exists and is a student
    result = await db.execute(select(User).where(User.id == body.assignee_id))
    assignee = result.scalar_one_or_none()
    if assignee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check duplicate assignment
    result = await db.execute(
        select(SotaAssignment).where(
            SotaAssignment.sota_item_id == item_id,
            SotaAssignment.assignee_id == body.assignee_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 해당 학생에게 배정된 논문입니다",
        )

    assignment = SotaAssignment(
        sota_item_id=item_id,
        assignee_id=body.assignee_id,
        assigned_by=current_user.id,
        due_date=body.due_date,
        status=SotaAssignmentStatus.assigned,
    )
    db.add(assignment)
    await db.commit()

    # Re-fetch with relationships
    assignment = await _get_assignment_or_404(db, assignment.id)
    return _build_assignment_response(assignment)


@router.patch("/assignments/{assignment_id}", response_model=SotaAssignmentResponse)
async def update_assignment(
    assignment_id: uuid.UUID,
    body: SotaAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Update assignment status or due date."""
    assignment = await _get_assignment_or_404(db, assignment_id)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment, field, value)

    await db.commit()

    # Re-fetch
    assignment = await _get_assignment_or_404(db, assignment_id)
    return _build_assignment_response(assignment)


# ── Review Endpoints ──────────────────────────────────────────────────────


@router.post("/assignments/{assignment_id}/review", response_model=SotaReviewResponse, status_code=201)
async def submit_review(
    assignment_id: uuid.UUID,
    body: SotaReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a review for a SOTA assignment."""
    assignment = await _get_assignment_or_404(db, assignment_id)

    review = SotaReview(
        sota_assignment_id=assignment_id,
        reviewer_id=current_user.id,
        content=body.content,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(review)

    # Auto-update assignment status to submitted
    if assignment.status in (SotaAssignmentStatus.assigned, SotaAssignmentStatus.in_review):
        assignment.status = SotaAssignmentStatus.submitted

    await db.commit()
    await db.refresh(review)

    # Re-fetch with reviewer
    result = await db.execute(
        select(SotaReview)
        .options(selectinload(SotaReview.reviewer))
        .where(SotaReview.id == review.id)
    )
    review = result.scalar_one()
    return _build_review_response(review)


# ── LLM Placeholder ──────────────────────────────────────────────────────


@router.get("/{item_id}/analyze")
async def analyze_sota_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Placeholder for future LLM paper analysis."""
    # Verify item exists
    await _get_item_or_404(db, item_id)
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="LLM 분석 기능은 준비 중입니다",
    )
