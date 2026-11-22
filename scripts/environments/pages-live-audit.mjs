import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = Object.freeze({
  production: Object.freeze({
    baseUrl: 'https://ak-sekine.github.io/heibon-mahjong/',
    pathPrefix: '/heibon-mahjong/',
    snapshotPath: 'site',
    workerUrl: 'https://heibon-mahjong-online.ak-sekine.workers.dev',
  }),
  development: Object.freeze({
    baseUrl: 'https://ak-sekine.github.io/heibon-mahjong/dev/',
    pathPrefix: '/heibon-mahjong/dev/',
    snapshotPath: 'site/dev',
    workerUrl: 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev',
  }),
});

const SHA_RE = /^[a-f0-9]{40}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const EXPECTED_PAYLOAD_FILES = 16;
const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const WORKFLOW_PATHS = Object.freeze({
  legacyProduction: '.github/workflows/deploy.yml',
  environments: '.github/workflows/environments.yml',
});
const PRODUCTION_WORKER_DEPLOYMENT_ENVIRONMENTS = Object.freeze({
  [WORKFLOW_PATHS.legacyProduction]: 'heibon-production-worker',
  [WORKFLOW_PATHS.environments]: 'worker-production',
});

export class AuditError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = 'AuditError';
    this.kind = kind;
    this.details = details;
  }
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function digest(files) {
  const sorted = {};
  for (const name of Object.keys(files).sort()) sorted[name] = files[name];
  return sha256(Buffer.from(JSON.stringify(sorted)));
}

export function inventory(root, prefix = '') {
  const result = {};
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(root, relative);
    const info = lstatSync(absolute);
    if (info.isSymbolicLink()) throw new AuditError('SNAPSHOT_INVALID', `snapshot contains symlink: ${relative}`);
    if (info.isDirectory()) Object.assign(result, inventory(root, relative));
    else if (info.isFile()) result[relative] = sha256(readFileSync(absolute));
    else throw new AuditError('SNAPSHOT_INVALID', `snapshot contains unsupported entry: ${relative}`);
  }
  return result;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function readJson(file, label) {
  try {
    const info = lstatSync(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('not a regular file');
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  catch (error) { throw new AuditError('SNAPSHOT_INVALID', `${label} is missing or invalid JSON`, { cause: error?.message }); }
}

function readSnapshot(snapshotRoot, snapshotSha) {
  if (!SHA_RE.test(snapshotSha || '')) throw new AuditError('SNAPSHOT_INVALID', 'pages-verified checkout SHA is unavailable or invalid');
  const state = readJson(path.join(snapshotRoot, 'state.json'), 'state.json');
  if (state.version !== 1) throw new AuditError('SNAPSHOT_INVALID', 'unsupported state.json version');
  if (state.pending !== null) throw new AuditError('PENDING_UNRESOLVED', 'pages-verified state has an unresolved pending publication');
  if (!state.current?.production || !state.current?.development) {
    throw new AuditError('SNAPSHOT_INVALID', 'both current production and development snapshots are required');
  }
  if (Object.keys(state.current).sort().join(',') !== 'development,production') {
    throw new AuditError('SNAPSHOT_INVALID', 'state.current contains an unexpected environment');
  }

  const envMetadata = readJson(path.join(snapshotRoot, 'site/environments.json'), 'site/environments.json');
  if (canonical(envMetadata) !== canonical(state.current)) {
    throw new AuditError('SNAPSHOT_INVALID', 'saved environments.json does not match state.current');
  }

  const records = {};
  for (const environment of ['production', 'development']) {
    const target = TARGETS[environment];
    const root = path.join(snapshotRoot, target.snapshotPath);
    if (!existsSync(root)) throw new AuditError('SNAPSHOT_INVALID', `${environment} snapshot directory is missing`);
    const rootInfo = lstatSync(root);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new AuditError('SNAPSHOT_INVALID', `${environment} snapshot root is not a regular directory`);
    const releasePath = path.join(root, 'release.json');
    const release = readJson(releasePath, `${environment} release.json`);
    const releaseBytes = readFileSync(releasePath);
    const record = state.current[environment];
    if (release.version !== 1 || release.environment !== environment || !SHA_RE.test(release.sha || '')) {
      throw new AuditError('SNAPSHOT_INVALID', `${environment} release identity is invalid`);
    }
    if (!HASH_RE.test(release.digest || '') || !HASH_RE.test(record.digest || '') || !HASH_RE.test(record.snapshotDigest || '')) {
      throw new AuditError('SNAPSHOT_INVALID', `${environment} digest metadata is invalid`);
    }
    if (release.workerUrl !== target.workerUrl || record.workerUrl !== target.workerUrl) {
      throw new AuditError('SNAPSHOT_INVALID', `${environment} Worker URL does not match the fixed target`);
    }

    const completeSnapshot = Object.fromEntries(Object.entries(inventory(root))
      .filter(([name]) => environment !== 'production' || (name !== 'environments.json' && !name.startsWith('dev/'))));
    const payload = { ...completeSnapshot };
    delete payload['release.json'];
    const releaseNames = Object.keys(release.files || {}).sort();
    const storedNames = Object.keys(payload).sort();
    if (releaseNames.length !== EXPECTED_PAYLOAD_FILES || storedNames.length !== EXPECTED_PAYLOAD_FILES) {
      throw new AuditError('SNAPSHOT_INVALID', `${environment} inventory must contain exactly ${EXPECTED_PAYLOAD_FILES} payload files`, {
        releaseFileCount: releaseNames.length, storedFileCount: storedNames.length,
      });
    }
    if (canonical(release.files) !== canonical(payload)) {
      throw new AuditError('SNAPSHOT_INVALID', `${environment} saved payload files do not match release.json inventory`);
    }
    if (digest(payload) !== release.digest || record.digest !== release.digest) {
      throw new AuditError('SNAPSHOT_INVALID', `${environment} release digest does not match its saved inventory`);
    }

    if (digest(completeSnapshot) !== record.snapshotDigest) {
      throw new AuditError('SNAPSHOT_INVALID', `${environment} snapshotDigest does not match saved bytes`);
    }
    if (record.sha !== release.sha || record.workerUrl !== release.workerUrl) {
      throw new AuditError('SNAPSHOT_INVALID', `${environment} release.json does not match state.current`);
    }
    records[environment] = { environment, root, release, releaseBytes, payload, record, snapshotDigest: digest(completeSnapshot) };
  }

  const siteInventory = inventory(path.join(snapshotRoot, 'site'));
  const productionInventory = Object.fromEntries(Object.entries(siteInventory)
    .filter(([name]) => name !== 'environments.json' && !name.startsWith('dev/'))
    .map(([name, hash]) => [name, hash]));
  if (digest(productionInventory) !== state.current.production.snapshotDigest) {
    throw new AuditError('SNAPSHOT_INVALID', 'combined site production bytes do not match production snapshotDigest');
  }
  if (siteInventory['environments.json'] !== sha256(readFileSync(path.join(snapshotRoot, 'site/environments.json')))) {
    throw new AuditError('SNAPSHOT_INVALID', 'saved environments.json inventory is inconsistent');
  }

  return { snapshotSha, state, envMetadata, records, environmentsBytes: readFileSync(path.join(snapshotRoot, 'site/environments.json')) };
}

export function classifyTransportError(error) {
  const causeCode = String(error?.cause?.code || error?.code || '').toUpperCase();
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
  if (/proxy|connect tunnel/.test(message) && /403|forbidden/.test(message)) return 'PROXY_CONNECT_REJECTED';
  if (/timeout|timed out|aborted/.test(message) || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ABORT_ERR'].includes(causeCode)) return 'TIMEOUT';
  if (/certificate|tls|ssl/.test(message) || causeCode.startsWith('ERR_TLS') || causeCode.startsWith('CERT_')) return 'TLS_ERROR';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ENODATA'].includes(causeCode)) return 'DNS_ERROR';
  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT'].includes(causeCode)) return 'CONNECTION_ERROR';
  return 'TRANSPORT_ERROR';
}

function safeUrl(url) {
  return new URL(url).href;
}

async function request(url, { fetchImpl, headers = {}, timeoutMs, report, label, api = false }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: api ? headers : {
        accept: '*/*',
        'cache-control': 'no-cache, no-store, max-age=0',
        pragma: 'no-cache',
        ...headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const classification = classifyTransportError(error);
    const diagnostic = {
      label, url: safeUrl(url), outcome: classification,
      error: String(error?.message || error),
      cause: error?.cause?.message ? String(error.cause.message) : null,
      causeCode: error?.cause?.code || error?.code || null,
    };
    report.requests.push(diagnostic);
    throw new AuditError(classification, `${label}: ${classification}`, { error: diagnostic.error });
  }

  const cacheHeaders = Object.fromEntries(['age', 'cache-control', 'etag', 'last-modified', 'date', 'via', 'server', 'x-cache', 'cf-cache-status']
    .map(name => [name, response.headers?.get?.(name) || null]));
  const entry = {
    label, url: safeUrl(url), status: response.status,
    responseUrl: response.url || safeUrl(url), redirected: Boolean(response.redirected),
    location: response.headers?.get?.('location') || null,
    cacheHeaders,
  };
  report.requests.push(entry);
  if (response.status >= 300 && response.status < 400) {
    entry.outcome = 'UNEXPECTED_REDIRECT';
    throw new AuditError('UNEXPECTED_REDIRECT', `${label}: HTTP ${response.status} redirect was not followed`, { location: entry.location, status: response.status });
  }
  if (response.status !== 200) {
    const via = `${cacheHeaders.via || ''} ${cacheHeaders.server || ''}`.toLowerCase();
    const proxy403 = response.status === 403 && /proxy|squid|envoy|gateway/.test(via);
    if (proxy403) {
      entry.outcome = 'HTTP_403_PROXY_SUSPECTED';
    } else if (api) {
      entry.outcome = response.status === 401
        ? 'GITHUB_API_UNAUTHORIZED'
        : response.status === 403
          ? 'GITHUB_API_FORBIDDEN'
          : `GITHUB_API_HTTP_${response.status}`;
    } else {
      entry.outcome = `HTTP_STATUS_${response.status}`;
    }
    throw new AuditError(entry.outcome, `${label}: HTTP ${response.status} response`, { status: response.status, proxyHeaders: via.trim() || null });
  }
  entry.outcome = 'HTTP_200';
  return { response, entry };
}

function apiHeaders(token) {
  return { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': API_VERSION };
}

async function apiJson(url, options) {
  const { response } = await request(url, { ...options, api: true, headers: apiHeaders(options.token), label: options.label });
  try { return await response.json(); }
  catch { throw new AuditError('GITHUB_API_INVALID_JSON', `${options.label}: invalid JSON response`); }
}

async function deploymentRecord(environment, expectedSha, { apiBase, repository, token, fetchImpl, timeoutMs, report }) {
  const url = `${apiBase}/repos/${repository}/deployments?environment=${encodeURIComponent(environment)}&per_page=100`;
  const deployments = await apiJson(url, { fetchImpl, token, timeoutMs, report, label: `${environment} deployments` });
  if (!Array.isArray(deployments)) throw new AuditError('GITHUB_API_INVALID_DATA', `${environment} deployments response is not an array`);
  const candidate = deployments[0];
  if (!candidate || !Number.isInteger(candidate.id)) {
    throw new AuditError('DEPLOYMENT_NOT_FOUND', `no ${environment} deployment exists for ${expectedSha}`);
  }
  if (candidate.environment !== environment) {
    throw new AuditError('DEPLOYMENT_ENVIRONMENT_MISMATCH', `deployment ${candidate.id} belongs to ${candidate.environment || 'an unknown environment'}, expected ${environment}`, {
      actualEnvironment: candidate.environment || null, expectedEnvironment: environment,
    });
  }
  if (expectedSha && String(candidate.sha || '').toLowerCase() !== expectedSha) {
    throw new AuditError('DEPLOYMENT_SHA_MISMATCH', `latest ${environment} deployment does not match the saved source SHA`, { latestSha: candidate.sha || null, expectedSha });
  }
  if (typeof candidate.sha !== 'string' || !SHA_RE.test(candidate.sha.toLowerCase())) {
    throw new AuditError('DEPLOYMENT_SHA_MISMATCH', `latest ${environment} deployment has an invalid SHA`);
  }
  const statuses = await apiJson(`${apiBase}/repos/${repository}/deployments/${candidate.id}/statuses?per_page=100`, {
    fetchImpl, token, timeoutMs, report, label: `${environment} deployment ${candidate.id} statuses`,
  });
  if (!Array.isArray(statuses)) {
    throw new AuditError('GITHUB_API_INVALID_DATA', `${environment} deployment statuses response is not an array`);
  }
  if (statuses[0]?.state !== 'success') {
    throw new AuditError('DEPLOYMENT_NOT_SUCCESS', `${environment} deployment ${candidate.id} latest status is not success`, { latestStatus: statuses?.[0]?.state || null });
  }
  const record = { id: candidate.id, environment, sha: candidate.sha.toLowerCase(), createdAt: candidate.created_at, status: statuses[0].state, statusUrl: statuses[0].url || null };
  if (!expectedSha) Object.assign(record, { ref: candidate.ref, logUrl: statuses[0].log_url || null });
  return record;
}

const EXPECTED_ENVIRONMENT_JOBS = [
  'verify', 'local-online', 'isolation-browser (chromium)', 'isolation-browser (webkit)',
  'browser-ui / browser-ui (chromium, group 1)', 'browser-ui / browser-ui (chromium, group 2)',
  'browser-ui / browser-ui (webkit, group 1)', 'browser-ui / browser-ui (webkit, group 2)',
  'audit', 'publish / publish',
];

function workflowPathMatches(runPath, expectedPath) {
  return typeof runPath === 'string' && (runPath === expectedPath || runPath.startsWith(`${expectedPath}@`));
}

async function releaseRun(environment, sourceSha, context, pagesLink) {
  const branch = environment === 'development' ? 'develop' : 'main';
  const runsUrl = `${context.apiBase}/repos/${context.repository}/actions/runs`;
  const query = new URLSearchParams({ branch, head_sha: sourceSha, per_page: '100' });
  const response = await apiJson(pagesLink ? `${runsUrl}/${pagesLink.runId}` : `${runsUrl}?${query}`, {
    ...context, label: `${environment} publication workflow runs`,
  });
  if (!pagesLink && !Array.isArray(response?.workflow_runs)) {
    throw new AuditError('GITHUB_API_INVALID_DATA', `${environment} workflow runs response is invalid`);
  }
  const runs = (pagesLink ? [response] : response.workflow_runs).filter(run => {
    if (run?.head_sha !== sourceSha || run.head_branch !== branch || run.conclusion !== 'success') return false;
    if (pagesLink && (run.id !== pagesLink.runId || run.status !== 'completed' ||
        !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1)) return false;
    if (environment === 'production' && workflowPathMatches(run.path, WORKFLOW_PATHS.legacyProduction)) return true;
    return workflowPathMatches(run.path, WORKFLOW_PATHS.environments) && run.event === 'workflow_dispatch';
  });
  const run = runs.sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at))[0];
  if (!run) throw new AuditError('PUBLICATION_RUN_NOT_FOUND', `successful ${branch} publication run not found for ${sourceSha}`, pagesLink);
  const attemptPath = pagesLink ? `/attempts/${run.run_attempt}` : '';
  const jobsResponse = await apiJson(`${runsUrl}/${run.id}${attemptPath}/jobs?per_page=100`, {
    ...context, label: `${environment} publication run ${run.id} jobs`,
  });
  const jobs = jobsResponse?.jobs;
  if (!Array.isArray(jobs)) throw new AuditError('GITHUB_API_INVALID_DATA', `publication run ${run.id} jobs response is invalid`);
  const byName = new Map(jobs.map(job => [job.name, job.conclusion]));
  let pagesJob;
  if (pagesLink) {
    const expectedName = workflowPathMatches(run.path, WORKFLOW_PATHS.legacyProduction) ? 'pages-deploy' : 'publish / publish';
    const job = jobs.find(job => job.id === pagesLink.jobId);
    if (!job || job.name !== expectedName || job.run_id !== run.id || job.run_attempt !== run.run_attempt ||
        job.head_sha !== run.head_sha || job.status !== 'completed' || job.conclusion !== 'success') {
      throw new AuditError('DEPLOYMENT_JOB_MISMATCH', `linked job is not the successful Pages publication job of run ${run.id}`, pagesLink);
    }
    pagesJob = { id: job.id, name: job.name, completedAt: job.completed_at };
  }
  if (environment === 'production' && workflowPathMatches(run.path, WORKFLOW_PATHS.legacyProduction)) {
    for (const name of ['deploy-worker', 'production-test', 'pages-deploy']) {
      if (byName.get(name) !== 'success') throw new AuditError('PUBLICATION_RUN_JOBS_FAILED', `production run ${run.id} job ${name} is not successful`, { job: name, conclusion: byName.get(name) || null });
    }
  } else {
    const publicationJobs = ['reserve', 'online', 'worker-production', 'worker-development'];
    const relocated = publicationJobs.some(name => byName.has('publish / ' + name));
    const prefix = relocated ? 'publish / ' : '';
    const opposite = environment === 'production' ? 'development' : 'production';
    const required = [...EXPECTED_ENVIRONMENT_JOBS, prefix + 'online', prefix + 'worker-' + environment];
    if (relocated) required.push('publish / reserve');
    const missing = required.filter(name => byName.get(name) !== 'success');
    const otherWorker = prefix + 'worker-' + opposite;
    if (byName.get(otherWorker) !== 'skipped') missing.push(otherWorker + ' (expected skipped)');
    if (missing.length) throw new AuditError('PUBLICATION_RUN_JOBS_FAILED', `${environment} publication run ${run.id} has incomplete jobs`, { missing });
  }
  return {
    id: run.id, url: run.html_url, branch, sha: run.head_sha, event: run.event,
    conclusion: run.conclusion, attempt: run.run_attempt, createdAt: run.created_at, updatedAt: run.updated_at,
    workflowPath: run.path, ...(pagesJob ? { pagesJob } : {}), jobs: Object.fromEntries([...byName.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

function productionWorkerDeploymentEnvironment(run) {
  for (const [workflowPath, environment] of Object.entries(PRODUCTION_WORKER_DEPLOYMENT_ENVIRONMENTS)) {
    if (workflowPathMatches(run?.workflowPath, workflowPath)) return environment;
  }
  throw new AuditError('PUBLICATION_WORKFLOW_UNSUPPORTED', 'cannot determine the production Worker deployment environment from the publication workflow', {
    workflowPath: run?.workflowPath || null,
  });
}

function ensureRunWindow(deployment, run) {
  const deployedAt = Date.parse(deployment.createdAt || '');
  const start = Date.parse(run.createdAt || '');
  const end = Date.parse(run.updatedAt || '');
  if (![deployedAt, start, end].every(Number.isFinite) || deployedAt < start - 60 * 60 * 1000 || deployedAt > end + 60 * 60 * 1000) {
    throw new AuditError('DEPLOYMENT_RUN_MISMATCH', `${deployment.environment} deployment ${deployment.id} is outside its publication run window`, { createdAt: deployment.createdAt, runId: run.id, runCreatedAt: run.createdAt, runUpdatedAt: run.updatedAt });
  }
}

async function verifyPagesDeployment(deployment, sourceShas, context) {
  const environment = { main: 'production', develop: 'development' }[deployment.ref];
  if (!Object.hasOwn(sourceShas, environment) || deployment.sha !== sourceShas[environment]) {
    throw new AuditError('DEPLOYMENT_SHA_MISMATCH', 'latest github-pages deployment does not match the saved source SHA for its ref', {
      ref: deployment.ref || null, sha: deployment.sha, expectedSha: sourceShas[environment] || null,
    });
  }
  const link = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/([1-9]\d*)\/job\/([1-9]\d*)$/.exec(deployment.logUrl || '');
  const runId = Number(link?.[2]);
  const jobId = Number(link?.[3]);
  if (link?.[1] !== context.repository || !Number.isSafeInteger(runId) || !Number.isSafeInteger(jobId)) {
    throw new AuditError('DEPLOYMENT_RUN_LINK_INVALID', 'latest github-pages status has no Actions job URL for this repository', { deploymentId: deployment.id });
  }
  const run = await releaseRun(environment, sourceShas[environment], context, { runId, jobId });
  // GitHub creates the environment deployment before the job starts (including any approval wait).
  const times = [run.createdAt, deployment.createdAt, run.pagesJob.completedAt, run.updatedAt].map(value => Date.parse(value || ''));
  if (!times.every(Number.isFinite) || times.some((time, index) => index > 0 && time < times[index - 1])) {
    throw new AuditError('DEPLOYMENT_RUN_MISMATCH', 'github-pages deployment is outside its linked publication run window', {
      deploymentId: deployment.id, createdAt: deployment.createdAt, runId, runCreatedAt: run.createdAt,
      jobCompletedAt: run.pagesJob.completedAt, runUpdatedAt: run.updatedAt,
    });
  }
  return { environment, run };
}

function resolveLocalReference(raw, environment, files, sourceUrl = TARGETS[environment].baseUrl) {
  if (!raw || /^(?:data:|mailto:|tel:|javascript:|#)/i.test(raw)) return { kind: 'ignored' };
  const base = TARGETS[environment];
  let resolved;
  try { resolved = new URL(raw, sourceUrl); }
  catch { throw new AuditError('PUBLIC_REFERENCE_INVALID', `${environment} HTML has an invalid resource URL`, { reference: raw }); }
  if (resolved.origin !== 'https://ak-sekine.github.io') return { kind: 'external', url: resolved.origin };
  if (!resolved.pathname.startsWith(base.pathPrefix)) {
    throw new AuditError('CROSS_ENVIRONMENT_REFERENCE', `${environment} HTML references a same-origin path outside its published directory`, { reference: raw, path: resolved.pathname });
  }
  let relative;
  try { relative = decodeURIComponent(resolved.pathname.slice(base.pathPrefix.length)); }
  catch { throw new AuditError('PUBLIC_REFERENCE_INVALID', `${environment} HTML has a malformed escaped path`, { reference: raw }); }
  if (!relative || resolved.pathname.endsWith('/')) relative = `${relative}index.html`;
  if (!Object.hasOwn(files, relative)) {
    throw new AuditError('PUBLIC_REFERENCE_MISSING', `${environment} HTML references a path outside release inventory`, { reference: raw, relative });
  }
  return { kind: 'local', relative };
}

function inspectHtml(html, environment, files) {
  const references = [];
  const pattern = /<(?:script|link|img|source|video|audio|iframe|object)\b[^>]*?\b(?:src|href|poster|data)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const result = resolveLocalReference(match[1], environment, files);
    if (result.kind !== 'ignored') references.push({ reference: match[1], ...result });
  }
  return references;
}

function inspectCss(css, environment, files, stylesheetUrl) {
  const references = [];
  const pattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  for (const match of css.matchAll(pattern)) {
    const result = resolveLocalReference(match[1].trim(), environment, files, stylesheetUrl);
    if (result.kind !== 'ignored') references.push({ reference: match[1].trim(), ...result });
  }
  return references;
}

function inspectServiceWorkerRegistration(source, expectedPrefix) {
  const registrations = [];
  const pattern = /navigator\.serviceWorker\.register\(\s*([A-Za-z_$][\w$]*)\s*\+\s*["']sw\.js["']\s*,\s*\{\s*scope\s*:\s*([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(pattern)) {
    const urlVariable = match[1];
    const scopeVariable = match[2];
    const assignmentPattern = new RegExp(`(?:const|let|var)\\s+${urlVariable}\\s*=\\s*(["'])([^"']+)\\1`, 'g');
    const assignments = [...source.slice(0, match.index).matchAll(assignmentPattern)];
    const basePath = assignments.at(-1)?.[2] || null;
    registrations.push({ basePath, urlUsesBase: true, scopeUsesSameBase: urlVariable === scopeVariable });
  }
  const valid = registrations.length > 0 && registrations.every(registration => registration.basePath === expectedPrefix && registration.urlUsesBase && registration.scopeUsesSameBase);
  return { valid, registrations };
}

function validatePublicMetadata(bytes, environment, expected) {
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); }
  catch { throw new AuditError('PUBLIC_METADATA_INVALID', `${environment} public JSON metadata is invalid`); }
  if (environment === 'release') {
    if (canonical(parsed) !== canonical(expected)) throw new AuditError('PUBLIC_METADATA_MISMATCH', 'public release.json differs from the saved snapshot');
  } else if (environment === 'environments') {
    if (canonical(parsed) !== canonical(expected)) throw new AuditError('PUBLIC_METADATA_MISMATCH', 'public environments.json differs from state.current');
  } else {
    const base = TARGETS[environment]?.pathPrefix;
    if (!base) throw new AuditError('PUBLIC_METADATA_INVALID', `unknown metadata environment ${environment}`);
    if (parsed.id !== base || parsed.start_url !== base || parsed.scope !== base) {
      throw new AuditError('PUBLIC_MANIFEST_MISMATCH', `${environment} manifest id/start_url/scope do not match its base path`, { id: parsed.id, start_url: parsed.start_url, scope: parsed.scope, expected: base });
    }
  }
  return parsed;
}

async function liveGet(url, label, context) {
  return request(url, { ...context, label });
}

function cacheKey(url, nonce) {
  const result = new URL(url);
  result.searchParams.set('__issue47_audit', nonce);
  return result.href;
}

async function verifyEnvironment(environment, snapshot, context) {
  const target = TARGETS[environment];
  const record = snapshot.records[environment];
  const result = {
    environment, baseUrl: target.baseUrl, sourceSha: record.release.sha,
    workerUrl: record.release.workerUrl, releaseDigest: record.release.digest,
    snapshotDigest: record.record.snapshotDigest, fileCount: Object.keys(record.release.files).length,
    hashMatches: 0, hashMismatches: 0, metadataMatches: 0, metadataMismatches: 0,
    files: [], references: [], outcome: 'FAIL',
  };
  const fetched = new Map();
  const nonce = `${context.runId || 'local'}-${context.runAttempt || 1}-${context.now().getTime()}`;
  async function fetchPath(relative, expectedBytes, category) {
    const url = cacheKey(new URL(relative.split('/').map(encodeURIComponent).join('/'), target.baseUrl).href, nonce);
    const item = { path: relative, category, url: safeUrl(url), expectedSha256: sha256(expectedBytes), liveSha256: null, status: null, cacheHeaders: null, outcome: 'NOT_ATTEMPTED' };
    result.files.push(item);
    try {
      const { response, entry } = await liveGet(url, `${environment} ${relative}`, context);
      const bytes = Buffer.from(await response.arrayBuffer());
      item.status = entry.status;
      item.cacheHeaders = entry.cacheHeaders;
      item.liveSha256 = sha256(bytes);
      item.outcome = item.liveSha256 === item.expectedSha256 ? 'MATCH' : 'HASH_MISMATCH';
      if (item.liveSha256 === item.expectedSha256) {
        if (category === 'release-file') result.hashMatches++;
        else result.metadataMatches++;
      } else if (category === 'release-file') result.hashMismatches++;
      else result.metadataMismatches++;
      fetched.set(relative, bytes);
      if (item.outcome === 'HASH_MISMATCH') {
        context.failures.push({ environment, path: relative, kind: 'HASH_MISMATCH', expectedSha256: item.expectedSha256, liveSha256: item.liveSha256 });
      }
      return bytes;
    } catch (error) {
      item.status = error.details?.status || null;
      item.outcome = error.kind || 'REQUEST_FAILED';
      item.error = error.message;
      context.failures.push({ environment, path: relative, kind: item.outcome, message: error.message });
      return null;
    }
  }

  const htmlBytes = await fetchPath('index.html', readFileSync(path.join(record.root, 'index.html')), 'release-file');
  const releaseBytes = await fetchPath('release.json', record.releaseBytes, 'release-metadata');
  let environmentsBytes = null;
  if (environment === 'production') {
    environmentsBytes = await fetchPath('environments.json', snapshot.environmentsBytes, 'composite-metadata');
  }

  const remaining = Object.keys(record.release.files).filter(name => name !== 'index.html');
  const workers = Math.min(4, remaining.length);
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < remaining.length) {
      const name = remaining[next++];
      await fetchPath(name, readFileSync(path.join(record.root, name)), 'release-file');
    }
  }));

  if (htmlBytes) {
    try {
      result.references = inspectHtml(htmlBytes.toString('utf8'), environment, record.release.files);
    } catch (error) {
      context.failures.push({ environment, path: 'index.html', kind: error.kind || 'PUBLIC_REFERENCE_INVALID', message: error.message });
    }
  }
  for (const [relative, bytes] of fetched) {
    if (!relative.endsWith('.css')) continue;
    try {
      const cssUrl = new URL(relative.split('/').map(encodeURIComponent).join('/'), target.baseUrl).href;
      result.references.push(...inspectCss(bytes.toString('utf8'), environment, record.release.files, cssUrl));
    } catch (error) {
      context.failures.push({ environment, path: relative, kind: error.kind || 'PUBLIC_REFERENCE_INVALID', message: error.message });
    }
  }
  for (const reference of result.references.filter(item => item.kind === 'external')) {
    context.failures.push({ environment, kind: 'EXTERNAL_RESOURCE_NOT_AUDITED', message: 'a static HTML/CSS reference leaves the two approved Pages targets', reference: reference.reference, origin: reference.url });
  }
  const manifestBytes = fetched.get('manifest.webmanifest');
  if (manifestBytes) {
    try {
      const manifest = validatePublicMetadata(manifestBytes, environment, record.release);
      const iconNames = Array.isArray(manifest.icons) ? manifest.icons.map(icon => icon.src) : [];
      if (!iconNames.length) throw new AuditError('PUBLIC_MANIFEST_MISMATCH', `${environment} manifest has no icons`);
      for (const icon of iconNames) {
        const reference = resolveLocalReference(icon, environment, record.release.files);
        if (reference.kind !== 'local') throw new AuditError('PUBLIC_MANIFEST_MISMATCH', `${environment} manifest icon is not an in-snapshot local path`, { icon });
      }
      result.manifest = { id: manifest.id, start_url: manifest.start_url, scope: manifest.scope, icons: iconNames };
    } catch (error) {
      context.failures.push({ environment, path: 'manifest.webmanifest', kind: error.kind || 'PUBLIC_MANIFEST_MISMATCH', message: error.message, details: error.details });
    }
  }
  if (releaseBytes) {
    try {
      validatePublicMetadata(releaseBytes, 'release', record.release);
      result.releaseMetadata = 'MATCH';
    } catch (error) {
      context.failures.push({ environment, path: 'release.json', kind: error.kind || 'PUBLIC_METADATA_MISMATCH', message: error.message });
    }
  }
  if (environmentsBytes) {
    try {
      validatePublicMetadata(environmentsBytes, 'environments', snapshot.state.current);
      result.environmentsMetadata = 'MATCH';
    } catch (error) {
      context.failures.push({ environment, path: 'environments.json', kind: error.kind || 'PUBLIC_METADATA_MISMATCH', message: error.message });
    }
  }

  const swBytes = fetched.get('sw.js');
  const appBundles = [...fetched.entries()].filter(([name]) => name.endsWith('.js'));
  const registrations = appBundles.flatMap(([, bytes]) => inspectServiceWorkerRegistration(bytes.toString('utf8'), target.pathPrefix).registrations);
  const registrationValid = registrations.length > 0 && registrations.every(registration => registration.basePath === target.pathPrefix && registration.scopeUsesSameBase);
  if (swBytes) {
    const sw = swBytes.toString('utf8');
    const rootMatches = sw.includes(`const ROOT = ${JSON.stringify(target.pathPrefix)}`);
    const precacheMatch = sw.match(/const PRECACHE = (\[[^\n]+\]);/);
    let precacheMatches = Boolean(precacheMatch);
    if (precacheMatch) {
      try {
        const precache = JSON.parse(precacheMatch[1]);
        precacheMatches = precacheMatches && precache.every(url => {
          if (typeof url !== 'string' || !url.startsWith(target.pathPrefix)) return false;
          const relative = url.slice(target.pathPrefix.length) || 'index.html';
          return relative === 'index.html' || Object.hasOwn(record.release.files, relative);
        });
      } catch { precacheMatches = false; }
    }
    const cachePrefix = environment === 'production' ? 'heibon-mahjong-shell-' : 'heibon-mahjong-dev-shell-';
    const cacheMatches = sw.includes(`const CACHE = "${cachePrefix}`);
    result.serviceWorker = { rootMatches, precacheMatches, cacheNamespaceMatches: cacheMatches, registrationMatches: registrationValid, registrations };
    if (!rootMatches || !precacheMatches || !cacheMatches || !registrationValid) {
      context.failures.push({ environment, path: 'sw.js', kind: 'PUBLIC_SERVICE_WORKER_MISMATCH', message: 'Service Worker root, precache, or cache namespace does not match the environment' });
    }
  }

  const metadataExpected = environment === 'production' ? 2 : 1;
  if (htmlBytes && releaseBytes && result.releaseMetadata === 'MATCH' && (environment !== 'production' || result.environmentsMetadata === 'MATCH') && result.hashMismatches === 0 && result.metadataMismatches === 0 && result.hashMatches === result.fileCount && result.metadataMatches === metadataExpected && result.references.every(ref => ref.kind !== 'local' || Object.hasOwn(record.release.files, ref.relative)) && result.serviceWorker?.rootMatches && result.serviceWorker?.precacheMatches && result.serviceWorker?.cacheNamespaceMatches && result.serviceWorker?.registrationMatches && result.manifest) {
    result.outcome = 'SUCCESS';
  }
  return result;
}

async function branchHeads(context) {
  const result = {};
  for (const branch of ['main', 'develop', 'pages-verified']) {
    const commit = await apiJson(`${context.apiBase}/repos/${context.repository}/commits/${branch}`, {
      ...context, label: `${branch} branch head`,
    });
    if (!SHA_RE.test(commit?.sha || '')) throw new AuditError('GITHUB_API_INVALID_DATA', `${branch} branch head SHA is invalid`);
    result[branch] = commit.sha.toLowerCase();
  }
  return result;
}

async function verifyProvenance(snapshot, context) {
  const result = {
    outcome: 'FAIL', runs: {}, deployments: {}, branchHeads: {},
    deploymentEnvironments: { productionWorker: null, developmentWorker: 'worker-development', pages: 'github-pages' },
  };
  const productionSha = snapshot.records.production.release.sha;
  const developmentSha = snapshot.records.development.release.sha;
  const runChecks = [
    ['production', () => releaseRun('production', productionSha, context)],
    ['development', () => releaseRun('development', developmentSha, context)],
  ];
  async function capture(collection, name, check) {
    try { result[collection][name] = await check(); }
    catch (error) {
      const failure = { kind: error.kind || 'PROVENANCE_ERROR', message: error.message, details: error.details || null };
      (result.failures ||= []).push({ collection, name, ...failure });
      context.failures.push({ collection, name, ...failure });
    }
  }
  try {
    result.branchHeads.atStart = await branchHeads(context);
    const expectedHead = context.reservationSha || snapshot.snapshotSha;
    if (result.branchHeads.atStart['pages-verified'] !== expectedHead) {
      throw new AuditError('SNAPSHOT_REF_CHANGED', 'pages-verified does not match the expected branch head', { expectedHead, remoteSha: result.branchHeads.atStart['pages-verified'] });
    }
    if (!context.auditSha || result.branchHeads.atStart.develop !== context.auditSha) {
      throw new AuditError('DEVELOP_REF_CHANGED', 'audit workflow SHA is not the current develop branch head', { auditSha: context.auditSha || null, remoteSha: result.branchHeads.atStart.develop });
    }
  } catch (error) {
    const failure = { kind: error.kind || 'BRANCH_HEADS_UNAVAILABLE', message: error.message, details: error.details || null };
    (result.failures ||= []).push(failure);
    context.failures.push(failure);
  }
  const pages = result.deploymentEnvironments.pages;
  await capture('deployments', 'pages', () => deploymentRecord(pages, null, context));
  let linkedPublication;
  if (result.deployments.pages) {
    await capture('runs', 'pages', async () => {
      linkedPublication = await verifyPagesDeployment(result.deployments.pages, { production: productionSha, development: developmentSha }, context);
      return { environment: linkedPublication.environment, runId: linkedPublication.run.id, jobId: linkedPublication.run.pagesJob.id };
    });
  }
  for (const [name, check] of runChecks) {
    await capture('runs', name, () => linkedPublication?.environment === name ? linkedPublication.run : check());
  }
  if (result.runs.production) {
    try { result.deploymentEnvironments.productionWorker = productionWorkerDeploymentEnvironment(result.runs.production); }
    catch (error) {
      const failure = { kind: error.kind || 'PROVENANCE_ERROR', message: error.message, details: error.details || null };
      (result.failures ||= []).push({ collection: 'deployments', name: 'productionWorker', ...failure });
      context.failures.push({ collection: 'deployments', name: 'productionWorker', ...failure });
    }
  }
  const deploymentChecks = [
    ['productionWorker', () => {
      if (!result.deploymentEnvironments.productionWorker) {
        throw new AuditError('PUBLICATION_WORKFLOW_UNSUPPORTED', 'production Worker deployment environment is unavailable');
      }
      return deploymentRecord(result.deploymentEnvironments.productionWorker, productionSha, context);
    }],
    ['developmentWorker', () => deploymentRecord(result.deploymentEnvironments.developmentWorker, developmentSha, context)],
  ];
  for (const [name, check] of deploymentChecks) await capture('deployments', name, check);
  if (result.deployments.developmentWorker && result.runs.development) {
    try { ensureRunWindow(result.deployments.developmentWorker, result.runs.development); }
    catch (error) {
      const failure = { kind: error.kind || 'DEPLOYMENT_RUN_MISMATCH', message: error.message, details: error.details || null };
      (result.failures ||= []).push(failure); context.failures.push(failure);
    }
  }
  if (result.deployments.productionWorker && result.runs.production) {
    try { ensureRunWindow(result.deployments.productionWorker, result.runs.production); }
    catch (error) {
      const failure = { kind: error.kind || 'DEPLOYMENT_RUN_MISMATCH', message: error.message, details: error.details || null };
      (result.failures ||= []).push(failure); context.failures.push(failure);
    }
  }
  if (!result.failures?.length) result.outcome = 'SUCCESS';
  return result;
}

async function verifyEndHeads(result, context) {
  try {
    result.branchHeads.atEnd = await branchHeads(context);
    for (const branch of ['main', 'develop', 'pages-verified']) {
      if (result.branchHeads.atStart?.[branch] && result.branchHeads.atStart[branch] !== result.branchHeads.atEnd[branch]) {
        throw new AuditError('REMOTE_REF_CHANGED', `${branch} changed while the live audit was running`, { before: result.branchHeads.atStart[branch], after: result.branchHeads.atEnd[branch] });
      }
    }
  } catch (error) {
    const failure = { kind: error.kind || 'BRANCH_HEADS_UNAVAILABLE', message: error.message, details: error.details || null };
    (result.failures ||= []).push(failure);
    context.failures.push(failure);
    result.outcome = 'FAIL';
  }
}

export async function productionWorkerVersion({ accountId, token, deploymentId, versionId, fetchImpl = globalThis.fetch }) {
  if (!/^[a-f0-9]{32}$/i.test(accountId || '') || !token) {
    throw new AuditError('CLOUDFLARE_AUTH_MISSING', 'Cloudflare audit credentials are unavailable');
  }
  let response;
  try {
    response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/heibon-mahjong-online/deployments`, {
      method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new AuditError('CLOUDFLARE_CONNECTION_FAILED', 'Cloudflare deployment request failed');
  }
  if (response.status !== 200) {
    throw new AuditError('CLOUDFLARE_HTTP_ERROR', `Cloudflare deployment request returned HTTP ${response.status}`);
  }
  const payload = await response.json().catch(() => null);
  const deployments = Array.isArray(payload?.result) ? payload.result : payload?.result?.deployments;
  const deployment = deployments?.[0];
  if (payload?.success !== true || !Array.isArray(deployments) || !deployment) {
    throw new AuditError('CLOUDFLARE_INVALID_RESULT', 'Cloudflare did not return a current deployment');
  }
  const versions = deployment.versions;
  if (deployment.id !== deploymentId || !Array.isArray(versions) || versions.length !== 1 ||
      versions[0]?.version_id !== versionId || versions[0]?.percentage !== 100) {
    throw new AuditError('CLOUDFLARE_DEPLOYMENT_CHANGED', 'Production Worker deployment, version or traffic does not match the recorded baseline');
  }
  return { deploymentId, versionId, percentage: 100 };
}

export async function runAudit({
  snapshotRoot, snapshotSha, repository, token, ref = 'refs/heads/develop', auditSha,
  runId = 'local', runAttempt = 1, now = () => new Date(),
  fetchImpl = globalThis.fetch, apiBase = API_BASE, timeoutMs = 20000,
  reservationSha, workerBaseline,
}) {
  const report = {
    schemaVersion: 1, outcome: 'FAIL', startedAt: now().toISOString(),
    audit: { ref, sha: auditSha || null, runId, runAttempt, snapshotSha: snapshotSha || null, ...(reservationSha ? { reservationSha } : {}) },
    targets: {}, provenance: { outcome: 'NOT_CHECKED' }, requests: [], failures: [],
  };
  if (ref !== 'refs/heads/develop') {
    report.failures.push({ kind: 'WRONG_BRANCH', message: 'Phase 6-A audit must be dispatched from develop' });
    report.finishedAt = now().toISOString();
    return report;
  }
  if (reservationSha && (!SHA_RE.test(reservationSha) || reservationSha === snapshotSha)) {
    report.failures.push({ kind: 'RESERVATION_REF_INVALID', message: 'Recovery audit needs the reservation head and a separate snapshot SHA' });
    report.finishedAt = now().toISOString();
    return report;
  }
  let snapshot;
  try { snapshot = readSnapshot(snapshotRoot, snapshotSha); }
  catch (error) {
    report.failures.push({ kind: error.kind || 'SNAPSHOT_INVALID', message: error.message, details: error.details || null });
    report.snapshot = { outcome: 'FAIL', sha: snapshotSha || null };
    report.finishedAt = now().toISOString();
    return report;
  }
  report.snapshot = {
    outcome: 'SUCCESS', sha: snapshot.snapshotSha, pending: snapshot.state.pending,
    production: { sourceSha: snapshot.records.production.release.sha, digest: snapshot.records.production.release.digest, snapshotDigest: snapshot.records.production.record.snapshotDigest, fileCount: Object.keys(snapshot.records.production.release.files).length },
    development: { sourceSha: snapshot.records.development.release.sha, digest: snapshot.records.development.release.digest, snapshotDigest: snapshot.records.development.record.snapshotDigest, fileCount: Object.keys(snapshot.records.development.release.files).length },
  };

  const context = { fetchImpl, apiBase, repository, token, timeoutMs, report, failures: report.failures, runId, runAttempt, now, auditSha, reservationSha };
  try {
    if (!repository || !/^[^/]+\/[^/]+$/.test(repository) || !token) throw new AuditError('GITHUB_API_AUTH_MISSING', 'read-only GitHub API credentials are unavailable');
    report.provenance = await verifyProvenance(snapshot, context);
  } catch (error) {
    report.provenance = { outcome: 'FAIL', failure: { kind: error.kind || 'PROVENANCE_ERROR', message: error.message } };
    report.failures.push({ kind: report.provenance.failure.kind, message: report.provenance.failure.message });
  }

  async function verifyWorker(phase) {
    try {
      report.productionWorker[phase] = await productionWorkerVersion({ ...workerBaseline, fetchImpl });
    } catch (error) {
      report.failures.push({ kind: error.kind || 'CLOUDFLARE_AUDIT_FAILED', message: error.message, phase });
    }
  }
  if (reservationSha) {
    report.productionWorker = {};
    await verifyWorker('before');
  }
  for (const environment of ['production', 'development']) {
    try {
      report.targets[environment] = await verifyEnvironment(environment, snapshot, context);
      if (report.targets[environment].outcome !== 'SUCCESS') {
        report.failures.push({ environment, kind: 'LIVE_AUDIT_FAILED', message: `${environment} live Pages audit did not satisfy all checks` });
      }
    } catch (error) {
      report.targets[environment] = { environment, baseUrl: TARGETS[environment].baseUrl, outcome: 'FAIL', failure: { kind: error.kind || 'LIVE_AUDIT_FAILED', message: error.message, details: error.details || null }, fileCount: 0, hashMatches: 0, hashMismatches: 0, files: [] };
      report.failures.push({ environment, kind: error.kind || 'LIVE_AUDIT_FAILED', message: error.message, details: error.details || null });
    }
  }
  if (reservationSha) await verifyWorker('after');
  if (report.provenance.branchHeads) await verifyEndHeads(report.provenance, context);
  if (report.failures.length === 0 && report.provenance.outcome === 'SUCCESS' && report.targets.production?.outcome === 'SUCCESS' && report.targets.development?.outcome === 'SUCCESS') {
    report.outcome = 'SUCCESS';
  }
  report.finishedAt = now().toISOString();
  return report;
}

export function renderSummary(report) {
  const lines = [
    '# Issue #47 Phase 6-A public Pages audit', '',
    `- Outcome: **${report.outcome}**`,
    `- Audit ref/SHA: ${report.audit?.ref || 'unknown'} / ${report.audit?.sha || 'unknown'}`,
    `- Audited snapshot SHA: ${report.snapshot?.sha || 'unavailable'}`,
    `- Audited snapshot pending: ${report.snapshot?.pending === null ? 'null' : 'unavailable'}`,
    `- Provenance: ${report.provenance?.outcome || 'not checked'}`,
  ];
  if (report.audit?.reservationSha) {
    lines.push(`- Current pages-verified reservation SHA: ${report.audit.reservationSha}`);
    for (const [phase, worker] of Object.entries(report.productionWorker || {})) {
      lines.push(`- Cloudflare production Worker ${phase}: deployment ${worker.deploymentId}, version ${worker.versionId} (${worker.percentage}%)`);
    }
  }
  for (const env of ['production', 'development']) {
    const result = report.targets?.[env];
    if (!result) { lines.push(`- ${env}: not checked`); continue; }
    lines.push(`- ${env}: ${result.outcome}; URL ${result.baseUrl}; source ${result.sourceSha || 'unknown'}; payload hashes ${result.hashMatches || 0}/${result.fileCount || 0}; metadata hashes ${result.metadataMatches || 0}; mismatches ${result.hashMismatches || 0} payload / ${result.metadataMismatches || 0} metadata`);
    for (const file of result.files || []) lines.push(`  - ${file.outcome}: ${file.path} (HTTP ${file.status ?? 'not fetched'}; expected ${file.expectedSha256}; live ${file.liveSha256 || 'unavailable'})`);
  }
  const pagesRun = report.provenance?.runs?.pages;
  if (pagesRun) lines.push(`- Shared Pages publication: ${pagesRun.environment}, run ${pagesRun.runId}, job ${pagesRun.jobId}`);
  if (report.provenance?.runs) {
    for (const key of ['production', 'development']) {
      const run = report.provenance.runs[key];
      if (run) lines.push(`- ${key} publication run: ${run.url} (${run.id}, ${run.sha}, attempt ${run.attempt})`);
    }
  }
  if (report.provenance?.branchHeads?.atStart) {
    const heads = report.provenance.branchHeads;
    lines.push(`- Remote heads at audit: main ${heads.atStart.main}; develop ${heads.atStart.develop}; pages-verified ${heads.atStart['pages-verified']}`);
    lines.push(`- Remote refs stable through audit: ${heads.atEnd ? ['main', 'develop', 'pages-verified'].every(branch => heads.atStart[branch] === heads.atEnd[branch]) : 'unconfirmed'}`);
  }
  if (report.provenance?.deployments) {
    for (const [key, deployment] of Object.entries(report.provenance.deployments)) lines.push(`- ${key} deployment: ${deployment.id} (${deployment.sha}, ${deployment.status})`);
  }
  if (report.provenance?.deploymentEnvironments) {
    const environments = report.provenance.deploymentEnvironments;
    lines.push(`- Deployment environment lookups: productionWorker ${environments.productionWorker || 'unresolved'}; developmentWorker ${environments.developmentWorker}; pages ${environments.pages}`);
  }
  if (report.failures?.length) {
    lines.push('', '## Failures');
    for (const failure of report.failures) lines.push(`- ${failure.environment || failure.phase ? `${failure.environment || failure.phase}: ` : ''}${failure.kind}: ${failure.message}`);
  }
  lines.push('', 'Cache handling: unique query per run plus no-store/no-cache request headers; response Age/cache headers are recorded. Redirects are not followed.');
  return `${lines.join('\n')}\n`;
}

async function cli() {
  const reportPath = process.env.AUDIT_REPORT_PATH || 'artifacts/phase6a-live-audit.json';
  const report = await runAudit({
    snapshotRoot: process.env.SNAPSHOT_ROOT || 'pages-verified',
    snapshotSha: process.env.SNAPSHOT_SHA,
    reservationSha: process.env.AUDIT_RESERVATION_SHA || undefined,
    workerBaseline: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN,
      deploymentId: process.env.WORKER_BASELINE_DEPLOYMENT, versionId: process.env.WORKER_BASELINE_VERSION,
    },
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
    ref: process.env.GITHUB_REF,
    auditSha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  const summary = renderSummary(report);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
  if (report.outcome !== 'SUCCESS') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  cli().catch(error => {
    const reportPath = process.env.AUDIT_REPORT_PATH || 'artifacts/phase6a-live-audit.json';
    const report = { schemaVersion: 1, outcome: 'FAIL', failures: [{ kind: error.kind || 'AUDIT_FATAL', message: error.message }] };
    try { mkdirSync(path.dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`); } catch { /* the workflow upload step still runs */ }
    console.error(`${error.kind || 'AUDIT_FATAL'}: ${error.message}`);
    process.exitCode = 1;
  });
}
