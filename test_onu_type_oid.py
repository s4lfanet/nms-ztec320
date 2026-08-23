import asyncio
from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity

TARGET = '172.16.88.2'
COMMUNITY = 'public'
PORT = 161

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

async def walk_oid(oid, max_count=15):
    results = []
    slim = Slim(1)
    cur = oid
    try:
        for _ in range(50):
            ei, es, eidx, vb = await slim.bulk(
                COMMUNITY, TARGET, PORT,
                ObjectType(ObjectIdentity(cur)),
                nonRepeaters=0, maxRepetitions=20,
                timeout=5, retries=1)
            if ei:
                break
            if es:
                break
            if not vb:
                break
            done = False
            for var_bind in vb:
                roid = str(var_bind[0])
                if not roid.startswith(oid):
                    done = True
                    break
                val = str(var_bind[1])
                if 'noSuch' in val:
                    done = True
                    break
                results.append((roid, val))
                cur = roid
                if len(results) >= max_count:
                    done = True
                    break
            if done:
                break
    except Exception as e:
        print(f"  Error: {e}")
    finally:
        await slim.close()
    return results

async def main():
    for oid in CANDIDATE_OIDS:
        print(f"\n=== Walking {oid} ===")
        results = await walk_oid(oid)
        if results:
            for oid_str, val in results[:10]:
                print(f"  {oid_str} = {val}")
        else:
            print("  (no results)")

asyncio.run(main())
