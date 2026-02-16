# Changelog

## [2.4.0] - 2026-02-16

### Security
- Removed `unsafe-eval` from Content Security Policy headers
- Removed server uptime and environment info from `/api/health` endpoint
- Added `.env.prod` and backup files to `.gitignore`

### Fixed
- Gmail provider option now appears in admin email settings
- Database backup button works correctly (fixed endpoint URL)
- Added `MFA_ENCRYPTION_KEY` and `BACKUP_ENCRYPTION_KEY` to Docker Compose environment
- Removed stray `console.log` statements from Bills, Dashboard, and Organizations pages

### Changed
- Removed non-functional Quick Actions from admin dashboard
- Updated README and production deployment guide

## [2.3.0] - 2026-02-16

### Added
- One-click update from the Help page — streams live progress and auto-reconnects after restart

## [2.2.0] - 2026-02-16

### Changed
- Release 2.2.0

## [2.1.10] - 2026-02-13

### Fixed
- Fixed `frontend/nginx.conf` to not overwrite `X-Forwarded-Proto` header, fixing infinite redirects behind Nginx Proxy Manager

## [2.1.9] - 2026-02-13

### Fixed
- Improved compatibility with Nginx Proxy Manager by checking `X-Forwarded-Scheme` header for HTTPS enforcement

## [2.1.8] - 2026-02-13

### Fixed
- Synced backend and frontend package.json versions to fix "update available" false positives

## [2.1.7] - 2026-02-13

### Fixed
- Fixed update checking logic to reliably detect the running version (reads package.json directly)

## [2.1.6] - 2026-02-13

### Fixed
- Fixed Docker image naming by hardcoding lowercase repository owner in workflow

## [2.1.5] - 2026-02-13

### Fixed
- Fixed Docker image naming convention in GitHub Actions (force lowercase repository names)

## [2.1.4] - 2026-02-13

### Fixed
- Fixed GitHub Actions workflow to correctly trigger on tag pushes for releases

## [2.1.3] - 2026-02-13

### Fixed
- Fixed incorrect test database port configuration (switched from 5433 to 5432)

## [2.1.2] - 2026-02-13

### Fixed
- Fixed critical database connection issues in CI/CD pipeline
- Improved backend test stability with connection retry logic

## [2.1.1] - 2026-02-13

### Changed
- Moved "Check Updates" button from Admin Dashboard to Help page for better accessibility

## [2.1.0] - 2026-02-13

### 🎉 MAJOR UPDATE: Complete Open Source Transformation

#### Free & Unlimited Access (NEW)
- Removed all subscription paywalls and tiered limits
- All features now free for everyone (Pro/Business features unlocked)
- Removed Stripe payment integration
- Removed usage tracking limits

#### Enhanced Features (Unlocked)
- **Households (Organizations):** Create unlimited households for family collaboration
- **Advanced Analytics:** Full access to all 6 chart types and CSV exports
- **Budget Templates:** Use all pre-built strategies (50/30/20, Zero-based, etc.)
- **Multi-Currency:** Support for 20+ currencies with live rates
- **Receipt Management:** Unlimited receipt uploads
- **Notifications:** Real-time alerts for all users

#### UI/UX Improvements
- **Registration:** Added password confirmation field for security
- **Admin Access:** First registered user automatically becomes Admin
- **Households:** Fixed "Create Household" flow with new modal UI
- **Navigation:** Cleaned up sidebar, removed "Upgrade" badges
- **Mobile:** Improved responsive layout for small screens

#### Technical Changes
- Removed `subscriptions` table and related database migrations
- Removed Stripe dependency to reduce build size
- Fixed tenant middleware to allow new user onboarding without errors
- optimized API routes for performance

## [2.0.0] - 2026-02-09

### Feature Complete Release (Legacy SaaS Foundation)

#### UI Integration (NEW)
- Complete UI integration for all SaaS features
- All backend APIs now accessible through intuitive interfaces
- Subscriptions page with plan comparison and upgrade flow
- Organizations page for team collaboration and member management
- Receipts page with image upload and gallery view
- Budget Templates page with pre-built strategies
- Currency page for multi-currency support
- Notifications page with real-time alerts
- Analytics dashboard with 6 chart types and CSV export

#### Navigation Improvements (NEW)
- Reorganized sidebar into 5 logical sections:
  - Dashboard & Analytics
  - FINANCES (Transactions, Accounts, Budgets, Templates, Recurring, Pay Periods, Receipts)
  - MANAGE (Categories, Currency, Debts, Bills)
  - TOOLS (Import, Auto-Categorize, Reports, Backups)
  - ACCOUNT (Subscription, Organizations, Notifications, Settings, Help)
- Added feature tier badges (New, Pro, Business, SaaS)
- Improved mobile responsiveness
- Better visual hierarchy and iconography

#### SaaS Backend Features
- Stripe subscription management (Free, Pro $9.99/mo, Business $29.99/mo)
- Multi-tenancy with organizations and role-based access (Owner, Admin, Member, Viewer)
- Usage tracking and automatic plan limit enforcement
- Advanced analytics with 6 chart types and CSV export
- Receipt management with S3 or local file storage
- Budget templates system (50/30/20, Zero-based, Envelope, Pay Yourself First)
- Multi-currency support for 20 currencies with live exchange rates
- Real-time notifications via Socket.io WebSocket
- Progressive Web App (PWA) with offline support
- Service worker for caching and background sync

#### Technical Infrastructure
- Comprehensive testing suite (29 integration tests)
- CI/CD pipeline with GitHub Actions
- Error tracking with Sentry integration
- Redis caching for performance optimization
- Rate limiting on all API endpoints
- Response compression with gzip
- Security headers (helmet, CORS)
- Load testing framework with k6
- Interactive API documentation with Swagger UI
- Complete production deployment guide (AWS, DigitalOcean, Heroku)

#### Breaking Changes
- New subscription model replaces free-for-all access
- Feature limits enforced based on subscription tier
- Organizations required for Business plan features
- API endpoints now require subscription validation

## [1.2.0] - 2026-02-07

### Added
- Pay Periods page for assigning bills to income buckets (paychecks, bonuses, freelance)
- Track how much of each paycheck is spoken for with remaining balance
- Recurring pay period support with auto-generation (weekly, biweekly, semi-monthly, monthly)
- Quick-assign and reassign bills between pay periods
- Unassigned bills section for easy bill management
- Pay Periods added to Finances nav group in sidebar

## [1.1.0] - 2026-02-07

### Added
- Help page with quick-start instructions and full changelog
- Version number displayed in sidebar and mobile header
- Sidebar navigation consolidated into grouped sections (Finances, Manage, Tools)
- Calendar and Sharing quick-access icons in top bar

### Changed
- Reorganized sidebar navigation into logical groups for better discoverability

## [1.0.0] - 2026-01-01

### Added
- Initial release
- Dashboard with spending overview and charts
- Transaction management (add, edit, delete, filter)
- Budget tracking with category-based limits
- Recurring transactions with automatic scheduling
- Category management with custom colors and icons
- Debt tracking
- Bill management
- CSV/bank statement import
- Budget sharing with view/edit permissions
- Calendar view for transactions and bills
- Two-factor authentication (TOTP)
- Data backup and restore
- Dark mode support
- Admin dashboard with user management and activity logs
