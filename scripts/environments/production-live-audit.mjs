import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = process.env.GITHUB_REPOSITORY;
const ghToken = process.env.GH_TOKEN;
const cfToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const pagesUrl = 'https://ak-sekine.github.io/heibon-mahjong/';
const workerUrl = 'https://heibon-mahjong-online.ak-sekine.workers.dev';
const approvedOrigin = 'https://ak-sekine.github.io';
const api = 'https://api.github.com';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'issue47-live-'));
const report = { outcome: 'FAIL', pagesUrl, workerUrl, approvedOrigin, files: [] };
const liveBytesByPath = new Map();

function fail(kind, label, detail = '') {
  throw new Error(`${kind}: ${label}${detail ? ` (${detail})` : ''}`);
}

async function get(url, label, headers = {}, apiKind = 'HTTP_ERROR') {
  let response;
  try {
    response = await fetch(url, { headers, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(30000) });
  } catch (error) {
    const code = error?.cause?.code || error?.name || 'network failure';
    fail('CONNECTION_ERROR', label, code);
  }
  if (!response.ok) {
    const kind = (response.status === 401 || response.status === 403) && apiKind === 'AUTH_ERROR' ? 'AUTHENTICATION_ERROR' : apiKind;
    fail(kind, label, `HTTP ${response.status}`);
  }
  return response;
}

function ghHeaders() {
  return { accept: 'application/vnd.github+json', authorization: `Bearer ${ghToken}`, 'x-github-api-version': '2022-11-28' };
}

async function ghJson(url, label) {
  const response = await get(url, label, ghHeaders(), 'AUTH_ERROR');
  try { return await response.json(); } catch { fail('DATA_ERROR', label, 'invalid JSON'); }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function walk(root, dir = '') {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(dir, entry.name);
    const abs = path.join(root, rel);
    if (entry.isSymbolicLink()) fail('DATA_ERROR', 'Pages artifact', `symbolic link ${rel}`);
    return entry.isDirectory() ? walk(root, rel) : [rel];
  }).sort();
}

async function latestSuccessfulDeployment(environment) {
  const base = `${api}/repos/${repo}`;
  const deployments = await ghJson(`${base}/deployments?environment=${encodeURIComponent(environment)}&per_page=100`, `${environment} deployment history`);
  if (!Array.isArray(deployments)) fail('DATA_ERROR', `${environment} deployment history`, 'invalid response');
  for (const item of deployments) {
    if (!Number.isInteger(item?.id) || !/^[0-9a-f]{40}$/i.test(item.sha || '')) continue;
    const statuses = await ghJson(`${base}/deployments/${item.id}/statuses?per_page=1`, `${environment} deployment ${item.id} status`);
    if (Array.isArray(statuses) && statuses[0]?.state === 'success') {
      return { id: item.id, sha: item.sha.toLowerCase(), createdAt: item.created_at };
    }
  }
  fail('DATA_ERROR', `${environment} deployment history`, 'no successful deployment');
}

async function getPagesArtifact(pagesSha) {
  const base = `${api}/repos/${repo}`;
  const runList = await ghJson(`${base}/actions/runs?branch=main&head_sha=${pagesSha}&status=success&per_page=100`, 'GitHub Actions run history');
  const runs = (runList.workflow_runs || []).filter((run) => run.head_sha === pagesSha && run.conclusion === 'success' && /deploy\.yml$/.test(run.path || ''));
  for (const run of runs) {
    const jobs = await ghJson(`${base}/actions/runs/${run.id}/jobs?per_page=100`, `Pages source run ${run.id} jobs`);
    const pageJob = (jobs.jobs || []).find((job) => job.name === 'pages-deploy' && job.conclusion === 'success');
    if (!pageJob) continue;
    const artifacts = await ghJson(`${base}/actions/runs/${run.id}/artifacts?per_page=100`, `Pages source run ${run.id} artifacts`);
    const artifact = (artifacts.artifacts || []).find((item) => item.name === 'github-pages' && !item.expired);
    if (!artifact) {
      const sourceInfo = await getPublicBuildInfo(pagesSha);
      const sourceDir = path.join(tmp, 'source');
      try {
        execFileSync('git', ['fetch', '--depth=1', 'origin', pagesSha], { stdio: 'pipe' });
        execFileSync('git', ['worktree', 'add', '--detach', sourceDir, pagesSha], { stdio: 'pipe' });
        const configPath = path.join(sourceDir, 'vite.config.ts');
        const config = readFileSync(configPath, 'utf8');
        const original = 'const buildTimeUtc = new Date().toISOString();';
        if (!config.includes(original)) fail('DATA_ERROR', 'Pages source build', 'build timestamp expression changed');
        writeFileSync(configPath, config.replace(original, 'const buildTimeUtc = new Date(process.env.REPRODUCED_BUILD_TIME).toISOString();'));
        const buildEnv = { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true' };
        execFileSync('npm', ['ci'], { cwd: sourceDir, env: buildEnv, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
        execFileSync('npm', ['run', 'build'], {
          cwd: sourceDir,
          env: { ...buildEnv, REPRODUCED_BUILD_TIME: sourceInfo.buildTimeUtc, VITE_ONLINE_API_URL: workerUrl },
          stdio: 'pipe',
          maxBuffer: 16 * 1024 * 1024,
        });
      } catch (error) {
        if (error?.message?.startsWith('DATA_ERROR:')) throw error;
        fail('REPRODUCTION_ERROR', 'Pages source build', error?.status ? `command exit ${error.status}` : 'build could not be reproduced');
      }
      report.pagesArtifactKind = 'reproducible-build';
      report.pagesBuildInfo = sourceInfo;
      return { runId: run.id, artifactId: null, root: path.join(sourceDir, 'dist') };
    }
    const response = await get(artifact.archive_download_url, `Pages artifact ${artifact.id}`, ghHeaders(), 'AUTH_ERROR');
    const zip = Buffer.from(await response.arrayBuffer());
    const zipPath = path.join(tmp, 'github-pages.zip');
    const tarPath = path.join(tmp, 'artifact.tar');
    const distPath = path.join(tmp, 'dist');
    writeFileSync(zipPath, zip);
    try {
      writeFileSync(tarPath, execFileSync('unzip', ['-p', zipPath, 'artifact.tar'], { maxBuffer: 256 * 1024 * 1024 }));
      execFileSync('mkdir', ['-p', distPath]);
      execFileSync('tar', ['-xf', tarPath, '-C', distPath]);
    } catch {
      fail('DATA_ERROR', `Pages artifact ${artifact.id}`, 'unable to extract github-pages artifact.tar');
    }
    let root = distPath;
    const locateIndex = (folder) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (entry.isFile() && entry.name === 'index.html') return folder;
        if (entry.isDirectory()) {
          const found = locateIndex(path.join(folder, entry.name));
          if (found) return found;
        }
      }
      return null;
    };
    const foundRoot = locateIndex(distPath);
    if (!foundRoot) fail('DATA_ERROR', `Pages artifact ${artifact.id}`, 'index.html missing');
    root = foundRoot;
    report.pagesArtifactKind = 'github-pages';
    return { runId: run.id, artifactId: artifact.id, root };
  }
  fail('DATA_ERROR', 'Pages source artifact', `no retained successful artifact for SHA ${pagesSha}`);
}

async function getPublicBuildInfo(expectedSha) {
  const htmlResponse = await get(pagesUrl, 'GitHub Pages index.html');
  const htmlBytes = Buffer.from(await htmlResponse.arrayBuffer());
  const html = htmlBytes.toString('utf8');
  liveBytesByPath.set('index.html', htmlBytes);
  const scriptRef = [...html.matchAll(/(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)]
    .map((match) => match[1])
    .find((value) => value.includes('/assets/'));
  if (!scriptRef) fail('DATA_ERROR', 'GitHub Pages index.html', 'bundled JavaScript reference missing');
  const scriptUrl = new URL(scriptRef, pagesUrl);
  const scriptPath = scriptUrl.pathname.replace(/^\/heibon-mahjong\//, '');
  const scriptResponse = await get(scriptUrl.href, `GitHub Pages ${scriptPath}`);
  const scriptBytes = Buffer.from(await scriptResponse.arrayBuffer());
  liveBytesByPath.set(scriptPath, scriptBytes);
  const bundle = scriptBytes.toString('utf8');
  const sha = bundle.match(/["']?gitSha["']?\s*:\s*["']([0-9a-f]{40})["']/i)?.[1]?.toLowerCase();
  const buildTimeUtc = bundle.match(/["']?buildTimeUtc["']?\s*:\s*["']([^"']+)["']/)?.[1];
  if (sha !== expectedSha.toLowerCase() || !buildTimeUtc || !Number.isFinite(Date.parse(buildTimeUtc))) {
    fail('LIVE_CHECK_FAILED', 'deployed Pages build metadata', `git SHA match=${sha === expectedSha.toLowerCase()} build timestamp=${Boolean(buildTimeUtc)}`);
  }
  return { sha, buildTimeUtc, scriptPath };
}

async function main() {
  if (!repo || !ghToken || !cfToken || !/^[0-9a-f]{32}$/i.test(accountId || '')) {
    fail('AUTHENTICATION_ERROR', 'workflow credentials', 'required credential or account ID unavailable');
  }

  const [mainCommit, pagesDeployment, workerRecord] = await Promise.all([
    ghJson(`${api}/repos/${repo}/commits/main`, 'current main SHA'),
    latestSuccessfulDeployment('heibon-production-pages'),
    latestSuccessfulDeployment('heibon-production-worker'),
  ]);
  report.mainHeadSha = mainCommit.sha;
  report.pagesDeployment = pagesDeployment;
  report.workerGitHubDeployment = workerRecord;
  report.pagesDeploymentMatchesWorkerRecord = pagesDeployment.sha === workerRecord.sha;

  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/heibon-mahjong-online/deployments`;
  try {
    const cfResponse = await get(cfUrl, 'Cloudflare Worker deployment list', { authorization: `Bearer ${cfToken}`, accept: 'application/json' }, 'AUTH_ERROR');
    let cfJson;
    try { cfJson = await cfResponse.json(); } catch { fail('DATA_ERROR', 'Cloudflare Worker deployment list', 'invalid JSON'); }
    if (cfJson.success !== true) {
      const errors = Array.isArray(cfJson.errors) ? cfJson.errors : [];
      const codes = errors.map((entry) => entry?.code).filter(Number.isInteger);
      const kind = codes.includes(10000) ? 'AUTHENTICATION_ERROR' : 'API_ERROR';
      fail(kind, 'Cloudflare Worker deployment list', `success=${String(cfJson.success)} error_codes=${codes.join(',') || 'none'}`);
    }
    if (!Array.isArray(cfJson.result) || !cfJson.result.length) {
      fail('DATA_ERROR', 'Cloudflare Worker deployment list', `success=true result_type=${Array.isArray(cfJson.result) ? 'empty array' : typeof cfJson.result}`);
    }
    const cfDeployment = cfJson.result[0];
    const versionIds = (cfDeployment.versions || []).map((version) => version.version_id).filter(Boolean);
    if (!cfDeployment.id || !versionIds.length) fail('DATA_ERROR', 'Cloudflare Worker deployment list', 'deployment or version ID missing');
    report.cloudflareWorkerDeployment = { id: cfDeployment.id, createdOn: cfDeployment.created_on, versionIds };
  } catch (error) {
    report.cloudflareError = error.message;
  }

  const healthResponse = await get(`${workerUrl}/health`, 'production Worker /health', { Origin: approvedOrigin }, 'HTTP_ERROR');
  const healthText = await healthResponse.text();
  let health;
  try { health = JSON.parse(healthText); } catch { fail('DATA_ERROR', 'production Worker /health', 'invalid JSON'); }
  if (healthResponse.status !== 200 || health?.ok !== true || health?.service !== 'heibon-mahjong-online') {
    fail('LIVE_CHECK_FAILED', 'production Worker /health', `unexpected response ${healthResponse.status}`);
  }
  if (healthResponse.headers.get('access-control-allow-origin') !== approvedOrigin) {
    fail('LIVE_CHECK_FAILED', 'production Worker CORS', 'approved Origin was not echoed');
  }
  report.workerHealth = { status: healthResponse.status, body: health, allowOrigin: approvedOrigin };

  const artifact = await getPagesArtifact(pagesDeployment.sha);
  report.pagesSourceRunId = artifact.runId;
  report.pagesArtifactId = artifact.artifactId;
  const relativeFiles = walk(artifact.root);
  for (const required of ['index.html', 'manifest.webmanifest', 'sw.js']) {
    if (!relativeFiles.includes(required)) fail('DATA_ERROR', 'Pages artifact', `${required} missing`);
  }
  const expectedFiles = new Map(relativeFiles.map((rel) => [rel, readFileSync(path.join(artifact.root, rel))]));
  const html = expectedFiles.get('index.html').toString('utf8');
  const manifest = JSON.parse(expectedFiles.get('manifest.webmanifest').toString('utf8'));
  if (manifest.id !== '/heibon-mahjong/' || manifest.start_url !== '/heibon-mahjong/' || manifest.scope !== '/heibon-mahjong/') {
    fail('LIVE_CHECK_FAILED', 'production manifest', 'production id/start_url/scope changed');
  }
  const sw = expectedFiles.get('sw.js').toString('utf8');
  const precacheMatch = sw.match(/const PRECACHE = (\[[\s\S]*?\]);/);
  if (!precacheMatch) fail('DATA_ERROR', 'production Service Worker', 'precache list missing');
  const precache = JSON.parse(precacheMatch[1]);
  const requestedRefs = new Set(['manifest.webmanifest', 'sw.js']);
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (/^(?:https?:|data:|#|javascript:)/i.test(raw)) continue;
    requestedRefs.add(new URL(raw, pagesUrl).pathname.replace(/^\/heibon-mahjong\//, ''));
  }
  for (const raw of manifest.icons?.map((icon) => icon.src) || []) requestedRefs.add(new URL(raw, pagesUrl).pathname.replace(/^\/heibon-mahjong\//, ''));
  for (const raw of precache) {
    if (typeof raw !== 'string' || !raw.startsWith('/heibon-mahjong/')) fail('DATA_ERROR', 'production Service Worker', 'precache URL escaped production scope');
    requestedRefs.add(raw.slice('/heibon-mahjong/'.length));
  }
  for (const rel of requestedRefs) {
    if (rel && !expectedFiles.has(rel)) fail('DATA_ERROR', 'Pages artifact references', `missing ${rel}`);
  }

  for (const rel of relativeFiles) {
    const bytes = expectedFiles.get(rel);
    const url = new URL(rel.split('/').map(encodeURIComponent).join('/'), pagesUrl).href;
    let response = null;
    let liveBytes = liveBytesByPath.get(rel);
    if (!liveBytes) {
      response = await get(url, `GitHub Pages ${rel}`);
      liveBytes = Buffer.from(await response.arrayBuffer());
    }
    const expectedHash = sha256(bytes);
    const liveHash = sha256(liveBytes);
    const matches = expectedHash === liveHash;
    report.files.push({ path: rel, status: response?.status ?? 200, artifactSha256: expectedHash, liveSha256: liveHash, matches });
    if (!matches) fail('LIVE_CHECK_FAILED', `GitHub Pages ${rel}`, `SHA-256 mismatch expected=${expectedHash} live=${liveHash}`);
  }
  report.fileCount = report.files.length;
  report.pagesArtifactSha256 = sha256(Buffer.concat([...expectedFiles.entries()].flatMap(([name, bytes]) => [Buffer.from(name), bytes])));
  if (!report.pagesDeploymentMatchesWorkerRecord) {
    fail('LIVE_CHECK_FAILED', 'Pages/Worker deployment SHA alignment', `Pages=${pagesDeployment.sha} Worker=${workerRecord.sha}`);
  }
  if (report.cloudflareError) fail('CLOUDFLARE_READ_FAILED', report.cloudflareError);
  report.outcome = 'SUCCESS';
}

try {
  await main();
} catch (error) {
  report.failure = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  const lines = [
    '# Issue #47 production live audit',
    '',
    `- Outcome: **${report.outcome}**`,
    `- Main HEAD SHA: ${report.mainHeadSha || 'unavailable'}`,
    `- GitHub Pages deployment: ${report.pagesDeployment ? `${report.pagesDeployment.id} / ${report.pagesDeployment.sha}` : 'unavailable'}`,
    `- GitHub Worker deployment record: ${report.workerGitHubDeployment ? `${report.workerGitHubDeployment.id} / ${report.workerGitHubDeployment.sha}` : 'unavailable'}`,
    `- Pages/Worker recorded SHA match: ${report.pagesDeploymentMatchesWorkerRecord ?? 'unavailable'}`,
    `- Cloudflare Worker deployment: ${report.cloudflareWorkerDeployment ? report.cloudflareWorkerDeployment.id : 'unavailable'}`,
    `- Cloudflare version IDs: ${report.cloudflareWorkerDeployment?.versionIds?.join(', ') || 'unavailable'}`,
    `- Worker health: ${report.workerHealth ? `HTTP ${report.workerHealth.status}; ${JSON.stringify(report.workerHealth.body)}; allow-origin=${report.workerHealth.allowOrigin}` : 'unavailable'}`,
    `- Pages artifact: run ${report.pagesSourceRunId || 'unavailable'}, artifact ${report.pagesArtifactId || 'unavailable'}`,
    `- Pages comparison source: ${report.pagesArtifactKind || 'unavailable'}${report.pagesBuildInfo ? ` (${report.pagesBuildInfo.sha}, build ${report.pagesBuildInfo.buildTimeUtc})` : ''}`,
    `- Static files compared: ${report.fileCount ?? report.files.length}`,
    '',
  ];
  for (const file of report.files) lines.push(`- ${file.matches ? 'MATCH' : 'MISMATCH'} ${file.path}: ${file.liveSha256} (artifact ${file.artifactSha256})`);
  if (report.failure) lines.push('', `Failure classification: ${report.failure}`);
  if (report.cloudflareError && !report.failure) lines.push('', `Cloudflare API classification: ${report.cloudflareError}`);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  rmSync(tmp, { recursive: true, force: true });
}
