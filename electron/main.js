'use strict';
// Budget Tracker desktop shell.
//
// On launch this: (1) loads/generates persistent secrets in userData, (2) starts
// an embedded PostgreSQL whose data lives in userData (no Docker, no server to
// install), (3) runs the existing compiled backend against it — the backend also
// serves the built frontend from the same origin — and (4) loads that origin in a
// window. On quit it shuts the backend and Postgres down cleanly.

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const { fork } = require('child_process');

const isDev = !app.isPackaged;

// Pin the app name so the data directory (~/Library/Application Support/Budget
// Tracker) is identical whether launched in dev (npm start) or from the packaged
// app — otherwise your data would live under two different folders.
app.setName('Budget Tracker');

// Packaged apps have no visible stdout, so mirror startup diagnostics to a file
// next to the app data. Falls back to the OS temp dir before userData is ready.
let LOG_FILE = path.join(os.tmpdir(), 'budget-tracker-desktop.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(' ')}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  console.log(...args);
}
process.on('uncaughtException', (e) => { log('uncaughtException:', e && e.stack || e); });
process.on('unhandledRejection', (e) => { log('unhandledRejection:', e && e.stack || e); });

// --- paths -----------------------------------------------------------------
// In dev we point at the sibling backend/frontend build outputs; packaged builds
// copy them next to this file (electron-builder `files`) and unpack what must run
// from real disk (see asarUnpack in package.json).
function resolvePaths() {
  if (isDev) {
    const repo = path.join(__dirname, '..');
    return {
      backendEntry: path.join(repo, 'backend', 'dist', 'index.js'),
      frontendDir: path.join(repo, 'frontend', 'dist'),
      initSql: path.join(repo, 'database', 'init.sql'),
    };
  }
  // Packaged: shipped via electron-builder `extraResources` (copied verbatim,
  // preserving the backend's nested node_modules) into Contents/Resources/.
  return {
    backendEntry: path.join(process.resourcesPath, 'backend-dist', 'index.js'),
    frontendDir: path.join(process.resourcesPath, 'frontend-dist'),
    initSql: path.join(process.resourcesPath, 'db', 'init.sql'),
  };
}

let pg = null;
let backendProc = null;
let mainWindow = null;
let shuttingDown = false;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function loadConfig() {
  const cfgPath = path.join(app.getPath('userData'), 'config.json');
  if (fs.existsSync(cfgPath)) {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  }
  const cfg = {
    dbUser: 'budget',
    dbPassword: crypto.randomBytes(24).toString('hex'),
    jwtSecret: crypto.randomBytes(48).toString('hex'),
    jwtRefreshSecret: crypto.randomBytes(48).toString('hex'),
    encryptionKey: crypto.randomBytes(32).toString('hex'),
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfg;
}

// Recover from an unclean shutdown (force-quit / crash / power loss). A leftover
// postmaster.pid stops Postgres from starting; if it belongs to a still-running
// orphaned postmaster (a previous instance's DB), stop it — the single-instance
// lock guarantees no *legitimate* second instance, so any live postmaster here is
// an orphan. Then remove the stale lock so a clean start can proceed.
function recoverDataDir(dataDir) {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return;
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').split('\n')[0].trim(), 10);
    if (pid > 0) {
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch { alive = false; }
      if (alive) {
        log('Terminating orphaned Postgres from a previous run, pid', pid);
        try { process.kill(pid, 'SIGTERM'); } catch {}
        // Give it a moment to release the data dir.
        const until = Date.now() + 5000;
        while (Date.now() < until) {
          try { process.kill(pid, 0); } catch { break; }
        }
      }
    }
  } catch (e) {
    log('recoverDataDir error (continuing):', e && e.message);
  }
  try { fs.rmSync(pidFile, { force: true }); } catch {}
}

// Probe a real connection so we only fork the backend once Postgres actually
// accepts queries — a resolved start() isn't always the same as "ready".
async function waitForPgReady(cfg, port, timeoutMs = 20000) {
  const { Client } = require('pg');
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    const client = new Client({ host: '127.0.0.1', port, user: cfg.dbUser, password: cfg.dbPassword, database: 'budget' });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch (e) {
      lastErr = e;
      try { await client.end(); } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`Postgres did not accept connections in time: ${lastErr && lastErr.message}`);
}

async function startPostgres(cfg) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dataDir = path.join(app.getPath('userData'), 'pgdata');
  const port = await freePort();
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  // Clean up after any unclean shutdown before starting.
  if (!firstRun) recoverDataDir(dataDir);

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: cfg.dbUser,
    password: cfg.dbPassword,
    port,
    persistent: true,
    authMethod: 'scram-sha-256',
    onLog: () => {},
    onError: (e) => log('[pg]', e && e.message ? e.message : e),
  });

  if (firstRun) await pg.initialise();
  try {
    await pg.start();
  } catch (e) {
    // A dirty data dir can fail the first start; recover the lock and retry once.
    log('pg.start failed, recovering and retrying:', e && e.message);
    recoverDataDir(dataDir);
    await pg.start();
  }
  if (firstRun) {
    await pg.createDatabase('budget');
    await applyInitSql(cfg, port);
  }
  // Don't fork the backend until Postgres truly answers queries.
  await waitForPgReady(cfg, port);
  return port;
}

// A fresh embedded Postgres has no tables. Apply the base schema (init.sql) once;
// the backend's own runMigrations then layers schema.sql on top at boot.
async function applyInitSql(cfg, port) {
  const { initSql } = resolvePaths();
  if (!fs.existsSync(initSql)) return;
  const { Client } = require('pg');
  const client = new Client({
    host: '127.0.0.1', port, user: cfg.dbUser, password: cfg.dbPassword, database: 'budget',
  });
  await client.connect();
  try {
    await client.query(fs.readFileSync(initSql, 'utf-8'));
  } finally {
    await client.end();
  }
}

function startBackend(cfg, pgPort, apiPort) {
  const { backendEntry, frontendDir } = resolvePaths();
  const env = {
    ...process.env,
    // NOT 'production' on purpose: over Electron's http://127.0.0.1 a Secure
    // cookie would not be sent, breaking the refresh-token flow. Secrets are
    // strong random values regardless of NODE_ENV.
    NODE_ENV: 'development',
    PORT: String(apiPort),
    DATABASE_URL: `postgresql://${cfg.dbUser}:${encodeURIComponent(cfg.dbPassword)}@127.0.0.1:${pgPort}/budget`,
    JWT_SECRET: cfg.jwtSecret,
    JWT_REFRESH_SECRET: cfg.jwtRefreshSecret,
    ENCRYPTION_KEY: cfg.encryptionKey,
    SERVE_FRONTEND_DIR: frontendDir,
    LOG_TO_FILE: 'false',
    LOG_TO_CONSOLE: 'true',
  };
  // Run the backend with a writable working directory. Launched from Finder the
  // inherited cwd is "/" (read-only), which breaks any cwd-relative file access.
  backendProc = fork(backendEntry, [], {
    env,
    cwd: app.getPath('userData'),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  // Mirror the backend's output into the desktop log so a packaged-app failure
  // (no visible stdout) is always diagnosable; keep the last lines for the dialog.
  let recentOutput = '';
  const capture = (d) => {
    const s = `[backend] ${d}`;
    process.stdout.write(s);
    try { fs.appendFileSync(LOG_FILE, s); } catch {}
    recentOutput = (recentOutput + d).slice(-2000);
  };
  backendProc.stdout?.on('data', capture);
  backendProc.stderr?.on('data', capture);
  backendProc.on('exit', (code) => {
    log('backend exited with code', code);
    if (!shuttingDown) {
      dialog.showErrorBox(
        'Budget Tracker',
        `The backend stopped unexpectedly (code ${code}).\n\nRecent output:\n${recentOutput.slice(-600)}\n\nA log is at:\n${LOG_FILE}`
      );
      app.quit();
    }
  });
}

function waitForHealth(apiPort, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: '127.0.0.1', port: apiPort, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error('Backend did not become healthy in time'));
      setTimeout(tryOnce, 500);
    };
    tryOnce();
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'Budget Tracker',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // Open external links in the system browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith('http')) shell.openExternal(u);
    return { action: 'deny' };
  });
  mainWindow.loadURL(url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function bootstrap() {
  try { LOG_FILE = path.join(app.getPath('userData'), 'desktop.log'); } catch {}
  log('bootstrap start; isDev=', isDev, 'resourcesPath=', process.resourcesPath);
  log('paths=', JSON.stringify(resolvePaths()));
  const loading = new BrowserWindow({
    width: 420, height: 300, resizable: false, frame: false,
    backgroundColor: '#0f172a', title: 'Budget Tracker',
  });
  loading.loadFile(path.join(__dirname, 'loading.html'));

  try {
    const cfg = loadConfig();
    log('config loaded');
    const pgPort = await startPostgres(cfg);
    log('postgres started on', pgPort);
    const apiPort = await freePort();
    startBackend(cfg, pgPort, apiPort);
    log('backend forked on', apiPort);
    await waitForHealth(apiPort);
    log('backend healthy; loading window');
    createWindow(`http://127.0.0.1:${apiPort}`);
    loading.close();
  } catch (err) {
    log('STARTUP FAILED:', err && err.stack || err);
    loading.close();
    dialog.showErrorBox('Budget Tracker — startup failed', String(err && err.stack || err));
    app.quit();
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try { backendProc?.kill('SIGTERM'); } catch {}
  try { if (pg) await pg.stop(); } catch (e) { console.error('pg stop error', e); }
}

// Single-instance lock: a second launch would start another embedded Postgres
// against the same data directory and conflict/corrupt it. Refuse the second
// instance and focus the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(bootstrap);
}

app.on('window-all-closed', async () => {
  await shutdown();
  app.quit();
});
app.on('before-quit', async (e) => {
  if (!shuttingDown) { e.preventDefault(); await shutdown(); app.quit(); }
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !shuttingDown) bootstrap();
});
