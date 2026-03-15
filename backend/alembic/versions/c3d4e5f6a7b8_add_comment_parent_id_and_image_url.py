"""Add parent_id and image_url to comments

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-03-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('comments', sa.Column('parent_id', sa.UUID(), nullable=True))
    op.add_column('comments', sa.Column('image_url', sa.String(), nullable=True))
    op.create_foreign_key(
        'fk_comments_parent_id',
        'comments', 'comments',
        ['parent_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_comments_parent_id', 'comments', ['parent_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_comments_parent_id', table_name='comments')
    op.drop_constraint('fk_comments_parent_id', 'comments', type_='foreignkey')
    op.drop_column('comments', 'image_url')
    op.drop_column('comments', 'parent_id')
