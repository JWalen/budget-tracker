# Changelog

## [2.11.0] - 2026-07-12

Diagnosability + AI configuration pass, plus downloadable desktop installers.

### Added
- **Dynamic AI model list** — `POST /api/admin/ai/models` fetches the models the configured (or just-entered) key can access from Anthropic (`GET /v1/models`) / OpenAI (`GET /v1/models`); Admin → AI Configuration gains a "Fetch available" button that merges the live list into the model dropdown.
- **DB-backed error log** — new `error_logs` table + `errorLog.ts` (best-effort insert, self-pruning to 2000 rows). The global HTTP error handler and AI routes record full detail (provider status/body/retry-after, stack). Admin → Error Log reads from the DB (works in the desktop app where file logging can't), with search, level filter, per-page export, and clear.
- **Downloadable installers** — the desktop CI workflow now publishes the built `.dmg` / `.exe` to a GitHub Release on `v*` tags.

### Changed / Fixed
- **AI error messages clarified** — provider rate limits (429/529) now return an actionable message (wait ~30s or switch to Haiku/Sonnet) after an automatic backoff-retry, instead of a generic 500; the default model is Sonnet (Opus's low per-minute limits caused "too many requests" under light use).

## [2.10.0] - 2026-07-11

Installable-app milestone plus a security, testing, and reliability hardening pass.

### Added
- **Installable PWA** — real PNG icon set (192/512 `any` + maskable, 180 apple-touch), iOS meta tags, and an in-app "Install app" button. Installs on desktop Chrome/Edge, Android, and iOS (Add to Home Screen).
- **Scheduled backups execute** — the scheduler runs due `backup_schedules`, writes to the mounted `/backups` volume, records history, prunes per retention, and advances `next_run` (verified end-to-end).

### Security
- `authMiddleware` verifies via `TokenService.verifyAccessToken` with **HS256 pinned** + issuer/audience/type (was a bare `jwt.verify`).
- **Refresh tokens hashed at rest** (sha256); also fixed logout, which previously revoked nothing server-side — refresh-after-logout now 401s.
- `trust proxy` only behind a proxy; Swagger `/api-docs` off in production unless opted in.
- Household **invite/remove restricted to owner/admin**; login lockout scoped to IP + (email,IP) so a third party can't lock out a victim.

### Changed / Fixed
- **Test suite trustworthy** — 97/97 green from a clean DB; `globalSetup` provisions the converged production schema (init.sql + schema.sql); `cleanDatabase` truncates dynamically (the stale `budget_shares` entry silently disabled all cleanup); CI drops the manual init.sql seed and points **staging at the prod compose file**.
- **Backup scripts hardened** — read DB creds from inside the container, `pipefail` + empty-output guard; proven with a backup → restore drill (identical data, all 37 tables).
- Currency: exchange-rate failures surface an error instead of silently converting at `1.0`.
- Accessibility: 83 `aria-label`s on icon-only buttons across 23 pages/components.
- Import: forward a rule's `categoryId` on confirm (bill+category dual-assign); upload rate limit 10→40/hour.

### Deferred (next round)
- Shared-budget scoping on family/AI routes (only affects multi-user shared budgets; single-owner is correct).
- Pagination caps on a few list endpoints (scale-later).

## [2.9.0] - 2026-07-11

Production-readiness pass: security, correctness, infra, and UX hardening across the stack.

### Security
- **Backup restore no longer trusts client-supplied row ids** — rows are inserted fresh and foreign keys remapped, closing a cross-tenant overwrite/hijack via `ON CONFLICT (id) DO UPDATE` (`backupSchedule.ts`).
- **Backups exclude credential material** — full backups select an explicit non-secret user column list (no `password_hash`/`mfa_secret`).
- **First-admin bootstrap is atomic** (`is_admin = NOT EXISTS(...)` inside the INSERT) and registration is transactional; added a `REGISTRATION_ENABLED` gate.
- **Encryption keys** — MFA/backup keys derive from the boot-validated `ENCRYPTION_KEY`; removed the deterministic dev fallback.

### Fixed
- **Always-500 features now work**: multi-currency summary and budget-template apply (queried non-existent `organization_id`), save-backup-config and family-allowance creation (missing `UNIQUE` for `ON CONFLICT`).
- **Backup Export / Restore / Download** wired end-to-end (route mounted, `/:id/download` added, frontend sends multipart + authenticated blob download).
- **Reports**: budget-performance constrains spend to each budget's own month (no N× over-count) and quotes camelCase aliases so labels aren't `undefined`.
- **Money & dates**: month-end-safe recurrence (no skipped months), no UTC round-trip on stored dates, debt balances computed in SQL, import amount validation + correct month extraction, `COALESCE` on account/category updates.
- **Frontend**: charts theme in dark mode; load failures surface a toast + retry; bulk selection clears on month/owner change; pages refetch on shared-budget switch; `AuthContext` no longer logs out on transient errors.

### Added
- **PWA** — safe service worker (never caches `/api`, network-first navigations, versioned asset cache, cache clear on logout), manifest linked, update flow.
- **Maintenance scheduler** — hourly cleanup of expired tokens, old login attempts, and read notifications.
- **Notifications persist** regardless of Socket.IO availability.

### Changed / Infra
- Backend Dockerfile: multi-stage, `npm ci`, dev-dep prune, non-root `USER node`, exec-form `node` for signal handling; graceful shutdown (SIGTERM drain + `pool.end`).
- Prod compose: volumes for uploads/backups/logs, `LOG_TO_CONSOLE`, memory limits, frontend healthcheck.
- Nginx: gzip, immutable asset caching, `X-Forwarded-Proto`, security headers.
- Code-split all authed routes (initial bundle ~1 MB → ~239 kB); route-level `ErrorBoundary`; memoized Auth/Toast contexts.
- Removed unused deps (`prisma`, `@sentry/react`, `rate-limit`, `react-lazyload`, `socket.io-client`) and dead frontend utils/API methods.

## [2.8.0] - 2026-07-02

Consolidates the AI, import, and error-handling work done after the provider switch.

### Added
- **AI conversational memory + persistent chat history** — new `ai_chat_messages` table; the chat replays recent turns to the model and reloads history after refresh, with a "Clear history" control (`GET`/`DELETE /api/ai/history`).
- **Model picker** — per-provider model dropdown (Claude / OpenAI) in Admin → AI Configuration, with a Custom option.
- **Request ids** — every request carries a UUID (logs, `X-Request-Id` header, and error bodies) for support correlation.

### Changed
- **Error handling overhaul.** Central `mapPgError()` turns Postgres constraint violations into actionable messages ("already in use", "still used by transactions", "the selected category doesn't exist"). The frontend now surfaces express-validator field messages (previously all collapsed to "Request failed"), status-based fallbacks (403/404/429/5xx), and the request id. Added a JSON 404 for unmatched `/api` routes. Key CRUD/AI routes route failures through a shared `handleRouteError`.

### Fixed
- AI transaction categorization was truncated for large batches (raised the output token budget to scale with the number of transactions).
- Login lockout: the strict brute-force limiter was applied to the whole `/api/auth` router, throttling `/auth/me` and `/auth/refresh`; scoped it to `/login` and `/register` only.
- Import upload limit raised 1 MB → 10 MB (Nginx `client_max_body_size` + multer), with a clearer 413 message.
- Import no longer truncates OFX/QFX descriptions — uses the full `<MEMO>` field (and combines with `<NAME>`) instead of the 32-char-capped `<NAME>`.

## [2.7.0] - 2026-07-02

Replaced the local Ollama LLM integration with hosted AI providers.

### Changed
- The AI assistant now calls a hosted provider — **Anthropic Claude** (default, `claude-opus-4-8`) or **OpenAI** (`gpt-4o`) — via the official SDKs, instead of running a local Ollama model.
- Admins select the provider, model, and enter API keys under **Admin → AI Configuration**. Keys are encrypted at rest (AES-256-GCM, like other secrets) and never returned to the client.
- Health check reports `ai: configured | disabled` instead of probing Ollama.

### Removed
- The `ollama` Docker service (and its GPU reservation / model volume) from both dev and prod compose files.
- GPU/VRAM detection, in-app model downloads (`/api/admin/ai/pull-model`, `/ai/models`), and the `ai_auto_gpu` setting.
- `OLLAMA_BASE_URL` / `OLLAMA_MODEL` environment variables.

### Migration
- On startup, `schema.sql` converges existing installs: a legacy `ai_model` (e.g. `mistral`) is reset to `claude-opus-4-8`, a new `ai_provider` setting defaults to `claude`, and `ai_auto_gpu` is dropped. Enable AI and add an API key in the admin UI to use it.

## [2.6.0] - 2026-07-02

Security & stability hardening pass (pre-launch audit remediation).

### Security
- Removed the in-app `POST /api/admin/system/update` endpoint and the host Docker-socket / project bind mounts (host-RCE risk); updates are now an out-of-band operator action.
- Fixed SQL injection / mass-assignment via client-controlled identifiers (family update, backup restore).
- Rebuilt shared-budget access on Households (`organizations`); removed the legacy `budget_shares` table (which was breaking login/registration on migrated databases).
- Receipts are served via an authenticated, ownership-checked route; removed the unauthenticated `/uploads` static mount. Uploads validated by magic bytes.
- All sessions revoked on password change and admin password reset; unified stronger password policy (min 12); constant-time login to prevent account enumeration; auth/AI rate limiters mounted.
- Email/provider secrets encrypted at rest; admin responses no longer expose password hashes/MFA secrets; CSP no longer allows inline scripts.
- Added ownership checks (IDOR fixes) and server-side input validation across data routes; atomic DB transactions for payments/reconcile/restore; CSV formula-injection escaping.

### Fixed
- Database bootstrap now converges fresh and existing installs automatically on startup (`schema.sql` + startup runner); previously fresh installs were missing feature tables.
- Pay-period generation infinite loop; reports net-income sign error; numerous null-safety crashes and `$NaN`/timezone display bugs.
- App-wide: error toasts for previously-silent failures, double-submit protection on forms, loading states on refetch.

### Added / Completed
- Built out non-functional controls: receipt download/delete, currency default persistence, Reports (category-trend, bill-payment, cash-flow), and Household member management.

## [2.5.0] - 2026-02-16

### Added
- AI-powered transaction categorization using local Ollama model
- "AI Categorize" bulk action button when transactions are selected
- "AI Categorize" header button to auto-categorize all uncategorized transactions for the current month
- Review modal to accept, reject, or override AI category suggestions before applying
- Increased nginx proxy timeout for AI endpoints to handle larger batches

## [2.4.2] - 2026-02-16

### Fixed
- Fixed one-click update git authentication inside Docker container

## [2.4.1] - 2026-02-16

### Fixed
- Fixed one-click update failing due to git `safe.directory` issue in Docker container

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
