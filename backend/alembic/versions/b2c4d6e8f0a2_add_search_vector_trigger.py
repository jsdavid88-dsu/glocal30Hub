"""add daily_blocks search_vector trigger

Revision ID: b2c4d6e8f0a2
Revises: 9d85b51412c9
Create Date: 2026-04-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b2c4d6e8f0a2'
down_revision: Union[str, None] = '9d85b51412c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION daily_blocks_search_vector_update()
        RETURNS trigger AS $$
        BEGIN
            NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content, ''));
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS daily_blocks_search_vector_trigger ON daily_blocks;
    """)
    op.execute("""
        CREATE TRIGGER daily_blocks_search_vector_trigger
            BEFORE INSERT OR UPDATE OF content ON daily_blocks
            FOR EACH ROW
            EXECUTE FUNCTION daily_blocks_search_vector_update();
    """)
    # Backfill existing rows
    op.execute("""
        UPDATE daily_blocks
        SET search_vector = to_tsvector('simple', COALESCE(content, ''));
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS daily_blocks_search_vector_trigger ON daily_blocks;")
    op.execute("DROP FUNCTION IF EXISTS daily_blocks_search_vector_update();")
