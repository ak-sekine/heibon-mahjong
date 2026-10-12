import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from '../src/game/start.ts';
import { renderTable } from '../src/rendering/table.ts';

class ElementStub {
  children: ElementStub[] = [];
  dataset: Record<string, string> = {};
  className = '';
  textContent = '';
  content = { firstElementChild: this };
  innerHTML = '';
  replaceChildren(...children: ElementStub[]) { this.children = children; }
  append(child: ElementStub) { this.children.push(child); }
}

function seeded(seed: number): () => number {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('four seats render from player state, concealed CPU hands and fresh tiles', () => {
  const nodes = new Map<string, ElementStub>();
  for (const id of [0, 1, 2, 3]) {
    nodes.set(`#label-${id}`, new ElementStub());
    if (id) nodes.set(`#hand-${id}`, new ElementStub());
  }
  nodes.set('#player-hand', new ElementStub());
  nodes.set('#wall-count', new ElementStub());
  const original = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) => nodes.get(selector),
    createElement: () => new ElementStub(),
  } as unknown as Document;
  try {
    for (let seed = 0; seed < 20; seed++) {
      const game = startGame(seeded(seed));
      renderTable(game);
      const own = nodes.get('#player-hand')!.children;
      assert.equal(own.length, 14);
      assert.equal(own.filter(item => item.className === 'drawn-tile').length, 1);
      assert.deepEqual(own.map(item => item.dataset.tileId), [...game.players[0].hand].sort((a, b) => {
        const order = (tile: typeof a.tile) => tile.category === 'suited' ? ['man', 'pin', 'sou'].indexOf(tile.suit) * 9 + tile.rank - 1 : 27 + ['east', 'south', 'west', 'north', 'white', 'green', 'red'].indexOf(tile.honor);
        return order(a.tile) - order(b.tile) || a.id.localeCompare(b.id);
      }).map(tile => tile.id).concat(game.players[0].drawnTile!.id));
      assert.match(nodes.get('#label-0')!.textContent, /^自分 · 東 · 14枚 · 親$/);
      for (const id of [1, 2, 3]) {
        const backs = nodes.get(`#hand-${id}`)!.children;
        assert.equal(backs.length, 13);
        assert.ok(backs.every(item => item.className === 'tile-back' && item.children.length === 0 && Object.keys(item.dataset).length === 0));
        assert.match(nodes.get(`#label-${id}`)!.textContent, new RegExp(`^CPU${id} · ${['', '南', '西', '北'][id]} · 13枚$`));
      }
      assert.deepEqual(nodes.get('#wall-count')!.children.map(item => item.textContent), ['生きた牌山 69枚', '王牌 14枚']);
    }
  } finally { globalThis.document = original; }
});
