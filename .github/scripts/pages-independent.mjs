import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory } from '../../scripts/environments/artifacts.mjs';
import { inspectFinalizedSnapshot, inspectRecoverySnapshots, verifyRecoveryPublicSite } from '../../scripts/environments/pages-recovery.mjs';
import { planPublication } from './publication-plan.mjs';
import { publicationIdentity, preparePublication, checkPublication } from './publication-reservation.mjs';
import { checkDeployment, readApi } from './check-issue-publication-site.mjs';

const shaPattern = /^[a-f0-9]{40}$/;
const targets = { production: 'https://heibon-mahjong-online.ak-sekine.workers.dev', development: 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev' };
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
export function independentIdentity(env) {
  const identity = publicationIdentity(env);
  if (env.GITHUB_REPOSITORY !== 'ak-sekine/heibon-mahjong' || identity.branch === 'develop' || identity.attempt !== '1' ||
      env.GITHUB_WORKFLOW_REF !== `${env.GITHUB_REPOSITORY}/.github/workflows/environments.yml@${env.GITHUB_REF}` || env.GITHUB_WORKFLOW_SHA !== identity.sha ||
      env.EXPECTED_WORKER_URL !== targets[identity.environment]) throw new Error('Invalid Pages publication identity');
  return identity;
}
export function planPages(store, source, env = process.env) {
  const identity = independentIdentity(env);
  const state = JSON.parse(readFileSync(path.join(store, 'state.json'), 'utf8'));
  if (state.version !== 1 || state.pending !== null || !state.current?.production || !state.current?.development) throw new Error('Pages snapshot unavailable or pending');
  const result = planPublication({ environment: identity.environment, candidate: identity.sha, pagesBase: state.current[identity.environment].sha, workerBase: '', target: 'pages', git: (cmd, args, opts) => execFileSync(cmd, args, { ...opts, cwd: source }) });
  if (result.blocked) throw new Error('Pages comparison failed: ' + result.reason);
  return result;
}
export async function preparePages(store, source, candidate, env = process.env, get = fetch, exec = execFileSync) {
  const result = planPages(store, source, env);
  // Compare the previously finalized site, never an unresolved staged site.
  await verifyRecoveryPublicSite(inventory(path.join(store, 'site')), get);
  preparePublication(store, candidate, env.EXPECTED_WORKER_URL, env, exec);
  return result;
}
export async function verifyStaged({ store, previousStore, env = process.env, get = fetch }) {
  const identity = independentIdentity(env);
  const staged = JSON.parse(readFileSync(path.join(store, 'state.json'), 'utf8'));
  const expected = { environment: identity.environment, sha: identity.sha, workerUrl: env.EXPECTED_WORKER_URL, runId: identity.runId, attempt: identity.attempt, siteDigest: staged.pending?.siteDigest };
  const sites = inspectRecoverySnapshots({ store, previousStore, expected });
  await verifyRecoveryPublicSite(sites.candidate, get);
  return sites;
}
export async function auditPages(store, { env = process.env, api = readApi, get = fetch } = {}) {
  const identity = independentIdentity(env);
  const finalized = env.FINALIZED_SNAPSHOT;
  assert.match(finalized || '', shaPattern);
  const remote = () => api(`repos/${env.GITHUB_REPOSITORY}/git/ref/heads/pages-verified`)?.object?.sha;
  assert.equal(remote(), finalized, 'Pages store changed');
  assert.equal(git(['-C', store, 'rev-parse', 'HEAD']), finalized, 'Wrong finalized checkout');
  const { state, files } = inspectFinalizedSnapshot(store);
  assert.equal(state.current?.[identity.environment]?.sha, identity.sha);
  const pages = checkDeployment('github-pages', identity.sha, api, identity.runId, env.GITHUB_REPOSITORY);
  await verifyRecoveryPublicSite(files, get);
  assert.equal(remote(), finalized, 'Pages store changed during audit');
  assert.equal(checkDeployment('github-pages', identity.sha, api, identity.runId, env.GITHUB_REPOSITORY), pages, 'Pages deployment changed during audit');
}
async function cli() {
  const [command, store, arg] = process.argv.slice(2);
  if (command === 'prepare') {
    const result = await preparePages(store, process.env.SOURCE_DIR, arg);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Pages pending: ${result.pagesPending}; Worker status: unknown.\n`);
  } else if (command === 'check') {
    independentIdentity(process.env); checkPublication(store, process.env.EXPECTED_WORKER_URL);
  } else if (command === 'verify-staged') await verifyStaged({ store, previousStore: arg });
  else if (command === 'audit') await auditPages(store);
  else throw new Error('Unknown Pages command');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await cli();
