"""Sync job lifecycle management — creates, updates, and records sync jobs.

This module provides a clean interface for tracking sync job lifecycle:
1. start_sync_job() — creates a SyncJob record, updates OLTSyncStatus
2. update_sync_job() — updates progress
3. complete_sync_job() — marks job completed/error, records duration
4. skip_sync_job() — marks job as skipped (already locked)

Usage in services_sync.py, auto_sync.py, app.py:
    from sync_job import start_sync_job, complete_sync_job

    job = start_sync_job(olt_id, sync_type='full', triggered_by='manual')
    # ... do sync work ...
    complete_sync_job(job, success=True, onu_count=42, message='Synced 42 ONUs')
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from models import db, OLTSyncStatus, SyncJob
from extensions import logger


def start_sync_job(olt_id: int, sync_type: str = 'full', triggered_by: str = 'manual') -> SyncJob:
    """Create a new sync job record and update OLTSyncStatus.

    Args:
        olt_id: OLT ID to sync
        sync_type: 'full', 'light', or 'auto'
        triggered_by: 'manual', 'auto', or 'action'

    Returns:
        SyncJob instance (not yet committed — caller commits)
    """
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Create SyncJob record
    job = SyncJob(
        job_id=job_id,
        olt_id=olt_id,
        sync_type=sync_type,
        triggered_by=triggered_by,
        status='running',
        progress=0,
        message='Starting synchronization...',
        started_at=now,
    )
    db.session.add(job)

    # Update OLTSyncStatus (current state)
    sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
    if not sync:
        sync = OLTSyncStatus(olt_id=olt_id)
        db.session.add(sync)
    sync.status = 'running'
    sync.progress = 0
    sync.message = 'Starting synchronization...'
    sync.started_at = now
    sync.completed_at = None
    sync.job_id = job_id
    sync.sync_type = sync_type
    sync.triggered_by = triggered_by
    sync.error_detail = None
    sync.duration_seconds = None

    db.session.commit()
    return job


def update_sync_job(job: SyncJob, pct: int, msg: str):
    """Update sync job progress."""
    job.progress = pct
    job.message = msg

    # Also update OLTSyncStatus
    sync = OLTSyncStatus.query.filter_by(olt_id=job.olt_id).first()
    if sync:
        sync.progress = pct
        sync.message = msg

    db.session.commit()


def complete_sync_job(job: SyncJob, success: bool, onu_count: int = 0,
                      message: str = '', error_detail: Optional[str] = None):
    """Mark a sync job as completed or failed.

    Args:
        job: SyncJob instance
        success: True if sync succeeded
        onu_count: Number of ONUs synced
        message: Status message
        error_detail: Error details if failed
    """
    now = datetime.now(timezone.utc)
    duration = None
    if job.started_at:
        started = job.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        duration = (now - started).total_seconds()

    job.status = 'completed' if success else 'error'
    job.progress = 100 if success else job.progress
    job.message = message
    job.error_detail = error_detail
    job.onu_count = onu_count
    job.completed_at = now
    job.duration_seconds = duration

    # Update OLTSyncStatus
    sync = OLTSyncStatus.query.filter_by(olt_id=job.olt_id).first()
    if sync:
        sync.status = 'completed' if success else 'error'
        sync.progress = 100 if success else sync.progress
        sync.message = message
        sync.completed_at = now
        sync.onu_count = onu_count
        sync.error_detail = error_detail
        sync.duration_seconds = duration

    db.session.commit()


def skip_sync_job(olt_id: int, sync_type: str = 'full', triggered_by: str = 'auto') -> SyncJob:
    """Record a skipped sync job (OLT already locked).

    Returns:
        SyncJob instance with status='skipped'
    """
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    job = SyncJob(
        job_id=job_id,
        olt_id=olt_id,
        sync_type=sync_type,
        triggered_by=triggered_by,
        status='skipped',
        message='Skipped — already syncing',
        started_at=now,
        completed_at=now,
        duration_seconds=0,
    )
    db.session.add(job)

    # Update OLTSyncStatus
    sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
    if sync:
        sync.status = 'skipped'
        sync.message = 'Sync already in progress — skipped'
        sync.completed_at = now
        sync.job_id = job_id
        sync.sync_type = sync_type
        sync.triggered_by = triggered_by

    db.session.commit()
    return job


def get_sync_history(olt_id: int, limit: int = 20) -> list[SyncJob]:
    """Get recent sync job history for an OLT."""
    return SyncJob.query.filter_by(olt_id=olt_id)\
        .order_by(SyncJob.created_at.desc())\
        .limit(limit)\
        .all()


def cleanup_old_jobs(days: int = 30):
    """Delete sync job records older than N days. Called by cron/maintenance."""
    cutoff = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    from datetime import timedelta
    cutoff -= timedelta(days=days)
    old_jobs = SyncJob.query.filter(SyncJob.created_at < cutoff).all()
    count = len(old_jobs)
    for job in old_jobs:
        db.session.delete(job)
    if count:
        db.session.commit()
        logger.info(f"Cleaned up {count} sync job records older than {days} days")
    return count
