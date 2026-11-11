import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { buildPwa } from '../scripts/build-pwa.mjs';
import { seal, stage, finalize } from '../scripts/environments/artifacts.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function identity(dir) {
  git(dir, 'config', 'user.name', 'Local isolation test');
  git(dir, 'config', 'user.email', 'test@example.invalid');
}
function candidate(root, environment, sha) {
  const dir = path.join(root, environment + sha[0]);
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const base = environment === 'production' ? '/heibon-mahjong/' : '/heibon-mahjong/dev/';
  const url = `https://heibon-mahjong-online${environment === 'production' ? '' : '-dev'}.test.workers.dev`;
  writeFileSync(path.join(dir, 'index.html'), `<script src="${base}assets/app.js"></script>`);
  writeFileSync(path.join(dir, 'assets/app.js'), JSON.stringify(url));
  writeFileSync(path.join(dir, 'assets/app.css'), 'body{}');
  writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify({ icons: [] }));
  buildPwa(dir, environment);
  seal(dir, environment, sha, url);
  return dir;
}

test('concurrent Git writers cannot overwrite verified snapshots or bypass pending publication', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'heibon-issue47-race-'));
  try {
    const remote = path.join(root, 'remote.git');
    const seed = path.join(root, 'seed');
    mkdirSync(seed);
    git(root, 'init', '--bare', remote);
    git(seed, 'init', '-b', 'pages-verified');
    identity(seed);
    writeFileSync(path.join(seed, 'state.json'), JSON.stringify({ version: 1, current: {}, pending: null }));
    const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
    const production = candidate(root, 'production', a);
    const development = candidate(root, 'development', b);
    const nextProduction = candidate(root, 'production', c);
    stage(seed, production, a);
    finalize(seed);
    git(seed, 'add', '.');
    git(seed, 'commit', '-m', 'Verified bootstrap');
    git(seed, 'remote', 'add', 'origin', remote);
    git(seed, 'push', 'origin', 'pages-verified');

    const first = path.join(root, 'first'), second = path.join(root, 'second');
    for (const dir of [first, second]) {
      git(root, 'clone', '--branch', 'pages-verified', remote, dir);
      identity(dir);
    }
    stage(first, development, b);
    git(first, 'add', '.');
    git(first, 'commit', '-m', 'Pending development');
    git(first, 'push', 'origin', 'pages-verified');

    stage(second, nextProduction, c);
    git(second, 'add', '.');
    git(second, 'commit', '-m', 'Concurrent pending production');
    assert.throws(() => git(second, 'push', 'origin', 'pages-verified'), error => {
      assert.match(error.stderr.toString(), /rejected/);
      return true;
    });
    const state = JSON.parse(git(root, '--git-dir', remote, 'show', 'pages-verified:state.json'));
    assert.equal(state.current.production.sha, a);
    assert.equal(state.pending.current.production.sha, a);
    assert.equal(state.pending.current.development.sha, b);
    assert.throws(() => stage(first, nextProduction, c), /pending/);
    // The workflow's failing push step stops before any Pages deployment action.
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
