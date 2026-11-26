from datetime import datetime, timedelta

import snmp_alerts


def test_stamp_menambah_waktu_wib():
    out = snmp_alerts.stamp('Isi', datetime(2026, 11, 26, 6, 22, 9))  # 06:22 UTC naif
    assert out.startswith('Isi\n\n🕒 Waktu: 26/11/2026, 13.22.09')
    assert out.endswith('WIB')


def test_fmt_duration():
    d = snmp_alerts.fmt_duration
    assert d(timedelta(seconds=30)) == '0 menit'
    assert d(timedelta(minutes=5)) == '5 menit'
    assert d(timedelta(minutes=130)) == '2 jam 10 menit'
    assert d(timedelta(hours=27)) == '1 hari 3 jam'


def test_toggle_alert_dan_pulih_berisi_waktu_dan_lama():
    now = datetime(2026, 11, 26, 6, 0, 0)
    alerts, notifs = [], []
    dev = type('D', (), {'name': 'SW1', 'host': '10.0.0.1'})()
    c = snmp_alerts._Ctx.__new__(snmp_alerts._Ctx)
    c.now, c.notifs, c.alerts, c.open = now, notifs, alerts, {}
    c.toggle(dev, 'snmp_cpu', 'snmp', 1, True, 'warning', 't', 'CPU 62%', 'ok', 'CPU normal')
    assert 'Waktu:' in alerts[0]['message'] and 'WIB' in alerts[0]['message']

    class N:  # notifikasi terbuka, dibuat 25 menit lalu
        resolved = False
        created_at = now - timedelta(minutes=25)
    c.open[('snmp_cpu', 'snmp', 1)] = N()
    c.toggle(dev, 'snmp_cpu', 'snmp', 1, False, 'warning', 't', 'm', 'ok', 'CPU normal')
    rec = alerts[-1]['message']
    assert 'Lama bermasalah: 25 menit' in rec and 'SW1 (10.0.0.1)' in rec and 'WIB' in rec
