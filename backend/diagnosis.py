"""Diagnosis otomatis per pelanggan (ONU) — gabungan data yang sudah tersimpan:
status ONU (OLT), redaman, sesi PPPoE & ping (poller MikroTik), riwayat putus,
dan insiden FTTH aktif di jalurnya. Baca-saja: tanpa Telnet/SNMP/API router.

diagnose_onu(onu) -> {
  'level': 'ok'|'info'|'warning'|'critical',
  'code': kode temuan utama, 'title': ringkas, 'action': saran tindakan,
  'findings': [{'code','level','text'}...],  # semua temuan, terberat dulu
  'pppoe': {...} | None, 'events_24h': {...}, 'recent_events': [...],
}
"""
from datetime import datetime, timezone, timedelta

from models import (db, AlertRule, OnuLinkState, OnuStatusHistory, PppoeSessionEvent,
                    MikrotikDevice, Incident)

_ORDER = {'critical': 3, 'warning': 2, 'info': 1, 'ok': 0}
ACTIVE = ('open', 'acknowledged', 'en_route', 'on_site')


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _rx_critical():
    rule = AlertRule.query.first()
    return rule.rx_threshold if rule and rule.rx_threshold is not None else -28.0


def _active_incident(onu):
    """Insiden aktif pada ODP pelanggan atau node di hulunya (bila ada)."""
    try:
        from ftth_topology import onu_leaf_nodes, ancestors
    except Exception:
        return None
    nodes = set(onu_leaf_nodes(onu))
    for t, i in list(nodes):
        nodes |= ancestors(t, i)
    if not nodes:
        return None
    for inc in Incident.query.filter(Incident.status.in_(ACTIVE)).all():
        if (inc.node_type, inc.node_id) in nodes:
            return inc
    return None


def diagnose_onu(onu):
    now = _now()
    since = now - timedelta(hours=24)
    st = OnuLinkState.query.filter_by(onu_id=onu.id).first()
    ev = (PppoeSessionEvent.query.filter(PppoeSessionEvent.onu_id == onu.id, PppoeSessionEvent.at >= since)
          .order_by(PppoeSessionEvent.at.desc()).all())
    drops = sum(1 for e in ev if e.event in ('down', 'reconnect'))
    onu_drops = OnuStatusHistory.query.filter(
        OnuStatusHistory.onu_id == onu.id, OnuStatusHistory.created_at >= since,
        OnuStatusHistory.new_status != 'online').count()
    findings = []

    def add(code, level, text):
        findings.append({'code': code, 'level': level, 'text': text})

    status = (onu.status or '').lower()
    inc = _active_incident(onu) if status != 'online' else None
    if inc:
        add('mass_outage', 'critical',
            f'Bagian dari gangguan massal di {inc.node_type.upper()} {inc.node_name} '
            f'({inc.affected_count} pelanggan, insiden #{inc.id}, status {inc.status}).')
    if status == 'los':
        add('fiber', 'critical', 'Sinyal optik hilang (LOS): kabel drop putus/tertekuk, konektor lepas, '
                                 'atau port ODP bermasalah.')
    elif status == 'dyinggasp':
        add('power', 'warning', 'Modem kehilangan listrik (dying gasp): adaptor dicabut, listrik rumah padam, '
                                'atau adaptor rusak.')
    elif status and status != 'online':
        add('offline', 'warning', 'ONU offline tanpa alarm LOS/dying gasp: modem mati, hang, atau baru saja '
                                  'putus — cek fisik modem.')

    if status == 'online' and onu.rx_power is not None and onu.rx_power < _rx_critical():
        add('weak_signal', 'warning', f'Redaman lemah ({onu.rx_power} dBm, batas {_rx_critical()} dBm): '
                                      'bersihkan/ganti konektor, cek tekukan kabel drop.')

    pppoe = None
    if st:
        dev = db.session.get(MikrotikDevice, st.mikrotik_id) if st.mikrotik_id else None
        pppoe = {'user': st.pppoe_user or None, 'ip': st.pppoe_ip or None, 'session_up': bool(st.session_up),
                 'uptime': st.session_uptime or None, 'link_state': st.link_state, 'rtt_ms': st.rtt_ms,
                 'loss_pct': st.loss_pct, 'router': dev.name if dev else None,
                 'checked_at': st.checked_at.isoformat() + 'Z' if st.checked_at else None}
        if status == 'online':
            if st.link_state == 'no_session':
                add('pppoe_down', 'critical',
                    'ONU menyala tetapi PPPoE tidak login: cek status akun/isolir di billing, username/password '
                    'PPPoE di modem, atau WAN modem (VLAN/mode).')
            elif st.link_state == 'down':
                add('no_reply', 'warning', 'PPPoE tersambung tetapi ping ke modem gagal: modem hang/sibuk atau '
                                           'memblokir ping — coba reboot modem.')
            elif st.link_state == 'slow':
                add('slow', 'info', f'Koneksi lambat/ada loss (RTT {st.rtt_ms or "-"} ms, loss {st.loss_pct or 0}%).')

    if drops >= 3:
        if onu_drops >= 2:
            add('flapping_physical', 'warning',
                f'Putus-nyambung {drops}x dalam 24 jam dan ONU juga {onu_drops}x drop di OLT: masalah fisik/listrik '
                '(redaman, konektor, adaptor).')
        else:
            add('flapping_pppoe', 'warning',
                f'PPPoE putus-nyambung {drops}x dalam 24 jam padahal optik stabil: cek modem (hang/panas), '
                'beban router, atau sesi ganda.')
    elif onu_drops >= 3:
        add('flapping_optical', 'warning', f'ONU drop {onu_drops}x dalam 24 jam di OLT: cek redaman/konektor/adaptor.')

    if status == 'online':
        from models import GenieacsDeviceMap, SystemConfig
        m = GenieacsDeviceMap.query.filter_by(onu_id=onu.id).first()
        if m and m.last_inform:
            row = SystemConfig.query.filter_by(key='genieacs_stale_hours').first()
            stale_h = int(row.value) if row and str(row.value).isdigit() else 24
            age_h = (now - m.last_inform).total_seconds() / 3600
            if age_h > stale_h:
                add('acs_stale', 'info', f'Modem tidak lapor ke GenieACS selama {int(age_h)} jam: perintah TR-069 '
                                         'tidak akan sampai — cek VLAN/IP manajemen dan setelan ACS di modem.')

    if not findings:
        if status == 'online' and st and st.link_state == 'ok':
            add('ok', 'ok', 'Normal: optik baik, PPPoE tersambung, ping lancar.')
        elif status == 'online' and not st:
            add('no_pppoe_data', 'info', 'ONU online. Data PPPoE belum ada (ONU belum terhubung ke MikroTik '
                                         'di NMS) — diagnosis hanya dari sisi optik.')
        else:
            add('ok', 'ok', 'Tidak ada masalah terdeteksi.')

    findings.sort(key=lambda f: -_ORDER[f['level']])
    top = findings[0]
    actions = {
        'mass_outage': 'Ikuti insiden gangguan massal — tidak perlu kunjungan per pelanggan.',
        'fiber': 'Kirim teknisi: cek kabel drop dari ODP ke rumah dan konektor.',
        'power': 'Hubungi pelanggan: pastikan modem/adaptor menyala.',
        'offline': 'Hubungi pelanggan untuk cek modem; bila mati total, kirim teknisi.',
        'pppoe_down': 'Cek akun di billing/RADIUS, lalu cek PPPoE di modem (TR-069) atau minta pelanggan restart modem.',
        'no_reply': 'Reboot modem (TR-069 atau minta pelanggan).',
        'weak_signal': 'Jadwalkan perbaikan redaman.',
        'flapping_physical': 'Jadwalkan pengecekan fisik (konektor, kabel, adaptor).',
        'flapping_pppoe': 'Reboot/ganti modem; cek log router untuk sesi ganda.',
        'flapping_optical': 'Jadwalkan pengecekan fisik.',
    }
    return {
        'level': top['level'], 'code': top['code'], 'title': top['text'],
        'action': actions.get(top['code']), 'findings': findings, 'pppoe': pppoe,
        'onu_status': onu.status, 'rx_power': onu.rx_power,
        'events_24h': {'pppoe_drops': drops, 'onu_drops': onu_drops},
        'recent_events': [{'event': e.event, 'at': e.at.isoformat() + 'Z', 'ip': e.ip or None,
                           'prev_uptime': e.prev_uptime or None} for e in ev[:10]],
    }
