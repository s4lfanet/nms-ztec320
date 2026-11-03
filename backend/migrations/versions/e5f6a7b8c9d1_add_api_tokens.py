"""add api_tokens table

Revision ID: e5f6a7b8c9d1
Revises: d4e5f6a7b8c0
Create Date: 2026-11-03 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d1'
down_revision = 'd4e5f6a7b8c0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'api_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('token_hash', sa.String(128), nullable=False),
        sa.Column('prefix', sa.String(12), server_default=''),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('abilities', sa.String(200), server_default='*'),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('last_used_ip', sa.String(45), server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('revoked', sa.Boolean(), server_default='0'),
        sa.UniqueConstraint('token_hash', name='uq_api_tokens_hash'),
    )
    op.create_index('ix_api_tokens_token_hash', 'api_tokens', ['token_hash'])


def downgrade():
    op.drop_index('ix_api_tokens_token_hash', table_name='api_tokens')
    op.drop_table('api_tokens')
