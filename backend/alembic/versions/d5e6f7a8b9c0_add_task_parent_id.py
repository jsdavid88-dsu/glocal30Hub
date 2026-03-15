"""Add parent_id to tasks for hierarchy support

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f6a7b8
Create Date: 2026-03-15 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('parent_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_parent_id', 'tasks', 'tasks',
        ['parent_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_tasks_parent_id', 'tasks', ['parent_id'])


def downgrade() -> None:
    op.drop_index('ix_tasks_parent_id', table_name='tasks')
    op.drop_constraint('fk_tasks_parent_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'parent_id')
