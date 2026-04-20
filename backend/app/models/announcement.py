import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class AnnouncementAudience(str, enum.Enum):
    everyone = "everyone"
    professors = "professors"
    students = "students"
    project = "project"


class Announcement(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "announcements"
    __table_args__ = (
        CheckConstraint(
            "(audience = 'project' AND project_id IS NOT NULL) OR "
            "(audience != 'project' AND project_id IS NULL)",
            name="ck_announcements_project_audience",
        ),
        Index("ix_announcements_audience", "audience"),
        Index("ix_announcements_author_id", "author_id"),
        Index("ix_announcements_project_id", "project_id"),
        Index("ix_announcements_pinned", "pinned"),
        Index("ix_announcements_expires_at", "expires_at"),
    )

    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[AnnouncementAudience] = mapped_column(
        Enum(AnnouncementAudience, values_callable=lambda e: [x.value for x in e]),
        nullable=False,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    author: Mapped["User"] = relationship()
    project: Mapped["Project | None"] = relationship()
    reads: Mapped[list["AnnouncementRead"]] = relationship(
        back_populates="announcement", cascade="all, delete-orphan"
    )


class AnnouncementRead(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "announcement_reads"
    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_announcement_reads"),
        Index("ix_announcement_reads_announcement_id", "announcement_id"),
        Index("ix_announcement_reads_user_id_announcement_id", "user_id", "announcement_id"),
    )

    announcement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    announcement: Mapped["Announcement"] = relationship(back_populates="reads")
