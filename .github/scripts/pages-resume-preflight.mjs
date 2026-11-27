import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, inventory, verifySealed } from '../../scripts/environments/artifacts.mjs';
import { inspectRecoverySnapshots, verifyRecoveryPublicSite } from '../../scripts/environments/pages-recovery.mjs';
import { REQUIRED_ENVIRONMENT_JOBS } from './check-browser-ui-matrix.mjs';
import { checkArchive, findVerifiedArtifact } from './reuse-production-ci.mjs';
import { verifyPagesArtifactMetadata } from './pages-verified-artifact.mjs';
import { validatePagesSourceEvidence } from './pages-source-evidence.mjs';
import { verifyPredeployFailure } from './pages-predeploy-evidence.mjs';
import { independentIdentity } from './pages-independent.mjs';

const SHA = /^[a-f0-9]{40}$/;
export function verifyResumeEvidence(evidence, expected) {
  const { originalRun, originalJobs, ciRun, ciJobs, deployment, deploymentStatus, originalJobLog, metadata, activeRuns } = evidence;
  const source = validatePagesSourceEvidence(expected.pagesSource, { environment: expected.environment, sha: expected.sha });
  assert.match(expected.snapshot, SHA); assert.match(expected.parent, SHA);
  assert.equal(evidence.ledgerHead, expected.snapshot, 'Pages store changed since staging');
  assert.equal(evidence.snapshotHead, expected.snapshot, 'Wrong staged snapshot');
  assert.equal(evidence.parentHead, expected.parent, 'Wrong finalized parent');
  assert.equal(evidence.snapshotParent, expected.parent, 'Staged snapshot parent changed');
  assert.equal(evidence.sourceHead, expected.sha, 'Source ref changed');
  if (expected.environment === 'production') assert.equal(evidence.mainHead, expected.sha, 'Main changed');
  else assert.equal(evidence.mainHead, expected.baseSha, 'Main changed since Issue publication');
  assert.ok(Array.isArray(activeRuns) && activeRuns.every(run => String(run.id) === String(expected.recoveryRunId)), 'Another publication may be running');
  const belongs = run => run?.head_sha === expected.sha && run?.head_branch === expected.branch &&
    run?.repository?.full_name === expected.repository && run?.head_repository?.full_name === expected.repository &&
    (run?.path === '.github/workflows/environments.yml' || run?.path?.startsWith('.github/workflows/environments.yml@')) && run?.status === 'completed';
  assert.ok(belongs(originalRun) && String(originalRun.id) === expected.runId && String(originalRun.run_attempt) === expected.attempt && originalRun.event === 'workflow_dispatch', 'Original publication run mismatch');
  const jobs = originalJobs.filter(job => job.name === 'publish / pages-only');
  assert.equal(jobs.length, 1, 'Pages publication job not unique');
  const result = verifyPredeployFailure({ job: jobs[0], log: originalJobLog, deployment, deploymentStatus }, expected);
  assert.ok(belongs(ciRun), 'Source CI identity mismatch');
  assert.equal(ciRun.id, source.runId); assert.equal(ciRun.run_attempt, source.attempt);
  if (source.kind === 'production-reuse') {
    assert.equal(ciRun.event, 'push'); assert.equal(ciRun.conclusion, 'success');
  } else assert.equal(ciRun.event, 'workflow_dispatch');
  for (const name of REQUIRED_ENVIRONMENT_JOBS) {
    const matches = ciJobs.filter(job => job.name === name);
    assert.equal(matches.length, 1, `Missing or duplicate CI job ${name}`);
    assert.equal(matches[0].conclusion, 'success', `CI job did not succeed: ${name}`);
    assert.equal(matches[0].run_id, ciRun.id); assert.equal(matches[0].run_attempt, ciRun.run_attempt);
    assert.equal(matches[0].head_sha, expected.sha);
  }
  verifyPagesArtifactMetadata(metadata, { id: source.artifactId, digest: source.digest.slice(7), name: source.name, runId: source.runId, sha: source.sha });
  assert.equal(metadata.expires_at, source.expiresAt, 'Artifact expiry changed');
  return result;
}

export async function verifyResumeSnapshots({ store, previousStore, expected, get = fetch }) {
  const sites = inspectRecoverySnapshots({ store, previousStore, expected });
  await verifyRecoveryPublicSite(sites.before, get);
  return sites;
}

async function cli() {
  const [store, previousStore] = process.argv.slice(2), env = process.env;
  assert.equal(env.GITHUB_REPOSITORY, 'ak-sekine/heibon-mahjong');
  const identity = independentIdentity(env);
  assert.ok(store && previousStore && SHA.test(env.RECOVERY_SNAPSHOT || '') && SHA.test(env.RECOVERY_PARENT || ''));
  const state = JSON.parse(readFileSync(path.join(store, 'state.json'), 'utf8')), pending = state.pending;
  assert.ok(pending && pending.environment === identity.environment && pending.sha === identity.sha, 'Pending target does not match requested publication');
  const record = pending.current[pending.environment], publication = record.publication;
  const source = validatePagesSourceEvidence(publication?.pagesSource, { environment: identity.environment, sha: identity.sha });
  const expected = { repository: env.GITHUB_REPOSITORY, snapshot: env.RECOVERY_SNAPSHOT, parent: env.RECOVERY_PARENT, sha: pending.sha,
    environment: pending.environment, workerUrl: record.workerUrl, siteDigest: pending.siteDigest, runId: pending.reservation.runId, attempt: pending.reservation.attempt,
    branch: identity.branch, baseSha: publication?.baseSha, recoveryRunId: env.GITHUB_RUN_ID, pagesSource: source };
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  const base = `repos/${env.GITHUB_REPOSITORY}`, get = endpoint => api(`${base}/${endpoint}`);
  const rev = (dir, ref) => execFileSync('git', ['-C', dir, 'rev-parse', ref], { encoding: 'utf8' }).trim();
  const jobs = (id, attempt) => { const response = get(`actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`); assert.equal(response.total_count, response.jobs.length, 'Incomplete job list'); return response.jobs; };
  const originalJobs = jobs(expected.runId, expected.attempt);
  const pagesJobs = originalJobs.filter(job => job.name === 'publish / pages-only');
  assert.equal(pagesJobs.length, 1); assert.ok(Number.isSafeInteger(pagesJobs[0].id));
  const log = execFileSync('gh', ['api', `${base}/actions/jobs/${pagesJobs[0].id}/logs`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const [deployment] = get('deployments?environment=github-pages&per_page=1');
  assert.ok(deployment?.id, 'Pages deployment missing');
  const activeRuns = [];
  // Conservatively stop for any other active repository workflow, including old
  // refs and recovery workflows that are not registered on the default branch.
  for (const status of ['queued', 'in_progress', 'waiting']) {
    const result = get(`actions/runs?status=${status}&per_page=100`);
    assert.equal(result.total_count, result.workflow_runs.length, 'Incomplete active-run list');
    activeRuns.push(...result.workflow_runs);
  }
  const evidence = { ledgerHead: get('git/ref/heads/pages-verified').object.sha, snapshotHead: rev(store, 'HEAD'), parentHead: rev(previousStore, 'HEAD'), snapshotParent: rev(store, 'HEAD^'),
    sourceHead: get(`git/ref/heads/${identity.branch}`).object.sha, mainHead: get('git/ref/heads/main').object.sha,
    originalRun: get(`actions/runs/${expected.runId}/attempts/${expected.attempt}`), originalJobs, originalJobLog: log,
    ciRun: get(`actions/runs/${source.runId}/attempts/${source.attempt}`), ciJobs: jobs(source.runId, source.attempt), metadata: get(`actions/artifacts/${source.artifactId}`),
    deployment, deploymentStatus: get(`deployments/${deployment.id}/statuses?per_page=1`)[0], activeRuns };
  const kind = verifyResumeEvidence(evidence, expected);
  if (source.kind === 'production-reuse') assert.deepEqual(findVerifiedArtifact(identity.sha, api), source.productionEvidence, 'Production push CI or Artifact proof changed');
  await verifyResumeSnapshots({ store, previousStore, expected });
  assert.equal(get('git/ref/heads/pages-verified').object.sha, expected.snapshot, 'Pages store changed during preflight');
  assert.equal(get(`git/ref/heads/${identity.branch}`).object.sha, expected.sha, 'Source changed during preflight');
  const files = execFileSync('git', ['-C', store, 'diff', '--name-only', expected.parent, expected.snapshot, '--'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.ok(files.includes('state.json') && files.every(name => name === 'state.json' || name.startsWith('site/')), 'Unexpected staged commit changes');
  writeFileSync(path.join(env.RUNNER_TEMP, 'pages-resume-evidence.json'), JSON.stringify({ source, snapshotDigest: record.snapshotDigest, kind }) + '\n', { flag: 'wx' });
  console.log(`Verified ${kind}, original run ${expected.runId}/${expected.attempt}, source CI ${source.runId}/${source.attempt}; no deployment requested.`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await cli();
