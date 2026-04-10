import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_project_role
from app.models.project import Project, ProjectMember, ProjectMemberRole, ProjectStatus
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.schemas.project import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectSummaryResponse,
    ProjectUpdate,
)

router = APIRouter()


@router.get("/")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: ProjectStatus | None = Query(None, alias="status"),
    q: str | None = None,
):
    """List projects with pagination and optional status filter.

    External users only see projects they are members of.
    Other roles (admin, professor, student) see all projects.
    """
    query = select(Project)

    # External users: restrict to projects they are members of
    if current_user.role == UserRole.external:
        member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == current_user.id
        )
        query = query.where(Project.id.in_(member_project_ids))

    if status_filter is not None:
        query = query.where(Project.status == status_filter)
    if q:
        query = query.where(
            Project.name.ilike(f"%{q}%") | Project.description.ilike(f"%{q}%")
        )

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(Project.created_at.desc())
    result = await db.execute(query)
    projects = result.scalars().all()

    # Gather member counts and task stats for returned projects
    project_ids = [p.id for p in projects]
    member_counts: dict = {}
    task_stats: dict = {}

    if project_ids:
        # Member counts per project
        mc_query = (
            select(ProjectMember.project_id, func.count().label("cnt"))
            .where(ProjectMember.project_id.in_(project_ids))
            .group_by(ProjectMember.project_id)
        )
        mc_result = await db.execute(mc_query)
        for row in mc_result:
            member_counts[row.project_id] = row.cnt

        # Task total and done counts per project
        ts_query = (
            select(
                Task.project_id,
                func.count().label("total"),
                func.count().filter(Task.status == TaskStatus.done).label("done"),
            )
            .where(Task.project_id.in_(project_ids))
            .group_by(Task.project_id)
        )
        ts_result = await db.execute(ts_query)
        for row in ts_result:
            task_stats[row.project_id] = {"total": row.total, "done": row.done}

    data = []
    for p in projects:
        d = ProjectSummaryResponse.model_validate(p)
        d.member_count = member_counts.get(p.id, 0)
        stats = task_stats.get(p.id, {})
        d.task_done = stats.get("done", 0)
        d.task_total = stats.get("total", 0)
        data.append(d)

    return {
        "data": data,
        "meta": {"page": page, "limit": limit, "total": total},
    }


@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new project. Creator is automatically added as lead."""
    project = Project(
        name=body.name,
        description=body.description,
        status=body.status,
        start_date=body.start_date,
        end_date=body.end_date,
        created_by=current_user.id,
    )
    db.add(project)
    await db.flush()

    # Add creator as project lead
    member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        project_role=ProjectMemberRole.lead,
    )
    db.add(member)

    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get project detail by ID."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update project. Only project lead/manager or admin can update."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Check permission: admin or project lead/manager
    if current_user.role != UserRole.admin:
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
                ProjectMember.project_role.in_([ProjectMemberRole.lead, ProjectMemberRole.manager]),
            )
        )
        if member_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only project lead, manager, or admin can update the project",
            )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}/members")
async def list_members(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """List members of a project."""
    # Check project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    query = (
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at)
    )
    result = await db.execute(query)
    members = result.scalars().all()

    return {"data": [ProjectMemberResponse.model_validate(m) for m in members]}


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=201)
async def add_member(
    project_id: uuid.UUID,
    body: ProjectMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a member to a project. Only lead/manager/professor/admin can add members."""
    # Check project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Check permission: admin, professor, or project lead/manager
    await require_project_role(
        project_id,
        [ProjectMemberRole.lead, ProjectMemberRole.manager],
        current_user,
        db,
    )

    # Check user exists
    result = await db.execute(select(User).where(User.id == body.user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check for duplicate membership
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == body.user_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this project",
        )

    member = ProjectMember(
        project_id=project_id,
        user_id=body.user_id,
        project_role=body.project_role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    # Re-fetch with user relationship
    result = await db.execute(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.id == member.id)
    )
    member = result.scalar_one()
    return member


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from a project. Only lead/manager/professor/admin or self can remove."""
    # Check project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Allow members to remove themselves; otherwise require lead/manager/professor/admin
    if current_user.id != user_id:
        await require_project_role(
            project_id,
            [ProjectMemberRole.lead, ProjectMemberRole.manager],
            current_user,
            db,
        )

    # Find and delete the membership
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this project",
        )

    await db.delete(member)
    await db.commit()
