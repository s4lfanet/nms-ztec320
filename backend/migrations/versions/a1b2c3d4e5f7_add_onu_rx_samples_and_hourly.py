"""add onu_rx_samples and onu_rx_hourly tables

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-11-03 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f7'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'onu_rx_samples',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('onu_id', sa.Integer(), sa.ForeignKey('onus.id'), nullable=False),
        sa.Column('olt_id', sa.Integer(), sa.ForeignKey('olts.id'), nullable=False),
        sa.Column('rx_dbm', sa.Float(), nullable=True),
        sa.Column('tx_dbm', sa.Float(), nullable=True),
        sa.Column('onu_rx_dbm', sa.Float(), nullable=True),
        sa.Column('polled_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_onu_rx_samples_onu_time', 'onu_rx_samples', ['onu_id', 'polled_at'])
    op.create_index('ix_onu_rx_samples_olt_time', 'onu_rx_samples', ['olt_id', 'polled_at'])

    op.create_table(
        'onu_rx_hourly',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('onu_id', sa.Integer(), sa.ForeignKey('onus.id'), nullable=False),
        sa.Column('olt_id', sa.Integer(), sa.ForeignKey('olts.id'), nullable=False),
        sa.Column('hour', sa.DateTime(), nullable=False),
        sa.Column('rx_min', sa.Float(), nullable=True),
        sa.Column('rx_avg', sa.Float(), nullable=True),
        sa.Column('rx_max', sa.Float(), nullable=True),
        sa.Column('tx_avg', sa.Float(), nullable=True),
        sa.Column('onu_rx_avg', sa.Float(), nullable=True),
        sa.Column('samples', sa.Integer(), server_default='0'),
        sa.UniqueConstraint('onu_id', 'hour', name='uq_onu_rx_hourly_onu_hour'),
    )
    op.create_index('ix_onu_rx_hourly_onu_time', 'onu_rx_hourly', ['onu_id', 'hour'])
    op.create_index('ix_onu_rx_hourly_olt_time', 'onu_rx_hourly', ['olt_id', 'hour'])


def downgrade():
    op.drop_index('ix_onu_rx_hourly_olt_time', table_name='onu_rx_hourly')
    op.drop_index('ix_onu_rx_hourly_onu_time', table_name='onu_rx_hourly')
    op.drop_table('onu_rx_hourly')
    op.drop_index('ix_onu_rx_samples_olt_time', table_name='onu_rx_samples')
    op.drop_index('ix_onu_rx_samples_onu_time', table_name='onu_rx_samples')
    op.drop_table('onu_rx_samples')
