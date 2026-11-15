import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { publicationMode } from '../.github/scripts/validate-publication-mode.mjs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function jobSection(workflow, id) {
  const jobsStart = workflow.indexOf('\njobs:\n');
  assert.notEqual(jobsStart, -1, 'workflow must define jobs');
  const marker = `\n  ${id}:\n`;
  const start = workflow.indexOf(marker, jobsStart) + marker.length;
  assert(start >= marker.length, `workflow must define job ${id}`);
  const remainder = workflow.slice(start);
  const nextJob = remainder.search(/^  [a-zA-Z0-9_-]+:\s*$/m);
  return nextJob === -1 ? remainder : remainder.slice(0, nextJob);
}
function jobCondition(workflow, id) {
  const section = jobSection(workflow, id);
  const inline = section.match(/^    if:\s*(.+)$/m);
  assert(inline, `${id} must define a job condition`);
  let expression = inline[1].trim();
  if (expression === '>-') {
    const folded = section.match(/^    if:\s*>-\s*\n((?:[ \t]{6,}[^\n]*\n)+)/m);
    assert(folded, `${id} must define a folded job condition`);
    expression = folded[1].split(/\r?\n/).filter(Boolean).map(line => line.trim()).join(' ');
  }
  assert.match(expression, /^\$\{\{[\s\S]*\}\}$/);
  return expression.slice(3, -2).trim();
}
function workflowContext({ branch = 'develop', ref = `refs/heads/${branch}`, event = 'workflow_dispatch', publish = true, dualPages = 'true', canceled = false, results = {} } = {}) {
  const branchResults = branch === 'main'
    ? { 'worker-production': 'success', 'worker-development': 'skipped' }
    : { 'worker-production': 'skipped', 'worker-development': 'success' };
  const jobResults = {
    verify: 'success',
    'browser-ui': 'success',
    'isolation-browser': 'success',
    'local-online': 'success',
    audit: 'success',
    ...branchResults,
    online: 'success',
    ...results,
  };
  return {
    github: { ref, event_name: event },
    inputs: { publish },
    vars: { DUAL_PAGES_ENABLED: dualPages },
    needs: Object.fromEntries(Object.entries(jobResults).map(([name, result]) => [name, { result }])),
    cancelled: () => canceled,
    jobResults,
  };
}
function evaluateJobCondition(expression, context, dependencyResults) {
  const hasStatusCheck = /\b(?:always|cancelled|failure|success)\s*\(/.test(expression);
  if (!hasStatusCheck && dependencyResults.some(result => result !== 'success')) return false;
  const jsExpression = (expression || 'true').replace(/\bneeds\.([a-zA-Z][\w-]*)\.result/g, 'needs["$1"].result');
  return Boolean(runInNewContext(jsExpression, context, { timeout: 100 }));
}
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
  const audit = workflow.split('  audit:')[1].split('  worker-production:')[0];
  assert.match(audit, /if: \$\{\{ always\(\) \}\}/);
  assert.match(audit, /Audit all four Browser UI groups/);
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
  const publishCaller = jobSection(workflow, 'publish');
  const publishCondition = jobCondition(workflow, 'publish');
  const publishNeeds = publishCaller.match(/^    needs: \[([^\]]+)\]$/m)?.[1].split(',').map(value => value.trim());
  assert.deepEqual(publishNeeds, [
    'verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit',
    'worker-production', 'worker-development', 'online',
  ]);
  assert(publishCaller.includes('uses: ./.github/workflows/publish-environments.yml'));
  assert.match(publishCondition, /!cancelled\(\)/);
  assert.doesNotMatch(publishCondition, /\balways\s*\(/);
  for (const required of [
    "github.event_name == 'workflow_dispatch'",
    'inputs.publish == true',
    "vars.DUAL_PAGES_ENABLED == 'true'",
    "needs.verify.result == 'success'",
    "needs.browser-ui.result == 'success'",
    "needs.isolation-browser.result == 'success'",
    "needs.local-online.result == 'success'",
    "needs.audit.result == 'success'",
    "needs.online.result == 'success'",
  ]) assert(publishCondition.includes(required), `publish condition must require ${required}`);

  const evaluate = options => {
    const context = workflowContext(options);
    return evaluateJobCondition(publishCondition, context, Object.values(context.jobResults));
  };
  const develop = { branch: 'develop' };
  const main = { branch: 'main' };
  // The prior caller had no status-check function. GitHub applies the default
  // success() check, so a skipped worker ancestor prevented the reusable call
  // even though online itself succeeded.
  const previousContext = workflowContext(develop);
  assert.equal(evaluateJobCondition('', previousContext, Object.values(previousContext.jobResults)), false);
  assert.equal(evaluate(develop), true, 'develop may publish after its Worker succeeds and production Worker is skipped');
  assert.equal(evaluate(main), true, 'main may publish after its Worker succeeds and development Worker is skipped');

  const forbidden = [
    ['develop online failure', { ...develop, results: { online: 'failure' } }],
    ['main online failure', { ...main, results: { online: 'failure' } }],
    ['online skipped', { ...develop, results: { online: 'skipped' } }],
    ['both Workers skipped', { ...develop, results: { 'worker-production': 'skipped', 'worker-development': 'skipped' } }],
    ['both Workers failed', { ...develop, results: { 'worker-production': 'failure', 'worker-development': 'failure' } }],
    ['develop Worker failed', { ...develop, results: { 'worker-development': 'failure' } }],
    ['main Worker failed', { ...main, results: { 'worker-production': 'failure' } }],
    ['both Workers succeeded', { ...develop, results: { 'worker-production': 'success', 'worker-development': 'success' } }],
    ...['verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit'].map(job => [
      `${job} failed`, { ...develop, results: { [job]: 'failure' } },
    ]),
    ['push event', { ...develop, event: 'push', results: { 'worker-production': 'skipped', 'worker-development': 'skipped', online: 'skipped' } }],
    ['publish=false', { ...develop, publish: false }],
    ['DUAL_PAGES_ENABLED=false', { ...develop, dualPages: 'false' }],
    ['DUAL_PAGES_ENABLED unset', { ...develop, dualPages: '' }],
    ['required CI skipped', { ...develop, results: { 'browser-ui': 'skipped' } }],
    ['unsupported branch', { ...develop, ref: 'refs/heads/feature/test' }],
    ['cancelled workflow', { ...develop, canceled: true }],
  ];
  for (const [name, options] of forbidden) assert.equal(evaluate(options), false, `${name} must keep publication disabled`);

  const legacy = read('.github/workflows/deploy.yml');
  assert.match(legacy, /group: production-deploy[\s\S]*?cancel-in-progress: false/);
  assert.match(legacy, /if: \$\{\{ vars\.DUAL_PAGES_ENABLED != 'true' \}\}/);
  assert.match(legacy, /deploy_to_production:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(legacy, /needs\.detect-changes\.outputs\.deploy_required == 'true'[\s\S]*?needs\.verify\.result == 'success'[\s\S]*?needs\.browser-ui\.result == 'success'[\s\S]*?needs\.browser-ui-matrix-audit\.result == 'success'[\s\S]*?needs\.release-freshness\.result == 'success'[\s\S]*?inputs\.deploy_to_production == true/);
  const publisher = read('.github/workflows/publish-environments.yml');
  assert.match(publisher, /vars\.DUAL_PAGES_ENABLED == 'true'[\s\S]*?github\.ref == 'refs\/heads\/main' \|\| github\.ref == 'refs\/heads\/develop'/);
  const publisherCondition = jobCondition(publisher, 'publish');
  assert.equal(evaluateJobCondition(publisherCondition, workflowContext({ branch: 'main' }), []), true);
  assert.equal(evaluateJobCondition(publisherCondition, workflowContext({ branch: 'develop' }), []), true);
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
