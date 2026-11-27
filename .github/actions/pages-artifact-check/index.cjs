const { DefaultArtifactClient } = require('@actions/artifact');
const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const source = path.join(process.env.GITHUB_WORKSPACE, 'source');
  const { waitForPagesArtifact, verifyArtifactZip } = await import(pathToFileURL(path.join(source, '.github/scripts/pages-artifact-check.mjs')));
  const id = Number(process.env.PAGES_ARTIFACT_ID);
  const name = 'github-pages';
  if (!Number.isSafeInteger(id) || id < 1 || !process.env.GH_TOKEN) throw new Error('Missing Pages artifact identity');
  const endpoint = `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/actions/artifacts/${id}`;
  const headers = { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' };
  const deadline = Date.now() + 60000;
  const metadata = async () => {
    let response;
    try { response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))) }); }
    catch { const error = new Error('Artifact metadata request failed'); error.retryable = true; throw error; }
    if (!response.ok) {
      const error = new Error(`Artifact metadata HTTP ${response.status}`);
      error.retryable = response.status === 404 || response.status === 429 || response.status >= 500;
      throw error;
    }
    const value = await response.json();
    if (value?.workflow_run?.id !== Number(process.env.GITHUB_RUN_ID) || value?.workflow_run?.head_sha !== process.env.GITHUB_SHA) throw new Error('Artifact run identity mismatch');
    return value;
  };
  let initial;
  while (!initial) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Artifact metadata lookup timeout');
    try { initial = await metadata(); }
    catch (error) {
      if (!error.retryable) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(2000, Math.max(0, deadline - Date.now()))));
    }
  }
  const client = new DefaultArtifactClient();
  await waitForPagesArtifact({ name, id, digest: initial.digest, metadata, list: async () => (await client.listArtifacts()).artifacts, timeoutMs: Math.max(1, deadline - Date.now()), intervalMs: 2000 });
  const response = await fetch(endpoint + '/zip', { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Artifact download HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 128 * 1024 * 1024) throw new Error('Artifact ZIP exceeds size limit');
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > 128 * 1024 * 1024) throw new Error('Artifact ZIP exceeds size limit');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, total);
  verifyArtifactZip(bytes, initial.digest);
  const archive = path.join(process.env.RUNNER_TEMP, 'checked-pages-upload.zip');
  writeFileSync(archive, bytes, { flag: 'wx' });
  execFileSync('python3', [path.join(source, '.github/scripts/check-pages-upload.py'), archive, path.join(process.env.GITHUB_WORKSPACE, 'store/site')], { stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`Verified Pages artifact ${id}: runtime lookup, metadata, ZIP and staged files.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
