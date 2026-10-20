import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ACTION_PANEL_TEMPLATE_PARTS } from '../src/ui/action-panel.ts';

test('game controls templates provide every part required by either mode', () => {
  const expected = [...ACTION_PANEL_TEMPLATE_PARTS].sort();
  for (const file of ['index.html', 'kan-test.html']) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const match = html.match(/<template id="game-controls-template">([\s\S]*?)<\/template>/);
    assert.ok(match, `${file} must include the shared game controls template`);
    const actual = [...match[1].matchAll(/data-panel-part="([^"]+)"/g)]
      .map((part) => part[1])
      .sort();
    assert.deepEqual(actual, expected, `${file} must satisfy the action panel component contract`);
  }
});
