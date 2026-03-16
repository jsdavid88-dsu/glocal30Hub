import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.sota import SotaAssignmentStatus


# ── SotaItem Schemas ──────────────────────────────────────────────────────


class SotaItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    source: str | None = None
    url: str | None = None
    summary: str | None = None
    published_at: datetime | None = None


class SotaItemUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    source: str | None = None
    url: str | None = None
    summary: str | None = None
    published_at: datetime | None = None


class SotaItemResponse(BaseModel):
    id: uuid.UUID
    title: str
    source: str | None = None
    url: str | None = None
    summary: str | None = None
    published_at: datetime | None = None
    created_at: datetime
    assignments_count: int = 0
    llm_analysis: Optional[str] = None  # Phase 4: LLM paper analysis placeholder

    model_config = {"from_attributes": True}


class SotaReviewResponse(BaseModel):
    id: uuid.UUID
    sota_assignment_id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewer_name: str = ""
    content: str
    submitted_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SotaAssignmentResponse(BaseModel):
    id: uuid.UUID
    sota_item_id: uuid.UUID
    assignee_id: uuid.UUID
    assignee_name: str = ""
    assigned_by: uuid.UUID | None = None
    status: SotaAssignmentStatus
    due_date: date | None = None
    created_at: datetime
    reviews: list[SotaReviewResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class SotaItemDetail(SotaItemResponse):
    assignments: list[SotaAssignmentResponse] = Field(default_factory=list)


# ── SotaAssignment Schemas ────────────────────────────────────────────────


class SotaAssignmentCreate(BaseModel):
    assignee_id: uuid.UUID
    due_date: date | None = None


class SotaAssignmentUpdate(BaseModel):
    status: SotaAssignmentStatus | None = None
    due_date: date | None = None


# ── SotaReview Schemas ────────────────────────────────────────────────────


class SotaReviewCreate(BaseModel):
    content: str = Field(..., min_length=1)
