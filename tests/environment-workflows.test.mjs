import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('production and development configs bind their own DO namespace, with no external script binding', () => {
  const prod = JSON.parse(read('wrangler.jsonc'));
  const dev = JSON.parse(read('wrangler.development.jsonc'));
  assert.equal(prod.name, 'heibon-mahjong-online');
  assert.equal(dev.name, 'heibon-mahjong-online-dev');
  assert.equal(dev.main, 'worker/development.ts');
  for (const config of [prod, dev]) {
    assert.deepEqual(config.durable_objects.bindings.map(b => b.name), ['ROOMS', 'RATE_LIMITER']);
    for (const binding of config.durable_objects.bindings) {
      assert.equal(binding.script_name, undefined);
      assert.equal(binding.namespace_id, undefined);
    }
    assert.deepEqual(config.migrations, prod.migrations);
  }
});
test('development worker job never references production token, and push cannot publish during migration', () => {
  const workflow = read('.github/workflows/environments.yml');
  const dev = workflow.split('  worker-development:')[1].split('  online:')[0];
  assert(!dev.includes('CLOUDFLARE_PRODUCTION_API_TOKEN'));
  assert(!dev.includes('wrangler.jsonc'));
  assert(dev.includes("github.ref == 'refs/heads/develop'"));
  assert(dev.includes("github.event_name == 'workflow_dispatch' && inputs.publish == true"));
  const prod = workflow.split('  worker-production:')[1].split('  worker-development:')[0];
  assert(prod.includes("github.ref == 'refs/heads/main'"));
  assert(prod.includes("github.event_name == 'workflow_dispatch' && inputs.publish == true"));
  assert(prod.includes('environment: worker-production'));
  assert(dev.includes('environment: worker-development'));
  for (const job of [prod, dev]) assert(job.includes('CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}'));
  assert(!workflow.includes('CLOUDFLARE_PRODUCTION_ACCOUNT_ID'));
  assert(!workflow.includes('CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID'));
  const publish = read('.github/workflows/publish-environments.yml');
  assert(publish.includes('group: pages-publication'));
  assert(publish.includes('cancel-in-progress: false'));
  assert(publish.indexOf('git push origin HEAD:pages-verified') < publish.indexOf('uses: actions/deploy-pages@v4'));
  assert(publish.indexOf('artifacts.mjs finalize') > publish.indexOf('uses: actions/deploy-pages@v4'));
});

test('both deployment paths accept one account and use their own config (mocked CLI, no deployment)', () => {
  const script = read('.github/scripts/deploy-isolated-worker.mjs').replace(/^import .*;$/gm, '');
  for (const [environment, branch, name, config] of [
    ['production', 'main', 'heibon-mahjong-online', 'wrangler.jsonc'],
    ['development', 'develop', 'heibon-mahjong-online-dev', 'wrangler.development.jsonc'],
  ]) {
    const url = `https://${name}.validation.workers.dev`;
    const env = {
      GITHUB_REF: `refs/heads/${branch}`, GITHUB_SHA: 'a'.repeat(40),
      GITHUB_REPOSITORY: 'fixture/repo', GITHUB_OUTPUT: 'output',
      CLOUDFLARE_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'shared-account',
      EXPECTED_WORKER_URL: url,
    };
    const calls = [];
    const context = {
      process: { argv: ['node', 'script', environment], env },
      execFileSync(command, args) {
        calls.push([command, Array.from(args)]);
        return command === 'gh' ? env.GITHUB_SHA : url;
      },
      appendFileSync(file, value) { assert.equal(file, 'output'); assert.equal(value, `url=${url}\n`); },
    };
    runInNewContext(script, context);
    assert.deepEqual(calls, [
      ['gh', ['api', 'repos/fixture/repo/commits/' + branch, '--jq', '.sha']],
      ['npx', ['wrangler', 'deploy', '--config', config]],
    ]);
    env.CLOUDFLARE_ACCOUNT_ID = '';
    assert.throws(() => runInNewContext(script, { ...context }), /Missing explicit deployment configuration/);
  }
});
