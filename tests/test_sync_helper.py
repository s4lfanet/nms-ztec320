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
