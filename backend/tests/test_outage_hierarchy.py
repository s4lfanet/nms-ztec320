"""Fase 1 korelasi gangguan bertingkat: ODP → ODC/JC → OTB, jenis gangguan,
pulih/superseded, dan sakelar pengaturan."""
from datetime import datetime, timezone

from app import app, db
from models import (OLT, ONU, Notification, AlertHistory, SystemConfig,
                    FTTHODC, FTTHODP, FTTHODPPort, FTTHJC)
from tests.test_alert_correlation import client  # noqa: F401  (fixture)


def _olt():
    olt = OLT(name='OLT-A', ip_address='127.0.0.11', vendor='zte', is_online=True)
    db.session.add(olt); db.session.flush()
    return olt


def _odp(name, olt, n_ports, statuses, odc=None, jc=None, start=0):
    odp = FTTHODP(name=name, latitude=-6.1, longitude=106.7,
                  feed_source='jc' if jc else 'odc',
                  odc_id=odc.id if odc else None, jc_id=jc.id if jc else None)
    db.session.add(odp); db.session.flush()
    for i in range(n_ports):
        onu = ONU(olt_id=olt.id, name=f'{name}-c{i}', serial_number=f'ZTEG{start + i:08d}',
                  status=statuses[i] if i < len(statuses) else 'online',
                  frame=1, slot=1, port=1, onu_id=start + i + 1)
        db.session.add(onu); db.session.flush()
        db.session.add(FTTHODPPort(odp_id=odp.id, port_number=i + 1, onu_id=onu.id, status='used'))
    return odp


def _run(olt):
    from alerts import _check_odp_outages
    notifs, alerts = [], []
    _check_odp_outages([olt], datetime.now(timezone.utc), notifs, alerts)
    for n in notifs:
        db.session.add(Notification(**n))
    db.session.commit()
    return notifs, alerts


def _set(key, value):
    row = SystemConfig.query.filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.session.add(SystemConfig(key=key, value=value))
    db.session.commit()


class TestHierarchy:
    def test_odc_cut_gives_one_odc_alert(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-1', latitude=-6.0, longitude=106.0)
            db.session.add(odc); db.session.flush()
            _odp('ODP-A', olt, 4, ['los'] * 4, odc=odc, start=0)
            _odp('ODP-B', olt, 4, ['los'] * 4, odc=odc, start=10)
            db.session.commit()
            notifs, alerts = _run(olt)
            assert [a['type'] for a in alerts] == ['outage']
            a = alerts[0]
            assert a['target_type'] == 'odc' and 'ODC-1' in a['title']
            assert a['cause'] == 'fiber'
            assert '8 dari 8' in a['message'] and 'ODP-A, ODP-B' in a['message']
            assert 'maps.google.com/?q=-6.0,106.0' in a['message']
            assert not any(n['category'] == 'odp_outage' for n in notifs)
            h = AlertHistory.query.filter_by(alert_type='outage').first()
            assert h and h.last_value == '8'

    def test_one_odp_down_stays_odp_alert(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-2')
            db.session.add(odc); db.session.flush()
            _odp('ODP-C', olt, 4, ['dyinggasp'] * 4, odc=odc, start=0)
            _odp('ODP-D', olt, 4, [], odc=odc, start=10)
            db.session.commit()
            _, alerts = _run(olt)
            assert [a['type'] for a in alerts] == ['odp_outage']
            assert alerts[0]['target_type'] == 'odp'
            assert alerts[0]['cause'] == 'power'
            assert 'listrik padam' in alerts[0]['message']

    def test_jc_above_odc(self, client):
        with app.app_context():
            olt = _olt()
            jc = FTTHJC(name='JC-1', parent_type='pon', parent_id=1)
            db.session.add(jc); db.session.flush()
            odc = FTTHODC(name='ODC-3', feed_source='jc', jc_id=jc.id)
            db.session.add(odc); db.session.flush()
            _odp('ODP-E', olt, 3, ['los'] * 3, odc=odc, start=0)
            _odp('ODP-F', olt, 3, ['los'] * 3, jc=jc, start=10)
            db.session.commit()
            _, alerts = _run(olt)
            assert len(alerts) == 1
            assert alerts[0]['target_type'] == 'jc' and 'JC-1' in alerts[0]['title']

    def test_ratio_below_threshold_falls_back_to_odp(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-4')
            db.session.add(odc); db.session.flush()
            _odp('ODP-G', olt, 4, ['los'] * 4, odc=odc, start=0)
            _odp('ODP-H', olt, 4, ['los'] * 1, odc=odc, start=10)
            db.session.commit()
            _, alerts = _run(olt)  # 5/8 = 62% < 80%
            assert [(a['type'], a['target_type']) for a in alerts] == [('odp_outage', 'odp')]

    def test_disabled_keeps_old_odp_behaviour(self, client):
        with app.app_context():
            _set('outage_correlation_enabled', '0')
            olt = _olt()
            odc = FTTHODC(name='ODC-5')
            db.session.add(odc); db.session.flush()
            _odp('ODP-I', olt, 3, ['los'] * 3, odc=odc, start=0)
            _odp('ODP-J', olt, 3, ['los'] * 3, odc=odc, start=10)
            db.session.commit()
            _, alerts = _run(olt)
            assert sorted(a['target_type'] for a in alerts) == ['odp', 'odp']

    def test_no_resend_while_open_then_recovery(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-6')
            db.session.add(odc); db.session.flush()
            _odp('ODP-K', olt, 3, ['los'] * 3, odc=odc, start=0)
            db.session.commit()
            _, first = _run(olt)
            assert len(first) == 1
            n = Notification.query.filter_by(resolved=False).one()
            n.is_read = True  # reading the bell must not cause a resend
            db.session.commit()
            _, second = _run(olt)
            assert second == []
            for o in ONU.query.all():
                o.status = 'online'
            db.session.commit()
            _, third = _run(olt)
            assert len(third) == 1 and third[0]['is_recovery']
            assert 'PULIH' in third[0]['message']
            assert Notification.query.filter_by(resolved=False).count() == 0

    def test_escalating_to_odc_is_not_a_recovery(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-7')
            db.session.add(odc); db.session.flush()
            _odp('ODP-L', olt, 3, ['los'] * 3, odc=odc, start=0)
            _odp('ODP-M', olt, 3, [], odc=odc, start=10)
            db.session.commit()
            _, first = _run(olt)
            assert first[0]['target_type'] == 'odp'
            for o in ONU.query.all():
                o.status = 'los'
            db.session.commit()
            _, second = _run(olt)
            assert [(a['type'], a['is_recovery']) for a in second] == [('outage', False)]
