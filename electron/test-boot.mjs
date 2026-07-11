// Headless verification of the desktop boot path (no Electron window, no Docker):
// embedded Postgres -> init.sql -> compiled backend (serving the frontend) ->
// health -> API + served UI + a real register/login. Uses a throwaway temp dir.
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { fork } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = path.join(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-desktop-'));
const dataDir = path.join(tmp, 'pgdata');
let pg, backend;
const results = [];
const rec = (n, ok, d = '') => { results.push([n, ok, d]); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' — ' + d : ''}`); };

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const get = (port, p, opts = {}) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method: opts.method || 'GET', headers: opts.headers, timeout: 5000 }, (r) => {
    let b = ''; r.on('data', (c) => b += c); r.on('end', () => resolve({ status: r.statusCode, body: b, headers: r.headers }));
  });
  req.on('error', () => resolve({ status: 0, body: '' }));
  req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
  if (opts.body) req.write(opts.body);
  req.end();
});
const waitHealth = async (port) => { for (let i = 0; i < 60; i++) { const r = await get(port, '/api/health'); if (r.status === 200) return true; await new Promise(s => setTimeout(s, 500)); } return false; };

try {
  const cfg = { dbUser: 'budget', dbPassword: crypto.randomBytes(12).toString('hex'),
    jwtSecret: crypto.randomBytes(48).toString('hex'), jwtRefreshSecret: crypto.randomBytes(48).toString('hex'),
    encryptionKey: crypto.randomBytes(32).toString('hex') };
  const pgPort = await freePort();

  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: cfg.dbUser, password: cfg.dbPassword, port: pgPort, persistent: true, authMethod: 'scram-sha-256', onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('budget');
  rec('embedded Postgres started + budget DB created', true, `port ${pgPort}`);

  const client = new Client({ host: '127.0.0.1', port: pgPort, user: cfg.dbUser, password: cfg.dbPassword, database: 'budget' });
  await client.connect();
  await client.query(fs.readFileSync(path.join(repo, 'database', 'init.sql'), 'utf-8'));
  const tbl = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
  await client.end();
  rec('init.sql applied (base tables)', tbl.rows[0].n >= 20, `${tbl.rows[0].n} tables`);

  const apiPort = await freePort();
  backend = fork(path.join(repo, 'backend', 'dist', 'index.js'), [], {
    env: { ...process.env, NODE_ENV: 'development', PORT: String(apiPort),
      DATABASE_URL: `postgresql://${cfg.dbUser}:${encodeURIComponent(cfg.dbPassword)}@127.0.0.1:${pgPort}/budget`,
      JWT_SECRET: cfg.jwtSecret, JWT_REFRESH_SECRET: cfg.jwtRefreshSecret, ENCRYPTION_KEY: cfg.encryptionKey,
      SERVE_FRONTEND_DIR: path.join(repo, 'frontend', 'dist'), LOG_TO_FILE: 'false', LOG_TO_CONSOLE: 'true' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  rec('backend became healthy (schema.sql migrations ran)', await waitHealth(apiPort), `api port ${apiPort}`);

  // Served frontend (same origin as /api)
  const index = await get(apiPort, '/');
  rec('frontend index.html served from backend', index.status === 200 && index.body.includes('<div id="root">'), `status ${index.status}`);
  const asset = index.body.match(/\/assets\/[^"']+\.js/);
  if (asset) { const a = await get(apiPort, asset[0]); rec('frontend JS asset served', a.status === 200, `${asset[0]} -> ${a.status}`); }

  // Real auth round-trip against the embedded DB
  const email = `desktop_${Date.now()}@test.local`;
  const reg = await get(apiPort, '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'DesktopTest!2026x', name: 'Desktop' }) });
  const token = reg.status === 201 ? JSON.parse(reg.body).accessToken : null;
  rec('register works against embedded Postgres', !!token, `status ${reg.status}`);
  if (token) {
    const me = await get(apiPort, '/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    rec('authenticated request works', me.status === 200, `getMe ${me.status}`);
  }
} catch (e) {
  rec('boot sequence', false, String(e && e.stack || e));
} finally {
  try { backend?.kill('SIGTERM'); } catch {}
  try { if (pg) await pg.stop(); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

const passed = results.filter(r => r[1]).length;
console.log(`\n${'='.repeat(50)}\nDESKTOP BOOT: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
