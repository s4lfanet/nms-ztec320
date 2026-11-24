"""Ketepatan & kualitas data FTTH.

1. Validasi feed core saat simpan — mencegah satu core dipakai dua node:
   - core keluar OTB  → maks satu ODC        (FTTHODC.otb_id + otb_core_number)
   - core masuk OTB   → maks satu port PON   (FTTHPonPort.otb_id + otb_core_number)
     (PON core N dan ODC core N di OTB yang sama itu NORMAL: patch masuk =
     core keluar; jadi dicek per jenis, bukan antarjenis)
   - core keluar ODC  → maks satu ODP        (FTTHODP.odc_id + odc_core_number)
   - core keluar JC   → maks satu node hilir (OTB/ODC/ODP/port ODP dengan jc_id + jc_core_number)
   - nomor core harus 1..total_cores pemilik.
   Hanya dicek bila feed berubah / node baru — data lama yang sudah bentrok
   tetap bisa diedit field lainnya, dan dilaporkan lewat build_report().
2. PON vs jalur fisik — ONU terdaftar di PON lain dari jalur ODP-nya.
3. build_report() — daftar masalah untuk halaman FTTH (hanya baca DB).
"""
import re
from collections import defaultdict

from models import db
from models import (FTTHOTB, FTTHODC, FTTHODP, FTTHJC, FTTHJCSplice, FTTHODPPort,
                    FTTHPonPort, ONU, OLT)

LABEL = {'otb': 'OTB', 'odc': 'ODC', 'odp': 'ODP', 'jc': 'JC', 'odp_port': 'port ODP', 'pon': 'port PON'}
OWNER_MODEL = {'otb': FTTHOTB, 'odc': FTTHODC, 'jc': FTTHJC}


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _name(kind, obj):
    if kind == 'odp_port':
        odp = db.session.get(FTTHODP, obj.odp_id)
        return f'{odp.name if odp else "ODP"} port {obj.port_number}'
    if kind == 'pon':
        return obj.pon_name or f'{obj.olt_name or "OLT"} {obj.frame}/{obj.slot}/{obj.port}'
    return getattr(obj, 'name', '') or f'#{obj.id}'


def users_of(owner_type, owner_id, core):
    """Node hilir yang memakai core keluar (owner_type, owner_id, core) → [(kind, obj)]."""
    if owner_type == 'otb':
        return [('odc', o) for o in FTTHODC.query.filter_by(feed_source='otb', otb_id=owner_id, otb_core_number=core)]
    if owner_type == 'odc':
        return [('odp', o) for o in FTTHODP.query.filter_by(feed_source='odc', odc_id=owner_id, odc_core_number=core)]
    if owner_type == 'jc':
        out = [('otb', o) for o in FTTHOTB.query.filter_by(feed_source='jc', jc_id=owner_id, jc_core_number=core)]
        out += [('odc', o) for o in FTTHODC.query.filter_by(feed_source='jc', jc_id=owner_id, jc_core_number=core)]
        out += [('odp', o) for o in FTTHODP.query.filter_by(feed_source='jc', jc_id=owner_id, jc_core_number=core)]
        out += [('odp_port', o) for o in FTTHODPPort.query.filter_by(feed_source='jc', jc_id=owner_id, jc_core_number=core)]
        return out
    return []


def check_core(owner_type, owner_id, core, me_kind, me_id):
    """Pesan error bila core di luar kapasitas / sudah dipakai node lain; None bila aman."""
    owner_id, core = _int(owner_id), _int(core)
    if not owner_id or core is None:
        return None
    owner = db.session.get(OWNER_MODEL[owner_type], owner_id)
    if not owner:
        return f'{LABEL[owner_type]} sumber tidak ditemukan'
    total = owner.total_cores or 0
    if core < 1 or (total and core > total):
        return f'Core {core} di luar kapasitas {LABEL[owner_type]} "{owner.name}" ({total} core)'
    for kind, obj in users_of(owner_type, owner_id, core):
        if kind == me_kind and obj.id == me_id:
            continue
        return (f'Core {core} di {LABEL[owner_type]} "{owner.name}" sudah dipakai '
                f'{LABEL[kind]} "{_name(kind, obj)}" — pilih core lain atau lepas dulu dari node itu')
    return None


def check_pon_core(otb_id, core, me_id=None):
    otb_id, core = _int(otb_id), _int(core)
    if not otb_id or core is None:
        return None
    otb = db.session.get(FTTHOTB, otb_id)
    if not otb:
        return 'OTB tujuan tidak ditemukan'
    total = otb.total_cores or 0
    if core < 1 or (total and core > total):
        return f'Core {core} di luar kapasitas OTB "{otb.name}" ({total} core)'
    for p in FTTHPonPort.query.filter_by(otb_id=otb_id, otb_core_number=core):
        if p.id != me_id:
            return f'Core {core} di OTB "{otb.name}" sudah dipakai port PON "{_name("pon", p)}"'
    return None


def feed_tuple(kind, o):
    if kind == 'odp_port':
        return (o.feed_source, o.jc_id, o.jc_core_number)
    if kind == 'otb':
        return (o.feed_source, o.jc_id, o.jc_core_number)
    if kind == 'odc':
        return (o.feed_source, o.otb_id, o.otb_core_number, o.jc_id, o.jc_core_number)
    if kind == 'odp':
        return (o.feed_source, o.odc_id, o.odc_core_number, o.jc_id, o.jc_core_number)
    return ()


def feed_error(kind, o, old=None):
    """Cek feed node `o` (sudah berisi nilai baru). `old` = feed_tuple sebelum
    diubah; bila sama, tidak dicek (data lama tetap bisa disunting)."""
    if old is not None and tuple(map(str, old)) == tuple(map(str, feed_tuple(kind, o))):
        return None
    me_id = getattr(o, 'id', None)
    if o.feed_source == 'jc':
        if o.jc_id and o.jc_core_number:
            return check_core('jc', o.jc_id, o.jc_core_number, kind, me_id)
        return None
    if kind == 'odc' and o.feed_source == 'otb' and o.otb_id:
        return check_core('otb', o.otb_id, o.otb_core_number, 'odc', me_id)
    if kind == 'odp' and o.feed_source == 'odc' and o.odc_id:
        return check_core('odc', o.odc_id, o.odc_core_number, 'odp', me_id)
    return None


# ─── PON vs jalur fisik ───

_PON_RE = re.compile(r'(\d+)/(\d+)/(\d+)')


def path_pon(odp):
    """(olt_id, frame, slot, port) PON yang menerangi ODP menurut topologi; None bila jalur putus."""
    from routes_ftth import _trace_upstream_from_odp  # hindari impor melingkar
    for h in _trace_upstream_from_odp(odp):
        if h.get('type') == 'olt':
            return h.get('id'), h.get('frame'), h.get('slot'), h.get('port')
    return None


def pon_mismatch(onu, odp):
    """Pesan bila ONU terdaftar di OLT/PON berbeda dari jalur fisik ODP-nya."""
    if not onu or not odp:
        return None
    p = path_pon(odp)
    if not p or not p[0]:
        return None
    olt_id, _frame, slot, port = p
    onu_pon = f'{onu.frame or 1}/{onu.slot}/{onu.port}'
    if olt_id != onu.olt_id or (slot and port and (slot, port) != (onu.slot, onu.port)):
        path_olt = db.session.get(OLT, olt_id)
        onu_olt = db.session.get(OLT, onu.olt_id)
        where = f'{path_olt.name if path_olt else "OLT"}' + (f' PON {_frame or 1}/{slot}/{port}' if slot and port else '')
        return (f'ONU "{onu.name or onu.serial_number}" terdaftar di {onu_olt.name if onu_olt else "OLT"} '
                f'PON {onu_pon}, tetapi jalur ODP "{odp.name}" mengarah ke {where}')
    return None


def parse_pon_name(text):
    m = _PON_RE.search(text or '')
    return tuple(int(x) for x in m.groups()) if m else (None, None, None)


# ─── Laporan ───

def _node(kind, obj, msg):
    return {'kind': kind, 'id': obj.id, 'name': _name(kind, obj), 'message': msg}


def build_report():
    otbs, odcs, odps, jcs = FTTHOTB.query.all(), FTTHODC.query.all(), FTTHODP.query.all(), FTTHJC.query.all()
    pons = FTTHPonPort.query.all()
    ports = FTTHODPPort.query.all()
    by = {'otb': {o.id: o for o in otbs}, 'odc': {o.id: o for o in odcs}, 'jc': {o.id: o for o in jcs}}
    issues = defaultdict(list)

    # Core ganda & di luar kapasitas
    claims = defaultdict(list)   # (owner_type, owner_id, core) → [(kind, obj)]
    for o in odcs:
        if o.feed_source == 'otb' and o.otb_id:
            claims[('otb', o.otb_id, o.otb_core_number)].append(('odc', o))
    for o in odps:
        if o.feed_source == 'odc' and o.odc_id:
            claims[('odc', o.odc_id, o.odc_core_number)].append(('odp', o))
    for kind, rows in (('otb', otbs), ('odc', odcs), ('odp', odps), ('odp_port', ports)):
        for o in rows:
            if o.feed_source == 'jc' and o.jc_id and o.jc_core_number:
                claims[('jc', o.jc_id, o.jc_core_number)].append((kind, o))
    pon_claims = defaultdict(list)
    for p in pons:
        if p.otb_id:
            pon_claims[('otb', p.otb_id, p.otb_core_number)].append(('pon', p))
    for (otype, oid, core), users in list(claims.items()) + list(pon_claims.items()):
        owner = by[otype].get(oid)
        if not owner:
            continue
        if core is None or core < 1 or (owner.total_cores and core > owner.total_cores):
            for kind, obj in users:
                issues['core_out_of_range'].append(_node(kind, obj, f'Memakai core {core} dari {LABEL[otype]} "{owner.name}" yang hanya punya {owner.total_cores} core'))
        if len(users) > 1:
            names = ', '.join(f'{LABEL[k]} "{_name(k, o)}"' for k, o in users)
            issues['core_conflict'].append({'kind': otype, 'id': oid, 'name': owner.name,
                                            'message': f'Core {core} dipakai {len(users)} node: {names}'})

    # Feed dari JC ke core yang tidak punya splice
    splice_out = defaultdict(set)
    for s in FTTHJCSplice.query.all():
        splice_out[s.jc_id].add(s.core_out)
    for (otype, oid, core), users in claims.items():
        if otype == 'jc' and oid in by['jc'] and core not in splice_out[oid]:
            for kind, obj in users:
                issues['missing_splice'].append(_node(kind, obj, f'JC "{by["jc"][oid].name}" belum punya splice untuk core keluar {core}'))

    # Node yatim (feed belum diisi / menunjuk node yang hilang)
    pon_otb_ids = {p.otb_id for p in pons if p.otb_id}
    port_ids = {p.id for p in ports}
    for o in otbs:
        ok = (o.jc_id in by['jc']) if o.feed_source == 'jc' else (o.id in pon_otb_ids or bool(o.olt_id))
        if not ok:
            issues['orphan'].append(_node('otb', o, 'Belum tersambung ke port PON/OLT atau JC'))
    for o in odcs:
        ok = (o.jc_id in by['jc']) if o.feed_source == 'jc' else (o.otb_id in by['otb'])
        if not ok:
            issues['orphan'].append(_node('odc', o, 'Belum tersambung ke OTB atau JC'))
    for o in odps:
        if o.feed_source == 'odp':
            ok = o.parent_odp_port_id in port_ids
        elif o.feed_source == 'jc':
            ok = o.jc_id in by['jc']
        else:
            ok = o.odc_id in by['odc']
        if not ok:
            issues['orphan'].append(_node('odp', o, 'Belum tersambung ke ODC, JC, atau port ODP'))
    for o in jcs:
        if not (o.parent_type and o.parent_id):
            issues['orphan'].append(_node('jc', o, 'Belum ada "Fed From" (sumber kabel masuk)'))

    # Tanpa koordinat
    for kind, rows in (('otb', otbs), ('odc', odcs), ('jc', jcs), ('odp', odps)):
        for o in rows:
            if o.latitude is None or o.longitude is None:
                issues['no_coordinates'].append(_node(kind, o, 'Belum ada titik koordinat (tidak tampil di peta)'))

    # ODP penuh
    used = defaultdict(int)
    for p in ports:
        if p.status == 'used' or p.onu_id:
            used[p.odp_id] += 1
    for o in odps:
        if o.total_ports and used[o.id] >= o.total_ports:
            issues['odp_full'].append(_node('odp', o, f'Semua {o.total_ports} port terpakai'))

    # ONU vs PON jalur fisik
    onu_by_id = {u.id: u for u in ONU.query.filter(ONU.id.in_([p.onu_id for p in ports if p.onu_id])).all()} if ports else {}
    odp_by_id = {o.id: o for o in odps}
    path_cache = {}
    for p in ports:
        onu = onu_by_id.get(p.onu_id)
        odp = odp_by_id.get(p.odp_id)
        if not onu or not odp:
            continue
        if odp.id not in path_cache:
            path_cache[odp.id] = path_pon(odp)
        if path_cache[odp.id] and path_cache[odp.id][0]:
            msg = pon_mismatch(onu, odp)
            if msg:
                issues['pon_mismatch'].append(_node('odp_port', p, msg))

    total_onus = ONU.query.count()
    assigned = len({p.onu_id for p in ports if p.onu_id})
    counts = {k: len(v) for k, v in issues.items()}
    return {
        'counts': counts,
        'total': sum(counts.values()),
        'issues': {k: v[:200] for k, v in issues.items()},
        'onus_unassigned': max(0, total_onus - assigned),
        'onus_total': total_onus,
    }
