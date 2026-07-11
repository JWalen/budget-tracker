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
const { fork } = require('child_process');

const isDev = !app.isPackaged;

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
  const base = path.join(process.resourcesPath, 'app.asar.unpacked');
  return {
    backendEntry: path.join(base, 'backend-dist', 'index.js'),
    frontendDir: path.join(__dirname, 'frontend-dist'),
    initSql: path.join(base, 'database', 'init.sql'),
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

async function startPostgres(cfg) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dataDir = path.join(app.getPath('userData'), 'pgdata');
  const port = await freePort();

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: cfg.dbUser,
    password: cfg.dbPassword,
    port,
    persistent: true,
    authMethod: 'scram-sha-256',
    onLog: () => {},
    onError: (e) => console.error('[pg]', e),
  });

  // initdb only on first launch (no cluster yet).
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) {
    await pg.createDatabase('budget');
    await applyInitSql(cfg, port);
  }
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
  backendProc = fork(backendEntry, [], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  backendProc.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  backendProc.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`));
  backendProc.on('exit', (code) => {
    if (!shuttingDown) {
      dialog.showErrorBox('Budget Tracker', `The backend exited unexpectedly (code ${code}).`);
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
  const loading = new BrowserWindow({
    width: 420, height: 300, resizable: false, frame: false,
    backgroundColor: '#0f172a', title: 'Budget Tracker',
  });
  loading.loadFile(path.join(__dirname, 'loading.html'));

  try {
    const cfg = loadConfig();
    const pgPort = await startPostgres(cfg);
    const apiPort = await freePort();
    startBackend(cfg, pgPort, apiPort);
    await waitForHealth(apiPort);
    createWindow(`http://127.0.0.1:${apiPort}`);
    loading.close();
  } catch (err) {
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

app.whenReady().then(bootstrap);

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
