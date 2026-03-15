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
    op.create_table('attachments',
        sa.Column('owner_type', sa.Enum('daily_block', 'task', 'report_snapshot', 'project', 'event', name='attachmentownertype'), nullable=False),
        sa.Column('owner_id', sa.UUID(), nullable=False),
        sa.Column('file_type', sa.String(length=50), nullable=True),
        sa.Column('file_url', sa.String(), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('storage_kind', sa.String(length=50), nullable=True),
        sa.Column('preview_status', sa.String(length=50), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default='now()', nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_attachments_owner_type_owner_id', 'attachments', ['owner_type', 'owner_id'], unique=False)
    op.create_index('ix_attachments_created_by', 'attachments', ['created_by'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_attachments_created_by', table_name='attachments')
    op.drop_index('ix_attachments_owner_type_owner_id', table_name='attachments')
    op.drop_table('attachments')
    op.execute("DROP TYPE IF EXISTS attachmentownertype")
