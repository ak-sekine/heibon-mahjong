import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPwa } from '../scripts/build-pwa.mjs';
import { finalize, seal } from '../scripts/environments/artifacts.mjs';
import { checkPublication, preparePublication } from '../.github/scripts/publication-reservation.mjs';
import { REQUIRED_ENVIRONMENT_JOBS } from '../.github/scripts/check-browser-ui-matrix.mjs';
import { checkArchive, checkCandidate, findVerifiedArtifact, readPages, REPOSITORY } from '../.github/scripts/reuse-production-ci.mjs';
import { auditMainPublication } from '../.github/scripts/audit-main-publication.mjs';

const sha = 'a'.repeat(40);
const snapshot = 'b'.repeat(40);
const workerUrl = 'https://heibon-mahjong-online.ak-sekine.workers.dev';
const workflowPath = '.github/workflows/environments.yml';
const zipDigest = 'sha256:' + 'c'.repeat(64);
const evidence = { workflowId: 415213931, workflowRef: REPOSITORY + '/' + workflowPath + '@refs/heads/main',
  runId: 1, attempt: 1, artifactId: 30, digest: zipDigest, expiresAt: '2027-02-20T00:00:00Z' };
const now = Date.parse('2026-11-23');

function apiFixture(change = () => {}) {
  const repo = { id: 1415016053, full_name: REPOSITORY };
  const workflow = { id: 415213931, path: workflowPath, state: 'active' };
  const run = { id: 1, status: 'completed', conclusion: 'success', workflow_id: workflow.id,
    path: workflow.path, event: 'push', head_branch: 'main', head_sha: sha, run_attempt: 1,
    repository: repo, head_repository: repo };
  const jobs = REQUIRED_ENVIRONMENT_JOBS.map((name, i) => ({
    name, id: 100 + i, head_sha: sha, run_id: 1, run_attempt: 1, status: 'completed', conclusion: 'success',
  }));
  const artifact = { id: 30, digest: zipDigest, name: 'pages-dist-' + sha + '-1', expired: false,
    expires_at: '2027-02-20T00:00:00Z', size_in_bytes: 55 };
  const proof = { ...artifact, id: 31, name: 'pages-audit-30-' + zipDigest.slice(7) };
  const detail = { ...artifact, workflow_run: { id: 1, repository_id: repo.id, head_repository_id: repo.id,
    head_branch: 'main', head_sha: sha } };
  const replies = {
    'git/ref/heads/main': { object: { sha } },
    'actions/workflows/415213931': workflow,
    'actions/workflows/415213931/runs': { total_count: 1, workflow_runs: [{ ...run }] },
    'actions/runs/1': run,
    'actions/runs/1/attempts/1': { ...run },
    'actions/runs/1/attempts/1/jobs': { total_count: jobs.length, jobs },
    'actions/runs/1/artifacts': { total_count: 2, artifacts: [artifact, proof] },
    'actions/artifacts/30': detail,
  };
  change(replies);
  return endpoint => replies[endpoint.split('?')[0].slice(('repos/' + REPOSITORY + '/').length)];
}

test('reuse requires one current main push attempt and the audit-bound immutable artifact', () => {
  assert.deepEqual(findVerifiedArtifact(sha, apiFixture(), now), evidence);
  const invalid = [
    ['old main', 'git/ref/heads/main', { object: { sha: snapshot } }],
    ['wrong workflow metadata', 'actions/workflows/415213931', { path: 'other.yml' }],
    ['ambiguous run', 'actions/workflows/415213931/runs', { total_count: 2 }],
    ...Object.entries({ status: 'in_progress', conclusion: 'failure', head_branch: 'develop', head_sha: snapshot,
      event: 'workflow_dispatch', workflow_id: 999, path: 'other.yml', repository: {}, head_repository: {},
      run_attempt: 2 }).map(([key, value]) => [key, 'actions/runs/1', { [key]: value }]),
    ['cancelled', 'actions/runs/1', { conclusion: 'cancelled' }],
    ['attempt mismatch', 'actions/runs/1/attempts/1', { run_attempt: 2 }],
    ['artifact missing', 'actions/runs/1/artifacts', { total_count: 0, artifacts: [] }],
    ['expired', 'actions/artifacts/30', { expired: true }],
    ['expiration elapsed', 'actions/artifacts/30', { expires_at: '2026-01-01' }],
    ['wrong digest', 'actions/artifacts/30', { digest: 'sha256:' + 'd'.repeat(64) }],
    ['wrong source run', 'actions/artifacts/30', { workflow_run: { id: 2 } }],
  ];
  for (const [label, key, value] of invalid) {
    assert.throws(() => findVerifiedArtifact(sha, apiFixture(r => Object.assign(r[key], value)), now), label);
  }
  for (const change of [
    jobs => jobs.pop(),
    jobs => jobs.push({ ...jobs[0], id: 999 }),
    jobs => { jobs[0].conclusion = 'skipped'; },
    jobs => { jobs[0].status = 'queued'; },
    jobs => { jobs[0].run_attempt = 2; },
    jobs => { jobs[0].run_id = 2; },
    jobs => { jobs[0].head_sha = snapshot; },
    jobs => { jobs[0].conclusion = 'cancelled'; },
  ]) {
    assert.throws(() => findVerifiedArtifact(sha, apiFixture(r => {
      const page = r['actions/runs/1/attempts/1/jobs'];
      change(page.jobs);
      page.total_count = page.jobs.length;
    }), now), /required verification job/);
  }
  assert.throws(() => findVerifiedArtifact(sha, apiFixture(r => {
    r['actions/runs/1/artifacts'].artifacts[1].name = 'unbound-audit';
  }), now), /artifact does not match/);
});

test('pagination verifies all pages and rejects omissions, changing totals and duplicate IDs', () => {
  const first = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
  for (const second of [{ jobs: [] }, { jobs: [{ id: 1 }] }, { total_count: 102, jobs: [{ id: 101 }] }, {}]) {
    assert.throws(() => readPages('endpoint', 'jobs', endpoint =>
      ({ total_count: 101, ...(endpoint.endsWith('page=1') ? { jobs: first } : second) })));
  }
  assert.equal(readPages('endpoint?branch=main', 'jobs', endpoint => ({
    total_count: 101, jobs: endpoint.endsWith('page=1') ? first : [{ id: 101 }],
  })).length, 101);
  assert.throws(() => readPages('endpoint', 'jobs', () => ({})));
});

function createCandidate(root) {
  mkdirSync(path.join(root, "assets"), { recursive: true });
  writeFileSync(path.join(root, 'index.html'), '<script src="/heibon-mahjong/assets/worker.js"></script>');
  writeFileSync(path.join(root, 'assets/worker.js'), JSON.stringify(workerUrl));
  writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify({ icons: [] }));
  writeFileSync(path.join(root, 'assets/site.css'), 'body{}');
  buildPwa(root, 'production');
  seal(root, 'production', sha, workerUrl);
}

function python(...args) {
  return execFileSync('python3', args, { stdio: 'pipe' });
}

test('real ZIP bytes require outer digest and independently valid sealed production files', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'verified-zip-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'dist'), archive = path.join(root, 'source.zip'), target = path.join(root, 'candidate');
  createCandidate(source);
  python('-c', [
    'import sys, pathlib, zipfile',
    'source = pathlib.Path(sys.argv[1])',
    'with zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED) as z:',
    ' for item in source.rglob("*"):',
    '  if item.is_file(): z.write(item, item.relative_to(source))',
  ].join('\n'), source, archive);
  const bytes = readFileSync(archive);
  const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  checkArchive(bytes, digest);
  const changed = Buffer.from(bytes);
  changed[50] ^= 1;
  assert.throws(() => checkArchive(changed, digest), /ZIP digest mismatch/);
  python('.github/scripts/extract-pages-zip.py', archive, target);
  checkCandidate(target, sha, workerUrl);
  assert.throws(() => checkCandidate(target, snapshot, workerUrl), /candidate identity/);
  assert.throws(() => checkCandidate(target, sha, 'https://example.invalid/'), /candidate identity/);
  const manifest = path.join(target, 'release.json');
  const contents = readFileSync(manifest);
  const tampered = JSON.parse(contents);
  tampered.files['index.html'] = '0'.repeat(64);
  writeFileSync(manifest, JSON.stringify(tampered));
  assert.throws(() => checkCandidate(target, sha, workerUrl), /bytes changed/);
  writeFileSync(manifest, contents);
  writeFileSync(path.join(target, 'assets/worker.js'), 'altered byte');
  assert.throws(() => checkCandidate(target, sha, workerUrl), /bytes changed/);
});

test('checked ZIP extraction rejects unsafe entry types and ambiguous paths', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'unsafe-zip-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const archive = path.join(root, 'file.zip');
  for (const [name, type] of [['../escape', 'file'], ['/absolute', 'file'], ['dir\\name', 'file'],
    ['__proto__', 'file'], ['link', 'symlink'], ['same', 'duplicate']]) {
    python('-c', [
      'import sys, zipfile, stat',
      'with zipfile.ZipFile(sys.argv[1], "w") as z:',
      ' entry = zipfile.ZipInfo(sys.argv[2])',
      ' if sys.argv[3] == "symlink": entry.external_attr = stat.S_IFLNK << 16',
      ' z.writestr(entry, "contents")',
      ' if sys.argv[3] == "duplicate": z.writestr(entry, "other contents")',
    ].join('\n'), archive, name, type);
    assert.throws(() => python('.github/scripts/extract-pages-zip.py', archive, path.join(root, 'dist')), /Unsafe Pages archive entry/);
  }
});

test('reservation retains source evidence and the read-only audit detects deployment, hash and ref failures', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'verified-audit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const candidate = path.join(root, 'candidate'), store = path.join(root, 'store');
  mkdirSync(store);
  const ledger = path.join(store, 'state.json');
  writeFileSync(ledger, JSON.stringify({ version: 1, current: {}, pending: null }));
  createCandidate(candidate);
  const env = { GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_SHA: sha, GITHUB_RUN_ID: '50', GITHUB_RUN_ATTEMPT: '1', PUBLICATION_SNAPSHOT: snapshot,
    REUSE_PRODUCTION: 'true', SOURCE_VERIFICATION: JSON.stringify(evidence) };
  const refs = (command, args) => command === 'git' || args[1].endsWith('pages-verified') ? snapshot : sha;
  preparePublication(store, candidate, workerUrl, env, refs);
  assert.deepEqual(JSON.parse(readFileSync(ledger)).pending.current.production.publication,
    { runId: '50', attempt: '1', sourceVerification: evidence });
  assert.throws(() => preparePublication(store, candidate, workerUrl, env, refs), /pending/);
  assert.throws(() => checkPublication(store, workerUrl, { ...env, GITHUB_RUN_ATTEMPT: '2' }, refs), /does not belong/);
  assert.equal(checkPublication(store, workerUrl, env, refs), 'production');
  finalize(store);
  const api = endpoint => endpoint.includes('refs') || endpoint.includes('git/ref')
    ? { object: { sha: endpoint.endsWith('main') ? sha : snapshot } }
    : endpoint.includes('/statuses') ? [{ id: 3, state: 'success',
      log_url: 'https://github.com/' + REPOSITORY + '/actions/runs/50/job/123' }] : [{ id: 2, sha }];
  const get = async url => url.pathname === '/health'
    ? Response.json({ ok: true, service: 'heibon-mahjong-online' })
    : new Response(readFileSync(path.join(store, 'site', url.pathname.slice('/heibon-mahjong/'.length))));
  const options = { sha, finalized: snapshot, runId: '50', checkout: () => snapshot, api, get };
  await auditMainPublication(store, options);
  await assert.rejects(auditMainPublication(store, { ...options, runId: '51' }), /another run/);
  assert.equal(JSON.parse(readFileSync(ledger)).pending, null);
  await assert.rejects(auditMainPublication(store, { ...options, get: async () => new Response(null, { status: 503 }) }), /Worker health/);
  await assert.rejects(auditMainPublication(store, { ...options, get: async url =>
    url.pathname.endsWith('release.json') ? new Response('altered') : get(url) }), /Pages bytes/);
  await assert.rejects(auditMainPublication(store, { ...options, api: endpoint =>
    endpoint.includes('/statuses') ? [{ id: 3, state: 'failure' }] : api(endpoint) }), /Deployment not successful/);
  await assert.rejects(auditMainPublication(store, { ...options, api: endpoint =>
    endpoint.endsWith('main') ? { object: { sha: snapshot } } : api(endpoint) }), /main changed/);
});
