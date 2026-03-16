from pydantic import BaseModel
from datetime import date, datetime
from uuid import UUID
from typing import Optional, Any
from app.models.report import ReportType, ReportScopeType


class ReportCreate(BaseModel):
    report_type: ReportType
    title: str
    scope_type: ReportScopeType
    scope_id: Optional[UUID] = None
    period_start: date
    period_end: date
    content: dict = {}


class ReportResponse(BaseModel):
    id: UUID
    report_type: ReportType
    title: str
    scope_type: ReportScopeType
    scope_id: Optional[UUID]
    period_start: date
    period_end: date
    content: dict
    generated_by: Optional[UUID]
    created_at: datetime
    model_config = {"from_attributes": True}


class ReportGenerateRequest(BaseModel):
    """For future LLM integration - generates report content from data"""
    report_type: ReportType
    scope_type: ReportScopeType
    scope_id: Optional[UUID] = None
    period_start: date
    period_end: date
