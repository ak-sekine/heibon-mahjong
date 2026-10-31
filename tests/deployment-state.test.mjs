import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLatestSuccessfulDeployment,
  recordSuccessfulDeployment,
} from '../.github/scripts/deployment-state.mjs';

const sha = 'a'.repeat(40);

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('latest release lookup skips failed deployments and returns the actual successful SHA', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/deployments?environment=heibon-production-worker&per_page=100')) {
      return jsonResponse([{ id: 9, sha: 'b'.repeat(40) }, { id: 8, sha }]);
    }
    if (url.endsWith('/deployments/9/statuses?per_page=1')) return jsonResponse([{ state: 'failure' }]);
    if (url.endsWith('/deployments/8/statuses?per_page=1')) return jsonResponse([{ state: 'success' }]);
    throw new Error(`Unexpected request ${url}`);
  };
  const result = await getLatestSuccessfulDeployment({
    owner: 'owner', repo: 'repo', environment: 'heibon-production-worker', token: 'secret', fetchImpl,
  });
  assert.deepEqual(result, { sha, id: 8 });
  assert.equal(calls.length, 3);
});

test('no deployment history is distinct from an API error', async () => {
  const noRecords = await getLatestSuccessfulDeployment({
    owner: 'owner', repo: 'repo', environment: 'heibon-production-pages', token: 'secret',
    fetchImpl: async () => jsonResponse([]),
  });
  assert.equal(noRecords, null);
  await assert.rejects(getLatestSuccessfulDeployment({
    owner: 'owner', repo: 'repo', environment: 'heibon-production-pages', token: 'secret',
    fetchImpl: async () => jsonResponse({ message: 'denied' }, 403),
  }), /HTTP 403/);
});

test('successful deployment record confirms the service SHA through deployment API', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST' && url.endsWith('/deployments')) {
      return jsonResponse({ id: 17, sha, environment: 'heibon-production-pages' });
    }
    if (options.method === 'POST' && url.endsWith('/deployments/17/statuses')) return jsonResponse({ state: 'success' });
    throw new Error(`Unexpected request ${url}`);
  };
  const result = await recordSuccessfulDeployment({
    owner: 'owner', repo: 'repo', service: 'pages', sha, token: 'secret', fetchImpl,
  });
  assert.deepEqual(result, { environment: 'heibon-production-pages', sha });
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].options.body).ref, sha);
  assert.equal(JSON.parse(calls[0].options.body).environment, 'heibon-production-pages');
  assert.equal(JSON.parse(calls[1].options.body).state, 'success');
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret');
});

test('failed state recording reports failure rather than claiming a successful record', async () => {
  await assert.rejects(recordSuccessfulDeployment({
    owner: 'owner', repo: 'repo', service: 'worker', sha, token: 'secret',
    fetchImpl: async () => jsonResponse({ message: 'denied' }, 403),
  }), /HTTP 403/);
});
