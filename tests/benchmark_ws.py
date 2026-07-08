"""WebSocket performance test — measure connection time and message latency."""
import asyncio
import json
import time
import statistics
import httpx


async def benchmark_ws():
    from websockets.asyncio.client import connect

    print("=" * 50)
    print("  WebSocket Performance Test")
    print("=" * 50)

    # Test 1: Connection time
    print("\n[1] Connection time (10 attempts):")
    conn_times = []
    for i in range(10):
        start = time.perf_counter()
        async with connect("ws://localhost:8765/ws/sync/1") as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=3)
            elapsed = (time.perf_counter() - start) * 1000
            conn_times.append(elapsed)
    print("    Avg: %.2f ms | Min: %.2f ms | Max: %.2f ms" % (
        statistics.mean(conn_times), min(conn_times), max(conn_times)
    ))

    # Test 2: Ping/Pong latency
    print("\n[2] Ping/Pong latency (20 pings):")
    ping_times = []
    async with connect("ws://localhost:8765/ws/sync/1") as ws:
        await ws.recv()  # consume connected message
        for i in range(20):
            start = time.perf_counter()
            await ws.send("ping")
            await asyncio.wait_for(ws.recv(), timeout=3)
            elapsed = (time.perf_counter() - start) * 1000
            ping_times.append(elapsed)
    print("    Avg: %.2f ms | Min: %.2f ms | Max: %.2f ms" % (
        statistics.mean(ping_times), min(ping_times), max(ping_times)
    ))

    # Test 3: Broadcast throughput (Flask -> FastAPI -> WebSocket)
    print("\n[3] Broadcast latency (10 broadcasts):")
    broadcast_times = []
    async with connect("ws://localhost:8765/ws/sync/1") as ws:
        await ws.recv()  # consume connected message
        for i in range(10):
            start = time.perf_counter()
            async with httpx.AsyncClient() as client:
                await client.post("http://localhost:8765/broadcast", json={
                    "channel": "sync:1", "event": "test", "data": {"i": i}
                })
            msg = await asyncio.wait_for(ws.recv(), timeout=3)
            elapsed = (time.perf_counter() - start) * 1000
            broadcast_times.append(elapsed)
    print("    Avg: %.2f ms | Min: %.2f ms | Max: %.2f ms" % (
        statistics.mean(broadcast_times), min(broadcast_times), max(broadcast_times)
    ))

    # Test 4: Multiple concurrent connections
    print("\n[4] Concurrent connections (10 clients):")
    start = time.perf_counter()

    async def client_task(cid):
        async with connect("ws://localhost:8765/ws/sync/1") as ws:
            await ws.recv()
            await ws.send("ping")
            await asyncio.wait_for(ws.recv(), timeout=3)

    await asyncio.gather(*[client_task(i) for i in range(10)])
    elapsed = (time.perf_counter() - start) * 1000
    print("    10 clients connected+pinged in: %.2f ms" % elapsed)
    print("    Per client: %.2f ms" % (elapsed / 10))

    print("\n" + "=" * 50)
    print("  Summary:")
    print("  Connection:  ~%.0f ms" % statistics.mean(conn_times))
    print("  Ping/Pong:   ~%.1f ms" % statistics.mean(ping_times))
    print("  Broadcast:   ~%.0f ms" % statistics.mean(broadcast_times))
    print("  Concurrent:  ~%.0f ms/10clients" % elapsed)
    print("=" * 50)


asyncio.run(benchmark_ws())
