import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class SotaAssignmentStatus(str, enum.Enum):
    recommended = "recommended"
    assigned = "assigned"
    in_review = "in_review"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class SotaItem(UUIDMixin, Base):
    __tablename__ = "sota_items"
    __table_args__ = (
        Index("ix_sota_items_published_at", "published_at"),
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    summary: Mapped[str | None] = mapped_column(String, nullable=True)
    url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )

    assignments: Mapped[list["SotaAssignment"]] = relationship(back_populates="sota_item")


class SotaAssignment(UUIDMixin, Base):
    __tablename__ = "sota_assignments"
    __table_args__ = (
        Index("ix_sota_assignments_assignee_id", "assignee_id"),
        Index("ix_sota_assignments_status", "status"),
        Index("ix_sota_assignments_due_date", "due_date"),
    )

    sota_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sota_items.id", ondelete="CASCADE"), nullable=False
    )
    assignee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    status: Mapped[SotaAssignmentStatus] = mapped_column(
        Enum(SotaAssignmentStatus), nullable=False, default=SotaAssignmentStatus.assigned
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )

    sota_item: Mapped["SotaItem"] = relationship(back_populates="assignments")
    assignee: Mapped["User"] = relationship(foreign_keys=[assignee_id])
    reviews: Mapped[list["SotaReview"]] = relationship(back_populates="sota_assignment")


class SotaReview(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sota_reviews"
    __table_args__ = (
        Index("ix_sota_reviews_sota_assignment_id", "sota_assignment_id"),
        Index("ix_sota_reviews_reviewer_id", "reviewer_id"),
    )

    sota_assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sota_assignments.id", ondelete="CASCADE"), nullable=False
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(String, nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sota_assignment: Mapped["SotaAssignment"] = relationship(back_populates="reviews")
    reviewer: Mapped["User"] = relationship()
