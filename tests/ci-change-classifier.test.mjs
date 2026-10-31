import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { classifyChanges, decideDeployment } from '../.github/scripts/classify-changes.mjs';

const deployWorkflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const browserWorkflow = readFileSync(new URL('../.github/workflows/browser-ui.yml', import.meta.url), 'utf8');
const deploymentStateScript = readFileSync(new URL('../.github/scripts/deployment-state.mjs', import.meta.url), 'utf8');

function jobBlock(workflow, jobName) {
  const start = workflow.indexOf(`  ${jobName}:\n`);
  assert.notEqual(start, -1, `missing job ${jobName}`);
  const next = workflow.slice(start + 1).search(/^  [a-z0-9-]+:\s*$/m);
  return workflow.slice(start, next === -1 ? undefined : start + 1 + next);
}

function jobCondition(workflow, jobName) {
  const lines = jobBlock(workflow, jobName).split('\n');
  const start = lines.findIndex((line) => /^    if:/.test(line));
  assert.notEqual(start, -1, `missing condition for ${jobName}`);
  const condition = [lines[start].replace(/^    if:\s*/, '')];
  for (let index = start + 1; index < lines.length && /^      /.test(lines[index]); index += 1) {
    condition.push(lines[index].trim());
  }
  return condition.join(' ').replace(/^>-\s*/, '').replace(/\$\{\{|\}\}/g, '').trim();
}

// Evaluate the small expression subset used by the production gates. The input
// is the condition extracted from the workflow itself, so edits to those
// conditions are evaluated instead of mirrored in a test-only predicate.
function evaluateActionsCondition(source, context) {
  const tokens = source.match(/\s*(\&\&|\|\||==|!=|!|\(|\)|[A-Za-z_][A-Za-z0-9_.-]*|'[^']*'|"[^"]*")/g)
    ?.map((token) => token.trim()) ?? [];
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const valueAt = (path) => path.split('.').reduce((value, key) => value?.[key], context);

  function primary() {
    if (peek() === '!') {
      take();
      return !Boolean(primary());
    }
    if (peek() === '(') {
      take();
      const value = logicalOr();
      assert.equal(take(), ')');
      return value;
    }
    const token = take();
    if (['always', 'success', 'failure', 'cancelled'].includes(token) && peek() === '(') {
      take();
      assert.equal(take(), ')');
      if (token === 'always' || token === 'success') return true;
      return false;
    }
    if (token?.startsWith("'")) return token.slice(1, -1);
    if (token?.startsWith('"')) return token.slice(1, -1);
    if (token === 'true') return true;
    if (token === 'false') return false;
    return valueAt(token);
  }

  function comparison() {
    let left = primary();
    while (peek() === '==' || peek() === '!=') {
      const operator = take();
      const right = primary();
      left = operator === '==' ? left === right : left !== right;
    }
    return left;
  }

  function logicalAnd() {
    let value = comparison();
    while (peek() === '&&') {
      take();
      const right = comparison();
      value = Boolean(value) && Boolean(right);
    }
    return value;
  }

  function logicalOr() {
    let value = logicalAnd();
    while (peek() === '||') {
      take();
      const right = logicalAnd();
      value = Boolean(value) || Boolean(right);
    }
    return value;
  }

  const result = Boolean(logicalOr());
  assert.equal(position, tokens.length, `unparsed Actions expression: ${source}`);
  return result;
}

test('markdown-only changes skip the application suite and deployment', () => {
  assert.deepEqual(classifyChanges(['docs/ci.md']), {
    run_full_suite: 'false', deploy_required: 'false', changed_count: '1', classification: 'docs-only',
  });
});

test('application plus markdown changes run all checks and remain deployable', () => {
  const result = classifyChanges(['src/app.ts', 'docs/ci.md']);
  assert.equal(result.run_full_suite, 'true');
  assert.equal(result.deploy_required, 'true');
});

test('renamed code detected as old and new paths does not look documentation-only', () => {
  const result = classifyChanges(['src/old.ts', 'docs/renamed.md']);
  assert.equal(result.run_full_suite, 'true');
  assert.equal(result.deploy_required, 'true');
});

test('test code and workflow changes run all checks without publishing the application', () => {
  for (const file of ['tests/example.test.ts', '.github/workflows/check.yml', 'package.json']) {
    const result = classifyChanges([file]);
    assert.equal(result.run_full_suite, 'true', file);
    assert.equal(result.deploy_required, 'false', file);
  }
});

test('unknown files fail safe by running all checks and allowing the release gate', () => {
  const result = classifyChanges(['new-unknown-config.bin']);
  assert.equal(result.run_full_suite, 'true');
  assert.equal(result.deploy_required, 'true');
});

test('missing or empty diffs fail safe', () => {
  for (const result of [classifyChanges([], true), classifyChanges([], false)]) {
    assert.equal(result.run_full_suite, 'true');
    assert.equal(result.deploy_required, 'true');
  }
});

test('production deployment requires successful full verification and Browser UI', () => {
  const workerJob = jobBlock(deployWorkflow, 'deploy-worker');
  const pagesJob = jobBlock(deployWorkflow, 'pages-deploy');
  const releaseFreshness = jobBlock(deployWorkflow, 'release-freshness');
  const pagesBuild = jobBlock(deployWorkflow, 'pages-build');
  const matrixAudit = jobBlock(deployWorkflow, 'browser-ui-matrix-audit');
  const pagesPermissions = pagesJob.split('    steps:')[0];
  assert.match(workerJob, /needs: \[detect-changes, verify, browser-ui, browser-ui-matrix-audit, release-freshness\]/);
  assert.match(releaseFreshness, /needs: \[detect-changes, verify, browser-ui, browser-ui-matrix-audit\]/);
  assert.match(releaseFreshness, /needs\.browser-ui-matrix-audit\.result == 'success'/);
  assert.match(matrixAudit, /needs: \[detect-changes, browser-ui\]/);
  assert.match(matrixAudit, /needs\.detect-changes\.outputs\.run_full_suite == 'true'/);
  assert.match(matrixAudit, /actions: read/);
  assert.match(matrixAudit, /uses: actions\/checkout@v4/);
  assert.match(matrixAudit, /RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(matrixAudit, /attempts\/\$RUN_ATTEMPT\/jobs/);
  assert.match(matrixAudit, /check-browser-ui-matrix\.mjs/);
  assert.match(deployWorkflow, /actions: read/);
  assert.match(deployWorkflow, /browser-ui-matrix-audit\.result == 'success'/);
  assert.match(pagesBuild, /needs: \[detect-changes, verify, browser-ui, browser-ui-matrix-audit, deploy-worker, production-test\]/);
  assert.match(pagesJob, /needs: pages-build/);
  assert.match(browserWorkflow, /fail-fast: false/);
  assert.doesNotMatch(jobBlock(browserWorkflow, 'browser-ui'), /continue-on-error:/);
  for (const jobName of ['release-freshness', 'deploy-worker', 'pages-build']) {
    assert.match(jobCondition(deployWorkflow, jobName), /always\(\)/, `${jobName} must evaluate after failed/cancelled needs`);
    assert.match(jobCondition(deployWorkflow, jobName), /needs\.browser-ui\.result == 'success'/, `${jobName} must require Browser UI success`);
    assert.match(jobCondition(deployWorkflow, jobName), /needs\.browser-ui-matrix-audit\.result == 'success'/, `${jobName} must require every engine leg`);
    assert.match(jobCondition(deployWorkflow, jobName), /needs\.verify\.result == 'success'/, `${jobName} must require verification success`);
  }
  assert.match(jobCondition(deployWorkflow, 'release-freshness'), /needs\.detect-changes\.outputs\.deploy_required == 'true'/);
  assert.match(jobCondition(deployWorkflow, 'deploy-worker'), /needs\.release-freshness\.result == 'success'/);
  assert.match(jobCondition(deployWorkflow, 'pages-build'), /needs\.deploy-worker\.result == 'success'/);
  assert.match(jobCondition(deployWorkflow, 'pages-build'), /needs\.production-test\.result == 'success'/);
  assert.match(pagesJob, /uses: actions\/checkout@v4[\s\S]*Record successful GitHub Pages deployment SHA/);
  assert.match(pagesPermissions, /contents: read/);
  assert.match(deployWorkflow, /deploy_to_production:\n[\s\S]*default: false/);
  assert.doesNotMatch(deployWorkflow, /paths-ignore:/);
  assert.doesNotMatch(browserWorkflow, /paths-ignore:/);
  assert.doesNotMatch(deployWorkflow, /test:file|test:browser/);
});

test('Browser UI engine matrix keeps scenarios independent and avoids duplicate test/build work', () => {
  const buildJob = browserWorkflow.match(/  verify-build:\n([\s\S]*?)\n  browser-ui:/)?.[1] ?? '';
  const browserJob = browserWorkflow.match(/  browser-ui:\n([\s\S]*)$/)?.[1] ?? '';
  assert.match(browserJob, /fail-fast: false/);
  assert.match(browserJob, /max-parallel: 2/);
  assert.match(browserJob, /browser: \[chromium, webkit\]/);
  assert.match(browserJob, /run-browser-regressions\.py --browser/);
  assert.match(browserJob, /playwright install --with-deps "\$\{\{ matrix\.browser \}\}"/);
  assert.match(browserJob, /if-no-files-found: error/);
  assert.doesNotMatch(browserJob, /run: npm test|run: npm run build/);
  assert.match(buildJob, /run: npm test/);
  assert.match(buildJob, /run: npm run build/);
  assert.match(buildJob, /if-no-files-found: error/);

  const resultArtifactNames = [...browserJob.matchAll(/^\s+name: (.+)$/gm)]
    .map((match) => match[1])
    .filter((name) => /browser-ui-|center-round-display-|river-spacing-diagnostics-/.test(name));
  assert.equal(resultArtifactNames.length, 3);
  for (const name of resultArtifactNames) {
    assert.match(name, /\$\{\{ matrix\.browser \}\}/);
    assert.match(name, /\$\{\{ github\.sha \}\}/);
    assert.match(name, /\$\{\{ github\.run_attempt \}\}/);
  }
});

const released = {
  stateReliable: true,
  workerSha: '1'.repeat(40),
  pagesSha: '1'.repeat(40),
};

test('required recovery scenarios: app changes require a verified deployment', () => {
  const app = decideDeployment({ ...released, currentFiles: ['src/main.ts'], workerFiles: ['src/main.ts'], pagesFiles: ['src/main.ts'] });
  assert.equal(app.run_full_suite, 'true');
  assert.equal(app.deploy_required, 'true');
  const needs = {
    'detect-changes': { outputs: { deploy_required: app.deploy_required } },
    verify: { result: 'success' },
    'browser-ui': { result: 'success' },
    'browser-ui-matrix-audit': { result: 'success' },
    'release-freshness': { result: 'success' },
    'deploy-worker': { result: 'success' },
    'production-test': { result: 'success' },
  };
  const context = { needs, github: { event_name: 'push' }, inputs: { deploy_to_production: false } };
  for (const jobName of ['release-freshness', 'deploy-worker', 'pages-build']) {
    assert.equal(evaluateActionsCondition(jobCondition(deployWorkflow, jobName), context), true, jobName);
  }

  const scenarios = [
    ['success', 'success', 'success'],
    ['failure', 'success', 'failure'],
    ['success', 'failure', 'failure'],
    ['cancelled', 'success', 'cancelled'],
    ['success', 'cancelled', 'cancelled'],
    ['skipped', 'success', 'skipped'],
    ['success', 'skipped', 'skipped'],
    ['failure', 'failure', 'failure'],
    ['cancelled', 'cancelled', 'cancelled'],
  ];
  for (const [chromium, webkit, matrixResult] of scenarios) {
    const matrixContext = structuredClone(context);
    matrixContext.needs['browser-ui'].result = matrixResult;
    const expectedAllowed = chromium === 'success' && webkit === 'success';
    matrixContext.needs['browser-ui-matrix-audit'].result = expectedAllowed ? 'success' : 'failure';
    for (const jobName of ['release-freshness', 'deploy-worker', 'pages-build']) {
      assert.equal(
        evaluateActionsCondition(jobCondition(deployWorkflow, jobName), matrixContext),
        expectedAllowed,
        `${jobName}: Chromium=${chromium}, WebKit=${webkit}, matrix=${matrixResult}`,
      );
    }
  }

  for (const matrixResult of ['failure', 'cancelled', 'skipped']) {
    const matrixContext = structuredClone(context);
    matrixContext.needs['browser-ui'].result = matrixResult;
    matrixContext.needs['browser-ui-matrix-audit'].result = 'failure';
    for (const jobName of ['release-freshness', 'deploy-worker', 'pages-build']) {
      assert.equal(evaluateActionsCondition(jobCondition(deployWorkflow, jobName), matrixContext), false, `${jobName}: matrix ${matrixResult}`);
    }
  }

  for (const requiredJob of ['verify', 'browser-ui-matrix-audit', 'release-freshness', 'deploy-worker', 'production-test']) {
    const skippedNeeds = structuredClone(context);
    skippedNeeds.needs[requiredJob].result = 'skipped';
    if (requiredJob === 'release-freshness') skippedNeeds.needs['deploy-worker'].result = 'skipped';
    assert.equal(evaluateActionsCondition(jobCondition(deployWorkflow, 'pages-build'), skippedNeeds), false, `${requiredJob} skipped`);
  }
});

test('test-only recovery commit picks up an app change missed by a failed run', () => {
  const recovery = decideDeployment({
    ...released,
    currentFiles: ['tests/button-colors.test.ts'],
    workerFiles: ['src/style.css', 'tests/button-colors.test.ts'],
    pagesFiles: ['src/style.css', 'tests/button-colors.test.ts'],
  });
  assert.equal(recovery.run_full_suite, 'true');
  assert.equal(recovery.deploy_required, 'true');
  assert.equal(recovery.pending_release, 'true');
});

test('docs-only update cannot publish pending code without full verification', () => {
  const docsRecovery = decideDeployment({
    ...released,
    currentFiles: ['docs/notes.md'],
    workerFiles: ['src/style.css'],
    pagesFiles: ['src/style.css'],
  });
  assert.equal(docsRecovery.run_full_suite, 'true');
  assert.equal(docsRecovery.deploy_required, 'true');
  const context = {
    needs: {
      'detect-changes': { outputs: { deploy_required: docsRecovery.deploy_required } },
      verify: { result: 'failure' },
      'browser-ui': { result: 'success' },
      'release-freshness': { result: 'skipped' },
      'deploy-worker': { result: 'skipped' },
      'production-test': { result: 'skipped' },
    },
    github: { event_name: 'push' },
    inputs: { deploy_to_production: false },
  };
  for (const jobName of ['release-freshness', 'deploy-worker', 'pages-build']) {
    assert.equal(evaluateActionsCondition(jobCondition(deployWorkflow, jobName), context), false, jobName);
  }
});

test('docs-only after complete deployment skips full checks and deployment', () => {
  const docs = decideDeployment({ ...released, currentFiles: ['docs/notes.md'] });
  assert.equal(docs.run_full_suite, 'false');
  assert.equal(docs.deploy_required, 'false');
});

test('test-only after complete deployment verifies without deploying', () => {
  const tests = decideDeployment({ ...released, currentFiles: ['tests/example.test.ts'] });
  assert.equal(tests.run_full_suite, 'true');
  assert.equal(tests.deploy_required, 'false');
});

test('partial Worker success leaves Pages pending and triggers safe retry', () => {
  const partial = decideDeployment({
    stateReliable: true,
    workerSha: '2'.repeat(40),
    pagesSha: '1'.repeat(40),
    currentFiles: ['tests/example.test.ts'],
    workerFiles: [],
    pagesFiles: ['src/main.ts'],
  });
  assert.equal(partial.run_full_suite, 'true');
  assert.equal(partial.deploy_required, 'true');
  assert.match(deployWorkflow, /Record successful Worker deployment SHA/);
  assert.match(deployWorkflow, /Record successful GitHub Pages deployment SHA/);
});

test('unknown history and first deployment fail safe into full verification', () => {
  const unknown = decideDeployment({ currentFiles: ['docs/notes.md'], stateReliable: false });
  const initial = decideDeployment({ stateReliable: true, currentFiles: ['docs/notes.md'] });
  for (const result of [unknown, initial]) {
    assert.equal(result.run_full_suite, 'true');
    assert.equal(result.deploy_required, 'true');
  }
});

test('deployment state lookup failure remains visible and cannot be treated as success', () => {
  assert.match(deploymentStateScript, /Deployment history lookup failed; full verification and safe redeployment are required/);
  assert.match(deploymentStateScript, /state_reliable: 'false'/);
});

test('stale queued SHA is blocked and manual deployment obeys its explicit input', () => {
  assert.match(deployWorkflow, /run-name: Verify and deploy \$\{\{ github\.ref_name \}\} @ \$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /latest_sha.*TARGET_SHA/s);
  assert.match(deployWorkflow, /Refusing to publish stale SHA/);
  const manualFalse = decideDeployment({ ...released, currentFiles: ['src/main.ts'], eventName: 'workflow_dispatch', deployToProduction: false });
  const manualTrue = decideDeployment({ ...released, currentFiles: ['docs/notes.md'], eventName: 'workflow_dispatch', deployToProduction: true });
  assert.equal(manualFalse.run_full_suite, 'true');
  assert.equal(manualFalse.deploy_required, 'false');
  assert.equal(manualTrue.run_full_suite, 'true');
  assert.equal(manualTrue.deploy_required, 'true');
});
