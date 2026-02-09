import http from 'k6/http';
import { check, sleep } from 'k6';

// Stress test configuration - find breaking point
export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 300 }, // Ramp up to 300 users
    { duration: '5m', target: 400 }, // Ramp up to 400 users
    { duration: '2m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% below 2s during stress
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5050';

export function setup() {
  const registerRes = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
    username: `stresstest_${Date.now()}`,
    email: `stress${Date.now()}@example.com`,
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

  // Mixed read/write operations
  http.get(`${BASE_URL}/api/dashboard`, { headers });
  sleep(1);

  http.post(`${BASE_URL}/api/transactions`, JSON.stringify({
    description: `Stress test ${Date.now()}`,
    amount: 50,
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
    category_id: 1,
  }), { headers });

  sleep(2);
}
