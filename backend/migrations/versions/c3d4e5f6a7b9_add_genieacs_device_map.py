"""add genieacs_device_map table

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
Create Date: 2026-11-03 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b9'
down_revision = 'b2c3d4e5f6a8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'genieacs_device_map',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('onu_id', sa.Integer(), sa.ForeignKey('onus.id'), nullable=False),
        sa.Column('device_id', sa.String(128), nullable=False),
        sa.Column('match_method', sa.String(20), server_default='serial'),
        sa.Column('pinned', sa.Boolean(), server_default='0'),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('onu_id', name='uq_genieacs_map_onu'),
    )
    op.create_index('ix_genieacs_map_device_id', 'genieacs_device_map', ['device_id'])


def downgrade():
    op.drop_index('ix_genieacs_map_device_id', table_name='genieacs_device_map')
    op.drop_table('genieacs_device_map')
