import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrowserUiMatrix, REQUIRED_BROWSER_UI_JOBS } from '../.github/scripts/check-browser-ui-matrix.mjs';

const matrix = (chromium1, chromium2, webkit1, webkit2) => checkBrowserUiMatrix([
  { name: REQUIRED_BROWSER_UI_JOBS[0], conclusion: chromium1 },
  { name: REQUIRED_BROWSER_UI_JOBS[1], conclusion: chromium2 },
  { name: REQUIRED_BROWSER_UI_JOBS[2], conclusion: webkit1 },
  { name: REQUIRED_BROWSER_UI_JOBS[3], conclusion: webkit2 },
]);

test('the audit requires the four exact engine and group job names', () => {
  assert.deepEqual(REQUIRED_BROWSER_UI_JOBS, [
    'browser-ui / browser-ui (chromium, group 1)',
    'browser-ui / browser-ui (chromium, group 2)',
    'browser-ui / browser-ui (webkit, group 1)',
    'browser-ui / browser-ui (webkit, group 2)',
  ]);
});

test('only success from both named engine jobs satisfies the matrix audit', () => {
  const scenarios = [
    ['success', 'success', 'success', 'success', true],
    ['failure', 'success', 'success', 'success', false],
    ['success', 'failure', 'success', 'success', false],
    ['success', 'success', 'cancelled', 'success', false],
    ['success', 'success', 'success', 'skipped', false],
    ['cancelled', 'success', 'success', 'cancelled', false],
  ];

  for (const [chromium1, chromium2, webkit1, webkit2, expected] of scenarios) {
    assert.equal(matrix(chromium1, chromium2, webkit1, webkit2).ok, expected);
  }
});

test('a missing, duplicate, or unrecognized matrix leg fails closed', () => {
  assert.equal(checkBrowserUiMatrix([]).ok, false);
  assert.equal(checkBrowserUiMatrix([{ name: REQUIRED_BROWSER_UI_JOBS[0], conclusion: 'success' }]).ok, false);
  assert.equal(checkBrowserUiMatrix([
    { name: REQUIRED_BROWSER_UI_JOBS[0], conclusion: 'success' },
    { name: REQUIRED_BROWSER_UI_JOBS[0], conclusion: 'success' },
    { name: REQUIRED_BROWSER_UI_JOBS[1], conclusion: 'success' },
    { name: REQUIRED_BROWSER_UI_JOBS[2], conclusion: 'success' },
    { name: REQUIRED_BROWSER_UI_JOBS[3], conclusion: 'success' },
  ]).ok, false);
  assert.throws(() => checkBrowserUiMatrix(null), TypeError);
});
