import sys
sys.path.insert(0, '/opt/salfanet-nms')
from snmp_core import SNMPCollector

c = SNMPCollector('172.16.88.2', 'public', 161)

CANDIDATE_OIDS = [
    '1.3.6.1.4.1.3902.1082.500.1.2.2.2.1.1',
    '1.3.6.1.4.1.3902.1012.3.20.1.1',
    '1.3.6.1.4.1.3902.1012.3.21.1.1',
    '1.3.6.1.4.1.3902.1012.3.22.1.1',
    '1.3.6.1.4.1.3902.1012.3.23.1.1',
    '1.3.6.1.4.1.3902.1012.3.24.1.1',
    '1.3.6.1.4.1.3902.1012.3.25.1.1',
    '1.3.6.1.4.1.3902.1012.3.27.1.1',
    '1.3.6.1.4.1.3902.1012.3.28.1.1.17',
    '1.3.6.1.4.1.3902.1012.3.28.1.1.9',
]

for oid in CANDIDATE_OIDS:
    print(f"\n=== Walking {oid} ===")
    try:
        results = c._run(c._bulk_walk(oid))
        if results:
            for r in results[:10]:
                print(f"  {r[0]} = {r[2]}")
        else:
            print("  (no results)")
    except Exception as e:
        print(f"  Error: {e}")

c.close()
