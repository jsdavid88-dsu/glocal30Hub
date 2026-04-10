import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.project import ProjectMember, ProjectMemberRole
from app.models.user import AdvisorRelation, User, UserRole

security = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Validate JWT token and return the current user."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def require_role(*roles: UserRole):
    """Dependency factory that checks if the current user has one of the required roles."""

    async def _check_role(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _check_role


async def require_project_role(
    project_id: uuid.UUID,
    roles: list[ProjectMemberRole],
    user: User,
    db: AsyncSession,
) -> ProjectMember:
    """Check if the user has one of the specified roles in the project.

    Admins and professors bypass the project-role check.
    Returns the ProjectMember record if found, raises 403 otherwise.
    """
    if user.role in (UserRole.admin, UserRole.professor):
        # Admins and professors are always allowed; return a dummy-free check
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id,
            )
        )
        member = result.scalar_one_or_none()
        # Even if they're not a member, permission is granted
        return member  # type: ignore[return-value]

    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
            ProjectMember.project_role.in_(roles),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires one of project roles: {[r.value for r in roles]}",
        )
    return member


async def require_advisor_of(
    student_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> AdvisorRelation:
    """Check if the current user is an advisor of the given student.

    Admins bypass this check.
    Returns the AdvisorRelation if found, raises 403 otherwise.
    """
    if user.role == UserRole.admin:
        # Admins bypass advisor check
        result = await db.execute(
            select(AdvisorRelation).where(AdvisorRelation.student_id == student_id)
        )
        relation = result.scalar_one_or_none()
        return relation  # type: ignore[return-value]

    if user.role != UserRole.professor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only professors or admins can perform this action",
        )

    result = await db.execute(
        select(AdvisorRelation).where(
            AdvisorRelation.professor_id == user.id,
            AdvisorRelation.student_id == student_id,
        )
    )
    relation = result.scalar_one_or_none()
    if relation is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an advisor of this student",
        )
    return relation
