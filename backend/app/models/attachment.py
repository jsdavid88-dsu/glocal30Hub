import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class AttachmentOwnerType(str, enum.Enum):
    daily_block = "daily_block"
    task = "task"
    report_snapshot = "report_snapshot"
    project = "project"
    event = "event"


class Attachment(UUIDMixin, Base):
    __tablename__ = "attachments"
    __table_args__ = (
        Index("ix_attachments_owner_type_owner_id", "owner_type", "owner_id"),
        Index("ix_attachments_created_by", "created_by"),
    )

    owner_type: Mapped[AttachmentOwnerType] = mapped_column(
        Enum(AttachmentOwnerType), nullable=False
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    file_url: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    storage_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preview_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )
