import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildPwa, PWA_BASE, DEV_PWA_BASE } from '../scripts/build-pwa.mjs';
import { seal, stage, finalize } from '../scripts/environments/artifacts.mjs';
import { planAutomatic } from '../.github/scripts/publication-auto.mjs';
const pageSha = 'a'.repeat(40), workerSha = 'b'.repeat(40), candidate = 'c'.repeat(40), snapshot = 'e'.repeat(40);
const version = '11111111-1111-4111-8111-111111111111';
function makeSite(root, environment, sha) {
  const base = environment === 'production' ? PWA_BASE : DEV_PWA_BASE;
  const url = `https://heibon-mahjong-online${environment === 'development' ? '-dev' : ''}.test.workers.dev`;
  mkdirSync(path.join(root, 'assets'), { recursive: true });
  writeFileSync(path.join(root, 'index.html'), `<script src="${base}assets/a.js"></script>`);
  writeFileSync(path.join(root, 'assets/a.js'), JSON.stringify(url));
  writeFileSync(path.join(root, 'assets/a.css'), 'body{}');
  writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify({ icons: [] }));
  buildPwa(root, environment); seal(root, environment, sha, url);
}
function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'publication-auto-'));
  const store = path.join(root, 'store'); mkdirSync(store);
  writeFileSync(path.join(store, 'state.json'), JSON.stringify({ version: 1, current: {}, pending: null }));
  for (const [env, sha] of [['production', pageSha], ['development', 'd'.repeat(40)]]) {
    const site = path.join(root, env); makeSite(site, env, sha); stage(store, site, sha); finalize(store);
  }
  const config = { environment: 'production', branch: 'main', sha: candidate, name: 'heibon-mahjong-online', ledgerEnvironment: 'heibon-independent-worker-production' };
  const api = {
    list: async () => [{ id: 8, sha: workerSha, environment: config.ledgerEnvironment, payload: { environment: 'production', worker: config.name, runId: '55', attempt: '1' } }],
    statuses: async () => [{ state: 'success', description: `verified:${version}` }],
    live: async () => ({ success: true, result: { deployments: [{ versions: [{ version_id: version, percentage: 100 }] }] } }),
  };
  const ref = async name => name === 'pages-verified' ? snapshot : candidate;
  const get = async url => new Response(readFileSync(path.join(store, 'site', url.pathname.slice('/heibon-mahjong/'.length))));
  return { root, store, config, api, ref, get };
}
for (const [label, pagesDiff, workerDiff] of [['pages', 'index.html\0', ''], ['worker', '', 'worker/index.ts\0'], ['both', 'index.html\0', 'worker/index.ts\0'], ['none', '', '']]) test(`automatic target ${label} uses separate successful baselines`, async () => {
  const f = setup();
  try {
    const git = (_cmd, args) => args[0] === '-C' ? snapshot : args[0] === 'diff' ? (args[4] === pageSha ? pagesDiff : workerDiff) : '';
    const plan = await planAutomatic({ ...f, source: f.root, git });
    assert.equal(plan.classification, label);
    assert.equal(plan.pages, label === 'pages' || label === 'both');
    assert.equal(plan.worker, label === 'worker' || label === 'both');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('automatic target stops for unknown files, pending snapshots and unverified Worker records', async () => {
  const f = setup();
  try {
    const git = (_cmd, args) => args[0] === '-C' ? snapshot : args[0] === 'diff' ? 'unclassified\0' : '';
    await assert.rejects(planAutomatic({ ...f, source: f.root, git }), /unknown/);
    f.get = async () => new Response('unexpected', { status: 200 });
    await assert.rejects(planAutomatic({ ...f, source: f.root, git }), /bytes differ/);
    f.get = async url => new Response(readFileSync(path.join(f.store, 'site', url.pathname.slice('/heibon-mahjong/'.length))));
    f.api.statuses = async () => [{ state: 'pending' }];
    await assert.rejects(planAutomatic({ ...f, source: f.root, git }), /unknown/);
    f.ref = async () => 'f'.repeat(40);
    await assert.rejects(planAutomatic({ ...f, source: f.root, git }), /checkout/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
