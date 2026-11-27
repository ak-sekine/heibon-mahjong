import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { hasRequiredIssueJobs } from '../.github/scripts/check-issue-publication-ci.mjs';
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
function workflowContext({ branch = 'develop', repository = 'ak-sekine/heibon-mahjong', ref = `refs/heads/${branch}`, event = 'workflow_dispatch', publish = true, dualPages = 'true', canceled = false, results = {}, fullSuite = 'true', reuse = 'false', reuseProduction = false, productionValidation = 'full', publicationTarget = 'both', autoPages = 'false', autoWorker = 'false', autoClassification = 'none' } = {}) {
  const jobResults = {
    'classify-changes': 'success', 'docs-check': 'success', verify: 'success', 'browser-ui': 'success', 'isolation-browser': 'success',
    'local-online': 'success', audit: 'success', 'worker-credentials': 'success', 'verify-production-source': 'skipped', 'plan-auto': 'skipped', ...results,
  };
  return {
    github: { ref, event_name: event, repository },
    startsWith: (value, prefix) => value.startsWith(prefix),
    inputs: { publish, reuse_production: reuseProduction, production_validation: productionValidation, publication_target: publicationTarget },
    vars: { DUAL_PAGES_ENABLED: dualPages },
    needs: Object.fromEntries(Object.entries(jobResults).map(([name, result]) => [name, {
      result,
      outputs: name === 'classify-changes' ? { run_full_suite: fullSuite, reuse } : name === 'plan-auto' ? { pages: autoPages, worker: autoWorker, classification: autoClassification } : {},
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
  assert.match(audit, /if: \$\{\{ always\(\) && needs.classify-changes.outputs.reuse != 'true' \}\}/);
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
  const reservationCheck = pages.indexOf('run: node source/.github/scripts/publication-reservation.mjs');
  assert(reservationCheck >= 0 && reservationCheck < pages.indexOf('uses: actions/deploy-pages@v4'));
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
  assert.match(reserve, /^    needs: \[worker-credentials, verify-production-source\]$/m);
  assert.match(jobCondition(publisher, 'reserve'), /needs.worker-credentials.result == 'success'/);
  const evaluate = (key, context) => {
    const binding = credentials.split('\n').find(line => line.trimStart().startsWith(key + ':'));
    assert(binding, key);
    const expression = binding.trim().slice(key.length + ': ${{ '.length, -' }}'.length);
    return runInNewContext(expression, context, { timeout: 100 });
  };
  const names = ['CLOUDFLARE_PRODUCTION_API_TOKEN', 'CLOUDFLARE_DEVELOPMENT_API_TOKEN'];
  assert.deepEqual(callerSecrets.trim().split('\n').map(line => line.trim()), [
    "CLOUDFLARE_PRODUCTION_API_TOKEN: ${{ inputs.publication_target != 'pages' && inputs.publication_target != 'none' && github.ref == 'refs/heads/main' && secrets.CLOUDFLARE_PRODUCTION_API_TOKEN || '' }}",
    "CLOUDFLARE_DEVELOPMENT_API_TOKEN: ${{ inputs.publication_target != 'pages' && inputs.publication_target != 'none' && secrets.CLOUDFLARE_DEVELOPMENT_API_TOKEN || '' }}",
  ]);

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
      context.needs['worker-credentials'].result = result.status === 0 ? 'success' : 'failure';
      assert.equal(evaluateJobCondition(jobCondition(publisher, 'reserve'), context,
        [result.status === 0 ? 'success' : 'failure']), false);
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
      const context = workflowContext({ branch, results: { reserve: 'success' } });
      assert.equal(evaluateJobCondition(condition, context, ['success']), branch === expectedBranch);
      context.needs.reserve.result = 'failure';
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

  const issue = workflowContext({ branch: 'issue/64-main-github-flow', results: { reserve: 'success' } });
  assert.equal(evaluateJobCondition(condition, issue, []), true);
  assert.equal(evaluateJobCondition(jobCondition(publisher, 'worker-development'), issue, []), true);
  assert.equal(evaluateJobCondition(jobCondition(publisher, 'worker-production'), issue, []), false);
  for (const overrides of [{ event: 'push' }, { publish: false }, { repository: 'other/fork' }, { ref: 'refs/tags/issue/64-main-github-flow' }]) {
    assert.equal(evaluateJobCondition(condition, workflowContext({ branch: 'issue/64-main-github-flow', ...overrides }), []), false);
  }
  const legacy = read('.github/workflows/deploy.yml');
  assert.match(legacy, /group: pages-publication[\s\S]*?cancel-in-progress: false/);
  assert.match(legacy, /if: \$\{\{ vars\.DUAL_PAGES_ENABLED != 'true' \}\}/);
  assert.match(legacy, /deploy_to_production:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(legacy, /needs\.detect-changes\.outputs\.deploy_required == 'true'[\s\S]*?needs\.verify\.result == 'success'[\s\S]*?needs\.browser-ui\.result == 'success'[\s\S]*?needs\.browser-ui-matrix-audit\.result == 'success'[\s\S]*?needs\.release-freshness\.result == 'success'[\s\S]*?inputs\.deploy_to_production == true/);
  const reserve = jobCondition(publisher, 'reserve');
  for (const branch of ['main', 'develop']) {
    assert.equal(evaluateJobCondition(reserve, workflowContext({ branch }), []), false);
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
  assert.match(jobCondition(workflow, 'verify'), /!cancelled\(\)/);
  assert.match(jobCondition(workflow, 'verify'), /run_full_suite != 'false'/);
  for (const name of ['browser-ui', 'isolation-browser', 'local-online']) {
    const condition = jobCondition(workflow, name);
    assert.match(jobSection(workflow, name), /^    needs: verify$/m);
    assert.match(condition, /needs\.verify\.result == 'success'/);
  }
  assert.match(jobCondition(workflow, 'audit'), /always\(\)/);
  assert.match(jobSection(workflow, 'docs-check'), /git diff --check/);
  const audit = jobSection(workflow, 'audit');
  assert.match(audit, /Fail closed when classification is unavailable/);
  const docsAudit = audit.match(/- name: Confirm intentional docs-only skips[\s\S]*?run: \|\n((?: {10}[^\n]*\n)+)/)?.[1];
  assert.ok(docsAudit, 'docs-only audit must execute the skip checks');
  const expectedResults = {
    CLASSIFY_RESULT: 'success', DOCS_RESULT: 'success', VERIFY_RESULT: 'skipped',
    BROWSER_UI_RESULT: 'skipped', ISOLATION_RESULT: 'skipped', LOCAL_ONLINE_RESULT: 'skipped',
  };
  const runDocsAudit = results => spawnSync('bash', ['-c', docsAudit], {
    env: { ...process.env, GITHUB_STEP_SUMMARY: '/dev/null', ...results },
  }).status;
  assert.equal(runDocsAudit(expectedResults), 0);
  for (const [name, expected] of Object.entries(expectedResults)) {
    const unexpected = expected === 'skipped' ? 'success' : 'failure';
    assert.equal(runDocsAudit({ ...expectedResults, [name]: unexpected }), 1, name);
  }

  const cases = [
    { name: 'AGENTS.md only', files: ['AGENTS.md'], full: false },
    { name: 'ordinary Markdown only', files: ['docs/ci.md'], full: false },
    { name: 'game source', files: ['src/main.ts'], full: true },
    { name: 'Worker source', files: ['worker/development.ts'], full: true },
    { name: 'PWA assets', files: ['public/sw.js'], full: true },
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
    const verifyResult = scenario.full ? 'success' : 'skipped';
    context.needs.verify.result = verifyResult;
    for (const name of ['browser-ui', 'isolation-browser', 'local-online']) {
      assert.equal(evaluateJobCondition(jobCondition(workflow, name), context, [verifyResult]),
        scenario.full, `${scenario.name}: ${name}`);
    }
    const expectedPublish = evaluateJobCondition(jobCondition(workflow, 'publish'), context,
      ['success', 'success', scenario.full ? 'success' : 'skipped', scenario.full ? 'success' : 'skipped',
        scenario.full ? 'success' : 'skipped', scenario.full ? 'success' : 'skipped', 'success']);
    assert.equal(expectedPublish, false, `${scenario.name}: push must never publish`);
  }

  const failedClassifier = workflowContext({
    event: 'push', fullSuite: '', results: { 'classify-changes': 'failure' },
  });
  assert.equal(evaluateJobCondition(jobCondition(workflow, 'verify'), failedClassifier, ['failure']), true);
  for (const name of ['browser-ui', 'isolation-browser', 'local-online']) {
    assert.equal(evaluateJobCondition(jobCondition(workflow, name), failedClassifier, ['success']), true);
  }
  assert.equal(evaluateJobCondition(jobCondition(workflow, 'publish'), failedClassifier, ['failure']), false);

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

test('Issue publish requires full push CI and keeps live E2E and special reservation audit out of publication', () => {
  const jobs = [
    'classify-changes', 'docs-check', 'verify', 'local-online', 'audit',
    'isolation-browser (chromium)', 'isolation-browser (webkit)',
    'browser-ui / browser-ui (chromium, group 1)', 'browser-ui / browser-ui (chromium, group 2)',
    'browser-ui / browser-ui (webkit, group 1)', 'browser-ui / browser-ui (webkit, group 2)',
  ].map(name => ({ name, conclusion: 'success' }));
  assert(hasRequiredIssueJobs({ jobs }));
  assert(!hasRequiredIssueJobs({ jobs: jobs.slice(0, -1) }));
  assert(!hasRequiredIssueJobs({ jobs: [...jobs, jobs[0]] }));
  assert(!hasRequiredIssueJobs({ jobs: [{ ...jobs[0], conclusion: 'skipped' }, ...jobs.slice(1)] }));

  const publisher = read('.github/workflows/publish-environments.yml');
  const reserve = jobSection(publisher, 'reserve');
  assert(reserve.indexOf('check-issue-publication-ci.mjs') < reserve.indexOf('publication-reservation.mjs prepare'));
  assert.match(reserve, /push --atomic origin HEAD:pages-verified.*refs\/tags\/verified\/development/);
  const pages = jobSection(publisher, 'publish');
  assert(pages.indexOf('actions/deploy-pages') < pages.indexOf('check-issue-publication-site.mjs bytes'));
  assert(pages.indexOf('check-issue-publication-site.mjs bytes') < pages.indexOf('artifacts.mjs finalize'));
  const e2e = read('.github/workflows/live-development-e2e.yml');
  assert.doesNotMatch(e2e, /^  (push|workflow_call|pull_request):|secrets\./m);
  assert.match(e2e, /inputs\.run_live_e2e == true/);
  assert.doesNotMatch(read('.github/workflows/issue47-phase6a-live-audit.yml'), /44839474104|secrets\./);
});

test('main reuse deliberately skips the repeated suite but requires successful read-only source validation', () => {
  const caller = read('.github/workflows/environments.yml');
  const publisher = read('.github/workflows/publish-environments.yml');
  const heavy = ['verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit'];
  const results = Object.fromEntries(heavy.map(job => [job, 'skipped']));
  const context = workflowContext({ branch: 'main', reuse: 'true', productionValidation: 'reuse', results });
  assert.equal(evaluateJobCondition(jobCondition(caller, 'publish'), context, Object.values(results)), true);
  assert.equal(evaluateJobCondition(jobCondition(caller, 'verify'), context, ['success']), false);
  assert.equal(evaluateJobCondition(jobCondition(caller, 'audit'), context, ['skipped']), false);
  assert.equal(evaluateJobCondition(jobCondition(caller, 'publish'),
    workflowContext({ branch: 'main', productionValidation: 'reuse' }), []), false);
  const source = jobSection(publisher, 'verify-production-source');
  assert.match(source, /permissions:\s*contents: read\s*actions: read/);
  assert.doesNotMatch(source, /secrets\.|: write/);
  for (const reuseProduction of [true, false]) {
    for (const result of ['success', 'failure', 'skipped', 'cancelled']) {
      const release = workflowContext({ branch: 'main', reuseProduction, results: { 'verify-production-source': result } });
      assert.equal(evaluateJobCondition(jobCondition(publisher, 'reserve'), release, ['success', result]),
        false);
    }
  }
  const audit = jobSection(publisher, 'audit-production');
  assert.match(audit, /needs: publish/);
  assert.match(audit, /contents: read\s*deployments: read/);
  assert.doesNotMatch(audit, /secrets\.|: write/);
});

test('only production reuse validates the selected Worker settings', () => {
  const caller = read('.github/workflows/environments.yml');
  const publisher = read('.github/workflows/publish-environments.yml');
  const source = jobSection(publisher, 'verify-production-source');
  assert.doesNotMatch(source, /DEVELOPMENT_WORKER_URL/);
  assert.match(source, /validate-publication-settings\.mjs production-reuse/);
  assert.match(jobSection(caller, 'verify'), /validate-publication-settings\.mjs\s*\n/);

  const env = {
    PRODUCTION_WORKER_URL: 'https://heibon-mahjong-online.ak-sekine.workers.dev',
    DEVELOPMENT_WORKER_URL: 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev',
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  };
  const validate = (args, overrides = {}) => spawnSync(process.execPath,
    ['.github/scripts/validate-publication-settings.mjs', ...args], {
      env: { ...env, ...overrides }, encoding: 'utf8',
    });
  assert.equal(validate([]).status, 0);
  for (const development of [undefined, 'https://wrong.invalid']) {
    assert.equal(validate(['production-reuse'], { DEVELOPMENT_WORKER_URL: development }).status, 0);
    assert.match(validate([], { DEVELOPMENT_WORKER_URL: development }).stderr, /Invalid development Worker URL/);
  }
  assert.match(validate(['production-reuse'], { PRODUCTION_WORKER_URL: 'invalid' }).stderr, /Invalid production Worker URL/);
  assert.match(validate(['production-reuse'], { CLOUDFLARE_ACCOUNT_ID: 'invalid' }).stderr, /account ID/);
  assert.match(validate(['unknown']).stderr, /Unknown publication settings mode/);
});

test('production continuation runs only downstream of the successful Worker and online checks', () => {
  const publisher = read('.github/workflows/publish-environments.yml');
  const continuation = /github\.ref == 'refs\/heads\/main' && 'check-production-continuation' \|\| 'check'/;
  for (const job of ['online', 'publish']) assert.match(jobSection(publisher, job), continuation);
  for (const job of ['reserve', 'worker-production', 'worker-development']) {
    assert.doesNotMatch(jobSection(publisher, job), /check-production-continuation/);
  }
  const pages = jobSection(publisher, 'publish');
  assert.match(pages, /needs: \[reserve, online\]/);
  assert.match(pages, /PAGES_OUTCOME: .*steps\.deploy\.outcome/);
  assert.match(pages, /FINALIZE_OUTCOME: .*steps\.finalize\.outcome/);
  for (const result of ['success', 'failure', 'skipped', 'cancelled']) {
    for (const canceled of [false, true]) {
      const results = { reserve: 'success', 'worker-production': result, 'worker-development': 'skipped', online: result };
      const context = workflowContext({ branch: 'main', canceled, results });
      for (const job of ['online', 'publish']) {
        assert.equal(evaluateJobCondition(jobCondition(publisher, job), context, Object.values(results)),
          result === 'success' && !canceled, `${job}, ${result}, ${canceled}`);
      }
    }
  }
});

test('production audit runs after successful Pages publication despite an intentionally skipped Worker', () => {
  const publisher = read('.github/workflows/publish-environments.yml');
  const condition = jobCondition(publisher, 'audit-production');
  const cases = [
    { name: 'production success', publishResult: 'success', expected: true },
    { name: 'Pages or ledger finalization failed', publishResult: 'failure' },
    { name: 'Pages job cancelled', publishResult: 'cancelled' },
    { name: 'Pages job skipped', publishResult: 'skipped' },
    { name: 'workflow cancelled after publication', publishResult: 'success', canceled: true },
    { name: 'develop publication', branch: 'develop', publishResult: 'success' },
    { name: 'Issue branch publication', branch: 'issue/62-audit', publishResult: 'success' },
  ];
  for (const { name, publishResult, expected = false, branch = 'main', canceled = false } of cases) {
    const production = branch === 'main';
    const results = {
      'worker-production': production ? 'success' : 'skipped',
      'worker-development': production ? 'skipped' : 'success',
      reserve: 'success',
      online: 'success',
      publish: publishResult,
    };
    const context = workflowContext({ branch, canceled, results });
    assert.equal(evaluateJobCondition(condition, context, Object.values(results)), expected, name);
  }
});

test('selected Worker requires a successful reservation and tolerates an intentionally skipped source check', () => {
  const publisher = read('.github/workflows/publish-environments.yml');
  const cases = [
    { name: 'production full', expected: 'worker-production' },
    { name: 'production reuse', reuseProduction: true, source: 'success', expected: 'worker-production' },
    { name: 'development Issue', branch: 'issue/62-candidate', expected: 'worker-development' },
    { name: 'develop ref', branch: 'develop', expected: 'worker-development' },
    { name: 'invalid ref', branch: 'feature/other' },
    { name: 'untrusted Issue ref', branch: 'issue/62-candidate', repository: 'other/repo' },
    { name: 'push', event: 'push' },
    { name: 'publication disabled', dualPages: 'false' },
    { name: 'workflow cancelled', canceled: true },
  ];
  for (const { name, expected, source = 'skipped', ...options } of cases) {
    for (const reserve of ['success', 'failure', 'skipped', 'cancelled']) {
      const context = workflowContext({ branch: 'main', ...options, results: { reserve } });
      for (const worker of ['worker-production', 'worker-development']) {
        assert.equal(evaluateJobCondition(jobCondition(publisher, worker), context, ['success', source, reserve]),
          reserve === 'success' && worker === expected, `${name}, ${reserve}, ${worker}`);
      }
    }
  }
});

test('a reserved publication fails closed if Pages or the required production audit does not complete', () => {
  const publisher = read('.github/workflows/publish-environments.yml');
  const completion = jobSection(publisher, 'check-publication-completion');
  assert.match(completion, /needs: \[reserve, publish, audit-production\]/);
  assert.match(completion, /permissions: \{\}/);
  assert.match(completion, /^        run: exit 1$/m);
  const condition = jobCondition(publisher, 'check-publication-completion');
  for (const branch of ['main', 'issue/62-candidate']) {
    for (const publish of ['success', 'failure', 'skipped', 'cancelled']) {
      for (const audit of ['success', 'failure', 'skipped', 'cancelled']) {
        const results = { reserve: 'success', publish, 'audit-production': audit };
        const context = workflowContext({ branch, results });
        assert.equal(evaluateJobCondition(condition, context, Object.values(results)),
          publish !== 'success' || (branch === 'main' && audit !== 'success'), `${branch}, ${publish}, ${audit}`);
      }
    }
  }
  for (const options of [{ results: { reserve: 'skipped' } }, { canceled: true, results: { reserve: 'success' } }]) {
    const results = { publish: 'skipped', 'audit-production': 'skipped', ...options.results };
    assert.equal(evaluateJobCondition(condition, workflowContext({ branch: 'main', ...options, results }),
      Object.values(results)), false);
  }
});

test('independent Worker job is manual, branch scoped, requires credentials and skips the combined reserve', () => {
  const publisher = read('.github/workflows/publish-environments.yml');
  const worker = jobCondition(publisher, 'worker-only');
  const reserve = jobCondition(publisher, 'reserve');
  for (const branch of ['main', 'issue/69-test']) {
    const context = workflowContext({ branch, publicationTarget: 'worker' });
    assert.equal(evaluateJobCondition(worker, context, ['success', 'skipped']), true);
    assert.equal(evaluateJobCondition(reserve, context, ['success', 'skipped']), false);
    context.needs['worker-credentials'].result = 'failure';
    assert.equal(evaluateJobCondition(worker, context, ['failure', 'skipped']), false);
  }
  for (const opts of [{ branch: 'develop' }, { event: 'push' }, { dualPages: 'false' }, { canceled: true }, { reuseProduction: true }]) {
    assert.equal(evaluateJobCondition(worker, workflowContext({ publicationTarget: 'worker', ...opts }), ['success', 'skipped']), false);
  }
  const body = jobSection(publisher, 'worker-only');
  assert.match(body, /deployments: write/);
  assert.match(body, /environment:.*worker-production.*worker-development/);
  assert.match(body, /check-issue-publication-ci\.mjs/);
  assert.match(body, /test:online:production/);
  assert.match(jobSection(publisher, 'reserve'), /Independent Worker records exist/);
});

test('worker-only caller requires every same-run CI gate and never enables production reuse', () => {
  const workflow = read('.github/workflows/environments.yml');
  const condition = jobCondition(workflow, 'publish');
  for (const branch of ['main', 'issue/69-test']) {
    const options = { branch, publicationTarget: 'worker', productionValidation: 'reuse' };
    assert.equal(evaluateJobCondition(condition, workflowContext(options), []), true);
    for (const gate of ['classify-changes', 'docs-check', 'verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit']) {
      assert.equal(evaluateJobCondition(condition, workflowContext({ ...options, results: { [gate]: 'failure' } }), []), false, gate);
    }
    assert.equal(evaluateJobCondition(condition, workflowContext({ ...options, publish: false }), []), false);
  }
  assert.match(jobSection(workflow, 'classify-changes'), /inputs\.publication_target != 'worker'/);
  const old = read('.github/workflows/deploy.yml');
  assert.match(old, /group: pages-publication/);
  assert.match(jobSection(old, 'release-freshness'), /heibon-independent-worker-production/);
});

test('Pages-only route skips Worker credentials and reservation and preserves full or reused CI gates', () => {
  const caller = read('.github/workflows/environments.yml');
  const publisher = read('.github/workflows/publish-environments.yml');
  const condition = jobCondition(publisher, 'pages-only');
  for (const branch of ['main', 'issue/69-test']) {
    const context = workflowContext({ branch, publicationTarget: 'pages', results: { 'worker-credentials': 'skipped' } });
    assert.equal(evaluateJobCondition(condition, context, ['skipped', 'skipped']), true);
    assert.equal(evaluateJobCondition(jobCondition(publisher, 'worker-credentials'), context, []), false);
    assert.equal(evaluateJobCondition(jobCondition(publisher, 'reserve'), context, []), false);
    assert.equal(evaluateJobCondition(jobCondition(publisher, 'worker-only'), context, []), false);
    const gate = jobCondition(caller, 'publish');
    for (const required of ['verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit']) {
      assert.equal(evaluateJobCondition(gate, workflowContext({ branch, publicationTarget: 'pages', results: { [required]: 'failure' } }), []), false, required);
    }
  }
  const reused = workflowContext({ branch: 'main', publicationTarget: 'pages', reuseProduction: true, results: { 'worker-credentials': 'skipped', 'verify-production-source': 'success' } });
  assert.equal(evaluateJobCondition(jobCondition(publisher, 'verify-production-source'), reused, ['skipped']), true);
  assert.equal(evaluateJobCondition(condition, reused, ['skipped', 'success']), true);
  const body = jobSection(publisher, 'pages-only');
  assert.match(body, /pages-independent\.mjs prepare/);
  assert.match(body, /pages-independent\.mjs verify-staged/);
  assert.match(body, /PAGES_OUTCOME/);
  assert.match(body, /test:online:production/);
  assert.doesNotMatch(body, /wrangler|CLOUDFLARE_.*TOKEN|worker-independent\.mjs|deploy-isolated-worker/);
  assert.match(jobSection(publisher, 'pages-only-audit'), /pages-independent\.mjs audit/);
  assert.match(publisher, /group: pages-publication/);
});

test('auto and explicit targets select independent jobs and fail closed on unknown planning', () => {
  const wf = read('.github/workflows/publish-environments.yml');
  const pages = jobCondition(wf, 'pages-only'), worker = jobCondition(wf, 'worker-only'), noOp = jobCondition(wf, 'no-publication');
  for (const [target, page, work] of [['pages', true, false], ['worker', false, true], ['both', true, true], ['none', false, false]]) {
    const result = target === 'pages' || target === 'none' ? 'skipped' : 'success';
    const context = workflowContext({ branch: 'main', publicationTarget: target, results: { 'worker-credentials': result } });
    assert.equal(evaluateJobCondition(pages, context, []), page, target);
    assert.equal(evaluateJobCondition(worker, context, []), work, target);
    assert.equal(evaluateJobCondition(noOp, context, []), target === 'none', target);
  }
  for (const [label, page, work] of [['pages', true, false], ['worker', false, true], ['both', true, true], ['none', false, false]]) {
    const context = workflowContext({ branch: 'main', publicationTarget: 'auto', autoPages: String(page), autoWorker: String(work), autoClassification: label, results: { 'plan-auto': 'success' } });
    assert.equal(evaluateJobCondition(pages, context, []), page, label);
    assert.equal(evaluateJobCondition(worker, context, []), work, label);
    assert.equal(evaluateJobCondition(noOp, context, []), label === 'none', label);
    context.needs['plan-auto'].result = 'failure';
    assert.equal(evaluateJobCondition(pages, context, []), false);
    assert.equal(evaluateJobCondition(worker, context, []), false);
    assert.equal(evaluateJobCondition(noOp, context, []), false);
    assert.equal(evaluateJobCondition(jobCondition(wf, 'check-auto-completion'), context, []), true);
  }
  assert.match(jobSection(wf, 'plan-auto'), /deployment: false/);
  assert.match(jobSection(wf, 'reserve'), /false &&/);
  assert.match(jobSection(read('.github/workflows/deploy.yml'), 'release-freshness'), /retired[\s\S]*exit 1/);
  assert.match(jobSection(wf, 'pages-only'), /Verify uploaded Pages artifact via the deploy-pages lookup\s+timeout-minutes: 3\s+uses:/);
  assert.match(read('.github/workflows/environments.yml'), /itch-html5-\$\{\{ github.sha \}\}/);
});

test('confirmed Pages recovery records only and verifies the source run before mutation', () => {
  const workflow = read('.github/workflows/pages-reconcile.yml');
  const job = jobSection(workflow, 'finalize-confirmed-pages');
  assert.match(workflow, /group: pages-publication/);
  assert.match(job, /environment:\s*name: github-pages\s*deployment: false/);
  assert.match(job, /pages-independent-recovery\.mjs store previous/);
  assert(job.indexOf('pages-independent-recovery.mjs store previous') < job.indexOf('artifacts.mjs finalize store'));
  assert(job.indexOf('git/ref/heads/pages-verified') < job.indexOf('artifacts.mjs finalize store'));
  assert.doesNotMatch(job, /actions\/deploy-pages|wrangler|worker-independent/);
  assert.doesNotMatch(job, /push\s+--force|push\s+-f/);
});

test('partial both outcomes remain separate and failures are not masked by skipped jobs', () => {
  const wf = read('.github/workflows/publish-environments.yml');
  const pagesCheck = jobCondition(wf, 'check-pages-only-completion');
  const workerCheck = jobCondition(wf, 'check-worker-only-completion');
  for (const [pages, audit, worker, pagesFail, workerFail] of [
    ['failure', 'skipped', 'success', true, false],
    ['success', 'success', 'failure', false, true],
    ['success', 'success', 'success', false, false],
    ['skipped', 'skipped', 'success', true, false],
  ]) {
    const context = workflowContext({ branch: 'main', publicationTarget: 'both', results: { 'pages-only': pages, 'pages-only-audit': audit, 'worker-only': worker } });
    assert.equal(evaluateJobCondition(pagesCheck, context, []), pagesFail);
    assert.equal(evaluateJobCondition(workerCheck, context, []), workerFail);
  }
  assert.match(jobSection(wf, 'publication-summary'), /PAGES_RESULT[\s\S]*WORKER_RESULT/);
});
