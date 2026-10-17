import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResultDoraRow, renderDoraIndicators } from '../src/rendering/dora.ts';
import { startGame } from '../src/game/start.ts';
import { exposedDoraIndicators, uraDoraIndicators } from '../src/game/dora.ts';
import { TILE_KINDS, ordinaryTile, redFive } from '../src/model/tile.ts';
import { tileLabel, tileSvgMarkup } from '../src/rendering/tile-svg.ts';
import { doraKindFromIndicator } from '../src/analysis/dora.ts';

class Node {
  children: Node[] = [];
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  className = '';
  textContent = '';
  innerHTML = '';
  content = { firstElementChild: this };
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  replaceChildren(...nodes: Node[]) { this.children = nodes; }
  append(...nodes: Node[]) { this.children.push(...nodes); }
}
function withDOM(run: (region: Node) => void) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Node() } as unknown as Document;
  try { run(new Node()); } finally { globalThis.document = original; }
}
for (const count of [0, 1, 2, 3, 4, 5]) test(`dora layout: ${count} public tiles and ${5 - count} empty slots`, () => withDOM(region => {
  const game = startGame();
  const exposed = count === 1 ? exposedDoraIndicators(game) : game.liveWall.slice(0, count);
  const snapshot = structuredClone(exposed);
  renderDoraIndicators(region as unknown as HTMLElement, exposed);
  assert.equal(region.children.length, 5);
  for (const [index, slot] of region.children.entries()) {
    if (index < count) {
      assert.equal(slot.dataset.tileId, exposed[index].id);
      assert.equal(slot.children[1].innerHTML, tileSvgMarkup(exposed[index].tile));
      assert.equal(slot.children[1].attributes['aria-label'], `ドラ表示牌：${tileLabel(exposed[index].tile)}`);
    } else {
      assert.equal(slot.className, 'dora-slot tile-back');
      assert.deepEqual(slot.dataset, {});
      assert.equal(slot.innerHTML, '');
      assert.equal(slot.textContent, '');
      assert.deepEqual(slot.children, []);
      assert.equal(slot.attributes['aria-label'], `未公開のドラ表示牌${index + 1}`);
      assert.equal(slot.attributes['aria-hidden'], undefined);
    }
  }
  assert.deepEqual(exposed, snapshot);
  renderDoraIndicators(region as unknown as HTMLElement, exposedDoraIndicators(game));
  assert.equal(region.children.filter(slot => slot.dataset.tileId).length, 1);
}));
for (const kanCount of [0,1,2,3,4]) test(`separate omote/ura rows with ${kanCount} kans, then reset`, () => withDOM(region => {
  const game = {...startGame(), kanCount};
  const exposed = exposedDoraIndicators(game), ura = uraDoraIndicators(game);
  renderDoraIndicators(region as unknown as HTMLElement, exposed, ura);
  assert.equal(region.children.length, 10);
  for (const [offset, indicators] of [[0, exposed], [5, ura]] as const) {
    for (let i=0; i<5; i++) {
      const slot = region.children[offset+i];
      assert.equal(slot.dataset.tileId, indicators[i]?.id);
      if (i <= kanCount) assert.equal(slot.children[1].innerHTML, tileSvgMarkup(indicators[i].tile));
      else assert.deepEqual(slot.dataset, {});
      assert.equal(slot.className.includes('ura-indicator'), offset===5);
    }
  }
  renderDoraIndicators(region as unknown as HTMLElement, exposed);
  assert.equal(region.children.length, 5);
  assert.ok(!JSON.stringify(region.children.map(n=>[n.dataset,n.attributes,n.innerHTML,n.textContent])).includes(ura[0].id));
  renderDoraIndicators(region as unknown as HTMLElement, exposedDoraIndicators(startGame()));
  assert.equal(region.children.filter(n=>n.dataset.tileId).length, 1);
}));
test('all indicator kinds and red fives distinguish indicator names from actual dora', () => withDOM(region => {
  for (const tile of [...TILE_KINDS.map(ordinaryTile), redFive('man'), redFive('pin'), redFive('sou')]) {
    renderDoraIndicators(region as unknown as HTMLElement, [{ id: 'public-fixture', tile }]);
    const slot = region.children[0];
    const dora = tileLabel(ordinaryTile(doraKindFromIndicator(tile)));
    assert.equal(slot.attributes['aria-label'], `ドラ表示牌1：${tileLabel(tile)}、ドラ：${dora}`);
    assert.equal(slot.children[2].textContent, `ドラ：\n${dora}`);
  }
}));
test('more than five indicators rejects data before changing the DOM', () => withDOM(region => {
  assert.throws(() => renderDoraIndicators(region as unknown as HTMLElement, startGame().liveWall.slice(0, 6)), RangeError);
  assert.deepEqual(region.children, []);
}));

for (const ura of [false, true]) for (const count of [0, 1, 2, 3, 4, 5]) test(`result dora row: ura=${ura}, ${count} indicators`, () => withDOM(() => {
  const indicators = startGame().liveWall.slice(0, count);
  const snapshot = structuredClone(indicators);
  const row = createResultDoraRow(indicators, ura) as unknown as Node;
  const name = ura ? '裏ドラ表示牌' : 'ドラ表示牌';
  assert.equal(row.children[0].textContent, name);
  const slots = row.children[1].children;
  assert.equal(slots.length, 5);
  for (const [i, slot] of slots.entries()) {
    if (i < count) {
      assert.equal(slot.dataset.tileId, indicators[i].id);
      assert.equal(slot.children[0].innerHTML, tileSvgMarkup(indicators[i].tile));
      assert.equal(slot.children[0].attributes['aria-hidden'], 'true');
      assert.equal(slot.attributes['aria-label'], `${name}${i + 1}：${tileLabel(indicators[i].tile)}、${ura ? '裏ドラ' : 'ドラ'}：${tileLabel(ordinaryTile(doraKindFromIndicator(indicators[i].tile)))}`);
    } else {
      assert.deepEqual(slot.dataset, {});
      assert.deepEqual(slot.children, []);
      assert.equal(slot.attributes['aria-label'], `${name}${i + 1}：未使用枠`);
    }
  }
  assert.equal(row.children[2].attributes['aria-hidden'], 'true');
  assert.deepEqual(indicators, snapshot);
}));
test('result row rejects more than five indicators', () => withDOM(() => {
  assert.throws(() => createResultDoraRow(startGame().liveWall.slice(0, 6), false), RangeError);
}));
