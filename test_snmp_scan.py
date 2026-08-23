#!/usr/bin/env python3
"""Test SNMP scan for unconfigured ONUs."""
import sys
sys.path.insert(0, '/opt/salfanet-nms')
from snmp_core import SNMPCollector, OID_UNCFG_SERIAL, OID_UNCFG_VENDOR

c = SNMPCollector('172.16.88.2', 'public', 161)

with open('/opt/salfanet-nms/snmp_test_output.txt', 'w') as f:
    # Test 1: Walk unconfigured serial OID
    f.write(f"=== Walking OID_UNCFG_SERIAL: {OID_UNCFG_SERIAL} ===\n")
    raw = c._run(c._bulk_walk(OID_UNCFG_SERIAL))
    f.write(f"Raw results: {len(raw)} entries\n")
    for oid_str, val, val_str in raw:
        f.write(f"  OID: {oid_str}  val: {val}  val_str: {val_str}\n")

    # Test 2: Walk unconfigured vendor OID
    f.write(f"\n=== Walking OID_UNCFG_VENDOR: {OID_UNCFG_VENDOR} ===\n")
    raw2 = c._run(c._bulk_walk(OID_UNCFG_VENDOR))
    f.write(f"Raw results: {len(raw2)} entries\n")
    for oid_str, val, val_str in raw2:
        f.write(f"  OID: {oid_str}  val: {val}  val_str: {val_str}\n")

    # Test 3: Try the full scan method
    f.write(f"\n=== scan_unconfigured_snmp() ===\n")
    results = c.scan_unconfigured_snmp()
    f.write(f"Results: {results}\n")

    # Test 4: Try walking broader OIDs
    for test_oid in [
        '1.3.6.1.4.1.3902.1012.3.2',
        '1.3.6.1.4.1.3902.1012.3.2.1',
        '1.3.6.1.4.1.3902.1012.3.28.1',
        '1.3.6.1.4.1.3902.1012.3',
    ]:
        f.write(f"\n=== Walking {test_oid} ===\n")
        raw3 = c._run(c._bulk_walk(test_oid))
        f.write(f"  Results: {len(raw3)} entries\n")
        for oid_str, val, val_str in raw3[:5]:
            f.write(f"    OID: {oid_str}  val: {val_str[:60]}\n")
        if len(raw3) > 5:
            f.write(f"    ... and {len(raw3)-5} more\n")

c.close()
f.write("\nDone.\n")
print("Test complete. Output written to snmp_test_output.txt")
