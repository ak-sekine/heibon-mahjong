import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { classifyChanges, decideDeployment } from '../.github/scripts/classify-changes.mjs';

const deployWorkflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const browserWorkflow = readFileSync(new URL('../.github/workflows/browser-ui.yml', import.meta.url), 'utf8');
const deploymentStateScript = readFileSync(new URL('../.github/scripts/deployment-state.mjs', import.meta.url), 'utf8');

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
  const pagesJob = deployWorkflow.match(/  pages-deploy:\n([\s\S]*)$/)?.[1] ?? '';
  assert.match(workerJob, /needs: \[detect-changes, verify, browser-ui, release-freshness\]/);
  assert.match(workerJob, /needs\.verify\.result == 'success'/);
  assert.match(workerJob, /needs\.browser-ui\.result == 'success'/);
  assert.match(workerJob, /needs\.detect-changes\.outputs\.deploy_required == 'true'/);
  assert.match(pagesJob, /uses: actions\/checkout@v4[\s\S]*Record successful GitHub Pages deployment SHA/);
  assert.match(deployWorkflow, /deploy_to_production:\n[\s\S]*default: false/);
  assert.doesNotMatch(deployWorkflow, /paths-ignore:/);
  assert.doesNotMatch(browserWorkflow, /paths-ignore:/);
  assert.doesNotMatch(deployWorkflow, /test:file|test:browser/);
});

const released = {
  stateReliable: true,
  workerSha: '1'.repeat(40),
  pagesSha: '1'.repeat(40),
};

test('required recovery scenarios: app changes require a verified deployment', () => {
  const app = decideDeployment({ ...released, currentFiles: ['src/main.ts'], workerFiles: ['src/main.ts'], pagesFiles: ['src/main.ts'] });
  assert.equal(app.run_full_suite, 'true');
  assert.equal(app.deploy_required, 'true');

  const failedVerification = app;
  assert.match(deployWorkflow, /needs\.verify\.result == 'success'/);
  assert.match(deployWorkflow, /needs\.browser-ui\.result == 'success'/);
  assert.equal(failedVerification.deploy_required, 'true');
  const deployJobEnabled = (verify, browserUi) =>
    failedVerification.deploy_required === 'true' && verify === 'success' && browserUi === 'success';
  assert.equal(deployJobEnabled('failure', 'success'), false);
  assert.equal(deployJobEnabled('success', 'failure'), false);
  assert.equal(deployJobEnabled('success', 'success'), true);
});

test('test-only recovery commit picks up an app change missed by a failed run', () => {
  const recovery = decideDeployment({
    ...released,
    currentFiles: ['tests/button-colors.test.ts'],
    workerFiles: ['src/style.css', 'tests/button-colors.test.ts'],
    pagesFiles: ['src/style.css', 'tests/button-colors.test.ts'],
  });
  assert.equal(recovery.run_full_suite, 'true');
  assert.equal(recovery.deploy_required, 'true');
  assert.equal(recovery.pending_release, 'true');
});

test('docs-only update cannot publish pending code without full verification', () => {
  const docsRecovery = decideDeployment({
    ...released,
    currentFiles: ['docs/notes.md'],
    workerFiles: ['src/style.css'],
    pagesFiles: ['src/style.css'],
  });
  assert.equal(docsRecovery.run_full_suite, 'true');
  assert.equal(docsRecovery.deploy_required, 'true');
  assert.match(deployWorkflow, /needs\.verify\.result == 'success'/);
  const deployJobEnabled = (verify, browserUi) =>
    docsRecovery.deploy_required === 'true' && verify === 'success' && browserUi === 'success';
  assert.equal(deployJobEnabled('failure', 'success'), false);
});

test('docs-only after complete deployment skips full checks and deployment', () => {
  const docs = decideDeployment({ ...released, currentFiles: ['docs/notes.md'] });
  assert.equal(docs.run_full_suite, 'false');
  assert.equal(docs.deploy_required, 'false');
});

test('test-only after complete deployment verifies without deploying', () => {
  const tests = decideDeployment({ ...released, currentFiles: ['tests/example.test.ts'] });
  assert.equal(tests.run_full_suite, 'true');
  assert.equal(tests.deploy_required, 'false');
});

test('partial Worker success leaves Pages pending and triggers safe retry', () => {
  const partial = decideDeployment({
    stateReliable: true,
    workerSha: '2'.repeat(40),
    pagesSha: '1'.repeat(40),
    currentFiles: ['tests/example.test.ts'],
    workerFiles: [],
    pagesFiles: ['src/main.ts'],
  });
  assert.equal(partial.run_full_suite, 'true');
  assert.equal(partial.deploy_required, 'true');
  assert.match(deployWorkflow, /Record successful Worker deployment SHA/);
  assert.match(deployWorkflow, /Record successful GitHub Pages deployment SHA/);
});

test('unknown history and first deployment fail safe into full verification', () => {
  const unknown = decideDeployment({ currentFiles: ['docs/notes.md'], stateReliable: false });
  const initial = decideDeployment({ stateReliable: true, currentFiles: ['docs/notes.md'] });
  for (const result of [unknown, initial]) {
    assert.equal(result.run_full_suite, 'true');
    assert.equal(result.deploy_required, 'true');
  }
});

test('deployment state lookup failure remains visible and cannot be treated as success', () => {
  assert.match(deploymentStateScript, /Deployment history lookup failed; full verification and safe redeployment are required/);
  assert.match(deploymentStateScript, /state_reliable: 'false'/);
});

test('stale queued SHA is blocked and manual deployment obeys its explicit input', () => {
  assert.match(deployWorkflow, /run-name: Verify and deploy \$\{\{ github\.ref_name \}\} @ \$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /latest_sha.*TARGET_SHA/s);
  assert.match(deployWorkflow, /Refusing to publish stale SHA/);
  const manualFalse = decideDeployment({ ...released, currentFiles: ['src/main.ts'], eventName: 'workflow_dispatch', deployToProduction: false });
  const manualTrue = decideDeployment({ ...released, currentFiles: ['docs/notes.md'], eventName: 'workflow_dispatch', deployToProduction: true });
  assert.equal(manualFalse.run_full_suite, 'true');
  assert.equal(manualFalse.deploy_required, 'false');
  assert.equal(manualTrue.run_full_suite, 'true');
  assert.equal(manualTrue.deploy_required, 'true');
});
