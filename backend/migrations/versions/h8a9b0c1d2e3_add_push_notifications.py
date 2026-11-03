"""add alert_rules.notify_push + push_subscriptions table (Fase 14)

Web Push (VAPID) notification channel: per-rule toggle plus per-user
browser subscription storage.

Revision ID: h8a9b0c1d2e3
Revises: g7a8b9c0d1e2
Create Date: 2026-11-03 21:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'h8a9b0c1d2e3'
down_revision = 'g7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('alert_rules', sa.Column('notify_push', sa.Boolean(), server_default='0'))
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.String(200), server_default=''),
        sa.Column('auth', sa.String(100), server_default=''),
        sa.Column('user_agent', sa.String(300), server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('endpoint', name='uq_push_subscriptions_endpoint'),
    )


def downgrade():
    op.drop_table('push_subscriptions')
    op.drop_column('alert_rules', 'notify_push')
