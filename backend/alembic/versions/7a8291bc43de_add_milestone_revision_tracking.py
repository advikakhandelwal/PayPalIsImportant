"""add_milestone_revision_tracking

Revision ID: 7a8291bc43de
Revises: 4b768ffdc7cf
Create Date: 2026-11-11 00:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a8291bc43de'
down_revision: Union[str, Sequence[str], None] = '4b768ffdc7cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely using batch mode for SQLite compatibility."""
    with op.batch_alter_table('milestones', schema=None) as batch_op:
        batch_op.add_column(sa.Column('revision_count', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('max_revisions_reached', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('latest_revision_request', sa.JSON(), nullable=True))

    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('revision_number', sa.Integer(), server_default='1', nullable=False))
        batch_op.add_column(sa.Column('review_status', sa.String(length=50), server_default='IN_REVIEW', nullable=False))
        batch_op.add_column(sa.Column('revision_request', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema safely using batch mode."""
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('revision_request')
        batch_op.drop_column('review_status')
        batch_op.drop_column('revision_number')

    with op.batch_alter_table('milestones', schema=None) as batch_op:
        batch_op.drop_column('latest_revision_request')
        batch_op.drop_column('max_revisions_reached')
        batch_op.drop_column('revision_count')

