import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { digest, inventory, sha256 } from '../../scripts/environments/pages-live-audit.mjs';

const repo = 'ak-sekine/heibon-mahjong';
assert.equal(process.env.GITHUB_REPOSITORY, repo);
const main = '0e1185df53cc17ae08cb4be3a105f3b61b9c8528';
const develop = '592e49088e1e5b1823722d6519c80edb432cab15';
const restored = '4ea775f823c0e9bc38561c106278a2ea89e421b3';
const prePublicationProduction = 'c3b84944daaa8fbba3b4b603c0d3f8430e9afb58';
const publishedDevelopment = 'c3a6b6c4eeb72c82b8152ea299511df26e49c435';
const rollbackDeployment = 'a8fb67ec-a42d-47a8-b626-273e86806e05';
const rollbackVersion = '85e9510f-3f21-45c1-b0ff-4a4de66e7749';
const base = 'https://ak-sekine.github.io/heibon-mahjong/';
const { AUDIT_SNAPSHOT: snapshot, AUDIT_PRODUCTION_RUN: publishRun } = process.env;
assert.match(snapshot, /^[\da-f]{40}$/);
assert.match(publishRun, /^(?:\d+)?$/);
const git = (...args) => execFileSync('git', ['-C', 'store', ...args], {encoding: 'utf8'}).trim();
assert.equal(git('rev-parse', 'HEAD'), snapshot);
if (publishRun) {
  assert.equal(git('rev-parse', 'HEAD^^'), restored);
  git('diff', '--exit-code', restored, 'HEAD', '--', 'site/dev');
  git('diff', '--exit-code', 'HEAD^', 'HEAD', '--', 'site');
  const reserved = JSON.parse(git('show', 'HEAD^:state.json'));
  assert.equal(reserved.pending.environment, 'production');
  assert.equal(reserved.pending.sha, main);
  assert.deepEqual(reserved.pending.reservation, {runId: publishRun, attempt: '1'});
  assert.equal(reserved.pending.siteDigest, digest(inventory('store/site')));
} else {
  assert.equal(snapshot, restored);
}
const state = JSON.parse(readFileSync('store/state.json'));
assert.equal(state.pending, null);
assert.deepEqual(state.current, JSON.parse(readFileSync('store/site/environments.json')));
assert.equal(state.current.production.sha, publishRun ? main : prePublicationProduction);
assert.equal(state.current.development.sha, publishedDevelopment);
for (const environment of ['production', 'development']) {
  const isProduction = environment === 'production';
  const preference = isProduction ? '' : '-dev';
  const root = isProduction ? 'store/site' : 'store/site/dev';
  const release = JSON.parse(readFileSync(root + '/release.json'));
  const files = inventory(root);
  if (isProduction) {
    for (const file of Object.keys(files)) {
      if (file.startsWith('dev/') || file === 'environments.json') delete files[file];
    }
  }
  assert.equal(digest(files), state.current[environment].snapshotDigest);
  delete files['release.json'];
  assert.equal(Object.keys(files).length, 16);
  assert.deepEqual(files, release.files);
  assert.equal(digest(files), release.digest);
  for (const key of ['sha', 'workerUrl', 'digest']) assert.equal(release[key], state.current[environment][key]);
  assert.equal(release.workerUrl, `https://heibon-mahjong-online${preference}.ak-sekine.workers.dev`);
  console.log(`${environment} saved SHA ${release.sha} digest ${release.digest}`);
}

function github(relative) {
  return JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${relative}`], {encoding: 'utf8'}));
}
function deployed(environment, expectedId, run, sha) {
  const latest = github(`deployments?environment=${environment}&per_page=1`)[0];
  assert(latest && latest.environment === environment);
  if (expectedId) assert.equal(latest.id, expectedId);
  if (sha) assert.equal(latest.sha, sha);
  const status = github(`deployments/${latest.id}/statuses?per_page=1`)[0];
  assert.equal(status.state, 'success');
  if (run) assert(status.log_url.startsWith(`https://github.com/${repo}/actions/runs/${run}/`));
  return latest.id;
}
function stableEvidence() {
  for (const [branch, sha] of [['main', main], ['develop', develop], ['pages-verified', snapshot]]) {
    assert.equal(github(`commits/${branch}`).sha, sha);
  }
  for (const status of ['in_progress', 'queued', 'pending', 'waiting', 'requested']) {
    const response = github(`actions/runs?status=${status}&per_page=100`);
    assert(response.total_count <= 100);
    assert(!response.workflow_runs.some(run => {
      const path = run.path.split('@')[0];
      return path === '.github/workflows/deploy.yml' || path === '.github/workflows/bootstrap-development-worker.yml'
        || (run.event === 'workflow_dispatch' && path === '.github/workflows/environments.yml');
    }));
  }
  assert.equal(github('actions/workflows/deploy.yml').state, 'disabled_manually');
  return {
    productionWorker: deployed('worker-production', publishRun ? null : 7959080796, publishRun, publishRun ? main : null),
    developmentWorker: deployed('worker-development', 7927498780, null, publishedDevelopment),
    pages: deployed('github-pages', publishRun ? null : 7927524147, publishRun, publishRun ? main : null),
  };
}
let productionDeployStep;
if (publishRun) {
  const run = github(`actions/runs/${publishRun}`);
  assert.equal(run.head_sha, main);
  assert.equal(run.head_branch, 'main');
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.run_attempt, 1);
  assert.equal(run.conclusion, 'success');
  const jobs = github(`actions/runs/${publishRun}/attempts/1/jobs?per_page=100`).jobs;
  for (const name of ['worker-credentials', 'reserve', 'worker-production', 'online', 'publish']) {
    assert.equal(jobs.find(job => job.name === `publish / ${name}`)?.conclusion, 'success');
  }
  assert.equal(jobs.find(job => job.name === 'publish / worker-development')?.conclusion, 'skipped');
  productionDeployStep = jobs.find(job => job.name === 'publish / worker-production').steps
    .find(step => step.name.includes('deploy-isolated-worker.mjs'));
  assert.equal(productionDeployStep?.conclusion, 'success');
}
async function get(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, {method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(12000)});
  } catch { throw new Error(`GET transport failed at ${new URL(url).pathname}`); }
  assert.equal(response.status, 200, `non-200 from ${new URL(url).pathname}`);
  return response;
}
async function worker(script) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  assert(token && /^[\da-f]{32}$/i.test(account), 'Cloudflare read credentials unavailable');
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${script}/deployments`;
  const response = await fetch(url, {headers: {authorization: `Bearer ${token}`}, redirect: 'error', signal: AbortSignal.timeout(12000)})
    .catch(() => { throw new Error('Cloudflare deployments GET transport failed'); });
  assert.equal(response.status, 200, `Cloudflare deployments GET failed for ${script}`);
  const result = await response.json();
  assert.equal(result.success, true);
  const latest = (result.result.deployments ?? result.result)[0];
  assert.equal(latest.versions.length, 1);
  const { version_id: version, percentage } = latest.versions[0];
  assert.equal(percentage, 100);
  for (const id of [latest.id, version]) assert.match(id, /^[\da-f-]{36}$/i);
  assert(Number.isFinite(Date.parse(latest.created_on)));
  return {deployment: latest.id, version, percentage, createdOn: latest.created_on};
}
const githubBefore = stableEvidence();
const production = await worker('heibon-mahjong-online');
const development = await worker('heibon-mahjong-online-dev');
if (publishRun) {
  assert(Date.parse(production.createdOn) >= Date.parse(productionDeployStep.started_at)
    && Date.parse(production.createdOn) <= Date.parse(productionDeployStep.completed_at), 'Active Cloudflare deployment outside the production deploy step');
  assert(Date.parse(development.createdOn) < Date.parse(productionDeployStep.started_at), 'Development Worker changed during production release');
} else {
  assert.equal(production.deployment, rollbackDeployment);
  assert.equal(production.version, rollbackVersion);
}
console.log('GitHub deployment IDs ' + JSON.stringify(githubBefore));
console.log('Active Cloudflare production Worker ' + JSON.stringify(production));
console.log('Active Cloudflare development Worker ' + JSON.stringify(development));
for (const environment of ['production', 'development']) {
  const response = await get(state.current[environment].workerUrl + '/health', {Origin: new URL(base).origin});
  assert.equal((await response.json()).ok, true);
  assert.equal(response.headers.get('access-control-allow-origin'), new URL(base).origin);
  console.log(`${environment} Worker health HTTP 200`);
}
const expected = inventory('store/site');
assert.equal(Object.keys(expected).length, 35);
const entries = [...Object.entries(expected), ['', expected['index.html']], ['dev/', expected['dev/index.html']]];
for (let index = 0; index < entries.length; index += 4) {
  await Promise.all(entries.slice(index, index + 4).map(async ([name, hash]) => {
    const url = new URL(name.split('/').map(encodeURIComponent).join('/'), base);
    url.searchParams.set('issue47-inspection', process.env.GITHUB_RUN_ID);
    const response = await get(url, {'cache-control': 'no-cache'});
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), hash, `${name || '/'} differs`);
    console.log(`HTTP 200 SHA-256 match ${name || '/'}`);
  }));
}
assert.deepEqual(await worker('heibon-mahjong-online'), production);
assert.deepEqual(await worker('heibon-mahjong-online-dev'), development);
assert.deepEqual(stableEvidence(), githubBefore);
console.log('Production and development 16/16 each; metadata 3/3; both root URLs matched index.html; deployments and heads stable.');
