"""add user theme + language preference columns

Fase 10 — dark/light/system theme and id/en language stored per user.
Also merges the two open heads (e5f6a7b8c9d1 api_tokens branch and
d4e5f6a7b8c9 parent_odp_port_id branch) back into a single head.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d1, d4e5f6a7b8c9
Create Date: 2026-11-03 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = ('e5f6a7b8c9d1', 'd4e5f6a7b8c9')
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('theme', sa.String(10), server_default='system'))
    op.add_column('users', sa.Column('language', sa.String(5), server_default='id'))


def downgrade():
    op.drop_column('users', 'language')
    op.drop_column('users', 'theme')
