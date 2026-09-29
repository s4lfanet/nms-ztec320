"""Generate PWA icons / favicons from the uploaded company logo.

The uploaded logo (backend/static/uploads/company-logo.*) is typically a
transparent-background PNG — every derived icon is composited on an opaque
white canvas (same reason the Sidebar wraps the logo in `bg-white p-1`).

Generated files live in backend/static/uploads/pwa/ and are served by nginx
under /static/uploads/pwa/ (or by Flask's static route in dev).
"""
import glob
import os
import shutil

from extensions import logger

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(_BACKEND_DIR, 'static', 'uploads')
ICON_DIR = os.path.join(UPLOAD_DIR, 'pwa')

# (filename, px size, padding ratio of size)
_ICONS = [
    ('icon-192.png', 192, 0.08),
    ('icon-512.png', 512, 0.08),
    ('maskable-192.png', 192, 0.20),   # maskable safe zone
    ('maskable-512.png', 512, 0.20),
    ('apple-touch-icon.png', 180, 0.10),
    ('favicon-32.png', 32, 0.04),
]


def _render(logo, size, pad_ratio):
    """Composite `logo` (RGBA) contain-fitted + centered on a white canvas."""
    from PIL import Image
    pad = round(size * pad_ratio)
    inner = max(size - pad * 2, 1)
    fitted = logo.copy()
    fitted.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    offset = ((size - fitted.width) // 2, (size - fitted.height) // 2)
    canvas.alpha_composite(fitted, offset)
    return canvas.convert('RGB')


def generate_branding_icons(src_path: str) -> None:
    """Render all derived icons from the logo at src_path."""
    from PIL import Image
    logo = Image.open(src_path).convert('RGBA')
    os.makedirs(ICON_DIR, exist_ok=True)
    for name, size, pad in _ICONS:
        _render(logo, size, pad).save(os.path.join(ICON_DIR, name))
    _render(logo, 48, 0.0).save(
        os.path.join(ICON_DIR, 'favicon.ico'),
        sizes=[(16, 16), (32, 32), (48, 48)])
    logger.info(f"Generated PWA/favicon icons from {src_path}")


def clear_branding_icons() -> None:
    """Remove generated icons (used when the logo is reset)."""
    try:
        if os.path.isdir(ICON_DIR):
            shutil.rmtree(ICON_DIR, ignore_errors=True)
    except Exception as e:
        logger.warning(f"Failed to clear branding icons: {e}")


def has_branding_icons() -> bool:
    return os.path.exists(os.path.join(ICON_DIR, 'icon-192.png'))


def ensure_branding_icons() -> bool:
    """Lazily generate icons if a logo exists but icons were never generated
    (covers logos uploaded before this feature existed). Never raises."""
    try:
        if has_branding_icons():
            return True
        logos = sorted(glob.glob(os.path.join(UPLOAD_DIR, 'company-logo.*')))
        if not logos:
            return False
        generate_branding_icons(logos[0])
    except Exception as e:
        logger.warning(f"ensure_branding_icons failed: {e}")
    return has_branding_icons()


def branding_icon_version() -> str:
    """Cache-buster matching the logo URL's v= timestamp ('0' if unset)."""
    try:
        from models import SystemConfig
        cfg = SystemConfig.query.filter_by(key='nms_logo_url').first()
        if cfg and cfg.value and 'v=' in cfg.value:
            return cfg.value.split('v=', 1)[1].split('&', 1)[0]
    except Exception as e:
        logger.warning(f"branding_icon_version failed: {e}")
    return '0'
