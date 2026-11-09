"""Pencocokan MAC sesi PPPoE ↔ ONU (dipakai All ONUs → Match MAC).

Dua cara membandingkan, keduanya berbasis MAC 12 hex ter-normalisasi:

* ``strip=N``  — buang N oktet terakhir di kedua sisi lalu bandingkan awalan
  (perilaku lama). Banyak ONU satu batch pabrikan berbagi awalan yang sama,
  jadi hasilnya sering ambigu.
* ``offset=N`` — bandingkan sebagai ANGKA: cocok bila selisih |MAC_sesi −
  MAC_ONU| ≤ N dan OUI (3 oktet pertama) sama. Ini yang sesuai kasus CPE
  yang MAC WAN-nya = MAC ONU + beberapa (…50 → …51), termasuk saat selisih
  melewati batas oktet (…FF → …00 berikutnya) yang gagal di perbandingan
  awalan.

Aturan keamanan (kedua mode):
* kandidat terdekat (selisih terkecil) yang ditampilkan, bukan sembarang
* ambigu bila: terdekat seri, mode strip punya >1 kandidat, atau satu ONU
  diklaim lebih dari satu sesi → tidak boleh dipilih otomatis.
"""
import re

MAX_STRIP = 3
MAX_OFFSET = 64


def norm_mac(v):
    """12 hex huruf besar, '' bila bukan MAC."""
    h = re.sub(r'[^0-9A-Fa-f]', '', v or '').upper()
    return h if len(h) == 12 else ''


def match_sessions(sessions, onus, strip=0, offset=0):
    """Cocokkan sesi ke ONU.

    sessions: iterable dict dengan ``caller_id``
    onus:     iterable (onu_key, mac_string)
    Mengembalikan (matches, collisions) dengan matches berisi dict:
      session_idx, onu_key, delta (int, sesi − ONU), match, collision
    """
    strip = min(MAX_STRIP, max(0, int(strip or 0)))
    offset = min(MAX_OFFSET, max(0, int(offset or 0)))

    onu_list = []
    for key, mac in onus:
        m = norm_mac(mac)
        if m:
            onu_list.append((key, m, int(m, 16)))

    keep = 12 - 2 * strip
    by_prefix = {}
    by_oui = {}
    for item in onu_list:
        by_prefix.setdefault(item[1][:keep], []).append(item)
        by_oui.setdefault(item[1][:6], []).append(item)

    raw = []  # (session_idx, onu_key, delta, collision)
    for idx, s in enumerate(sessions):
        cid = norm_mac(s.get('caller_id'))
        if not cid:
            continue
        cval = int(cid, 16)
        if offset:
            cands = [it for it in by_oui.get(cid[:6], []) if abs(cval - it[2]) <= offset]
        else:
            cands = by_prefix.get(cid[:keep], [])
        if not cands:
            continue
        ranked = sorted(cands, key=lambda it: (abs(cval - it[2]), it[1]))
        best = ranked[0]
        d_best = abs(cval - best[2])
        tie = len(ranked) > 1 and abs(cval - ranked[1][2]) == d_best
        if offset:
            ambiguous = tie
        else:
            # mode exact/strip: lebih dari satu kandidat = ambigu (perilaku lama)
            ambiguous = len(ranked) > 1
        raw.append((idx, best[0], cval - best[2], ambiguous))

    # satu ONU diklaim >1 sesi → semuanya ambigu
    claims = {}
    for _idx, key, _d, _a in raw:
        claims[key] = claims.get(key, 0) + 1

    matches, collisions = [], 0
    for idx, key, delta, ambiguous in raw:
        collision = ambiguous or claims[key] > 1
        if collision:
            collisions += 1
        if offset:
            label = 'exact' if delta == 0 else f'offset{delta:+d}'
        else:
            label = 'exact' if strip == 0 else f'partial-{strip}'
        matches.append({'session_idx': idx, 'onu_key': key, 'delta': delta,
                        'match': label, 'collision': collision})
    return matches, collisions
