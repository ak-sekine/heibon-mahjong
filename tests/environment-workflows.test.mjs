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
function workflowContext({ branch = 'develop', repository = 'ak-sekine/heibon-mahjong', ref = `refs/heads/${branch}`, event = 'workflow_dispatch', publish = true, dualPages = 'true', canceled = false, results = {}, fullSuite = 'true', reuse = 'false', reuseProduction = false, productionValidation = 'full', publicationTarget = 'both', pagesResume = false, firstWorker = false, autoPages = 'false', autoWorker = 'false', autoClassification = 'none' } = {}) {
  const jobResults = {
    'classify-changes': 'success', 'docs-check': 'success', verify: 'success', 'browser-ui': 'success', 'isolation-browser': 'success',
    'local-online': 'success', audit: 'success', 'worker-credentials': 'success', 'verify-production-source': 'skipped', 'plan-auto': 'skipped', 'resume-preflight': 'skipped', 'validate-worker-first-publication': firstWorker ? 'success' : 'skipped', ...results,
  };
  return {
    github: { ref, event_name: event, repository },
    startsWith: (value, prefix) => value.startsWith(prefix),
    inputs: { publish, reuse_production: reuseProduction, production_validation: productionValidation, publication_target: publicationTarget, pages_resume: pagesResume, worker_first_publication: firstWorker },
    vars: { DUAL_PAGES_ENABLED: dualPages },
    needs: Object.fromEntries(Object.entries(jobResults).map(([name, result]) => [name, {
      result,
      outputs: name === 'classify-changes' ? { run_full_suite: fullSuite, reuse, resume: String(pagesResume && publicationTarget === 'pages' && publish && event === 'workflow_dispatch') } : name === 'plan-auto' ? { pages: autoPages, worker: autoWorker, classification: autoClassification } : {},
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

test('independent Worker job is manual, branch scoped, requires credentials and skips the combined reserve', () => {
  const publisher = read('.github/workflows/publish-environments.yml');
  const worker = jobCondition(publisher, 'worker-only');
  for (const branch of ['main', 'issue/69-test']) {
    const context = workflowContext({ branch, publicationTarget: 'worker' });
    assert.equal(evaluateJobCondition(worker, context, ['success', 'skipped']), true);
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
  assert.doesNotMatch(publisher, /^  reserve:/m);
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

test('first Worker publication requires a successful input gate and never selects Pages', () => {
  const caller = read('.github/workflows/environments.yml');
  const publisher = read('.github/workflows/publish-environments.yml');
  const gate = jobSection(caller, 'validate-worker-first-publication');
  const script = gate.match(/run: \|\n((?: {10}[^\n]*\n)+)/)?.[1];
  assert.ok(script);
  const runGate = overrides => spawnSync('bash', ['-c', script], { env: { FIRST:'true', PUBLISH:'true', TARGET:'worker', VERSION:'11111111-1111-4111-8111-111111111111', ...overrides } }).status;
  assert.equal(runGate({}), 0);
  for (const overrides of [{FIRST:'false'}, {PUBLISH:'false'}, {TARGET:'pages'}, {TARGET:'both'}, {TARGET:'auto'}, {TARGET:'none'}, {VERSION:'invalid'}]) assert.notEqual(runGate(overrides), 0);
  const opts = { branch:'issue/69-test', publicationTarget:'worker', firstWorker:true };
  assert.equal(evaluateJobCondition(jobCondition(caller, 'publish'), workflowContext(opts), []), true);
  assert.equal(evaluateJobCondition(jobCondition(caller, 'publish'), workflowContext({ ...opts, results:{ 'validate-worker-first-publication':'failure' } }), []), false);
  assert.equal(evaluateJobCondition(jobCondition(publisher, 'pages-only'), workflowContext({ ...opts, publicationTarget:'both' }), []), false);
  assert.equal(evaluateJobCondition(jobCondition(publisher, 'worker-only'), workflowContext(opts), []), true);
  for (const publicationTarget of ['pages','both','auto','none']) assert.equal(evaluateJobCondition(jobCondition(publisher, 'worker-only'), workflowContext({ ...opts, publicationTarget }), []), false);
  const job = jobSection(publisher, 'worker-only');
  assert.match(job, /WORKER_FIRST_PUBLICATION:/); assert.match(job, /EXPECTED_CURRENT_WORKER_VERSION:/);
  assert.doesNotMatch(job, /pages-verified|deploy-pages|upload-pages-artifact/);
});

test('Pages-only route skips Worker credentials and reservation and preserves full or reused CI gates', () => {
  const caller = read('.github/workflows/environments.yml');
  const publisher = read('.github/workflows/publish-environments.yml');
  const condition = jobCondition(publisher, 'pages-only');
  for (const branch of ['main', 'issue/69-test']) {
    const context = workflowContext({ branch, publicationTarget: 'pages', results: { 'worker-credentials': 'skipped' } });
    assert.equal(evaluateJobCondition(condition, context, ['skipped', 'skipped']), true);
    assert.equal(evaluateJobCondition(jobCondition(publisher, 'worker-credentials'), context, []), false);
    assert.doesNotMatch(publisher, /^  reserve:/m);
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
  assert.doesNotMatch(wf, /^  (reserve|worker-production|worker-development|online|publish|audit-production|check-publication-completion):/m);
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

test('independent publication preserves CI, Issue identity, target isolation and Pages finalization gates', () => {
  const caller = read('.github/workflows/environments.yml');
  const publisher = read('.github/workflows/publish-environments.yml');
  const jobNames = ['classify-changes', 'docs-check', 'verify', 'local-online', 'audit',
    'isolation-browser (chromium)', 'isolation-browser (webkit)',
    'browser-ui / browser-ui (chromium, group 1)', 'browser-ui / browser-ui (chromium, group 2)',
    'browser-ui / browser-ui (webkit, group 1)', 'browser-ui / browser-ui (webkit, group 2)'];
  const jobs = jobNames.map(name => ({ name, conclusion: 'success' }));
  assert(hasRequiredIssueJobs({ jobs }));
  assert(!hasRequiredIssueJobs({ jobs: jobs.slice(1) }));
  assert(!hasRequiredIssueJobs({ jobs: [...jobs, jobs[0]] }));
  assert(!hasRequiredIssueJobs({ jobs: [{ ...jobs[0], conclusion: 'failure' }, ...jobs.slice(1)] }));
  const gate = jobCondition(caller, 'publish');
  for (const branch of ['main', 'issue/69-test']) for (const target of ['pages', 'worker', 'both', 'auto']) {
    const options = { branch, publicationTarget: target };
    assert.equal(evaluateJobCondition(gate, workflowContext(options), []), true);
    for (const required of ['classify-changes', 'docs-check', 'verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit']) {
      assert.equal(evaluateJobCondition(gate, workflowContext({ ...options, results: { [required]: 'failure' } }), []), false, `${target} ${required}`);
    }
    assert.equal(evaluateJobCondition(gate, workflowContext({ ...options, publish: false }), []), false);
  }
  const page = jobSection(publisher, 'pages-only');
  assert(page.indexOf('check-issue-publication-ci.mjs') < page.indexOf('pages-independent.mjs prepare'));
  assert(page.indexOf('pages-independent.mjs prepare') < page.indexOf('git -C store push origin HEAD:pages-verified'));
  assert(page.indexOf('pages-independent.mjs check store') < page.indexOf('actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e'));
  assert(page.indexOf('pages-independent.mjs verify-staged') < page.indexOf('artifacts.mjs finalize'));
  assert.match(page, /push --atomic origin HEAD:pages-verified.*refs\/tags\/verified\/development/);
  assert.match(jobSection(publisher, 'pages-only-audit'), /contents: read\s*deployments: read/);
  assert.match(publisher, /^concurrency:\n  group: pages-publication\n  cancel-in-progress: false\njobs:/m);
  assert.doesNotMatch(publisher, /^  (reserve|worker-production|worker-development|online|publish|audit-production|check-publication-completion):/m);
  const old = jobSection(read('.github/workflows/deploy.yml'), 'release-freshness');
  assert.match(old, /retired[\s\S]*exit 1/);
});

test('Pages resume uses the same publication job only after preflight and skips new full CI', () => {
  const caller = read('.github/workflows/environments.yml'), publisher = read('.github/workflows/publish-environments.yml');
  const heavy = ['verify', 'browser-ui', 'isolation-browser', 'local-online', 'audit'];
  const skipped = Object.fromEntries(heavy.map(job => [job, 'skipped']));
  for (const branch of ['main', 'issue/69-test']) {
    const callerContext = workflowContext({ branch, pagesResume: true, publicationTarget: 'pages', results: skipped });
    assert.equal(evaluateJobCondition(jobCondition(caller, 'publish'), callerContext, Object.values(skipped)), true);
    assert.equal(evaluateJobCondition(jobCondition(caller, 'verify'), callerContext, ['success']), false);
    assert.equal(evaluateJobCondition(jobCondition(caller, 'audit'), callerContext, ['success']), false);
    const pageContext = workflowContext({ branch, pagesResume: true, publicationTarget: 'pages', results: { 'worker-credentials': 'skipped', 'resume-preflight': 'success' } });
    assert.equal(evaluateJobCondition(jobCondition(publisher, 'pages-only'), pageContext, []), true);
    pageContext.needs['resume-preflight'].result = 'failure';
    assert.equal(evaluateJobCondition(jobCondition(publisher, 'pages-only'), pageContext, []), false);
    assert.equal(evaluateJobCondition(jobCondition(publisher, 'check-resume-completion'), pageContext, []), true);
    assert.equal(evaluateJobCondition(jobCondition(publisher, 'worker-only'), pageContext, []), false);
  }
  const job = jobSection(publisher, 'resume-preflight');
  assert(job.indexOf('pages-resume-preflight.mjs') < job.indexOf('git -C store revert --no-commit'));
  assert(job.indexOf('git -C store revert --no-commit') < job.indexOf('pages-resume-artifact.mjs'));
  assert.match(job, /git -C store diff --exit-code/);
  assert.doesNotMatch(job, /wrangler|deploy-pages|--force/);
  assert.match(jobSection(publisher, 'pages-only'), /needs.resume-preflight.outputs.evidence/);
});
