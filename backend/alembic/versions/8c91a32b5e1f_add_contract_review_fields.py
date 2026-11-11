"""add_contract_review_fields

Revision ID: 8c91a32b5e1f
Revises: 7a8291bc43de
Create Date: 2026-11-11 03:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8c91a32b5e1f'
down_revision: Union[str, Sequence[str], None] = '7a8291bc43de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely using batch mode for SQLite compatibility."""
    with op.batch_alter_table('contracts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('client_rating', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('client_review', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema safely using batch mode."""
    with op.batch_alter_table('contracts', schema=None) as batch_op:
        batch_op.drop_column('reviewed_at')
        batch_op.drop_column('client_review')
        batch_op.drop_column('client_rating')

