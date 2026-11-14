import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { publicationMode } from '../.github/scripts/validate-publication-mode.mjs';
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
  assert(workflow.includes('test -s artifacts/itch/heibon-mahjong.zip'));
  assert(workflow.includes('node scripts/environments/artifacts.mjs verify dist'));
  assert(workflow.includes('node scripts/environments/artifacts.mjs verify dist-dev'));
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

test('publication mode accepts unset, false, and true, rejects other values, and logs no raw value', () => {
  const workflow = read('.github/workflows/environments.yml');
  assert.equal(publicationMode(undefined), 'disabled (unset)');
  assert.equal(publicationMode(''), 'disabled (unset)');
  assert.equal(publicationMode('false'), 'disabled (false)');
  assert.equal(publicationMode('true'), 'enabled (true; manual publish=true dispatch still required)');
  for (const invalid of ['TRUE', 'False', 'yes', '1', ' true', 'false ']) {
    assert.throws(() => publicationMode(invalid), /must be unset, false, or true/);
  }
  assert(workflow.includes('node .github/scripts/validate-publication-mode.mjs'));
  assert(workflow.includes('node .github/scripts/validate-publication-mode.mjs | tee -a "$GITHUB_STEP_SUMMARY"'));
  assert.doesNotMatch(workflow, /echo .*DUAL_PAGES_ENABLED/);
  assert.match(read('.github/scripts/validate-publication-mode.mjs'), /Publication mode:/);
});

test('new publication remains manual and branch scoped; legacy production gate is unchanged', () => {
  const workflow = read('.github/workflows/environments.yml');
  assert.match(workflow, /workflow_dispatch:[\s\S]*?publish:[\s\S]*?type: boolean[\s\S]*?default: false/);
  for (const [name, expectedBranch] of [['worker-production', 'main'], ['worker-development', 'develop']]) {
    const stopJob = name === 'worker-production' ? 'worker-development' : 'online';
    const job = workflow.split(`  ${name}:`)[1].split(`\n  ${stopJob}:`)[0];
    assert(job.includes(`github.ref == 'refs/heads/${expectedBranch}'`));
    assert(job.includes("github.event_name == 'workflow_dispatch' && inputs.publish == true"));
    assert(job.includes("vars.DUAL_PAGES_ENABLED == 'true'"));
    assert(job.includes('needs: [verify, browser-ui, isolation-browser, audit]'));
  }
  const online = workflow.split('  online:')[1].split('\n  publish:')[0];
  assert(online.includes('needs: [worker-production, worker-development]'));
  assert(online.includes('needs.worker-production.result == \'success\' || needs.worker-development.result == \'success\''));
  const publishCaller = workflow.split('\n  publish:')[1];
  assert(publishCaller.includes('needs: [online]'));
  assert(publishCaller.includes('uses: ./.github/workflows/publish-environments.yml'));
  assert(!/\n    if:/.test(publishCaller), 'publish caller must use the default success condition from its online dependency');
  const legacy = read('.github/workflows/deploy.yml');
  assert.match(legacy, /group: production-deploy[\s\S]*?cancel-in-progress: false/);
  assert.match(legacy, /if: \$\{\{ vars\.DUAL_PAGES_ENABLED != 'true' \}\}/);
  assert.match(legacy, /deploy_to_production:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(legacy, /needs\.detect-changes\.outputs\.deploy_required == 'true'[\s\S]*?needs\.verify\.result == 'success'[\s\S]*?needs\.browser-ui\.result == 'success'[\s\S]*?needs\.browser-ui-matrix-audit\.result == 'success'[\s\S]*?needs\.release-freshness\.result == 'success'[\s\S]*?inputs\.deploy_to_production == true/);
  const publisher = read('.github/workflows/publish-environments.yml');
  assert.match(publisher, /vars\.DUAL_PAGES_ENABLED == 'true'[\s\S]*?github\.ref == 'refs\/heads\/main' \|\| github\.ref == 'refs\/heads\/develop'/);
  const freshJobGuards = workflow.match(/if: \$\{\{[^\n]+\}\}/g) ?? [];
  assert(freshJobGuards.some(guard => guard.includes("github.event_name == 'workflow_dispatch'") && guard.includes('inputs.publish == true')));
  assert(!freshJobGuards.some(guard => guard.includes("github.event_name == 'push'") && guard.includes('inputs.publish')));
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
