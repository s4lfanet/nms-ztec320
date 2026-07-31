#!/usr/bin/env python3
"""RQ Worker process — listens on 'sync' queue for background tasks.
Run as a systemd service: rq-worker.service"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
os.chdir(os.path.dirname(__file__))

from redis import Redis
from rq import Worker, Queue
from task_queue import REDIS_URL

redis_conn = Redis.from_url(REDIS_URL)

if __name__ == '__main__':
    worker = Worker([Queue('sync', connection=redis_conn)], connection=redis_conn)
    print(f"Starting RQ worker on queue 'sync' (Redis: {REDIS_URL})")
    worker.work(logging_level='INFO')
