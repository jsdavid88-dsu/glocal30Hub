"""add_announcement_enum_value

Revision ID: a0b1c2d3e4f5
Revises: b2c4d6e8f0a2
Create Date: 2026-04-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, None] = 'b2c4d6e8f0a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'announcement'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; no-op
    pass
