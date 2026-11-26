import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, renameSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathImpact, planPublication } from '../.github/scripts/publication-plan.mjs';

test('classifies shared, isolated, non-release and uncertain paths conservatively', () => {
  for (const [file, expected] of Object.entries({ 'src/style.css': 'pages', 'public/sw.js': 'pages', 'worker/room.ts': 'worker', 'src/game/cpu.ts': 'both', 'src/online/protocol.ts': 'both', 'docs/a.md': 'none', 'tests/a.ts': 'none', 'package-lock.json': 'unknown', '.github/workflows/deploy.yml': 'unknown', 'new-file': 'unknown' })) assert.equal(pathImpact(file), expected, file);
});

test('compares each successful SHA, protects manual targets and blocks uncertain compatibility', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'publication-plan-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const run = (cmd, args, options) => execFileSync(cmd, args, { ...options, cwd: dir });
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
    writeFileSync(path.join(dir, 'index.html'), 'v1'); git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    writeFileSync(path.join(dir, 'index.html'), 'v2'); git('commit', '-qam', 'ui'); const ui = git('rev-parse', 'HEAD');
    mkdirSync(path.join(dir, 'worker')); writeFileSync(path.join(dir, 'worker', 'index.ts'), 'worker'); git('add', '.'); git('commit', '-qm', 'worker'); const both = git('rev-parse', 'HEAD');
    const options = { environment: 'production', candidate: ui, pagesBase: base, workerBase: base, git: run };
    assert.equal(planPublication({ ...options, candidate: both, compatibility: true }).classification, 'both');
    assert.equal(planPublication({ ...options, candidate: both, pagesBase: ui, compatibility: true }).classification, 'worker');
    assert.equal(planPublication(options).reason, 'compatibility-unconfirmed');
    assert.equal(planPublication({ ...options, compatibility: true }).classification, 'pages');
    assert.equal(planPublication({ ...options, target: 'worker', compatibility: true }).reason, 'required-target-excluded');
    renameSync(path.join(dir, 'index.html'), path.join(dir, 'unclassified')); git('add', '-A'); git('commit', '-qm', 'rename'); const moved = git('rev-parse', 'HEAD');
    assert.equal(planPublication({ ...options, candidate: moved }).reason, 'unknown-path');
    assert.equal(planPublication({ ...options, pagesBase: moved }).reason, 'unreliable-baseline');
    assert.equal(planPublication({ ...options, pagesBase: '' }).classification, 'unknown');
    assert.equal(planPublication({ ...options, candidate: base, pagesBase: base, workerBase: base }).classification, 'none');
    assert.equal(planPublication({ ...options, environment: 'development', compatibility: true }).classification, 'pages');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
