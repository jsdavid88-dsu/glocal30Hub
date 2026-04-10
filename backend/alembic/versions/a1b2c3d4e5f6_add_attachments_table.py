"""Add attachments table

Revision ID: a1b2c3d4e5f6
Revises: b80492053ef7
Create Date: 2026-03-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'b80492053ef7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op: attachments table already created in initial migration (b80492053ef7)
    pass


def downgrade() -> None:
    # No-op: matches upgrade
    pass
