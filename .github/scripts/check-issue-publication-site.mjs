import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inventory } from '../../scripts/environments/artifacts.mjs';
import { sha256, TARGETS } from '../../scripts/environments/pages-live-audit.mjs';

const [mode, store] = process.argv.slice(2);
if (mode === 'worker' && store) {
  const state = JSON.parse(readFileSync(`${store}/state.json`, 'utf8'));
  const expectedSha = state.current?.production?.sha;
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
  const base = `repos/${process.env.GITHUB_REPOSITORY}/deployments`;
  const [deployment] = api(`${base}?environment=worker-production&per_page=1`);
  if (!deployment || !Number.isSafeInteger(deployment.id) ||
      !/^[a-f0-9]{40}$/.test(expectedSha || '') || deployment.sha !== expectedSha) throw new Error('Production Worker deployment missing');
  const [status] = api(`${base}/${deployment.id}/statuses?per_page=1`);
  if (status?.state !== 'success' || !Number.isSafeInteger(status.id)) throw new Error('Production Worker deployment not successful');
  console.log(`${deployment.id}:${status.id}:${deployment.sha}`);
} else if (mode === 'bytes' && store) {
  for (const [name, expected] of Object.entries(inventory(`${store}/site`))) {
    const relative = name.split('/').map(encodeURIComponent).join('/');
    const url = new URL(relative, TARGETS.production.baseUrl);
    url.searchParams.set('audit', process.env.GITHUB_RUN_ID + '-' + process.env.GITHUB_RUN_ATTEMPT + '-' + Date.now());
    const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (response.status !== 200 || sha256(Buffer.from(await response.arrayBuffer())) !== expected) {
      throw new Error(`Unexpected public Pages bytes: ${name}`);
    }
  }
} else throw new Error('Unknown publication verification mode');
