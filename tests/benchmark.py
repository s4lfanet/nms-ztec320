"""Performance benchmark — Flask vs FastAPI hybrid server.
Run on VPS to compare response times and resource usage."""
import time
import json
import statistics
import httpx
import subprocess


def benchmark_endpoint(url, iterations=20, name=""):
    """Benchmark a single endpoint."""
    times = []
    errors = 0
    for i in range(iterations):
        try:
            start = time.perf_counter()
            r = httpx.get(url, timeout=5.0)
            elapsed = (time.perf_counter() - start) * 1000  # ms
            if r.status_code == 200:
                times.append(elapsed)
            else:
                errors += 1
        except Exception:
            errors += 1
    if not times:
        return {"name": name, "error": "all failed"}
    return {
        "name": name,
        "requests": len(times),
        "errors": errors,
        "avg_ms": round(statistics.mean(times), 2),
        "min_ms": round(min(times), 2),
        "max_ms": round(max(times), 2),
        "median_ms": round(statistics.median(times), 2),
        "p95_ms": round(sorted(times)[int(len(times) * 0.95)] if len(times) >= 2 else times[-1], 2),
    }


def get_process_info():
    """Get process memory and CPU info."""
    try:
        result = subprocess.run(
            ["ps", "aux"], capture_output=True, text=True
        )
        lines = [l for l in result.stdout.split("\n") if "run_server" in l or "app.py" in l]
        info = []
        for line in lines:
            parts = line.split()
            if len(parts) >= 6:
                info.append({
                    "pid": parts[1],
                    "cpu": parts[2] + "%",
                    "mem": parts[3] + "%",
                    "rss_kb": parts[5],
                })
        return info
    except Exception:
        return []


def main():
    print("=" * 60)
    print("  Salfanet NMS — Performance Benchmark")
    print("=" * 60)

    # Warmup
    print("\n[1/6] Warming up...")
    try:
        httpx.get("http://localhost:5000/api/public/branding", timeout=5)
        httpx.get("http://localhost:8765/health", timeout=5)
    except Exception:
        pass

    # Benchmark Flask endpoints
    print("\n[2/6] Benchmarking Flask API (port 5000)...")
    results = []
    results.append(benchmark_endpoint("http://localhost:5000/api/public/branding", 30, "Flask Branding"))
    results.append(benchmark_endpoint("http://localhost:5000/api/public/packages", 30, "Flask Packages"))
    results.append(benchmark_endpoint("http://localhost:5000/api/public/tenant-check", 30, "Flask Tenant Check"))
    results.append(benchmark_endpoint("http://localhost:5000/spa/login", 20, "Flask Login Page"))

    # Benchmark FastAPI endpoints
    print("\n[3/6] Benchmarking FastAPI (port 8765)...")
    results.append(benchmark_endpoint("http://localhost:8765/health", 30, "FastAPI Health"))
    results.append(benchmark_endpoint("http://localhost:8765/openapi.json", 20, "FastAPI OpenAPI JSON"))

    # Benchmark via nginx
    print("\n[4/6] Benchmarking via Nginx (port 8080)...")
    results.append(benchmark_endpoint("http://localhost:8080/api/public/branding", 30, "Nginx->Flask Branding"))
    results.append(benchmark_endpoint("http://localhost:8080/health", 30, "Nginx->FastAPI Health"))
    results.append(benchmark_endpoint("http://localhost:8080/docs", 20, "Nginx->Swagger UI"))
    results.append(benchmark_endpoint("http://localhost:8080/spa/login", 20, "Nginx->Login Page"))

    # Process info
    print("\n[5/6] Process info...")
    proc_info = get_process_info()

    # Results
    print("\n[6/6] Results:")
    print("\n" + "=" * 60)
    print("  %-30s %8s %8s %8s %8s %8s" % ("Endpoint", "Avg(ms)", "Min", "Max", "Median", "P95"))
    print("-" * 60)
    for r in results:
        if "error" in r:
            print("  %-30s %s" % (r["name"], r["error"]))
        else:
            print("  %-30s %8.2f %8.2f %8.2f %8.2f %8.2f" % (
                r["name"], r["avg_ms"], r["min_ms"], r["max_ms"], r["median_ms"], r["p95_ms"]
            ))
    print("-" * 60)

    # Summary
    flask_avg = statistics.mean([r["avg_ms"] for r in results[:4] if "avg_ms" in r])
    fastapi_avg = statistics.mean([r["avg_ms"] for r in results[4:6] if "avg_ms" in r])
    nginx_avg = statistics.mean([r["avg_ms"] for r in results[6:] if "avg_ms" in r])

    print("\n  Summary:")
    print("  Flask direct:     %.2f ms avg" % flask_avg)
    print("  FastAPI direct:   %.2f ms avg" % fastapi_avg)
    print("  Via Nginx:        %.2f ms avg" % nginx_avg)
    print("  Nginx overhead:   +%.2f ms" % (nginx_avg - flask_avg))

    print("\n  Process info:")
    for p in proc_info:
        print("    PID=%s CPU=%s MEM=%s RSS=%sKB" % (p["pid"], p["cpu"], p["mem"], p["rss_kb"]))
    print("=" * 60)


if __name__ == "__main__":
    main()
