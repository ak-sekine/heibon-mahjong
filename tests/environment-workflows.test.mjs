import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { publicationMode } from '../.github/scripts/validate-publication-mode.mjs';
import { classifyChanges } from '../.github/scripts/classify-changes.mjs';
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
function workflowContext({ branch = 'develop', ref = `refs/heads/${branch}`, event = 'workflow_dispatch', publish = true, dualPages = 'true', canceled = false, results = {}, fullSuite = 'true' } = {}) {
  const jobResults = {
    'classify-changes': 'success', 'docs-check': 'success', verify: 'success', 'browser-ui': 'success', 'isolation-browser': 'success',
    'local-online': 'success', audit: 'success', ...results,
  };
  return {
    github: { ref, event_name: event },
    inputs: { publish },
    vars: { DUAL_PAGES_ENABLED: dualPages },
    needs: Object.fromEntries(Object.entries(jobResults).map(([name, result]) => [name, {
      result,
      outputs: name === 'classify-changes' ? { run_full_suite: fullSuite } : {},
    }])),
    always: () => true,
    success: () => true,
    failure: () => false,
    cancelled: () => canceled,
    jobResults,
  };
}
function evaluateJobCondition(expression, context, dependencyResults) {
  const hasStatusCheck = /\b(?:always|cancelled|failure|success)\s*\(/.test(expression);
  if (!hasStatusCheck && dependencyResults.some(result => result !== 'success')) return false;
  const jsExpression = (expression || 'true').replace(/\bneeds\.([a-zA-Z][\w-]*)\.(result|outputs(?:\.[a-zA-Z_][\w-]*)?)/g, 'needs["$1"].$2');
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
  assert.match(audit, /Confirm intentional docs-only skips/);
  assert(workflow.includes('test -s artifacts/itch/heibon-mahjong.zip'));
  assert(workflow.includes('node scripts/environments/artifacts.mjs verify dist'));
  assert(workflow.includes('node scripts/environments/artifacts.mjs verify dist-dev'));
  const publisher = read('.github/workflows/publish-environments.yml');
  const dev = jobSection(publisher, 'worker-development');
  assert(!dev.includes('CLOUDFLARE_PRODUCTION_API_TOKEN'));
  assert(!dev.includes('wrangler.jsonc'));
  assert(dev.includes("github.ref == 'refs/heads/develop'"));
  const prod = jobSection(publisher, 'worker-production');
  assert(prod.includes("github.ref == 'refs/heads/main'"));
  assert(prod.includes('environment: worker-production'));
  assert(dev.includes('environment: worker-development'));
  for (const job of [prod, dev]) assert(job.includes('CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}'));
  assert(!workflow.includes('CLOUDFLARE_PRODUCTION_ACCOUNT_ID'));
  assert(!workflow.includes('CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID'));
  assert.match(publisher, /^concurrency:\n  group: pages-publication\n  cancel-in-progress: false\njobs:/m);
  assert.equal(publisher.match(/group: pages-publication/g)?.length, 1);
  const reserve = jobSection(publisher, 'reserve');
  assert(reserve.indexOf('publication-reservation.mjs prepare') < reserve.indexOf('git -C store push origin HEAD:pages-verified'));
  assert(reserve.indexOf('git -C store push origin HEAD:pages-verified') < reserve.indexOf("printf 'snapshot="));
  for (const job of [prod, dev]) {
    assert.match(job, /needs: reserve/);
    assert.match(job, /PUBLICATION_SNAPSHOT: \$\{\{ needs.reserve.outputs.snapshot \}\}/);
  }
  const pages = jobSection(publisher, 'publish');
  assert.match(pages, /needs: \[reserve, online\]/);
  assert.match(pages, /EXPECTED_WORKER_URL: \$\{\{ needs.online.outputs.worker_url \}\}/);
  assert(pages.indexOf('publication-reservation.mjs check') < pages.indexOf('uses: actions/deploy-pages@v4'));
  assert(pages.indexOf('artifacts.mjs finalize') > pages.indexOf('uses: actions/deploy-pages@v4'));
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

test('publisher forwards only the two declared Worker secrets and checks the selected environment before reservation', () => {
  const caller = jobSection(read('.github/workflows/environments.yml'), 'publish');
  const publisher = read('.github/workflows/publish-environments.yml');
  const credentials = jobSection(publisher, 'worker-credentials');
  const reserve = jobSection(publisher, 'reserve');
  const checkScript = credentials.match(/^\s+run: \|\n([\s\S]+)$/m)?.[1];
  const callerSecrets = caller.split('\n    secrets:\n')[1];
  assert(checkScript);
  assert(callerSecrets);
  assert.match(credentials, /deployment: false/);
  assert.match(reserve, /^    needs: worker-credentials$/m);
  assert.equal(jobCondition(publisher, 'worker-credentials'), jobCondition(publisher, 'reserve'));
  const evaluate = (key, context) => {
    const binding = credentials.split('\n').find(line => line.trimStart().startsWith(key + ':'));
    assert(binding, key);
    const expression = binding.trim().slice(key.length + ': ${{ '.length, -' }}'.length);
    return runInNewContext(expression, context, { timeout: 100 });
  };
  const names = ['CLOUDFLARE_PRODUCTION_API_TOKEN', 'CLOUDFLARE_DEVELOPMENT_API_TOKEN'];
  assert.deepEqual(callerSecrets.trim().split('\n').map(line => line.trim()), names.map(name =>
    name + ': ${{ secrets.' + name + ' }}'));

  for (const [branch, environment, name] of [
    ['main', 'worker-production', names[0]],
    ['develop', 'worker-development', names[1]],
  ]) {
    assert(publisher.split('\njobs:\n')[0].includes('      ' + name + ':\n        required: true'));
    assert(jobSection(publisher, environment).includes('CLOUDFLARE_API_TOKEN: ${{ secrets.' + name + ' }}'));
    const context = workflowContext({ branch });
    assert.equal(evaluate('name', context), environment);
    assert.equal(evaluate('TOKEN_NAME', context), name);
    for (const available of [false, true]) {
      const dummy = 'mock-token-not-for-output';
      const secrets = Object.fromEntries(names.map(key => [key, key === name && !available ? '' : dummy]));
      const token = evaluate('CLOUDFLARE_API_TOKEN', { ...context, secrets });
      const result = spawnSync('bash', ['-c', checkScript], {
        encoding: 'utf8', env: { TOKEN_NAME: name, CLOUDFLARE_API_TOKEN: token },
      });
      assert.equal(result.status, available ? 0 : 1);
      const output = result.stdout + result.stderr;
      assert(!output.includes(dummy));
      if (available) assert.equal(output, '');
      else assert(output.includes(name));
      assert.equal(evaluateJobCondition(jobCondition(publisher, 'reserve'), context,
        [result.status === 0 ? 'success' : 'failure']), available);
    }
  }
});

test('new publication remains manual and branch scoped; legacy production gate is unchanged', () => {
  const workflow = read('.github/workflows/environments.yml');
  assert.match(workflow, /workflow_dispatch:[\s\S]*?publish:[\s\S]*?type: boolean[\s\S]*?default: false/);
  const publisher = read('.github/workflows/publish-environments.yml');
  for (const [name, expectedBranch] of [['worker-production', 'main'], ['worker-development', 'develop']]) {
    const condition = jobCondition(publisher, name);
    for (const branch of ['main', 'develop']) {
      const context = workflowContext({ branch });
      assert.equal(evaluateJobCondition(condition, context, ['success']), branch === expectedBranch);
      assert.equal(evaluateJobCondition(condition, context, ['failure']), false);
    }
  }

  const caller = jobSection(workflow, 'publish');
  const condition = jobCondition(workflow, 'publish');
  const gates = ['classify-changes', 'docs-check', 'verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit'];
  const needs = caller.match(/^    needs: \[([^\]]+)\]$/m)?.[1].split(',').map(value => value.trim());
  assert.deepEqual(needs, gates);
  assert(caller.includes('uses: ./.github/workflows/publish-environments.yml'));
  const evaluate = options => {
    const context = workflowContext(options);
    return evaluateJobCondition(condition, context, gates.map(gate => context.jobResults[gate]));
  };
  for (const branch of ['main', 'develop']) {
    assert.equal(evaluate({ branch }), true);
    for (const gate of gates) {
      for (const result of ['failure', 'skipped', 'cancelled']) {
        assert.equal(evaluate({ branch, results: { [gate]: result } }), false);
      }
    }
    for (const options of [
      { event: 'push' }, { publish: false }, { dualPages: 'false' }, { dualPages: '' },
      { ref: 'refs/tags/main' }, { ref: 'refs/heads/feature/test' },
    ]) assert.equal(evaluate({ branch, ...options }), false);
  }

  const online = jobCondition(publisher, 'online');
  const pages = jobCondition(publisher, 'publish');
  assert.match(jobSection(publisher, 'online'), /needs: \[reserve, worker-production, worker-development\]/);
  for (const branch of ['main', 'develop']) {
    const own = branch === 'main' ? 'worker-production' : 'worker-development';
    const other = branch === 'main' ? 'worker-development' : 'worker-production';
    const evaluateOnline = (active, inactive, canceled = false) => {
      const context = workflowContext({ branch, canceled, results: { [own]: active, [other]: inactive } });
      return evaluateJobCondition(online, context, [active, inactive]);
    };
    assert.equal(evaluateOnline('success', 'skipped'), true);
    assert.equal(evaluateOnline('success', 'success'), false);
    assert.equal(evaluateOnline('failure', 'skipped'), false);
    assert.equal(evaluateOnline('skipped', 'success'), false);
    assert.equal(evaluateOnline('success', 'skipped', true), false);
    const evaluatePages = (reservation, onlineResult, canceled = false) => {
      const context = workflowContext({ branch, canceled, results: { reserve: reservation, online: onlineResult } });
      // The unselected Worker is a transitively skipped dependency.
      return evaluateJobCondition(pages, context, [reservation, onlineResult, 'skipped']);
    };
    assert.equal(evaluatePages('success', evaluateOnline('success', 'skipped') ? 'success' : 'skipped'), true);
    assert.equal(evaluatePages('success', evaluateOnline('failure', 'skipped') ? 'success' : 'skipped'), false);
    assert.equal(evaluatePages('success', 'success', true), false);
    for (const result of ['failure', 'skipped', 'cancelled']) {
      assert.equal(evaluatePages(result, 'success'), false);
      assert.equal(evaluatePages('success', result), false);
    }
  }

  const legacy = read('.github/workflows/deploy.yml');
  assert.match(legacy, /group: production-deploy[\s\S]*?cancel-in-progress: false/);
  assert.match(legacy, /if: \$\{\{ vars\.DUAL_PAGES_ENABLED != 'true' \}\}/);
  assert.match(legacy, /deploy_to_production:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(legacy, /needs\.detect-changes\.outputs\.deploy_required == 'true'[\s\S]*?needs\.verify\.result == 'success'[\s\S]*?needs\.browser-ui\.result == 'success'[\s\S]*?needs\.browser-ui-matrix-audit\.result == 'success'[\s\S]*?needs\.release-freshness\.result == 'success'[\s\S]*?inputs\.deploy_to_production == true/);
  const reserve = jobCondition(publisher, 'reserve');
  for (const branch of ['main', 'develop']) {
    assert.equal(evaluateJobCondition(reserve, workflowContext({ branch }), []), true);
    assert.equal(evaluateJobCondition(reserve, workflowContext({ branch, event: 'push' }), []), false);
  }
});

test('environment workflow reuses safe change classification and reserves light mode for docs-only pushes', () => {
  const workflow = read('.github/workflows/environments.yml');
  const classify = jobSection(workflow, 'classify-changes');
  assert.match(classify, /git diff --no-renames --name-only -z/);
  assert.match(classify, /node \.github\/scripts\/classify-changes\.mjs </);
  assert.match(classify, /node \.github\/scripts\/classify-changes\.mjs --unsafe/);
  assert.match(classify, /"\$EVENT_NAME" == "push"/);
  assert.match(jobCondition(workflow, 'verify'), /always\(\)/);
  assert.match(jobCondition(workflow, 'verify'), /run_full_suite != 'false'/);
  for (const name of ['browser-ui', 'isolation-browser', 'local-online']) {
    const condition = jobCondition(workflow, name);
    assert.match(condition, /run_full_suite == 'true'/, `${name} must retain the full suite for code and uncertain diffs`);
    assert.match(condition, /needs\.verify\.result == 'success'/);
  }
  assert.match(jobCondition(workflow, 'audit'), /always\(\)/);
  assert.match(jobSection(workflow, 'docs-check'), /git diff --check/);
  assert.match(jobSection(workflow, 'audit'), /Fail closed when classification is unavailable/);

  const cases = [
    { name: 'AGENTS.md only', files: ['AGENTS.md'], full: false },
    { name: 'ordinary Markdown only', files: ['docs/ci.md'], full: false },
    { name: 'application source', files: ['src/main.ts'], full: true },
    { name: 'workflow, script, test, and dependency changes', files: [
      '.github/workflows/ci.yml', '.github/scripts/check.mjs', 'tests/check.test.mjs', 'package-lock.json',
    ], full: true },
    { name: 'documentation and code mixed', files: ['README.md', 'src/main.ts'], full: true },
    { name: 'failed or unknown diff', files: [], reliable: false, full: true },
  ];
  for (const scenario of cases) {
    const result = classifyChanges(scenario.files, scenario.reliable ?? true);
    assert.equal(result.run_full_suite, String(scenario.full), scenario.name);
    const context = workflowContext({ event: 'push', publish: false, fullSuite: result.run_full_suite });
    const verifyRuns = evaluateJobCondition(jobCondition(workflow, 'verify'), context, ['success']);
    assert.equal(verifyRuns, scenario.full, `${scenario.name}: verify`);
    const browserRuns = evaluateJobCondition(jobCondition(workflow, 'browser-ui'), context,
      ['success', scenario.full ? 'success' : 'skipped']);
    assert.equal(browserRuns, scenario.full, `${scenario.name}: Browser UI`);
    const expectedPublish = evaluateJobCondition(jobCondition(workflow, 'publish'), context,
      ['success', 'success', scenario.full ? 'success' : 'skipped', scenario.full ? 'success' : 'skipped',
        scenario.full ? 'success' : 'skipped', scenario.full ? 'success' : 'skipped', 'success']);
    assert.equal(expectedPublish, false, `${scenario.name}: push must never publish`);
  }

  // The classifier step uses --unsafe for both manual routes, forcing the same
  // full verification whether the caller requests publication or not.
  for (const [event, publish, fullSuite, expectedVerify] of [
    ['workflow_dispatch', false, 'true', true],
    ['workflow_dispatch', true, 'true', true],
  ]) {
    const context = workflowContext({ event, publish, fullSuite });
    const heavyCondition = jobCondition(workflow, 'browser-ui');
    const allowed = evaluateJobCondition(heavyCondition, context, ['success', expectedVerify ? 'success' : 'skipped']);
    assert.equal(allowed, expectedVerify, `${event} publish=${publish} fullSuite=${fullSuite}`);
    const gateNames = ['classify-changes', 'docs-check', 'verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit'];
    const gateResults = gateNames.map(name => context.jobResults[name]);
    assert.equal(evaluateJobCondition(jobCondition(workflow, 'publish'), context, gateResults), publish,
      `${event} publish=${publish}: publish outcome`);
  }
});
