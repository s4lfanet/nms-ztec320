"""Shared Flask extensions — imported by app.py and all route modules.

This module breaks circular imports by holding db/login_manager instances
that both app.py and blueprint modules need to reference.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_migrate import Migrate
import logging
from logging_config import setup_logging

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
login_manager.login_message = 'Please login to access this page.'

# Initialize structured logging
logger = setup_logging()
