import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Comment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_daily_block_id", "daily_block_id"),
        Index("ix_comments_author_id", "author_id"),
        Index("ix_comments_created_at", "created_at"),
        Index("ix_comments_parent_id", "parent_id"),
    )

    daily_block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("daily_blocks.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(String, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True
    )

    author: Mapped["User"] = relationship()
    replies: Mapped[list["Comment"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="Comment.created_at",
    )
    parent: Mapped[Optional["Comment"]] = relationship(
        back_populates="replies",
        remote_side="Comment.id",
    )
