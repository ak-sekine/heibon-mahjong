import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIXED, verifyEvidence } from '../.github/scripts/issue67-recovery-preflight.mjs';
import { REQUIRED_ENVIRONMENT_JOBS } from '../.github/scripts/check-browser-ui-matrix.mjs';

function evidence() {
  const run = (id, conclusion, event) => ({id, conclusion, event, head_sha:FIXED.sha, head_branch:'main', run_attempt:1, status:'completed', path:'.github/workflows/environments.yml', repository:{full_name:FIXED.repository}, head_repository:{full_name:FIXED.repository}});
  const job = name => ({name, conclusion:'success', status:'completed'});
  return {ledgerHead:FIXED.reservation, reservationHead:FIXED.reservation, parentHead:FIXED.parent, parentOfReservation:FIXED.parent,
    originalRun:run(Number(FIXED.runId),'failure','workflow_dispatch'), originalJobs:['publish / reserve','publish / worker-production','publish / online'].map(job),
    verificationRun:run(FIXED.verificationRun,'success','push'), verificationJobs:REQUIRED_ENVIRONMENT_JOBS.map(job),
    workerDeployments:[{id:FIXED.workerDeployment,sha:FIXED.sha}], workerStatuses:[{state:'success',log_url:`https://github.com/${FIXED.repository}/actions/runs/${FIXED.runId}/job/123`}],
    pagesDeployments:[{id:FIXED.failedPagesDeployment,sha:FIXED.sha}], pagesStatuses:[{state:'failure'}]};
}

test('preflight requires exact reservation, source CI and distinct original deployments', () => {
  verifyEvidence(evidence());
  const mutations = [
    e=>e.ledgerHead='0'.repeat(40), e=>e.parentOfReservation='0'.repeat(40),
    e=>e.originalRun.event='push', e=>e.originalRun.run_attempt=2, e=>e.originalRun.head_sha='0'.repeat(40),
    e=>e.originalJobs.push({...e.originalJobs[0],conclusion:'failure'}), e=>e.originalJobs.pop(), e=>e.verificationRun.conclusion='failure',
    e=>e.verificationJobs.pop(), e=>e.workerDeployments[0].id++,
    e=>e.workerStatuses[0].log_url='https://github.com/other/repo/actions/runs/1/job/1',
    e=>e.pagesStatuses[0].state='success', e=>e.pagesDeployments[0].sha='0'.repeat(40),
  ];
  for (const mutate of mutations) { const e=evidence(); mutate(e); assert.throws(()=>verifyEvidence(e)); }
});

test('preflight does not deploy or push; recover is fail closed', () => {
  const workflow=readFileSync(new URL('../.github/workflows/issue67-pages-recovery.yml',import.meta.url),'utf8');
  const preflight=workflow.split('  recover-blocked:')[0];
  assert.match(preflight,/group: pages-publication/);
  assert.match(preflight,/github\.event\.inputs\.mode == 'preflight'/);
  assert.doesNotMatch(preflight,/deploy-pages|deploy-worker|git push|environment:/);
  assert.match(workflow,/recover-blocked:[\s\S]*permissions: \{\}[\s\S]*exit 1/);
  assert.match(preflight,/matches\.length!==1/);
});
