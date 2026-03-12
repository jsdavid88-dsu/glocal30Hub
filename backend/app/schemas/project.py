import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.project import ProjectMemberRole, ProjectStatus
from app.schemas.user import UserSummaryResponse


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    status: ProjectStatus = ProjectStatus.active
    start_date: date | None = None
    end_date: date | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: ProjectStatus | None = None
    start_date: date | None = None
    end_date: date | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    status: ProjectStatus
    start_date: date | None = None
    end_date: date | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: ProjectStatus
    start_date: date | None = None
    end_date: date | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    data: list[ProjectSummaryResponse]
    meta: dict


class ProjectMemberResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    project_role: ProjectMemberRole
    joined_at: datetime
    user: UserSummaryResponse | None = None

    model_config = {"from_attributes": True}


class ProjectMemberCreate(BaseModel):
    user_id: uuid.UUID
    project_role: ProjectMemberRole = ProjectMemberRole.member
