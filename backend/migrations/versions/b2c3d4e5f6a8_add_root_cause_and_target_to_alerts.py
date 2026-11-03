"""add root_cause_id, suppressed_by to alert_history and target_type, target_id to notifications

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-11-03 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a8'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('alert_history', schema=None) as batch_op:
        batch_op.add_column(sa.Column('root_cause_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('suppressed_by', sa.String(length=50), server_default=''))

    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('target_type', sa.String(length=10), server_default=''))
        batch_op.add_column(sa.Column('target_id', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_column('target_id')
        batch_op.drop_column('target_type')

    with op.batch_alter_table('alert_history', schema=None) as batch_op:
        batch_op.drop_column('suppressed_by')
        batch_op.drop_column('root_cause_id')
