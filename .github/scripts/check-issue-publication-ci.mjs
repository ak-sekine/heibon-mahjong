import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_ENVIRONMENT_JOBS } from './check-browser-ui-matrix.mjs';
import { publicationIdentity } from './publication-reservation.mjs';

export function hasRequiredIssueJobs(response) {
  return Array.isArray(response.jobs) && REQUIRED_ENVIRONMENT_JOBS.every(name => {
    const matches = response.jobs.filter(job => job.name === name);
    return matches.length === 1 && matches[0].conclusion === 'success';
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const { branch, sha, sourceRef } = publicationIdentity(env);
  if (!sourceRef) throw new Error('Issue branch required');
  const repository = env.GITHUB_REPOSITORY;
  const actions = `repos/${repository}/actions`;
  const query = new URLSearchParams({ branch, event: 'push', head_sha: sha, per_page: '100' });
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
  const run = api(`${actions}/workflows/environments.yml/runs?${query}`).workflow_runs.find(candidate =>
    candidate.head_repository?.full_name === repository && candidate.head_branch === branch &&
    candidate.head_sha === sha && candidate.event === 'push' && candidate.status === 'completed');
  if (run?.conclusion !== 'success' || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt) ||
      !hasRequiredIssueJobs(api(`${actions}/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`))) {
    throw new Error('No successful full Environments push CI for this Issue SHA');
  }
  console.log(`Verified Issue push CI: ${run.html_url}/attempts/${run.run_attempt}`);
}
