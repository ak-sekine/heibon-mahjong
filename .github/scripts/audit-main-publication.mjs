import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, inventory } from '../../scripts/environments/artifacts.mjs';
import { checkDeployment, checkPublicBytes, readApi } from './check-issue-publication-site.mjs';
import { REPOSITORY } from './reuse-production-ci.mjs';

export async function auditMainPublication(store, { sha, finalized, runId, api = readApi, get = fetch,
  checkout = () => execFileSync('git', ['-C', store, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } = {}) {
  const shaPattern = /^[0-9a-f]{40}$/;
  if (!shaPattern.test(sha) || !shaPattern.test(finalized)) throw new Error('Invalid production audit identity');
  const checkLedgerHead = () => {
    if (api(`repos/${REPOSITORY}/git/ref/heads/pages-verified`)?.object?.sha !== finalized) {
      throw new Error('Public audit: pages-verified changed');
    }
  };
  checkLedgerHead();
  if (checkout() !== finalized) throw new Error('Unexpected finalized snapshot checkout');
  const state = JSON.parse(readFileSync(path.join(store, 'state.json'), 'utf8'));
  const site = path.join(store, 'site');
  const record = state.current?.production;
  const publicLedger = JSON.parse(readFileSync(path.join(site, 'environments.json'), 'utf8'));
  if (state.version !== 1 || state.pending !== null || record?.sha !== sha ||
      JSON.stringify(publicLedger) !== JSON.stringify(state.current)) throw new Error('Unexpected finalized ledger');
  const files = inventory(site);
  for (const name of Object.keys(files)) {
    if (name.startsWith('dev/') || name === 'environments.json') delete files[name];
  }
  const release = JSON.parse(readFileSync(path.join(site, 'release.json'), 'utf8'));
  if (digest(files) !== record.snapshotDigest || release.sha !== sha ||
      release.environment !== 'production' || release.digest !== record.digest ||
      release.workerUrl !== record.workerUrl ||
      record.workerUrl !== 'https://heibon-mahjong-online.ak-sekine.workers.dev') {
    throw new Error('Finalized production snapshot does not match ledger');
  }
  delete files['release.json'];
  if (digest(files) !== record.digest || JSON.stringify(files) !== JSON.stringify(release.files)) {
    throw new Error('Finalized production files do not match release');
  }
  const workerDeployment = checkDeployment('worker-production', sha, api, runId, REPOSITORY);
  const pagesDeployment = checkDeployment('github-pages', sha, api, runId, REPOSITORY);
  const health = await get(new URL('/health', record.workerUrl), {
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { Origin: 'https://ak-sekine.github.io' },
  });
  if (health.status !== 200) throw new Error('Production Worker health failed');
  const body = await health.json();
  if (body.ok !== true || body.service !== 'heibon-mahjong-online') throw new Error('Unexpected production Worker health');
  await checkPublicBytes(store, get);

  let main;
  try {
    main = api(`repos/${REPOSITORY}/git/ref/heads/main`)?.object?.sha;
  } catch {
    // The current main ref is informational after the pinned release is verified.
  }
  checkLedgerHead();
  if (checkDeployment('worker-production', sha, api, runId, REPOSITORY) !== workerDeployment ||
      checkDeployment('github-pages', sha, api, runId, REPOSITORY) !== pagesDeployment) throw new Error('Deployment changed during audit');
  return { main: shaPattern.test(main) ? main : null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main' ||
        process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Unexpected production audit run');
    const { main } = await auditMainPublication(process.argv[2], { sha: process.env.GITHUB_SHA, finalized: process.env.FINALIZED_SNAPSHOT,
      runId: process.env.GITHUB_RUN_ID });
    console.log('Production audit passed for ' + process.env.GITHUB_SHA);
    const tracking = main === null ? 'unconfirmed' : main === process.env.GITHUB_SHA
      ? 'matches the published SHA' : 'differs from the published SHA (`' + main + '`)';
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'Production publication audit passed for `' + process.env.GITHUB_SHA +
      '`.\nCurrent main: ' + tracking + '.\n');
  } catch (error) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'Production publication audit failed. Check the audit job before retrying.\n');
    throw error;
  }
}
