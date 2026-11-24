"""Regresi: /api/auth/me TIDAK boleh mengirim Clear-Site-Data (membuat Chrome Android macet di Loading)."""
import secrets

from app import app, db
from models import User
from tests.test_link_state import ctx  # noqa: F401


def test_me_has_no_clear_site_data(ctx):
    u = User(username='r' + secrets.token_hex(3), full_name='r')
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    r = c.get('/api/auth/me')
    assert r.status_code == 200 and 'Clear-Site-Data' not in r.headers
