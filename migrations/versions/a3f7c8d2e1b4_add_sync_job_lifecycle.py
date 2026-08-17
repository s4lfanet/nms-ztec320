"""Add sync job lifecycle fields and SyncJob table

Revision ID: a3f7c8d2e1b4
Revises: 0943f5af8d94
Create Date: 2025-01-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a3f7c8d2e1b4'
down_revision = '0943f5af8d94'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to olt_sync_status
    with op.batch_alter_table('olt_sync_status', schema=None) as batch_op:
        batch_op.add_column(sa.Column('job_id', sa.String(36), nullable=True))
        batch_op.add_column(sa.Column('sync_type', sa.String(20), nullable=True, server_default='full'))
        batch_op.add_column(sa.Column('triggered_by', sa.String(50), nullable=True, server_default='manual'))
        batch_op.add_column(sa.Column('error_detail', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('duration_seconds', sa.Float(), nullable=True))

    # Create sync_jobs table
    op.create_table('sync_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.String(36), nullable=False),
        sa.Column('olt_id', sa.Integer(), nullable=False),
        sa.Column('sync_type', sa.String(20), nullable=True, server_default='full'),
        sa.Column('triggered_by', sa.String(50), nullable=True, server_default='manual'),
        sa.Column('status', sa.String(20), nullable=True, server_default='pending'),
        sa.Column('progress', sa.Integer(), nullable=True, server_default=0),
        sa.Column('message', sa.String(256), nullable=True, server_default=''),
        sa.Column('error_detail', sa.Text(), nullable=True),
        sa.Column('onu_count', sa.Integer(), nullable=True, server_default=0),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['olt_id'], ['olts.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('job_id'),
    )


def downgrade():
    op.drop_table('sync_jobs')

    with op.batch_alter_table('olt_sync_status', schema=None) as batch_op:
        batch_op.drop_column('duration_seconds')
        batch_op.drop_column('error_detail')
        batch_op.drop_column('triggered_by')
        batch_op.drop_column('sync_type')
        batch_op.drop_column('job_id')
