import uuid

from pydantic import BaseModel, Field

from app.models.tag import TagScopeType


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, max_length=20)
    scope_type: TagScopeType = TagScopeType.global_
    project_id: uuid.UUID | None = None


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = None


class TagResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str | None = None
    scope_type: TagScopeType
    project_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}
