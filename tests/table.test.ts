import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from '../src/game/start.ts';
import { renderTable, renderSelection } from '../src/rendering/table.ts';
import { discardTile } from '../src/game/discard.ts';

class ElementStub {
  children: ElementStub[] = [];
  dataset: Record<string, string> = {};
  className = '';
  style: Record<string, string> = {};
  textContent = '';
  disabled = false;
  content = { firstElementChild: this };
  innerHTML = '';
  attributes: Record<string, string> = {};
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
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
    nodes.set(`.river[data-player-id="${id}"]`, new ElementStub());
    if (id) nodes.set(`#hand-${id}`, new ElementStub());
  }
  nodes.set('#player-hand', new ElementStub());
  nodes.set('#wall-count', new ElementStub());
  nodes.set('#discard', new ElementStub());
  nodes.set('#selection-status', new ElementStub());
  const original = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) => nodes.get(selector),
    querySelectorAll: () => nodes.get('#player-hand')!.children.map(item => item.children[0]),
    createElement: () => new ElementStub(),
  } as unknown as Document;
  try {
    for (let seed = 0; seed < 20; seed++) {
      const game = startGame(seeded(seed));
      renderTable(game);
      renderSelection(game, null);
      assert.equal(nodes.get('#discard')!.disabled, true);
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
        assert.equal(backs.length, 0);
        assert.ok(backs.every(item => item.className === 'tile-back' && item.children.length === 0 && Object.keys(item.dataset).length === 0));
        assert.match(nodes.get(`#label-${id}`)!.textContent, new RegExp(`^CPU${id} · ${['', '南', '西', '北'][id]} · 13枚$`));
      }
      assert.deepEqual(nodes.get('#wall-count')!.children.map(item => item.textContent), ['生きた牌山 69枚', '王牌 14枚', 'あなたの手番']);
      assert.equal(nodes.get('#label-0')!.dataset.active, 'true');
      assert.ok([0, 1, 2, 3].every(id => nodes.get(`.river[data-player-id="${id}"]`)!.children.length === 0));
      const selected = game.players[0].drawnTile!;
      const snapshot = structuredClone(game);
      renderSelection(game, selected.id);
      assert.equal(nodes.get('#discard')!.disabled, false);
      assert.equal(own[13].children[0].attributes['aria-pressed'], 'true');
      assert.deepEqual(game, snapshot);
      renderSelection(game, game.players[0].hand[0].id);
      assert.equal(own[13].children[0].attributes['aria-pressed'], 'false');
      renderSelection(game, null);
      assert.equal(nodes.get('#discard')!.disabled, true);
      const stopped = discardTile(game, 0, selected.id);
      renderTable(stopped);
      renderSelection(stopped, null);
      assert.equal(nodes.get('#player-hand')!.children.length, 13);
      assert.ok(nodes.get('#player-hand')!.children.every(item => item.className !== 'drawn-tile' && item.children[0].disabled));
      const river = nodes.get('.river[data-player-id="0"]')!.children;
      assert.equal(river.length, 1);
      assert.equal(river[0].dataset.tileId, selected.id);
      assert.equal(nodes.get('#discard')!.disabled, true);
      assert.match(nodes.get('#selection-status')!.textContent, /CPU1の手番/);
      assert.equal(nodes.get('#label-1')!.dataset.active, 'true');
      renderSelection({ ...stopped, phase: 'wall-exhausted' }, null);
      assert.equal(nodes.get('#selection-status')!.textContent, '牌山がなくなりました');
      // Next loop renders a new game and proves old river and selection are cleared.
    }
  } finally { globalThis.document = original; }
});
