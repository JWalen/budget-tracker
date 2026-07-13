# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

The app ships as an **Electron desktop app** with embedded PostgreSQL (no Docker).

```bash
# Frontend (from frontend/)
npm run dev                      # Vite dev server on :3000 (proxies /api to backend:5000)
npm run build                    # Production build to dist/

# Backend (from backend/)
npm run dev                      # ts-node-dev with hot-reload (needs a local Postgres; set DATABASE_URL)
npm run build                    # TypeScript compile to dist/
npm start                        # Run compiled JS (dist/index.js)
npm test                         # Jest integration tests (needs a Postgres; CI runs a service)

# Desktop app (from electron/)
npm start                        # Launch the Electron app in dev (spins up embedded Postgres)
npm run dist:mac                 # Build the macOS .dmg (electron-builder)
npm run dist:win                 # Build the Windows .exe
```

Tagging `v*` triggers `.github/workflows/build-desktop.yml`, which builds the
Mac/Windows installers and publishes them to a GitHub Release.

## Architecture

**Frontend** (React 18 + Vite + Tailwind) — built to static files, served by the
backend in the desktop app (same origin, relative `/api`).
**Backend** (Express + TypeScript) — direct SQL via the `pg` pool, no ORM.
**Database** (PostgreSQL 15) — **embedded** (`embedded-postgres`) in the desktop
app, data under the app's userData dir; base schema in `database/init.sql`, additive
bootstrap in `backend/src/db/schema.sql`.

The Electron shell (`electron/main.js`) starts the embedded Postgres and the
compiled backend, then loads the served frontend. Deployment modes (Standalone /
Server / Client) are chosen on first run.

### Backend structure

All routes in `backend/src/routes/` use a shared middleware chain:
1. `authMiddleware` — extracts `userId` from JWT Bearer token
2. `sharingMiddleware` — resolves `budgetUserId` (the actual data owner, which differs from `userId` when viewing a shared budget) and sets `shareRole`
3. `requireEditAccess` — blocks writes when `shareRole === 'view'`

**Critical pattern:** Route handlers must use `const budgetUserId = (req as any).budgetUserId` for all data queries — never `req.userId` directly — so shared budget viewing works correctly.

Database queries use parameterized SQL directly: `query('SELECT * FROM users WHERE id = $1', [userId])`. Connection pool configured in `backend/src/config/database.ts`.

Auth: JWT (7-day expiry), bcryptjs (cost 12), optional TOTP MFA via otplib.

### Frontend structure

**State management** via three React Context providers (nested in App.jsx):
- `ThemeContext` — dark/light mode, persisted to localStorage
- `AuthContext` — user object, JWT token in localStorage, login/logout/register
- `BudgetContext` — active budget owner (for shared budget viewing), shared budgets list, read-only flag

**API client** (`frontend/src/api/client.js`) — centralized fetch wrapper with ~45 endpoints. Automatically attaches JWT Bearer token and `X-Budget-Owner` header for shared budgets.

**Layout** (`frontend/src/components/Layout.jsx`) — sidebar with nav groups (`navGroups` array), mobile responsive menu, budget switcher dropdown, user avatar menu in top bar.

### Key data flow for shared budgets

When a user views someone else's budget, `BudgetContext` sets `activeBudgetOwner`. The API client sends the owner's ID via `X-Budget-Owner` header. Backend `sharingMiddleware` verifies access and sets `budgetUserId` on the request, so all route handlers query against the correct user's data.

### Adding a new page (3-step checklist)

1. Create route file in `backend/src/routes/` and register in `backend/src/index.ts`
2. Add API methods to `frontend/src/api/client.js`
3. Create page in `frontend/src/pages/`, add to `navGroups` in `Layout.jsx`, add `<Route>` in `App.jsx`

### Database changes

The schema is applied automatically on backend startup. `backend/src/db/schema.sql` is an
**idempotent** bootstrap (all `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` /
`ON CONFLICT`) run by `backend/src/config/runMigrations.ts` before the server listens. It is
safe to run on every boot against both fresh and existing databases, and it converges the two
(it also backfills a personal Household per user and drops the legacy `budget_shares` table).

To add a table/column: add it to `backend/src/db/schema.sql` using `IF NOT EXISTS` semantics
so the change applies cleanly to existing databases on the next restart. (`database/init.sql`
still seeds the base tables via the Postgres docker-entrypoint on first init; `schema.sql` is
the source of truth for everything additive.) The build copies `schema.sql` into `dist/db/`.

Common issues:
- **"relation does not exist" errors** — The table is missing; add it to `schema.sql` (IF NOT
  EXISTS) and restart the backend so the bootstrap creates it.
- **Database credentials:** User = `budget_user`, Password = `budget_pass`, Database = `budget_db`

### Shared budgets / Households

Budget sharing is modeled on **Households** (the `organizations` / `organization_members`
tables). `sharingMiddleware` resolves `budgetUserId` by checking whether the caller and the
`X-Budget-Owner` target are members of the same household (role `viewer` → `view`, else
`edit`). The legacy `budget_shares` table and `/api/sharing` invite/accept endpoints were
removed; household membership is managed via `/api/organizations`.

## Versioning

- Version lives in three places — keep all in sync:
  - `frontend/src/version.js` (`APP_VERSION` constant)
  - `frontend/src/changelog.js` (in-app changelog array)
  - `CHANGELOG.md` (project root)
- When a feature is added or a significant change is made, bump the version and update all three files
- **Patch** (x.x.1): bug fixes — **Minor** (x.1.0): new features — **Major** (1.0.0): breaking changes

## Conventions

- Pages go in `frontend/src/pages/` using the pattern: `<div className="space-y-6">`, h1 heading, `.card` containers, Tailwind dark mode classes
- Icons from `lucide-react`
- Sidebar nav groups defined in `Layout.jsx` (`navGroups` array) — add new pages there and in `App.jsx` routes
- Tailwind dark mode is class-based — always include `dark:` variants for colors/backgrounds
- Custom primary color palette is sky blue (#0ea5e9), referenced as `primary-*` in Tailwind classes
- Income categories can have `exclude_from_income: true` — dashboard queries must filter these out when summing income

## Security Considerations

The desktop app is self-contained, so the old Docker/hosted concerns (exposed DB
port, shared default credentials) don't apply. What's in place today:

- **Per-install secrets** — `electron/main.js` generates a random DB password,
  JWT secret, refresh secret, and encryption key on first run (stored `0600` in
  userData); no shared defaults ship.
- **Embedded Postgres binds loopback** in Standalone mode; **Server mode** serves
  HTTPS with a self-signed cert that clients pin (see `main.js` cert-error handler).
- **Auth**: JWT (HS256 pinned, issuer/audience/type), bcryptjs (cost 12), optional
  TOTP MFA; refresh tokens hashed at rest; login lockout (skipped in desktop).
- **Rate limiting** on hosted deployments (all limiters skipped in desktop mode —
  single local user).
- **Admin actions & errors** are recorded to the `error_logs` table (Admin → Error Log).

The `database/init.sql` default credentials (`budget_user`/`budget_pass`) are for a
local dev Postgres only; the desktop app never uses them.
