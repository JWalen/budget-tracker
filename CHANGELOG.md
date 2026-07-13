# Changelog

## [2.17.2] - 2026-07-12

### Fixed
- **"Check for Updates" (Settings → About) still timed out** after the fetch switch — the real cause was the packaged backend's Node preferring IPv6 and stalling on the route to `api.github.com` (the Electron main process's `File → Check for Updates` uses Chromium's network stack and was unaffected). Added `dns.setDefaultResultOrder('ipv4first')` at backend startup so all outbound requests prefer IPv4 and don't hang.

## [2.17.1] - 2026-07-12

### Fixed
- **"Check for Updates" timed out in the desktop app.** The backend update-check used `axios`, whose `timeout` didn't abort a stalled DNS/connect in the packaged Electron-forked Node, so the request hung until the client's 12s abort. Switched the GitHub call to native `fetch` + `AbortSignal.timeout(6000)` (the same stack the working AI calls use), so the endpoint always returns within a few seconds.

## [2.17.0] - 2026-07-12

### Added
- **Restore is now complete.** Previously restore only rebuilt core financial tables; it now also restores **bank_accounts, family_members, account_balances, spending_limits, spending_alerts, allowance_transactions, approval_requests**. The restore deletes children-before-parents, rebuilds parents first, and remaps every foreign key (`account_id`, `transfer_account_id`, `member_id`, `budget_id`, `category_id`, …) through per-table old→new id maps — so a restore onto a fresh database fully reconstructs the data with links intact. Rows whose required parent is missing from a partial backup are skipped rather than failing the whole restore. Comprehensive round-trip test added (accounts + transfer + family member + allowance + spending limit + account balance, restored onto a fully wiped DB).

## [2.16.5] - 2026-07-12

### Fixed
- **Restore was broken (format mismatch)** — two `/api/backup/restore` handlers existed; the **SQL** one (`backup.ts`) shadowed the **JSON** one (`backupSchedule.ts`) because it was mounted first. The app downloads **JSON**, so restore always rejected it ("Expected per-user format"). Renamed the legacy SQL restore to `/restore-sql`; the JSON restore now owns `/restore` and reads the uploaded file (multipart) rather than a JSON body (avoids the 5 MB body limit). Added `transfer_account_id` to the restore allow-list **and** the owned-account null-out (so restoring a transfer can't FK-fail). Verified with round-trip integration tests (download → simulate loss → restore → data returns; idempotent; account-linked + transfer restore; invalid-file rejection).

### Known limitation
- Restore rebuilds core financial data (categories, transactions, budgets, bills, debts, recurring, match rules, pay periods and their children). It does **not** re-create bank accounts or family members — if those still exist they stay linked; on a fresh machine, restored transactions keep their data but their account link is cleared (no crash).

## [2.16.4] - 2026-07-12

### Fixed
- **"Check for Updates" could spin forever** — the `checkUpdates` fetch had no timeout, so if the request stalled the button span indefinitely. Added a 12s `AbortSignal.timeout`; on timeout the handler shows "Update check timed out. Check your connection and try again." and the spinner clears.

## [2.16.3] - 2026-07-12

### Changed
- **Moved "Check for Updates" out of Help into Settings → About.** The Help-page update control was misplaced, redundant with the native desktop updater (File → Check for Updates… + launch auto-check), and broken for non-admins (the `/admin/system/updates` endpoint is admin-only). Settings now has an **About** card showing the app version and — for admins — a "Check for Updates" button that opens the release page if a newer version exists (toast if up to date). Removed all the dead in-app-updater code from Help (button, modal, streaming/self-update handlers, state) and the `Data` backup section leftovers.

## [2.16.2] - 2026-07-12

### Changed
- **Backups consolidated to one page** — backup/restore controls appeared in three places (the Backups page, Settings → Data, and Admin → System Management), which was confusing. The Backups page (`/backups`) is now the single home; Settings and the admin page show a short "Go to Backups" pointer instead. The Backups page got clearer button labels ("Back Up Now" / "Download a copy") and a one-line explanation. Removed the now-dead export/restore handlers and modal from Settings, and the duplicate backup list/create from the admin page.

## [2.16.1] - 2026-07-12

### Fixed
- **Help → "Update Now" button was broken** — it called `/admin/system/update`, which was disabled for security (it used to `git pull` + rebuild Docker via the host socket) and returns HTTP 410, so the button always errored (with a Docker-oriented message irrelevant to the desktop app). The update modal now shows **"Download Update"**, which opens the release page (`releaseUrl`) so the user can download the new installer. The "check for updates" detection was already correct after the earlier `APP_VERSION` fix.

## [2.16.0] - 2026-07-12

### Added
- **Transfers (account-to-account)** — a third transaction type alongside income/expense for moving money between your own accounts (e.g. checking → savings). Schema: `type` CHECK now allows `'transfer'` and a `transfer_account_id` column (idempotent bootstrap). Backend validates a distinct, owned source and destination; the list query joins the destination account. The transaction form gains a Transfer toggle with a **To account** picker (category hidden, since transfers aren't categorized); the list shows `From → To` with a transfer icon and neutral amount.
- **Transfers are excluded from income/expense everywhere** — audited all aggregations: fixed `net`/`savings` (`ELSE -amount` → explicit `WHEN type = 'expense' THEN -amount ELSE 0`) in analytics, and the type-split trend/monthly/weekly loops in dashboard/reports (`else` → `else if (type === 'expense')`); most sums already used explicit `WHEN type = …` and needed no change. Integration tests cover transfer create + validation (110 tests green).

## [2.15.0] - 2026-07-12

### Added
- **Create a category from the transaction form** — the category `<select>` on Add/Edit Transaction gains a "+ Create new category…" option that reveals an inline name field; it posts to `/api/categories` with the form's current type, refreshes the list, and selects the new category.

### Fixed
- **Backups failed to create ("Failed to create backup")** — `createFullBackup` selected `users.currency` and `users.updated_at`, columns that don't exist on the shipped schema, so admin/full backups 500'd. The users projection is now intersected with the columns that actually exist (still excludes `password_hash`/`mfa_secret`), and every table read goes through a resilient helper that skips a missing/broken table instead of failing the whole backup. Backup endpoints now record failures to the admin Error Log. Verified with integration tests.

## [2.14.0] - 2026-07-12

### Added
- **Transaction search** — `GET /api/transactions` accepts a `search` param that matches `description` or category name (case-insensitive `ILIKE`, capped at 100 chars, fully parameterized). When `search` is present the month scoping is skipped server-side so results span all dates. The Transactions page gains a debounced search box (queries with `limit: 500`), a clear button, a results indicator, and dims the month nav while searching. Covered by integration tests.

## [2.13.0] - 2026-07-12

### Added
- **In-app update check (desktop)** — the Electron shell queries the GitHub Releases API on launch (4s after the window loads) and via **File → Check for Updates…**. When a strictly-newer release exists it shows a native dialog offering to download the platform installer (`.dmg`/`.exe`) or open the release notes. Silent self-update isn't possible while the app is unsigned (macOS Squirrel refuses unsigned updates), so this is a check-and-download flow.

### Fixed
- **Backups couldn't be saved/downloaded in the desktop app** — `saveBackup` wrote to `/backups` / `/var/backups/budget` (Docker mount points, unwritable on a normal machine), so `/backup/create` and scheduled backups failed and history downloads then 409/410'd. The desktop shell now passes a writable `BACKUP_DIR` (under `userData/backups`), all storage types honor `BACKUP_DIR`, and `saveBackup` falls back to a temp dir if the configured path is unwritable instead of hard-failing.
- The desktop shell passes `APP_VERSION` (the real installed version via `app.getVersion()`) to the backend, so the admin update-check reports the correct current version instead of `backend/package.json` (which was stale at 2.8.0). The comparison is now a proper semver check (only flags strictly-newer releases).

## [2.12.1] - 2026-07-12

### Fixed
- **Desktop "too many requests" on normal use** — several per-route limiters (`transactionLimiter` at 50/hour on all of `/api/transactions`, `authLimiter`, `uploadLimiter`, `exportLimiter`) and the DB-backed login lockout were not gated for desktop mode, so ordinary browsing/editing tripped a 429. Every rate limiter now skips when `SERVE_FRONTEND_DIR` is set (single local user); hosted deployments keep full protection.

## [2.12.0] - 2026-07-12

### Added
- **AI categorization learns reusable rules** — the `/api/ai/categorize` prompt now also returns a `merchant` (a verbatim substring of the description, validated server-side as an actual substring so the existing substring-based rule engine will match). New `POST /api/ai/apply-categories` applies accepted suggestions and, by default, upserts a `match_rules` row (`target_type='category'`, merchant → category), deduped against existing patterns and within the batch. The Transactions review modal applies via this single endpoint, shows the merchant it will learn, and has a default-on "Save as auto-categorization rules" toggle (an override drops the learned rule). Future imports of the same vendor auto-categorize with no AI call.

## [2.11.0] - 2026-07-12

Diagnosability + AI configuration pass, plus downloadable desktop installers.

### Added
- **Desktop deployment modes** — first-run setup screen (and File → Setup) lets an install run as **Standalone** (embedded Postgres + backend on loopback), **Server** (backend bound to `0.0.0.0` on a chosen port, shows its LAN address for clients), or **Client** (no local DB/backend — a thin window pointed at a server's URL, validated via `/api/health`). Backend now honors a `HOST` bind env var.
- **Encrypted Server ↔ Client transport** — Server mode serves HTTPS with a self-signed cert generated on first run (`selfsigned`, SANs for localhost + LAN IPs, stored `0600` in userData); the backend honors `TLS_CERT_FILE`/`TLS_KEY_FILE`. Clients **pin** the server's leaf certificate (Electron `certificate-error` handler compares the exact cert), record it on first connect, and warn on any change — defeating passive sniffing and MITM. Session cookies gain `Secure` (`COOKIE_SECURE`) when served over TLS.
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
