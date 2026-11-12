import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const requestMessage = 'bootstrap: create development Worker (Issue #47)';
export function validateConfig(config) {
  assert.equal(config.name, 'heibon-mahjong-online-dev');
  assert.equal(config.main, 'worker/development.ts');
  assert.equal(config.workers_dev, true);
  assert.deepEqual(config.durable_objects.bindings, [
    { name: 'ROOMS', class_name: 'RoomDurableObject' },
    { name: 'RATE_LIMITER', class_name: 'RateLimitDurableObject' },
  ]);
  assert.deepEqual(config.migrations, [
    { tag: 'v1', new_sqlite_classes: ['RoomDurableObject'] },
    { tag: 'v2', new_sqlite_classes: ['RateLimitDurableObject'] },
  ]);
  assert.deepEqual(Object.keys(config).sort(), ['$schema', 'name', 'main', 'compatibility_date', 'workers_dev', 'observability', 'durable_objects', 'migrations'].sort());
}
export function actualUrl(output) {
  const urls = [...new Set(output.match(/https:\/\/heibon-mahjong-online-dev\.[a-z0-9-]+\.workers\.dev(?![a-z0-9./-])/g) ?? [])];
  assert.equal(urls.length, 1, 'Wrangler must return one unambiguous development URL');
  return urls[0];
}
export function verifyNamespaces(prod, dev) {
  const bindings = settings => settings.bindings.filter(b => b.type === 'durable_object_namespace');
  const production = bindings(prod);
  const development = bindings(dev);
  assert.equal(production.length, 2);
  assert.equal(development.length, 2);
  for (const [name, className] of [['ROOMS', 'RoomDurableObject'], ['RATE_LIMITER', 'RateLimitDurableObject']]) {
    const binding = development.find(b => b.name === name);
    assert.equal(binding?.class_name, className);
    assert(binding.namespace_id, 'Cloudflare must return a namespace ID');
    assert(!binding.script_name || binding.script_name === 'heibon-mahjong-online-dev');
    assert(production.every(b => b.namespace_id && b.namespace_id !== binding.namespace_id), 'Production namespace must not be shared');
  }
  assert.notEqual(development[0].namespace_id, development[1].namespace_id);
  return development.map(({ name, class_name, namespace_id }) => ({ name, class_name, namespace_id }));
}
export async function bootstrap({ operation = 'create', env = process.env, cli = execFileSync, request = fetch, append = appendFileSync } = {}) {
  assert.equal(env.GITHUB_REPOSITORY, 'ak-sekine/heibon-mahjong');
  assert.equal(env.GITHUB_EVENT_NAME, 'push');
  assert.equal(env.GITHUB_REF, 'refs/heads/develop');
  assert(['create', 'complete'].includes(operation));
  assert.equal(env.BOOTSTRAP_REQUEST, operation === 'create' ? requestMessage : 'bootstrap: complete development Worker (Issue #47)');
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
  assert(env.CLOUDFLARE_API_TOKEN && /^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? ''), 'Missing Cloudflare configuration');
  validateConfig(JSON.parse(readFileSync('wrangler.development.jsonc', 'utf8')));
  const fresh = () => assert.equal(cli('gh', ['api', `repos/${env.GITHUB_REPOSITORY}/commits/develop`, '--jq', '.sha'], { encoding: 'utf8' }).trim(), env.GITHUB_SHA, 'Stale develop SHA');
  fresh();
  const api = async (suffix, allowMissing = false) => {
    let response, data;
    try {
      response = await request(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${suffix}`, {
        headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(30000), redirect: 'error',
      });
      data = await response.json();
    } catch { throw new Error('Cloudflare read failed (details suppressed to protect credentials)'); }
    if (allowMissing && response.status === 404 && data.success === false && data.errors?.some(e => e.code === 10007)) return null;
    assert(response.ok && data.success === true, 'Cloudflare read failed; absence must be confirmed, not inferred');
    return data.result;
  };
  const prodBefore = await api('heibon-mahjong-online/settings');
  const existing = await api('heibon-mahjong-online-dev/settings', true);
  if (operation === 'create') assert.equal(existing, null, 'Development Worker already exists; bootstrap refuses to update it');
  else {
    assert(existing, 'Incomplete Worker must already exist');
    assert.equal(createHash('sha256').update(JSON.stringify(existing)).digest('hex'), env.EXPECTED_DEVELOPMENT_SETTINGS_SHA256, 'Inspected development settings changed');
    verifyNamespaces(prodBefore, existing);
  }
  fresh();
  let output;
  try {
    output = cli('node_modules/.bin/wrangler', operation === 'create' ? ['deploy', '--config', 'wrangler.development.jsonc'] : ['triggers', 'deploy', '--config', 'wrangler.development.jsonc'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const diagnostic = String(error.stderr ?? '');
    const codes = [...new Set([...diagnostic.matchAll(/\[code:\s*(\d+)\]/g)].map(match => match[1]))];
    const category = /authenticat|authoriz|permission/i.test(diagnostic) ? 'authorization' : /migration|durable object/i.test(diagnostic) ? 'durable-object' : 'unclassified';
    throw new Error(`Development deployment failed; category=${category}; Cloudflare codes=${codes.join(',') || 'none'}; exit=${Number.isInteger(error.status) ? error.status : 'unknown'}; signal=${['SIGTERM', 'SIGKILL'].includes(error.signal) ? error.signal : 'none'}; raw output suppressed. Inspect Cloudflare before retrying.`);
  }
  const url = actualUrl(output);
  // Preserve the actual endpoint even if subsequent verification fails. Never register it automatically.
  append(env.GITHUB_STEP_SUMMARY, `\nDevelopment Worker returned by Wrangler: ${url}\nSource: ${env.GITHUB_SHA}\nVerification pending. Do not register until all checks pass.\n`);
  const dev = await api('heibon-mahjong-online-dev/settings');
  const namespaces = verifyNamespaces(prodBefore, dev);
  assert.deepEqual(await api('heibon-mahjong-online/settings'), prodBefore, 'Production settings changed during bootstrap');
  const health = await request(url + '/health', { headers: { Origin: 'https://ak-sekine.github.io' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'heibon-mahjong-online' });
  append(env.GITHUB_STEP_SUMMARY, `\nHealth passed; production settings unchanged; independent development DO bindings:\n\n\`\`\`json\n${JSON.stringify(namespaces, null, 2)}\n\`\`\`\nOnline verification must also pass before URL registration.\n`);
  append(env.GITHUB_OUTPUT, `url=${url}\n`);
  return url;
}
export async function verifyRateLimiter(url, request = fetch) {
  assert.equal(actualUrl(url), url);
  // Invalid display name consumes join quota but cannot join or alter any room.
  for (let attempt = 0; attempt < 13; attempt++) {
    const response = await request(url + '/api/rooms/AAAAAA/join', {
      method: 'POST', headers: { Origin: 'https://ak-sekine.github.io', 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: '' }), redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    const body = await response.json();
    if (response.status === 429) {
      assert.equal(body.error, 'rate_limited');
      assert(body.retryAfterMs > 0);
      console.log('Development RATE_LIMITER returned the expected persistent quota rejection.');
      return;
    }
    assert.equal(response.status, 400);
    assert.equal(body.error, 'invalid_display_name');
  }
  throw new Error('Development RATE_LIMITER did not enforce its quota');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { if (process.argv[2] === 'rate-limit') await verifyRateLimiter(process.env.ONLINE_API_URL); else await bootstrap({ operation: process.argv[2] ?? 'create' }); }
  catch (error) { console.error(error.message.includes('Cloudflare') || error.message.includes('deployment failed') ? error.message : 'Bootstrap verification failed. Inspect configuration and safe summary; no automatic retry.'); process.exitCode = 1; }
}
