"""MVLAN opsional (0/kosong) pada validasi layanan provisioning."""
import pytest

from cli_sanitize import CliValidationError


def _san(**svc):
    from routes_onu import _sanitize_provisioning_input
    return _sanitize_provisioning_input(services=[svc])['services'][0]


@pytest.mark.parametrize('mv', [0, '0', '', None])
def test_mvlan_zero_or_empty_allowed(mv):
    s = _san(vlan=100, mvlan=mv)
    assert s['vlan'] == 100 and s.get('mvlan') in (0, '', None)


def test_mvlan_valid_value_kept():
    assert _san(vlan=100, mvlan='200')['mvlan'] == 200


@pytest.mark.parametrize('mv', [-1, 4095, 'abc'])
def test_mvlan_invalid_rejected(mv):
    with pytest.raises(CliValidationError):
        _san(vlan=100, mvlan=mv)


def test_primary_vlan_zero_still_rejected():
    with pytest.raises(CliValidationError):
        _san(vlan=0)
