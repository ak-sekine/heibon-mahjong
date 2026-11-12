import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bootstrap, actualUrl, validateConfig, verifyNamespaces, verifyRateLimiter, requestMessage } from '../.github/scripts/bootstrap-development-worker.mjs';
const config = JSON.parse(readFileSync('wrangler.development.jsonc'));
const url = 'https://heibon-mahjong-online-dev.returned.workers.dev';
const settings = prefix => ({ bindings: config.durable_objects.bindings.map(b => ({ ...b, type: 'durable_object_namespace', namespace_id: prefix + b.name })) });
function fixture(overrides = {}) {
  const env = { GITHUB_REPOSITORY: 'ak-sekine/heibon-mahjong', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/develop', BOOTSTRAP_REQUEST: requestMessage, GITHUB_SHA: 'a'.repeat(40), CLOUDFLARE_API_TOKEN: 'secret-fixture', CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), GITHUB_OUTPUT: 'output', GITHUB_STEP_SUMMARY: 'summary', ...overrides };
  const calls = [], writes = []; let devReads = 0;
  return { env, calls, writes,
    cli(command, args, options) {
      calls.push([command, args]);
      if (command === 'gh') return env.GITHUB_SHA;
      assert.deepEqual(args, ['deploy', '--config', 'wrangler.development.jsonc']);
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
      return 'Deployed\n  ' + url + '\nCurrent Version ID: test';
    },
    async request(target, options) {
      calls.push(['fetch', target]);
      assert.equal(options.redirect, 'error');
      if (target.endsWith('/health')) return Response.json({ ok: true, service: 'heibon-mahjong-online' });
      assert.equal(options.headers.Authorization, 'Bearer secret-fixture');
      if (target.includes('online-dev/settings')) {
        if (++devReads === 1) return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 });
        return Response.json({ success: true, result: settings('dev') });
      }
      return Response.json({ success: true, result: settings('prod') });
    },
    append(file, value) { writes.push([file, value]); },
  };
}
test('bootstrap accepts missing URL variable, deploys only development, and verifies returned URL and independent namespaces', async () => {
  const f = fixture();
  assert.equal(await bootstrap(f), url);
  assert.deepEqual(f.calls.filter(c => c[0] === 'node_modules/.bin/wrangler'), [['node_modules/.bin/wrangler', ['deploy', '--config', 'wrangler.development.jsonc']]]);
  assert(f.writes.some(([file, value]) => file === 'output' && value === `url=${url}\n`));
  assert(!JSON.stringify(f.writes).includes('secret-fixture'));
});
test('wrong branch, event, request, account, stale SHA and existing Worker stop before deployment', async () => {
  for (const overrides of [{ GITHUB_REF: 'refs/heads/main' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { BOOTSTRAP_REQUEST: 'ordinary commit' }, { CLOUDFLARE_ACCOUNT_ID: '' }]) {
    const f = fixture(overrides); await assert.rejects(bootstrap(f)); assert.equal(f.calls.length, 0);
  }
  const stale = fixture(); stale.cli = () => 'c'.repeat(40);
  await assert.rejects(bootstrap(stale), /Stale/);
  const existing = fixture(); existing.request = async () => Response.json({ success: true, result: settings('prod') });
  await assert.rejects(bootstrap(existing), /already exists/);
  assert(!existing.calls.some(c => c[0] === 'node_modules/.bin/wrangler'));
});
test('permission errors and ambiguous absence never cause a create', async () => {
  for (const status of [403, 404, 500]) {
    const f = fixture(); f.request = async () => Response.json({ success: false, errors: [{ code: 999 }] }, { status });
    await assert.rejects(bootstrap(f), /Cloudflare read failed/);
    assert(!f.calls.some(c => c[0] === 'node_modules/.bin/wrangler'));
  }
});
test('only actual unambiguous development URL is accepted', () => {
  for (const output of ['', 'https://heibon-mahjong-online.returned.workers.dev', url + '.evil', url + '/other', url + '\nhttps://heibon-mahjong-online-dev.other.workers.dev']) assert.throws(() => actualUrl(output));
  assert.equal(actualUrl(url + '\n' + url), url);
});
test('external binding, routes, wrong migration, and shared namespace are rejected', () => {
  validateConfig(config);
  for (const mutate of [c => c.durable_objects.bindings[0].script_name = 'heibon-mahjong-online', c => c.routes = ['example.test/*'], c => c.migrations = []]) {
    const c = structuredClone(config); mutate(c); assert.throws(() => validateConfig(c));
  }
  assert.throws(() => verifyNamespaces(settings('same'), settings('same')));
  const dev = settings('dev'); delete dev.bindings[0].namespace_id;
  assert.throws(() => verifyNamespaces(settings('prod'), dev));
});
test('changed production settings and failed health never emit verified URL', async () => {
  for (const mode of ['production', 'health', 'namespace']) {
    const f = fixture(); const original = f.request; let prodReads = 0;
    f.request = async (target, options) => {
      if (mode === 'production' && target.endsWith('online/settings') && ++prodReads === 2) return Response.json({ success: true, result: settings('changed') });
      if (mode === 'health' && target.endsWith('/health')) return new Response('', { status: 503 });
      if (mode === 'namespace' && target.includes('online-dev/settings')) {
        const result = await original(target, options);
        if (result.ok) return Response.json({ success: true, result: settings('prod') });
        return result;
      }
      return original(target, options);
    };
    await assert.rejects(bootstrap(f));
    assert(!f.writes.some(([file]) => file === 'output'));
  }
});
test('bootstrap workflow has an explicit develop push gate and no publication permission or URL prerequisite', () => {
  const workflow = readFileSync('.github/workflows/bootstrap-development-worker.yml', 'utf8');
  assert(workflow.includes('branches: [develop]'));
  assert(workflow.includes("github.event.head_commit.message == '" + requestMessage + "'"));
  assert(workflow.includes('environment: worker-development'));
  assert(workflow.includes('group: worker-development'));
  assert(workflow.includes('secrets.CLOUDFLARE_DEVELOPMENT_API_TOKEN'));
  for (const forbidden of ['workflow_dispatch:', 'DEVELOPMENT_WORKER_URL:', 'worker-production', 'CLOUDFLARE_PRODUCTION_API_TOKEN', 'deploy-pages', 'contents: write', 'pages: write', 'DUAL_PAGES_ENABLED']) assert(!workflow.includes(forbidden), forbidden);
});

test('rate probe cannot mutate a room and requires actual quota enforcement', async () => {
  let count = 0;
  await verifyRateLimiter(url, async (target, options) => {
    assert.equal(target, url + '/api/rooms/AAAAAA/join');
    assert.deepEqual(JSON.parse(options.body), { displayName: '' });
    return ++count <= 12 ? Response.json({ error: 'invalid_display_name' }, { status: 400 }) : Response.json({ error: 'rate_limited', retryAfterMs: 1000 }, { status: 429 });
  });
  assert.equal(count, 13);
  await assert.rejects(verifyRateLimiter(url, async () => Response.json({ error: 'invalid_display_name' }, { status: 400 })), /did not enforce/);
  await assert.rejects(verifyRateLimiter(url, async () => Response.json({ error: 'rate_limit_unavailable' }, { status: 503 })));
});
test('deployment errors expose only fixed categories and numeric API codes', async () => {
  const f = fixture(); const cli = f.cli;
  f.cli = (command, args, options) => {
    if (command === 'gh') return cli(command, args, options);
    throw Object.assign(new Error('secret-fixture'), { stderr: 'Authentication error [code: 10000] secret-fixture' });
  };
  await assert.rejects(bootstrap(f), error => {
    assert.match(error.message, /category=authorization; Cloudflare codes=10000/);
    assert(!error.message.includes('secret-fixture'));
    return true;
  });
});
test('inspection entry uses only read requests and emits selected metadata', () => {
  const script = readFileSync('.github/scripts/inspect-development-worker.mjs', 'utf8');
  assert(!script.includes("method: 'POST'"));
  assert(!script.includes('wrangler'));
  assert(script.includes("filter(b => b.type === 'durable_object_namespace')"));
});

test('completion only deploys triggers for the inspected existing dev settings', async () => {
  const f = fixture({ BOOTSTRAP_REQUEST: 'bootstrap: complete development Worker (Issue #47)' });
  const original = f.request;
  f.operation = 'complete';
  f.env.EXPECTED_DEVELOPMENT_SETTINGS_SHA256 = createHash('sha256').update(JSON.stringify(settings('dev'))).digest('hex');
  f.request = async (target, options) => target.includes('online-dev/settings') ? Response.json({ success: true, result: settings('dev') }) : original(target, options);
  f.cli = (command, args) => {
    if (command === 'gh') return f.env.GITHUB_SHA;
    assert.deepEqual(args, ['triggers', 'deploy', '--config', 'wrangler.development.jsonc']);
    return url;
  };
  assert.equal(await bootstrap(f), url);
  f.env.EXPECTED_DEVELOPMENT_SETTINGS_SHA256 = 'wrong';
  await assert.rejects(bootstrap(f), /settings changed/);
});
