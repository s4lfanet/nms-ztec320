import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// ============================================================
// Salfanet NMS — WebSocket Load Test
// ============================================================
// Usage:
//   k6 run tests/load/test_websocket.js
//   k6 run --vus 50 --duration 60s tests/load/test_websocket.js
//
// Tests:
//   1. WebSocket connection stability
//   2. Message broadcast latency
//   3. Connection scaling
// ============================================================

const WS_URL = __ENV.WS_URL || 'ws://localhost:8765/ws';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD || 'admin';

const wsConnections = new Counter('ws_connections');
const wsMessages = new Counter('ws_messages_received');
const wsLatency = new Trend('ws_message_latency', true);
const wsErrors = new Counter('ws_errors');

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '20s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    ws_errors: ['count<10'],
  },
};

export default function () {
  // Login first to get session cookie
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const cookieStr = loginRes.cookies
    ? Object.entries(loginRes.cookies).map(([k, v]) => `${k}=${v[0].value}`).join('; ')
    : '';

  const url = `${WS_URL}?cookie=${encodeURIComponent(cookieStr)}`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      wsConnections.add(1);

      // Send ping
      socket.send(JSON.stringify({ type: 'ping' }));

      socket.on('message', (data) => {
        wsMessages.add(1);
        try {
          const msg = JSON.parse(data);
          if (msg.timestamp) {
            const latency = Date.now() - new Date(msg.timestamp).getTime();
            wsLatency.add(latency);
          }
        } catch (e) {
          // Non-JSON message
        }
      });

      socket.on('error', (e) => {
        wsErrors.add(1);
      });

      socket.on('close', () => {
        // Connection closed
      });

      // Keep connection alive for test duration
      sleep(5);

      socket.close();
    });
  });

  check(res, {
    'ws connected': (r) => r && r.status === 101,
  });

  sleep(1);
}
