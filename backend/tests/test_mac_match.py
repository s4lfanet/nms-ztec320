"""Match MAC sesi PPPoE ↔ ONU: mode exact, strip (awalan), dan offset (selisih)."""
from mac_match import match_sessions, norm_mac


def S(*cids):
    return [{'caller_id': c} for c in cids]


def run(sessions, onus, **kw):
    m, c = match_sessions(sessions, onus, **kw)
    return {x['session_idx']: x for x in m}, c


def test_norm_mac_formats():
    assert norm_mac('aa:bb:cc:dd:ee:01') == 'AABBCCDDEE01'
    assert norm_mac('AABB.CCDD.EE01') == 'AABBCCDDEE01'
    assert norm_mac('ZTEGC1234567') == ''
    assert norm_mac(None) == ''


def test_exact_match():
    m, c = run(S('AA:BB:CC:DD:EE:01'), [(1, 'AABBCCDDEE01'), (2, 'AABBCCDDEE02')])
    assert m[0]['onu_key'] == 1 and m[0]['match'] == 'exact' and not m[0]['collision'] and c == 0


def test_offset_matches_wan_mac_plus_one():
    # MAC ONU …50, router di belakangnya …51: awalan -1 oktet ambigu, offset tepat
    onus = [(1, 'AABBCCDDEE50'), (2, 'AABBCCDDEE60'), (3, 'AABBCCDDEE70')]
    m, _ = run(S('AABBCCDDEE51'), onus, strip=1)
    assert m[0]['collision'] is True                       # 3 ONU berbagi awalan
    m, c = run(S('AABBCCDDEE51'), onus, offset=2)
    assert m[0]['onu_key'] == 1 and m[0]['delta'] == 1 and m[0]['match'] == 'offset+1'
    assert not m[0]['collision'] and c == 0


def test_offset_negative_and_across_octet_boundary():
    m, _ = run(S('AABBCCDDEE4F'), [(1, 'AABBCCDDEE50')], offset=2)
    assert m[0]['delta'] == -1 and m[0]['match'] == 'offset-1'
    # …FF + 1 melewati batas oktet: gagal di awalan, berhasil di selisih angka
    onus = [(1, 'AABBCCDDEEFF')]
    assert run(S('AABBCCDDEF00'), onus, strip=1)[0] == {}
    m, _ = run(S('AABBCCDDEF00'), onus, offset=1)
    assert m[0]['onu_key'] == 1 and m[0]['delta'] == 1


def test_offset_out_of_range_and_other_oui_not_matched():
    assert run(S('AABBCCDDEE59'), [(1, 'AABBCCDDEE50')], offset=2)[0] == {}
    assert run(S('112233DDEE51'), [(1, 'AABBCCDDEE50')], offset=64)[0] == {}


def test_offset_picks_nearest_and_flags_ties():
    onus = [(1, 'AABBCCDDEE50'), (2, 'AABBCCDDEE53')]
    m, _ = run(S('AABBCCDDEE52'), onus, offset=4)
    assert m[0]['onu_key'] == 2 and not m[0]['collision']      # selisih 1 vs 2
    m, c = run(S('AABBCCDDEE51'), [(1, 'AABBCCDDEE50'), (2, 'AABBCCDDEE52')], offset=4)
    assert m[0]['collision'] is True and c == 1                # seri (±1)


def test_two_sessions_claiming_same_onu_are_ambiguous():
    m, c = run(S('AABBCCDDEE51', 'AABBCCDDEE52'), [(1, 'AABBCCDDEE50')], offset=4)
    assert m[0]['collision'] and m[1]['collision'] and c == 2


def test_strip_shows_nearest_candidate_but_stays_ambiguous():
    onus = [(1, 'AABBCCDDEE10'), (2, 'AABBCCDDEE50')]
    m, c = run(S('AABBCCDDEE51'), onus, strip=1)
    assert m[0]['onu_key'] == 2 and m[0]['collision'] is True and m[0]['match'] == 'partial-1'


def test_invalid_inputs_ignored():
    m, c = run(S('', 'not-a-mac'), [(1, 'AABBCCDDEE50'), (2, 'garbage')], offset=4)
    assert m == {} and c == 0
    assert run(S('AABBCCDDEE50'), [(1, 'AABBCCDDEE50')], strip=99, offset=-5)[0][0]['match'] == 'partial-3'
