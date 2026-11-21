import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { digest, inventory, sha256 } from '../../scripts/environments/pages-live-audit.mjs';

const repo = 'ak-sekine/heibon-mahjong';
assert.equal(process.env.GITHUB_REPOSITORY, repo);
const main = 'c4baa3be9994fcc6d50d57ed3a7bf3ae998aa2ea';
const develop = '592e49088e1e5b1823722d6519c80edb432cab15';
const reservation = '1d538542c75bf0b49f468acb55ad414c35ce0c10';
const rollbackVersion = '85e9510f-3f21-45c1-b0ff-4a4de66e7749';
const partialDeployment = 'e951a473-6ec3-452d-9625-1d9ba4c8fbff';
const originalDeployment = '3b6587ac-79fd-49a8-b6d1-2f77a9022331';
const base = 'https://ak-sekine.github.io/heibon-mahjong/';
const previous = JSON.parse(readFileSync('previous/state.json'));
const staged = JSON.parse(readFileSync('store/state.json'));
assert.deepEqual(staged.pending.reservation, {runId: '44869022035', attempt: '1'});
assert.equal(staged.pending.sha, main);
assert.equal(staged.pending.environment, 'production');
assert.equal(previous.pending, null);
assert.deepEqual(previous.current, staged.current);
assert.deepEqual(previous.current, staged.pending.previous);
assert.deepEqual(previous.current.development, staged.pending.current.development);
assert.deepEqual(inventory('previous/site/dev'), inventory('store/site/dev'));
assert.equal(digest(inventory('store/site')), '88d13c11d6c3a8a2349365c63474a6ea6ceecc9bd70453b66dc64e36822e2929');
assert.equal(staged.pending.siteDigest, '88d13c11d6c3a8a2349365c63474a6ea6ceecc9bd70453b66dc64e36822e2929');

function github(relative) {
  return JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${relative}`], {encoding: 'utf8'}));
}
function readStableEvidence() {
  for (const [branch, sha] of [['main', main], ['develop', develop], ['pages-verified', reservation]]) {
    assert.equal(github(`commits/${branch}`).sha, sha);
  }
  for (const status of ['in_progress', 'queued', 'pending', 'waiting', 'requested']) {
    const response = github(`actions/runs?status=${status}&per_page=100`);
    assert(response.total_count <= 100);
    assert(!response.workflow_runs.some(run => run.event === 'workflow_dispatch' && run.path === '.github/workflows/environments.yml'));
  }
  assert.equal(github('actions/workflows/deploy.yml').state, 'disabled_manually');
  for (const [environment, id] of [['worker-production', 7959080796], ['worker-development', 7927498780], ['github-pages', 7927524147]]) {
    assert.equal(github(`deployments?environment=${environment}&per_page=1`)[0]?.id, id);
    assert.equal(github(`deployments/${id}/statuses?per_page=1`)[0]?.state, 'success');
  }
}
async function get(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, {method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(12000)});
  } catch { throw new Error(`GET transport failed at ${new URL(url).hostname}`); }
  assert.equal(response.status, 200, `non-200 from ${new URL(url).hostname}`);
  return response;
}
async function worker() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  assert(token && /^[\da-f]{32}$/i.test(account), 'Cloudflare read credentials unavailable');
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/heibon-mahjong-online/deployments`;
  const result = await (await get(url, {authorization: `Bearer ${token}`})).json();
  assert.equal(result.success, true);
  const latest = (result.result.deployments ?? result.result)[0];
  assert.notEqual(latest.id, partialDeployment);
  assert.notEqual(latest.id, originalDeployment);
  assert(Date.parse(latest.created_on) > Date.parse('2026-11-21T05:26:42.973104Z'), 'Latest production deployment predates the rollback');
  assert.equal(latest.versions.length, 1);
  assert.equal(latest.versions[0].version_id, rollbackVersion);
  assert.equal(latest.versions[0].percentage, 100);
  for (const id of [latest.id, latest.versions[0].version_id]) assert.match(id, /^[\da-f-]{36}$/i);
  return {deployment: latest.id, version: latest.versions[0].version_id, percentage: latest.versions[0].percentage, createdOn: latest.created_on};
}
readStableEvidence();
const before = await worker();
console.log('Current Cloudflare production Worker '+JSON.stringify(before));
for (const environment of ['production', 'development']) {
  const url = previous.current[environment].workerUrl + '/health';
  const response = await get(url, {Origin: new URL(base).origin});
  assert.equal((await response.json()).ok, true);
  assert.equal(response.headers.get('access-control-allow-origin'), new URL(base).origin);
  console.log(`${environment} Worker health HTTP 200`);
}
const expected = inventory('previous/site');
assert.equal(Object.keys(expected).length, 35);
for (let index = 0, entries = Object.entries(expected); index < entries.length; index += 4) {
  await Promise.all(entries.slice(index, index + 4).map(async ([name, hash]) => {
    const url = new URL(name.split('/').map(encodeURIComponent).join('/'), base);
    url.searchParams.set('issue47-inspection', process.env.GITHUB_RUN_ID);
    const response = await get(url, {'cache-control': 'no-cache'});
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), hash, `${name} differs`);
    console.log(`HTTP 200 SHA-256 match ${name}`);
  }));
}
assert.deepEqual(await worker(), before);
readStableEvidence();
console.log('Production and development 16/16 each; metadata 3/3; deployments and heads stable.');
