import sys
sys.path.insert(0, '/opt/salfanet-nms')
from snmp_core import SNMPCollector

c = SNMPCollector('172.16.88.2', 'public', 161)

# Walk OID_REG_TYPE_NAME to get actual type names per ONU
print("=== ONU Type Names (OID_REG_TYPE_NAME .28.1.1.1) ===")
results = c._run(c._bulk_walk('1.3.6.1.4.1.3902.1012.3.28.1.1.1'))
print(f"Total entries: {len(results)}")
type_names = set()
for r in results[:20]:
    print(f"  {r[0]} = {r[2]!r}")
    type_names.add(r[2])
print(f"\nDistinct type names (first 20): {type_names}")

# Also walk all to get full distinct list
all_types = set()
for r in results:
    all_types.add(r[2])
print(f"\nAll distinct type names ({len(all_types)}):")
for t in sorted(all_types):
    print(f"  {t!r}")

c.close()
