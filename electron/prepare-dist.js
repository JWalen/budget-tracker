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
// Run a fixed command (no user input). On Windows the npm launcher is npm.cmd,
// and Node 20+ refuses to execFile a .cmd/.bat without shell:true (EINVAL), so
// use a shell there. Args are hardcoded literals, so shell use is safe.
const isWin = process.platform === 'win32';
function run(cmd, args, cwd) {
  const bin = cmd === 'npm' ? (isWin ? 'npm.cmd' : 'npm') : cmd;
  execFileSync(bin, args, { cwd, stdio: 'inherit', shell: isWin });
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
