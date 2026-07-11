'use strict';
// Copy the freshly-built backend, frontend, and base SQL into the electron dir
// so electron-builder bundles them. Run by `npm run dist` before packaging.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const here = __dirname;
const repo = path.join(here, '..');

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dest) {
  rmrf(dest);
  fs.cpSync(src, dest, { recursive: true });
}
// execFile (no shell) with fixed args — avoids any shell interpretation.
function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

console.log('==> Building backend…');
run('npm', ['run', 'build'], path.join(repo, 'backend'));
console.log('==> Building frontend…');
run('npm', ['run', 'build'], path.join(repo, 'frontend'));

console.log('==> Staging build outputs into electron/…');
copyDir(path.join(repo, 'backend', 'dist'), path.join(here, 'backend-dist'));
copyDir(path.join(repo, 'frontend', 'dist'), path.join(here, 'frontend-dist'));

// The forked backend needs its production node_modules on disk next to backend-dist.
copyDir(path.join(repo, 'backend', 'node_modules'), path.join(here, 'backend-dist', 'node_modules'));

// Base schema for first-run provisioning.
fs.mkdirSync(path.join(here, 'db'), { recursive: true });
fs.copyFileSync(path.join(repo, 'database', 'init.sql'), path.join(here, 'db', 'init.sql'));

console.log('==> Staging complete.');
