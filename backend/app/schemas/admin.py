import uuid
from datetime import date

from pydantic import BaseModel, Field

from app.models.tag import TagScopeType
from app.models.user import UserRole, UserStatus


# ── User Management Schemas ──────────────────────────────────


class AdminUserRoleUpdate(BaseModel):
    role: UserRole


class AdminUserStatusUpdate(BaseModel):
    status: UserStatus


class AdminAdvisorAssign(BaseModel):
    professor_id: uuid.UUID


# ── Project Management Schemas ───────────────────────────────


class AdminProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    status: str = "active"
    start_date: date | None = None
    end_date: date | None = None


class AdminProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = None
    start_date: date | None = None
    end_date: date | None = None


# ── Tag Management Schemas ───────────────────────────────────


class AdminTagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, max_length=20)
    scope_type: TagScopeType = TagScopeType.global_
    project_id: uuid.UUID | None = None


class AdminTagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = None
