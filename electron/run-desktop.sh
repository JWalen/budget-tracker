#!/bin/bash
# Build the backend + frontend, then launch the Budget Tracker desktop app
# (Electron + embedded Postgres — no Docker required).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building backend…"
( cd "$ROOT/backend" && npm run build )

echo "==> Building frontend…"
( cd "$ROOT/frontend" && npm run build )

echo "==> Launching desktop app…"
( cd "$ROOT/electron" && npm start )
