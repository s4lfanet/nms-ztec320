import sys
sys.path.insert(0, '/opt/salfanet-nms')
from telnet_client import TelnetCollector

# Try to connect via telnet to get actual ONU types
tc = TelnetCollector('172.16.88.2', 'ZTE', 'ZTE', 23)
types = tc.collect_onu_types()
print(f"Total types: {len(types)}")
gpon = [t for t in types if t.get('pon_type', '').lower() == 'gpon']
epon = [t for t in types if t.get('pon_type', '').lower() == 'epon']
other = [t for t in types if t.get('pon_type', '').lower() not in ('gpon', 'epon')]
print(f"\nGPON types ({len(gpon)}):")
for t in gpon:
    print(f"  {t['type_name']:20s} desc={t.get('description','')}")
print(f"\nEPON types ({len(epon)}):")
for t in epon:
    print(f"  {t['type_name']:20s} desc={t.get('description','')}")
print(f"\nOther ({len(other)}):")
for t in other:
    print(f"  {t['type_name']:20s} pon_type={t.get('pon_type','')}")
