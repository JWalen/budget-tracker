import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp up to 10 users
    { duration: '1m', target: 50 }, // Ramp up to 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '1m', target: 100 }, // Stay at 100 users
    { duration: '30s', target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.01'], // Error rate should be below 1%
    errors: ['rate<0.1'], // Custom error rate below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5050';

// Test data
let authToken = null;

export function setup() {
  // Register and login a test user
  const registerRes = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
    username: `testuser_${Date.now()}`,
    email: `test${Date.now()}@example.com`,
    password: 'Test123!@#',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (registerRes.status === 201) {
    const body = JSON.parse(registerRes.body);
    return { token: body.token };
  }

  console.error('Failed to register test user');
  return { token: null };
}

export default function (data) {
  const token = data.token;

  if (!token) {
    errorRate.add(1);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Test dashboard
  let res = http.get(`${BASE_URL}/api/dashboard`, { headers });
  check(res, {
    'dashboard status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // Test transactions list
  res = http.get(`${BASE_URL}/api/transactions`, { headers });
  check(res, {
    'transactions status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // Test budgets list
  res = http.get(`${BASE_URL}/api/budgets`, { headers });
  check(res, {
    'budgets status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // Test categories list
  res = http.get(`${BASE_URL}/api/categories`, { headers });
  check(res, {
    'categories status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // Create a transaction
  res = http.post(`${BASE_URL}/api/transactions`, JSON.stringify({
    description: `Load test transaction ${Date.now()}`,
    amount: Math.floor(Math.random() * 100) + 1,
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
    category_id: 1,
  }), { headers });

  check(res, {
    'create transaction status is 201': (r) => r.status === 201,
  }) || errorRate.add(1);

  sleep(2);

  // Test analytics
  res = http.get(`${BASE_URL}/api/analytics/summary`, { headers });
  check(res, {
    'analytics status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);
}

export function teardown(data) {
  // Clean up test data if needed
  console.log('Load test completed');
}
