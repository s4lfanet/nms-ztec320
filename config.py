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
from pathlib import Path

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


class Config:
    """Base configuration."""

    # --- Core ---
    SECRET_KEY = os.environ.get("SECRET_KEY", "fiber-nms-secret-key-2024")
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

    # PostgreSQL-specific pool settings (only applied when using PostgreSQL)
    if "postgresql" in SQLALCHEMY_DATABASE_URI:
        SQLALCHEMY_ENGINE_OPTIONS.update({
            "pool_size": 10,
            "max_overflow": 20,
            "pool_timeout": 30,
        })

    # --- Session ---
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "1") == "1"
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_HTTPONLY = True
    PREFERRED_URL_SCHEME = os.environ.get("PREFERRED_URL_SCHEME", "https")

    # --- Server ---
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = int(os.environ.get("PORT", "5000"))
    WS_PORT = int(os.environ.get("WS_PORT", "8765"))

    # --- Redis (optional, Phase 4) ---
    REDIS_URL = os.environ.get("REDIS_URL", "")

    # --- Cloudflare (optional) ---
    CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")
    CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "")
    CF_TUNNEL_ID = os.environ.get("CF_TUNNEL_ID", "")

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

_env = os.environ.get("FLASK_ENV", "development")
ActiveConfig = _config_map.get(_env, DevelopmentConfig)
