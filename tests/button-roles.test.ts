import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const files = ['index.html', 'test.html', 'kan-test.html'];
const roleById: Record<string, string> = {
  'main-menu-toggle': 'b', 'new-game': 'a', 'menu-offline-rules': 'b', 'river-test-open': 'b',
  'online-create-open': 'a', 'online-join-open': 'a', 'menu-room': 'b', 'menu-diagnostics': 'b',
  'online-create-close': 'b', 'online-create-rules': 'b', 'online-create': 'a', 'diagnostic-close': 'b',
  'diagnostic-copy': 'b', 'diagnostic-clear': 'd1', 'online-join-close': 'b', 'online-join': 'a',
  'online-close': 'b', 'online-copy-code': 'b', 'online-confirm-rules': 'b', 'online-ready': 'a',
  'online-finalize': 'a', 'online-start-game': 'a', 'online-reconnect': 'a', 'online-leave': 'd1',
  'online-close-room': 'd2', 'view-table': 'b', 'result-new-game': 'a', 'new-game-rules': 'b',
  'cancel-new-game': 'b', 'confirm-new-game': 'a', 'cancel-rule-settings': 'b',
  'confirm-rule-settings': 'a', 'online-rules-close': 'b', 'load-scenario': 'a',
  'start-cpu-kan': 'a', 'repeat-scenario': 'a', 'start-river-test': 'a',
};
const roleByPart: Record<string, string> = {
  'pass-call': 'c', 'cancel-kan': 'b', ron: 'a', 'pass-ron': 'c', discard: 'a', riichi: 'a',
  'kan-toggle': 'a', tsumo: 'a', kyuushu: 'a', 'show-result': 'b', 'next-round': 'a', 'return-local': 'b',
};

function buttons(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>/gu)].map(match => match[0]);
}

test('every static button on product and verification pages has exactly one shared role class', () => {
  for (const file of files) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const nodes = buttons(html);
    assert.equal(nodes.length, file === 'index.html' ? 45 : file === 'kan-test.html' ? 19 : 20);
    for (const button of nodes) {
      const classes = button.match(/\bclass="([^"]*)"/u)?.[1]?.split(/\s+/u) ?? [];
      assert.ok(classes.includes('ui-button'), `${file}: ${button}`);
      assert.equal(classes.filter(name => /^ui-button--(?:a|b|c|d1|d2)$/u.test(name)).length, 1, `${file}: ${button}`);
      const id = button.match(/\bid="([^"]+)"/u)?.[1];
      const part = button.match(/\bdata-panel-part="([^"]+)"/u)?.[1];
      const expected = (id && roleById[id]) || (part && roleByPart[part]);
      assert.ok(expected, `${file}: button is missing a role classification: ${button}`);
      assert.ok(classes.includes(`ui-button--${expected}`), `${file}: ${button} should be ${expected}`);
    }
  }
});

test('local and online hand tile renderers use the same selectable A role', () => {
  for (const file of ['src/rendering/table.ts', 'src/online/game-controller.ts']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /className = 'tile-choice ui-button ui-button--a'/u, file);
    assert.match(source, /aria-pressed/u, file);
  }
});

test('diagnostic and room destructive controls retain their distinct D1 and D2 roles', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [id, role] of [['diagnostic-clear', 'd1'], ['online-leave', 'd1'], ['online-close-room', 'd2']]) {
    const button = buttons(html).find(node => node.includes(`id="${id}"`));
    assert.ok(button, `missing #${id}`);
    assert.match(button, new RegExp(`ui-button--${role}(?:\\s|\")`, 'u'));
  }
});

test('shared CSS defines the approved colors and busy-over-disabled state rules', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  for (const value of ['#f8dc91', '#f8f7f2', '#dce9e2', '#ffe7e1', '#9b3028', '#9da27c']) assert.ok(css.includes(value));
  assert.match(css, /\.ui-button\.ui-button:disabled:not\(\[aria-busy="true"\]\)/u);
  assert.match(css, /\.ui-button\[aria-busy="true"\]/u);
  assert.match(css, /\.ui-button\.ui-button:focus-visible/u);
});
