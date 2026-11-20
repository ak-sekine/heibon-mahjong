import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { digest, inventory, renderSummary, runAudit, sha256, classifyTransportError } from '../scripts/environments/pages-live-audit.mjs';

const repo = 'ak-sekine/heibon-mahjong';
const devSha = 'a'.repeat(40);
const prodSha = 'b'.repeat(40);
const LEGACY_PRODUCTION_WORKFLOW = '.github/workflows/deploy.yml';
const ENVIRONMENTS_WORKFLOW = '.github/workflows/environments.yml';
const dates = {
  production: { created: '2026-11-13T13:02:33Z', updated: '2026-11-13T13:32:06Z', deployment: '2026-11-13T13:10:00Z' },
  development: { created: '2026-11-15T22:09:45Z', updated: '2026-11-15T22:20:11Z', deployment: '2026-11-15T22:10:00Z' },
};

function writeFile(root, name, bytes) {
  const target = path.join(root, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function createSnapshot(root) {
  const current = {};
  for (const environment of ['production', 'development']) {
    const base = environment === 'production' ? '/heibon-mahjong/' : '/heibon-mahjong/dev/';
    const workerUrl = environment === 'production'
      ? 'https://heibon-mahjong-online.ak-sekine.workers.dev'
      : 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev';
    const sourceSha = environment === 'production' ? prodSha : devSha;
    const target = path.join(root, environment === 'production' ? 'site' : 'site/dev');
    const assets = environment === 'production'
      ? ['main-prod.js', 'main-prod.css', 'page-prod.js', 'style-prod.js', 'style-prod.css', 'test-prod.js']
      : ['main-dev.js', 'main-dev.css', 'page-dev.js', 'style-dev.js', 'style-dev.css', 'test-dev.js'];
    const payload = {
      [`assets/${assets[0]}`]: `const endpoint=${JSON.stringify(workerUrl)};const n=${JSON.stringify(base)};navigator.serviceWorker.register(n+"sw.js",{scope:n});`,
      [`assets/${assets[1]}`]: 'body{color:#111}',
      [`assets/${assets[2]}`]: 'export const page=true;',
      [`assets/${assets[3]}`]: 'export const style=true;',
      [`assets/${assets[4]}`]: 'main{display:block}',
      [`assets/${assets[5]}`]: 'export const test=true;',
      'call-test.html': '<!doctype html><title>call</title>',
      'icons/icon-180.png': Buffer.from('icon180'),
      'icons/icon-192.png': Buffer.from('icon192'),
      'icons/icon-512.png': Buffer.from('icon512'),
      'icons/icon-maskable-512.png': Buffer.from('maskable'),
      'index.html': `<link rel="manifest" href="${base}manifest.webmanifest"><link rel="apple-touch-icon" href="${base}icons/icon-180.png"><script type="module" src="${base}assets/${assets[0]}"></script><link rel="stylesheet" href="${base}assets/${assets[1]}">`,
      'kan-test.html': '<!doctype html><title>kan</title>',
      'manifest.webmanifest': JSON.stringify({ id: base, start_url: base, scope: base, icons: [
        { src: `${base}icons/icon-180.png` }, { src: `${base}icons/icon-192.png` },
        { src: `${base}icons/icon-512.png` }, { src: `${base}icons/icon-maskable-512.png` },
      ] }),
      'sw.js': `'use strict';\nconst ROOT = ${JSON.stringify(base)};\nconst CACHE = "${environment === 'production' ? 'heibon-mahjong-shell-' : 'heibon-mahjong-dev-shell-'}fixture";\nconst PRECACHE = ${JSON.stringify([base, `${base}index.html`, `${base}manifest.webmanifest`, ...assets.map(name => `${base}assets/${name}`)])};\n`,
      'test.html': '<!doctype html><title>test</title>',
    };
    assert.equal(Object.keys(payload).length, 16);
    for (const [name, content] of Object.entries(payload)) writeFile(target, name, content);
    const files = inventory(target);
    const digestValue = digest(files);
    const release = { version: 1, environment, sha: sourceSha, workerUrl, files, digest: digestValue };
    const releaseBytes = `${JSON.stringify(release, null, 2)}\n`;
    writeFile(target, 'release.json', releaseBytes);
    current[environment] = {
      sha: sourceSha, digest: digestValue, workerUrl,
      snapshotDigest: digest(inventory(target)),
    };
  }
  writeFile(root, 'site/environments.json', `${JSON.stringify(current, null, 2)}\n`);
  writeFile(root, 'state.json', `${JSON.stringify({ version: 1, current, pending: null }, null, 2)}\n`);
  return { current };
}

const environmentGateJobs = [
    'verify', 'local-online', 'isolation-browser (chromium)', 'isolation-browser (webkit)',
    'browser-ui / browser-ui (chromium, group 1)', 'browser-ui / browser-ui (chromium, group 2)',
    'browser-ui / browser-ui (webkit, group 1)', 'browser-ui / browser-ui (webkit, group 2)',
    'audit', 'online', 'publish / publish',
];

function jobNames(environment, productionWorkflowPath) {
  if (environment === 'development') return [...environmentGateJobs, 'worker-development'];
  if (productionWorkflowPath === LEGACY_PRODUCTION_WORKFLOW) return ['deploy-worker', 'production-test', 'pages-deploy'];
  return [...environmentGateJobs, 'worker-production'];
}

function mockFetch(snapshotRoot, {
  statusOverrides = new Map(),
  corrupt = new Map(),
  productionWorkflowPath = LEGACY_PRODUCTION_WORKFLOW,
  productionDeploymentEnvironment = productionWorkflowPath === LEGACY_PRODUCTION_WORKFLOW ? 'heibon-production-worker' : 'worker-production',
  productionDeploymentSha = prodSha,
  productionDeploymentStatus = 'success',
  productionDeploymentCreatedAt = dates.production.deployment,
  missingProductionDeployment = false,
  productionDeploymentApiStatus = null,
  additionalDeploymentsByEnvironment = {},
  reservedPublication = false,
  skipReservation = false,
} = {}) {
  const deploymentsByEnvironment = {
    [productionDeploymentEnvironment]: missingProductionDeployment ? [] : [{
      id: 1, environment: productionDeploymentEnvironment, sha: productionDeploymentSha, created_at: productionDeploymentCreatedAt,
    }],
    'worker-development': [{ id: 2, environment: 'worker-development', sha: devSha, created_at: dates.development.deployment }],
    'github-pages': [{ id: 3, environment: 'github-pages', sha: devSha, created_at: dates.development.deployment }],
    ...additionalDeploymentsByEnvironment,
  };
  return async (input) => {
    const url = new URL(input);
    if (url.hostname === 'api.test') {
      const apiPath = url.pathname;
      if (/\/commits\/(main|develop|pages-verified)$/.test(apiPath)) {
        const branch = apiPath.split('/').at(-1);
        const sha = branch === 'main' ? 'e'.repeat(40) : branch === 'develop' ? 'd'.repeat(40) : 'c'.repeat(40);
        return new Response(JSON.stringify({ sha }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (apiPath.endsWith('/actions/runs')) {
        const branch = url.searchParams.get('branch');
        const env = branch === 'develop' ? 'development' : 'production';
        const sha = env === 'development' ? devSha : prodSha;
        return new Response(JSON.stringify({ workflow_runs: [{
          id: env === 'development' ? 200 : 100,
          head_branch: branch, head_sha: sha, path: env === 'development' ? ENVIRONMENTS_WORKFLOW : productionWorkflowPath,
          conclusion: 'success', event: env === 'development' || productionWorkflowPath === ENVIRONMENTS_WORKFLOW ? 'workflow_dispatch' : 'push',
          run_attempt: 1, html_url: `https://github.com/${repo}/actions/runs/${env === 'development' ? 200 : 100}`,
          created_at: dates[env].created, updated_at: dates[env].updated,
        }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (/\/actions\/runs\/(100|200)\/jobs$/.test(apiPath)) {
        const env = apiPath.includes('/200/') ? 'development' : 'production';
        const jobs = jobNames(env, productionWorkflowPath).map(name => ({ name, conclusion: 'success' }));
        if (env === 'development') jobs.push({ name: 'worker-production', conclusion: 'skipped' });
        if (env === 'production' && productionWorkflowPath === ENVIRONMENTS_WORKFLOW) jobs.push({ name: 'worker-development', conclusion: 'skipped' });
        if (reservedPublication && (env === 'development' || productionWorkflowPath === ENVIRONMENTS_WORKFLOW)) {
          for (const job of jobs) if (/^(online|worker-)/.test(job.name)) job.name = 'publish / ' + job.name;
          if (!skipReservation) jobs.push({ name: 'publish / reserve', conclusion: 'success' });
        }
        return new Response(JSON.stringify({ jobs }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (apiPath.endsWith('/deployments')) {
        const environment = url.searchParams.get('environment');
        if (environment === productionDeploymentEnvironment && productionDeploymentApiStatus) {
          return new Response('API access denied', { status: productionDeploymentApiStatus, headers: { 'content-type': 'text/plain' } });
        }
        return new Response(JSON.stringify(deploymentsByEnvironment[environment] || []), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const statusMatch = apiPath.match(/\/deployments\/(\d+)\/statuses$/);
      if (statusMatch) {
        const deploymentId = Number(statusMatch[1]);
        const state = deploymentId === 1 ? productionDeploymentStatus : 'success';
        return new Response(JSON.stringify([{ state, url: `https://api.test/deployments/${deploymentId}` }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }
    const override = statusOverrides.get(url.pathname);
    if (override) {
      if (override instanceof Error) throw override;
      return new Response('failure response', { status: override, headers: { server: 'GitHub.com', 'content-type': 'text/plain' } });
    }
    let relative;
    let file;
    if (url.pathname === '/heibon-mahjong/environments.json') {
      relative = 'environments.json';
      file = path.join(snapshotRoot, 'site/environments.json');
    } else {
      const development = url.pathname.startsWith('/heibon-mahjong/dev/');
      const prefix = development ? '/heibon-mahjong/dev/' : '/heibon-mahjong/';
      relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
      file = path.join(snapshotRoot, development ? 'site/dev' : 'site', relative);
    }
    let bytes;
    try { bytes = readFileSync(file); }
    catch { return new Response('missing', { status: 404 }); }
    if (corrupt.has(`${url.origin}${url.pathname}`)) bytes = Buffer.from(corrupt.get(`${url.origin}${url.pathname}`));
    return new Response(bytes, { status: 200, headers: {
      'content-type': relative.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      'cache-control': 'public, max-age=0', 'age': '0', 'etag': `"${sha256(bytes)}"`,
    } });
  };
}

function args(snapshotRoot, fetchImpl, overrides = {}) {
  return {
    snapshotRoot, snapshotSha: 'c'.repeat(40), repository: repo, token: 'test-token',
    ref: 'refs/heads/develop', auditSha: 'd'.repeat(40), runId: 300, runAttempt: 1,
    now: () => new Date('2026-11-16T00:00:00Z'), fetchImpl, apiBase: 'https://api.test', timeoutMs: 5000,
    ...overrides,
  };
}

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'issue47-phase6a-'));
  createSnapshot(root);
  return root;
}

test('matches both live Pages environments, metadata, deployment records, and all saved payload hashes', async () => {
  const root = setup();
  try {
    const report = await runAudit(args(root, mockFetch(root)));
    assert.equal(report.outcome, 'SUCCESS', JSON.stringify({ failures: report.failures, provenance: report.provenance, targets: report.targets }));
    assert.equal(report.snapshot.pending, null);
    assert.equal(report.provenance.outcome, 'SUCCESS');
    for (const environment of ['production', 'development']) {
      assert.equal(report.targets[environment].outcome, 'SUCCESS');
      assert.equal(report.targets[environment].hashMatches, 16);
      assert.equal(report.targets[environment].hashMismatches, 0);
      assert.equal(report.targets[environment].metadataMismatches, 0);
      assert.equal(report.targets[environment].serviceWorker.registrationMatches, true);
      assert.equal(report.targets[environment].files.filter(file => file.category === 'release-file').length, 16);
    }
    assert.equal(report.targets.production.environmentsMetadata, 'MATCH');
    assert.equal(report.provenance.runs.production.workflowPath, LEGACY_PRODUCTION_WORKFLOW);
    assert.equal(report.provenance.deploymentEnvironments.productionWorker, 'heibon-production-worker');
    assert.equal(report.provenance.deployments.productionWorker.environment, 'heibon-production-worker');
    assert.equal(report.provenance.deployments.productionWorker.sha, prodSha);
    assert.match(renderSummary(report), /productionWorker heibon-production-worker/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('production releases through environments.yml use the worker-production deployment environment', async () => {
  const root = setup();
  try {
    const report = await runAudit(args(root, mockFetch(root, { productionWorkflowPath: ENVIRONMENTS_WORKFLOW })));
    assert.equal(report.outcome, 'SUCCESS', JSON.stringify({ failures: report.failures, provenance: report.provenance }));
    assert.equal(report.provenance.runs.production.workflowPath, ENVIRONMENTS_WORKFLOW);
    assert.equal(report.provenance.deploymentEnvironments.productionWorker, 'worker-production');
    assert.equal(report.provenance.deployments.productionWorker.environment, 'worker-production');
    assert.equal(report.provenance.deployments.productionWorker.sha, prodSha);
    assert.match(renderSummary(report), /productionWorker worker-production/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('serialized publication requires reservation and recognizes relocated jobs for both branches', async () => {
  const root = setup();
  try {
    const options = { productionWorkflowPath: ENVIRONMENTS_WORKFLOW, reservedPublication: true };
    const report = await runAudit(args(root, mockFetch(root, options)));
    assert.equal(report.outcome, 'SUCCESS', JSON.stringify(report.provenance));
    for (const env of ['production', 'development']) {
      assert.equal(report.provenance.runs[env].jobs['publish / reserve'], 'success');
    }
    const rejected = await runAudit(args(root, mockFetch(root, { ...options, skipReservation: true })));
    assert.equal(rejected.outcome, 'FAIL');
    assert(rejected.provenance.failures.some(failure => failure.kind === 'PUBLICATION_RUN_JOBS_FAILED'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a different SHA in the selected production environment fails without borrowing a matching deployment from another environment', async () => {
  const root = setup();
  try {
    const unrelated = [{ id: 4, environment: 'worker-production', sha: prodSha, created_at: dates.production.deployment }];
    const report = await runAudit(args(root, mockFetch(root, {
      productionDeploymentSha: 'f'.repeat(40),
      additionalDeploymentsByEnvironment: { 'worker-production': unrelated },
    })));
    assert.equal(report.outcome, 'FAIL');
    assert.equal(report.provenance.deploymentEnvironments.productionWorker, 'heibon-production-worker');
    assert.equal(report.provenance.failures.find(failure => failure.name === 'productionWorker')?.kind, 'DEPLOYMENT_SHA_MISMATCH');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a missing deployment in the workflow-selected production environment fails closed', async () => {
  const root = setup();
  try {
    const report = await runAudit(args(root, mockFetch(root, { missingProductionDeployment: true })));
    assert.equal(report.outcome, 'FAIL');
    assert.equal(report.provenance.failures.find(failure => failure.name === 'productionWorker')?.kind, 'DEPLOYMENT_NOT_FOUND');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a production deployment must have a success status and fall within the publication run window', async () => {
  const root = setup();
  try {
    const failedStatus = await runAudit(args(root, mockFetch(root, { productionDeploymentStatus: 'failure' })));
    assert.equal(failedStatus.outcome, 'FAIL');
    assert.equal(failedStatus.provenance.failures.find(failure => failure.name === 'productionWorker')?.kind, 'DEPLOYMENT_NOT_SUCCESS');

    const wrongWindow = await runAudit(args(root, mockFetch(root, { productionDeploymentCreatedAt: '2026-11-14T13:10:00Z' })));
    assert.equal(wrongWindow.outcome, 'FAIL');
    assert.equal(wrongWindow.provenance.failures.find(failure => failure.kind === 'DEPLOYMENT_RUN_MISMATCH')?.kind, 'DEPLOYMENT_RUN_MISMATCH');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GitHub API 403 is reported as API access failure, not as a missing deployment', async () => {
  const root = setup();
  try {
    const report = await runAudit(args(root, mockFetch(root, { productionDeploymentApiStatus: 403 })));
    assert.equal(report.outcome, 'FAIL');
    assert.equal(report.provenance.failures.find(failure => failure.name === 'productionWorker')?.kind, 'GITHUB_API_FORBIDDEN');
    assert.notEqual(report.provenance.failures.find(failure => failure.name === 'productionWorker')?.kind, 'DEPLOYMENT_NOT_FOUND');
    assert.equal(report.requests.find(request => request.label === 'heibon-production-worker deployments')?.outcome, 'GITHUB_API_FORBIDDEN');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('one changed live payload body fails that environment and preserves the individual mismatch', async () => {
  const root = setup();
  try {
    const url = 'https://ak-sekine.github.io/heibon-mahjong/dev/assets/main-dev.js';
    const report = await runAudit(args(root, mockFetch(root, { corrupt: new Map([[url, 'changed bytes']]) })));
    assert.equal(report.outcome, 'FAIL');
    assert.equal(report.targets.development.hashMismatches, 1);
    assert.equal(report.targets.development.hashMatches, 15);
    assert.equal(report.targets.development.files.find(file => file.path === 'assets/main-dev.js').outcome, 'HASH_MISMATCH');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('HTTP 404, HTTP 403 response, and transport timeout stay distinguishable', async () => {
  const root = setup();
  try {
    const notFound = '/heibon-mahjong/assets/main-prod.js';
    const forbidden = '/heibon-mahjong/dev/assets/main-dev.js';
    const timeout = '/heibon-mahjong/dev/assets/page-dev.js';
    const errors = new Map([[timeout, Object.assign(new Error('connect timed out'), { cause: { code: 'ETIMEDOUT' } })]]);
    const statuses = new Map([[notFound, 404], [forbidden, 403], [timeout, errors.get(timeout)]]);
    const report = await runAudit(args(root, mockFetch(root, { statusOverrides: statuses })));
    assert.equal(report.outcome, 'FAIL');
    assert.equal(report.targets.production.files.find(file => file.path === 'assets/main-prod.js').outcome, 'HTTP_STATUS_404');
    assert.equal(report.targets.development.files.find(file => file.path === 'assets/main-dev.js').outcome, 'HTTP_STATUS_403');
    assert.equal(report.targets.development.files.find(file => file.path === 'assets/page-dev.js').outcome, 'TIMEOUT');
    assert.equal(classifyTransportError(new Error('Proxy CONNECT tunnel returned 403 Forbidden')), 'PROXY_CONNECT_REJECTED');
    assert.equal(classifyTransportError(Object.assign(new Error('host not found'), { cause: { code: 'ENOTFOUND' } })), 'DNS_ERROR');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an HTTP redirect is rejected and is never followed', async () => {
  const root = setup();
  try {
    const pathName = '/heibon-mahjong/dev/assets/main-dev.js';
    const report = await runAudit(args(root, async (input, options) => {
      if (new URL(input).pathname === pathName) return new Response('', { status: 302, headers: { location: 'https://example.invalid/' } });
      return mockFetch(root)(input, options);
    }));
    assert.equal(report.outcome, 'FAIL');
    const file = report.targets.development.files.find(entry => entry.path === 'assets/main-dev.js');
    assert.equal(file.outcome, 'UNEXPECTED_REDIRECT');
    assert.equal(file.status, 302);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pending state, missing snapshot files, and cross-environment snapshots fail before public fetches', async () => {
  const pendingRoot = setup();
  try {
    const statePath = path.join(pendingRoot, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.pending = { environment: 'development' };
    writeFileSync(statePath, JSON.stringify(state));
    let calls = 0;
    const report = await runAudit(args(pendingRoot, async () => { calls++; throw new Error('must not run'); }));
    assert.equal(report.outcome, 'FAIL');
    assert.equal(report.failures[0].kind, 'PENDING_UNRESOLVED');
    assert.equal(calls, 0);
  } finally { rmSync(pendingRoot, { recursive: true, force: true }); }

  const missingRoot = setup();
  try {
    rmSync(path.join(missingRoot, 'site/dev/assets/main-dev.js'));
    const report = await runAudit(args(missingRoot, async () => { throw new Error('public fetch must not run for invalid snapshot'); }));
    assert.equal(report.outcome, 'FAIL');
    assert.equal(report.failures[0].kind, 'SNAPSHOT_INVALID');
  } finally { rmSync(missingRoot, { recursive: true, force: true }); }

  const swappedRoot = setup();
  try {
    const releasePath = path.join(swappedRoot, 'site/dev/release.json');
    const release = JSON.parse(readFileSync(releasePath, 'utf8'));
    release.environment = 'production';
    writeFileSync(releasePath, JSON.stringify(release, null, 2) + '\n');
    const report = await runAudit(args(swappedRoot, async () => { throw new Error('public fetch must not run for swapped snapshot'); }));
    assert.equal(report.outcome, 'FAIL');
    assert.match(report.failures[0].message, /development release identity/);
  } finally { rmSync(swappedRoot, { recursive: true, force: true }); }
});

test('a same-origin link from development to production root fails path isolation', async () => {
  const root = setup();
  try {
    const indexPath = path.join(root, 'site/dev/index.html');
    writeFileSync(indexPath, '<script src="/heibon-mahjong/assets/main-prod.js"></script>');
    const releasePath = path.join(root, 'site/dev/release.json');
    const release = JSON.parse(readFileSync(releasePath, 'utf8'));
    release.files['index.html'] = sha256(readFileSync(indexPath));
    release.digest = digest(release.files);
    writeFileSync(releasePath, JSON.stringify(release, null, 2) + '\n');
    const devDir = path.join(root, 'site/dev');
    const statePath = path.join(root, 'state.json');
    const envPath = path.join(root, 'site/environments.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const current = state.current;
    current.development.digest = release.digest;
    current.development.snapshotDigest = digest(inventory(devDir));
    state.current = current;
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
    writeFileSync(envPath, JSON.stringify(current, null, 2) + '\n');
    const report = await runAudit(args(root, mockFetch(root)));
    assert.equal(report.outcome, 'FAIL');
    assert.ok(report.failures.some(failure => failure.kind === 'CROSS_ENVIRONMENT_REFERENCE'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an audit dispatched outside develop stops before API or Pages requests', async () => {
  const root = setup();
  try {
    let calls = 0;
    const report = await runAudit(args(root, async () => { calls++; throw new Error('must not run'); }, { ref: 'refs/heads/main' }));
    assert.equal(report.outcome, 'FAIL');
    assert.equal(report.failures[0].kind, 'WRONG_BRANCH');
    assert.equal(calls, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('moving a protected branch during the audit is recorded as a failure', async () => {
  const root = setup();
  try {
    const baseFetch = mockFetch(root);
    let developReads = 0;
    const changingFetch = async (input, options) => {
      const url = new URL(input);
      if (url.hostname === 'api.test' && url.pathname.endsWith('/commits/develop')) {
        developReads++;
        const sha = developReads === 1 ? 'd'.repeat(40) : 'f'.repeat(40);
        return new Response(JSON.stringify({ sha }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return baseFetch(input, options);
    };
    const report = await runAudit(args(root, changingFetch));
    assert.equal(report.outcome, 'FAIL');
    assert.ok(report.failures.some(failure => failure.kind === 'REMOTE_REF_CHANGED'));
    assert.equal(report.targets.production.outcome, 'SUCCESS');
    assert.equal(report.targets.development.outcome, 'SUCCESS');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('manual workflow has read-only GITHUB_TOKEN permissions and no publication or deploy step', () => {
  const workflow = readFileSync(new URL('../.github/workflows/issue47-phase6a-live-audit.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /deployments: read/);
  assert.doesNotMatch(workflow, /contents: write|actions: write|deployments: write|pages: write|id-token: write|CLOUDFLARE|wrangler deploy|actions\/deploy-pages/);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
