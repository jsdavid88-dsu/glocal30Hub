import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.task import TaskPriority, TaskStatus
from app.schemas.user import UserSummaryResponse


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority = TaskPriority.medium
    due_date: date | None = None
    parent_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority | None = None
    due_date: date | None = None
    parent_id: uuid.UUID | None = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskAssigneeCreate(BaseModel):
    user_id: uuid.UUID
    is_primary: bool = False


class TaskAssigneeResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    is_primary: bool
    assigned_by: uuid.UUID | None = None
    assigned_at: datetime
    user: UserSummaryResponse | None = None

    model_config = {"from_attributes": True}


class TaskSummaryResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None = None
    parent_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None = None
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None = None
    parent_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    updated_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    assignees: list[TaskAssigneeResponse] = Field(default_factory=list)
    children: list[TaskSummaryResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TaskTreeNode(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None = None
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None = None
    parent_id: uuid.UUID | None = None
    created_at: datetime
    children: list["TaskTreeNode"] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    data: list[TaskSummaryResponse]
    meta: dict


class TaskTreeResponse(BaseModel):
    data: list[TaskTreeNode]
