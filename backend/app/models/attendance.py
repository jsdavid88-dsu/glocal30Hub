import enum
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class AttendanceType(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"


class Attendance(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("user_id", "date", "type"),
        CheckConstraint("check_out >= check_in", name="ck_attendance_check_out_gte_check_in"),
        Index("ix_attendance_date", "date"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    check_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    type: Mapped[AttendanceType] = mapped_column(
        Enum(AttendanceType), nullable=False, default=AttendanceType.daily
    )

    user: Mapped["User"] = relationship()
