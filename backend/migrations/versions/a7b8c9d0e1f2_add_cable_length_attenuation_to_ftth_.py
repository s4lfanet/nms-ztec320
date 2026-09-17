"""add cable length/attenuation to ftth otb odc odp odp_port jc

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-09-17 07:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7b8c9d0e1f2'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


_TABLES = ['ftth_otb', 'ftth_odc', 'ftth_odp', 'ftth_odp_port', 'ftth_jc']


def upgrade():
    for table in _TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(sa.Column('cable_length_meters', sa.Float(), nullable=True))
            batch_op.add_column(sa.Column('cable_attenuation_per_km', sa.Float(), nullable=True, server_default='0.35'))


def downgrade():
    for table in reversed(_TABLES):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_column('cable_attenuation_per_km')
            batch_op.drop_column('cable_length_meters')
