"""add action_logs hash chain columns (Fase 11)

prev_hash + hash make the audit log tamper-evident: hash = sha256(row
payload + prev_hash). Legacy rows are backfilled at app startup by
audit_chain.backfill_missing_hashes().

Revision ID: g7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-03 19:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'g7a8b9c0d1e2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('action_logs', sa.Column('prev_hash', sa.String(64), server_default=''))
    op.add_column('action_logs', sa.Column('hash', sa.String(64), server_default=''))


def downgrade():
    op.drop_column('action_logs', 'hash')
    op.drop_column('action_logs', 'prev_hash')
