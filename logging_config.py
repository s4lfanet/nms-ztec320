"""Structured logging configuration for FiberNMS.

Provides JSON-formatted log output for production, readable format for development.
All modules should use: from extensions import logger
"""
import logging
import json
import os
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """JSON structured log formatter for production use."""

    def format(self, record):
        log_entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'level': record.levelname,
            'module': record.module,
            'func': record.funcName,
            'line': record.lineno,
            'message': record.getMessage(),
        }
        if record.exc_info:
            log_entry['exception'] = self.formatException(record.exc_info)
        if hasattr(record, 'olt_id'):
            log_entry['olt_id'] = record.olt_id
        return json.dumps(log_entry)


class DevFormatter(logging.Formatter):
    """Human-readable formatter for development."""

    def format(self, record):
        ts = datetime.now(timezone.utc).strftime('%H:%M:%S')
        msg = f'[{ts}] {record.levelname:5s} {record.module}:{record.lineno} {record.getMessage()}'
        if record.exc_info:
            msg += '\n' + self.formatException(record.exc_info)
        return msg


def setup_logging():
    """Configure logging based on environment.
    Uses JSON in production, readable format in development.
    """
    log_level = os.environ.get('LOG_LEVEL', 'INFO').upper()
    log_format = os.environ.get('LOG_FORMAT', 'dev')  # 'json' or 'dev'

    handler = logging.StreamHandler(sys.stdout)
    if log_format == 'json':
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(DevFormatter())

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers = [handler]

    # Set our app logger
    app_logger = logging.getLogger('fibernms')
    app_logger.setLevel(log_level)
    app_logger.handlers = [handler]
    app_logger.propagate = False

    return app_logger
