# Load Testing Guide

## Overview

This directory contains load tests for the Budget Tracker application using k6. Load testing helps identify performance bottlenecks and capacity limits.

## Prerequisites

```bash
# Install k6 (Windows with Chocolatey)
choco install k6

# Or download from https://k6.io/docs/getting-started/installation/
```

## Test Types

### 1. Load Test (`load-test.js`)
Tests normal expected load with gradual ramp-up.

**Configuration:**
- Ramp up to 100 concurrent users
- Duration: ~5 minutes
- Tests all main endpoints (dashboard, transactions, budgets, analytics)
- Thresholds: 95% requests < 500ms, <1% error rate

**Run:**
```bash
k6 run load-tests/load-test.js
```

### 2. Spike Test (`spike-test.js`)
Tests sudden traffic spikes (viral content, marketing campaigns).

**Configuration:**
- Spikes from 100 to 500 users in 10 seconds
- Duration: ~2 minutes
- Tests read-heavy operations
- Thresholds: 95% requests < 1s during spike

**Run:**
```bash
k6 run load-tests/spike-test.js
```

### 3. Stress Test (`stress-test.js`)
Finds the breaking point of your application.

**Configuration:**
- Gradually increases from 100 to 400 users
- Duration: ~20 minutes
- Mixed read/write operations
- Identifies at what load performance degrades

**Run:**
```bash
k6 run load-tests/stress-test.js
```

## Running Tests

### Local Testing
```bash
# Start the backend
cd backend
npm run dev

# In another terminal, run load tests
k6 run load-tests/load-test.js
```

### Production Testing
```bash
# Test against production (use with caution!)
k6 run load-tests/load-test.js -e BASE_URL=https://your-production-url.com
```

### CI/CD Integration
```bash
# Run with threshold enforcement (fail on thresholds)
k6 run load-tests/load-test.js --out json=results.json

# Generate HTML report
k6 run load-tests/load-test.js --out web-dashboard
```

## Interpreting Results

### Key Metrics

**http_req_duration:** Time from request sent to response received
- p(50): Median response time
- p(90): 90th percentile response time
- p(95): 95th percentile response time
- p(99): 99th percentile response time

**http_req_failed:** Percentage of failed requests
- Target: < 1% for production

**http_reqs:** Total requests per second
- Indicates throughput capacity

**vus (Virtual Users):** Number of concurrent users
- Active users making requests

### Example Good Results
```
✓ dashboard status is 200
✓ transactions status is 200
✓ budgets status is 200

http_req_duration..........: avg=120ms  min=50ms   med=100ms  max=450ms  p(90)=200ms p(95)=300ms
http_req_failed............: 0.20%   (5 failures out of 2500 requests)
http_reqs..................: 2500    83.3/s
vus........................: 100     min=0      max=100
```

### Warning Signs
- **p(95) > 1000ms:** Slow response times affecting user experience
- **http_req_failed > 1%:** High error rate
- **Increasing response times:** System struggling under load
- **Memory/CPU at 100%:** Resource exhaustion

## Performance Optimization Tips

### If Load Test Fails:

1. **Database Optimization**
   - Add missing indexes
   - Optimize slow queries
   - Enable connection pooling
   - Add read replicas

2. **Caching**
   - Enable Redis caching
   - Add CDN for static assets
   - Implement API response caching
   - Use browser caching headers

3. **Backend Scaling**
   - Increase server resources (CPU, RAM)
   - Add horizontal scaling (multiple instances)
   - Use load balancer
   - Enable compression

4. **Rate Limiting**
   - Protect against abuse
   - Prevent resource exhaustion
   - Implement backoff strategies

5. **Code Optimization**
   - Reduce database queries (N+1 problem)
   - Optimize algorithms
   - Use async operations
   - Implement pagination

## Expected Capacity

Based on testing, Budget Tracker should handle:

**Single Server (2 CPU, 4GB RAM):**
- 50-100 concurrent users comfortably
- ~100-200 requests per second
- p(95) response time < 500ms

**Scaled Deployment (3+ servers, load balancer):**
- 500+ concurrent users
- ~1000+ requests per second
- p(95) response time < 300ms

## Monitoring in Production

Use these tools alongside load testing:

- **Application Performance Monitoring (APM):** Sentry, New Relic, Datadog
- **Infrastructure Monitoring:** Prometheus, Grafana, CloudWatch
- **Real User Monitoring (RUM):** Google Analytics, Mixpanel
- **Log Aggregation:** ELK Stack, Splunk, Papertrail

## Continuous Load Testing

Run load tests:
- Before each major release
- After infrastructure changes
- Monthly for baseline comparison
- When adding resource-intensive features

## Troubleshooting

### k6 Installation Issues
```bash
# Windows
choco install k6

# macOS
brew install k6

# Linux
sudo apt-get install k6
```

### Connection Errors
- Ensure backend is running
- Check BASE_URL environment variable
- Verify firewall settings
- Check CORS configuration

### High Error Rates
- Check backend logs for errors
- Verify database connectivity
- Check rate limiter configuration
- Monitor server resources

## Additional Resources

- [k6 Documentation](https://k6.io/docs/)
- [Load Testing Best Practices](https://k6.io/docs/testing-guides/load-testing-best-practices/)
- [Performance Testing Types](https://k6.io/docs/test-types/introduction/)
