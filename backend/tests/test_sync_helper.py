"""Tests for sync_helper.save_sync_result — specifically the light-sync path,
where a partial SNMP walk (some concurrent bulk-walks in
snmp_core.py:_collect_onus_light_async time out while others don't) can
return far fewer ONUs than actually exist on the OLT.

Run with: py -3 -m pytest tests/test_sync_helper.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import OLT, ONU, OLTSyncStatus

app.config['TESTING'] = True


@pytest.fixture
def db_ctx():
    import tempfile
    from sqlalchemy import create_engine as _create_engine

    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    _tmpdb.close()
    _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')

    with app.app_context():
        _orig_engine = db.engines.get(None)
        db.engines[None] = _test_engine
        db.create_all()
        yield

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


class TestLightSyncPartialWalk:
    def test_missed_onus_kept_and_counted_in_totals(self, db_ctx):
        """3 ONUs already in DB; a light-sync result only reports 1 of them
        (simulating a partial SNMP walk). The other 2 must not be deleted
        (existing protection) AND olt.total_onu must still be 3, not 1."""
        from sync_helper import save_sync_result

        with app.app_context():
            olt = OLT(name='Partial-Walk-OLT', ip_address='10.9.9.9', vendor='ZTE', model='C320')
            db.session.add(olt)
            db.session.commit()

            onus = [
                ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=1, onu_index=110101,
                    serial_number='ZTEGA001', status='online'),
                ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=2, onu_index=110102,
                    serial_number='ZTEGA002', status='los'),
                ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=3, onu_index=110103,
                    serial_number='ZTEGA003', status='offline'),
            ]
            db.session.add_all(onus)
            sync = OLTSyncStatus(olt_id=olt.id)
            db.session.add(sync)
            db.session.commit()
            olt_id = olt.id

            # Partial light-sync result: only the first ONU came back (its
            # status flips to 'online' — should still register that update).
            result = {
                'system': {}, 'snmp_ok': True, 'telnet_ok': False,
                'onus': [{
                    'onu_index': 110101, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                    'serial_number': 'ZTEGA001', 'name': 'Cust A', 'status': 'online',
                    'oper_state': 1, 'reg_status': 1,
                }],
            }
            onu_count, stale_count = save_sync_result(olt, result, sync, light=True)
            db.session.commit()

            reloaded = db.session.get(OLT, olt_id)
            all_onus = ONU.query.filter_by(olt_id=olt_id).all()

        assert stale_count == 0  # light mode never deletes
        assert len(all_onus) == 3  # all 3 rows still present
        assert reloaded.total_onu == 3  # not 1 — the fix under test
        # The 2 missed ONUs keep their last-known status (los + offline);
        # the 1 seen ONU is now online. So online=1, los=1, offline=1.
        assert reloaded.online_onu == 1
        assert reloaded.los_onu == 1
        assert reloaded.offline_onu == 1

    def test_full_sync_still_deletes_stale_onus(self, db_ctx):
        """Sanity check the fix didn't touch full-sync behavior: a full sync
        (light=False) still deletes ONUs missing from the result."""
        from sync_helper import save_sync_result

        with app.app_context():
            olt = OLT(name='Full-Sync-OLT', ip_address='10.9.9.10', vendor='ZTE', model='C320')
            db.session.add(olt)
            db.session.commit()
            db.session.add(ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=1,
                                onu_index=110201, serial_number='ZTEGB001', status='online'))
            sync = OLTSyncStatus(olt_id=olt.id)
            db.session.add(sync)
            db.session.commit()
            olt_id = olt.id

            result = {'system': {}, 'snmp_ok': True, 'telnet_ok': True, 'onus': []}
            onu_count, stale_count = save_sync_result(olt, result, sync, light=False)
            db.session.commit()

            remaining = ONU.query.filter_by(olt_id=olt_id).count()
            reloaded = db.session.get(OLT, olt_id)

        assert stale_count == 1
        assert remaining == 0
        assert reloaded.total_onu == 0


class TestFullSyncPartialWalk:
    """A full sync (light=False) does more work per ONU than a light sync
    (CLI enrichment on top of SNMP), so it's at least as exposed to the same
    per-batch timeouts light mode already guards against — more so on a
    large OLT (500+ ONUs, per a real user report). Before this fix, a full
    sync that only partially completed its collection (for any reason — a
    walk timeout, a network blip, an overloaded OLT) had its "missing" ONUs
    unconditionally deleted, silently wiping out perfectly-online ONUs the
    walk simply didn't reach in time on a single unlucky cycle."""

    def _make_olt_with_onus(self, name, ip, count):
        olt = OLT(name=name, ip_address=ip, vendor='ZTE', model='C320')
        db.session.add(olt)
        db.session.commit()
        for i in range(1, count + 1):
            db.session.add(ONU(
                olt_id=olt.id, frame=1, slot=1, port=1, onu_id=i,
                onu_index=110000 + i, serial_number=f'ZTEGC{i:04d}', status='online',
            ))
        sync = OLTSyncStatus(olt_id=olt.id)
        db.session.add(sync)
        db.session.commit()
        return olt, sync

    def test_dramatically_short_full_sync_result_skips_deletion(self, db_ctx):
        """500 ONUs known from before; this full-sync result only found 50
        of them (a walk that gave up ~90% of the way through). None of the
        450 missing ones should be deleted — and the OLT's total_onu tile
        must still reflect all 500, not 50."""
        from sync_helper import save_sync_result

        with app.app_context():
            olt, sync = self._make_olt_with_onus('Big-OLT-Partial', '10.9.9.20', 500)
            olt_id = olt.id

            # Only the first 50 ONUs came back in this (partial) full sync.
            result = {
                'system': {}, 'snmp_ok': True, 'telnet_ok': True,
                'onus': [
                    {'onu_index': 110000 + i, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': i,
                     'serial_number': f'ZTEGC{i:04d}', 'name': '', 'status': 'online',
                     'oper_state': 1, 'reg_status': 1}
                    for i in range(1, 51)
                ],
            }
            onu_count, stale_count = save_sync_result(olt, result, sync, light=False)
            db.session.commit()

            remaining = ONU.query.filter_by(olt_id=olt_id).count()
            reloaded = db.session.get(OLT, olt_id)

        assert stale_count == 0, "partial full-sync result must not delete the ONUs it missed"
        assert remaining == 500
        assert reloaded.total_onu == 500

    def test_dramatically_short_full_sync_logs_warning(self, db_ctx, caplog):
        from sync_helper import save_sync_result
        import logging

        with app.app_context():
            olt, sync = self._make_olt_with_onus('Big-OLT-Warn', '10.9.9.21', 500)
            result = {
                'system': {}, 'snmp_ok': True, 'telnet_ok': True,
                'onus': [
                    {'onu_index': 110000 + i, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': i,
                     'serial_number': f'ZTEGC{i:04d}', 'name': '', 'status': 'online',
                     'oper_state': 1, 'reg_status': 1}
                    for i in range(1, 51)
                ],
            }
            with caplog.at_level(logging.WARNING):
                save_sync_result(olt, result, sync, light=False)

        assert any('partial walk' in r.message for r in caplog.records)

    def test_genuine_small_scale_removal_still_works(self, db_ctx):
        """A small OLT (below the 20-ONU threshold) losing a handful of ONUs
        in one pass is very plausibly real (someone unplugged a unit) —
        must still delete normally, not get treated as a partial walk."""
        from sync_helper import save_sync_result

        with app.app_context():
            olt, sync = self._make_olt_with_onus('Small-OLT', '10.9.9.22', 5)
            olt_id = olt.id
            # Only 2 of the 5 ONUs still respond — plausible for a small OLT.
            result = {
                'system': {}, 'snmp_ok': True, 'telnet_ok': True,
                'onus': [
                    {'onu_index': 110001, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                     'serial_number': 'ZTEGC0001', 'name': '', 'status': 'online',
                     'oper_state': 1, 'reg_status': 1},
                    {'onu_index': 110002, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 2,
                     'serial_number': 'ZTEGC0002', 'name': '', 'status': 'online',
                     'oper_state': 1, 'reg_status': 1},
                ],
            }
            onu_count, stale_count = save_sync_result(olt, result, sync, light=False)
            db.session.commit()
            remaining = ONU.query.filter_by(olt_id=olt_id).count()

        assert stale_count == 3
        assert remaining == 2

    def test_mildly_lower_count_still_deletes_normally(self, db_ctx):
        """500 known, 480 found this round (a handful of ONUs genuinely
        went offline/were removed) — well within the "this looks like a
        real, not a partial walk" range, so normal deletion still applies."""
        from sync_helper import save_sync_result

        with app.app_context():
            olt, sync = self._make_olt_with_onus('Big-OLT-Mild', '10.9.9.23', 500)
            olt_id = olt.id
            result = {
                'system': {}, 'snmp_ok': True, 'telnet_ok': True,
                'onus': [
                    {'onu_index': 110000 + i, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': i,
                     'serial_number': f'ZTEGC{i:04d}', 'name': '', 'status': 'online',
                     'oper_state': 1, 'reg_status': 1}
                    for i in range(1, 481)
                ],
            }
            onu_count, stale_count = save_sync_result(olt, result, sync, light=False)
            db.session.commit()
            remaining = ONU.query.filter_by(olt_id=olt_id).count()

        assert stale_count == 20
        assert remaining == 480
