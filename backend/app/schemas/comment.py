import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class CommentResponse(BaseModel):
    id: uuid.UUID
    daily_block_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
