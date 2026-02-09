# Production Deployment - Quick Reference

## 🚀 Deploy in 5 Steps

### Step 1: Generate Secrets (2 minutes)
```bash
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 32  # JWT_REFRESH_SECRET  
openssl rand -hex 32  # ENCRYPTION_KEY
```

### Step 2: Create `.env` on Server (3 minutes)
```bash
DATABASE_URL=postgresql://user:STRONG_PASS@postgres:5432/budget_db
JWT_SECRET=<generated_secret_1>
JWT_REFRESH_SECRET=<generated_secret_2>
ENCRYPTION_KEY=<generated_secret_3>
NODE_ENV=production
HTTPS_ONLY=true
FRONTEND_URL=https://budget.yourdomain.com
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<your_key>
```

### Step 3: Deploy (5 minutes)
```bash
git clone <your-repo>
cd budget-tracker
# Copy .env file to server
docker-compose -f docker-compose.prod.yml up -d --build
```

### Step 4: Verify (1 minute)
```bash
curl https://budget.yourdomain.com/api/health
# Should return: {"status":"ok","database":"connected",...}
```

### Step 5: Create Admin (1 minute)
```bash
# Register via web UI, then:
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U budget_user budget_db -c \
  "UPDATE users SET is_admin=true WHERE email='admin@yourdomain.com';"
```

## 🔒 Security Verification

```bash
# 1. Database NOT exposed
nmap -p 5432,5433 <your-server-ip>
# Should show: closed

# 2. HTTPS working
curl -I http://budget.yourdomain.com
# Should redirect to HTTPS (301)

# 3. Environment validated
docker-compose -f docker-compose.prod.yml logs backend | grep "validation passed"
# Should show: ✅ Environment validation passed
```

## 📋 Files Created

- `docker-compose.prod.yml` - Production configuration
- `frontend/nginx-ssl.conf` - SSL configuration
- `PRODUCTION-DEPLOYMENT.md` - Full deployment guide
- `FIXES-SUMMARY.md` - All fixes applied

## ⚡ Quick Commands

```bash
# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart service
docker-compose -f docker-compose.prod.yml restart backend

# Database backup
docker exec budget-db-prod pg_dump -U budget_user budget_db > backup.sql

# Stop all
docker-compose -f docker-compose.prod.yml down

# Update app
git pull && docker-compose -f docker-compose.prod.yml up -d --build
```

## 🆘 Troubleshooting

### Backend won't start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backend

# Common issues:
# - Missing environment variables (see validation errors)
# - Database not ready (check postgres logs)
# - Port already in use (check with: lsof -i :5000)
```

### Database connection failed
```bash
# Test database
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U budget_user -d budget_db -c "SELECT 1;"
```

### SSL issues
```bash
# Check certificate
openssl x509 -in /etc/letsencrypt/live/your-domain/fullchain.pem -noout -dates
```

## 📞 Support

- Full guide: See `PRODUCTION-DEPLOYMENT.md`
- Fixes applied: See `FIXES-SUMMARY.md`
- Health check: `https://your-domain.com/api/health`

---

**⚠️ IMPORTANT:** Never commit `.env` files. Store secrets securely.
