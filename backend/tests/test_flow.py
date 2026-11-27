"""Trafik Aplikasi: parser NetFlow/IPFIX, agregasi, pengenal layanan, API."""
import socket
import struct
from datetime import datetime, timedelta

import flow_collector as fc
import flow_names as fn
from app import app, db
from models import FlowBucket, FlowClientHour, FlowServiceHour, FlowExporter, User
from tests.test_link_state import ctx  # noqa: F401
from tests.test_alert_correlation import client  # noqa: F401  (fixture)


def _ip(s):
    return socket.inet_aton(s)


def _v5(flows):
    out = struct.pack('!HHIIIIBBH', 5, len(flows), 0, 0, 0, 1, 0, 0, 0)
    for src, dst, inif, outif, octets in flows:
        out += struct.pack('!4s4s4sHHIIIIHHBBBBHHBBH', _ip(src), _ip(dst), b'\0' * 4, inif, outif, 3, octets,
                           0, 0, 443, 50000, 0, 0, 6, 0, 0, 0, 0, 0, 0)
    return out


def test_parse_v5():
    ver, flows = fc.parse_packet(_v5([('142.250.1.1', '10.0.0.5', 7, 3, 5000)]), {}, '1.1.1.1')
    assert ver == 5 and flows[0]['src'] == '142.250.1.1' and flows[0]['bytes'] == 5000 and flows[0]['in_if'] == 7


def _v9_packet(template_first=True):
    fields = [(8, 4), (12, 4), (1, 4), (10, 2), (14, 2), (4, 1)]
    tmpl_body = struct.pack('!HH', 256, len(fields)) + b''.join(struct.pack('!HH', t, l) for t, l in fields)
    tmpl_set = struct.pack('!HH', 0, 4 + len(tmpl_body)) + tmpl_body
    rec = _ip('10.1.1.9') + _ip('157.240.1.1') + struct.pack('!IHHB', 9000, 3, 8, 6)
    data_set = struct.pack('!HH', 256, 4 + len(rec)) + rec
    sets = tmpl_set + data_set
    return struct.pack('!HHIIII', 9, 2, 0, 0, 1, 77) + sets


def test_parse_v9_template_then_data():
    templates = {}
    ver, flows = fc.parse_packet(_v9_packet(), templates, '2.2.2.2')
    assert ver == 9 and len(flows) == 1
    f = flows[0]
    assert (f['src'], f['dst'], f['bytes'], f['in_if'], f['out_if']) == ('10.1.1.9', '157.240.1.1', 9000, 3, 8)
    assert ('2.2.2.2', 77, 256) in templates


def test_parse_ipfix_with_enterprise_field_and_unknown_template():
    fields = [(8, 4), (12, 4), (1, 8)]
    body = struct.pack('!HH', 300, 4) + b''.join(struct.pack('!HH', t, l) for t, l in fields)
    body += struct.pack('!HH', 0x8001, 2) + struct.pack('!I', 29305)   # enterprise: lewati
    # jumlah field 4 → perbaiki: field ke-4 = enterprise
    body = struct.pack('!HH', 300, 4) + body[4:]
    tset = struct.pack('!HH', 2, 4 + len(body)) + body
    rec = _ip('10.2.2.2') + _ip('1.1.1.1') + struct.pack('!Q', 123456) + b'\x00\x01'
    dset = struct.pack('!HH', 300, 4 + len(rec)) + rec
    pkt = struct.pack('!HHIII', 10, 16 + len(tset) + len(dset), 0, 1, 5) + tset + dset
    ver, flows = fc.parse_packet(pkt, {}, '3.3.3.3')
    assert ver == 10 and flows[0]['bytes'] == 123456
    # data tanpa template yang dikenal → kosong, tanpa error
    assert fc.parse_packet(pkt[:16] + dset, {}, '9.9.9.9') == (10, [])
    assert fc.parse_packet(b'\x00\x01', {}, 'x') == (0, [])


def test_aggregator_direction_and_services():
    agg = fc.Aggregator(resolve=lambda ip: {'142.250.1.1': 'Google'}.get(ip))
    now = datetime(2026, 11, 27, 3, 7, 30)
    n = agg.add('r1', [
        {'src': '142.250.1.1', 'dst': '10.0.0.5', 'bytes': 1000, 'in_if': 7, 'out_if': 3},   # download Google
        {'src': '10.0.0.5', 'dst': '142.250.1.1', 'bytes': 100, 'in_if': 3, 'out_if': 7},    # upload Google
        {'src': '10.0.0.5', 'dst': '10.0.0.6', 'bytes': 999, 'in_if': 3, 'out_if': 4},       # lokal↔lokal: abaikan
        {'src': '8.8.4.4', 'dst': '192.168.1.2', 'bytes': 50, 'in_if': 7, 'out_if': 3},      # belum dikenal
    ], now=now)
    assert n == 3
    # download di interface masuk (7) dan upload di interface keluar (7) jatuh ke baris yang sama
    assert agg.svc[(datetime(2026, 11, 27, 3, 5), 'r1', 7, 'Google')] == [1000, 100]
    assert (datetime(2026, 11, 27, 3, 5), 'r1', 7, fc.OTHER) in agg.svc
    assert agg.take_pending() == ['8.8.4.4']
    assert agg.is_local('100.64.1.1') and agg.is_local('fd00::1') and not agg.is_local('8.8.8.8')


def test_flush_adds_up_and_client_threshold(ctx):
    agg = fc.Aggregator(resolve=lambda ip: 'Google')
    t = datetime.utcnow()
    for _ in range(2):
        agg.add('r1', [{'src': '142.250.1.1', 'dst': '10.0.0.5', 'bytes': 30_000, 'in_if': 7, 'out_if': 3},
                       {'src': '142.250.1.1', 'dst': '10.0.0.9', 'bytes': 100, 'in_if': 7, 'out_if': 3}], now=t)
        fc.flush_services(agg)
    rows = FlowBucket.query.all()
    assert len(rows) == 1 and rows[0].down_bytes == 60_200 and rows[0].service == 'Google'
    assert FlowServiceHour.query.one().down_bytes == 60_200
    n = fc.flush_clients(agg)
    assert n == 1 and FlowClientHour.query.one().client_ip == '10.0.0.5'     # klien kecil ditahan
    assert len(agg.cli) == 1
    fc.flush_clients(agg, force=True)
    assert FlowClientHour.query.count() == 2


def test_service_names_and_dns_chain():
    assert fn.service_for_name('r4---sn-abc.googlevideo.com') == 'YouTube'
    assert fn.service_for_name('edge-star.facebook.com.') == 'Facebook/Meta'
    assert fn.service_for_name('news.detik.com') == 'detik.com'
    assert fn.service_for_name('www.kompas.co.id') == 'kompas.co.id'
    assert fn.service_for_name('') is None and fn.service_for_name('1.2.3.4') is None
    rows = [{'type': 'CNAME', 'name': 'www.tiktok.com', 'data': 'tiktok-edge.l.example.net'},
            {'type': 'A', 'name': 'tiktok-edge.l.example.net', 'data': '23.1.1.1'},
            {'type': 'A', 'name': 'play.google.com', 'data': '142.250.2.2'}]
    m = fn.dns_map_from_rows(rows)
    assert m['23.1.1.1'][1] == 'TikTok' and m['142.250.2.2'][1] == 'Google'


def test_resolver_cache_and_store(ctx):
    fn._cache.clear()
    assert fn.lookup('9.9.9.9') is None
    fn._store({'9.9.9.9': ('dns.quad9.net', 'quad9.net', 'rdns'), '7.7.7.7': ('', None, 'none')})
    assert fn.lookup('9.9.9.9') == 'quad9.net' and fn.lookup('7.7.7.7') == fn.OTHER
    # nama dari DNS cache router tidak ditimpa hasil rDNS
    fn._store({'9.9.9.9': ('www.youtube.com', 'YouTube', 'dns')})
    fn._store({'9.9.9.9': ('x.example.org', 'example.org', 'rdns')})
    assert fn.lookup('9.9.9.9') == 'YouTube'
    fn.load_cache()
    assert fn.lookup('9.9.9.9') == 'YouTube'


def test_settings_roundtrip_and_clamp(ctx):
    assert fc.get_settings()['flow_port'] == 2055 and fc.get_settings()['flow_enabled'] == 0
    fc.save_settings({'flow_enabled': 1, 'flow_port': 80, 'flow_local_nets': '10.0.0.0/8, bukan-ip, 172.16.5.0/24'})
    s = fc.get_settings()
    assert s['flow_enabled'] == 1 and s['flow_port'] == 1024
    assert s['flow_local_nets'] == '10.0.0.0/8,172.16.5.0/24'


class TestApi:
    H = {'X-Requested-With': 'XMLHttpRequest'}

    def _login(self, client):
        with app.app_context():
            uid = User.query.filter_by(username='admin').first().id
        with client.session_transaction() as sess:
            sess['_user_id'] = str(uid)
            sess['_fresh'] = True

    def test_overview_clients_status_settings(self, client):
        self._login(client)
        with app.app_context():
            now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
            for i, (svc, d, u) in enumerate([('YouTube', 9_000_000, 100), ('Google', 3_000_000, 500), ('TikTok', 1_000_000, 10)]):
                db.session.add(FlowBucket(ts=now - timedelta(minutes=5 * i), exporter='10.9.9.1', if_index=7,
                                          service=svc, down_bytes=d, up_bytes=u))
            db.session.add(FlowClientHour(ts=now, exporter='10.9.9.1', client_ip='10.0.0.5', service='YouTube',
                                          down_bytes=9_000_000, up_bytes=100))
            db.session.add(FlowClientHour(ts=now, exporter='10.9.9.1', client_ip='10.0.0.6', service='Google',
                                          down_bytes=100, up_bytes=100))
            db.session.add(FlowExporter(ip='10.9.9.1', last_seen=datetime.utcnow(), version=9, packets=5, flows=50))
            db.session.commit()
        r = client.get('/api/flow/overview?range=6h').get_json()
        assert r['success'] and r['services'][0]['service'] == 'YouTube' and r['down'] == 13_000_000
        assert r['series_names'][:3] == ['YouTube', 'Google', 'TikTok'] and len(r['series']) == 3
        r = client.get('/api/flow/overview?range=30d&if_index=99').get_json()
        assert r['services'] == []
        r = client.get('/api/flow/clients?range=24h').get_json()
        assert [c['ip'] for c in r['clients']] == ['10.0.0.5', '10.0.0.6']
        assert r['clients'][0]['top_services'][0]['service'] == 'YouTube'
        assert [c['ip'] for c in client.get('/api/flow/clients?service=Google').get_json()['clients']] == ['10.0.0.6']
        d = client.get('/api/flow/client/10.0.0.5').get_json()
        assert d['services'][0]['service'] == 'YouTube' and d['series']
        s = client.get('/api/flow/status').get_json()
        assert s['exporters'][0]['ip'] == '10.9.9.1' and s['has_data'] and s['settings']['flow_port'] == 2055
        i = client.get('/api/flow/interfaces').get_json()
        assert i['exporters'][0]['interfaces'][0]['if_index'] == 7
        r = client.put('/api/flow/settings', json={'flow_enabled': 1, 'flow_port': 2056}, headers=self.H).get_json()
        assert r['settings']['flow_enabled'] == 1 and r['settings']['flow_port'] == 2056
