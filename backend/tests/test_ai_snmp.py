"""AI Agent membaca data Monitoring SNMP (tanpa SNMP langsung): ringkasan, perangkat, port, cari MAC/IP."""
import secrets
from datetime import timedelta

from app import db
from models import SnmpDevice, SnmpPort, SnmpSample, SnmpEvent, OLT, ONU, OnuLinkState, MikrotikDevice
import ai_agent
import snmp_monitor as sm
import snmp_tables as stb
from tests.test_link_state import ctx  # noqa: F401

MAC = '4c:5e:0c:aa:bb:01'


def _setup():
    now = sm._now()
    name = 'CORE-' + secrets.token_hex(2)
    d = SnmpDevice(name=name, host='10.9.' + str(secrets.randbelow(250)) + '.1', snmp_version='2c', status='up',
                   vendor='MikroTik', hardware='CCR2004', cpu_pct=37, mem_pct=40, temperature=51, last_poll_at=now)
    d.community = secrets.token_hex(4)
    db.session.add(d); db.session.flush()
    up = SnmpPort(device_id=d.id, if_index=1, name='sfp-sfpplus1', alias='UPLINK-ISP', speed_mbps=10000,
                  admin_status='up', oper_status='up', in_bps=4.2e9, out_bps=8e8, watched=True, dom_rx_dbm=-7.1)
    acc = SnmpPort(device_id=d.id, if_index=3, name='ether3', alias='PELANGGAN-A', speed_mbps=1000,
                   admin_status='up', oper_status='down', status_changed_at=now - timedelta(minutes=40))
    db.session.add_all([up, acc]); db.session.flush()
    for i in range(6):
        db.session.add(SnmpSample(device_id=d.id, port_id=up.id, metric='in', ts=now - timedelta(minutes=10 * i), value=3e9 + i * 1e8))
    db.session.add(SnmpEvent(device_id=d.id, port_id=acc.id, kind='port_down', message='ether3 turun'))
    db.session.commit()
    stb.apply(d, {'arp': [(1, '10.50.0.9', MAC)], 'fdb': [(1, 100, MAC)]}, now)
    # pelanggan PPPoE dengan caller-id = MAC tersebut
    olt = OLT(name='OLT-' + secrets.token_hex(2), ip_address='10.0.0.' + str(secrets.randbelow(200) + 2))
    db.session.add(olt); db.session.flush()
    onu = ONU(olt_id=olt.id, name='Budi Santoso', serial_number='ZTEG' + secrets.token_hex(4), status='online',
              frame=1, slot=1, port=1, onu_id=secrets.randbelow(100) + 1, pppoe='budi01')
    mt = MikrotikDevice(name='MT', host='10.0.0.250')
    db.session.add_all([onu, mt]); db.session.flush()
    db.session.add(OnuLinkState(onu_id=onu.id, mikrotik_id=mt.id, pppoe_user='budi01', pppoe_ip='10.50.0.9',
                                session_up=True, caller_id=MAC.upper()))
    db.session.commit()
    return d, up, acc, onu


def test_snmp_tools_read_db(ctx):
    d, up, acc, onu = _setup()
    s = ai_agent.run_tool('snmp_devices', {})
    assert any(x['nama'] == d.name and x['cpu_pct'] == 37 for x in s['perangkat'])
    assert any(p['port'] == 'sfp-sfpplus1' and p['masuk_mbps'] == 4200.0 for p in s['port_dipantau'])

    det = ai_agent.run_tool('snmp_device', {'device': d.name.lower()})
    assert det['port_turun'][0]['port'] == 'ether3' and det['port_aktif'] == 1
    assert det['port_tersibuk'][0]['utilisasi_pct'] == 42.0

    p = ai_agent.run_tool('snmp_port', {'device': d.host, 'port': 'uplink-isp'})
    assert p['port'] == 'sfp-sfpplus1' and p['sfp']['rx_dbm'] == -7.1
    assert p['trafik_24_jam']['in']['puncak_mbps'] == 3500.0
    assert p['mac'][0] == {'mac': MAC, 'ip': '10.50.0.9', 'vlan': 100, 'aktif': True}

    assert 'error' in ai_agent.run_tool('snmp_device', {'device': 'tidak-ada-xyz'})
    assert 'pilihan' in ai_agent.run_tool('snmp_port', {'device': d.name, 'port': 'zzz'})


def test_find_mac_links_pppoe_customer(ctx):
    d, *_ , onu = _setup()
    r = ai_agent.run_tool('find_mac', {'query': '4C5E.0CAA.BB01'})
    hit = r['hasil'][0]
    assert hit['perangkat'] == d.name and hit['port'] == 'sfp-sfpplus1' and hit['vlan'] == 100
    assert hit['pelanggan'] == {'onu_id': onu.id, 'nama': 'Budi Santoso', 'pppoe': 'budi01'}
    r = ai_agent.run_tool('find_mac', {'query': '10.50.0.9'})
    assert r['jenis'] == 'ip' and r['hasil'][0]['pelanggan']['nama'] == 'Budi Santoso'
    assert 'error' in ai_agent.run_tool('find_mac', {'query': 'budi'})


def test_quick_commands_snmp_and_mac(ctx):
    d, *_ = _setup()
    out = ai_agent.quick_command('/snmp')
    assert 'Monitoring SNMP' in out and d.name in out
    out = ai_agent.quick_command(f'/snmp {d.name}')
    assert 'TURUN ether3' in out and 'CPU 37%' in out
    out = ai_agent.quick_command('/mac 4c:5e:0c:aa')
    assert 'sfp-sfpplus1' in out and 'Budi Santoso' in out
    assert 'Format' in ai_agent.quick_command('/mac')
    assert '/snmp' in ai_agent.quick_command('/menu')


def test_tools_registered_in_prompt():
    names = {t[0] for t in ai_agent.TOOLS}
    assert {'snmp_devices', 'snmp_device', 'snmp_port', 'find_mac'} <= names
    assert 'find_mac' in ai_agent.SYSTEM_PROMPT and 'snmp_port' in ai_agent.SYSTEM_PROMPT
