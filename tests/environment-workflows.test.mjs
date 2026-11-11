import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('production and development configs bind their own DO namespace, with no external script binding', () => {
  const prod = JSON.parse(read('wrangler.jsonc'));
  const dev = JSON.parse(read('wrangler.development.jsonc'));
  assert.equal(prod.name, 'heibon-mahjong-online');
  assert.equal(dev.name, 'heibon-mahjong-online-dev');
  assert.equal(dev.main, 'worker/development.ts');
  for (const config of [prod, dev]) {
    assert.deepEqual(config.durable_objects.bindings.map(b => b.name), ['ROOMS', 'RATE_LIMITER']);
    for (const binding of config.durable_objects.bindings) assert.equal(binding.script_name, undefined);
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
  const publish = read('.github/workflows/publish-environments.yml');
  assert(publish.includes('group: pages-publication'));
  assert(publish.includes('cancel-in-progress: false'));
  assert(publish.indexOf('git push origin HEAD:pages-verified') < publish.indexOf('uses: actions/deploy-pages@v4'));
  assert(publish.indexOf('artifacts.mjs finalize') > publish.indexOf('uses: actions/deploy-pages@v4'));
});
