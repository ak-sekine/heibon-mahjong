import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectRecoverySnapshots, verifyRecoveryPublicSite } from '../../scripts/environments/pages-recovery.mjs';
import { REQUIRED_ENVIRONMENT_JOBS } from './check-browser-ui-matrix.mjs';

export const FIXED = Object.freeze({ repository: 'ak-sekine/heibon-mahjong', sha: '988bbaca276363583e6d3bffed602d60c8f86963',
  reservation: 'ed460b9ebc676bef9204d61903f91e6bf5f51add', parent: 'a89929fe0abd8897cf1ce9bb1b329992b444c014',
  siteDigest: '83d8038f95747a658d18c600af5bfca53a1b88a02bbfde3e5900e92bd21ae8a3',
  workerUrl: 'https://heibon-mahjong-online.ak-sekine.workers.dev', runId: '45710701975', attempt: '1',
  verificationRun: 45709160919, workerDeployment: 8070746609, failedPagesDeployment: 8070773768 });

export function verifyEvidence({ledgerHead, reservationHead, parentHead, parentOfReservation, originalRun, originalJobs, verificationRun, verificationJobs, workerDeployments, workerStatuses, pagesDeployments, pagesStatuses}) {
  assert.equal(ledgerHead, FIXED.reservation, 'ledger head changed');
  assert.equal(reservationHead, FIXED.reservation, 'wrong reservation checkout');
  assert.equal(parentHead, FIXED.parent, 'wrong parent checkout');
  assert.equal(parentOfReservation, FIXED.parent, 'reservation parent changed');
  const runMatches = (run, id, conclusion) => run.id === id && run.head_sha === FIXED.sha && run.head_branch === 'main' && run.run_attempt === 1 && run.status === 'completed' && run.conclusion === conclusion && (run.path === '.github/workflows/environments.yml' || run.path?.startsWith('.github/workflows/environments.yml@')) && run.repository?.full_name === FIXED.repository && run.head_repository?.full_name === FIXED.repository;
  assert.ok(runMatches(originalRun, Number(FIXED.runId), 'failure') && originalRun.event === 'workflow_dispatch', 'original run identity mismatch');
  assert.ok(runMatches(verificationRun, FIXED.verificationRun, 'success') && verificationRun.event === 'push', 'verification run identity mismatch');
  const success = (jobs, name) => { const matches=jobs.filter(j => j.name === name); return matches.length === 1 && matches[0].status === 'completed' && matches[0].conclusion === 'success'; };
  for (const name of ['publish / reserve', 'publish / worker-production', 'publish / online']) assert.ok(success(originalJobs, name), `missing ${name}`);
  for (const name of REQUIRED_ENVIRONMENT_JOBS) assert.ok(success(verificationJobs, name), `missing ${name}`);
  assert.equal(workerDeployments[0]?.id, FIXED.workerDeployment, 'latest Worker deployment changed');
  assert.equal(workerDeployments[0]?.sha, FIXED.sha, 'wrong Worker SHA');
  assert.equal(workerStatuses[0]?.state, 'success', 'Worker deployment not successful');
  assert.match(workerStatuses[0]?.log_url || '', new RegExp(`^https://github\\.com/${FIXED.repository}/actions/runs/${FIXED.runId}/job/[0-9]+$`), 'Worker deployment run mismatch');
  assert.equal(pagesDeployments[0]?.id, FIXED.failedPagesDeployment, 'latest Pages deployment changed');
  assert.equal(pagesDeployments[0]?.sha, FIXED.sha, 'wrong Pages deployment SHA');
  assert.equal(pagesStatuses[0]?.state, 'failure', 'Pages status changed');
}

const api = endpoint => JSON.parse(execFileSync('gh', ['api', `repos/${FIXED.repository}/${endpoint}`], { encoding:'utf8' }));
const rev = (store, ref) => execFileSync('git', ['-C', store, 'rev-parse', ref], { encoding:'utf8' }).trim();
async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY, FIXED.repository);
  const store = process.argv[2], previousStore = process.argv[3];
  assert.ok(store && previousStore, 'expected reservation and parent checkouts');
  const snapshot = inspectRecoverySnapshots({store, previousStore, expected: FIXED});
  const runs = id => api(`actions/runs/${id}/attempts/1`);
  const jobs = id => { const v=api(`actions/runs/${id}/attempts/1/jobs?per_page=100`); assert.equal(v.total_count,v.jobs.length,'incomplete job list'); return v.jobs; };
  const evidence = {ledgerHead:api('git/ref/heads/pages-verified').object.sha, reservationHead:rev(store,'HEAD'), parentHead:rev(previousStore,'HEAD'), parentOfReservation:rev(store,'HEAD^'),
    originalRun:runs(FIXED.runId), originalJobs:jobs(FIXED.runId), verificationRun:runs(FIXED.verificationRun), verificationJobs:jobs(FIXED.verificationRun),
    workerDeployments:api('deployments?environment=worker-production&per_page=1'), workerStatuses:api(`deployments/${FIXED.workerDeployment}/statuses?per_page=1`),
    pagesDeployments:api('deployments?environment=github-pages&per_page=1'), pagesStatuses:api(`deployments/${FIXED.failedPagesDeployment}/statuses?per_page=1`)};
  verifyEvidence(evidence);
  const artifact = api('actions/artifacts/15066358984');
  assert.equal(artifact.name, 'github-pages'); assert.equal(artifact.expired, false); assert.equal(artifact.workflow_run.id, Number(FIXED.runId)); assert.equal(artifact.workflow_run.head_sha, FIXED.sha);
  const environment = api('environments/github-pages'); assert.equal(environment.name, 'github-pages');
  const pages = api('pages'); assert.ok(pages && typeof pages === 'object', 'Pages configuration unavailable');
  for (const status of ['queued', 'in_progress', 'waiting']) {
    const result = api(`actions/workflows/environments.yml/runs?status=${status}&per_page=100`);
    assert.equal(result.total_count, result.workflow_runs.length, 'incomplete publication run list');
    assert.ok(result.workflow_runs.every(run => String(run.id) === process.env.GITHUB_RUN_ID), `another publication run is ${status}`);
  }

  await verifyRecoveryPublicSite(snapshot.before);
  const health = await fetch(`${FIXED.workerUrl}/health`, {headers:{Origin:'https://ak-sekine.github.io'},redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.equal(health.status,200); const body=await health.json(); assert.equal(body.ok,true); assert.equal(body.service,'heibon-mahjong-online');
  assert.equal(api('git/ref/heads/pages-verified').object.sha,FIXED.reservation,'ledger changed during preflight');
  console.log(`Read-only evidence and ${Object.keys(snapshot.before).length} public files verified; environment policy read; write and Pages deployment permissions not proven.`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
