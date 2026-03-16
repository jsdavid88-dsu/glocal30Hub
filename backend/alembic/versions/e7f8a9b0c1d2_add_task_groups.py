"""Add task_groups table and group_id to tasks

Revision ID: e7f8a9b0c1d2
Revises: d5e6f7a8b9c0
Create Date: 2026-03-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create task_groups table
    op.create_table(
        'task_groups',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('color', sa.String(length=20), nullable=False, server_default='#6366f1'),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.Enum('open', 'closed', name='taskgroupstatus'), nullable=False, server_default='open'),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_task_groups_project_id', 'task_groups', ['project_id'])

    # Add group_id column to tasks table
    op.add_column('tasks', sa.Column('group_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_group_id', 'tasks', 'task_groups',
        ['group_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_tasks_group_id', 'tasks', ['group_id'])


def downgrade() -> None:
    op.drop_index('ix_tasks_group_id', table_name='tasks')
    op.drop_constraint('fk_tasks_group_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'group_id')

    op.drop_index('ix_task_groups_project_id', table_name='task_groups')
    op.drop_table('task_groups')

    # Drop the enum type
    sa.Enum(name='taskgroupstatus').drop(op.get_bind(), checkfirst=True)
