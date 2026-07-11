# Budget Tracker — Desktop app (no Docker)

Runs the whole app as a native macOS window with **no Docker and nothing to install
separately**. Electron starts an embedded PostgreSQL (data stored in your user
Library) and runs the existing backend + UI against it.

## Run it (development)

From the repo root:

```bash
./electron/run-desktop.sh
```

That builds the backend + frontend and launches the app. First launch takes a few
extra seconds while it initialises the local database; subsequent launches are fast.

Or step by step:

```bash
cd backend  && npm run build
cd ../frontend && npm run build
cd ../electron && npm install   # first time only
npm start
```

## How it works

On launch, `main.js`:

1. Loads/generates per-install secrets (JWT/encryption/DB password) in the app's
   `userData` dir — created once, `chmod 600`.
2. Starts embedded PostgreSQL with its data dir under `userData/pgdata`
   (`persistent: true`, so your data survives restarts).
3. On first run, applies `database/init.sql`; the backend's own `runMigrations`
   then applies `schema.sql`.
4. Runs the compiled backend (`backend/dist`) on a random localhost port with
   `SERVE_FRONTEND_DIR` set, so it serves the built UI **and** the API from one
   origin (the relative `/api` calls just work — no proxy).
5. Loads that origin in the app window once `/api/health` is green.

Postgres and the backend are shut down cleanly on quit.

## Where your data lives

`~/Library/Application Support/Budget Tracker/`
  - `pgdata/` — the PostgreSQL database
  - `config.json` — generated secrets (keep private)

Deleting that folder resets the app to a clean slate.

## Package a .dmg

```bash
cd electron && npm run dist
```

Produces a `.dmg` in `electron/release/`. Installing it on **other** Macs additionally
requires Apple code-signing + notarization; running the `.dmg` you built on your own
Mac does not.

## Verify without a window

`node electron/test-boot.mjs` runs the full boot path headlessly (embedded Postgres →
init.sql → backend → served UI → register/login) and prints PASS/FAIL — handy in CI or
when you can't open a GUI.
