import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyResumeEvidence } from '../.github/scripts/pages-resume-preflight.mjs';
import { DEPLOY_PAGES_SHA } from '../.github/scripts/pages-predeploy-evidence.mjs';
import { REQUIRED_ENVIRONMENT_JOBS } from '../.github/scripts/check-browser-ui-matrix.mjs';
const sha = 'a'.repeat(40), snapshot = '1'.repeat(40), parent = '2'.repeat(40), digest = 'sha256:' + 'b'.repeat(64);
function fixture(environment = 'production') {
  const branch = environment === 'production' ? 'main' : 'issue/69-test';
  const source = { version: 1, kind: 'full', environment, sha, runId: 111, attempt: 1, artifactId: 77, digest,
    name: `${environment === 'production' ? 'pages-dist' : 'development-dist'}-${sha}-1`, expiresAt: '2099-01-01T00:00:00Z' };
  const expected = { repository: 'ak-sekine/heibon-mahjong', snapshot, parent, sha, branch, environment, baseSha: '3'.repeat(40), runId: '111', attempt: '1', recoveryRunId: '222', pagesSource: source };
  const run = { id: 111, run_attempt: 1, head_sha: sha, head_branch: branch, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', repository: { full_name: expected.repository }, head_repository: { full_name: expected.repository }, path: '.github/workflows/environments.yml' };
  const step = { name: `Run actions/deploy-pages@${DEPLOY_PAGES_SHA}`, number: 8, status: 'completed', conclusion: 'failure' };
  const job = { name: 'publish / pages-only', id: 5, run_id: 111, run_attempt: 1, head_sha: sha, status: 'completed', conclusion: 'failure', steps: [step] };
  const log = `Download action repository 'actions/deploy-pages@${DEPLOY_PAGES_SHA}' (SHA:${DEPLOY_PAGES_SHA})\n##[group]${step.name}\nFetching artifact metadata for "github-pages" in this workflow run\nError: No artifacts named "github-pages" were found for this workflow run.\n at getArtifactMetadata\n at Deployment.create\n##[group]next\n`;
  const evidence = { ledgerHead: snapshot, snapshotHead: snapshot, snapshotParent: parent, parentHead: parent, sourceHead: sha,
    mainHead: environment === 'production' ? sha : expected.baseSha, originalRun: run, originalJobs: [job], originalJobLog: log,
    ciRun: run, ciJobs: REQUIRED_ENVIRONMENT_JOBS.map(name => ({ name, run_id: 111, run_attempt: 1, head_sha: sha, conclusion: 'success' })),
    deployment: { sha, environment: 'github-pages' }, deploymentStatus: { state: 'failure', log_url: `https://github.com/${expected.repository}/actions/runs/111/job/5` },
    metadata: { id: 77, name: source.name, digest, expired: false, expires_at: source.expiresAt, workflow_run: { id: 111, head_sha: sha } }, activeRuns: [{ id: 222 }] };
  return { expected, evidence, job, step, log };
}
for (const environment of ['production', 'development']) test(`${environment} confirms the original run and complete source CI before resuming`, () => {
  const { expected, evidence } = fixture(environment);
  assert.equal(verifyResumeEvidence(evidence, expected), 'artifact-search-before-request');
});
test('unknown deployment, cancellation, stale refs, changed metadata and incomplete CI reject resume', () => {
  const { expected, evidence, job, step } = fixture();
  for (const invalid of [
    { ...evidence, originalJobLog: '' }, { ...evidence, pagesStatus: { status: 'unknown' }, originalJobLog: evidence.originalJobLog.replace('No artifacts named', 'deployment failed') },
    { ...evidence, originalJobs: [{ ...job, conclusion: 'cancelled' }] },
    { ...evidence, originalJobs: [{ ...job, steps: [{ ...step, conclusion: 'success' }] }] },
    { ...evidence, ledgerHead: 'f'.repeat(40) }, { ...evidence, sourceHead: 'f'.repeat(40) },
    { ...evidence, activeRuns: [{ id: 333 }] }, { ...evidence, metadata: { ...evidence.metadata, expired: true } },
    { ...evidence, metadata: { ...evidence.metadata, digest: 'sha256:' + 'c'.repeat(64) } }, { ...evidence, ciJobs: evidence.ciJobs.slice(1) },
  ]) assert.throws(() => verifyResumeEvidence(invalid, expected));
});
