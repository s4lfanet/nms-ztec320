import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================================
// Salfanet NMS — k6 Load Test Suite
// ============================================================
// Usage:
//   k6 run tests/load/test_api.js
//   k6 run --vus 20 --duration 30s tests/load/test_api.js
//   k6 run --env BASE_URL=http://192.168.54.131 tests/load/test_api.js
//
// Scenarios:
//   1. Auth flow (login + dashboard)
//   2. ONU list pagination
//   3. OLT sync trigger
//   4. Metrics endpoint
// ============================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD || 'admin';

// Custom metrics
const loginDuration = new Trend('login_duration', true);
const dashboardDuration = new Trend('dashboard_duration', true);
const onuListDuration = new Trend('onu_list_duration', true);
const syncDuration = new Trend('sync_duration', true);
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '10s', target: 5 },   // ramp up to 5 VUs
    { duration: '20s', target: 10 },  // ramp up to 10 VUs
    { duration: '30s', target: 20 },  // ramp up to 20 VUs
    { duration: '10s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests < 2s
    errors: ['rate<0.05'],               // error rate < 5%
  },
};

// Session cookie storage
let sessionCookies = {};

export function setup() {
  // Login once and share session across VUs
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, {
    'login success': (r) => r.status === 200 && r.json('success') === true,
  });

  if (loginRes.cookies) {
    sessionCookies = loginRes.cookies;
  }

  return { cookies: sessionCookies };
}

export default function (data) {
  const cookieStr = data.cookies
    ? Object.entries(data.cookies).map(([k, v]) => `${k}=${v[0].value}`).join('; ')
    : '';

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStr,
    },
  };

  group('Dashboard', function () {
    const res = http.get(`${BASE_URL}/api/dashboard`, params);
    dashboardDuration.add(res.timings.duration);
    check(res, {
      'dashboard status 200': (r) => r.status === 200,
      'dashboard has stats': (r) => r.json('stats') !== null,
    });
    errorRate.add(res.status !== 200);
  });

  sleep(1);

  group('ONU List', function () {
    const res = http.get(`${BASE_URL}/api/onus?page=1&per_page=20`, params);
    onuListDuration.add(res.timings.duration);
    check(res, {
      'onus status 200': (r) => r.status === 200,
    });
    errorRate.add(res.status !== 200);
  });

  sleep(1);

  group('Metrics Endpoint', function () {
    const res = http.get(`${BASE_URL}/metrics`);
    check(res, {
      'metrics status 200': (r) => r.status === 200,
      'metrics has content': (r) => r.body.length > 100,
    });
  });

  sleep(2);
}

export function handleSummary(data) {
  return {
    'tests/load/results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, opts = {}) {
  const lines = [];
  lines.push('\n=== Salfanet NMS Load Test Results ===\n');
  lines.push(`Duration: ${(data.metrics.iteration_duration.values.avg / 1000).toFixed(2)}s avg`);
  lines.push(`Requests: ${data.metrics.http_reqs.values.count} total`);
  lines.push(`RPS: ${data.metrics.http_reqs.values.rate.toFixed(2)}`);
  lines.push(`Errors: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%`);
  lines.push(`p95 Latency: ${(data.metrics.http_req_duration.values['p(95)'] / 1000).toFixed(2)}s`);
  return lines.join('\n');
}
