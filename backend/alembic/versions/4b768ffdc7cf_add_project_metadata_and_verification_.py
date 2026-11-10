"""add_project_metadata_and_verification_status

Revision ID: 4b768ffdc7cf
Revises: 
Create Date: 2026-11-10 22:02:03.673405

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b768ffdc7cf'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely using batch mode for SQLite compatibility."""
    with op.batch_alter_table('projects', schema=None) as batch_op:
        batch_op.add_column(sa.Column('required_skills', sa.JSON(), server_default='[]', nullable=False))
        batch_op.add_column(sa.Column('experience_level', sa.String(length=50), server_default='Intermediate', nullable=False))
        batch_op.add_column(sa.Column('additional_requirements', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('proposed_milestones', sa.JSON(), server_default='[]', nullable=False))

    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('verification_status', sa.Enum('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED', name='verificationstatus'), server_default='PENDING', nullable=False))


def downgrade() -> None:
    """Downgrade schema safely using batch mode."""
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('verification_status')

    with op.batch_alter_table('projects', schema=None) as batch_op:
        batch_op.drop_column('proposed_milestones')
        batch_op.drop_column('additional_requirements')
        batch_op.drop_column('experience_level')
        batch_op.drop_column('required_skills')
