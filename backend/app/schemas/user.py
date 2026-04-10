import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole, UserStatus


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str
    role: UserRole
    status: UserStatus
    profile_image_url: str | None = None
    major_field: str | None = None
    interest_fields: list = Field(default_factory=list)
    company: str | None = None
    google_calendar_connected: bool = False
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserSummaryResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str
    role: UserRole
    status: UserStatus
    profile_image_url: str | None = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = None
    major_field: str | None = None
    interest_fields: list | None = None
    company: str | None = None
    profile_image_url: str | None = None


class UserListResponse(BaseModel):
    data: list[UserSummaryResponse]
    meta: dict


class AdvisorRelationResponse(BaseModel):
    id: uuid.UUID
    professor_id: uuid.UUID
    student_id: uuid.UUID
    professor: UserSummaryResponse | None = None
    student: UserSummaryResponse | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdvisorRelationCreate(BaseModel):
    professor_id: uuid.UUID
    student_id: uuid.UUID
