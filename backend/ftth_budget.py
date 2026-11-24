"""Anggaran redaman (loss budget) jalur ONU — FTTH tahap 2.

Total redaman = kabel tiap segmen + splitter (ODC/ODP) + konektor tiap
titik sambung + splice di JC. Lalu dibandingkan dengan RX yang terukur:

    perkiraan RX ONU = TX PON OLT − total redaman
    selisih         = perkiraan − terukur   (positif = terukur lebih buruk)

Nilai yang tidak diisi di data memakai angka standar dan ditandai `assumed`,
supaya jelas mana yang hasil ukur/isian dan mana yang perkiraan. Hanya baca
DB (tanpa Telnet/SNMP).
"""
import re

from models import db, SystemConfig, FTTHODC, FTTHODP, FTTHODPPort, OLTPort

# Rugi sisip splitter PLC rata (nilai tipikal lembar data, dB)
SPLITTER_LOSS = {2: 3.7, 4: 7.3, 8: 10.5, 16: 13.7, 32: 17.1, 64: 20.5}

DEFAULTS = {
    'ftth_connector_loss_db': 0.5,    # per titik konektor/adaptor (OTB, ODC, ODP, ONU)
    'ftth_splice_loss_db': 0.1,       # per sambungan fusion di JC
    'ftth_olt_tx_dbm': 3.0,           # TX PON bila SFP belum terbaca (GPON kelas B+/C+)
    'ftth_budget_tolerance_db': 3.0,  # selisih wajar perkiraan vs terukur
}


def _cfg(key):
    row = SystemConfig.query.filter_by(key=key).first()
    try:
        return float(row.value) if row and row.value not in (None, '') else DEFAULTS[key]
    except (TypeError, ValueError):
        return DEFAULTS[key]


def settings():
    return {k: _cfg(k) for k in DEFAULTS}


def _float(v):
    try:
        f = float(str(v).strip().split()[0])
        return f if -50 < f < 20 else None
    except (TypeError, ValueError, IndexError, AttributeError):
        return None


def splitter_ratio(model_text):
    """'1:8', '1x16', 'PLC 1/32' → 8/16/32; None bila tidak terbaca."""
    m = re.search(r'1\s*[:x/×]\s*(\d{1,2})', model_text or '', re.I)
    return int(m.group(1)) if m else None


def splitter_loss(node, path='tap'):
    """(dB, assumed, keterangan) untuk splitter di ODC/ODP; None bila tak ada data.

    path='tap'     → keluar ke pelanggan / ODP berikutnya lewat port biasa
    path='through' → keluar lewat port "through" splitter tak rata (kaskade)
    """
    uneven = (node.splitter_ratio_type or 'even') == 'uneven'
    if uneven and path == 'through' and node.splitter_through_loss_db is not None:
        return node.splitter_through_loss_db, False, 'through'
    if node.splitter_tap_loss_db is not None:
        return node.splitter_tap_loss_db, False, 'tap' if uneven else (node.splitter_model or '')
    ratio = splitter_ratio(node.splitter_model)
    if ratio and ratio in SPLITTER_LOSS:
        return SPLITTER_LOSS[ratio], True, f'1:{ratio}'
    return None


def pon_tx_dbm(olt_hop):
    """TX SFP PON dari hasil sync (olt_pon_ports.sfp_tx_power); None bila belum ada."""
    if not olt_hop or not olt_hop.get('id') or not olt_hop.get('slot') or not olt_hop.get('port'):
        return None
    key = f"{olt_hop.get('frame') or 1}/{olt_hop['slot']}/{olt_hop['port']}"
    for p in OLTPort.query.filter_by(olt_id=olt_hop['id']).all():
        if (p.port_name or '').endswith(key):
            return _float(p.sfp_tx_power)
    return None


def build(hops, onu, odp_port=None):
    """Hitung anggaran redaman dari hop trace (urutan OLT → ODP)."""
    cfg = settings()
    conn, splice = cfg['ftth_connector_loss_db'], cfg['ftth_splice_loss_db']
    items, missing = [], []

    def add(kind, label, db_val, assumed=False):
        items.append({'kind': kind, 'label': label, 'db': round(db_val, 2), 'assumed': assumed})

    olt_hop = next((h for h in hops if h.get('type') == 'olt'), None)
    if any(h.get('type') == 'gap' for h in hops):
        missing.append('Jalur belum lengkap sampai OLT — total redaman di bawah hanya sebagian')

    # Konektor di sisi OLT/ODF
    add('connector', 'Konektor OLT/ODF', conn, True)
    node_hops = [h for h in hops if h.get('type') in ('otb', 'jc', 'odc', 'odp')]

    def nm(t, name):
        # "ODC Pasar" sudah memuat jenisnya → jangan jadi "ODC ODC Pasar"
        return name if t.upper() in (name or '').upper() else f'{t.upper()} {name}'.strip()

    for i, h in enumerate(node_hops):
        t, name = h['type'], h.get('name') or ''
        att = h.get('cable_attenuation_db')
        if att is not None:
            add('cable', f'Kabel masuk {nm(t, name)}', att)
        elif t != 'otb':
            missing.append(f'Panjang kabel masuk {nm(t, name)} belum diisi')
        if t == 'jc':
            add('splice', f'Splice {nm(t, name)}', splice, True)
        elif t in ('odc', 'odp'):
            add('connector', f'Konektor {nm(t, name)}', conn, True)
            model = FTTHODC if t == 'odc' else FTTHODP
            node = db.session.get(model, h.get('id')) if h.get('id') else None
            # Kaskade: ODP induk dilewati lewat port yang menyuplai ODP anak
            next_is_odp = any(n['type'] == 'odp' for n in node_hops[i + 1:])
            path = 'through' if (t == 'odp' and next_is_odp) else 'tap'
            sl = splitter_loss(node, path) if node else None
            if sl:
                add('splitter', f'Splitter {nm(t, name)}' + (f' ({sl[2]})' if sl[2] else ''), sl[0], sl[1])
            else:
                missing.append(f'Splitter {nm(t, name)} belum diisi (model/rugi)')
    # Kabel drop ODP → pelanggan + konektor ONU
    last = next((h for h in reversed(node_hops) if h['type'] == 'odp'), None)
    if last:
        drop = last.get('drop_cable_attenuation_db')
        if drop is not None:
            add('cable', 'Kabel drop ke pelanggan', drop)
        else:
            missing.append('Panjang kabel drop pelanggan belum diisi')
    add('connector', 'Konektor ONU', conn, True)

    total = round(sum(i['db'] for i in items), 2)
    tx = pon_tx_dbm(olt_hop)
    tx_assumed = tx is None
    if tx is None:
        tx = cfg['ftth_olt_tx_dbm']
    expected_rx = round(tx - total, 2)

    measured = onu.onu_rx_power if onu else None
    online = (onu.status or '').lower() == 'online' if onu else False
    tol = cfg['ftth_budget_tolerance_db']
    verdict, delta = 'unknown', None
    # Tanpa splitter / jalur putus, perkiraan meleset jauh → jangan dinilai.
    unreliable = any(m.startswith('Splitter') or m.startswith('Jalur belum') for m in missing)
    if measured is not None and online and unreliable:
        delta = round(expected_rx - measured, 2)
        verdict = 'incomplete'
    elif measured is not None and online:
        delta = round(expected_rx - measured, 2)
        if delta > tol:
            verdict = 'worse'     # terukur jauh lebih lemah dari perkiraan
        elif delta < -tol:
            verdict = 'better'    # terukur jauh lebih kuat → data jalur kemungkinan keliru
        else:
            verdict = 'ok'
    return {
        'items': items,
        'total_db': total,
        'assumed_count': sum(1 for i in items if i['assumed']),
        'missing': missing,
        'olt_tx_dbm': tx,
        'olt_tx_assumed': tx_assumed,
        'expected_rx_dbm': expected_rx,
        'measured_rx_dbm': measured if online else None,
        'delta_db': delta,
        'tolerance_db': tol,
        'verdict': verdict,
    }
