# Production Deployment Guide

## Prerequisites

- Docker and Docker Compose installed
- Domain name with DNS configured
- SSL certificate (Let's Encrypt recommended)
- Secure environment for secrets (AWS Secrets Manager, Azure Key Vault, etc.)

## 1. Generate Production Secrets

Generate strong secrets for production (NEVER reuse development secrets):

```bash
# Generate JWT secrets (64 characters hex)
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 32  # JWT_REFRESH_SECRET

# Generate encryption keys (32 characters hex)
openssl rand -hex 32  # ENCRYPTION_KEY
openssl rand -hex 32  # BACKUP_ENCRYPTION_KEY (optional)
openssl rand -hex 32  # MFA_ENCRYPTION_KEY (optional)
```

## 2. Create Production Environment File

Create `.env.production` on your server (NEVER commit this file):

```bash
# Database
DATABASE_URL=postgresql://budget_user:STRONG_PASSWORD@postgres:5432/budget_db
DB_USER=budget_user
DB_PASSWORD=STRONG_PASSWORD_HERE
DB_NAME=budget_db

# Security - Use generated secrets from step 1
JWT_SECRET=your_64_char_hex_jwt_secret_here
JWT_REFRESH_SECRET=your_64_char_hex_refresh_secret_here
ENCRYPTION_KEY=your_32_char_hex_encryption_key_here
BACKUP_ENCRYPTION_KEY=your_32_char_hex_backup_key_here
MFA_ENCRYPTION_KEY=your_32_char_hex_mfa_key_here

# Application
NODE_ENV=production
HTTPS_ONLY=true
FRONTEND_URL=https://budget.yourdomain.com

# Email (configure one provider)
EMAIL_PROVIDER=sendgrid  # or gmail, smtp, resend, none
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Budget Tracker
SENDGRID_API_KEY=your_sendgrid_api_key

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true

# Ollama (optional AI features)
OLLAMA_MODEL=mistral
AI_ENABLED=true
```

## 3. Set Up SSL Certificates

### Option A: Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt install certbot

# Get certificate (replace with your domain)
sudo certbot certonly --standalone -d budget.yourdomain.com

# Certificates will be at:
# /etc/letsencrypt/live/budget.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/budget.yourdomain.com/privkey.pem
```

### Option B: Use Traefik as Reverse Proxy

Add to `docker-compose.prod.yml`:

```yaml
traefik:
  image: traefik:v2.10
  command:
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
    - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    - "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - ./letsencrypt:/letsencrypt
  networks:
    - internal
```

Then add labels to frontend service:

```yaml
frontend:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.budget.rule=Host(`budget.yourdomain.com`)"
    - "traefik.http.routers.budget.entrypoints=websecure"
    - "traefik.http.routers.budget.tls.certresolver=letsencrypt"
```

## 4. Database Initialization

If deploying fresh (not migrating existing data):

```bash
# The database will auto-initialize using database/init.sql on first run
docker-compose -f docker-compose.prod.yml up -d postgres

# Wait for database to be ready
docker-compose -f docker-compose.prod.yml logs -f postgres
```

If migrating from development:

```bash
# Export from development
docker exec budget-db pg_dump -U budget_user budget_db > backup.sql

# Import to production (after starting production database)
cat backup.sql | docker exec -i budget-db-prod psql -U budget_user budget_db
```

## 5. Deploy Application

```bash
# Pull latest code
git pull origin main

# Copy your production environment file
cp .env.production .env

# Build and start services
docker-compose -f docker-compose.prod.yml up -d --build

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Verify health
curl https://budget.yourdomain.com/api/health
```

Expected health check response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-16T...",
  "database": "connected",
  "databaseResponseTime": "5ms",
  "ollama": "connected"
}
```

## 6. Security Verification Checklist

After deployment, verify:

```bash
# 1. Database port NOT exposed
nmap -p 5432,5433 your-server-ip
# Should show: closed or filtered

# 2. HTTPS is enforced
curl -I http://budget.yourdomain.com
# Should redirect to HTTPS (301/302)

# 3. Security headers present
curl -I https://budget.yourdomain.com
# Check for: Strict-Transport-Security, X-Frame-Options, etc.

# 4. Environment validation working
docker-compose -f docker-compose.prod.yml logs backend | grep "Environment validation"
# Should show: "✅ Environment validation passed"

# 5. No console.log in production logs
docker-compose -f docker-compose.prod.yml logs backend | grep "console\."
# Should return empty

# 6. Database connections working
docker-compose -f docker-compose.prod.yml exec backend node -e "
  require('./dist/config/database').query('SELECT 1').then(() => console.log('OK'))
"
```

## 7. Set Up Automated Backups

### Option A: Database Backups via Cron

```bash
# Create backup script
cat > /opt/budget-backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/budget"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
docker exec budget-db-prod pg_dump -U budget_user budget_db | \
  gzip > $BACKUP_DIR/budget_$TIMESTAMP.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "budget_*.sql.gz" -mtime +30 -delete

echo "Backup completed: budget_$TIMESTAMP.sql.gz"
EOF

chmod +x /opt/budget-backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l ; echo "0 2 * * * /opt/budget-backup.sh >> /var/log/budget-backup.log 2>&1") | crontab -
```

### Option B: Use Application Built-in Backup

Configure backup schedule via admin UI at `/admin/backups`.

## 8. Monitoring (Optional but Recommended)

### Add Health Check Monitoring

Use a service like UptimeRobot, Pingdom, or set up your own:

```bash
# Simple health check script
cat > /opt/budget-healthcheck.sh << 'EOF'
#!/bin/bash
HEALTH_URL="https://budget.yourdomain.com/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ "$RESPONSE" != "200" ]; then
  echo "Health check failed! Status: $RESPONSE"
  # Send alert (email, Slack, etc.)
  # Example: curl -X POST -H 'Content-type: application/json' \
  #   --data '{"text":"Budget app health check failed"}' \
  #   YOUR_SLACK_WEBHOOK_URL
fi
EOF

chmod +x /opt/budget-healthcheck.sh

# Run every 5 minutes
(crontab -l ; echo "*/5 * * * * /opt/budget-healthcheck.sh") | crontab -
```

### Log Monitoring

```bash
# View live logs
docker-compose -f docker-compose.prod.yml logs -f

# Check for errors
docker-compose -f docker-compose.prod.yml logs backend | grep -i error

# Monitor resource usage
docker stats budget-api-prod budget-db-prod
```

## 9. Post-Deployment Tasks

1. **Create admin user:**
   ```bash
   # Register via web UI, then set as admin
   docker-compose -f docker-compose.prod.yml exec -T postgres \
     psql -U budget_user budget_db -c \
     "UPDATE users SET is_admin = true WHERE email = 'admin@yourdomain.com';"
   ```

2. **Test email delivery:**
   - Go to Admin → Email Settings
   - Send test email

3. **Set up log rotation:**
   ```bash
   cat > /etc/logrotate.d/budget << 'EOF'
   /var/log/budget-backup.log {
       weekly
       rotate 4
       compress
       missingok
       notifempty
   }
   EOF
   ```

4. **Configure firewall:**
   ```bash
   # Ubuntu/Debian with ufw
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

## 10. Updating the Application

```bash
# 1. Pull latest changes
git pull origin main

# 2. Rebuild and restart (zero-downtime with health checks)
docker-compose -f docker-compose.prod.yml up -d --build --no-deps backend
docker-compose -f docker-compose.prod.yml up -d --build --no-deps frontend

# 3. Verify deployment
curl https://budget.yourdomain.com/api/health

# 4. Check logs for errors
docker-compose -f docker-compose.prod.yml logs --tail=50 backend
```

## 11. Rollback Procedure

If deployment fails:

```bash
# 1. Stop new containers
docker-compose -f docker-compose.prod.yml down

# 2. Checkout previous version
git checkout <previous-commit-hash>

# 3. Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# 4. Restore database if needed
cat backup.sql | docker exec -i budget-db-prod psql -U budget_user budget_db
```

## 12. Troubleshooting

### Database connection errors
```bash
# Check database is running
docker-compose -f docker-compose.prod.yml ps postgres

# Check database logs
docker-compose -f docker-compose.prod.yml logs postgres

# Test connection
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U budget_user -d budget_db -c "SELECT 1;"
```

### Backend won't start
```bash
# Check environment validation
docker-compose -f docker-compose.prod.yml logs backend | grep "FATAL"

# Check for missing secrets
docker-compose -f docker-compose.prod.yml exec backend env | grep SECRET
```

### SSL certificate issues
```bash
# Check certificate validity
openssl x509 -in /etc/letsencrypt/live/your-domain/fullchain.pem -noout -dates

# Renew Let's Encrypt certificate
sudo certbot renew
```

### High memory usage
```bash
# Check resource usage
docker stats

# Adjust PostgreSQL settings if needed
# Add to docker-compose.prod.yml under postgres environment:
# - POSTGRES_SHARED_BUFFERS=256MB
# - POSTGRES_WORK_MEM=8MB
```

## Support

For issues or questions:
- Check application logs: `docker-compose -f docker-compose.prod.yml logs`
- Review health endpoint: `https://your-domain.com/api/health`
- Check GitHub issues: [Your Repository URL]

---

**Security Note:** Never commit `.env.production` to version control. Store secrets securely using your cloud provider's secret management service.
