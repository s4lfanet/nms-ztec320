import sys
sys.path.insert(0, '/opt/salfanet-nms')
from snmp_core import SNMPCollector

c = SNMPCollector('172.16.88.2', 'public', 161)

# Based on Scribd doc, ONU type name is at .28.1.1.9 (string)
# But our test showed integer. Let's try more OIDs around the ONU table
OIDS = [
    '1.3.6.1.4.1.3902.1012.3.28.1.1.1',    # ONU name
    '1.3.6.1.4.1.3902.1012.3.28.1.1.2',    # ONU description
    '1.3.6.1.4.1.3902.1012.3.28.1.1.3',    # ONU status
    '1.3.6.1.4.1.3902.1012.3.28.1.1.4',    # ONU admin state
    '1.3.6.1.4.1.3902.1012.3.28.1.1.5',    # ONU serial
    '1.3.6.1.4.1.3902.1012.3.28.1.1.6',    # ONU password
    '1.3.6.1.4.1.3902.1012.3.28.1.1.7',    # ONU distance
    '1.3.6.1.4.1.3902.1012.3.28.1.1.8',    # ONU last down time
    '1.3.6.1.4.1.3902.1012.3.28.1.1.11',   # ONU software version
    '1.3.6.1.4.1.3902.1012.3.28.1.1.12',   # ONU hardware version
    '1.3.6.1.4.1.3902.1012.3.28.1.1.13',   # ONU register time
    '1.3.6.1.4.1.3902.1012.3.28.1.1.14',   # ONU last dereg reason
    '1.3.6.1.4.1.3902.1012.3.28.1.1.15',   # ONU profile?
]

for oid in OIDS:
    print(f"\n=== Walking {oid} ===")
    try:
        results = c._run(c._bulk_walk(oid))
        if results:
            for r in results[:3]:
                print(f"  {r[0]} = {r[2]}")
        else:
            print("  (no results)")
    except Exception as e:
        print(f"  Error: {e}")

c.close()
