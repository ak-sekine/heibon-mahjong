import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REQUIRED_ENVIRONMENT_JOBS } from '../.github/scripts/check-browser-ui-matrix.mjs';
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
  productionDeploymentCreatedAt,
  missingProductionDeployment = false,
  productionDeploymentApiStatus = null,
  additionalDeploymentsByEnvironment = {},
  reservedPublication = false,
  skipReservation = false,
  latestPages = 'development',
  pagesStatus = 'success',
  pagesStatusLogUrl,
  pagesDeployment = {},
  publicationRun = {},
  publicationJob = {},
  reuseProduction = false,
  sourceJobResult = 'success',
  pagesApiStatus = 200,
} = {}) {
  const productionLatest = latestPages === 'production';
  const releaseDates = {
    production: productionLatest ? dates.development : dates.production,
    development: productionLatest ? dates.production : dates.development,
  };
  const pagesRunId = productionLatest ? 100 : 200;
  const pagesJobId = pagesRunId + 1;
  const pagesJobUrl = `https://github.com/${repo}/actions/runs/${pagesRunId}/job/${pagesJobId}`;
  const deploymentsByEnvironment = {
    [productionDeploymentEnvironment]: missingProductionDeployment ? [] : [{
      id: 1, environment: productionDeploymentEnvironment, sha: productionDeploymentSha, created_at: productionDeploymentCreatedAt || releaseDates.production.deployment,
    }],
    'worker-development': [{ id: 2, environment: 'worker-development', sha: devSha, created_at: releaseDates.development.deployment }],
    'github-pages': [{
      id: 3, environment: 'github-pages', ref: productionLatest ? 'main' : 'develop',
      sha: productionLatest ? prodSha : devSha, created_at: releaseDates[latestPages].deployment,
      ...pagesDeployment,
    }],
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
      if (reuseProduction && apiPath.endsWith('/actions/runs/90/attempts/1')) {
        return Response.json({ id: 90, workflow_id: 415213931, path: ENVIRONMENTS_WORKFLOW,
          head_branch: 'main', head_sha: prodSha, event: 'push', run_attempt: 1, status: 'completed', conclusion: 'success',
          repository: { id: 1415016053 }, head_repository: { id: 1415016053 } });
      }
      if (reuseProduction && apiPath.endsWith('/actions/runs/90/attempts/1/jobs')) {
        const jobs = REQUIRED_ENVIRONMENT_JOBS.map((name, index) => ({ name, run_id: 90, run_attempt: 1,
          status: 'completed', conclusion: index === 0 ? sourceJobResult : 'success' }));
        return Response.json({ total_count: jobs.length, jobs });
      }
      const runMatch = apiPath.match(/\/actions\/runs\/(\d+)$/);
      if (apiPath.endsWith('/actions/runs') || runMatch) {
        if (runMatch && Number(runMatch[1]) !== pagesRunId) return new Response('not found', { status: 404 });
        const branch = runMatch ? (productionLatest ? 'main' : 'develop') : url.searchParams.get('branch');
        const env = branch === 'develop' ? 'development' : 'production';
        const sha = env === 'development' ? devSha : prodSha;
        const run = {
          id: env === 'development' ? 200 : 100,
          head_branch: branch, head_sha: sha, path: env === 'development' ? ENVIRONMENTS_WORKFLOW : productionWorkflowPath,
          status: 'completed', conclusion: 'success', event: env === 'development' || productionWorkflowPath === ENVIRONMENTS_WORKFLOW ? 'workflow_dispatch' : 'push',
          run_attempt: 1, html_url: `https://github.com/${repo}/actions/runs/${env === 'development' ? 200 : 100}`,
          head_repository: { full_name: repo },
          created_at: releaseDates[env].created, updated_at: releaseDates[env].updated,
        };
        return Response.json(runMatch ? { ...run, ...publicationRun } : { workflow_runs: [run] });
      }
      if (/\/actions\/runs\/(100|200)(?:\/attempts\/1)?\/jobs$/.test(apiPath)) {
        const env = apiPath.includes('/200/') ? 'development' : 'production';
        const names = reuseProduction && env === 'production'
          ? ['classify-changes', 'docs-check', 'publish / verify-production-source', 'publish / publish', 'online', 'worker-production']
          : jobNames(env, productionWorkflowPath);
        const jobs = names.map(name => ({ name, conclusion: 'success' }));
        if (apiPath.includes('/attempts/')) {
          const job = jobs.find(job => job.name === (env === 'production' && productionWorkflowPath === LEGACY_PRODUCTION_WORKFLOW ? 'pages-deploy' : 'publish / publish'));
          Object.assign(job, {
            id: pagesJobId, run_id: pagesRunId, run_attempt: 1, head_sha: productionLatest ? prodSha : devSha,
            status: 'completed', completed_at: releaseDates[env].updated, ...publicationJob,
          });
        }
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
        if (environment === 'github-pages' && pagesApiStatus !== 200) return new Response(null, { status: pagesApiStatus });
        return new Response(JSON.stringify(deploymentsByEnvironment[environment] || []), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const statusMatch = apiPath.match(/\/deployments\/(\d+)\/statuses$/);
      if (statusMatch) {
        const deploymentId = Number(statusMatch[1]);
        const state = deploymentId === 1 ? productionDeploymentStatus : deploymentId === 3 ? pagesStatus : 'success';
        const log_url = deploymentId === 3 ? pagesStatusLogUrl ?? pagesJobUrl : null;
        return new Response(JSON.stringify([{ state, log_url, url: `https://api.test/deployments/${deploymentId}` }]), { status: 200, headers: { 'content-type': 'application/json' } });
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

test('accepts the linked Pages publication after either release order', async t => {
  const root = setup();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const environment of ['production', 'development']) {
    const report = await runAudit(args(root, mockFetch(root, {
      latestPages: environment, productionWorkflowPath: ENVIRONMENTS_WORKFLOW, reservedPublication: true,
    })));
    assert.equal(report.outcome, 'SUCCESS', JSON.stringify(report.failures));
    const runId = environment === 'production' ? 100 : 200;
    assert.deepEqual(report.provenance.runs.pages, { environment, runId, jobId: runId + 1 });
    assert.equal(report.provenance.deployments.pages.sha, report.provenance.runs[environment].sha);
    assert.match(renderSummary(report), new RegExp(`Shared Pages publication: ${environment}, run ${runId}, job ${runId + 1}`));
    assert.deepEqual(Object.values(report.targets).map(target => [target.hashMatches, target.metadataMatches]), [[16, 2], [16, 1]]);
  }
});

test('rejects the latest Pages deployment when its source, status, linked run or job cannot be proven', async t => {
  const root = setup();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [kind, options] of [
    ['DEPLOYMENT_SHA_MISMATCH', { pagesDeployment: { sha: 'f'.repeat(40) } }],
    ['DEPLOYMENT_SHA_MISMATCH', { pagesDeployment: { sha: prodSha } }],
    ['DEPLOYMENT_NOT_SUCCESS', { pagesStatus: 'failure' }],
    ['DEPLOYMENT_NOT_SUCCESS', { pagesStatus: 'in_progress' }],
    ['DEPLOYMENT_RUN_LINK_INVALID', { pagesStatusLogUrl: '' }],
    ['GITHUB_API_HTTP_404', { pagesStatusLogUrl: `https://github.com/${repo}/actions/runs/999/job/201` }],
    ['PUBLICATION_RUN_NOT_FOUND', { publicationRun: { conclusion: 'failure' } }],
    ['PUBLICATION_RUN_NOT_FOUND', { publicationRun: { head_sha: prodSha } }],
    ['DEPLOYMENT_RUN_MISMATCH', { pagesDeployment: { created_at: dates.production.deployment } }],
    ['DEPLOYMENT_RUN_MISMATCH', { pagesDeployment: { created_at: '2026-11-15T22:30:00Z' } }],
    ['DEPLOYMENT_JOB_MISMATCH', { pagesStatusLogUrl: `https://github.com/${repo}/actions/runs/200/job/999` }],
    ['DEPLOYMENT_JOB_MISMATCH', { publicationJob: { run_id: 100 } }],
    ['DEPLOYMENT_JOB_MISMATCH', { publicationJob: { run_attempt: 2 } }],
    ['GITHUB_API_FORBIDDEN', { pagesApiStatus: 403 }],
  ]) {
    await t.test(`${kind} ${JSON.stringify(options)}`, async () => {
      const report = await runAudit(args(root, mockFetch(root, options)));
      assert.equal(report.outcome, 'FAIL');
      assert.equal(report.provenance.failures.find(failure => failure.name === 'pages')?.kind, kind);
    });
  }
});

test('rejects invalid deployment API data and live metadata that differs from the snapshot', async t => {
  const root = setup();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fetch = mockFetch(root, { corrupt: new Map([['https://ak-sekine.github.io/heibon-mahjong/dev/release.json', '{}']]) });
  const report = await runAudit(args(root, (input, options) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/deployments/3/statuses')) return Response.json({});
    return fetch(input, options);
  }));
  assert.equal(report.outcome, 'FAIL');
  assert.equal(report.provenance.failures.find(failure => failure.name === 'pages')?.kind, 'GITHUB_API_INVALID_DATA');
  assert.equal(report.targets.development.outcome, 'FAIL');
  assert.equal(report.targets.development.metadataMismatches, 1);
  assert.equal(report.targets.production.outcome, 'SUCCESS');
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

test('an audit dispatched from an unapproved ref stops before API or Pages requests', async () => {
  const root = setup();
  try {
    let calls = 0;
    const report = await runAudit(args(root, async () => { calls++; throw new Error('must not run'); }, { ref: 'refs/heads/arbitrary' }));
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

test('moving pages-verified during public reads is recorded as a failure', async () => {
  const root = setup();
  try {
    const baseFetch = mockFetch(root);
    let publicRead = false;
    const changingFetch = async (input, options) => {
      const url = new URL(input);
      if (url.hostname !== 'api.test') publicRead = true;
      if (url.pathname.endsWith('/commits/pages-verified') && publicRead) {
        const sha = 'f'.repeat(40);
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

test('Issue deployment origin survives source branch removal and rejects an incorrect retained tag', async () => {
  const root = setup();
  try {
    const branch = 'issue/64-main-flow';
    const sourceRef = `refs/heads/${branch}`;
    const state = JSON.parse(readFileSync(path.join(root, 'state.json')));
    state.current.development.publication = {
      sourceRef, workflowRef: `${repo}/${ENVIRONMENTS_WORKFLOW}@${sourceRef}`, workflowSha: devSha,
      baseSha: prodSha, runId: '200', attempt: '1',
    };
    writeFile(root, 'state.json', JSON.stringify(state));
    writeFile(root, 'site/environments.json', JSON.stringify(state.current));
    const underlying = mockFetch(root, {
      reservedPublication: true, pagesDeployment: { ref: branch },
      publicationRun: { head_branch: branch, head_repository: { full_name: repo } },
    });
    for (const tagSha of [devSha, prodSha]) {
      const mock = url => {
        const parsed = new URL(url);
        assert(!parsed.pathname.includes('/commits/issue/'), 'audit consulted the removed source branch');
        if (parsed.pathname.endsWith(`/git/ref/tags/verified/development/${devSha}`)) {
          return Response.json({ object: { type: 'commit', sha: tagSha } });
        }
        return underlying(url);
      };
      const report = await runAudit(args(root, mock, { ref: 'refs/heads/main', auditSha: 'e'.repeat(40) }));
      assert.equal(report.outcome, tagSha === devSha ? 'SUCCESS' : 'FAIL', JSON.stringify(report.failures));
      if (tagSha === devSha) assert.equal(report.provenance.runs.development.branch, branch);
      else assert(report.failures.some(failure => failure.kind === 'PUBLICATION_REF_MISMATCH'));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('live audit traces a reused production publication back to its complete push attempt', async () => {
  const root = setup();
  try {
    const state = JSON.parse(readFileSync(path.join(root, 'state.json')));
    state.current.production.publication = { runId: '100', attempt: '1', sourceVerification: {
      workflowId: 415213931, workflowRef: repo + '/' + ENVIRONMENTS_WORKFLOW + '@refs/heads/main',
      runId: 90, attempt: 1, artifactId: 30, digest: 'sha256:' + 'f'.repeat(64), expiresAt: '2027-02-20T00:00:00Z',
    } };
    writeFile(root, 'state.json', JSON.stringify(state));
    writeFile(root, 'site/environments.json', JSON.stringify(state.current));
    const options = { productionWorkflowPath: ENVIRONMENTS_WORKFLOW, latestPages: 'production',
      reservedPublication: true, reuseProduction: true };
    const report = await runAudit(args(root, mockFetch(root, options)));
    assert.equal(report.outcome, 'SUCCESS', JSON.stringify(report.failures));
    const failed = await runAudit(args(root, mockFetch(root, { ...options, sourceJobResult: 'skipped' })));
    assert(failed.failures.some(failure => failure.kind === 'PUBLICATION_RUN_JOBS_FAILED'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
