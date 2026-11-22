import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { digest, inventory } from './artifacts.mjs';
import { sha256, TARGETS } from './pages-live-audit.mjs';

function readJson(root, name) {
  return JSON.parse(readFileSync(path.join(root, name), 'utf8'));
}

function readComposite(root, current) {
  const site = path.join(root, 'site');
  const files = inventory(site);
  assert.deepEqual(Object.keys(current).sort(), ['development', 'production']);
  assert.deepEqual(readJson(site, 'environments.json'), current, 'Combined release metadata differs from the ledger');
  for (const environment of ['production', 'development']) {
    const prefix = environment === 'production' ? '' : 'dev/';
    const release = readJson(site, prefix + 'release.json');
    const record = current[environment];
    const snapshot = Object.fromEntries(Object.entries(files)
      .filter(([name]) => prefix ? name.startsWith(prefix) : !name.startsWith('dev/') && name !== 'environments.json')
      .map(([name, hash]) => [name.slice(prefix.length), hash]));
    assert.equal(digest(snapshot), record.snapshotDigest, `${environment} snapshot bytes changed`);
    delete snapshot['release.json'];
    assert.equal(release.version, 1);
    assert.equal(release.environment, environment);
    assert.equal(release.sha, record.sha);
    assert.equal(release.workerUrl, record.workerUrl);
    assert.deepEqual(snapshot, release.files, `${environment} release inventory differs`);
    assert.equal(digest(snapshot), record.digest);
    assert.equal(release.digest, record.digest);
  }
  return files;
}

/** Inspect the two already pinned Git trees. The caller verifies Git and external evidence. */
export function inspectRecoverySnapshots({ previousStore, store, expected }) {
  const previous = readJson(previousStore, 'state.json');
  const staged = readJson(store, 'state.json');
  assert.equal(previous.version, 1);
  assert.equal(previous.pending, null, 'Parent is not a finalized snapshot');
  assert.equal(staged.version, 1);
  assert.deepEqual(staged.current, previous.current, 'Current snapshot differs from the parent ledger');
  const { pending } = staged;
  assert.equal(pending?.environment, 'production', 'A production reservation is required');
  assert.deepEqual(pending.reservation, { runId: expected.runId, attempt: expected.attempt }, 'Wrong reservation owner');
  assert.equal(pending.sha, expected.sha, 'Wrong reserved source');
  assert.equal(pending.current.production.sha, expected.sha);
  assert.equal(pending.current.production.workerUrl, expected.workerUrl);
  assert.equal(pending.siteDigest, expected.siteDigest, 'Wrong reserved digest');
  assert.deepEqual(pending.previous, previous.current);
  assert.deepEqual(pending.current.development, previous.current.development, 'Preserved development record changed');

  const before = readComposite(previousStore, previous.current);
  const candidate = readComposite(store, pending.current);
  assert.equal(digest(candidate), expected.siteDigest, 'Reserved site bytes changed');
  const developmentFiles = files => Object.entries(files).filter(([name]) => name.startsWith('dev/'));
  assert.deepEqual(developmentFiles(candidate), developmentFiles(before), 'Preserved development bytes changed');
  return { before, candidate };
}

/** Compare one of the verified inventories against the fixed public Pages origin. */
export async function verifyRecoveryPublicSite(files, fetchImpl = globalThis.fetch) {
  assert(Object.keys(files).length > 0, 'Missing verified Pages inventory');
  for (const [name, expected] of Object.entries(files)) {
    const url = new URL(name.split('/').map(encodeURIComponent).join('/'), TARGETS.production.baseUrl);
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, `${name}: Pages response was not HTTP 200`);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), expected, `${name}: served bytes differ from the snapshot`);
  }
}
