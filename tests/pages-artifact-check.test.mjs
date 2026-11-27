import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { waitForPagesArtifact, verifyArtifactZip } from '../.github/scripts/pages-artifact-check.mjs';
const bytes = Buffer.from('zip fixture');
const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
// Runtime listing deliberately lacks digest/expiry, matching the weakest contract.
const artifact = { name: 'github-pages', id: 123 };
const detail = { ...artifact, digest, expired: false, expires_at: '2030-01-01T00:00:00Z' };
const fixture = overrides => ({ name: artifact.name, id: artifact.id, digest, metadata: async () => detail, now: () => 0, ...overrides });

test('retries temporary lookup errors and verifies the exact artifact using separate metadata', async () => {
  let calls = 0;
  assert.deepEqual(await waitForPagesArtifact(fixture({ list: async () => { if (++calls === 1) throw Error('temporary'); return [artifact]; }, wait: async () => {} })), artifact);
  assert.equal(calls, 2);
  verifyArtifactZip(bytes, digest);
  assert.throws(() => verifyArtifactZip(Buffer.from('changed'), digest), /digest mismatch/);
});

test('fails closed on duplicate, ID, metadata, digest and expiry', async () => {
  for (const [items, message] of [[[artifact, artifact], /duplicate/], [[{ ...artifact, id: 124 }], /ID mismatch/]]) await assert.rejects(waitForPagesArtifact(fixture({ list: async () => items })), message);
  for (const [value, message] of [[{ ...detail, id: 999 }, /metadata mismatch/], [{ ...detail, digest: `sha256:${'b'.repeat(64)}` }, /digest mismatch/], [{ ...detail, expired: true }, /expired/], [{ ...detail, expires_at: '1970-01-01T00:00:00Z' }, /expired/]]) {
    await assert.rejects(waitForPagesArtifact(fixture({ list: async () => [artifact], metadata: async () => value })), message);
  }
});

test('stops at deadline if listing or metadata cannot complete', async () => {
  let clock = 0;
  await assert.rejects(waitForPagesArtifact(fixture({ list: async () => [], now: () => clock, wait: async ms => { clock += ms; }, timeoutMs: 3, intervalMs: 1 })), /timeout/);
  await assert.rejects(waitForPagesArtifact(fixture({ list: () => new Promise(() => {}), timeoutMs: 5 })), /timeout/);
  await assert.rejects(waitForPagesArtifact(fixture({ list: async () => [artifact], metadata: () => new Promise(() => {}), timeoutMs: 5 })), /timeout/);
});

test('temporary REST metadata lookup failure is retried while permanent errors stop', async () => {
  let calls = 0;
  const details = { id: 7, name: 'github-pages', digest: 'sha256:' + 'a'.repeat(64), expired: false, expires_at: '2099-01-01T00:00:00Z' };
  const opts = { name: details.name, id: 7, digest: details.digest, list: async () => [{ name: details.name, id: 7 }], wait: async () => {}, timeoutMs: 1000 };
  const result = await waitForPagesArtifact({ ...opts, metadata: async () => { if (++calls === 1) { const error = new Error('temporary'); error.retryable = true; throw error; } return details; } });
  assert.equal(result.id, 7);
  assert.equal(calls, 2);
  await assert.rejects(waitForPagesArtifact({ ...opts, metadata: async () => { throw new Error('forbidden'); } }), /forbidden/);
});
