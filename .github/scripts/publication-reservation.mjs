import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIssueRef } from '../../scripts/environments/issue-ref.mjs';
import { validateEvidence } from './reuse-production-ci.mjs';
import { digest, inventory, stage } from '../../scripts/environments/artifacts.mjs';

export function publicationIdentity(env) {
  const issue = env.GITHUB_REPOSITORY === 'ak-sekine/heibon-mahjong' && isIssueRef(env.GITHUB_REF);
  const branch = issue ? env.GITHUB_REF.slice('refs/heads/'.length)
    : { 'refs/heads/main': 'main', 'refs/heads/develop': 'develop' }[env.GITHUB_REF];
  if (!branch || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Wrong deployment branch or event');
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA) ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID) || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT)) {
    throw new Error('Missing publication identity');
  }
  if (issue && (env.GITHUB_WORKFLOW_REF !== `${env.GITHUB_REPOSITORY}/.github/workflows/environments.yml@${env.GITHUB_REF}` ||
      env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA)) throw new Error('Wrong Issue publication workflow identity');
  return {
    branch, environment: branch === 'main' ? 'production' : 'development',
    sha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    ...(issue ? { sourceRef: env.GITHUB_REF, workflowRef: env.GITHUB_WORKFLOW_REF, workflowSha: env.GITHUB_WORKFLOW_SHA } : {}),
  };
}

function remoteSha(ref, env, exec) {
  return exec('gh', ['api', `repos/${env.GITHUB_REPOSITORY}/git/ref/heads/${ref}`, '--jq', '.object.sha'], { encoding: 'utf8' }).trim();
}

export function preparePublication(store, candidate, workerUrl, env = process.env, exec = execFileSync) {
  const publication = publicationIdentity(env);
  if (!workerUrl) throw new Error('Missing expected Worker endpoint');
  const latestSha = remoteSha(publication.branch, env, exec);
  if (latestSha !== publication.sha) throw new Error('Stale source SHA');
  if (publication.sourceRef) {
    if (publication.attempt !== '1') throw new Error('Issue publication requires a new explicit dispatch');
    publication.baseSha = remoteSha('main', env, exec);
    const status = exec('gh', ['api', `repos/${env.GITHUB_REPOSITORY}/compare/${publication.baseSha}...${publication.sha}`,
      '--jq', '.status'], { encoding: 'utf8' }).trim();
    if (status !== 'ahead') throw new Error('Issue candidate is not based on current main');
  }
  if (env.REUSE_PRODUCTION === 'true') {
    if (publication.environment !== 'production' || publication.attempt !== '1') {
      throw new Error('Only a new production dispatch can reuse verification');
    }
    publication.sourceVerification = validateEvidence(JSON.parse(env.SOURCE_VERIFICATION));
    if (String(publication.sourceVerification.runId) === publication.runId) {
      throw new Error('Source and publication run must differ');
    }
  } else if (env.SOURCE_VERIFICATION) throw new Error('Unexpected source verification evidence');
  stage(store, candidate, latestSha, workerUrl, publication);
}

export function checkPublication(store, workerUrl, env = process.env, exec = execFileSync) {
  return verifyReservation(store, workerUrl, env, exec, true);
}

// The workflow calls this only downstream of a successful production Worker job.
export function checkProductionContinuation(store, workerUrl, env = process.env, exec = execFileSync) {
  if (env.GITHUB_REPOSITORY !== 'ak-sekine/heibon-mahjong' || env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Only production publication can continue on a pinned SHA');
  }
  return verifyReservation(store, workerUrl, env, exec, false);
}

function verifyReservation(store, workerUrl, env, exec, requireSourceHead) {
  const publication = publicationIdentity(env);
  const commit = env.PUBLICATION_SNAPSHOT;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Missing reserved snapshot commit');
  const checkedOut = exec('git', ['-C', store, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (checkedOut !== commit) throw new Error('Wrong reserved snapshot checkout');
  const state = JSON.parse(readFileSync(path.join(store, 'state.json'), 'utf8'));
  const pending = state.pending;
  const release = pending?.current?.[publication.environment];
  if (state.version !== 1 || pending?.environment !== publication.environment ||
      pending.sha !== publication.sha || pending.reservation?.runId !== publication.runId ||
      pending.reservation?.attempt !== publication.attempt || release?.sha !== publication.sha ||
      !workerUrl || release.workerUrl !== workerUrl) throw new Error('Pending snapshot does not belong to this publication attempt');
  if (publication.sourceRef && (
    release.publication?.sourceRef !== publication.sourceRef ||
    release.publication.workflowRef !== publication.workflowRef ||
    release.publication.workflowSha !== publication.workflowSha ||
    release.publication.runId !== publication.runId ||
    release.publication.attempt !== publication.attempt
  )) throw new Error('Wrong saved publication identity');
  if (publication.sourceRef && remoteSha('main', env, exec) !== release.publication.baseSha) {
    throw new Error('Main changed after Issue reservation');
  }
  if (digest(inventory(path.join(store, 'site'))) !== pending.siteDigest) throw new Error('Pending snapshot mismatch');
  if (remoteSha('pages-verified', env, exec) !== commit) throw new Error('Remote snapshot changed after reservation');
  if (requireSourceHead && remoteSha(publication.branch, env, exec) !== publication.sha) throw new Error('Stale source SHA');
  return publication.environment;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [command, store, candidate] = process.argv.slice(2);
  if (command === 'prepare') preparePublication(store, candidate, process.env.EXPECTED_WORKER_URL);
  else if (command === 'check') checkPublication(store, process.env.EXPECTED_WORKER_URL);
  else if (command === 'check-production-continuation') checkProductionContinuation(store, process.env.EXPECTED_WORKER_URL);
  else throw new Error('Unknown publication reservation command');
}
