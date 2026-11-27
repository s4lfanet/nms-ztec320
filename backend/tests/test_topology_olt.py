"""OLT di topologi SNMP: node + garis ke port; merah saat port turun / OLT mati; deteksi otomatis ARP+FDB."""
from datetime import datetime

import snmp_topology
from app import db
from models import OLT, SnmpArp, SnmpDevice, SnmpFdb, SnmpOltLink, SnmpPort
from tests.test_link_state import ctx  # noqa: F401


def _setup():
    sw = SnmpDevice(name='CRS-OLT', host='10.9.0.1', snmp_version='2c')
    olt = OLT(name='OLT-A', ip_address='10.9.0.50', is_online=True, total_onu=40, online_onu=38)
    db.session.add_all([sw, olt]); db.session.flush()
    p = SnmpPort(device_id=sw.id, if_index=3, name='sfp-sfpplus3', oper_status='up', admin_status='up')
    db.session.add(p); db.session.flush()
    return sw, olt, p


def test_manual_link_node_and_down_states(ctx):
    sw, olt, p = _setup()
    db.session.add(SnmpOltLink(olt_id=olt.id, device_id=sw.id, port_id=p.id)); db.session.commit()
    nodes, links = snmp_topology.build()
    n = next(x for x in nodes if x['id'] == f'o{olt.id}')
    assert n['kind'] == 'olt' and n['status'] == 'up' and 'ONU 38/40' in n['hardware']
    lk = next(x for x in links if x['target'] == f'o{olt.id}')
    assert lk['source'] == f'd{sw.id}' and lk['oper_status'] == 'up' and lk['protocols'] == ['olt']
    p.oper_status = 'down'; db.session.commit()
    assert next(x for x in snmp_topology.build()[1] if x['target'] == f'o{olt.id}')['oper_status'] == 'down'
    p.oper_status = 'up'; olt.is_online = False; db.session.commit()
    nodes, links = snmp_topology.build()
    assert next(x for x in nodes if x['id'] == f'o{olt.id}')['status'] == 'down'
    assert next(x for x in links if x['target'] == f'o{olt.id}')['oper_status'] == 'down'


def test_auto_detect_via_arp_fdb_and_impact(ctx):
    sw, olt, p = _setup()
    now = datetime.utcnow()
    db.session.add(SnmpArp(device_id=sw.id, ip='10.9.0.50', mac='aa:bb:cc:00:00:50', if_index=3, last_seen=now))
    db.session.add(SnmpFdb(device_id=sw.id, port_id=p.id, if_index=3, vlan=1, mac='aa:bb:cc:00:00:50', last_seen=now))
    db.session.commit()
    ls = snmp_topology.olt_links()
    assert len(ls) == 1 and ls[0]['source'] == 'arp' and ls[0]['port_id'] == p.id
    assert snmp_topology.olts_behind_port(p.id) == [('OLT-A', 40, 38)]
    assert snmp_topology.olts_behind_port(99999) == []


def test_olt_tanpa_sambungan_tidak_muncul(ctx):
    sw, olt, p = _setup(); db.session.commit()
    nodes, _ = snmp_topology.build()
    assert not any(x['id'] == f'o{olt.id}' for x in nodes)
