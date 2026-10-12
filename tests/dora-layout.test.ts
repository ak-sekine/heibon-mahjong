import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoraIndicators } from '../src/rendering/dora.ts';
import { startGame } from '../src/game/start.ts';
import { exposedDoraIndicators } from '../src/game/dora.ts';
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
      assert.equal(slot.className, 'dora-slot dora-placeholder');
      assert.deepEqual(slot.dataset, {});
      assert.equal(slot.innerHTML, '');
      assert.equal(slot.textContent, '');
      assert.deepEqual(slot.children, []);
      assert.equal(slot.attributes['aria-label'], `未公開のドラ表示牌${index + 1}`);
    }
  }
  assert.deepEqual(exposed, snapshot);
  renderDoraIndicators(region as unknown as HTMLElement, exposedDoraIndicators(game));
  assert.equal(region.children.filter(slot => slot.dataset.tileId).length, 1);
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
