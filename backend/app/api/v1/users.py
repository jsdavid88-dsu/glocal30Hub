import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import AdvisorRelation, User, UserRole, UserStatus
from app.schemas.user import (
    AdvisorRelationCreate,
    AdvisorRelationResponse,
    UserResponse,
    UserSummaryResponse,
    UserUpdate,
)

router = APIRouter()


@router.get("/")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    role: UserRole | None = None,
    status: UserStatus | None = None,
    q: str | None = None,
):
    """List users with pagination and optional role/status filter."""
    query = select(User)

    if role is not None:
        query = query.where(User.role == role)
    if status is not None:
        query = query.where(User.status == status)
    if q:
        query = query.where(User.name.ilike(f"%{q}%") | User.email.ilike(f"%{q}%"))

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "data": [UserSummaryResponse.model_validate(u) for u in users],
        "meta": {"page": page, "limit": limit, "total": total},
    }


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get user detail by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update user. Users can update themselves; admins can update anyone."""
    if current_user.id != user_id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own profile",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}/advisors")
async def get_advisors(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get advisor relations for a user (as student or professor)."""
    # Check user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Get relations where user is either professor or student
    query = (
        select(AdvisorRelation)
        .options(selectinload(AdvisorRelation.professor), selectinload(AdvisorRelation.student))
        .where(
            (AdvisorRelation.professor_id == user_id) | (AdvisorRelation.student_id == user_id)
        )
    )
    result = await db.execute(query)
    relations = result.scalars().all()

    return {
        "data": [AdvisorRelationResponse.model_validate(r) for r in relations],
    }


@router.post("/{user_id}/advisors", response_model=AdvisorRelationResponse, status_code=201)
async def add_advisor_relation(
    user_id: uuid.UUID,
    body: AdvisorRelationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an advisor relation. Only admins and professors can create."""
    if current_user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and professors can create advisor relations",
        )

    # Validate advisor exists and has professor or admin role
    result = await db.execute(select(User).where(User.id == body.professor_id))
    professor = result.scalar_one_or_none()
    if professor is None or professor.role not in (UserRole.professor, UserRole.admin):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Advisor must be a professor or admin",
        )

    # Validate student exists
    result = await db.execute(select(User).where(User.id == body.student_id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )

    # Check for duplicate
    result = await db.execute(
        select(AdvisorRelation).where(
            AdvisorRelation.professor_id == body.professor_id,
            AdvisorRelation.student_id == body.student_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Advisor relation already exists",
        )

    relation = AdvisorRelation(
        professor_id=body.professor_id,
        student_id=body.student_id,
    )
    db.add(relation)
    await db.commit()
    await db.refresh(relation)

    # Re-fetch with relationships loaded
    result = await db.execute(
        select(AdvisorRelation)
        .options(selectinload(AdvisorRelation.professor), selectinload(AdvisorRelation.student))
        .where(AdvisorRelation.id == relation.id)
    )
    relation = result.scalar_one()
    return relation
