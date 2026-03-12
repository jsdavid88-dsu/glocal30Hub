import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.daily import BlockVisibility


class EventType(str, enum.Enum):
    class_ = "class"
    meeting = "meeting"
    deadline = "deadline"
    presentation = "presentation"
    leave = "leave"
    admin = "admin"
    personal = "personal"
    project = "project"
    sota = "sota"


class EventSource(str, enum.Enum):
    manual = "manual"
    task = "task"
    google_calendar = "google_calendar"


class Event(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("end_at >= start_at", name="ck_events_end_gte_start"),
        Index("ix_events_project_id", "project_id"),
        Index("ix_events_task_id", "task_id"),
        Index("ix_events_creator_id", "creator_id"),
        Index("ix_events_start_at", "start_at"),
        Index("ix_events_end_at", "end_at"),
        Index("ix_events_event_type", "event_type"),
        Index("ix_events_visibility", "visibility"),
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    event_type: Mapped[EventType] = mapped_column(
        Enum(EventType, values_callable=lambda e: [x.value for x in e]), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    creator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    visibility: Mapped[BlockVisibility] = mapped_column(
        Enum(BlockVisibility), nullable=False
    )
    source: Mapped[EventSource] = mapped_column(
        Enum(EventSource), nullable=False, default=EventSource.manual
    )

    participants: Mapped[list["EventParticipant"]] = relationship(back_populates="event")
    creator: Mapped["User"] = relationship()


class EventParticipant(UUIDMixin, Base):
    __tablename__ = "event_participants"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id"),
        Index("ix_event_participants_user_id", "user_id"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    participant_role: Mapped[str | None] = mapped_column(String(50), nullable=True)

    event: Mapped["Event"] = relationship(back_populates="participants")
    user: Mapped["User"] = relationship()
