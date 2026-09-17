"""add optical budget fields to ftth_odc and ftth_odp

Revision ID: f1a2b3c4d5e6
Revises: 77cd667a1e6b
Create Date: 2026-09-17 06:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = '77cd667a1e6b'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ftth_odc', schema=None) as batch_op:
        batch_op.add_column(sa.Column('splitter_ratio_type', sa.String(length=10), nullable=True, server_default='even'))
        batch_op.add_column(sa.Column('splitter_tap_loss_db', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('splitter_through_loss_db', sa.Float(), nullable=True))

    with op.batch_alter_table('ftth_odp', schema=None) as batch_op:
        batch_op.add_column(sa.Column('splitter_ratio_type', sa.String(length=10), nullable=True, server_default='even'))
        batch_op.add_column(sa.Column('splitter_tap_loss_db', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('splitter_through_loss_db', sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table('ftth_odp', schema=None) as batch_op:
        batch_op.drop_column('splitter_through_loss_db')
        batch_op.drop_column('splitter_tap_loss_db')
        batch_op.drop_column('splitter_ratio_type')

    with op.batch_alter_table('ftth_odc', schema=None) as batch_op:
        batch_op.drop_column('splitter_through_loss_db')
        batch_op.drop_column('splitter_tap_loss_db')
        batch_op.drop_column('splitter_ratio_type')
