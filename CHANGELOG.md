# Changelog

## [2.0.0] - 2026-02-09

### 🎉 MAJOR RELEASE: Complete SaaS Platform Transformation

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
