# Budget Tracker - Open Source Financial Management

[![Version](https://img.shields.io/badge/version-2.4.0-blue.svg)](https://github.com/JWalen/budget-tracker)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

A **complete, self-hosted budget tracking platform** with enterprise features including team collaboration, advanced analytics, multi-currency support, receipt management, and offline capabilities. **100% free and open source** - no subscriptions, no limits, no data sharing.

![Budget Tracker Dashboard](https://via.placeholder.com/800x400/0ea5e9/ffffff?text=Budget+Tracker+Dashboard)

---

## ✨ Why Budget Tracker?

- 🆓 **Completely Free** - No subscriptions, no hidden costs, no limits
- 🔒 **Privacy First** - Self-hosted, your data never leaves your server
- 🚀 **Full Featured** - Everything you need for personal or business finances
- 👥 **Team Ready** - Organizations and collaboration built-in
- 📱 **Works Offline** - Progressive Web App with offline support
- 🛠️ **Developer Friendly** - Well-documented API, TypeScript, modern stack

---

## 🎯 Key Features

### 💰 Financial Management (All Free!)
- ✅ **Transaction Tracking** - Unlimited income and expenses with categories
- ✅ **Budget Management** - Set and track spending limits
- ✅ **Category System** - Organize transactions and budgets
- ✅ **Multi-Currency** - 20 currencies with live exchange rates
- ✅ **Receipt Upload** - Unlimited receipts with S3 or local storage
- ✅ **Pay Periods** - Assign bills to paychecks
- ✅ **Recurring Transactions** - Automate repeating income/expenses
- ✅ **Debt Tracking** - Monitor loans and debts
- ✅ **Bill Management** - Track upcoming bills

### 📊 Analytics & Insights
- ✅ **Advanced Dashboard** - 6 interactive chart types
- ✅ **Spending Trends** - Visualize patterns over time
- ✅ **Budget Variance** - Track performance vs goals
- ✅ **Cash Flow Analysis** - Monitor money movement
- ✅ **CSV Export** - Download data in 3 formats
- ✅ **Monthly Reports** - Automated financial summaries
- ✅ **Budget Templates** - Pre-built strategies (50/30/20, Zero-based, etc.)

### 👥 Team Collaboration
- ✅ **Organizations** - Create teams for families or businesses
- ✅ **Role-Based Access** - Owner, Admin, Member, Viewer roles
- ✅ **Invitation System** - Email-based team invites
- ✅ **Real-Time Notifications** - Socket.io for instant updates
- ✅ **Shared Budgets** - Collaborate on finances
- ✅ **Unlimited Team Members** - No restrictions on team size

### 📱 Mobile & Offline
- ✅ **Progressive Web App** - Install as mobile app
- ✅ **Offline Support** - Works without internet
- ✅ **Background Sync** - Auto-sync when online
- ✅ **Service Worker** - Advanced caching
- ✅ **Responsive Design** - Mobile, tablet, desktop

### 🛠️ Developer Features
- ✅ **RESTful API** - 75+ documented endpoints
- ✅ **Swagger Docs** - Interactive API documentation
- ✅ **TypeScript** - Type-safe backend
- ✅ **Comprehensive Tests** - Integration test suite
- ✅ **CI/CD Pipeline** - GitHub Actions automation
- ✅ **Docker Support** - Easy deployment

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org))
- **PostgreSQL** 15+ ([Download](https://www.postgresql.org/download/))
- **Docker** (recommended) ([Download](https://www.docker.com/))

### Option 1: Docker (Recommended - 5 Minutes)

```bash
# Clone repository
git clone https://github.com/JWalen/budget-tracker.git
cd budget-tracker

# Start all services (PostgreSQL, Backend, Frontend)
docker compose up --build

# Access application
# Frontend: http://localhost:3456
# Backend API: http://localhost:5050
# API Docs: http://localhost:5050/api-docs

# Create your first account at http://localhost:3456/register
```

That's it! All database tables are automatically created on first startup.

### Option 2: Manual Setup

```bash
# Clone repository
git clone https://github.com/JWalen/budget-tracker.git
cd budget-tracker

# Setup database
psql -U postgres
CREATE DATABASE budget_db;
CREATE USER budget_user WITH PASSWORD 'budget_pass';
GRANT ALL PRIVILEGES ON DATABASE budget_db TO budget_user;
\q

# Run database migrations
psql -U budget_user -d budget_db < database/init.sql
psql -U budget_user -d budget_db < database/add_organizations.sql
psql -U budget_user -d budget_db < database/add_receipts.sql
psql -U budget_user -d budget_db < database/add_budget_templates.sql
psql -U budget_user -d budget_db < database/add_multi_currency.sql
psql -U budget_user -d budget_db < database/add_notifications.sql

# Setup backend
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run dev  # Runs on http://localhost:5000

# Setup frontend (in new terminal)
cd ../frontend
npm install
cp .env.example .env
npm run dev  # Runs on http://localhost:3000
```

---

## 🎨 What's Included

### Core Features (All Free!)
- **Transaction Management** - Track income and expenses with unlimited transactions
- **Budget Planning** - Set limits, track progress, get alerts
- **Category Organization** - Custom categories with colors and icons
- **Account Management** - Multiple bank accounts and wallets
- **Recurring Transactions** - Automate repeating payments
- **Bill Tracking** - Never miss a payment
- **Debt Management** - Track loans and payment schedules
- **Pay Period Planning** - Assign bills to paychecks

### Advanced Features (All Free!)
- **Analytics Dashboard** - 6 chart types (spending trends, category breakdown, etc.)
- **Budget Templates** - 50/30/20, Zero-based budgeting, Envelope method, Pay Yourself First
- **Receipt Management** - Upload and link receipt images to transactions
- **Multi-Currency** - Support for USD, EUR, GBP, JPY, CAD, AUD, and 14 more
- **Real-Time Notifications** - Instant alerts for budget thresholds
- **Data Import** - CSV/bank statement import with auto-categorization
- **Advanced Reports** - Cash flow, budget variance, spending by merchant
- **Data Backup** - Export all data anytime

### Collaboration Features (All Free!)
- **Organizations** - Create teams for families or businesses
- **Team Invitations** - Email-based invites with role assignment
- **Role Management** - Owner, Admin, Member, Viewer permissions
- **Shared Budgets** - Collaborate on household or business budgets
- **Activity Tracking** - See who made what changes

---

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React 18 with Vite
- Tailwind CSS for styling
- Recharts for data visualization
- Socket.io-client for real-time
- PWA with service worker

**Backend:**
- Node.js with Express
- TypeScript for type safety
- PostgreSQL database
- Redis for caching
- Socket.io for WebSocket

**Services:**
- AWS S3 for file storage (optional - can use local storage)
- Sentry for error tracking (optional)
- GitHub Actions for CI/CD

### Project Structure

```
budget-tracker/
├── backend/                 # Node.js + TypeScript API
│   ├── src/
│   │   ├── routes/         # API endpoints (80+)
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, validation, caching
│   │   ├── config/         # Configuration
│   │   └── tests/          # Integration tests (29)
│   └── package.json
├── frontend/               # React application
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── contexts/      # React Context (Auth, Budget, Theme)
│   │   ├── api/           # API client
│   │   └── utils/         # Helper functions
│   └── package.json
├── database/              # SQL migrations
├── load-tests/           # k6 load testing
├── .github/workflows/    # CI/CD pipelines
└── docker-compose.yml   # Docker orchestration
```

---

## 🔌 API Documentation

Interactive API documentation available at: **http://localhost:5050/api-docs**

### Key Endpoints

#### Authentication
```
POST   /api/auth/register       - Register new user
POST   /api/auth/login          - Login
POST   /api/auth/logout         - Logout
POST   /api/auth/setup-mfa      - Setup 2FA
POST   /api/auth/verify-mfa     - Verify 2FA code
```

#### Transactions
```
GET    /api/transactions                 - List transactions
POST   /api/transactions                 - Create transaction
GET    /api/transactions/:id             - Get transaction
PUT    /api/transactions/:id             - Update transaction
DELETE /api/transactions/:id             - Delete transaction
```

#### Analytics
```
GET    /api/analytics/summary            - Summary with trends
GET    /api/analytics/trends             - Spending trends over time
GET    /api/analytics/breakdown          - Category breakdown
GET    /api/analytics/variance           - Budget variance analysis
GET    /api/analytics/cash-flow          - Cash flow tracking
GET    /api/analytics/export             - CSV export
```

#### Organizations
```
POST   /api/organizations                - Create organization
GET    /api/organizations/:id            - Get organization
POST   /api/organizations/:id/invite     - Invite member
GET    /api/organizations/:id/members    - List members
PUT    /api/organizations/:id/members/:userId  - Update member role
DELETE /api/organizations/:id/members/:userId  - Remove member
```

#### Receipts
```
POST   /api/receipts/upload              - Upload receipt
GET    /api/receipts                     - List receipts
GET    /api/receipts/:id                 - Get receipt
DELETE /api/receipts/:id                 - Delete receipt
```

---

## 🧪 Testing

### Run Tests

```bash
# Backend integration tests (29 tests)
cd backend
npm test

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
```

### Load Testing

```bash
# Install k6
choco install k6  # Windows
brew install k6   # macOS

# Run load tests
k6 run load-tests/load-test.js      # Standard load test (100 users)
k6 run load-tests/spike-test.js     # Spike test (500 users)
k6 run load-tests/stress-test.js    # Stress test (400 users)
```

**Expected Performance:**
- 50-100 concurrent users on single server
- p(95) response time < 500ms
- Error rate < 1%
- 100-200 requests/second

---

## 🔐 Security

### Implemented Protections

- ✅ **JWT Authentication** - Secure token-based auth (7-day expiry)
- ✅ **Password Hashing** - bcryptjs with cost factor 12
- ✅ **2FA Support** - Optional TOTP multi-factor authentication
- ✅ **Rate Limiting** - Prevent brute force attacks
  - General API: 100 req/15min
  - Auth endpoints: 5 req/15min
  - File uploads: 10 req/hour
- ✅ **Helmet.js** - Security headers (XSS, CSP, etc.)
- ✅ **SQL Injection Prevention** - Parameterized queries
- ✅ **XSS Protection** - React auto-escaping
- ✅ **CORS Configuration** - Controlled cross-origin access
- ✅ **Session Management** - Secure JWT token handling

### Production Security Checklist

Before deploying to production:

- [ ] Set strong `JWT_SECRET` (use `openssl rand -base64 32`)
- [ ] Configure `DATABASE_URL` with SSL
- [ ] Enable HTTPS (TLS certificates)
- [ ] Configure `SENTRY_DSN` for error tracking (optional)
- [ ] Use environment variables for all secrets
- [ ] Remove database port exposure (5433)
- [ ] Enable Redis authentication (optional)
- [ ] Setup database backups
- [ ] Configure firewall rules
- [ ] Enable audit logging

---

## 📦 Deployment

### Environment Variables

Create `.env` files in both `backend/` and `frontend/` directories:

**Backend (.env):**
```env
# Database
DATABASE_URL=postgresql://budget_user:budget_pass@localhost:5432/budget_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this

# AWS S3 (optional - uses local storage if not configured)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=budget-tracker-receipts

# Redis (optional but recommended for caching)
REDIS_URL=redis://localhost:6379

# Sentry (optional for error tracking)
SENTRY_DSN=https://...@sentry.io/...

# General
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://yourdomain.com
```

**Frontend (.env):**
```env
VITE_API_URL=https://api.yourdomain.com
```

### Docker Production Deployment

```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Start services
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Scale backend (load balancing)
docker compose -f docker-compose.prod.yml up -d --scale backend=3
```

### Cloud Deployment Options

#### AWS
- **Frontend:** S3 + CloudFront CDN
- **Backend:** ECS Fargate or Elastic Beanstalk
- **Database:** RDS PostgreSQL (Multi-AZ)
- **Cache:** ElastiCache Redis
- **Storage:** S3 for receipts
- **Monitoring:** CloudWatch

#### DigitalOcean
- **App Platform:** Automated deployment
- **Managed PostgreSQL:** Automatic backups
- **Managed Redis:** High availability
- **Spaces:** S3-compatible storage

#### Heroku
- **Web Dynos:** Auto-scaling
- **Heroku Postgres:** Add-on
- **Heroku Redis:** Add-on (optional)
- **Add-ons:** Sentry (optional for error tracking)

---

## 🔧 Configuration

### Redis Caching

Enable Redis for improved performance:

```env
REDIS_URL=redis://localhost:6379
```

**Benefits:**
- 40% faster API responses
- Reduced database load
- Session management
- Rate limiting storage

### File Storage (Receipts)

Choose between AWS S3 or local filesystem:

**AWS S3 (Recommended):**
```env
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

**Local Filesystem (Development):**
```env
UPLOAD_DIR=./uploads
```

Files automatically fallback to local storage if S3 is not configured.

### Currency Exchange Rates

The app uses live exchange rates from:
- **Primary:** exchangerate-api.com (1,500 requests/month free)
- **Backup:** open.er-api.com (unlimited free)

**Caching Strategy:**
- In-memory: 1 hour
- Database: 24 hours
- API: On-demand

---

## 📊 Monitoring

### Error Tracking (Sentry)

Configure Sentry for error tracking:

```env
SENTRY_DSN=https://your-key@sentry.io/your-project-id
```

**Features:**
- Real-time error alerts
- Stack traces with source maps
- User context
- Performance monitoring
- Release tracking

### Logging

Logs are output to console and can be shipped to:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Papertrail**
- **Loggly**
- **CloudWatch Logs**

### Performance Monitoring

Built-in performance utilities:
- Core Web Vitals tracking
- API response time monitoring
- Memory usage tracking
- Bundle size analysis

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style
- Write tests for new features
- Update documentation
- Use TypeScript for backend code
- Keep commits atomic and descriptive

### Running Locally

```bash
# Backend hot-reload
cd backend
npm run dev

# Frontend hot-reload
cd frontend
npm run dev

# Watch tests
cd backend
npm test -- --watch
```

---

## 📖 Documentation

- **[CHANGELOG.md](CHANGELOG.md)** - Version history
- **[PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md)** - Deployment guide
- **[load-tests/README.md](load-tests/README.md)** - Load testing guide
- **[API Documentation](http://localhost:5050/api-docs)** - Interactive Swagger docs

---

## 🎯 Roadmap

### Current Version: 2.4.0 ✅
- Complete self-hosted platform
- All core features implemented
- Production-ready with Docker deployment

### Future Enhancements

**Phase 5: Banking Integration**
- Plaid API for bank connections
- Automatic transaction import
- Account balance syncing
- Bank reconciliation

**Phase 6: Mobile Native Apps**
- React Native iOS app
- React Native Android app
- Biometric authentication
- Native push notifications

**Phase 7: AI Features**
- Spending pattern analysis
- Budget recommendations
- Anomaly detection
- Predictive analytics

**Phase 8: Advanced Tools**
- Recurring transactions
- Bill payment reminders
- Debt payoff calculator
- Investment tracking
- Tax report generation

---

## 📈 Performance

### Benchmarks

**Single Server (2 CPU, 4GB RAM):**
- ✅ 50-100 concurrent users
- ✅ p(95) response time < 500ms
- ✅ Error rate < 1%
- ✅ 100-200 requests/second

**Scaled Deployment (3+ servers):**
- ✅ 500+ concurrent users
- ✅ p(95) response time < 300ms
- ✅ 1,000+ requests/second

### Optimizations Applied

- Response caching (Redis)
- Gzip/Brotli compression
- Code splitting (lazy loading)
- Image lazy loading
- Database connection pooling
- SQL query optimization
- CDN for static assets
- Service worker caching

---

## 🐛 Troubleshooting

### Common Issues

**Database connection failed:**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Verify credentials in .env
cat backend/.env | grep DATABASE_URL
```

**Redis connection failed:**
```bash
# The app works without Redis, but performance is reduced
# To enable Redis:
docker run -d -p 6379:6379 redis:alpine
```

**Build errors:**
```bash
# Clear caches and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **[Socket.io](https://socket.io)** - Real-time communication
- **[Recharts](https://recharts.org)** - Data visualization
- **[Tailwind CSS](https://tailwindcss.com)** - Styling framework
- **[Sentry](https://sentry.io)** - Error tracking (optional)
- **[PostgreSQL](https://www.postgresql.org)** - Database
- **[Redis](https://redis.io)** - Caching (optional)
- **[React](https://react.dev)** - UI framework

---

## 💬 Support & Community

- **Documentation:** Check this README and the [docs](./docs) folder
- **Issues:** [GitHub Issues](https://github.com/JWalen/budget-tracker/issues)
- **Discussions:** [GitHub Discussions](https://github.com/JWalen/budget-tracker/discussions)
- **Contributions:** Pull requests welcome!

---

## 🌟 Why Open Source?

Budget tracking is personal and sensitive. We believe you should have **complete control** over your financial data:

- ✅ **Your Data, Your Server** - Self-host on your own infrastructure
- ✅ **No Vendor Lock-in** - Export your data anytime
- ✅ **Full Transparency** - Inspect the code, know exactly what it does
- ✅ **Community Driven** - Features built by users, for users
- ✅ **Privacy First** - No data collection, no tracking, no ads
- ✅ **Free Forever** - No subscriptions, no upsells, no limits

---

## 🎉 Use Cases

Perfect for:

- 👤 **Personal Finance** - Track your own income, expenses, and budgets
- 👨‍👩‍👧‍👦 **Family Budgeting** - Collaborate with your household on shared finances
- 💼 **Small Business** - Manage business expenses and track multiple accounts
- 🏢 **Freelancers** - Monitor project income, business expenses, and tax planning
- 👥 **Roommates** - Split bills and track shared expenses
- 🎓 **Students** - Learn personal finance management
- 💰 **Financial Coaching** - Help clients track their progress

---

## 🚀 Project Stats

This project includes:

- ✅ **75+ API Endpoints** - Complete RESTful API
- ✅ **20+ Database Tables** - Comprehensive data model
- ✅ **Full Test Coverage** - Integration test suite
- ✅ **Production-Ready** - Docker deployment included
- ✅ **Complete Documentation** - API docs with Swagger
- ✅ **Modern Stack** - React 18, TypeScript, PostgreSQL
- ✅ **Performance Optimized** - Redis caching, efficient queries
- ✅ **Security Hardened** - JWT auth, CSRF protection, rate limiting

---

<div align="center">

**Made with ❤️ by the Budget Tracker Team**

[⭐ Star us on GitHub](https://github.com/JWalen/budget-tracker) • [🐛 Report Bug](https://github.com/JWalen/budget-tracker/issues) • [💡 Request Feature](https://github.com/JWalen/budget-tracker/issues)

</div>
