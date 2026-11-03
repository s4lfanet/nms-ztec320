"""add map_locked to onus

Revision ID: d4e5f6a7b8c0
Revises: c3d4e5f6a7b9
Create Date: 2026-11-03 11:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c0'
down_revision = 'c3d4e5f6a7b9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('onus', schema=None) as batch_op:
        batch_op.add_column(sa.Column('map_locked', sa.Boolean(), server_default='0'))


def downgrade():
    with op.batch_alter_table('onus', schema=None) as batch_op:
        batch_op.drop_column('map_locked')
