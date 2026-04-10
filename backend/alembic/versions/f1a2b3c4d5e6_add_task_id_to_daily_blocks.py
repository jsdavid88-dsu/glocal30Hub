"""add_task_id_to_daily_blocks

Revision ID: f1a2b3c4d5e6
Revises: 61fcf26ee8b9
Create Date: 2026-03-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = '61fcf26ee8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'daily_blocks',
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_daily_blocks_task_id',
        'daily_blocks',
        'tasks',
        ['task_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_daily_blocks_task_id', 'daily_blocks', ['task_id'])


def downgrade() -> None:
    op.drop_index('ix_daily_blocks_task_id', table_name='daily_blocks')
    op.drop_constraint('fk_daily_blocks_task_id', 'daily_blocks', type_='foreignkey')
    op.drop_column('daily_blocks', 'task_id')
