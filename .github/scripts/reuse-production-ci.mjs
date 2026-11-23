import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySealed } from '../../scripts/environments/artifacts.mjs';
import { REQUIRED_ENVIRONMENT_JOBS } from './check-browser-ui-matrix.mjs';

export const REPOSITORY = 'ak-sekine/heibon-mahjong';
export const REPOSITORY_ID = 1415016053;
export const WORKFLOW_ID = 415213931;
const WORKFLOW_PATH = '.github/workflows/environments.yml';
export const WORKFLOW_REF = REPOSITORY + '/' + WORKFLOW_PATH + '@refs/heads/main';
const REPO = 'repos/' + REPOSITORY;
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_ZIP_BYTES = 128 * 1024 * 1024;
const goodId = id => Number.isSafeInteger(id) && id > 0;
const repositoryMatches = repo => repo?.id === REPOSITORY_ID && repo.full_name === REPOSITORY;
const success = item => item?.status === 'completed' && item.conclusion === 'success';

export function readPages(endpoint, key, api) {
  const results = [];
  const ids = new Set();
  let total;
  for (let page = 1; ; page++) {
    const response = api(endpoint + (endpoint.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
    const items = response?.[key];
    total ??= response?.total_count;
    if (!Array.isArray(items) || !Number.isSafeInteger(total) || total < 0 ||
        response.total_count !== total || items.length !== Math.min(100, total - results.length)) {
      throw new Error('Incomplete or inconsistent GitHub API pagination: ' + key);
    }
    for (const item of items) {
      if (!goodId(item?.id) || ids.has(item.id)) throw new Error('Invalid or repeated GitHub API ID: ' + key);
      ids.add(item.id);
      results.push(item);
    }
    if (results.length === total) return results;
  }
}

function runMatches(run, id, sha) {
  return run?.id === id && run.workflow_id === WORKFLOW_ID && run.path === WORKFLOW_PATH &&
    repositoryMatches(run.repository) && repositoryMatches(run.head_repository) &&
    run.head_branch === 'main' && run.head_sha === sha && run.event === 'push' &&
    run.run_attempt === 1 && success(run);
}

function liveArtifact(artifact, now) {
  return goodId(artifact?.id) && DIGEST.test(artifact.digest) && artifact.expired === false &&
    Number.isFinite(Date.parse(artifact.expires_at)) && Date.parse(artifact.expires_at) > now &&
    goodId(artifact.size_in_bytes) && artifact.size_in_bytes <= MAX_ZIP_BYTES;
}

export function findVerifiedArtifact(sha, api, now = Date.now()) {
  if (!SHA.test(sha) || api(REPO + '/git/ref/heads/main')?.object?.sha !== sha) {
    throw new Error('Publication SHA is not current main');
  }
  const actions = REPO + '/actions';
  const workflow = api(actions + '/workflows/' + WORKFLOW_ID);
  if (workflow?.id !== WORKFLOW_ID || workflow.path !== WORKFLOW_PATH || workflow.state !== 'active') {
    throw new Error('Unexpected verification workflow');
  }
  const runs = readPages(actions + '/workflows/' + WORKFLOW_ID + '/runs?branch=main&event=push&head_sha=' + sha,
    'workflow_runs', api);
  if (runs.length !== 1 || !runMatches(runs[0], runs[0].id, sha)) {
    throw new Error('Expected one successful main push verification at attempt 1');
  }
  const runId = runs[0].id;
  const runPath = actions + '/runs/' + runId;
  if (!runMatches(api(runPath), runId, sha) || !runMatches(api(runPath + '/attempts/1'), runId, sha)) {
    throw new Error('Verification run or attempt identity changed');
  }
  const jobs = readPages(runPath + '/attempts/1/jobs', 'jobs', api);
  for (const name of REQUIRED_ENVIRONMENT_JOBS) {
    const matching = jobs.filter(job => job.name === name);
    if (matching.length !== 1 || matching[0].run_id !== runId || matching[0].run_attempt !== 1 || matching[0].head_sha !== sha || !success(matching[0])) {
      throw new Error('Missing or unsuccessful required verification job: ' + name);
    }
  }
  const artifacts = readPages(runPath + '/artifacts', 'artifacts', api);
  const candidates = artifacts.filter(artifact => artifact.name === 'pages-dist-' + sha + '-1');
  const artifact = candidates[0];
  if (candidates.length !== 1 || !liveArtifact(artifact, now)) throw new Error('Missing or expired verified Pages artifact');
  const proofName = 'pages-audit-' + artifact.id + '-' + artifact.digest.slice(7);
  const proofs = artifacts.filter(item => item.name === proofName);
  const detail = api(actions + '/artifacts/' + artifact.id);
  if (proofs.length !== 1 || !liveArtifact(proofs[0], now) || !liveArtifact(detail, now) ||
      detail.id !== artifact.id || detail.name !== artifact.name || detail.digest !== artifact.digest ||
      detail.size_in_bytes !== artifact.size_in_bytes || detail.expires_at !== artifact.expires_at ||
      detail.workflow_run?.id !== runId || detail.workflow_run.repository_id !== REPOSITORY_ID ||
      detail.workflow_run.head_repository_id !== REPOSITORY_ID ||
      detail.workflow_run.head_branch !== 'main' || detail.workflow_run.head_sha !== sha) {
    throw new Error('Pages artifact does not match verified run evidence');
  }
  return { workflowId: WORKFLOW_ID, workflowRef: WORKFLOW_REF, runId, attempt: 1, artifactId: artifact.id, digest: artifact.digest, expiresAt: artifact.expires_at };
}

export function checkArchive(bytes, digest) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_ZIP_BYTES ||
      !DIGEST.test(digest) || 'sha256:' + createHash('sha256').update(bytes).digest('hex') !== digest) {
    throw new Error('Pages artifact ZIP digest mismatch');
  }
}

export function checkCandidate(directory, sha, workerUrl) {
  const release = verifySealed(directory);
  if (release.environment !== 'production' || release.sha !== sha || release.workerUrl !== workerUrl) {
    throw new Error('Verified Pages candidate identity mismatch');
  }
}

export function validateEvidence(evidence) {
  if (evidence?.workflowId !== WORKFLOW_ID || evidence.workflowRef !== WORKFLOW_REF ||
      !goodId(evidence.runId) || evidence.attempt !== 1 || !goodId(evidence.artifactId) || !DIGEST.test(evidence.digest) || !Number.isFinite(Date.parse(evidence.expiresAt))) {
    throw new Error('Invalid source verification evidence');
  }
  return evidence;
}

function main() {
  const env = process.env;
  if (process.argv[2] === 'check-zip' && process.argv.length === 4) {
    const evidence = validateEvidence(JSON.parse(env.SOURCE_VERIFICATION));
    if (Date.parse(evidence.expiresAt) <= Date.now()) throw new Error('Verified Pages artifact expired before reservation');
    checkArchive(readFileSync(process.argv[3]), evidence.digest);
    return;
  }
  if (process.argv.length !== 2) throw new Error('Unexpected verification arguments');
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1' ||
      env.GITHUB_WORKFLOW_REF !== WORKFLOW_REF || env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA ||
      env.DUAL_PAGES_ENABLED !== 'true') throw new Error('Wrong production reuse dispatch');
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  const evidence = findVerifiedArtifact(env.GITHUB_SHA, api);
  const archive = path.join(env.RUNNER_TEMP, 'verified-pages.zip');
  const bytes = execFileSync('gh', ['api', REPO + '/actions/artifacts/' + evidence.artifactId + '/zip'],
    { maxBuffer: MAX_ZIP_BYTES, stdio: ['ignore', 'pipe', 'ignore'] });
  checkArchive(bytes, evidence.digest);
  writeFileSync(archive, bytes, { flag: 'wx' });
  const candidate = path.join(env.RUNNER_TEMP, 'verified-pages');
  execFileSync('python3', ['.github/scripts/extract-pages-zip.py', archive, candidate]);
  checkCandidate(candidate, env.GITHUB_SHA, env.PRODUCTION_WORKER_URL);
  if (JSON.stringify(findVerifiedArtifact(env.GITHUB_SHA, api)) !== JSON.stringify(evidence)) {
    throw new Error('Verification evidence changed during download');
  }
  appendFileSync(env.GITHUB_OUTPUT, 'evidence=' + JSON.stringify(evidence) + '\n');
  appendFileSync(env.GITHUB_STEP_SUMMARY, 'Verified main push run ' + evidence.runId + ', attempt 1, artifact ' +
    evidence.artifactId + ' (' + evidence.digest + ').\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
