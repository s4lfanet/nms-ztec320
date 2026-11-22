"""Audit role teknisi: lonceng → insiden, /api/auth/me phone, AI /insiden."""
from app import app, db
from models import User, Role, Notification, Incident
from tests.test_alert_correlation import client  # noqa: F401  (fixture)


def _login_as(client, username, perms, phone=''):
    with app.app_context():
        role = Role(name=f'r-{username}', permissions=perms)
        db.session.add(role); db.session.flush()
        u = User(username=username, full_name=username.title(), phone=phone, role_id=role.id)
        u.set_password('x-' + username)
        db.session.add(u); db.session.commit()
        uid = u.id
    with client.session_transaction() as sess:
        sess['_user_id'] = str(uid)
        sess['_fresh'] = True
    return uid


def test_technician_sees_outage_as_alarm_with_incident_link(client):
    with app.app_context():
        inc = Incident(node_type='odc', node_id=7, node_name='ODC-T', olt_id=None, title='t', status='open')
        db.session.add(inc); db.session.flush()
        db.session.add(Notification(category='outage', severity='critical', title='Gangguan ODC: ODC-T',
                                    target_type='odc', target_id=7))
        db.session.commit()
        iid = inc.id
    _login_as(client, 'teknisi', 'view_dashboard,view_onus,receive_alerts', phone='62811')
    r = client.get('/api/notifications?type=alarm').get_json()
    n = r['notifications'][0]
    assert n['type'] == 'alarm' and n['incident_id'] == iid
    me = client.get('/api/auth/me').get_json()['user']
    assert me['phone'] == '62811'
    # teknisi boleh membuka & menangani insiden
    d = client.get(f'/api/incidents/{iid}').get_json()['incident']
    assert d['can_handle'] is True
    ok = client.post(f'/api/incidents/{iid}/status', json={'status': 'acknowledged'},
                     headers={'X-Requested-With': 'XMLHttpRequest'}).get_json()
    assert ok['success'] and ok['incident']['acknowledged_by'] == 'Teknisi'


def test_viewer_cannot_handle_incident(client):
    with app.app_context():
        inc = Incident(node_type='odp', node_id=1, node_name='ODP-V', title='t', status='open')
        db.session.add(inc); db.session.commit()
        iid = inc.id
    _login_as(client, 'viewer', 'view_dashboard')
    assert client.get(f'/api/incidents/{iid}').get_json()['incident']['can_handle'] is False
    r = client.post(f'/api/incidents/{iid}/status', json={'status': 'acknowledged'},
                    headers={'X-Requested-With': 'XMLHttpRequest'})
    assert r.status_code == 403
    # mengatur wilayah butuh manage_users
    r2 = client.post('/api/technician-areas', json={'user_id': 1, 'node_type': 'odp', 'node_id': 1},
                     headers={'X-Requested-With': 'XMLHttpRequest'})
    assert r2.status_code == 403


def test_ai_quick_incidents(client):
    from ai_agent import quick_command
    with app.app_context():
        assert quick_command('/insiden') == 'Tidak ada insiden gangguan aktif.'
        db.session.add(Incident(node_type='odc', node_id=3, node_name='ODC-AI', title='t', status='en_route',
                                cause='fiber', affected_count=12, acknowledged_by='Andi'))
        db.session.commit()
        out = quick_command('/insiden')
        assert 'ODC ODC-AI' in out and '12 plg' in out and 'kabel putus' in out and 'Andi' in out
        assert '/insiden' in quick_command('/menu')
