import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, renameSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathImpact, planPublication } from '../.github/scripts/publication-plan.mjs';

test('current Worker import graph never classifies a shared dependency as Pages only', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const seen = new Set();
  const pending = ['worker/index.ts', 'worker/development.ts'];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      const dependency = path.relative(root, path.resolve(root, path.dirname(file), match[1])).split(path.sep).join('/');
      if (!existsSync(path.join(root, dependency))) throw new Error(`Unresolved Worker dependency ${file}: ${match[1]}`);
      pending.push(dependency);
    }
  }
  for (const file of seen) {
    if (file.startsWith('src/')) assert.equal(pathImpact(file), 'both', `Worker dependency ${file}`);
  }
});

test('classifies product and tooling changes, including shared transitive imports', () => {
  for (const [file, expected] of Object.entries({ 'src/style.css': 'pages', 'src/online/waiting-room.ts': 'pages', 'public/sw.js': 'pages', 'worker/room.ts': 'worker', 'src/analysis/score.ts': 'both', 'src/game/cpu.ts': 'both', 'src/online/protocol.ts': 'both', 'docs/a.md': 'none', 'tests/a.ts': 'none', 'package-lock.json': 'both', '.github/scripts/publication-plan.mjs': 'none', 'scripts/environments/artifacts.mjs': 'pages', 'new-file': 'unknown' })) assert.equal(pathImpact(file), expected, file);
  assert.equal(pathImpact('wrangler.development.jsonc', 'production'), 'none');
  assert.equal(pathImpact('wrangler.development.jsonc', 'development'), 'worker');
  assert.equal(pathImpact('worker/development.ts', 'production'), 'none');
  assert.equal(pathImpact('worker/development.ts', 'development'), 'worker');
  assert.equal(pathImpact('.github/scripts/unclassified.mjs'), 'unknown');
  for (const file of ['src/environment.ts', 'src/online/diagnostics.ts', 'src/rendering/pending-discard.ts']) assert.equal(pathImpact(file), 'both', file);
  assert.equal(pathImpact('scripts/environments/unknown.mjs'), 'unknown');
});

test('directly compares each successful tree and records deferred independent changes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'publication-plan-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const run = (cmd, args, options) => execFileSync(cmd, args, { ...options, cwd: dir });
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
    writeFileSync(path.join(dir, 'index.html'), 'v1'); git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    writeFileSync(path.join(dir, 'index.html'), 'v2'); git('commit', '-qam', 'ui'); const ui = git('rev-parse', 'HEAD');
    mkdirSync(path.join(dir, 'worker')); writeFileSync(path.join(dir, 'worker', 'index.ts'), 'worker'); git('add', '.'); git('commit', '-qm', 'worker'); const both = git('rev-parse', 'HEAD');
    const options = { environment: 'production', candidate: ui, pagesBase: base, workerBase: base, git: run };
    assert.equal(planPublication({ ...options, candidate: both }).classification, 'both');
    assert.equal(planPublication({ ...options, candidate: both, pagesBase: ui }).classification, 'worker');
    assert.equal(planPublication(options).classification, 'pages');
    assert.deepEqual(planPublication({ ...options, candidate: both, target: 'worker' }), { classification: 'both', selected: 'worker', blocked: false, pages: false, worker: true, pagesPending: true, workerPending: true, pagesDeferred: true, workerDeferred: false, onlineVerification: true });
    const pagesOnly = planPublication({ ...options, candidate: both, target: 'pages' });
    assert.equal(pagesOnly.workerDeferred, true);
    assert.equal(pagesOnly.worker, false);
    assert.equal(planPublication({ ...options, candidate: both, target: 'none' }).pagesDeferred, true);
    assert.equal(planPublication({ ...options, git: () => { throw new Error('git failed'); } }).reason, 'unreliable-baseline');
    assert.equal(planPublication({ ...options, candidate: base, pagesBase: base, workerBase: base }).classification, 'none');
    assert.equal(planPublication({ ...options, environment: 'development' }).classification, 'pages');
    assert.equal(planPublication({ ...options, pagesBase: '' }).classification, 'unknown');
    assert.equal(planPublication({ ...options, pagesBase: 'f'.repeat(40) }).reason, 'unreliable-baseline');
    // Neither of these two commit trees is an ancestor of the other.
    git('checkout', '-q', '--detach', base); writeFileSync(path.join(dir, 'index.html'), 'other'); git('commit', '-qam', 'other'); const other = git('rev-parse', 'HEAD');
    assert.equal(planPublication({ ...options, candidate: other, pagesBase: both, workerBase: both }).classification, 'both');
    renameSync(path.join(dir, 'index.html'), path.join(dir, 'unclassified')); git('add', '-A'); git('commit', '-qm', 'rename'); const moved = git('rev-parse', 'HEAD');
    assert.equal(planPublication({ ...options, candidate: moved }).reason, 'unknown-path');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
