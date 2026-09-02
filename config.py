"""Application configuration — environment-based settings.

Reads from environment variables with sensible defaults.
Supports both SQLite (development) and PostgreSQL (production).

Usage:
    # SQLite (default, no config needed):
    python app.py

    # PostgreSQL (set DATABASE_URL):
    DATABASE_URL=postgresql://user:pass@localhost:5432/salfanet_nms python app.py

    # Or via .env file (loaded by this module):
    cp .env.example .env
"""
import os
import logging
from pathlib import Path
from datetime import timedelta

_logger = logging.getLogger(__name__)

# Load .env file if it exists (simple dotenv implementation)
_base_dir = Path(__file__).resolve().parent
_env_file = _base_dir / ".env"
if _env_file.exists():
    with open(_env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value

# Resolve environment early — needed below to decide whether missing secrets
# should fail closed (production) or auto-generate (development/testing).
_env_name = os.environ.get("FLASK_ENV", "development")
_is_production = _env_name == "production"


class Config:
    """Base configuration."""

    # --- Core ---
    # SECRET_KEY: required explicitly in production (no fallback — a silently
    # regenerated key would invalidate every session on restart). In
    # development, generate a random one and persist it to .env so sessions
    # survive restarts.
    _secret = os.environ.get("SECRET_KEY")
    if not _secret:
        if _is_production:
            raise RuntimeError(
                "SECRET_KEY must be explicitly configured in production. "
                "Set it in your .env file or environment variables."
            )
        import secrets as _secrets
        _secret = _secrets.token_hex(32)
        # Persist to .env so the key survives restarts
        _env_path = _base_dir / ".env"
        try:
            with open(_env_path, 'a') as _f:
                _f.write(f"\nSECRET_KEY={_secret}\n")
            os.environ["SECRET_KEY"] = _secret
        except Exception as _e:
            _logger.warning(
                "Could not persist generated SECRET_KEY to .env (%s) — a new "
                "key will be generated on every restart, invalidating sessions "
                "and credential encryption each time.", _e,
            )
    SECRET_KEY = _secret
    DEBUG = os.environ.get("FLASK_DEBUG", "0") == "1"

    # --- Database ---
    # Default: SQLite (zero-config development)
    # Set DATABASE_URL env var for PostgreSQL:
    #   postgresql://user:password@host:port/dbname
    DATABASE_URL = os.environ.get("DATABASE_URL", "")
    if not DATABASE_URL:
        # Default to SQLite
        _db_path = _base_dir / "instance" / "nms.db"
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{_db_path}"
    else:
        SQLALCHEMY_DATABASE_URI = DATABASE_URL

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

    # SQLite-specific settings: increase busy timeout for concurrent writes
    if "sqlite" in SQLALCHEMY_DATABASE_URI:
        SQLALCHEMY_ENGINE_OPTIONS["connect_args"] = {
            "timeout": 30,
            "check_same_thread": False,
        }

    # PostgreSQL-specific pool settings (only applied when using PostgreSQL)
    if "postgresql" in SQLALCHEMY_DATABASE_URI:
        SQLALCHEMY_ENGINE_OPTIONS.update({
            "pool_size": 10,
            "max_overflow": 20,
            "pool_timeout": 30,
            "connect_args": {"options": "-c timezone=UTC"},
        })

    # --- Session ---
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "1") == "1"
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_HTTPONLY = True
    PREFERRED_URL_SCHEME = os.environ.get("PREFERRED_URL_SCHEME", "https")
    PERMANENT_SESSION_LIFETIME = timedelta(hours=12)

    # --- Server ---
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = int(os.environ.get("PORT", "5000"))
    WS_PORT = int(os.environ.get("WS_PORT", "8765"))

    # --- Redis (optional, for caching) ---
    REDIS_URL = os.environ.get("REDIS_URL", "")

    # --- WhatsApp Gateway (optional) ---
    WA_GATEWAY_URL = os.environ.get("WA_GATEWAY_URL", "")


class DevelopmentConfig(Config):
    """Development configuration — SQLite, debug on."""
    DEBUG = True
    SESSION_COOKIE_SECURE = False


class ProductionConfig(Config):
    """Production configuration — PostgreSQL, debug off."""
    DEBUG = False


class TestingConfig(Config):
    """Testing configuration — in-memory SQLite."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SESSION_COOKIE_SECURE = False


# Select config based on environment
_config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}

ActiveConfig = _config_map.get(_env_name, DevelopmentConfig)

if ActiveConfig is DevelopmentConfig and _env_name != "testing":
    _logger.warning(
        "Starting with DevelopmentConfig (FLASK_ENV=%r) — the Werkzeug debugger "
        "and insecure session cookies (SESSION_COOKIE_SECURE=False) are ENABLED. "
        "Set FLASK_ENV=production for any real/internet-facing deployment.",
        _env_name,
    )
