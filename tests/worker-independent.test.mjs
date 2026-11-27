import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configuration, inspectWorker, publishWorker, confirmOnline } from '../.github/scripts/worker-independent.mjs';

const sha = 'a'.repeat(40), oldSha = 'b'.repeat(40);
const oldVersion = '11111111-1111-4111-8111-111111111111', newVersion = '22222222-2222-4222-8222-222222222222';
function env(branch = 'main') {
  return { GITHUB_REPOSITORY: 'ak-sekine/heibon-mahjong', GITHUB_REF: `refs/heads/${branch}`, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: sha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_WORKFLOW_REF: `ak-sekine/heibon-mahjong/.github/workflows/environments.yml@refs/heads/${branch}`, GITHUB_WORKFLOW_SHA: sha, GH_TOKEN: 'fixture', CLOUDFLARE_API_TOKEN: 'fixture', CLOUDFLARE_ACCOUNT_ID: 'f'.repeat(32), EXPECTED_WORKER_URL: branch === 'main' ? 'https://heibon-mahjong-online.ak-sekine.workers.dev' : 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev' };
}
function fixture(branch = 'main') {
  const config = configuration(env(branch));
  let active = oldVersion, nextId = 9, deploys = 0, failStart = false, failSuccess = false;
  const records = [{ id: 8, sha: oldSha, environment: config.ledgerEnvironment, payload: { worker: config.name, environment: config.environment, runId: '122', attempt: '1' }, statuses: [{ state: 'success', description: `verified:${oldVersion}` }] }];
  const api = {
    list: async () => records.slice(0, 1),
    get: async id => records.find(d => d.id === id),
    statuses: async id => records.find(d => d.id === id).statuses,
    ref: async branch => ({ object: { sha: branch === 'main' && config.environment === 'development' ? oldSha : sha } }),
    compare: async () => ({ status: 'ahead' }),
    live: async () => ({ success: true, result: { deployments: [{ versions: [{ version_id: active, percentage: 100 }] }] } }),
    create: async body => { if (failStart) throw Error('denied'); const d = { ...body, sha: body.ref, id: nextId++, statuses: [] }; records.unshift(d); return d; },
    status: async (id, status) => { if (failSuccess && status.description.startsWith('deployed:')) throw Error('denied'); records.find(d => d.id === id).statuses.unshift(status); return status; },
  };
  const git = (_cmd, args) => args[0] === 'diff' ? 'worker/index.ts\0' : '';
  const deploy = async () => { deploys++; active = newVersion; return `${config.url}\nCurrent Version ID: ${newVersion}\n`; };
  return { config, api, deploy, git, records, get deploys() { return deploys; }, set failStart(v) { failStart = v; }, set failSuccess(v) { failSuccess = v; }, set active(v) { active = v; } };
}
for (const branch of ['main', 'issue/69-test']) test(`worker-only ${branch}: start, deploy and online confirmation`, async () => {
  const f = fixture(branch);
  const r = await publishWorker(f.config, f.api, f.deploy, f.git);
  assert.equal(r.workerPending, true); assert.equal(r.classification, 'unknown');
  assert.equal(f.records[0].statuses[0].description, `deployed:${newVersion}`);
  await assert.rejects(inspectWorker(f.config, f.api), /online verification incomplete/);
  await confirmOnline(f.config, f.api, r.id, r.version);
  assert.equal((await inspectWorker(f.config, f.api)).sha, sha);
  assert.equal(f.deploys, 1);
});
test('start record failure does not invoke deploy', async () => {
  const f = fixture(); f.failStart = true;
  await assert.rejects(publishWorker(f.config, f.api, f.deploy, f.git), /denied/);
  assert.equal(f.deploys, 0);
});
test('interrupted deployment and failed post-deployment record both leave an unresolved latest record', async () => {
  for (const failStatus of [false, true]) {
    const f = fixture(); f.failSuccess = failStatus;
    const deploy = failStatus ? f.deploy : async () => { throw Error('cancelled'); };
    await assert.rejects(publishWorker(f.config, f.api, deploy, f.git));
    await assert.rejects(inspectWorker(f.config, f.api), /unknown/);
    assert.equal(f.records[0].statuses[0].state, 'pending');
  }
});
test('preflight rejects wrong environment, out of band version, unknown latest and stale candidate', async () => {
  const wrong = env(); wrong.EXPECTED_WORKER_URL = env('issue/69-test').EXPECTED_WORKER_URL;
  assert.throws(() => configuration(wrong), /URL or environment/);
  let f = fixture(); f.active = newVersion;
  await assert.rejects(publishWorker(f.config, f.api, f.deploy, f.git), /differs/); assert.equal(f.deploys, 0);
  f = fixture(); f.records.unshift({ id: 10, sha, environment: f.config.ledgerEnvironment, payload: { worker: f.config.name, environment: f.config.environment, runId: '123', attempt: '1' }, statuses: [{ state: 'pending' }] });
  await assert.rejects(inspectWorker(f.config, f.api), /unknown/);
  f = fixture(); f.api.ref = async () => ({ object: { sha: oldSha } });
  await assert.rejects(publishWorker(f.config, f.api, f.deploy, f.git), /Stale/); assert.equal(f.deploys, 0);
});
test('worker-only workflow connects the real script and online check and skips Pages reservation', () => {
  const wf = readFileSync('.github/workflows/publish-environments.yml', 'utf8');
  const block = wf.split('  worker-only:\n')[1].split('  worker-production:\n')[0];
  assert.match(block, /deploy-isolated-worker\.mjs independent/);
  assert.match(block, /test:online:production/);
  assert.match(block, /worker-online-confirm\.mjs/);
  assert.doesNotMatch(block, /pages-verified|upload-pages-artifact|deploy-pages|finalize|publication-reservation\.mjs/);
  assert.match(wf, /inputs\.publication_target == 'both'/);
  assert.match(wf, /group: pages-publication/);
});

test('untrusted baseline, permissions, missing source and split traffic stop before deployment', async () => {
  for (const kind of ['missing-baseline', 'missing-run', 'forbidden-status', 'diff-failed', 'split-traffic', 'stale-main']) {
    const f = fixture(kind === 'stale-main' ? 'issue/69-test' : 'main');
    if (kind === 'missing-baseline') f.records.length = 0;
    if (kind === 'missing-run') delete f.records[0].payload.runId;
    if (kind === 'forbidden-status') f.api.status = async () => { throw Error('permission denied'); };
    if (kind === 'split-traffic') f.api.live = async () => ({ success: true, result: { deployments: [{ versions: [{ version_id: oldVersion, percentage: 50 }, { version_id: newVersion, percentage: 50 }] }] } });
    if (kind === 'stale-main') f.api.compare = async () => ({ status: 'behind' });
    await assert.rejects(publishWorker(f.config, f.api, f.deploy, kind === 'diff-failed' ? () => { throw Error('git failed'); } : f.git), undefined, kind);
    assert.equal(f.deploys, 0, kind);
  }
});
test('online failure, verification recording failure and a newer competing record never permit the next publication', async () => {
  for (const scenario of ['online-failed', 'online-status-denied', 'competing-record']) {
    const f = fixture();
    const r = await publishWorker(f.config, f.api, f.deploy, f.git);
    if (scenario === 'online-status-denied') {
      f.api.status = async () => { throw Error('permission denied'); };
      await assert.rejects(confirmOnline(f.config, f.api, r.id, r.version), /denied/);
    }
    if (scenario === 'competing-record') {
      f.records.unshift({ id: 50, sha, environment: f.config.ledgerEnvironment, payload: { worker: f.config.name, environment: f.config.environment, runId: '124', attempt: '1' }, statuses: [{ state: 'pending' }] });
      await assert.rejects(confirmOnline(f.config, f.api, r.id, r.version), /history changed/);
    }
    await assert.rejects(inspectWorker(f.config, f.api), /unknown|incomplete/);
    await assert.rejects(publishWorker(f.config, f.api, f.deploy, f.git), /unknown|incomplete/);
    assert.equal(f.deploys, 1);
  }
});

for (const branch of ['main', 'issue/69-test']) test(`first Worker publication establishes the verified ${branch} baseline`, async () => {
  const f = fixture(branch); f.records.length = 0;
  f.config.firstPublication = true; f.config.expectedCurrentVersion = oldVersion;
  const result = await publishWorker(f.config, f.api, f.deploy, f.git);
  assert.equal(result.workerPending, null);
  assert.equal(f.records[0].statuses[0].description, `deployed:${newVersion}`);
  await assert.rejects(inspectWorker(f.config, f.api), /incomplete/);
  await confirmOnline(f.config, f.api, result.id, result.version);
  assert.deepEqual(await inspectWorker(f.config, f.api), { id: result.id, sha, version: newVersion });
  await assert.rejects(publishWorker(f.config, f.api, f.deploy, f.git), /no existing independent record/);
  assert.equal(f.deploys, 1);
});

test('first Worker publication fails closed before deploy on missing proof, competing record or version change', async () => {
  for (const scenario of ['record', 'api-error', 'invalid-list', 'wrong-version', 'split', 'record-race', 'version-race', 'ref-race', 'create-error']) {
    const f = fixture(); f.records.length = 0; f.config.firstPublication = true; f.config.expectedCurrentVersion = oldVersion;
    if (scenario === 'record') f.records.push({ id: 1, statuses: [{ state: 'failure' }] });
    if (scenario === 'api-error') f.api.list = async () => { throw Error('API unavailable'); };
    if (scenario === 'invalid-list') f.api.list = async () => ({ error: 'not a deployment list' });
    if (scenario === 'wrong-version') f.active = newVersion;
    if (scenario === 'split') f.api.live = async () => ({ success: true, result: { deployments: [{ versions: [{ version_id: oldVersion, percentage: 50 }, { version_id: newVersion, percentage: 50 }] }] } });
    if (scenario === 'record-race') { let n=0; f.api.list = async () => ++n === 1 ? [] : [{ id: 3 }]; }
    if (scenario === 'version-race') { let n=0; f.api.live = async () => ({ success: true, result: { deployments: [{ versions: [{ version_id: ++n === 1 ? oldVersion : newVersion, percentage: 100 }] }] } }); }
    if (scenario === 'ref-race') { let n=0; f.api.ref = async () => ({ object: { sha: ++n === 1 ? sha : oldSha } }); }
    if (scenario === 'create-error') f.failStart = true;
    await assert.rejects(publishWorker(f.config, f.api, f.deploy, f.git), undefined, scenario);
    assert.equal(f.deploys, 0, scenario);
  }
});

test('first Worker publication preserves unresolved records after start, deploy or online failure', async () => {
  for (const scenario of ['pending-status-failure', 'cancel', 'record-failure', 'online-failure', 'verified-status-failure']) {
    const f = fixture(); f.records.length = 0; f.config.firstPublication = true; f.config.expectedCurrentVersion = oldVersion;
    if (scenario === 'record-failure') f.failSuccess = true;
    if (scenario === 'pending-status-failure') f.api.status = async () => { throw Error('pending denied'); };
    if (scenario === 'online-failure' || scenario === 'verified-status-failure') {
      const result = await publishWorker(f.config, f.api, f.deploy, f.git);
      if (scenario === 'verified-status-failure') {
        f.api.status = async () => { throw Error('verification denied'); };
        await assert.rejects(confirmOnline(f.config, f.api, result.id, result.version), /verification denied/);
      }
      await assert.rejects(inspectWorker(f.config, f.api), /incomplete/);
    } else await assert.rejects(publishWorker(f.config, f.api, scenario === 'cancel' ? async () => { throw Error('cancelled'); } : f.deploy, f.git));
    await assert.rejects(publishWorker(f.config, f.api, f.deploy, f.git), /no existing independent record/);
    assert.ok(f.records.length === 1);
    if (scenario === 'pending-status-failure') assert.equal(f.deploys, 0);
  }
});

test('first publication input requires explicit worker target, publish and valid approved version', () => {
  const input = { ...env(), CLOUDFLARE_ACCOUNT_ID: 'abb9bbfd207cd6e56648a331d5638f6b', WORKER_FIRST_PUBLICATION: 'true', PUBLICATION_TARGET: 'worker', PUBLISH_REQUESTED: 'true', EXPECTED_CURRENT_WORKER_VERSION: oldVersion };
  assert.equal(configuration(input).expectedCurrentVersion, oldVersion);
  for (const override of [{ PUBLICATION_TARGET: 'pages' }, { PUBLICATION_TARGET: 'both' }, { PUBLICATION_TARGET: 'auto' }, { PUBLICATION_TARGET: 'none' }, { PUBLISH_REQUESTED: 'false' }, { EXPECTED_CURRENT_WORKER_VERSION: '' }, { CLOUDFLARE_ACCOUNT_ID: 'f'.repeat(32) }]) assert.throws(() => configuration({ ...input, ...override }), /Invalid first/);
  assert.throws(() => configuration({ ...input, WORKER_FIRST_PUBLICATION: 'false' }), /Unexpected/);
});
