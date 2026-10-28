import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { classifyChanges } from '../.github/scripts/classify-changes.mjs';

const deployWorkflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const browserWorkflow = readFileSync(new URL('../.github/workflows/browser-ui.yml', import.meta.url), 'utf8');

test('markdown-only changes skip the application suite and deployment', () => {
  assert.deepEqual(classifyChanges(['docs/ci.md']), {
    run_full_suite: 'false', deploy_required: 'false', changed_count: '1', classification: 'docs-only',
  });
});

test('application plus markdown changes run all checks and remain deployable', () => {
  const result = classifyChanges(['src/app.ts', 'docs/ci.md']);
  assert.equal(result.run_full_suite, 'true');
  assert.equal(result.deploy_required, 'true');
});

test('renamed code detected as old and new paths does not look documentation-only', () => {
  const result = classifyChanges(['src/old.ts', 'docs/renamed.md']);
  assert.equal(result.run_full_suite, 'true');
  assert.equal(result.deploy_required, 'true');
});

test('test code and workflow changes run all checks without publishing the application', () => {
  for (const file of ['tests/example.test.ts', '.github/workflows/check.yml', 'package.json']) {
    const result = classifyChanges([file]);
    assert.equal(result.run_full_suite, 'true', file);
    assert.equal(result.deploy_required, 'false', file);
  }
});

test('unknown files fail safe by running all checks and allowing the release gate', () => {
  const result = classifyChanges(['new-unknown-config.bin']);
  assert.equal(result.run_full_suite, 'true');
  assert.equal(result.deploy_required, 'true');
});

test('missing or empty diffs fail safe', () => {
  for (const result of [classifyChanges([], true), classifyChanges([], false)]) {
    assert.equal(result.run_full_suite, 'true');
    assert.equal(result.deploy_required, 'true');
  }
});

test('production deployment requires successful full verification and Browser UI', () => {
  const workerJob = deployWorkflow.match(/  deploy-worker:\n([\s\S]*?)\n  production-test:/)?.[1] ?? '';
  assert.match(workerJob, /needs: \[detect-changes, verify, browser-ui\]/);
  assert.match(workerJob, /needs\.verify\.result == 'success'/);
  assert.match(workerJob, /needs\.browser-ui\.result == 'success'/);
  assert.match(workerJob, /needs\.detect-changes\.outputs\.deploy_required == 'true'/);
  assert.match(deployWorkflow, /deploy_to_production:\n[\s\S]*default: false/);
  assert.doesNotMatch(deployWorkflow, /paths-ignore:/);
  assert.doesNotMatch(browserWorkflow, /paths-ignore:/);
  assert.doesNotMatch(deployWorkflow, /test:file|test:browser/);
});
