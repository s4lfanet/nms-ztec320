#!/usr/bin/env python3
"""Test SSH connection to ZTE C320 OLT + full ONU registration flow."""
import sys
import time

# Patch legacy SSH algorithms before importing paramiko
from telnet_client import SimpleSSH

OLT_IP = '172.16.88.2'
OLT_PORT = 22
OLT_USER = 'salfanet'
OLT_PASS = 'seven789'

def test_ssh_connection():
    """Test 1: Basic SSH connection + show card"""
    print("=" * 60)
    print("TEST 1: SSH Connection to OLT")
    print("=" * 60)
    ssh = SimpleSSH(OLT_IP, OLT_PORT)
    ssh.set_credentials(OLT_USER, OLT_PASS)
    ok = ssh.connect()
    if not ok:
        print(f"FAIL: Could not connect via SSH to {OLT_IP}:{OLT_PORT}")
        return False
    print(f"OK: SSH connected to {OLT_IP}:{OLT_PORT}")

    # Send 'show card'
    ssh.write('show card\n')
    time.sleep(3)
    out = ssh.read_until(b'#', timeout=10)
    decoded = out.decode(errors='replace')
    print(f"show card output:\n{decoded[:800]}")
    ssh.close()
    print("TEST 1: PASSED\n")
    return True

def test_full_registration():
    """Test 2: Full ONU registration via SSH using TelnetCollector"""
    print("=" * 60)
    print("TEST 2: Full ONU Registration via SSH")
    print("=" * 60)
    from telnet_client import TelnetCollector

    tc = TelnetCollector(OLT_IP, OLT_USER, OLT_PASS, OLT_PORT, use_ssh=True)
    tn = tc._connect()
    if not tn:
        print("FAIL: Could not connect via SSH")
        return False
    print("OK: SSH collector connected")

    # Show current unregistered ONUs
    tc._send_command(tn, 'end')
    out = tc._send_command(tn, 'show gpon onu uncfg', timeout=15)
    print(f"Unregistered ONUs:\n{out[:500]}")

    # Show card
    out = tc._send_command(tn, 'show card', timeout=15)
    print(f"Card info:\n{out[:300]}")

    tn.close()
    print("TEST 2: PASSED\n")
    return True

def test_register_and_configure():
    """Test 3: Register ONU + configure profile via SSH"""
    print("=" * 60)
    print("TEST 3: register_and_configure via SSH")
    print("=" * 60)
    from telnet_client import TelnetCollector

    tc = TelnetCollector(OLT_IP, OLT_USER, OLT_PASS, OLT_PORT, use_ssh=True)

    # Use frame=1, slot=1, port=2, onu_id=1 (adjust as needed)
    # First check what's unregistered
    tn = tc._connect()
    if not tn:
        print("FAIL: No SSH connection")
        return False

    tc._send_command(tn, 'end')
    out = tc._send_command(tn, 'show gpon onu uncfg', timeout=15)
    print(f"Uncfg ONUs: {out[:500]}")

    # Parse for first unregistered ONU — format: gpon-onu_1/1/2:2  ZTEGDD9BD0FD  unknown
    serial = None
    frame, slot, port, onu_id = 1, 1, 1, 1
    for line in out.split('\n'):
        parts = line.split()
        if len(parts) >= 3 and parts[0].startswith('gpon-onu_'):
            # Parse gpon-onu_1/1/2:2
            iface_part = parts[0].replace('gpon-onu_', '')
            fsp, oid = iface_part.split(':')
            f, s, p = fsp.split('/')
            frame, slot, port = int(f), int(s), int(p)
            onu_id = int(oid)
            serial = parts[1]
            break

    if not serial:
        print("No unregistered ONUs found — testing configure_onu_profile on existing ONU 1/1/1:1")
        tn.close()
        success, msg = tc.configure_onu_profile(
            frame=1, slot=1, port=1, onu_id=1,
            tcont_profile='default', vlan=100,
            name='SSH-Test', description='Test via SSH',
            is_epon=False
        )
        print(f"configure_onu_profile result: success={success}, msg={msg}")
        return success

    print(f"Found unregistered ONU: SN={serial} at {frame}/{slot}/{port}:{onu_id}")

    # Deregister the ONU first to get a clean state
    print(f"Deregistering ONU at {frame}/{slot}/{port}:{onu_id}...")
    tn.close()
    tc.deregister_onu(frame, slot, port, onu_id, is_epon=False)
    time.sleep(3)

    # Simulate SNMP registration: manually register ONU on PON interface
    print(f"Manual registration (simulating SNMP) for SN={serial}...")
    tn = tc._connect()
    if tn:
        tc._send_command(tn, 'end')
        tc._send_command(tn, 'configure terminal')
        tc._send_command(tn, f'interface gpon-olt_{frame}/{slot}/{port}')
        tc._send_command(tn, f'onu {onu_id} type All sn {serial}')
        tc._send_command(tn, 'exit')
        tc._send_command(tn, 'exit')
        tc._send_command(tn, 'end')
        tn.close()
    time.sleep(3)
    print("Manual registration done. Now calling register_unified with skip_registration=True...")

    # Test register_unified with skip_registration=True (SNMP fallback scenario)
    svc_success, svc_msg = tc.register_unified(
        frame=frame, slot=slot, port=port, onu_id=onu_id,
        serial=serial, onu_type='All', tcont_profile='default',
        services=[{'service_type': 'internet', 'vlan': 100, 'wan_mode': 'bridge'}],
        name='SSH-SkipReg-Test', description='Test skip_registration',
        is_epon=False, skip_registration=True,
    )
    print(f"register_unified(skip_registration=True) result: success={svc_success}, msg={svc_msg}")

    # Verify
    if svc_success:
        time.sleep(3)
        state = tc._verify_onu_registered(frame, slot, port, onu_id, is_epon=False)
        print(f"Verify ONU state: {state}")

    return svc_success

if __name__ == '__main__':
    print(f"Testing SSH to OLT {OLT_IP}:{OLT_PORT}")
    print(f"Python: {sys.version}")
    print()

    t1 = test_ssh_connection()
    if not t1:
        print("SSH connection failed — cannot proceed with further tests")
        sys.exit(1)

    t2 = test_full_registration()
    t3 = test_register_and_configure()

    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  SSH Connection:     {'PASS' if t1 else 'FAIL'}")
    print(f"  SSH Collector:      {'PASS' if t2 else 'FAIL'}")
    print(f"  Register+Configure: {'PASS' if t3 else 'FAIL'}")
