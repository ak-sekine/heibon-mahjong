import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPLOY_PAGES_SHA, verifyPredeployFailure } from '../.github/scripts/pages-predeploy-evidence.mjs';
const sha = 'a'.repeat(40), expected = { repository: 'ak-sekine/heibon-mahjong', runId: '111', attempt: '1', sha };
const step = { name: `Run actions/deploy-pages@${DEPLOY_PAGES_SHA}`, number: 8, status: 'completed', conclusion: 'failure' };
const job = { id: 5, run_id: 111, run_attempt: 1, head_sha: sha, status: 'completed', conclusion: 'failure', steps: [step] };
const log = `Download action repository 'actions/deploy-pages@${DEPLOY_PAGES_SHA}' (SHA:${DEPLOY_PAGES_SHA})\n##[group]${step.name}\nFetching artifact metadata for "github-pages" in this workflow run\nError: No artifacts named "github-pages" were found for this workflow run.\n at getArtifactMetadata\n at Deployment.create\n##[group]next\n`;
const evidence = { job, log, deployment: { sha, environment: 'github-pages' }, deploymentStatus: { state: 'failure', log_url: `https://github.com/${expected.repository}/actions/runs/111/job/5` } };
test('known pinned artifact-lookup failure proves no Pages request', () => {
  assert.equal(verifyPredeployFailure(evidence, expected), 'artifact-search-before-request');
  for (const invalid of [
    { ...evidence, log: '' }, { ...evidence, log: log.replace('at getArtifactMetadata', '') },
    { ...evidence, log: log.replace('No artifacts named', 'Unexpected error') },
    { ...evidence, log: log.replace('##[group]next', 'Creating Pages deployment with payload\n##[group]next') },
    { ...evidence, deploymentStatus: { ...evidence.deploymentStatus, state: 'pending' } },
    { ...evidence, deployment: { sha, environment: 'other' } },
    { ...evidence, job: { ...job, conclusion: 'cancelled' } },
    { ...evidence, job: { ...job, run_attempt: 2 } },
  ]) assert.throws(() => verifyPredeployFailure(invalid, expected));
});
test('a skipped deployment requires a completed earlier failed step', () => {
  const skipped = { ...job, steps: [{ name: 'Prepare', number: 7, conclusion: 'failure' }, { ...step, conclusion: 'skipped' }] };
  assert.equal(verifyPredeployFailure({ ...evidence, job: skipped, log: 'Prepare failed' }, expected), 'before-deploy-step');
  assert.throws(() => verifyPredeployFailure({ ...evidence, job: { ...skipped, steps: [skipped.steps[1]] }, log: 'missing' }, expected), /earlier failed/);
});
test('the recorded #67-style v4 lookup failure is accepted only with the resolved pinned version', () => {
  const legacyStep = { ...step, name: 'Run actions/deploy-pages@v4' };
  const legacyLog = `Download action repository 'actions/deploy-pages@v4' (SHA:${DEPLOY_PAGES_SHA})\n##[group]Run actions/deploy-pages@v4\nFetching artifact metadata for "github-pages" in this workflow run\n##[error]Error: No artifacts named "github-pages" were found for this workflow run.\n    at getArtifactMetadata (/home/runner/work/_actions/actions/deploy-pages/v4/src/internal/api-client.js:85:1)\n    at Deployment.create (/home/runner/work/_actions/actions/deploy-pages/v4/src/internal/deployment.js:66:1)\n##[group]next\n`;
  assert.equal(verifyPredeployFailure({ ...evidence, job: { ...job, steps: [legacyStep] }, log: legacyLog }, expected), 'artifact-search-before-request');
  assert.throws(() => verifyPredeployFailure({ ...evidence, job: { ...job, steps: [legacyStep] }, log: legacyLog.replace(DEPLOY_PAGES_SHA, 'f'.repeat(40)) }, expected), /identity/);
});
