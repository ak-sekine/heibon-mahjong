import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPagesArtifact } from '../.github/scripts/pages-artifact-check.mjs';
const digest = `sha256:${'a'.repeat(64)}`;
const artifact = { name: 'github-pages', id: 123, digest };
const fixture = overrides => ({ name: artifact.name, id: artifact.id, digest, expiresAt: '2030-01-01T00:00:00Z', now: () => 0, ...overrides });

test('retries temporary lookup errors and returns the exact artifact', async () => {
  let calls = 0;
  assert.deepEqual(await waitForPagesArtifact(fixture({ list: async () => { if (++calls === 1) throw Error('temporary'); return [artifact]; }, wait: async () => {} })), artifact);
  assert.equal(calls, 2);
});

test('fails closed on duplicate, ID, digest and expiry', async () => {
  for (const [items, message] of [[[artifact, artifact], /duplicate/], [[{ ...artifact, id: 124 }], /ID mismatch/], [[{ ...artifact, digest: `sha256:${'b'.repeat(64)}` }], /digest mismatch/]]) {
    await assert.rejects(waitForPagesArtifact(fixture({ list: async () => items })), message);
  }
  await assert.rejects(waitForPagesArtifact(fixture({ list: async () => [artifact], expiresAt: '1970-01-01T00:00:00Z' })), /expired/);
});

test('stops at deadline if artifact does not appear', async () => {
  let clock = 0;
  await assert.rejects(waitForPagesArtifact(fixture({ list: async () => [], now: () => clock, wait: async ms => { clock += ms; }, timeoutMs: 3, intervalMs: 1 })), /timeout/);
});

test('stops even if a lookup never settles', async () => {
  await assert.rejects(waitForPagesArtifact(fixture({ list: () => new Promise(() => {}), timeoutMs: 5 })), /timeout/);
});
