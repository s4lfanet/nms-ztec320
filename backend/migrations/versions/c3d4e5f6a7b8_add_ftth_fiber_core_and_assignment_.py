"""add ftth_fiber_core and ftth_core_assignment_history tables

Revision ID: c3d4e5f6a7b8
Revises: a7b8c9d0e1f2
Create Date: 2026-09-17 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('ftth_fiber_core',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_type', sa.String(length=10), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('core_number', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=15), nullable=False),
    sa.Column('assigned_to_type', sa.String(length=10), nullable=True),
    sa.Column('assigned_to_id', sa.Integer(), nullable=True),
    sa.Column('attenuation_db', sa.Float(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_type', 'owner_id', 'core_number', name='uq_fiber_core_owner_num')
    )
    op.create_table('ftth_core_assignment_history',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('core_id', sa.Integer(), nullable=False),
    sa.Column('action', sa.String(length=20), nullable=False),
    sa.Column('previous_status', sa.String(length=15), nullable=True),
    sa.Column('new_status', sa.String(length=15), nullable=True),
    sa.Column('assigned_to_type', sa.String(length=10), nullable=True),
    sa.Column('assigned_to_id', sa.Integer(), nullable=True),
    sa.Column('performed_by', sa.String(length=100), nullable=True),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['core_id'], ['ftth_fiber_core.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('ftth_core_assignment_history')
    op.drop_table('ftth_fiber_core')
