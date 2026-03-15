import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)
    parent_id: uuid.UUID | None = None
    image_url: str | None = None


class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class CommentResponse(BaseModel):
    id: uuid.UUID
    daily_block_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    content: str
    parent_id: uuid.UUID | None = None
    image_url: str | None = None
    replies: list["CommentResponse"] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
