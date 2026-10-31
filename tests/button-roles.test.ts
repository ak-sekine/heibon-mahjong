import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const files = ['index.html', 'test.html', 'kan-test.html'];
const roleById: Record<string, string> = {
  'new-game': 'a',
  'online-create-close': 'b', 'online-create-rules': 'b', 'online-create': 'a', 'diagnostic-close': 'b',
  'diagnostic-copy': 'b', 'diagnostic-clear': 'd1', 'online-join-close': 'b', 'online-join': 'a',
  'online-close': 'b', 'online-copy-code': 'b', 'online-confirm-rules': 'b', 'online-ready': 'a',
  'online-finalize': 'a', 'online-start-game': 'a', 'online-reconnect': 'a', 'online-leave': 'd1',
  'online-close-room': 'd2', 'view-table': 'b', 'result-new-game': 'a', 'match-result-close': 'b', 'new-game-rules': 'b',
  'cancel-new-game': 'b', 'confirm-new-game': 'a', 'cancel-rule-settings': 'b',
  'confirm-rule-settings': 'a', 'online-rules-close': 'b', 'load-scenario': 'a',
  'start-cpu-kan': 'a', 'repeat-scenario': 'a', 'start-river-test': 'a',
};
const roleByPart: Record<string, string> = {
  'pass-call': 'c', 'cancel-kan': 'b', ron: 'a', 'pass-ron': 'c', discard: 'a', riichi: 'a',
  'kan-toggle': 'a', tsumo: 'a', kyuushu: 'a', 'show-result': 'b', 'show-match-result': 'b', 'next-round': 'a', 'return-local': 'b',
};

function buttons(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>/gu)].map(match => match[0]);
}

test('every static operation button on product and verification pages has exactly one shared role class', () => {
  for (const file of files) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const nodes = buttons(html);
    assert.equal(nodes.length, file === 'index.html' ? 47 : file === 'kan-test.html' ? 21 : 22);
    for (const button of nodes) {
      const classes = button.match(/\bclass="([^"]*)"/u)?.[1]?.split(/\s+/u) ?? [];
      if (classes.includes('main-menu-item') || classes.includes('main-menu-toggle')) {
        assert.ok(!classes.includes('ui-button'), `${file}: menu items must not inherit normal button styling: ${button}`);
        continue;
      }
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

test('dropdown items retain white styling and the navigation toggle stays separate from operation buttons', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const menuItems = html.match(/<button\b[^>]*class="main-menu-item"[^>]*>/gu) ?? [];
  assert.equal(menuItems.length, 7);
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const toggle = buttons(html).find(button => button.includes('id="main-menu-toggle"')) ?? '';
  assert.match(toggle, /class="main-menu-toggle"/u);
  assert.match(toggle, /aria-expanded="false"/u);
  assert.doesNotMatch(toggle, /ui-button/u);
  const toggleStyles = css.match(/\.main-menu-toggle\s*\{([^}]*)\}/u)?.[1] ?? '';
  for (const declaration of ['background:transparent', 'color:#fffdf7', 'box-shadow:none', 'width:44px', 'height:44px']) {
    assert.ok(toggleStyles.includes(declaration), declaration);
  }
  assert.match(css, /\.main-menu-toggle span[^}]*background:currentColor/u);
  assert.match(css, /\.main-menu-toggle:hover/u);
  assert.match(css, /\.main-menu-toggle:active/u);
  assert.match(css, /\.main-menu-toggle\[aria-expanded="true"\]/u);
  assert.match(css, /\.main-menu-toggle:focus-visible[^}]*outline:3px/u);
  const panel = css.match(/\.main-menu-items\s*\{([^}]*)\}/u)?.[1] ?? '';
  const item = css.match(/\.main-menu-items \.main-menu-item\s*\{([^}]*)\}/u)?.[1] ?? '';
  for (const declaration of ['background:#fffdf7', 'border:1px solid', 'border-radius:10px', 'box-shadow:']) assert.ok(panel.includes(declaration), declaration);
  for (const declaration of ['min-height:44px', 'background:#fffdf7', 'color:#154e3c', 'box-shadow:none']) assert.ok(item.includes(declaration), declaration);
  assert.match(css, /\.main-menu-items \.main-menu-item:focus-visible/u);
  assert.match(css, /\.main-menu-items \.main-menu-item:hover/u);
});

test('local and online hand tile renderers use the same selectable A role', () => {
  for (const file of ['src/rendering/table.ts', 'src/online/game-controller.ts']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /className = 'tile-choice ui-button ui-button--a'/u, file);
    assert.match(source, /aria-pressed/u, file);
  }
});

test('diagnostic and room destructive controls retain semantic classes without role colors', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [id, role] of [['diagnostic-clear', 'd1'], ['online-leave', 'd1'], ['online-close-room', 'd2']]) {
    const button = buttons(html).find(node => node.includes(`id="${id}"`));
    assert.ok(button, `missing #${id}`);
    assert.match(button, new RegExp(`ui-button--${role}(?:\\s|\")`, 'u'));
  }
});

test('shared CSS defines one normal color, pressed and disabled states, and busy priority', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  for (const value of ['#F8DC91', '#154E3C', '#E9C66A', '#9DA27C', '#20352C']) assert.ok(css.includes(value));
  for (const obsolete of ['--button-a-bg', '--button-b-bg', '--button-c-bg', '--button-d1-bg', '--button-d2-bg',
    '#f8f7f2', '#dce9e2', '#ffe7e1', '#9b3028']) assert.ok(!css.includes(obsolete), `obsolete role color: ${obsolete}`);
  assert.match(css, /\.ui-button:not\(\.tile-choice\).*var\(--button-normal-bg\)/u);
  assert.match(css, /--button-pressed-bg:#E9C66A/u);
  assert.match(css, /button\.tile-choice\.ui-button\.ui-button:disabled.*background-color:transparent/u);
  assert.match(css, /button\.tile-choice\.ui-button\[aria-pressed="true"\].*background-color:transparent/u);
  assert.match(css, /\.ui-button\.ui-button:disabled:not\(\[aria-busy="true"\]\)/u);
  assert.match(css, /\.ui-button\[aria-busy="true"\]/u);
  assert.match(css, /\.ui-button\.ui-button:focus-visible/u);
});

test('all normal button role selectors resolve to the same common tokens', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.ui-button--(?:a|b|c|d1|d2)\b/u);
});
