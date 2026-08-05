#!/usr/bin/env python3
"""Benchmark: Compare SNMP collection performance before/after optimization.

Tests:
1. Walk-based collection (existing _collect_onus_light_async) vs Batch GET
2. Sequential SNMP GET vs Batch GET for ONU detail
3. Cache miss vs cache hit vs background refresh
4. Singleflight deduplication under concurrent load

Usage:
    py -3 benchmark_snmp.py --olt-ip <IP> --community <community> --port <port>

Results are printed as a comparison table.
"""
import argparse
import time
import threading
import json
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def benchmark_walk_collection(collector, runs=3):
    """Benchmark existing walk-based ONU collection (collect_onus_light)."""
    times = []
    onu_counts = []
    for i in range(runs):
        start = time.time()
        onus = collector.collect_onus_light()
        elapsed = time.time() - start
        times.append(elapsed)
        onu_counts.append(len(onus))
        print(f"  Walk run {i+1}: {elapsed:.2f}s, {len(onus)} ONUs")
    return {
        'method': 'Walk (7 concurrent BulkWalks)',
        'runs': runs,
        'times': times,
        'avg_time': sum(times) / len(times),
        'min_time': min(times),
        'max_time': max(times),
        'onu_count': onu_counts[0] if onu_counts else 0,
    }


def benchmark_batch_get_detail(collector, pon_index, onu_slot, runs=5):
    """Benchmark batch GET for single ONU detail (7 OIDs in 1 request)."""
    times = []
    for i in range(runs):
        start = time.time()
        detail = collector.collect_onu_detail_batch(pon_index, onu_slot)
        elapsed = time.time() - start
        times.append(elapsed)
        print(f"  Batch GET run {i+1}: {elapsed:.3f}s, serial={detail.get('serial_number', 'N/A')}")
    return {
        'method': 'Batch GET (7 OIDs in 1 request)',
        'runs': runs,
        'times': times,
        'avg_time': sum(times) / len(times),
        'min_time': min(times),
        'max_time': max(times),
    }


def benchmark_sequential_get(collector, pon_index, onu_slot, runs=5):
    """Benchmark sequential SNMP GET for comparison (7 separate get calls)."""
    from snmp_core import (
        OID_ONU_NAME, OID_ONU_SERIAL, OID_ONU_DESCRIPTION,
        OID_OPER_STATE, OID_RX_POWER, OID_TX_POWER, OID_OLT_RX,
        parse_serial, decode_oper_state, decode_rx_power,
    )
    cfg_suffix = f'.{pon_index}.{onu_slot}'
    reg_suffix = f'.{pon_index}.{onu_slot}.1'
    oids = [
        f'{OID_ONU_NAME}{cfg_suffix}',
        f'{OID_ONU_SERIAL}{cfg_suffix}',
        f'{OID_ONU_DESCRIPTION}{cfg_suffix}',
        f'{OID_OPER_STATE}{reg_suffix}',
        f'{OID_RX_POWER}{reg_suffix}',
        f'{OID_TX_POWER}{reg_suffix}',
        f'{OID_OLT_RX}{reg_suffix}',
    ]

    times = []
    for i in range(runs):
        start = time.time()
        for oid in oids:
            collector.batch_get([oid])  # 1 OID per request = sequential
        elapsed = time.time() - start
        times.append(elapsed)
        print(f"  Sequential run {i+1}: {elapsed:.3f}s")
    return {
        'method': 'Sequential GET (7 separate requests)',
        'runs': runs,
        'times': times,
        'avg_time': sum(times) / len(times),
        'min_time': min(times),
        'max_time': max(times),
    }


def benchmark_cache_singleflight(key, fetch_fn, ttl, concurrent=10):
    """Benchmark singleflight under concurrent load."""
    from cache import cache_get_or_refresh, cache_delete

    # Clear cache first
    cache_delete(key)

    # Launch N concurrent requests
    results = [None] * concurrent
    barrier = threading.Barrier(concurrent)

    def worker(idx):
        barrier.wait()  # All threads start simultaneously
        start = time.time()
        data = cache_get_or_refresh(key, fetch_fn, ttl=ttl)
        elapsed = time.time() - start
        results[idx] = elapsed

    threads = []
    for i in range(concurrent):
        t = threading.Thread(target=worker, args=(i,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join(timeout=60)

    fetch_count = 0
    # Check how many actually fetched vs served from cache
    # With singleflight, only 1 should fetch, rest wait

    return {
        'method': f'Singleflight ({concurrent} concurrent requests)',
        'concurrent': concurrent,
        'times': results,
        'avg_time': sum(results) / len(results) if results else 0,
        'max_time': max(results) if results else 0,
        'min_time': min(results) if results else 0,
    }


def benchmark_cache_hit_vs_miss(key, fetch_fn, ttl):
    """Benchmark cache miss vs cache hit vs background refresh."""
    from cache import cache_get_or_refresh, cache_delete, cache_set, cache_get

    # 1. Cache miss
    cache_delete(key)
    start = time.time()
    data = cache_get_or_refresh(key, fetch_fn, ttl=ttl)
    miss_time = time.time() - start

    # 2. Cache hit
    start = time.time()
    data = cache_get_or_refresh(key, fetch_fn, ttl=ttl)
    hit_time = time.time() - start

    # 3. Near-expiry (simulate by setting short TTL)
    cache_set(key, data, ttl=2)
    time.sleep(1.5)  # Wait until TTL < 20% of original
    start = time.time()
    data = cache_get_or_refresh(key, fetch_fn, ttl=ttl)
    near_expiry_time = time.time() - start

    return {
        'cache_miss': miss_time,
        'cache_hit': hit_time,
        'near_expiry_with_bg_refresh': near_expiry_time,
    }


def print_comparison(results):
    """Print comparison table."""
    print("\n" + "=" * 80)
    print("BENCHMARK RESULTS — SNMP Optimization Comparison")
    print("=" * 80)

    # Walk vs Batch GET
    if 'walk' in results and 'batch_detail' in results:
        w = results['walk']
        b = results['batch_detail']
        print(f"\n--- ONU Collection: Walk vs Batch GET ---")
        print(f"  Walk (7 BulkWalks):     avg={w['avg_time']:.2f}s  min={w['min_time']:.2f}s  max={w['max_time']:.2f}s  ({w['onu_count']} ONUs)")
        print(f"  Batch GET (per ONU):    avg={b['avg_time']:.3f}s  min={b['min_time']:.3f}s  max={b['max_time']:.3f}s")
        if b['avg_time'] > 0:
            print(f"  Speedup (per ONU):      {w['avg_time'] / b['avg_time']:.1f}x")

    # Sequential vs Batch
    if 'sequential' in results and 'batch_detail' in results:
        s = results['sequential']
        b = results['batch_detail']
        print(f"\n--- ONU Detail: Sequential vs Batch GET ---")
        print(f"  Sequential (7 GETs):    avg={s['avg_time']:.3f}s  min={s['min_time']:.3f}s  max={s['max_time']:.3f}s")
        print(f"  Batch GET (1 request):  avg={b['avg_time']:.3f}s  min={b['min_time']:.3f}s  max={b['max_time']:.3f}s")
        if b['avg_time'] > 0:
            print(f"  Speedup:                {s['avg_time'] / b['avg_time']:.1f}x")

    # Cache benchmarks
    if 'cache' in results:
        c = results['cache']
        print(f"\n--- Cache: Miss vs Hit vs Background Refresh ---")
        print(f"  Cache miss (cold):            {c['cache_miss']:.3f}s")
        print(f"  Cache hit (warm):             {c['cache_hit']:.3f}s")
        print(f"  Near-expiry + bg refresh:     {c['near_expiry_with_bg_refresh']:.3f}s")
        if c['cache_hit'] > 0:
            print(f"  Hit/miss speedup:             {c['cache_miss'] / c['cache_hit']:.1f}x")

    # Singleflight
    if 'singleflight' in results:
        sf = results['singleflight']
        print(f"\n--- Singleflight: {sf['concurrent']} Concurrent Requests ---")
        print(f"  Avg response time:  {sf['avg_time']:.3f}s")
        print(f"  Max response time:  {sf['max_time']:.3f}s")
        print(f"  Min response time:  {sf['min_time']:.3f}s")
        print(f"  Only 1 SNMP fetch should have occurred (others waited on lock)")

    # Trap listener
    if 'trap' in results:
        t = results['trap']
        print(f"\n--- SNMP Trap Listener ---")
        print(f"  Status: {t.get('running', 'N/A')}")
        print(f"  Port: {t.get('port', 'N/A')}")
        print(f"  Traps received: {t.get('traps_received', 0)}")
        print(f"  Traps processed: {t.get('traps_processed', 0)}")
        print(f"  Pending events: {t.get('pending_events', 0)}")

    print("\n" + "=" * 80)


def main():
    parser = argparse.ArgumentParser(description='Benchmark SNMP optimization')
    parser.add_argument('--olt-ip', required=True, help='OLT IP address')
    parser.add_argument('--community', default='public', help='SNMP community')
    parser.add_argument('--port', type=int, default=161, help='SNMP port')
    parser.add_argument('--runs', type=int, default=3, help='Benchmark runs')
    args = parser.parse_args()

    from snmp_core import SNMPCollector, parse_pon_index, BOARD1_BASE

    collector = SNMPCollector(
        ip=args.olt_ip,
        community=args.community,
        port=args.port,
    )

    results = {}

    # Test 1: Walk-based collection
    print(f"\n[1/5] Benchmarking walk-based ONU collection...")
    results['walk'] = benchmark_walk_collection(collector, runs=args.runs)

    # Find a valid ONU to test batch GET
    onus = collector.collect_onus_light()
    if not onus:
        print("No ONUs found — skipping per-ONU benchmarks")
        print_comparison(results)
        return

    # Use first ONU for detail benchmarks
    first_onu = onus[0]
    pon_index = BOARD1_BASE + first_onu['port'] * 256
    onu_slot = first_onu['onu_id']

    # Reconstruct pon_index from frame/port
    from snmp_core import BOARD1_BASE, BOARD2_BASE, PON_INCREMENT
    if first_onu['frame'] == 1:
        pon_index = BOARD1_BASE + first_onu['port'] * PON_INCREMENT
    elif first_onu['frame'] == 2:
        pon_index = BOARD2_BASE + first_onu['port'] * PON_INCREMENT
    else:
        pon_index = BOARD1_BASE + first_onu['port'] * PON_INCREMENT

    onu_slot = first_onu['onu_id']
    print(f"  Using ONU: frame={first_onu['frame']} port={first_onu['port']} onu_id={onu_slot} pon_index={pon_index}")

    # Test 2: Sequential GET (baseline)
    print(f"\n[2/5] Benchmarking sequential SNMP GET (7 separate requests)...")
    results['sequential'] = benchmark_sequential_get(collector, pon_index, onu_slot, runs=5)

    # Test 3: Batch GET (optimized)
    print(f"\n[3/5] Benchmarking batch SNMP GET (7 OIDs in 1 request)...")
    results['batch_detail'] = benchmark_batch_get_detail(collector, pon_index, onu_slot, runs=5)

    # Test 4: Cache miss vs hit vs background refresh
    print(f"\n[4/5] Benchmarking cache (miss/hit/background refresh)...")

    def mock_fetch():
        time.sleep(0.5)  # Simulate SNMP fetch latency
        return {'onus': [o['serial_number'] for o in onus[:10]], 'ts': time.time()}

    results['cache'] = benchmark_cache_hit_vs_miss(
        f"benchmark:olt:{args.olt_ip}:onus",
        mock_fetch,
        ttl=30,
    )

    # Test 5: Singleflight under concurrent load
    print(f"\n[5/5] Benchmarking singleflight (10 concurrent requests)...")
    fetch_count = [0]
    fetch_lock = threading.Lock()

    def counting_fetch():
        with fetch_lock:
            fetch_count[0] += 1
        time.sleep(0.5)  # Simulate SNMP fetch
        return {'data': 'test', 'count': fetch_count[0]}

    results['singleflight'] = benchmark_cache_singleflight(
        f"benchmark:singleflight:{args.olt_ip}",
        counting_fetch,
        ttl=30,
        concurrent=10,
    )
    print(f"  Actual fetch calls: {fetch_count[0]} (should be 1 with singleflight)")

    # Print comparison
    print_comparison(results)

    # Save results to JSON
    output_file = f"benchmark_results_{int(time.time())}.json"
    serializable = {}
    for k, v in results.items():
        if isinstance(v, dict):
            serializable[k] = {
                key: val for key, val in v.items()
                if not isinstance(val, list) or all(isinstance(x, (int, float)) for x in val)
            }
    with open(output_file, 'w') as f:
        json.dump(serializable, f, indent=2, default=str)
    print(f"\nResults saved to {output_file}")


if __name__ == '__main__':
    main()
