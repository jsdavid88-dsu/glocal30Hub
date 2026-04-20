import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.announcement import AnnouncementAudience


class AnnouncementCreate(BaseModel):
    title: str = Field(max_length=200)
    body: str
    audience: AnnouncementAudience
    project_id: uuid.UUID | None = None
    pinned: bool = False
    expires_at: datetime | None = None


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = None
    pinned: bool | None = None
    expires_at: datetime | None = None


class AnnouncementAuthor(BaseModel):
    id: uuid.UUID
    name: str
    model_config = {"from_attributes": True}


class AnnouncementResponse(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    audience: AnnouncementAudience
    project_id: uuid.UUID | None
    pinned: bool
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime
    author: AnnouncementAuthor | None = None
    read_count: int = 0
    total_target: int = 0
    is_read: bool = False
    model_config = {"from_attributes": True}


class AnnouncementListResponse(BaseModel):
    data: list[AnnouncementResponse]
    next_cursor: str | None = None
    has_more: bool = False
