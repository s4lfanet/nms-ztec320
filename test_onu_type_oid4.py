import sys
sys.path.insert(0, '/opt/salfanet-nms')
from snmp_core import SNMPCollector

c = SNMPCollector('172.16.88.2', 'public', 161)

# Try ONU actual type per registered ONU
OIDS = [
    '1.3.6.1.4.1.3902.1012.3.28.1.1.10',   # ONU actual type (string)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.16',   # ONU actual type (alt)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.18',   # ONU actual type (alt)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.19',   # ONU actual type (alt)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.20',   # ONU actual type (alt)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.21',   # ONU actual type (alt)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.22',   # ONU actual type (alt)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.23',   # ONU actual type (alt)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.24',   # ONU actual type (alt)
    '1.3.6.1.4.1.3902.1012.3.28.1.1.25',   # ONU actual type (alt)
]

for oid in OIDS:
    print(f"\n=== Walking {oid} ===")
    try:
        results = c._run(c._bulk_walk(oid))
        if results:
            for r in results[:5]:
                print(f"  {r[0]} = {r[2]}")
        else:
            print("  (no results)")
    except Exception as e:
        print(f"  Error: {e}")

c.close()
