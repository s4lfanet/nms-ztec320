"""Denyut dashboard: putus/pulih per jam & rekonstruksi jumlah online."""
from datetime import datetime, timedelta, timezone

from app import db
from models import OnuStatusHistory
from tests.test_link_state import ctx, _mk_olt_onu  # noqa: F401
from dashboard_pulse import build_pulse, level


def test_pulse_reconstructs_online_series(ctx):
    olt, onu = _mk_olt_onu()          # 1 ONU, online sekarang
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # putus 3 jam lalu, pulih 1 jam lalu
    db.session.add_all([
        OnuStatusHistory(onu_id=onu.id, olt_id=olt.id, old_status='online', new_status='los',
                         created_at=now - timedelta(hours=2, minutes=30)),
        OnuStatusHistory(onu_id=onu.id, olt_id=olt.id, old_status='los', new_status='online',
                         created_at=now - timedelta(minutes=30)),
    ])
    db.session.commit()
    p = build_pulse(4, now=now)
    s = p['olts'][olt.id]
    assert s['drops'] == [0, 1, 0, 0] and s['recovers'] == [0, 0, 0, 1]
    assert s['online'] == [1, 0, 0, 1]      # akhir tiap jam
    assert p['online'] == [1, 0, 0, 1] and p['total_onu'] == 1
    assert s['level'][1] == 3               # 1 dari 1 ONU putus = parah


def test_level_thresholds():
    assert level(0, 100) == 0 and level(1, 100) == 1 and level(3, 100) == 2 and level(10, 100) == 3
