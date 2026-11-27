import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRecoverySnapshots, verifyRecoveryPublicSite } from '../../scripts/environments/pages-recovery.mjs';
import { REQUIRED_ENVIRONMENT_JOBS } from './check-browser-ui-matrix.mjs';
import { validateEvidence } from './reuse-production-ci.mjs';
import { validatePagesSourceEvidence } from './pages-source-evidence.mjs';

const SHA = /^[a-f0-9]{40}$/;
export function verifyPagesRecoveryEvidence(evidence, expected) {
  const { originalRun, originalJobs, ciRun, ciJobs, deployment, deploymentStatus, pagesStatus } = evidence;
  assert.match(expected.snapshot, SHA); assert.match(expected.parent, SHA);
  assert.equal(evidence.ledgerHead, expected.snapshot, 'Pages store changed since staging');
  assert.equal(evidence.snapshotHead, expected.snapshot, 'Wrong staged snapshot');
  assert.equal(evidence.parentHead, expected.parent, 'Wrong finalized parent');
  assert.equal(evidence.snapshotParent, expected.parent, 'Staged snapshot parent changed');
  const belongs = run => run?.head_sha === expected.sha && run?.head_branch === expected.branch && run?.repository?.full_name === expected.repository && run?.head_repository?.full_name === expected.repository && (run?.path === '.github/workflows/environments.yml' || run?.path?.startsWith('.github/workflows/environments.yml@')) && run?.status === 'completed';
  assert.ok(belongs(originalRun) && String(originalRun.id) === expected.runId && String(originalRun.run_attempt) === expected.attempt && originalRun.event === 'workflow_dispatch', 'Original publication run mismatch');
  const jobs = originalJobs.filter(job => job.name === 'publish / pages-only');
  assert.equal(jobs.length, 1, 'Pages publication job not unique');
  assert.equal(jobs[0].run_id, Number(expected.runId));
  assert.equal(jobs[0].run_attempt, Number(expected.attempt));
  assert.ok(Number.isSafeInteger(jobs[0].id) && jobs[0].id > 0, 'Invalid original Pages job ID');
  const steps = jobs[0].steps?.filter(step => step.name === 'Run actions/deploy-pages@v4' || step.name === 'Run actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e') || [];
  assert.equal(steps.length, 1, 'Pages deploy step not unique');
  assert.equal(steps[0].conclusion, 'success', 'Pages deploy step did not confirm success');
  assert.match(expected.pagesDeploymentId || '', /^[a-zA-Z0-9_-]+$/);
  assert.equal(typeof evidence.originalJobLog, 'string', 'Original Pages job log unavailable');
  const created = [...evidence.originalJobLog.matchAll(/Created deployment for ([a-f0-9]{40}), ID: ([a-zA-Z0-9_-]+)(?=\s|$)/g)];
  assert.equal(created.length, 1, 'Original Pages deployment ID is absent or ambiguous');
  assert.equal(created[0][1], expected.sha, 'Pages deployment log SHA mismatch');
  assert.equal(created[0][2], expected.pagesDeploymentId, 'Pages deployment ID does not belong to original run');
  assert.equal(pagesStatus?.status, 'succeed', 'Pages deployment result is not confirmed');
  assert.equal(deployment?.sha, expected.sha, 'Wrong GitHub Pages deployment SHA');
  assert.equal(deploymentStatus?.log_url, `https://github.com/${expected.repository}/actions/runs/${expected.runId}/job/${jobs[0].id}`, 'Pages deployment belongs to another job');
  assert.ok(belongs(ciRun), 'Source CI identity mismatch');
  if (expected.pagesSource) {
    const source = validatePagesSourceEvidence(expected.pagesSource, { environment: expected.environment, sha: expected.sha });
    assert.equal(ciRun.id, source.runId); assert.equal(ciRun.run_attempt, source.attempt);
    if (source.kind === 'production-reuse') { assert.equal(ciRun.event, 'push'); assert.equal(ciRun.conclusion, 'success'); }
    else assert.equal(ciRun.event, 'workflow_dispatch');
  } else if (expected.sourceVerification) {
    const source = validateEvidence(expected.sourceVerification);
    assert.equal(ciRun.id, source.runId); assert.equal(ciRun.run_attempt, source.attempt);
    assert.equal(ciRun.event, 'push'); assert.equal(ciRun.conclusion, 'success');
  } else {
    assert.equal(ciRun.id, Number(expected.runId)); assert.equal(ciRun.run_attempt, Number(expected.attempt));
    assert.equal(ciRun.event, 'workflow_dispatch');
  }
  for (const name of REQUIRED_ENVIRONMENT_JOBS) {
    const matches = ciJobs.filter(job => job.name === name);
    assert.equal(matches.length, 1, `Missing or duplicate CI job ${name}`);
    assert.equal(matches[0].conclusion, 'success', `CI job did not succeed: ${name}`);
    assert.equal(matches[0].run_id, ciRun.id); assert.equal(matches[0].run_attempt, ciRun.run_attempt);
    assert.equal(matches[0].head_sha, expected.sha);
  }
}
async function cli() {
  const [store, previousStore] = process.argv.slice(2);
  const env = process.env;
  assert.equal(env.GITHUB_REPOSITORY, 'ak-sekine/heibon-mahjong');
  assert.ok(store && previousStore && SHA.test(env.RECOVERY_SNAPSHOT || '') && SHA.test(env.RECOVERY_PARENT || ''));
  assert.match(env.PAGES_DEPLOYMENT_ID || '', /^[a-zA-Z0-9_-]+$/);
  const state = JSON.parse(readFileSync(path.join(store, 'state.json'), 'utf8'));
  const pending = state.pending;
  assert.ok(pending && ['production', 'development'].includes(pending.environment));
  const record = pending.current[pending.environment], publication = record.publication;
  const expected = { repository: env.GITHUB_REPOSITORY, snapshot: env.RECOVERY_SNAPSHOT, parent: env.RECOVERY_PARENT, sha: pending.sha, environment: pending.environment, workerUrl: record.workerUrl, siteDigest: pending.siteDigest, runId: pending.reservation.runId, attempt: pending.reservation.attempt, branch: pending.environment === 'production' ? 'main' : publication.sourceRef.slice('refs/heads/'.length), sourceVerification: publication?.sourceVerification, pagesSource: publication?.pagesSource, pagesDeploymentId: env.PAGES_DEPLOYMENT_ID };
  const rev = (dir, ref) => execFileSync('git', ['-C', dir, 'rev-parse', ref], { encoding: 'utf8' }).trim();
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', `repos/${env.GITHUB_REPOSITORY}/${endpoint}`], { encoding: 'utf8' }));
  const jobs = (id, attempt) => { const response = api(`actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`); assert.equal(response.total_count, response.jobs.length, 'Incomplete job list'); return response.jobs; };
  const ciId = expected.pagesSource?.runId ?? expected.sourceVerification?.runId ?? Number(expected.runId);
  const ciAttempt = expected.pagesSource?.attempt ?? expected.sourceVerification?.attempt ?? Number(expected.attempt);
  const [deployment] = api('deployments?environment=github-pages&per_page=1');
  assert.ok(deployment?.id, 'Pages deployment not found');
  const originalJobs = jobs(expected.runId, expected.attempt);
  const pagesJobs = originalJobs.filter(job => job.name === 'publish / pages-only');
  assert.equal(pagesJobs.length, 1, 'Pages publication job not unique');
  assert.ok(Number.isSafeInteger(pagesJobs[0].id) && pagesJobs[0].id > 0, 'Invalid original Pages job ID');
  const originalJobLog = execFileSync('gh', ['api', `repos/${env.GITHUB_REPOSITORY}/actions/jobs/${pagesJobs[0].id}/logs`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const evidence = { ledgerHead: api('git/ref/heads/pages-verified').object.sha, snapshotHead: rev(store, 'HEAD'), parentHead: rev(previousStore, 'HEAD'), snapshotParent: rev(store, 'HEAD^'), originalRun: api(`actions/runs/${expected.runId}/attempts/${expected.attempt}`), originalJobs, originalJobLog, ciRun: api(`actions/runs/${ciId}/attempts/${ciAttempt}`), ciJobs: jobs(ciId, ciAttempt), deployment, deploymentStatus: api(`deployments/${deployment.id}/statuses?per_page=1`)[0], pagesStatus: api(`pages/deployments/${env.PAGES_DEPLOYMENT_ID}`) };
  verifyPagesRecoveryEvidence(evidence, expected);
  const sites = inspectRecoverySnapshots({ store, previousStore, expected });
  await verifyRecoveryPublicSite(sites.candidate);
  assert.equal(api('git/ref/heads/pages-verified').object.sha, expected.snapshot, 'Pages store changed during recovery verification');
  console.log('Pages recovery evidence and currently served staged snapshot verified; no state changed.');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await cli();
