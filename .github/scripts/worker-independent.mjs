import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { planPublication } from './publication-plan.mjs';
import { publicationIdentity } from './publication-reservation.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{40}$/;
const FIRST_PUBLICATION_ACCOUNT = 'abb9bbfd207cd6e56648a331d5638f6b';
const specs = {
  production: { name: 'heibon-mahjong-online', url: 'https://heibon-mahjong-online.ak-sekine.workers.dev', config: 'wrangler.jsonc' },
  development: { name: 'heibon-mahjong-online-dev', url: 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev', config: 'wrangler.development.jsonc' },
};

async function request(url, token, options = {}, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers }, signal: AbortSignal.timeout(20000) });
  } catch { throw new Error('Publication API request failed; state may be unknown'); }
  if (!response.ok) throw new Error(`Publication API returned HTTP ${response.status}; state may be unknown`);
  return response.json();
}

export function configuration(env) {
  const identity = publicationIdentity(env);
  if (env.GITHUB_REPOSITORY !== 'ak-sekine/heibon-mahjong' || identity.branch === 'develop' || !env.GH_TOKEN || !env.CLOUDFLARE_API_TOKEN || !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || '')) throw new Error('Invalid Worker publication configuration');
  if (identity.environment === 'development' && identity.attempt !== '1') throw new Error('Issue publication requires a new dispatch');
  if (identity.environment === 'production' && (env.GITHUB_WORKFLOW_REF !== `${env.GITHUB_REPOSITORY}/.github/workflows/environments.yml@refs/heads/main` || env.GITHUB_WORKFLOW_SHA !== identity.sha)) throw new Error('Wrong production workflow identity');
  const spec = specs[identity.environment];
  if (env.EXPECTED_WORKER_URL !== spec.url) throw new Error('Worker URL or environment mismatch');
  const firstPublication = env.WORKER_FIRST_PUBLICATION === 'true';
  if (firstPublication && (env.PUBLICATION_TARGET !== 'worker' || env.PUBLISH_REQUESTED !== 'true' || !UUID.test(env.EXPECTED_CURRENT_WORKER_VERSION || '') || env.CLOUDFLARE_ACCOUNT_ID.toLowerCase() !== FIRST_PUBLICATION_ACCOUNT)) throw new Error('Invalid first Worker publication request');
  if (!firstPublication && (env.WORKER_FIRST_PUBLICATION && env.WORKER_FIRST_PUBLICATION !== 'false' || env.EXPECTED_CURRENT_WORKER_VERSION)) throw new Error('Unexpected first Worker publication inputs');
  return { ...identity, ...spec, firstPublication, expectedCurrentVersion: firstPublication ? env.EXPECTED_CURRENT_WORKER_VERSION.toLowerCase() : '', repository: env.GITHUB_REPOSITORY, account: env.CLOUDFLARE_ACCOUNT_ID, githubToken: env.GH_TOKEN, cloudflareToken: env.CLOUDFLARE_API_TOKEN, ledgerEnvironment: `heibon-independent-worker-${identity.environment}` };
}

export function createApi(config, fetchImpl = fetch) {
  const github = (p, options = {}) => request(`https://api.github.com/repos/${config.repository}${p}`, config.githubToken, options, fetchImpl);
  return {
    list: () => github(`/deployments?environment=${encodeURIComponent(config.ledgerEnvironment)}&per_page=1`),
    statuses: id => github(`/deployments/${id}/statuses?per_page=1`),
    get: id => github(`/deployments/${id}`),
    ref: branch => github(`/git/ref/heads/${branch}`),
    compare: (base, head) => github(`/compare/${base}...${head}`),
    create: body => github('/deployments', { method: 'POST', body: JSON.stringify(body) }),
    status: (id, body) => github(`/deployments/${id}/statuses`, { method: 'POST', body: JSON.stringify(body) }),
    live: () => request(`https://api.cloudflare.com/client/v4/accounts/${config.account}/workers/scripts/${config.name}/deployments`, config.cloudflareToken, {}, fetchImpl),
  };
}

export function activeVersion(response) {
  const entries = response?.result?.deployments;
  const latest = Array.isArray(entries) && entries[0];
  const versions = latest?.versions;
  if (response?.success !== true || !Array.isArray(versions) || versions.length !== 1 || versions[0].percentage !== 100 || !UUID.test(versions[0].version_id || '')) throw new Error('Cannot establish the active Worker version');
  return versions[0].version_id.toLowerCase();
}

// Only the newest explicit record is admissible. A pending, missing, unverified,
// malformed, or externally changed deployment is never treated as an old success.
export async function inspectWorker(config, api) {
  const deployments = await api.list();
  if (!Array.isArray(deployments) || deployments.length !== 1) throw new Error('Worker baseline not initialized or history invalid');
  const d = deployments[0];
  if (!Number.isSafeInteger(d?.id) || d.environment !== config.ledgerEnvironment || !SHA.test(d.sha || '') || d.payload?.worker !== config.name || d.payload?.environment !== config.environment || !/^[1-9][0-9]*$/.test(d.payload?.runId || '') || !/^[1-9][0-9]*$/.test(d.payload?.attempt || '')) throw new Error('Worker baseline identity is invalid');
  const statuses = await api.statuses(d.id);
  const status = Array.isArray(statuses) && statuses[0];
  const match = /^verified:([a-f0-9-]{36})$/i.exec(status?.description || '');
  if (status?.state !== 'success' || !match || !UUID.test(match[1])) throw new Error('Latest Worker publication is unknown or online verification incomplete');
  const version = match[1].toLowerCase();
  if (activeVersion(await api.live()) !== version) throw new Error('Live Worker differs from recorded version');
  return { sha: d.sha, version, id: d.id };
}

async function inspectFirstWorker(config, api) {
  if (!config.firstPublication || !UUID.test(config.expectedCurrentVersion || '')) throw new Error('First Worker publication is not explicitly authorized');
  const records = await api.list();
  if (!Array.isArray(records) || records.length !== 0) throw new Error('First Worker publication requires no existing independent record');
  const version = activeVersion(await api.live());
  if (version !== config.expectedCurrentVersion) throw new Error('Current Worker version differs from the approved version');
  return version;
}

export async function publishWorker(config, api, deploy, git = execFileSync) {
  const baseline = config.firstPublication ? await inspectFirstWorker(config, api) : await inspectWorker(config, api);
  const plan = config.firstPublication ? { classification: 'unknown', workerPending: null } : planPublication({ environment: config.environment, candidate: config.sha, workerBase: baseline.sha, pagesBase: '', target: 'worker', git });
  if (plan.blocked) throw new Error(`Worker change comparison failed: ${plan.reason}`);
  if ((await api.ref(config.branch))?.object?.sha !== config.sha) throw new Error('Stale source SHA');
  if (config.environment === 'development') {
    const base = (await api.ref('main'))?.object?.sha;
    if (!SHA.test(base || '') || (await api.compare(base, config.sha))?.status !== 'ahead' || (await api.ref('main'))?.object?.sha !== base) throw new Error('Issue candidate must be based on current main');
  }
  if ((await api.ref(config.branch))?.object?.sha !== config.sha) throw new Error('Stale source SHA');
  if (config.firstPublication) {
    if (await inspectFirstWorker(config, api) !== baseline) throw new Error('Worker changed during first publication preflight');
  } else {
    const checked = await inspectWorker(config, api);
    if (checked.id !== baseline.id || checked.sha !== baseline.sha || checked.version !== baseline.version) throw new Error('Worker publication history changed during preflight');
  }
  const deployment = await api.create({ ref: config.sha, environment: config.ledgerEnvironment, auto_merge: false, required_contexts: [], transient_environment: false, production_environment: false, description: `Worker ${config.environment} publication`, payload: { worker: config.name, environment: config.environment, runId: config.runId, attempt: config.attempt } });
  if (!Number.isSafeInteger(deployment?.id) || deployment.sha !== config.sha || deployment.environment !== config.ledgerEnvironment || deployment.payload?.runId !== config.runId || deployment.payload?.attempt !== config.attempt) throw new Error('Worker start record not confirmed');
  const pending = await api.status(deployment.id, { state: 'pending', description: 'Worker deployment requested', auto_inactive: false });
  if (pending?.state !== 'pending') throw new Error('Worker start status not confirmed');
  const saved = await api.get(deployment.id);
  const latest = await api.list();
  const startStatuses = await api.statuses(deployment.id);
  if (saved?.sha !== config.sha || saved.environment !== config.ledgerEnvironment || saved.payload?.runId !== config.runId || saved.payload?.attempt !== config.attempt || latest?.[0]?.id !== deployment.id || startStatuses?.[0]?.state !== 'pending') throw new Error('Worker start record could not be reread');
  // Any exception from this point leaves the durable start as unresolved.
  const output = await deploy(config.config);
  if (typeof output !== 'string' || !output.includes(config.url)) throw new Error('Wrangler result did not confirm the Worker URL');
  const versions = [...output.matchAll(/Current Version ID:\s*([a-f0-9-]{36})/ig)];
  if (versions.length !== 1 || !UUID.test(versions[0][1])) throw new Error('Wrangler result did not confirm a unique Worker version');
  const version = versions[0][1].toLowerCase();
  if (activeVersion(await api.live()) !== version) throw new Error('Worker deployed version could not be confirmed');
  const result = await api.status(deployment.id, { state: 'success', description: `deployed:${version}`, auto_inactive: false });
  if (result?.state !== 'success' || result.description !== `deployed:${version}`) throw new Error('Worker success record not confirmed');
  return { id: deployment.id, version, url: config.url, classification: plan.classification, workerPending: plan.workerPending };
}

export async function confirmOnline(config, api, id, version) {
  if (!Number.isSafeInteger(id) || !UUID.test(version || '')) throw new Error('Invalid Worker verification identity');
  version = version.toLowerCase();
  const d = await api.get(id);
  const statuses = await api.statuses(id);
  const latest = await api.list();
  if (latest?.[0]?.id !== id) throw new Error('Worker publication history changed before online confirmation');
  if (d?.sha !== config.sha || d.environment !== config.ledgerEnvironment || d.payload?.worker !== config.name || d.payload?.environment !== config.environment || d.payload?.runId !== config.runId || d.payload?.attempt !== config.attempt || statuses?.[0]?.state !== 'success' || statuses[0].description !== `deployed:${version}`) throw new Error('Wrong Worker deployment for online confirmation');
  if (activeVersion(await api.live()) !== version) throw new Error('Worker changed before online confirmation');
  const recorded = await api.status(id, { state: 'success', description: `verified:${version}`, auto_inactive: false });
  if (recorded?.state !== 'success' || recorded.description !== `verified:${version}`) throw new Error('Online verification record not confirmed');
  const confirmed = await inspectWorker(config, api);
  if (confirmed.id !== id || confirmed.sha !== config.sha || confirmed.version !== version) throw new Error('Verified Worker baseline could not be confirmed');
}

export async function runIndependentWorker(env = process.env) {
  const config = configuration(env);
  const api = createApi(config);
  const result = await publishWorker(config, api, async wranglerConfig => {
    try { return execFileSync('npx', ['wrangler', 'deploy', '--config', wranglerConfig], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { throw new Error('Wrangler did not confirm success; Worker result is unknown'); }
  });
  appendFileSync(env.GITHUB_OUTPUT, `url=${result.url}\ndeployment=${result.id}\nversion=${result.version}\n`);
  appendFileSync(env.GITHUB_STEP_SUMMARY, `Worker publication: deployed, online verification pending. Worker changes pending before request: ${result.workerPending}; Pages classification: ${result.classification}.\n`);
}
