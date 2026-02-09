# Budget Tracker - GitHub Copilot Instructions

## Build & Run Commands

### Full Stack (Docker)
```bash
docker compose up --build        # Start all services (postgres, backend, frontend)
docker compose build frontend    # Verify frontend compiles (quick check)
docker compose build backend     # Verify backend compiles

# Database access
docker exec -i budget-db psql -U budget_user -d budget_db < database/migration.sql
```

**Docker ports (host:container):** Frontend → 3456:80, Backend API → 5050:5000, PostgreSQL → 5433:5432

### Frontend (from frontend/)
```bash
npm run dev      # Vite dev server on :3000 (proxies /api to backend:5000)
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

### Backend (from backend/)
```bash
npm run dev      # ts-node-dev with hot-reload on :5000
npm run build    # TypeScript compile to dist/
npm start        # Run compiled JS (requires npm run build first)
```

**No test suite exists** — manual testing via Docker.

## Architecture Overview

### Stack
Three-service Docker Compose application:
- **Frontend**: React 18 + Vite + Tailwind → Nginx in production, proxies `/api` to backend
- **Backend**: Express + TypeScript → Direct SQL via `pg` pool (no ORM)
- **Database**: PostgreSQL 15 → Schema in `database/init.sql`, no migration system

### Backend Structure

#### Middleware Chain (Applied to All Routes)
All routes in `backend/src/routes/` use this shared middleware chain:
1. `authMiddleware` — Extracts `userId` from JWT Bearer token
2. `sharingMiddleware` — Resolves `budgetUserId` (the actual data owner) and sets `shareRole`
3. `requireEditAccess` — Blocks writes when `shareRole === 'view'`

**Critical Pattern:** Route handlers MUST use `const budgetUserId = (req as any).budgetUserId` for all data queries — NEVER `req.userId` directly. This ensures shared budget viewing works correctly. When a user views someone else's budget, `budgetUserId` differs from `userId`.

#### Database Layer
- Direct parameterized SQL: `query('SELECT * FROM users WHERE id = $1', [userId])`
- Connection pool configured in `backend/src/config/database.ts`
- Database credentials: User = `budget_user`, Password = `budget_pass`, Database = `budget_db`

#### Authentication
- JWT tokens (7-day expiry)
- Password hashing via bcryptjs (cost 12)
- Optional TOTP MFA via otplib

### Frontend Structure

#### State Management
Three React Context providers (nested in App.jsx):
- `ThemeContext` — Dark/light mode, persisted to localStorage
- `AuthContext` — User object, JWT token in localStorage, login/logout/register
- `BudgetContext` — Active budget owner (for shared budgets), shared budgets list, read-only flag

#### API Client
- Centralized in `frontend/src/api/client.js` (~45 endpoints)
- Automatically attaches JWT Bearer token
- Automatically sends `X-Budget-Owner` header for shared budget viewing

#### Layout System
- `frontend/src/components/Layout.jsx` controls sidebar nav
- Sidebar nav groups defined in `navGroups` array
- Mobile responsive with collapsible menu
- Budget switcher dropdown in top bar (for shared budgets)

## Key Conventions

### Adding a New Page (3-Step Checklist)
1. Create route file in `backend/src/routes/` and register in `backend/src/index.ts`
2. Add API methods to `frontend/src/api/client.js`
3. Create page in `frontend/src/pages/`, add to `navGroups` in `Layout.jsx`, add `<Route>` in `App.jsx`

### Shared Budget Data Flow
When a user views someone else's budget:
1. `BudgetContext` sets `activeBudgetOwner` (the owner's ID)
2. API client sends `X-Budget-Owner: <ownerId>` header with each request
3. Backend `sharingMiddleware` verifies access and sets `budgetUserId` on request
4. Route handlers use `budgetUserId` (not `userId`) to query the correct user's data

### Database Changes
**No migration system exists.** Schema lives in `database/init.sql` (used on fresh `docker compose up`).

For existing databases:
1. Create a migration SQL file in `database/` (e.g., `add_new_feature.sql`)
2. Apply manually: `docker exec -i budget-db psql -U budget_user -d budget_db < database/add_new_feature.sql`

**Common issue:** "relation does not exist" errors mean a table in `init.sql` doesn't exist in your running database. Create and run a migration script.

### Versioning (Keep All 3 in Sync)
When adding features or making significant changes, bump version in:
1. `frontend/src/version.js` (`APP_VERSION` constant)
2. `frontend/src/changelog.js` (in-app changelog array)
3. `CHANGELOG.md` (project root)

**Versioning rules:** Patch (x.x.1) for bug fixes — Minor (x.1.0) for new features — Major (1.0.0) for breaking changes

### Frontend Patterns
- Pages in `frontend/src/pages/` use: `<div className="space-y-6">`, h1 heading, `.card` containers
- Always include Tailwind dark mode classes: `dark:bg-gray-800`, `dark:text-gray-100`, etc.
- Icons from `lucide-react`
- Custom primary color: sky blue (#0ea5e9) referenced as `primary-*` in Tailwind

### Important Data Rule: Income Categories
Income categories can have `exclude_from_income: true` flag. Dashboard queries **must filter these out** when summing total income (prevents one-time windfalls from skewing monthly income calculations).

## Gotchas & Common Issues

### Database Port Exposure (Security)
Development setup exposes PostgreSQL port 5433 → useful for debugging but insecure for production. Before production deployment:
- Remove `ports: ["5433:5432"]` from `docker-compose.yml`
- Use environment variables for credentials (see `.env.example`)
- Consider implementing audit logging for admin actions

### Third Service: Ollama
The docker-compose includes an Ollama service for AI features (model embeddings, text analysis). Backend connects at `http://ollama:11434`. Default model: `mistral`.
