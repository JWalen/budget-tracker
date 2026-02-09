import http from 'k6/http';
import { check, sleep } from 'k6';

// Spike test configuration
export const options = {
  stages: [
    { duration: '10s', target: 100 }, // Fast ramp up to 100 users
    { duration: '30s', target: 100 }, // Stay at 100 users
    { duration: '10s', target: 500 }, // Spike to 500 users
    { duration: '30s', target: 500 }, // Stay at 500 users
    { duration: '10s', target: 100 }, // Back to 100 users
    { duration: '10s', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% below 1s during spike
    http_req_failed: ['rate<0.05'], // 5% error rate acceptable during spike
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5050';

export function setup() {
  const registerRes = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
    username: `spiketest_${Date.now()}`,
    email: `spike${Date.now()}@example.com`,
    password: 'Test123!@#',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (registerRes.status === 201) {
    const body = JSON.parse(registerRes.body);
    return { token: body.token };
  }

  return { token: null };
}

export default function (data) {
  const token = data.token;

  if (!token) {
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Quick read operations during spike
  http.get(`${BASE_URL}/api/dashboard`, { headers });
  sleep(0.5);
  http.get(`${BASE_URL}/api/transactions`, { headers });
  sleep(0.5);
}
