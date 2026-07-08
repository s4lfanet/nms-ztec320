"""Shared Flask extensions — imported by app.py and all route modules.

This module breaks circular imports by holding db/login_manager instances
that both app.py and blueprint modules need to reference.
"""
from flask import request as _request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_migrate import Migrate
from flask.sessions import SecureCookieSessionInterface
import logging
from logging_config import setup_logging

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message = 'Please login to access this page.'

# Initialize structured logging
logger = setup_logging()


class MultiTenantSessionInterface(SecureCookieSessionInterface):
    """Session interface with separate cookies for admin vs tenant subdomains.

    Prevents session conflicts when superadmin and tenant are accessed
    in the same browser by using:
    - Different cookie names for main domain vs tenant subdomains
    - Host-only cookie domain (no Domain attribute) so cookies are
      scoped to the exact hostname, not shared across subdomains
    """

    MAIN_DOMAINS = frozenset({'nms.salfa.my.id', 'localhost', '127.0.0.1'})

    def _is_main_domain(self):
        try:
            hostname = _request.host.split(':')[0].lower()
            return hostname in self.MAIN_DOMAINS
        except RuntimeError:
            return True

    def get_cookie_name(self, app):
        if self._is_main_domain():
            return 'nms-admin-session'
        return 'nms-tenant-session'

    def get_cookie_domain(self, app):
        return None  # Host-only — cookie scoped to exact hostname
