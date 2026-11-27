import assert from 'node:assert/strict';

// deploy-pages v4 as resolved on 2026-11-27. getArtifactMetadata runs before
// createPagesDeployment; only this known missing-artifact failure is accepted.
export const DEPLOY_PAGES_SHA = 'd6db90164ac5ed86f2b6aed7e0febac5b3c0c03e';
const names = new Set(['Run actions/deploy-pages@v4', `Run actions/deploy-pages@${DEPLOY_PAGES_SHA}`]);
export function verifyPredeployFailure({ job, log, deployment, deploymentStatus }, expected) {
  assert.ok(job && Number.isSafeInteger(job.id) && job.id > 0 && job.status === 'completed' && job.conclusion === 'failure', 'Original Pages job is not a completed failure');
  assert.equal(job.run_id, Number(expected.runId));
  assert.equal(job.run_attempt, Number(expected.attempt));
  assert.equal(job.head_sha, expected.sha);
  assert.equal(typeof log, 'string', 'Original Pages log is unavailable');
  assert.ok(log.length > 0, 'Original Pages log is empty');
  const steps = (job.steps || []).filter(step => names.has(step.name));
  assert.equal(steps.length, 1, 'Pages deployment step not unique');
  const step = steps[0];
  assert.equal(step.status, 'completed');
  assert.equal(deployment?.sha, expected.sha, 'Wrong GitHub Pages deployment SHA');
  assert.equal(deployment?.environment, 'github-pages', 'Wrong Pages deployment environment');
  assert.equal(deploymentStatus?.log_url, `https://github.com/${expected.repository}/actions/runs/${expected.runId}/job/${job.id}`, 'Pages deployment belongs to another job');
  assert.ok(['failure', 'error'].includes(deploymentStatus.state), 'Pages Environment deployment has an unresolved status');
  assert.ok(!log.includes('Creating Pages deployment with payload') && !log.includes('Created deployment for '), 'A Pages deployment request may have been sent');
  const marker = '##[group]' + step.name;
  const parts = log.split(marker);
  if (step.conclusion === 'skipped') {
    assert.equal(parts.length, 1, 'A skipped deploy step unexpectedly has execution logs');
    assert.ok((job.steps || []).some(other => other.number < step.number && other.conclusion === 'failure'), 'No earlier failed step proves deploy was skipped');
    return 'before-deploy-step';
  }
  assert.equal(step.conclusion, 'failure', 'Pages deploy step did not fail');
  assert.equal(parts.length, 2, 'Pages deploy log section is absent or ambiguous');
  const section = parts[1].split('##[group]')[0];
  const pinned = `Download action repository 'actions/deploy-pages@${step.name.slice('Run actions/deploy-pages@'.length)}' (SHA:${DEPLOY_PAGES_SHA})`;
  assert.ok(log.includes(pinned), 'deploy-pages implementation identity not established');
  assert.ok(section.includes('Fetching artifact metadata for "github-pages" in this workflow run'), 'Artifact lookup start not established');
  assert.ok(section.includes('No artifacts named "github-pages" were found for this workflow run'), 'Known pre-request lookup failure not established');
  assert.ok(section.includes('at getArtifactMetadata') && section.includes('at Deployment.create'), 'Lookup failure stack is incomplete');
  return 'artifact-search-before-request';
}
