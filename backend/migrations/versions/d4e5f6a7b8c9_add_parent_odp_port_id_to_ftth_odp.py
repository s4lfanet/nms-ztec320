"""add parent_odp_port_id to ftth_odp (splitter cascade)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-17 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ftth_odp', schema=None) as batch_op:
        batch_op.add_column(sa.Column('parent_odp_port_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_ftth_odp_parent_odp_port_id', 'ftth_odp_port', ['parent_odp_port_id'], ['id'])


def downgrade():
    with op.batch_alter_table('ftth_odp', schema=None) as batch_op:
        batch_op.drop_constraint('fk_ftth_odp_parent_odp_port_id', type_='foreignkey')
        batch_op.drop_column('parent_odp_port_id')
