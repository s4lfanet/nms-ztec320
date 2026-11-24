"""Clear-Site-Data sekali per browser di /api/auth/me untuk memulihkan PWA yang tersangkut."""
import secrets

from app import app, db
from models import User
from routes_auth import UI_RESET_COOKIE, UI_RESET_VERSION
from tests.test_link_state import ctx  # noqa: F401


def test_clear_site_data_sent_once(ctx):
    u = User(username='r' + secrets.token_hex(3), full_name='r')
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    r1 = c.get('/api/auth/me')
    assert r1.status_code == 200
    assert r1.headers.get('Clear-Site-Data') == '"cache", "storage"'
    assert f'{UI_RESET_COOKIE}={UI_RESET_VERSION}' in r1.headers.get('Set-Cookie', '')
    r2 = c.get('/api/auth/me')
    assert 'Clear-Site-Data' not in r2.headers
    assert r2.get_json()['user']['username'] == u.username
