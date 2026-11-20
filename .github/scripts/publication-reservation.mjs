import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, inventory, stage } from '../../scripts/environments/artifacts.mjs';

function publicationIdentity(env) {
  const branch = { 'refs/heads/main': 'main', 'refs/heads/develop': 'develop' }[env.GITHUB_REF];
  if (!branch || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Wrong deployment branch or event');
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA) ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID) || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT)) {
    throw new Error('Missing publication identity');
  }
  return {
    branch, environment: branch === 'main' ? 'production' : 'development',
    sha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
  };
}

function remoteSha(ref, env, exec) {
  return exec('gh', ['api', `repos/${env.GITHUB_REPOSITORY}/commits/${ref}`, '--jq', '.sha'], { encoding: 'utf8' }).trim();
}

export function preparePublication(store, candidate, workerUrl, env = process.env, exec = execFileSync) {
  const publication = publicationIdentity(env);
  if (!workerUrl) throw new Error('Missing expected Worker endpoint');
  const latestSha = remoteSha(publication.branch, env, exec);
  if (latestSha !== publication.sha) throw new Error('Stale source SHA');
  stage(store, candidate, latestSha, workerUrl, publication);
}

export function checkPublication(store, workerUrl, env = process.env, exec = execFileSync) {
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
  if (digest(inventory(path.join(store, 'site'))) !== pending.siteDigest) throw new Error('Pending snapshot mismatch');
  if (remoteSha('pages-verified', env, exec) !== commit) throw new Error('Remote snapshot changed after reservation');
  if (remoteSha(publication.branch, env, exec) !== publication.sha) throw new Error('Stale source SHA');
  return publication.environment;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [command, store, candidate] = process.argv.slice(2);
  if (command === 'prepare') preparePublication(store, candidate, process.env.EXPECTED_WORKER_URL);
  else if (command === 'check') checkPublication(store, process.env.EXPECTED_WORKER_URL);
  else throw new Error('Unknown publication reservation command');
}
