import { appendFileSync } from 'node:fs';

const API = 'https://api.github.com';
const environments = {
  worker: 'heibon-production-worker',
  pages: 'heibon-production-pages',
};

function isSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

async function apiRequest(url, { token, method = 'GET', body, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('GitHub deployment API request failed.');
  }
  if (!response.ok) throw new Error(`GitHub deployment API returned HTTP ${response.status}.`);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error('GitHub deployment API returned invalid JSON.');
  }
}

export async function getLatestSuccessfulDeployment({
  owner,
  repo,
  environment,
  token,
  fetchImpl = fetch,
}) {
  if (!owner || !repo || !token || !environment) throw new Error('Deployment lookup configuration is incomplete.');
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const deployments = await apiRequest(
    `${base}/deployments?environment=${encodeURIComponent(environment)}&per_page=100`,
    { token, fetchImpl },
  );
  if (!Array.isArray(deployments)) throw new Error('GitHub deployment list is invalid.');

  for (const deployment of deployments) {
    if (!deployment || !Number.isInteger(deployment.id) || !isSha(deployment.sha)) continue;
    const statuses = await apiRequest(
      `${base}/deployments/${deployment.id}/statuses?per_page=1`,
      { token, fetchImpl },
    );
    if (!Array.isArray(statuses)) throw new Error('GitHub deployment status list is invalid.');
    if (statuses[0]?.state === 'success') {
      return { sha: deployment.sha.toLowerCase(), id: deployment.id };
    }
  }
  return null;
}

export async function recordSuccessfulDeployment({
  owner,
  repo,
  service,
  sha,
  token,
  fetchImpl = fetch,
}) {
  const environment = environments[service];
  if (!environment || !isSha(sha) || !owner || !repo || !token) {
    throw new Error('Deployment record configuration is invalid.');
  }
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const deployment = await apiRequest(`${base}/deployments`, {
    token,
    method: 'POST',
    fetchImpl,
    body: {
      ref: sha,
      environment,
      auto_merge: false,
      required_contexts: [],
      production_environment: true,
      transient_environment: false,
      description: `HEIBON MAHJONG production ${service} success`,
    },
  });
  if (!Number.isInteger(deployment?.id) || deployment.sha?.toLowerCase() !== sha.toLowerCase()) {
    throw new Error('GitHub did not confirm the requested deployment SHA.');
  }
  await apiRequest(`${base}/deployments/${deployment.id}/statuses`, {
    token,
    method: 'POST',
    fetchImpl,
    body: { state: 'success', environment_url: service === 'pages' ? 'https://ak-sekine.github.io/heibon-mahjong/' : undefined },
  });
  return { environment, sha: deployment.sha.toLowerCase() };
}

function writeOutput(values) {
  const output = Object.entries(values).map(([key, value]) => `${key}=${value ?? ''}`).join('\n');
  console.log(output);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
}

async function main() {
  const [command, service] = process.argv.slice(2);
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  const token = process.env.GH_TOKEN;
  const sha = process.env.HEAD_SHA ?? process.env.GITHUB_SHA;
  if (command === 'inspect') {
    try {
      const [worker, pages] = await Promise.all([
        getLatestSuccessfulDeployment({ owner, repo, environment: environments.worker, token }),
        getLatestSuccessfulDeployment({ owner, repo, environment: environments.pages, token }),
      ]);
      writeOutput({
        state_reliable: 'true',
        worker_sha: worker?.sha ?? '',
        pages_sha: pages?.sha ?? '',
      });
    } catch {
      // Do not expose API response bodies or credentials. Empty SHAs force a safe release path.
      writeOutput({ state_reliable: 'false', worker_sha: '', pages_sha: '' });
      console.error('Deployment history lookup failed; full verification and safe redeployment are required.');
    }
    return;
  }
  if (command === 'record' && (service === 'worker' || service === 'pages')) {
    const result = await recordSuccessfulDeployment({ owner, repo, service, sha, token });
    writeOutput({ recorded_service: service, recorded_sha: result.sha });
    return;
  }
  throw new Error('Usage: deployment-state.mjs inspect | record <worker|pages>');
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
