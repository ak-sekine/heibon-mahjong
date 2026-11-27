import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPwa, DEV_PWA_BASE, PWA_BASE } from '../scripts/build-pwa.mjs';
import { seal, stage, finalize, inventory } from '../scripts/environments/artifacts.mjs';
import { inspectRecoverySnapshots } from '../scripts/environments/pages-recovery.mjs';
import { preparePages, verifyStaged, independentIdentity } from '../.github/scripts/pages-independent.mjs';
import { verifyPagesRecoveryEvidence } from '../.github/scripts/pages-independent-recovery.mjs';
import { REQUIRED_ENVIRONMENT_JOBS } from '../.github/scripts/check-browser-ui-matrix.mjs';
const repo = path.resolve(import.meta.dirname, '..');
const sha = 'a'.repeat(40), baseSha = 'b'.repeat(40);
const gitFixture = (_cmd, args) => args[0] === 'diff' ? 'index.html\0' : '';
const urls = { production: 'https://heibon-mahjong-online.ak-sekine.workers.dev', development: 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev' };
function fixture(root, environment, value) {
  mkdirSync(path.join(root, 'assets'), { recursive: true });
  const base = environment === 'production' ? PWA_BASE : DEV_PWA_BASE;
  writeFileSync(path.join(root, 'index.html'), `<link rel="manifest" href="${base}manifest.webmanifest"><script src="${base}assets/app.js"></script>`);
  writeFileSync(path.join(root, 'assets/app.js'), JSON.stringify(urls[environment]));
  writeFileSync(path.join(root, 'assets/app.css'), 'body{}');
  writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify({ icons: [] }));
  buildPwa(root, environment); seal(root, environment, value, urls[environment]);
}
function context(environment) {
  const branch = environment === 'production' ? 'main' : 'issue/69-independent-publication-v2';
  return { GITHUB_REPOSITORY: 'ak-sekine/heibon-mahjong', GITHUB_REF: `refs/heads/${branch}`, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: sha, GITHUB_RUN_ID: '111', GITHUB_RUN_ATTEMPT: '1', GITHUB_WORKFLOW_REF: `ak-sekine/heibon-mahjong/.github/workflows/environments.yml@refs/heads/${branch}`, GITHUB_WORKFLOW_SHA: sha, EXPECTED_WORKER_URL: urls[environment] };
}
function setup(environment) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pages-independent-'));
  const store = path.join(root, 'store'), previous = path.join(root, 'previous'), candidate = path.join(root, 'candidate');
  mkdirSync(store); writeFileSync(path.join(store, 'state.json'), JSON.stringify({ version: 1, current: {}, pending: null }));
  for (const env of ['production', 'development']) {
    const initial = path.join(root, env); fixture(initial, env, baseSha); stage(store, initial, baseSha); finalize(store);
  }
  cpSync(store, previous, { recursive: true }); fixture(candidate, environment, sha);
  const serve = root => async url => new Response(readFileSync(path.join(root, 'site', url.pathname.slice('/heibon-mahjong/'.length))));
  return { root, store, previous, candidate, serve };
}
for (const environment of ['production', 'development']) test(`Pages-only ${environment} retains the other snapshot and verifies pending and public bytes`, async () => {
  const f = setup(environment), env = context(environment);
  try {
    const before = inventory(path.join(f.store, 'site'));
    const exec = (_cmd, args) => args.includes('.status') ? 'ahead' : args[1].endsWith('/heads/main') && environment === 'development' ? baseSha : sha;
    const result = await preparePages(f.store, repo, f.candidate, env, f.serve(f.previous), exec, gitFixture);
    assert.equal(result.workerPending, null);
    const staged = JSON.parse(readFileSync(path.join(f.store, 'state.json')));
    assert.equal(staged.current[environment].sha, baseSha);
    assert.equal(staged.pending.current[environment].sha, sha);
    const retained = environment === 'production' ? 'development' : 'production';
    assert.deepEqual(staged.pending.current[retained], staged.current[retained]);
    await assert.rejects(preparePages(f.store, repo, f.candidate, env, f.serve(f.previous), exec, gitFixture), /pending/);
    const verified = await verifyStaged({ store: f.store, previousStore: f.previous, env, get: f.serve(f.store) });
    assert.notDeepEqual(before, verified.candidate);
    await assert.rejects(verifyStaged({ store: f.store, previousStore: f.previous, env, get: f.serve(f.previous) }));
    const expected = { environment, sha, workerUrl: urls[environment], runId: '111', attempt: '1', siteDigest: staged.pending.siteDigest };
    // A later run uses the original publication identity as evidence.
    assert.ok(inspectRecoverySnapshots({ store: f.store, previousStore: f.previous, expected }));
    assert.throws(() => inspectRecoverySnapshots({ store: f.store, previousStore: f.previous, expected: { ...expected, runId: '222' } }), /owner/);
    finalize(f.store);
    assert.equal(JSON.parse(readFileSync(path.join(f.store, 'state.json'))).current[environment].sha, sha);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('wrong Worker URL, corrupt artifact and pending snapshots fail safely', async () => {
  const f = setup('production'), env = context('production');
  try {
    assert.throws(() => independentIdentity({ ...env, EXPECTED_WORKER_URL: urls.development }), /identity/);
    writeFileSync(path.join(f.candidate, 'index.html'), 'corrupt');
    await assert.rejects(preparePages(f.store, repo, f.candidate, env, f.serve(f.previous), () => sha, gitFixture), /Artifact bytes changed|Required asset|Broken reference/);
    assert.equal(JSON.parse(readFileSync(path.join(f.store, 'state.json'))).pending, null);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('recovery evidence requires the original successful deploy step, CI and unchanged pinned refs', () => {
  const expected = { snapshot: '1'.repeat(40), parent: '2'.repeat(40), sha, branch: 'main', repository: 'ak-sekine/heibon-mahjong', runId: '111', attempt: '1' };
  const run = { id: 111, run_attempt: 1, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'completed', repository: { full_name: expected.repository }, head_repository: { full_name: expected.repository }, path: '.github/workflows/environments.yml' };
  const evidence = { ledgerHead: expected.snapshot, snapshotHead: expected.snapshot, snapshotParent: expected.parent, parentHead: expected.parent, originalRun: run, ciRun: run, originalJobs: [{ name: 'publish / pages-only', run_id: 111, run_attempt: 1, steps: [{ name: 'Run actions/deploy-pages@v4', conclusion: 'success' }] }], ciJobs: REQUIRED_ENVIRONMENT_JOBS.map(name => ({ name, run_id: 111, run_attempt: 1, head_sha: sha, conclusion: 'success' })), deployment: { sha }, deploymentStatus: { log_url: `https://github.com/${expected.repository}/actions/runs/111/job/5` }, pagesStatus: { status: 'succeed' } };
  verifyPagesRecoveryEvidence(evidence, expected);
  assert.throws(() => verifyPagesRecoveryEvidence({ ...evidence, ledgerHead: 'f'.repeat(40) }, expected), /changed/);
  assert.throws(() => verifyPagesRecoveryEvidence({ ...evidence, pagesStatus: { status: 'unknown' } }, expected), /not confirmed/);
  assert.throws(() => verifyPagesRecoveryEvidence({ ...evidence, ciJobs: evidence.ciJobs.slice(1) }, expected), /CI job/);
  assert.throws(() => verifyPagesRecoveryEvidence({ ...evidence, originalJobs: [{ ...evidence.originalJobs[0], steps: [{ name: 'Run actions/deploy-pages@v4', conclusion: 'failure' }] }] }, expected), /did not confirm/);
});

test('same-run artifact identity, ZIP digest metadata and expiry are required', async () => {
  const { verifyPagesArtifactMetadata } = await import('../.github/scripts/pages-verified-artifact.mjs');
  const expected = { id: 77, digest: 'a'.repeat(64), name: `pages-dist-${sha}-1`, runId: 111, sha };
  const metadata = { id: 77, digest: 'sha256:' + expected.digest, name: expected.name, expired: false, expires_at: '2099-01-01T00:00:00Z', workflow_run: { id: 111, head_sha: sha } };
  verifyPagesArtifactMetadata(metadata, expected);
  for (const bad of [{ ...metadata, id: 78 }, { ...metadata, digest: 'sha256:' + 'b'.repeat(64) }, { ...metadata, expired: true }, { ...metadata, workflow_run: { id: 112, head_sha: sha } }, { ...metadata, name: expected.name + '-2' }]) {
    assert.throws(() => verifyPagesArtifactMetadata(bad, expected));
  }
});
