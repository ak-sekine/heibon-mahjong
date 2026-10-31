import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrowserUiMatrix, REQUIRED_BROWSER_UI_JOBS } from '../.github/scripts/check-browser-ui-matrix.mjs';

const matrix = (chromium, webkit) => checkBrowserUiMatrix([
  { name: REQUIRED_BROWSER_UI_JOBS[0], conclusion: chromium },
  { name: REQUIRED_BROWSER_UI_JOBS[1], conclusion: webkit },
]);

test('only success from both named engine jobs satisfies the matrix audit', () => {
  const scenarios = [
    ['success', 'success', true],
    ['failure', 'success', false],
    ['success', 'failure', false],
    ['cancelled', 'success', false],
    ['success', 'cancelled', false],
    ['skipped', 'success', false],
    ['success', 'skipped', false],
    ['failure', 'failure', false],
    ['cancelled', 'cancelled', false],
    ['skipped', 'skipped', false],
  ];

  for (const [chromium, webkit, expected] of scenarios) {
    assert.equal(matrix(chromium, webkit).ok, expected, `Chromium=${chromium}, WebKit=${webkit}`);
  }
});

test('a missing, duplicate, or unrecognized matrix leg fails closed', () => {
  assert.equal(checkBrowserUiMatrix([]).ok, false);
  assert.equal(checkBrowserUiMatrix([{ name: REQUIRED_BROWSER_UI_JOBS[0], conclusion: 'success' }]).ok, false);
  assert.equal(checkBrowserUiMatrix([
    { name: REQUIRED_BROWSER_UI_JOBS[0], conclusion: 'success' },
    { name: REQUIRED_BROWSER_UI_JOBS[0], conclusion: 'success' },
    { name: REQUIRED_BROWSER_UI_JOBS[1], conclusion: 'success' },
  ]).ok, false);
  assert.throws(() => checkBrowserUiMatrix(null), TypeError);
});
