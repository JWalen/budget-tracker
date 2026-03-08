# Nginx Proxy Manager Configuration

## Overview
The Budget Tracker app runs on HTTP internally at `http://10.10.10.115:3456` and is accessed externally via `https://budget.walen.com` through your Nginx Proxy Manager.

## Nginx Proxy Manager Setup

### 1. Add Proxy Host

In your Nginx Proxy Manager interface:

1. **Go to:** Proxy Hosts → Add Proxy Host

2. **Details Tab:**
   - **Domain Names:** `budget.walen.com`
   - **Scheme:** `http`
   - **Forward Hostname/IP:** `10.10.10.115`
   - **Forward Port:** `3456`
   - **Cache Assets:** ✅ (recommended)
   - **Block Common Exploits:** ✅ (recommended)
   - **Websockets Support:** ✅ (required for real-time features)

3. **SSL Tab:**
   - **SSL Certificate:** Select your existing certificate for `*.walen.com` or `budget.walen.com`
   - **Force SSL:** ✅ (redirect HTTP to HTTPS)
   - **HTTP/2 Support:** ✅ (recommended)
   - **HSTS Enabled:** ✅ (recommended)

4. **Advanced Tab (Optional but Recommended):**
   ```nginx
   # Proxy headers for proper backend communication
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
   proxy_set_header Host $host;
   
   # Increase timeouts for long-running operations (imports, exports)
   proxy_connect_timeout 300s;
   proxy_send_timeout 300s;
   proxy_read_timeout 300s;
   
   # Increase buffer sizes for large uploads (receipts, CSV imports)
   client_max_body_size 50M;
   proxy_buffering off;
   ```

5. **Save** the configuration

### 2. Verify Configuration

After saving, test the setup:

1. **External Access:**
   ```bash
   curl -I https://budget.walen.com
   # Should return: HTTP/2 200
   ```

2. **API Endpoint:**
   ```bash
   curl https://budget.walen.com/api/health
   # Should return JSON with status "ok"
   ```

3. **HTTP Redirect:**
   ```bash
   curl -I http://budget.walen.com
   # Should return: 301 or 302 redirect to HTTPS
   ```

### 3. Firewall Configuration

Ensure your firewall allows:
- Port 80 (HTTP) - For redirect to HTTPS
- Port 443 (HTTPS) - For secure access
- Port 3456 is **NOT** exposed to the internet (only accessible from Nginx Proxy Manager)

## Troubleshooting

### 502 Bad Gateway
- Check if the Budget Tracker container is running: `docker ps | grep budget`
- Verify the backend is healthy: `curl http://10.10.10.115:3456/api/health`
- Check backend logs: `docker logs budget-api-prod`

### CORS Errors
The backend is configured to accept requests from `https://budget.walen.com`. If you see CORS errors:
- Verify the `FRONTEND_URL` in `.env` matches exactly: `https://budget.walen.com`
- Restart the backend: `docker compose -f docker-compose.prod.yml restart backend`

### SSL Certificate Issues
- Verify your certificate covers `budget.walen.com`
- Check certificate expiration in Nginx Proxy Manager
- Ensure HSTS is enabled for maximum security

### Upload/Import Failures
If large file uploads fail, increase `client_max_body_size` in the Advanced tab:
```nginx
client_max_body_size 100M;
```

## Security Recommendations

1. **Rate Limiting:** Enable rate limiting in Nginx Proxy Manager to prevent abuse
2. **Access Lists:** Consider creating an access list to restrict access to specific IP ranges
3. **Custom 404 Page:** Configure a custom 404 page to avoid information disclosure
4. **Monitor Logs:** Regularly check access logs for suspicious activity

## Direct Access (Internal Network Only)

For internal network access without SSL:
- HTTP: `http://10.10.10.115:3456`
- Use this for troubleshooting or local development

**Note:** The database (PostgreSQL) is **NOT** exposed and is only accessible within the Docker network for security.
