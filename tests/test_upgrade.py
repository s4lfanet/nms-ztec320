"""Upgrade verification tests — run on VPS."""
import asyncio
import json
import sys

sys.path.insert(0, "/opt/fibernms")


async def test_ws():
    try:
        from websockets.asyncio.client import connect
        async with connect("ws://localhost:8765/ws/sync/1") as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=3)
            data = json.loads(msg)
            print("[WS] Connected! Event=%s" % data["event"])
            await ws.send("ping")
            pong = await asyncio.wait_for(ws.recv(), timeout=3)
            pdata = json.loads(pong)
            print("[WS] Ping/Pong OK: %s" % pdata["event"])
            return True
    except Exception as e:
        print("[WS] ERROR: %s" % e)
        return False


async def test_broadcast():
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "http://localhost:8765/broadcast",
                json={"channel": "dashboard", "event": "test", "data": {"msg": "hello"}},
            )
            print("[Broadcast] Status=%d Response=%s" % (r.status_code, r.json()))
            return r.status_code == 200
    except Exception as e:
        print("[Broadcast] ERROR: %s" % e)
        return False


async def test_cache():
    try:
        from cache import cache_set, cache_get, cache_stats
        cache_set("test:key", {"hello": "world"}, ttl=60)
        val = cache_get("test:key")
        stats = cache_stats()
        print("[Cache] Set/Get OK: %s" % val)
        print("[Cache] Stats: %s" % stats)
        return val is not None
    except Exception as e:
        print("[Cache] ERROR: %s" % e)
        return False


async def test_config():
    try:
        from config import ActiveConfig
        uri = ActiveConfig.SQLALCHEMY_DATABASE_URI
        print("[Config] DB URI: %s..." % uri[:50])
        print("[Config] Host: %s:%d" % (ActiveConfig.HOST, ActiveConfig.PORT))
        print("[Config] WS Port: %d" % ActiveConfig.WS_PORT)
        print("[Config] Debug: %s" % ActiveConfig.DEBUG)
        return True
    except Exception as e:
        print("[Config] ERROR: %s" % e)
        return False


async def test_flask_api():
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            r = await client.get("http://localhost:5000/api/public/branding")
            data = r.json()
            print("[Flask] Branding: %s" % data.get("nms_name"))
            return r.status_code == 200
    except Exception as e:
        print("[Flask] ERROR: %s" % e)
        return False


async def test_fastapi_health():
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            r = await client.get("http://localhost:8765/health")
            data = r.json()
            print("[FastAPI] Status: %s, Uptime: %ss" % (data["status"], data["uptime_seconds"]))
            return data["status"] == "ok"
    except Exception as e:
        print("[FastAPI] ERROR: %s" % e)
        return False


async def test_swagger():
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            r = await client.get("http://localhost:8765/openapi.json")
            data = r.json()
            paths = list(data.get("paths", {}).keys())
            print("[Swagger] OpenAPI version: %s" % data.get("openapi"))
            print("[Swagger] Endpoints: %s" % paths)
            return len(paths) > 0
    except Exception as e:
        print("[Swagger] ERROR: %s" % e)
        return False


async def main():
    print("=" * 55)
    print("  Salfanet NMS — Upgrade Verification Tests")
    print("=" * 55)

    tests = [
        ("config", test_config),
        ("cache", test_cache),
        ("flask_api", test_flask_api),
        ("fastapi_health", test_fastapi_health),
        ("swagger_docs", test_swagger),
        ("websocket", test_ws),
        ("broadcast", test_broadcast),
    ]

    results = {}
    for name, fn in tests:
        print("\n--- Testing: %s ---" % name)
        results[name] = await fn()

    print("\n" + "=" * 55)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print("  Results: %d/%d PASSED" % (passed, total))
    print("-" * 55)
    for k, v in results.items():
        status = "PASS" if v else "FAIL"
        print("  [%s] %s" % (status, k))
    print("=" * 55)


asyncio.run(main())
