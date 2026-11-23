import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory } from '../../scripts/environments/artifacts.mjs';
import { sha256, TARGETS } from '../../scripts/environments/pages-live-audit.mjs';

export function readApi(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
}

export function checkDeployment(environment, expectedSha, api = readApi, runId, repository = process.env.GITHUB_REPOSITORY) {
  const base = `repos/${repository}/deployments`;
  const [deployment] = api(`${base}?environment=${environment}&per_page=1`);
  if (!deployment || !Number.isSafeInteger(deployment.id) ||
      !/^[a-f0-9]{40}$/.test(expectedSha || '') || deployment.sha !== expectedSha) {
    throw new Error(`Expected deployment missing: ${environment}`);
  }
  const [status] = api(`${base}/${deployment.id}/statuses?per_page=1`);
  if (status?.state !== 'success' || !Number.isSafeInteger(status.id)) {
    throw new Error(`Deployment not successful: ${environment}`);
  }
  if (runId !== undefined) {
    const link = `https://github.com/${repository}/actions/runs/${runId}/job/`;
    if (!/^[1-9][0-9]*$/.test(runId) || !status.log_url?.startsWith(link) ||
        !/^[1-9][0-9]*$/.test(status.log_url.slice(link.length))) {
      throw new Error(`Deployment belongs to another run: ${environment}`);
    }
  }
  return `${deployment.id}:${status.id}:${deployment.sha}`;
}

export async function checkPublicBytes(store, get = fetch) {
  for (const [name, expected] of Object.entries(inventory(`${store}/site`))) {
    const relative = name.split('/').map(encodeURIComponent).join('/');
    const url = new URL(relative, TARGETS.production.baseUrl);
    url.searchParams.set('audit', process.env.GITHUB_RUN_ID + '-' + process.env.GITHUB_RUN_ATTEMPT + '-' + Date.now());
    const response = await get(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (response.status !== 200 || sha256(Buffer.from(await response.arrayBuffer())) !== expected) {
      throw new Error(`Unexpected public Pages bytes: ${name}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [mode, store] = process.argv.slice(2);
  if (mode === 'worker' && store) {
    const state = JSON.parse(readFileSync(`${store}/state.json`, 'utf8'));
    console.log(checkDeployment('worker-production', state.current?.production?.sha));
  } else if (mode === 'bytes' && store) await checkPublicBytes(store);
  else throw new Error('Unknown publication verification mode');
}
