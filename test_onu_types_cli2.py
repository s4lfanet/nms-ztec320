import sys
sys.path.insert(0, '/opt/salfanet-nms')
from telnet_client import TelnetCollector

# Try common ZTE credentials
creds = [('ZTE', 'ZTE'), ('admin', 'admin'), ('root', 'root'), ('ZXAN', 'ZXAN')]
for user, pwd in creds:
    print(f"\nTrying {user}/{pwd}...")
    tc = TelnetCollector('172.16.88.2', user, pwd, 23)
    types = tc.collect_onu_types()
    if types:
        print(f"SUCCESS! Found {len(types)} types")
        gpon = [t for t in types if t.get('pon_type', '').lower() == 'gpon']
        epon = [t for t in types if t.get('pon_type', '').lower() == 'epon']
        print(f"\nGPON types ({len(gpon)}):")
        for t in gpon:
            print(f"  {t['type_name']:20s} desc={t.get('description','')}")
        print(f"\nEPON types ({len(epon)}):")
        for t in epon:
            print(f"  {t['type_name']:20s} desc={t.get('description','')}")
        break
    else:
        print(f"  Failed or no types")
