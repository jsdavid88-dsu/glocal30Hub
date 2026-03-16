import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.project import Project
from app.models.task import Task, TaskAssignee, TaskGroup, TaskGroupStatus, TaskPriority, TaskStatus
from app.models.user import User, UserRole
from app.schemas.task import (
    TaskAssigneeCreate,
    TaskAssigneeResponse,
    TaskCreate,
    TaskGroupCreate,
    TaskGroupReorder,
    TaskGroupResponse,
    TaskGroupUpdate,
    TaskListResponse,
    TaskResponse,
    TaskStatusUpdate,
    TaskSummaryResponse,
    TaskTreeNode,
    TaskTreeResponse,
    TaskUpdate,
)


# ── Request schemas for new endpoints ─────────────────────────────────────────


class TaskCarryoverRequest(BaseModel):
    task_ids: list[uuid.UUID]
    new_due_date: date


class TaskGroupRequest(BaseModel):
    child_task_ids: list[uuid.UUID] = Field(..., min_length=1)


class TaskUngroupRequest(BaseModel):
    child_task_ids: list[uuid.UUID] = Field(default_factory=list)


router = APIRouter()

MAX_HIERARCHY_DEPTH = 3


# ── Helper ───────────────────────────────────────────────────────────────────


async def _get_task_or_404(
    db: AsyncSession,
    task_id: uuid.UUID,
    *,
    load_assignees: bool = False,
    load_children: bool = False,
) -> Task:
    """Fetch a task by ID; raise 404 if not found."""
    query = select(Task).where(Task.id == task_id)
    if load_assignees:
        query = query.options(selectinload(Task.assignees).selectinload(TaskAssignee.user))
    if load_children:
        query = query.options(selectinload(Task.children))
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


async def _get_ancestor_ids(db: AsyncSession, task_id: uuid.UUID) -> set[uuid.UUID]:
    """Walk up the parent chain and return all ancestor IDs (including self)."""
    ancestors: set[uuid.UUID] = set()
    current_id: uuid.UUID | None = task_id
    while current_id is not None:
        if current_id in ancestors:
            break  # circular reference safety
        ancestors.add(current_id)
        result = await db.execute(select(Task.parent_id).where(Task.id == current_id))
        row = result.one_or_none()
        current_id = row[0] if row else None
    return ancestors


async def _get_depth(db: AsyncSession, task_id: uuid.UUID) -> int:
    """Return the depth of a task (0 = root)."""
    depth = 0
    current_id: uuid.UUID | None = task_id
    while True:
        result = await db.execute(select(Task.parent_id).where(Task.id == current_id))
        row = result.one_or_none()
        if row is None or row[0] is None:
            break
        depth += 1
        current_id = row[0]
    return depth


async def _get_max_subtree_depth(db: AsyncSession, task_id: uuid.UUID) -> int:
    """Return the max depth of descendants below this task (0 = no children)."""
    result = await db.execute(
        select(Task.id).where(Task.parent_id == task_id)
    )
    child_ids = [row[0] for row in result.all()]
    if not child_ids:
        return 0
    max_child_depth = 0
    for child_id in child_ids:
        child_depth = 1 + await _get_max_subtree_depth(db, child_id)
        max_child_depth = max(max_child_depth, child_depth)
    return max_child_depth


async def _validate_parent(
    db: AsyncSession,
    parent_id: uuid.UUID,
    project_id: uuid.UUID,
    task_id: uuid.UUID | None = None,
) -> None:
    """Validate parent task exists, belongs to same project, and depth is within limit."""
    parent = await _get_task_or_404(db, parent_id)
    if parent.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parent task must belong to the same project",
        )

    # Check circular reference (only relevant when reparenting an existing task)
    if task_id is not None:
        if parent_id == task_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A task cannot be its own parent",
            )
        ancestor_ids = await _get_ancestor_ids(db, parent_id)
        if task_id in ancestor_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Circular reference detected: task is an ancestor of the proposed parent",
            )

    # Check depth limit
    parent_depth = await _get_depth(db, parent_id)
    # The child will be at parent_depth + 1
    child_depth = parent_depth + 1
    if task_id is not None:
        # When reparenting, also check the subtree below the task
        subtree_depth = await _get_max_subtree_depth(db, task_id)
        if child_depth + subtree_depth >= MAX_HIERARCHY_DEPTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum hierarchy depth of {MAX_HIERARCHY_DEPTH} levels exceeded",
            )
    elif child_depth >= MAX_HIERARCHY_DEPTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum hierarchy depth of {MAX_HIERARCHY_DEPTH} levels exceeded",
        )


async def _get_group_or_404(db: AsyncSession, group_id: uuid.UUID) -> TaskGroup:
    """Fetch a task group by ID; raise 404 if not found."""
    result = await db.execute(select(TaskGroup).where(TaskGroup.id == group_id))
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task group not found")
    return group


# ── TaskGroup endpoints ──────────────────────────────────────────────────────


@router.get("/projects/{project_id}/groups", response_model=list[TaskGroupResponse])
async def list_project_groups(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """List task groups for a project, ordered by `order` field, with task_count."""
    await _check_project_exists(db, project_id)

    # Fetch groups with task count via subquery
    task_count_subq = (
        select(Task.group_id, func.count().label("task_count"))
        .where(Task.group_id.isnot(None))
        .group_by(Task.group_id)
        .subquery()
    )

    result = await db.execute(
        select(TaskGroup, func.coalesce(task_count_subq.c.task_count, 0).label("task_count"))
        .outerjoin(task_count_subq, TaskGroup.id == task_count_subq.c.group_id)
        .where(TaskGroup.project_id == project_id)
        .order_by(TaskGroup.order.asc(), TaskGroup.created_at.asc())
    )
    rows = result.all()

    return [
        TaskGroupResponse(
            id=group.id,
            project_id=group.project_id,
            name=group.name,
            color=group.color,
            order=group.order,
            status=group.status,
            description=group.description,
            task_count=task_count,
            created_at=group.created_at,
        )
        for group, task_count in rows
    ]


@router.post("/projects/{project_id}/groups", response_model=TaskGroupResponse, status_code=201)
async def create_group(
    project_id: uuid.UUID,
    body: TaskGroupCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Create a new task group in a project."""
    await _check_project_exists(db, project_id)

    # Determine the next order value
    result = await db.execute(
        select(func.coalesce(func.max(TaskGroup.order), -1) + 1)
        .where(TaskGroup.project_id == project_id)
    )
    next_order = result.scalar()

    group = TaskGroup(
        project_id=project_id,
        name=body.name,
        color=body.color,
        description=body.description,
        order=next_order,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)

    return TaskGroupResponse(
        id=group.id,
        project_id=group.project_id,
        name=group.name,
        color=group.color,
        order=group.order,
        status=group.status,
        description=group.description,
        task_count=0,
        created_at=group.created_at,
    )


@router.patch("/groups/{group_id}", response_model=TaskGroupResponse)
async def update_group(
    group_id: uuid.UUID,
    body: TaskGroupUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Update a task group (name, color, description, status)."""
    group = await _get_group_or_404(db, group_id)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(group, field, value)

    await db.commit()
    await db.refresh(group)

    # Get task count
    result = await db.execute(
        select(func.count()).where(Task.group_id == group_id)
    )
    task_count = result.scalar() or 0

    return TaskGroupResponse(
        id=group.id,
        project_id=group.project_id,
        name=group.name,
        color=group.color,
        order=group.order,
        status=group.status,
        description=group.description,
        task_count=task_count,
        created_at=group.created_at,
    )


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Delete a task group. Tasks in this group get group_id set to NULL (not deleted)."""
    group = await _get_group_or_404(db, group_id)

    # Nullify group_id on all tasks in this group
    await db.execute(
        update(Task).where(Task.group_id == group_id).values(group_id=None)
    )

    await db.delete(group)
    await db.commit()


@router.post("/projects/{project_id}/groups/reorder", response_model=list[TaskGroupResponse])
async def reorder_groups(
    project_id: uuid.UUID,
    body: TaskGroupReorder,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Bulk reorder task groups. Receives ordered list of group_ids, updates order field."""
    await _check_project_exists(db, project_id)

    # Fetch all groups for this project to validate
    result = await db.execute(
        select(TaskGroup).where(TaskGroup.project_id == project_id)
    )
    groups = {g.id: g for g in result.scalars().all()}

    # Validate all provided IDs belong to this project
    for gid in body.group_ids:
        if gid not in groups:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Group {gid} not found in project",
            )

    # Update order based on position in the list
    for idx, gid in enumerate(body.group_ids):
        groups[gid].order = idx

    await db.commit()

    # Return updated list using the list endpoint logic
    return await list_project_groups(project_id, db, _current_user)


@router.post("/groups/{group_id}/merge/{target_group_id}", response_model=TaskGroupResponse)
async def merge_groups(
    group_id: uuid.UUID,
    target_group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Merge: move all tasks from source group to target, then delete source group."""
    if group_id == target_group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot merge a group into itself",
        )

    source = await _get_group_or_404(db, group_id)
    target = await _get_group_or_404(db, target_group_id)

    if source.project_id != target.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target groups must belong to the same project",
        )

    # Move all tasks from source to target
    await db.execute(
        update(Task).where(Task.group_id == group_id).values(group_id=target_group_id)
    )

    # Delete source group
    await db.delete(source)
    await db.commit()

    # Return target group with updated task count
    await db.refresh(target)
    result = await db.execute(
        select(func.count()).where(Task.group_id == target_group_id)
    )
    task_count = result.scalar() or 0

    return TaskGroupResponse(
        id=target.id,
        project_id=target.project_id,
        name=target.name,
        color=target.color,
        order=target.order,
        status=target.status,
        description=target.description,
        task_count=task_count,
        created_at=target.created_at,
    )


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
    parent_id: uuid.UUID | None = Query(None, alias="parent_id"),
    top_level: bool | None = Query(None, description="If true, only return tasks with no parent"),
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
    if top_level is True:
        query = query.where(Task.parent_id.is_(None))
    elif parent_id is not None:
        query = query.where(Task.parent_id == parent_id)
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


@router.get("/projects/{project_id}/tasks/tree", response_model=TaskTreeResponse)
async def get_project_task_tree(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Return tasks in a tree structure (top-level tasks with nested children)."""
    await _check_project_exists(db, project_id)

    # Fetch all tasks for the project
    result = await db.execute(
        select(Task).where(Task.project_id == project_id).order_by(Task.created_at.asc())
    )
    all_tasks = result.scalars().all()

    # Build tree in memory
    task_map: dict[uuid.UUID, dict] = {}
    for t in all_tasks:
        task_map[t.id] = {
            "id": t.id,
            "project_id": t.project_id,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date,
            "parent_id": t.parent_id,
            "created_at": t.created_at,
            "children": [],
        }

    roots: list[dict] = []
    for t in all_tasks:
        node = task_map[t.id]
        if t.parent_id is not None and t.parent_id in task_map:
            task_map[t.parent_id]["children"].append(node)
        else:
            roots.append(node)

    return {"data": [TaskTreeNode.model_validate(r) for r in roots]}


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    project_id: uuid.UUID,
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new task in a project."""
    await _check_project_exists(db, project_id)

    # Validate parent_id if provided
    if body.parent_id is not None:
        await _validate_parent(db, body.parent_id, project_id)

    # Validate group_id if provided
    if body.group_id is not None:
        group = await _get_group_or_404(db, body.group_id)
        if group.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task group must belong to the same project",
            )

    task = Task(
        project_id=project_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
        due_date=body.due_date,
        parent_id=body.parent_id,
        group_id=body.group_id,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(task)
    await db.flush()
    task_id = task.id  # capture before commit expires the object
    await db.commit()

    # Re-fetch with assignees and children loaded
    task = await _get_task_or_404(db, task_id, load_assignees=True, load_children=True)
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


@router.post("/tasks/carryover")
async def carryover_tasks(
    body: TaskCarryoverRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Carry over incomplete tasks by updating their due_date.

    Only updates tasks that are NOT in 'done' status.
    """
    if not body.task_ids:
        return {"data": []}

    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.assignees).selectinload(TaskAssignee.user),
            selectinload(Task.children),
        )
        .where(
            Task.id.in_(body.task_ids),
            Task.status != TaskStatus.done,
        )
    )
    tasks = result.scalars().unique().all()

    for task in tasks:
        task.due_date = body.new_due_date
        task.updated_by = current_user.id

    await db.commit()

    return {
        "data": [TaskResponse.model_validate(t) for t in tasks],
    }


@router.get("/tasks/summary-by-student")
async def task_summary_by_student(
    week_start: date = Query(..., description="Start of week (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Return task completion stats grouped by student (assignee).

    Counts tasks assigned to each user, grouped by status.
    """
    query = (
        select(
            TaskAssignee.user_id,
            User.name,
            Task.status,
            func.count().label("cnt"),
        )
        .join(Task, TaskAssignee.task_id == Task.id)
        .join(User, TaskAssignee.user_id == User.id)
        .where(User.role == UserRole.student)
        .group_by(TaskAssignee.user_id, User.name, Task.status)
    )
    result = await db.execute(query)
    rows = result.all()

    # Aggregate by user
    by_user: dict[uuid.UUID, dict] = {}
    for row in rows:
        entry = by_user.setdefault(
            row.user_id,
            {
                "user_id": str(row.user_id),
                "name": row.name,
                "done": 0,
                "in_progress": 0,
                "todo": 0,
                "blocked": 0,
            },
        )
        status_key = row.status.value if hasattr(row.status, "value") else row.status
        if status_key == "done":
            entry["done"] += row.cnt
        elif status_key == "in_progress":
            entry["in_progress"] += row.cnt
        elif status_key == "todo":
            entry["todo"] += row.cnt
        elif status_key == "blocked":
            entry["blocked"] += row.cnt

    return {"data": list(by_user.values())}


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get task detail with assignees and children."""
    task = await _get_task_or_404(db, task_id, load_assignees=True, load_children=True)
    return task


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a task's fields (including reparenting via parent_id)."""
    task = await _get_task_or_404(db, task_id)

    update_data = body.model_dump(exclude_unset=True)

    # Validate parent_id if being changed
    if "parent_id" in update_data and update_data["parent_id"] is not None:
        await _validate_parent(db, update_data["parent_id"], task.project_id, task_id=task_id)

    # Validate group_id if being changed
    if "group_id" in update_data and update_data["group_id"] is not None:
        group = await _get_group_or_404(db, update_data["group_id"])
        if group.project_id != task.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task group must belong to the same project",
            )

    for field, value in update_data.items():
        setattr(task, field, value)
    task.updated_by = current_user.id

    await db.commit()

    # Re-fetch with assignees and children
    task = await _get_task_or_404(db, task_id, load_assignees=True, load_children=True)
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

    # Re-fetch with assignees and children
    task = await _get_task_or_404(db, task_id, load_assignees=True, load_children=True)
    return task


# ── Task hierarchy endpoints ────────────────────────────────────────────────


@router.post("/tasks/{task_id}/group", response_model=TaskResponse)
async def group_tasks(
    task_id: uuid.UUID,
    body: TaskGroupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Group tasks under a parent. Sets parent_id of all specified child tasks to task_id.

    Validates:
    - All tasks belong to the same project
    - No circular references
    - Max depth limit of 3 levels
    """
    parent_task = await _get_task_or_404(db, task_id)

    # Cannot group a task under itself
    if task_id in body.child_task_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A task cannot be grouped under itself",
        )

    # Get the depth of the parent
    parent_depth = await _get_depth(db, task_id)

    # Get ancestor IDs of the parent to detect circular references
    parent_ancestors = await _get_ancestor_ids(db, task_id)

    # Fetch all child tasks
    result = await db.execute(
        select(Task).where(Task.id.in_(body.child_task_ids))
    )
    child_tasks = result.scalars().all()

    if len(child_tasks) != len(body.child_task_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more child tasks not found",
        )

    for child in child_tasks:
        # Same project check
        if child.project_id != parent_task.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Task {child.id} belongs to a different project",
            )

        # Circular reference check
        if child.id in parent_ancestors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Circular reference: task {child.id} is an ancestor of the parent",
            )

        # Depth check: child will be at parent_depth + 1, plus its own subtree
        subtree_depth = await _get_max_subtree_depth(db, child.id)
        if parent_depth + 1 + subtree_depth >= MAX_HIERARCHY_DEPTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Grouping task {child.id} would exceed max depth of {MAX_HIERARCHY_DEPTH} levels",
            )

    # All validations passed — apply
    for child in child_tasks:
        child.parent_id = task_id
        child.updated_by = current_user.id

    parent_task.updated_by = current_user.id
    await db.commit()

    # Re-fetch parent with all relationships
    task = await _get_task_or_404(db, task_id, load_assignees=True, load_children=True)
    return task


@router.post("/tasks/{task_id}/ungroup", response_model=TaskResponse)
async def ungroup_tasks(
    task_id: uuid.UUID,
    body: TaskUngroupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ungroup children from a parent task. Sets parent_id to NULL.

    If child_task_ids is empty, ungroups all children.
    """
    parent_task = await _get_task_or_404(db, task_id)

    if body.child_task_ids:
        # Ungroup specific children
        result = await db.execute(
            select(Task).where(
                Task.id.in_(body.child_task_ids),
                Task.parent_id == task_id,
            )
        )
        children = result.scalars().all()

        found_ids = {c.id for c in children}
        missing = set(body.child_task_ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tasks {[str(m) for m in missing]} are not children of this task",
            )
    else:
        # Ungroup all children
        result = await db.execute(
            select(Task).where(Task.parent_id == task_id)
        )
        children = result.scalars().all()

    for child in children:
        child.parent_id = None
        child.updated_by = current_user.id

    parent_task.updated_by = current_user.id
    await db.commit()

    # Re-fetch parent with all relationships
    task = await _get_task_or_404(db, task_id, load_assignees=True, load_children=True)
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
