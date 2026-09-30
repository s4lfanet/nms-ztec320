"""Tests for snmp_core._collect_onus_light_async incomplete-walk guards.

When a concurrent GETBULK walk comes back truncated (SNMP throttling on the
OLT), ONUs missing from a walk must get status='unknown' so save_sync_result
preserves their previous status/signal instead of mis-classifying them:
- missing from signal walks (oper=4/5, no olt_rx, no onu_rx) must NOT be
  classified 'online' (the old bug — it flipped real dyinggasp ONUs to
  online) nor 'dyinggasp' (an online ONU dropped from a partial walk looks
  identical to a powered-off one).
- missing from the oper_state walk → 'unknown' (pre-existing guard).

Also covers the sync_helper side: 'unknown' must leave rx/tx untouched.

Run with: py -3 -m pytest tests/test_snmp_light_incomplete.py -v
"""
import os
import sys
import asyncio
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from snmp_core import (
    SNMPCollector,
    OID_ONU_NAME, OID_ONU_SERIAL, OID_ONU_DESCRIPTION,
    OID_OPER_STATE, OID_DEREG_REASON, OID_RX_POWER, OID_TX_POWER, OID_OLT_RX,
    BOARD1_BASE, PON_INCREMENT,
)

PON_INDEX = BOARD1_BASE + 1 * PON_INCREMENT  # slot 1, port 1
NUM_ONUS = 25
NUM_DYING = 2          # last 2 ONUs are powered off (no signal, dereg=PowerOff)
DEREG_POWEROFF = 9     # decode_dereg_reason(9) == 'PowerOff'
SIGNAL_RAW = 3000      # decode_rx_power(3000) == -24.0 dBm


def _serial_bytes(i):
    # parse_serial: 4-byte ASCII vendor + serial hex
    return b'ZTEG' + i.to_bytes(4, 'big')


def _build_walks(oper_ids=None, olt_rx_ids=(), onu_rx_ids=()):
    """Build canned walk results keyed by OID for NUM_ONUS ONUs.

    oper_ids: onu_slots present in the oper/dereg walks (default all).
    olt_rx_ids / onu_rx_ids: onu_slots present in the signal walks.
    """
    if oper_ids is None:
        oper_ids = range(1, NUM_ONUS + 1)
    walks = {oid: [] for oid in (
        OID_ONU_NAME, OID_ONU_SERIAL, OID_ONU_DESCRIPTION,
        OID_OPER_STATE, OID_DEREG_REASON, OID_RX_POWER, OID_TX_POWER, OID_OLT_RX,
    )}
    for i in range(1, NUM_ONUS + 1):
        cfg_suffix = f'.{PON_INDEX}.{i}'
        reg_suffix = f'.{PON_INDEX}.{i}.1'
        walks[OID_ONU_NAME].append(
            (OID_ONU_NAME + cfg_suffix, None, f'ONU-{i:02d}'))
        walks[OID_ONU_SERIAL].append(
            (OID_ONU_SERIAL + cfg_suffix, _serial_bytes(i), ''))
        walks[OID_ONU_DESCRIPTION].append(
            (OID_ONU_DESCRIPTION + cfg_suffix, None, ''))
        if i in oper_ids:
            walks[OID_OPER_STATE].append((OID_OPER_STATE + reg_suffix, 5, '5'))
            dereg = DEREG_POWEROFF if i > NUM_ONUS - NUM_DYING else 0
            walks[OID_DEREG_REASON].append(
                (OID_DEREG_REASON + reg_suffix, dereg, str(dereg)))
        if i in olt_rx_ids:
            walks[OID_OLT_RX].append(
                (OID_OLT_RX + reg_suffix, SIGNAL_RAW, str(SIGNAL_RAW)))
        if i in onu_rx_ids:
            walks[OID_RX_POWER].append(
                (OID_RX_POWER + reg_suffix, SIGNAL_RAW, str(SIGNAL_RAW)))
            walks[OID_TX_POWER].append(
                (OID_TX_POWER + reg_suffix, SIGNAL_RAW, str(SIGNAL_RAW)))
    return walks


def _collect(walks):
    collector = SNMPCollector('10.255.255.1')

    async def fake_walk(oid):
        return walks.get(oid, [])

    collector._bulk_walk = fake_walk
    return asyncio.run(collector._collect_onus_light_async())


def _collect_with(walk_fn, monkeypatch):
    """Run the light collection with a custom _bulk_walk implementation.
    Returns (onus, call_counts dict keyed by OID)."""
    collector = SNMPCollector('10.255.255.1')
    counts = {}
    sleep_calls = []

    async def fake_walk(oid):
        counts[oid] = counts.get(oid, 0) + 1
        return walk_fn(oid, counts[oid], collector)

    async def fake_sleep(_s):
        sleep_calls.append(_s)

    monkeypatch.setattr(asyncio, 'sleep', fake_sleep)
    collector._bulk_walk = fake_walk
    onus = asyncio.run(collector._collect_onus_light_async())
    return onus, counts


def _by_onu_id(onus):
    return {o['onu_id']: o for o in onus}


ONLINE_IDS = range(1, NUM_ONUS - NUM_DYING + 1)      # 1..23
DYING_IDS = range(NUM_ONUS - NUM_DYING + 1, NUM_ONUS + 1)  # 24..25


class TestLightCollectSignalWalks:
    def test_complete_walks(self):
        """Complete signal walks: 23 signalled ONUs online, 2 no-signal
        ONUs with dereg=PowerOff classified dyinggasp."""
        onus = _by_onu_id(_collect(_build_walks(
            olt_rx_ids=ONLINE_IDS, onu_rx_ids=ONLINE_IDS)))
        assert len(onus) == NUM_ONUS
        for i in ONLINE_IDS:
            assert onus[i]['status'] == 'online', i
            assert onus[i]['rx_power'] == -24.0
        for i in DYING_IDS:
            assert onus[i]['status'] == 'dyinggasp', i
            assert onus[i]['last_dereg_reason'] == 'PowerOff'

    def test_olt_rx_walk_empty(self):
        """olt_rx walk returns nothing; onu_rx walk is complete. Active ONUs
        with no signal at all must be 'unknown' — NOT 'online' (the old bug
        that flipped real dyinggasp ONUs to online) and NOT 'dyinggasp'
        (can't distinguish a truncated walk from real power-off)."""
        onus = _by_onu_id(_collect(_build_walks(
            olt_rx_ids=(), onu_rx_ids=ONLINE_IDS)))
        for i in ONLINE_IDS:
            assert onus[i]['status'] == 'online', i
        for i in DYING_IDS:
            assert onus[i]['status'] == 'unknown', i

    def test_both_signal_walks_partial(self):
        """Both signal walks return only 5 of the 23 signalled ONUs (>50% of
        active ONUs missing) — the missing ones can't be told apart from real
        dyinggasp ONUs, so all get 'unknown'."""
        present = range(1, 6)
        onus = _by_onu_id(_collect(_build_walks(
            olt_rx_ids=present, onu_rx_ids=present)))
        for i in present:
            assert onus[i]['status'] == 'online', i
        for i in range(6, NUM_ONUS + 1):
            assert onus[i]['status'] == 'unknown', i

    def test_oper_walk_incomplete(self):
        """oper_state walk has only 10/25 entries (>10% missing) — ONUs
        absent from the oper walk get 'unknown', present ones classify
        normally."""
        oper_ids = range(1, 11)
        onus = _by_onu_id(_collect(_build_walks(
            oper_ids=oper_ids, olt_rx_ids=oper_ids, onu_rx_ids=oper_ids)))
        for i in oper_ids:
            assert onus[i]['status'] == 'online', i
        for i in range(11, NUM_ONUS + 1):
            assert onus[i]['status'] == 'unknown', i


class TestTruncatedWalkRetry:
    """A truncated walk is retried once, sequentially."""

    def test_retry_recovers_truncated_oper_walk(self, monkeypatch):
        """First oper walk returns 10/25, retry returns all 25 — result is
        fully classified, no 'unknown' statuses."""
        walks = _build_walks(olt_rx_ids=ONLINE_IDS, onu_rx_ids=ONLINE_IDS)

        def walk_fn(oid, call_no, collector):
            if oid == OID_OPER_STATE and call_no == 1:
                collector._truncated_walks.add(oid)
                # Truncated: only the first 10 entries
                return walks[oid][:10]
            return walks.get(oid, [])

        onus, counts = _collect_with(walk_fn, monkeypatch)
        by_id = _by_onu_id(onus)
        assert len(onus) == NUM_ONUS
        assert not any(o['status'] == 'unknown' for o in onus)
        for i in ONLINE_IDS:
            assert by_id[i]['status'] == 'online', i
        for i in DYING_IDS:
            assert by_id[i]['status'] == 'dyinggasp', i
        assert counts[OID_OPER_STATE] == 2
        assert counts[OID_ONU_SERIAL] == 1

    def test_retry_still_partial_keeps_unknown(self, monkeypatch):
        """If the retry is also truncated, the incomplete guard still marks
        missing ONUs 'unknown' — same behavior as before the retry existed."""
        walks = _build_walks(olt_rx_ids=ONLINE_IDS, onu_rx_ids=ONLINE_IDS)

        def walk_fn(oid, call_no, collector):
            if oid == OID_OPER_STATE:
                if call_no == 1:
                    collector._truncated_walks.add(oid)
                return walks[oid][:10]
            return walks.get(oid, [])

        onus, counts = _collect_with(walk_fn, monkeypatch)
        by_id = _by_onu_id(onus)
        assert counts[OID_OPER_STATE] == 2
        for i in range(1, 11):
            assert by_id[i]['status'] == 'online', i
        for i in range(11, NUM_ONUS + 1):
            assert by_id[i]['status'] == 'unknown', i

    def test_truncated_flag_triggers_retry_even_when_counts_look_ok(self, monkeypatch):
        """The explicit _truncated_walks flag alone triggers a retry even
        when no incomplete-walk heuristic fires."""
        walks = _build_walks(olt_rx_ids=ONLINE_IDS, onu_rx_ids=ONLINE_IDS)

        def walk_fn(oid, call_no, collector):
            if oid == OID_RX_POWER and call_no == 1:
                collector._truncated_walks.add(oid)
            return walks.get(oid, [])

        onus, counts = _collect_with(walk_fn, monkeypatch)
        assert counts[OID_RX_POWER] == 2
        for oid, n in counts.items():
            if oid != OID_RX_POWER:
                assert n == 1, oid
        # Data was complete, so classification is unaffected
        assert not any(o['status'] == 'unknown' for o in onus)


class TestSyncHelperUnknownPreservesSignal:
    """save_sync_result must not touch rx/tx/onu_rx when status='unknown'."""

    @pytest.fixture
    def db_ctx(self):
        import tempfile
        from sqlalchemy import create_engine as _create_engine
        from app import app, db

        app.config['TESTING'] = True
        _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        _tmpdb.close()
        _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')

        with app.app_context():
            _orig_engine = db.engines.get(None)
            db.engines[None] = _test_engine
            db.create_all()
            yield app, db

        with app.app_context():
            db.drop_all()
            if _orig_engine is not None:
                db.engines[None] = _orig_engine
            else:
                db.engines.pop(None, None)
        try:
            os.unlink(_tmpdb.name)
        except (OSError, PermissionError):
            pass

    def _save(self, app, status_in_db, rx_in_db):
        from app import db
        from models import OLT, ONU, OLTSyncStatus
        from sync_helper import save_sync_result
        with app.app_context():
            olt = OLT(name='Sig-Guard-OLT', ip_address='10.9.9.30',
                      vendor='ZTE', model='C320')
            db.session.add(olt)
            db.session.commit()
            db.session.add(ONU(
                olt_id=olt.id, frame=1, slot=1, port=1, onu_id=1,
                onu_index=110501, serial_number='ZTEGE001',
                status=status_in_db, rx_power=rx_in_db))
            sync = OLTSyncStatus(olt_id=olt.id)
            db.session.add(sync)
            db.session.commit()
            olt_id = olt.id
            result = {
                'system': {}, 'snmp_ok': True, 'telnet_ok': False,
                'onus': [{
                    'onu_index': 110501, 'frame': 1, 'slot': 1, 'port': 1,
                    'onu_id': 1, 'serial_number': 'ZTEGE001', 'name': '',
                    'status': 'unknown', 'oper_state': 5, 'reg_status': 0,
                    'rx_power': None, 'tx_power': None, 'onu_rx_power': None,
                }],
            }
            save_sync_result(olt, result, sync, light=True)
            db.session.commit()
            return ONU.query.filter_by(olt_id=olt_id).first()

    def test_unknown_keeps_dyinggasp(self, db_ctx):
        app, _ = db_ctx
        onu = self._save(app, 'dyinggasp', None)
        assert onu.status == 'dyinggasp'
        assert onu.rx_power is None

    def test_unknown_keeps_online_and_rx(self, db_ctx):
        app, _ = db_ctx
        onu = self._save(app, 'online', -20.5)
        assert onu.status == 'online'
        assert onu.rx_power == -20.5
