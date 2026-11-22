"""Jalankan NMS (Flask, frontend/dist) untuk uji tampilan. Port: UI_CHECK_PORT (5055)."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'backend'))
if 'DATABASE_URL' not in os.environ:
    sys.exit('Set DATABASE_URL ke database uji (lihat seed.py)')
from app import app  # noqa: E402

app.run(host='127.0.0.1', port=int(os.environ.get('UI_CHECK_PORT', '5055')),
        debug=False, use_reloader=False, threaded=True)
