#!/usr/bin/env python3
"""Traffic poller cron — enqueues traffic polling job to RQ worker.
Runs via cronjob every 5 minutes.
If RQ worker is unavailable, falls back to direct execution."""
import sys
sys.path.insert(0, '/opt/fibernms')
import os
os.chdir('/opt/fibernms')

import fcntl
from datetime import datetime

# File lock to prevent overlapping cron runs
_lock_fp = open('/tmp/traffic_poller.lock', 'w')
try:
    fcntl.flock(_lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
except (IOError, OSError):
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Another traffic_poller instance is running, skipping.')
    sys.exit(0)

try:
    from task_queue import enqueue_traffic_poll
    from redis import Redis
    from rq import Queue
    import time

    redis_conn = Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
    redis_conn.ping()

    # Enqueue traffic poll job
    job_id = enqueue_traffic_poll()
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Enqueued traffic poll job: {job_id}')

    # Wait for job to complete (max 4 minutes)
    q = Queue('sync', connection=redis_conn)
    job = q.fetch_job(job_id)
    if job:
        timeout = 240
        while not job.is_finished and not job.is_failed and timeout > 0:
            time.sleep(2)
            timeout -= 2
            job.refresh()

        if job.is_finished:
            result = job.result
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Traffic poll complete: {result}')
        elif job.is_failed:
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Traffic poll FAILED: {job.exc_info}')
        else:
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Traffic poll timed out (still running)')
    else:
        print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Could not fetch job status')

except Exception as e:
    # Fallback: run traffic_poller.py directly
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] RQ unavailable ({e}), falling back to direct execution')
    import subprocess
    subprocess.run([sys.executable, '/opt/fibernms/traffic_poller_direct.py'], check=False)
