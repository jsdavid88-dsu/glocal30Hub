"""add_announcement_and_push_tables

Revision ID: c1d2e3f4a5b6
Revises: a0b1c2d3e4f5
Create Date: 2026-04-15 12:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'a0b1c2d3e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- announcements ---
    op.create_table(
        'announcements',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('author_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('audience', sa.Enum('everyone', 'professors', 'students', 'project',
                                      name='announcementaudience',
                                      values_callable=None), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('pinned', sa.Boolean(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.CheckConstraint(
            "(audience = 'project' AND project_id IS NOT NULL) OR "
            "(audience != 'project' AND project_id IS NULL)",
            name='ck_announcements_project_audience',
        ),
    )
    op.create_index('ix_announcements_audience', 'announcements', ['audience'])
    op.create_index('ix_announcements_author_id', 'announcements', ['author_id'])
    op.create_index('ix_announcements_project_id', 'announcements', ['project_id'])
    op.create_index('ix_announcements_pinned', 'announcements', ['pinned'])
    op.create_index('ix_announcements_expires_at', 'announcements', ['expires_at'])

    # --- announcement_reads ---
    op.create_table(
        'announcement_reads',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('announcement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['announcement_id'], ['announcements.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('announcement_id', 'user_id', name='uq_announcement_reads'),
    )
    op.create_index('ix_announcement_reads_announcement_id', 'announcement_reads', ['announcement_id'])
    op.create_index('ix_announcement_reads_user_id_announcement_id', 'announcement_reads', ['user_id', 'announcement_id'])

    # --- push_subscriptions ---
    op.create_table(
        'push_subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.String(256), nullable=False),
        sa.Column('auth', sa.String(256), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'endpoint', name='uq_push_subscriptions_user_endpoint'),
    )
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'])


def downgrade() -> None:
    op.drop_table('push_subscriptions')
    op.drop_table('announcement_reads')
    op.drop_table('announcements')
    op.execute("DROP TYPE IF EXISTS announcementaudience")
