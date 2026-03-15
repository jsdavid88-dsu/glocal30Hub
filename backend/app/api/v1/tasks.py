import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.project import Project
from app.models.task import Task, TaskAssignee, TaskPriority, TaskStatus
from app.models.user import User, UserRole
from app.schemas.task import (
    TaskAssigneeCreate,
    TaskAssigneeResponse,
    TaskCreate,
    TaskListResponse,
    TaskResponse,
    TaskStatusUpdate,
    TaskSummaryResponse,
    TaskUpdate,
)

router = APIRouter()


# ── Helper ───────────────────────────────────────────────────────────────────


async def _get_task_or_404(
    db: AsyncSession,
    task_id: uuid.UUID,
    *,
    load_assignees: bool = False,
) -> Task:
    """Fetch a task by ID; raise 404 if not found."""
    query = select(Task).where(Task.id == task_id)
    if load_assignees:
        query = query.options(selectinload(Task.assignees).selectinload(TaskAssignee.user))
    result = await db.execute(query)
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


async def _check_project_exists(db: AsyncSession, project_id: uuid.UUID) -> None:
    """Raise 404 if the project does not exist."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


# ── Project-scoped task endpoints ────────────────────────────────────────────


@router.get("/projects/{project_id}/tasks")
async def list_project_tasks(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: TaskStatus | None = Query(None, alias="status"),
    priority_filter: TaskPriority | None = Query(None, alias="priority"),
    assignee_id: uuid.UUID | None = Query(None),
    q: str | None = None,
):
    """List tasks for a project with filtering and pagination."""
    await _check_project_exists(db, project_id)

    query = select(Task).where(Task.project_id == project_id)

    if status_filter is not None:
        query = query.where(Task.status == status_filter)
    if priority_filter is not None:
        query = query.where(Task.priority == priority_filter)
    if assignee_id is not None:
        query = query.where(
            Task.id.in_(
                select(TaskAssignee.task_id).where(TaskAssignee.user_id == assignee_id)
            )
        )
    if q:
        query = query.where(Task.title.ilike(f"%{q}%") | Task.description.ilike(f"%{q}%"))

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(Task.created_at.desc())
    result = await db.execute(query)
    tasks = result.scalars().all()

    return {
        "data": [TaskSummaryResponse.model_validate(t) for t in tasks],
        "meta": {"page": page, "limit": limit, "total": total},
    }


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    project_id: uuid.UUID,
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new task in a project."""
    await _check_project_exists(db, project_id)

    task = Task(
        project_id=project_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
        due_date=body.due_date,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(task)
    await db.commit()

    # Re-fetch with assignees loaded
    task = await _get_task_or_404(db, task.id, load_assignees=True)
    return task


# ── Individual task endpoints ────────────────────────────────────────────────


@router.get("/tasks/my")
async def list_my_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: TaskStatus | None = Query(None, alias="status"),
):
    """List tasks assigned to the current user."""
    assigned_task_ids = select(TaskAssignee.task_id).where(
        TaskAssignee.user_id == current_user.id
    )
    query = select(Task).where(Task.id.in_(assigned_task_ids))

    if status_filter is not None:
        query = query.where(Task.status == status_filter)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(Task.created_at.desc())
    result = await db.execute(query)
    tasks = result.scalars().all()

    return {
        "data": [TaskSummaryResponse.model_validate(t) for t in tasks],
        "meta": {"page": page, "limit": limit, "total": total},
    }


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get task detail with assignees."""
    task = await _get_task_or_404(db, task_id, load_assignees=True)
    return task


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a task's fields."""
    task = await _get_task_or_404(db, task_id)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    task.updated_by = current_user.id

    await db.commit()

    # Re-fetch with assignees
    task = await _get_task_or_404(db, task_id, load_assignees=True)
    return task


@router.patch("/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: uuid.UUID,
    body: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Quick status update for a task."""
    task = await _get_task_or_404(db, task_id)

    task.status = body.status
    task.updated_by = current_user.id

    await db.commit()

    # Re-fetch with assignees
    task = await _get_task_or_404(db, task_id, load_assignees=True)
    return task


# ── Task assignee endpoints ──────────────────────────────────────────────────


@router.post("/tasks/{task_id}/assignees", response_model=TaskAssigneeResponse, status_code=201)
async def add_assignee(
    task_id: uuid.UUID,
    body: TaskAssigneeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign a user to a task."""
    task = await _get_task_or_404(db, task_id)

    # Check user exists
    result = await db.execute(select(User).where(User.id == body.user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check for duplicate assignment
    result = await db.execute(
        select(TaskAssignee).where(
            TaskAssignee.task_id == task_id,
            TaskAssignee.user_id == body.user_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already assigned to this task",
        )

    assignee = TaskAssignee(
        task_id=task_id,
        user_id=body.user_id,
        assigned_by=current_user.id,
        is_primary=body.is_primary,
    )
    db.add(assignee)
    await db.commit()
    await db.refresh(assignee)

    # Re-fetch with user relationship
    result = await db.execute(
        select(TaskAssignee)
        .options(selectinload(TaskAssignee.user))
        .where(TaskAssignee.id == assignee.id)
    )
    assignee = result.scalar_one()
    return assignee


@router.delete("/tasks/{task_id}/assignees/{user_id}", status_code=204)
async def remove_assignee(
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Remove a user from a task."""
    await _get_task_or_404(db, task_id)

    result = await db.execute(
        select(TaskAssignee).where(
            TaskAssignee.task_id == task_id,
            TaskAssignee.user_id == user_id,
        )
    )
    assignee = result.scalar_one_or_none()
    if assignee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignee not found for this task",
        )

    await db.delete(assignee)
    await db.commit()
