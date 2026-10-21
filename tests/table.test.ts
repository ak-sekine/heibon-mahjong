import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ronStart, withRiverTile } from './ron-fixture.ts';
import { declareRon } from '../src/game/ron.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { startGame } from '../src/game/start.ts';
import { renderTable, renderSelection, yakuDisplayName } from '../src/rendering/table.ts';
import type { YakuId } from '../src/analysis/yaku.ts';
import { renderMatch } from '../src/rendering/match.ts';
import { createLocalActionPanelState } from '../src/rendering/local-action-panel-state.ts';
import { startMatch, nextRound } from '../src/game/match.ts';
import { fixedRound } from './match-fixture.ts';
import { discardTile } from '../src/game/discard.ts';
import { SUITS, tileKindKey } from '../src/model/tile.ts';
import { tileSvgMarkup, tileLabel } from '../src/rendering/tile-svg.ts';
import { doraKindFromIndicator } from '../src/analysis/dora.ts';
import { ordinaryTile } from '../src/model/tile.ts';
import { allTiles, inventory } from './helpers.ts';

class ElementStub {
  readonly tagName: string;
  constructor(tagName = '') { this.tagName = tagName; }
  children: ElementStub[] = [];
  dataset: Record<string, string> = {};
  className = '';
  style = Object.assign({} as Record<string, string>, { setProperty(name: string, value: string) { this[name] = value; } });
  textContent = '';
  disabled = false;
  hidden = false;
  content = { firstElementChild: this };
  innerHTML = '';
  focused = false;
  querySelector() { return { textContent: '' }; }
  focus() { assert.equal(this.disabled, false); this.focused = true; }
  classList = { toggle() {}, add: (name: string) => { this.className += ` ${name}`; } };
  attributes: Record<string, string> = {};
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  replaceChildren(...children: ElementStub[]) { this.children = children; }
  append(...children: ElementStub[]) { this.children.push(...children); }
}

test('round summaries abbreviate selected yaku while detail names stay official', () => {
  const cases = [
    { id: 'menzen-tsumo', summary: 'ツモ', detail: '門前清自摸和' },
    { id: 'yakuhai-white', summary: '白', detail: '役牌：白' },
    { id: 'yakuhai-green', summary: '發', detail: '役牌：發' },
    { id: 'yakuhai-red', summary: '中', detail: '役牌：中' },
    { id: 'yakuhai-seat-wind', summary: '自風', detail: '役牌：自風' },
    { id: 'yakuhai-round-wind', summary: '場風', detail: '役牌：場風' },
    { id: 'double-riichi', summary: 'ダブル立直', detail: 'ダブル立直' },
    { id: 'tanyao', summary: 'タンヤオ', detail: '断么九' },
    { id: 'riichi', summary: '立直', detail: '立直' },
    { id: 'ippatsu', summary: '一発', detail: '一発' },
    { id: 'pinfu', summary: '平和', detail: '平和' },
    { id: 'iipeikou', summary: '一盃口', detail: '一盃口' },
    { id: 'chiitoitsu', summary: '七対子', detail: '七対子' },
    { id: 'toitoi', summary: '対々和', detail: '対々和' },
    { id: 'sanshoku-doujun', summary: '三色同順', detail: '三色同順' },
    { id: 'ittsu', summary: '一気通貫', detail: '一気通貫' },
    { id: 'honitsu', summary: '混一色', detail: '混一色' },
    { id: 'chinitsu', summary: '清一色', detail: '清一色' },
    { id: 'rinshan', summary: '嶺上開花', detail: '嶺上開花' },
    { id: 'chankan', summary: '槍槓', detail: '槍槓' },
    { id: 'sankantsu', summary: '三槓子', detail: '三槓子' },
    { id: 'suukantsu', summary: '四槓子', detail: '四槓子' },
    { id: 'kokushi-musou', summary: '国士無双', detail: '国士無双' },
  ] as const satisfies readonly { id: YakuId; summary: string; detail: string }[];

  for (const { id, summary, detail } of cases) {
    assert.equal(yakuDisplayName(id, 'summary'), summary, `${id} summary`);
    assert.equal(yakuDisplayName(id, 'detail'), detail, `${id} detail`);
  }
});

for (const count of [0, 1, 2, 3, 'zero-normal', 'no-dora', 'normal-multiple', 'ura', 'yakuman'] as const) test(`result separates yaku and bonuses: ${count}`, () => {
  const nodes = new Map<string, ElementStub>();
  for (const id of [0, 1, 2, 3]) {
    nodes.set(`#label-${id}`, new ElementStub());
    nodes.set(`.river[data-player-id="${id}"]`, new ElementStub());
  }
  for (const key of ['#player-hand', '#wall-count', '#win-result', '#round-result-summary', '#dora-indicators']) nodes.set(key, new ElementStub());
  for (const key of ['#ron-controls', '#ron-status', '#ron', '#pass-ron', '#local-game-controls']) {
    const node = new ElementStub(); node.hidden = true; nodes.set(key, node);
  }
  const original = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) => nodes.get(selector),
    createElement: (tag: string) => new ElementStub(tag),
  } as unknown as Document;
  try {
    let game = count === 'yakuman'
      ? tsumoGame(['19m', '19p', '19s', '12345677z'], false, undefined, 'man-9')
      : count === 'normal-multiple'
        ? tsumoGame(['555m', '456p', '789s', '22p', '123s'], false, ['man'], 'man-4')
        : tsumoGame(['123m', '456m', '456p', '22p', '456s'], false,
          count === 'no-dora' ? [] : SUITS.slice(0, count === 'zero-normal' ? 2 : typeof count === 'number' ? count : 3),
          count === 'zero-normal' || count === 'no-dora' ? 'sou-8' : 'man-4');
    if (count === 'ura') {
      const base = tsumoGame();
      const deadWall = [...base.deadWall];
      const source = base.players.find(player => player.id !== 0 && player.hand.some(tile => tileKindKey(tile.tile) === 'man-1'))!;
      const sourceHand = [...source.hand];
      const uraIndex = sourceHand.findIndex(tile => tileKindKey(tile.tile) === 'man-1');
      [deadWall[5], sourceHand[uraIndex]] = [sourceHand[uraIndex], deadWall[5]];
      const declaration = base.players[0].river.at(-1)!;
      game = { ...base, deadWall, players: base.players.map(player => player.id === 0
        ? { ...player, riichi: { declarationTileId: declaration.id } }
        : player.id === source.id ? { ...player, hand: sourceHand } : player) };
    }
    const won = declareTsumo(game, 0);
    renderTable(won, undefined, startMatch(won).lastSettlement); inventory(won, game);
    const panel = nodes.get('#win-result')!;
    const strings = (node: ElementStub): string[] => [node.textContent, ...node.children.flatMap(strings)];
    const output = strings(panel);
    const list = panel.children[0].children.find(c => c.tagName === 'ul')!;
    assert.ok(!strings(list).some(s => s.includes('ドラ')));
    const exposed = nodes.get('#dora-indicators')!.children;
    assert.equal(exposed.length, count === 'ura' ? 10 : 5);
    if (count === 'ura') {
      assert.equal(exposed[5].dataset.tileId, game.deadWall[5].id);
      assert.equal(exposed[5].children[2].textContent, '裏ドラ');
    } else assert.ok(exposed.slice(1).every(slot => slot.className === 'dora-slot tile-back' && slot.innerHTML === '' && Object.keys(slot.dataset).length === 0));
    assert.equal(exposed[0].dataset.tileId, game.deadWall[4].id);
    assert.equal(exposed[0].children[1].innerHTML, tileSvgMarkup(game.deadWall[4].tile));
    assert.equal(exposed[0].children[2].textContent, `ドラ：\n${tileLabel(ordinaryTile(doraKindFromIndicator(game.deadWall[4].tile)))}`);
    assert.ok(output.some(s => s.startsWith('獲得点数：')));
    assert.ok(output.includes('支払い：'));
    assert.equal(output.includes('符の内訳'), count !== 'yakuman');
    const summary = nodes.get('#round-result-summary')!;
    const win = won.winResult!;
    const yaku = win.candidate.yaku.map(entry => yakuDisplayName(entry.id, 'summary'));
    if (win.yakumanCount === 0) {
      if (win.doraHan > 0) yaku.push(`ドラ${win.doraHan}`);
      if (win.uraDoraHan > 0) yaku.push(`裏ドラ${win.uraDoraHan}`);
      if (win.redDoraHan > 0) yaku.push(`赤ドラ${win.redDoraHan}`);
    }
    assert.equal(summary.children[0].children.find(child => child.className === 'round-summary-yaku')!.textContent, yaku.join('・'));
    const summaryTotal = summary.children[0].children.find(child => child.className === 'round-summary-total')!;
    assert.equal(summaryTotal.children[0].textContent,
      win.yakumanCount > 0 ? `${win.yakumanCount}役満` : `合計${win.totalHanIncludingDora}翻`);
    assert.equal(summaryTotal.children[1].textContent, `${win.totalPoints.toLocaleString('en-US')}点`);
    assert.ok(!summary.children[0].textContent.includes('ドラ込み'));
    if (count === 'yakuman') {
      assert.ok(output.includes('国士無双 1役満'));
      assert.ok(output.includes('役満：1役満'));
      assert.ok(!output.some(s => s.includes('翻') || s.includes('合計：') || s.includes('赤ドラ')));
      assert.ok(!summary.children[0].children.find(child => child.className === 'round-summary-yaku')!.textContent.includes('ドラ'));
    } else {
      const expectedYaku = count === 'normal-multiple' || count === 'ura' ? list.children.map(c => c.textContent).sort()
        : ['三色同順 2翻', '平和 1翻', '門前清自摸和 1翻'];
      assert.deepEqual(list.children.map(c => c.textContent).sort(), expectedYaku);
      assert.ok(output.includes(`役合計：${win.yakuHan}翻`));
      const normal = count === 'zero-normal' || count === 'no-dora' ? 0
        : count === 'normal-multiple' || count === 'ura' ? win.doraHan : 1;
      const red = count === 'zero-normal' ? 2 : count === 'normal-multiple' || count === 'ura' ? win.redDoraHan : count;
      if (count === 'normal-multiple') assert.ok(normal > 1, 'the fixture has multiple normal dora');
      if (count === 'ura') assert.ok(win.uraDoraHan > 0, 'the fixture has ura dora');
      assert.ok(output.includes(`通常ドラ：${normal}枚（${normal}翻）`));
      if (count === 'no-dora') assert.ok(output.includes('赤ドラ：0枚（0翻）'));
      else assert.ok(output.includes(`赤ドラ：${red}枚（${red}翻）`));
      assert.ok(output.includes(`合計：${win.totalHanIncludingDora}翻`));
      assert.equal(panel.children[0].children.filter(c => c.className === 'win-bonuses').length, 1);
    }
  } finally { globalThis.document = original; }
});

function seeded(seed: number): () => number {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('four seats render from player state, concealed CPU hands and fresh tiles', () => {
  const nodes = new Map<string, ElementStub>();
  for (const id of [0, 1, 2, 3]) {
    nodes.set(`#label-${id}`, new ElementStub());
    nodes.set(`.river[data-player-id="${id}"]`, new ElementStub());
    if (id) nodes.set(`.concealed-hand[data-player-id="${id}"]`, new ElementStub());
  }
  nodes.set('#player-hand', new ElementStub());
  nodes.set('#wall-count', new ElementStub());
  nodes.set('#dora-indicators', new ElementStub());
  nodes.set('#win-result', new ElementStub());
  nodes.set('#round-result-summary', new ElementStub());
  nodes.set('#tsumo', new ElementStub());
  nodes.set('#discard', new ElementStub());
  nodes.set('#selection-status', new ElementStub());
  for (const key of ['#ron-controls', '#ron-status', '#ron', '#pass-ron', '#local-game-controls']) {
    const node = new ElementStub(); node.hidden = true; nodes.set(key, node);
  }
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
      const exposed = nodes.get('#dora-indicators')!.children;
      assert.equal(exposed.length, 5);
      assert.ok(exposed.slice(1).every(slot => slot.className === 'dora-slot tile-back' && slot.innerHTML === '' && Object.keys(slot.dataset).length === 0));
      assert.equal(exposed[0].dataset.tileId, game.deadWall[4].id);
      assert.equal(exposed[0].children[1].innerHTML, tileSvgMarkup(game.deadWall[4].tile));
      const publicIds = [...nodes.values()].flatMap(node => node.children.flatMap(child => child.dataset.tileId ? [child.dataset.tileId] : []));
      for (const physical of game.deadWall.filter((_,i) => i !== 4)) assert.ok(!publicIds.includes(physical.id));
      for (const player of game.players.slice(1)) for (const physical of player.hand) assert.ok(!publicIds.includes(physical.id));
      renderSelection(game, null);
      const own = nodes.get('#player-hand')!.children;
      assert.equal(own.length, 14);
      assert.equal(own.filter(item => item.className === 'drawn-tile').length, 1);
      assert.deepEqual(own.map(item => item.dataset.tileId), [...game.players[0].hand].sort((a, b) => {
        const order = (tile: typeof a.tile) => tile.category === 'suited' ? ['man', 'pin', 'sou'].indexOf(tile.suit) * 9 + tile.rank - 1 : 27 + ['east', 'south', 'west', 'north', 'white', 'green', 'red'].indexOf(tile.honor);
        return order(a.tile) - order(b.tile) || a.id.localeCompare(b.id);
      }).map(tile => tile.id).concat(game.players[0].drawnTile!.id));
      const selfLabel = nodes.get('#label-0')!;
      assert.equal(selfLabel.children[0].textContent, '自分');
      assert.deepEqual(selfLabel.children[1].children.map(item => item.textContent), ['東', '・親']);
      assert.equal(selfLabel.children[2].textContent, '25,000点');
      assert.equal(selfLabel.children.length, 3);
      assert.equal(selfLabel.children[0].title, '自分');
      assert.equal(selfLabel.children[0].attributes['aria-label'], '自分');
      assert.equal(selfLabel.children[1].children.some(item => item.className === 'seat-status' || item.className === 'seat-self-marker'), false);
      for (const id of [1, 2, 3]) {
        const backs = nodes.get(`.concealed-hand[data-player-id="${id}"]`)!.children;
        assert.equal(backs.length, 13);
        assert.ok(backs.every(item => item.className === 'tile-back' && item.children.length === 0 && Object.keys(item.dataset).length === 0));
        const label = nodes.get(`#label-${id}`)!;
        assert.equal(label.children[0].textContent, `CPU${id}`);
        assert.equal(label.children[1].children[0].textContent, ['', '南', '西', '北'][id]);
        assert.equal(label.children[2].textContent, '25,000点');
      }
      assert.deepEqual(nodes.get('#wall-count')!.children.map(item => item.textContent), ['山69枚', '王牌 14枚']);
      assert.equal(nodes.get('#label-0')!.dataset.active, 'true');
      assert.ok([0, 1, 2, 3].every(id => nodes.get(`.river[data-player-id="${id}"]`)!.children.length === 0));
      const selected = game.players[0].drawnTile!;
      const snapshot = structuredClone(game);
      renderSelection(game, selected.id);
      assert.equal(own[13].children[0].attributes['aria-pressed'], 'true');
      assert.deepEqual(game, snapshot);
      renderSelection(game, game.players[0].hand[0].id);
      assert.equal(own[13].children[0].attributes['aria-pressed'], 'false');
      renderSelection(game, null);
      const stopped = discardTile(game, 0, selected.id);
      renderTable(stopped);
      renderSelection(stopped, null);
      assert.equal(nodes.get('#player-hand')!.children.length, 13);
      assert.ok(nodes.get('#player-hand')!.children.every(item => item.className !== 'drawn-tile' && item.children[0].disabled));
      const river = nodes.get('.river[data-player-id="0"]')!.children;
      assert.equal(river.length, 1);
      assert.equal(river[0].dataset.tileId, selected.id);
      assert.equal(nodes.get('#label-1')!.dataset.active, 'true');
      renderSelection({ ...stopped, phase: 'wall-exhausted' }, null);
      // Next loop renders a new game and proves old river and selection are cleared.
    }
    const summary = nodes.get('#round-result-summary')!;
    const exhausted = { ...startGame(seeded(91)), phase: 'wall-exhausted' as const };
    renderTable(exhausted);
    assert.equal(summary.hidden, true, 'an unsettled wall exhaustion must not publish a result summary');
    assert.equal(summary.children.length, 0);
    assert.ok(!summary.children.map(node => node.textContent).join('').includes('翻'));
    const unconfirmedFourKans = { ...exhausted, abortiveDraw: 'four-kans' as const };
    renderTable(unconfirmedFourKans);
    assert.equal(summary.hidden, true);
    renderTable(startGame(seeded(92)));
    assert.equal(summary.hidden, true);
    assert.equal(summary.children.length, 0);
    // Render all 18 entries for every seat, preserving state and DOM discard order.
    const game = startGame(seeded(42));
    const tiles = game.liveWall.slice(0, 18);
    const fullRivers = { ...game, players: game.players.map(player => ({ ...player, river: tiles })) };
    const snapshot = structuredClone(fullRivers);
    renderTable(fullRivers);
    for (const id of [0, 1, 2, 3]) {
      const items = nodes.get(`.river[data-player-id="${id}"]`)!.children;
      assert.deepEqual(items.map(item => item.dataset.tileId), tiles.map(tile => tile.id));
      assert.equal(new Set(items.map(item => `${item.dataset.riverRow},${item.dataset.riverColumn}`)).size, 18);
      for (const [index, item] of items.entries()) {
        const row = Math.floor(index / 6), col = index % 6;
        const expected = [[row+1,col+1], [6-col,row+1], [3-row,6-col], [col+1,3-row]][id];
        assert.deepEqual([Number(item.dataset.riverRow), Number(item.dataset.riverColumn)], expected.map(value => value - 1));
      }
    }
    assert.deepEqual(fullRivers, snapshot);
    // Every seat's visible tiles must stay at the same physical coordinates as
    // the completed 18-tile river. Empty earlier slots must not collapse.
    for (const isRiichi of [false, true]) {
      const displayGame = {
        ...fullRivers,
        players: fullRivers.players.map(player => ({
          ...player,
          riichi: isRiichi ? { declarationTileId: tiles[0].id } : player.riichi,
        })),
      };
      renderTable(displayGame);
      const completeOffsets = [0, 1, 2, 3].map(id =>
        nodes.get(`.river[data-player-id="${id}"]`)!.children.map(item => [item.style.left, item.style.top]));
      for (const count of [1, 6, 7, 12, 13, 18]) {
        renderTable({
          ...displayGame,
          players: displayGame.players.map(player => ({ ...player, river: player.river.slice(0, count) })),
        });
        for (const id of [0, 1, 2, 3]) {
          const items = nodes.get(`.river[data-player-id="${id}"]`)!.children;
          assert.deepEqual(items.map(item => [item.style.left, item.style.top]),
            completeOffsets[id].slice(0, count),
            `seat ${id}, ${count} river tiles, riichi=${isRiichi}`);
        }
      }
    }
    const eligible = tsumoGame();
    renderTable(eligible);
    renderSelection(eligible, eligible.players[0].hand[0].id);
    renderSelection(eligible, null, true);
    const won = declareTsumo(eligible, 0);
    renderTable(won); renderSelection(won, null);
    assert.equal(nodes.get('#player-hand')!.children.length, 14);
    assert.equal(nodes.get('#win-result')!.hidden, false);
    assert.ok(nodes.get('#win-result')!.children[0].children.some(c => c.textContent === 'ツモ和了！'));
    assert.ok(nodes.get('#win-result')!.children[0].children.some(c => c.textContent === '役合計：2翻'));
    assert.equal(nodes.get('#label-0')!.dataset.active, 'false');
    renderTable(startGame());
    assert.equal(nodes.get('#win-result')!.hidden, true);
    assert.equal(nodes.get('#win-result')!.children.length, 0);
  } finally { globalThis.document = original; }
});

test('confirmed draw publishes only tenpai CPU hands, summarizes settlement and filters detailed hands', () => {
  const nodes = new Map<string, ElementStub>();
  for (const id of [0, 1, 2, 3]) {
    nodes.set(`#label-${id}`, new ElementStub());
    nodes.set(`.river[data-player-id="${id}"]`, new ElementStub());
    if (id) nodes.set(`.concealed-hand[data-player-id="${id}"]`, new ElementStub());
  }
  for (const key of ['#player-hand', '#wall-count', '#win-result', '#round-result-summary', '#dora-indicators', '#selection-status',
    '#table-round', '#deposit-sticks', '#match-result', '#next-round']) nodes.set(key, new ElementStub());
  for (const key of ['#tsumo', '#discard', '#ron', '#pass-ron']) nodes.set(key, new ElementStub());
  for (const key of ['#ron-controls', '#ron-status', '#local-game-controls']) {
    const node = new ElementStub(); node.hidden = true; nodes.set(key, node);
  }
  const original = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) => nodes.get(selector),
    querySelectorAll: () => nodes.get('#player-hand')!.children.map(item => item.children[0]),
    createElement: (tag: string) => new ElementStub(tag),
    createTextNode: (text: string) => Object.assign(new ElementStub('#text'), { textContent: text }),
  } as unknown as Document;
  const descendants = (node: ElementStub): ElementStub[] => [node, ...node.children.flatMap(descendants)];
  try {
    const scenarios: readonly (readonly number[])[] = [[], [0], [1], [2], [3], [0, 2], [1, 2, 3], [0, 1, 2, 3]];
    for (const ready of scenarios) {
      const fixed = fixedRound(0, ready as (0 | 1 | 2 | 3)[]);
      const game = { ...fixed, players: fixed.players.map(player => ({ ...player, river: [] })) };
      renderTable(game);
      assert.equal(nodes.get('#round-result-summary')!.hidden, true, 'hand faces stay hidden until settlement is passed');
      for (const id of [1, 2, 3]) {
        const hand = nodes.get(`.concealed-hand[data-player-id="${id}"]`)!;
        assert.equal(hand.children.length, 13);
        assert.ok(hand.children.every(tile => tile.className === 'tile-back'));
      }

      const match = startMatch(game);
      const settlement = match.lastSettlement!;
      assert.deepEqual(settlement.tenpai, [0, 1, 2, 3].map(id => ready.includes(id)));
      renderTable(match.game, match.points, settlement);
      renderMatch(match);

      const expectedNames = ready.length === 0 ? 'なし' : ready.length === 4 ? '全員'
        : ready.map(id => ['自分', 'CPU1', 'CPU2', 'CPU3'][id]).join('・');
      const summary = nodes.get('#round-result-summary')!;
      assert.equal(summary.hidden, false);
      assert.deepEqual(summary.children.map(child => child.textContent), ['流局', `テンパイ：${expectedNames}`]);

      for (const id of [1, 2, 3]) {
        const hand = nodes.get(`.concealed-hand[data-player-id="${id}"]`)!;
        const player = match.game.players[id];
        const isTenpai = settlement.tenpai![id];
        const tiles = isTenpai ? hand.children : [];
        assert.equal(hand.children.length, 13);
        assert.equal(hand.children.filter(tile => tile.className === 'revealed-tile').length, isTenpai ? player.hand.length : 0);
        assert.equal(hand.children.filter(tile => tile.className === 'tile-back').length, isTenpai ? 0 : 13);
        if (isTenpai) {
          const sorted = [...player.hand].sort((a, b) => {
            const order = (tile: typeof a.tile) => tile.category === 'suited'
              ? ['man', 'pin', 'sou'].indexOf(tile.suit) * 9 + tile.rank - 1
              : 27 + ['east', 'south', 'west', 'north', 'white', 'green', 'red'].indexOf(tile.honor);
            return order(a.tile) - order(b.tile) || a.id.localeCompare(b.id);
          });
          assert.deepEqual(tiles.map(tile => tile.children[0].innerHTML), sorted.map(tile => tileSvgMarkup(tile.tile)));
        }
      }

      const rendered = [...nodes.values()].flatMap(descendants);
      for (const player of match.game.players.slice(1)) for (const tile of player.hand) {
        assert.ok(!rendered.some(node => node.dataset.tileId === tile.id), `concealed CPU ID ${tile.id} leaked into the DOM`);
      }

      const detail = nodes.get('#match-result')!;
      const detailNodes = descendants(detail);
      assert.equal(detailNodes.filter(node => node.className === 'winning-hand').length, ready.length);
      for (let id = 0; id < 4; id++) {
        assert.ok(detail.children.some(node => node.textContent === `${['自分', 'CPU1', 'CPU2', 'CPU3'][id]}：${ready.includes(id) ? 'テンパイ' : 'ノーテン'}`));
      }
    }

    const fixedFourKans = fixedRound(0, [1, 2]);
    const fourKans = { ...fixedFourKans, players: fixedFourKans.players.map(player => ({ ...player, river: [] })),
      abortiveDraw: 'four-kans' as const, kanCount: 4 };
    const aborted = startMatch(fourKans);
    assert.equal(aborted.lastSettlement!.reason, 'four-kans');
    assert.equal(aborted.lastSettlement!.tenpai, null);
    renderTable(aborted.game, aborted.points, aborted.lastSettlement);
    renderMatch(aborted);
    assert.deepEqual(nodes.get('#round-result-summary')!.children.map(child => child.textContent), ['途中流局（四開槓）']);
    assert.ok([1, 2, 3].every(id => nodes.get(`.concealed-hand[data-player-id="${id}"]`)!.children.every(tile => tile.className === 'tile-back')));
    assert.equal(descendants(nodes.get('#match-result')!).filter(node => node.className === 'winning-hand').length, 0);

    const readyMatch = startMatch(fixedRound(0, [1, 2, 3]));
    const next = nextRound(readyMatch);
    renderTable(next.game, next.points, next.lastSettlement);
    renderMatch(next);
    assert.equal(nodes.get('#round-result-summary')!.hidden, true);
    assert.equal(nodes.get('#match-result')!.hidden, true);
    assert.ok([1, 2, 3].every(id => nodes.get(`.concealed-hand[data-player-id="${id}"]`)!.children.every(tile => tile.className === 'tile-back')));
  } finally { globalThis.document = original; }
});

for (const id of [1, 2, 3] as const) test(`CPU${id} result publishes only winner, sorted thirteen plus accessible red winning draw, disables UI and resets`, async () => {
  const { cpuTsumoGame, cpuTsumoStart } = await import('./cpu-tsumo-fixture.ts');
  const nodes = new Map<string, ElementStub>();
  for (const seat of [0, 1, 2, 3]) {
    nodes.set(`#label-${seat}`, new ElementStub());
    nodes.set(`.river[data-player-id="${seat}"]`, new ElementStub());
    if (seat) nodes.set(`.concealed-hand[data-player-id="${seat}"]`, new ElementStub());
  }
  for (const key of ['#player-hand', '#wall-count', '#win-result', '#round-result-summary', '#dora-indicators', '#discard', '#tsumo', '#selection-status']) nodes.set(key, new ElementStub());
  for (const key of ['#ron-controls', '#ron-status', '#ron', '#pass-ron', '#local-game-controls']) {
    const node = new ElementStub(); node.hidden = true; nodes.set(key, node);
  }
  const original = globalThis.document;
  globalThis.document = {
    querySelector: (s: string) => nodes.get(s),
    querySelectorAll: () => nodes.get('#player-hand')!.children.map(c => c.children[0]),
    createElement: (tag: string) => new ElementStub(tag),
  } as unknown as Document;
  const descend = (n: ElementStub): ElementStub[] => [n, ...n.children.flatMap(descend)];
  const rendered = () => [...nodes.values()].flatMap(descend);
  try {
    // Red five is the actual winning tile; all three colors remain in inventory.
    const game = cpuTsumoGame(id, ['123m', '456m', '789p', '22p', '345s']);
    renderTable(game);
    for (const p of game.players.slice(1)) for (const t of [...p.hand, ...(p.drawnTile ? [p.drawnTile] : [])]) {
      assert.ok(!rendered().some(n => n.dataset.tileId === t.id));
    }
    const own = nodes.get('#player-hand')!.children.map(n => n.dataset.tileId);
    const won = declareTsumo(game, id);
    renderTable(won, undefined, startMatch(won).lastSettlement); renderSelection(won, null);
    const panel = nodes.get('#win-result')!;
    assert.equal(panel.hidden, false);
    const hand = panel.children[0].children.find(n => n.className === 'winning-hand')!;
    assert.equal(hand.tagName, 'ol'); assert.equal(hand.children.length, 14);
    const player = game.players[id];
    const order = (t: typeof player.hand[number]) => t.tile.category === 'suited'
      ? ['man', 'pin', 'sou'].indexOf(t.tile.suit) * 9 + t.tile.rank - 1
      : 27 + ['east','south','west','north','white','green','red'].indexOf(t.tile.honor);
    const sorted = [...player.hand].sort((a,b) => order(a)-order(b) || a.id.localeCompare(b.id));
    assert.ok(hand.children.every(n => n.dataset.tileId === undefined));
    assert.deepEqual(hand.children.map(n => n.children[0].innerHTML), [...sorted, player.drawnTile!].map(t => tileSvgMarkup(t.tile)));
    assert.equal(hand.children[13].className, 'winning-draw');
    assert.equal(hand.children[13].children[0].innerHTML, tileSvgMarkup(player.drawnTile!.tile));
    assert.match(hand.children[13].children[0].innerHTML, /aria-label="赤5索"/);
    const publicHand = nodes.get(`.concealed-hand[data-player-id="${id}"]`)!;
    assert.equal(publicHand.children.length, 14);
    assert.ok(publicHand.children.every(n => n.className.startsWith('revealed-tile')));
    assert.ok(publicHand.children.every(n => n.dataset.tileId === undefined));
    assert.equal(publicHand.children.at(-1)!.className, 'revealed-tile winning-tile');
    assert.equal(publicHand.children.at(-1)!.children[0].innerHTML, tileSvgMarkup(player.drawnTile!.tile));
    const summary = nodes.get('#round-result-summary')!;
    assert.equal(summary.hidden, false);
    const summaryText = descend(summary).map(n => n.textContent).join(' ');
    assert.ok(summaryText.includes(`CPU${id} ツモ`));
    assert.ok(summaryText.includes(`合計${won.winResult!.totalHanIncludingDora}翻`));
    assert.ok(summaryText.includes(`${won.winResult!.totalPoints.toLocaleString('en-US')}点`));
    assert.ok(!summaryText.includes('ドラ込み'));
    const summaryYaku = summary.children[0].children.find(n => n.className === 'round-summary-yaku')!.textContent;
    assert.equal(summaryYaku, [...won.winResult!.candidate.yaku.map(entry => yakuDisplayName(entry.id, 'summary')), 'ドラ1', '赤ドラ2'].join('・'));
    assert.ok(summaryYaku.includes('ツモ') && summaryYaku.includes('平和'));
    assert.ok(!summaryYaku.includes('門前清自摸和'));
    assert.ok(!descend(hand).some(n => n.tagName === 'button'));
    for (const other of [1, 2, 3].filter(seat => seat !== id)) {
      const concealed = nodes.get(`.concealed-hand[data-player-id="${other}"]`)!;
      assert.ok(concealed.children.every(n => n.className === 'tile-back' && n.children.length === 0 && Object.keys(n.dataset).length === 0));
    }
    for (const p of game.players.slice(1).filter(p => p.id !== id)) for (const t of p.hand) {
      assert.ok(!rendered().some(n => n.dataset.tileId === t.id));
    }
    assert.deepEqual(nodes.get('#player-hand')!.children.map(n => n.dataset.tileId), own);
    assert.ok(nodes.get('#player-hand')!.children.every(n => n.children[0].disabled));
    const text = descend(panel).map(n => n.textContent);
    assert.ok(text.includes(`CPU${id}（${['', '南','西','北'][id]}）`));
    for (const s of ['平和 1翻', '門前清自摸和 1翻', '通常ドラ：1枚（1翻）', '赤ドラ：2枚（2翻）', '合計：5翻']) assert.ok(text.includes(s));
    inventory(won, game);
    renderTable(cpuTsumoStart(id));
    assert.equal(panel.hidden, true); assert.equal(panel.children.length, 0);
    assert.equal(summary.hidden, true);
    assert.ok(publicHand.children.every(n => n.className === 'tile-back' && n.children.length === 0 && Object.keys(n.dataset).length === 0));
  } finally { globalThis.document = original; }
});

for (const scenario of ['waiting','human','double','triple','pass','pass-cpu','furiten','CPU1','CPU2','CPU3'] as const) {
  test(`ron DOM: ${scenario}, dedicated controls, shared red tile, independent winners and hidden others`, async () => {
    const { ronStart, ronGame, withRiverTile } = await import('./ron-fixture.ts');
    const { declareRon, passRon } = await import('../src/game/ron.ts');
    const nodes = new Map<string, ElementStub>();
    for (const id of [0,1,2,3]) {
      nodes.set(`#label-${id}`,new ElementStub());
      nodes.set(`.river[data-player-id="${id}"]`,new ElementStub());
      if (id) nodes.set(`.concealed-hand[data-player-id="${id}"]`,new ElementStub());
    }
    for (const key of ['#player-hand','#wall-count','#win-result','#round-result-summary','#dora-indicators','#discard','#tsumo','#selection-status','#ron-controls','#ron-status','#ron','#pass-ron','#local-game-controls']) nodes.set(key,new ElementStub());
    nodes.get('#ron-controls')!.hidden = true;
    nodes.get('#ron')!.disabled = true;
    const original = globalThis.document;
    globalThis.document = {
      querySelector:(s:string)=>nodes.get(s),
      querySelectorAll:()=>nodes.get('#player-hand')!.children.map(c=>c.children[0]),
      createElement:(tag:string)=>new ElementStub(tag),
    } as unknown as Document;
    const descend = (n:ElementStub):ElementStub[]=>[n,...n.children.flatMap(descend)];
    try {
      const winners = scenario === 'triple' ? [0,2,3] as const : scenario === 'double' || scenario === 'pass-cpu' ? [0,2] as const : [0] as const;
      let game = ronGame(1,winners);
      if (scenario === 'furiten') {
        const initial = withRiverTile(ronStart(),0,'sou-2');
        game = discardTile(initial,1,initial.players[1].drawnTile!.id);
      } else if (scenario.startsWith('CPU')) {
        const winner = Number(scenario.at(-1)) as 1|2|3;
        game = ronGame(((winner+3)%4) as 0|1|2,[winner]);
      } else if (scenario === 'pass' || scenario === 'pass-cpu') game = passRon(game,0);
      else if (scenario !== 'waiting') game = declareRon(game,0);
      const snapshot = structuredClone(game);
      renderTable(game, undefined, game.phase === 'won' ? startMatch(game).lastSettlement : null); renderSelection(game,null,true);
      assert.deepEqual(game,snapshot);
      const pending = scenario === 'waiting';
      const panelState = createLocalActionPanelState(startMatch(game), null, false, false);
      assert.equal(panelState.ronGroup.visible,pending);
      assert.equal(panelState.buttons.ron.enabled,pending);
      assert.equal(panelState.buttons['pass-ron'].enabled,pending);
      if (pending) {
        assert.match(panelState.ronGroup.status,/CPU1が赤5索を捨てました/);
        assert.equal(panelState.ronGroup.target?.tile.category,'suited');
      }
      assert.ok(nodes.get('#player-hand')!.children.every(c=>c.children[0].disabled));
      const panel = nodes.get('#win-result')!;
      assert.equal(panel.hidden,game.phase!=='won');
      const actualWinners = game.winResult?.winMethod==='ron' ? game.winResult.winners.map(w=>w.winnerId) : [];
      assert.deepEqual(panel.children.map(c=>Number(c.dataset.winnerId)),actualWinners);
      const summary = nodes.get('#round-result-summary')!;
      assert.equal(summary.hidden, game.phase !== 'won');
      assert.equal(summary.children.length, actualWinners.length);
      const ronResult = game.winResult?.winMethod === 'ron' ? game.winResult : null;
      for (const id of [1,2,3]) {
        const concealed = nodes.get(`.concealed-hand[data-player-id="${id}"]`)!;
        if (actualWinners.includes(id)) {
          const player = game.players[id];
          assert.equal(concealed.children.length, player.hand.length + 1);
          assert.ok(concealed.children.every(n => n.className.startsWith('revealed-tile')));
          assert.ok(concealed.children.every(n => n.dataset.tileId === undefined));
          assert.equal(concealed.children.at(-1)!.children[0].innerHTML, tileSvgMarkup(ronResult!.winningTile!.tile));
        } else {
          assert.ok(concealed.children.every(n => n.className === 'tile-back' && n.children.length === 0 && Object.keys(n.dataset).length === 0));
        }
      }
      for (const section of panel.children) {
        const list = section.children.find(c=>c.className==='winning-hand')!;
        assert.equal(list.children.length,14);
        assert.ok(list.children.every(n=>n.dataset.tileId===undefined));
        assert.equal(list.children[13].className,'winning-draw');
        assert.match(list.children[13].children[0].innerHTML,/aria-label="赤5索"/);
        assert.ok(!descend(section).some(n=>n.textContent.includes('門前清自摸和')));
      }
      const publicNodes = [...nodes.values()].flatMap(descend);
      if (game.winResult?.winMethod === 'ron') {
        assert.equal(allTiles(game).filter(tile=>tile.id===game.winResult!.winningTileId).length,1);
        assert.equal(publicNodes.filter(node=>node.dataset.tileId===game.winResult!.winningTileId).length,1);
      }
      for (const player of game.players.slice(1).filter(p=>!actualWinners.includes(p.id))) {
        for (const tile of player.hand) assert.ok(!publicNodes.some(n=>n.dataset.tileId===tile.id));
      }
      for (const tile of game.deadWall.filter((_,i)=>i!==4)) assert.ok(!publicNodes.some(n=>n.dataset.tileId===tile.id));
    } finally { globalThis.document = original; }
  });
}

for (const mode of ['plain', 'riichi', 'double', 'double-ron', 'triple-ron', 'plain-double-ron', 'plain-triple-ron'] as const) test(`result indicator visibility and reset: ${mode}`, () => {
  const nodes = new Map<string, ElementStub>();
  for (const id of [0, 1, 2, 3]) {
    nodes.set(`#label-${id}`, new ElementStub());
    nodes.set(`.river[data-player-id="${id}"]`, new ElementStub());
  }
  for (const key of ['#player-hand', '#wall-count', '#win-result', '#dora-indicators', '#ron-controls', '#ron-status', '#ron', '#pass-ron', '#local-game-controls']) nodes.set(key, new ElementStub());
  const original = globalThis.document;
  globalThis.document = { querySelector: (s: string) => nodes.get(s), createElement: (t: string) => new ElementStub(t) } as unknown as Document;
  try {
    const multi = mode.endsWith('-ron');
    let game = multi ? ronStart(1, mode.includes('double-ron') ? [0,2] : [0,2,3]) : tsumoGame();
    if (!mode.startsWith('plain')) {
      game = withRiverTile(game, 0, 'north');
      game = {...game, players: game.players.map(p => p.id === 0 ? {...p, riichi: {declarationTileId: p.river.at(-1)!.id, ippatsuEligible: false, doubleRiichi: mode === 'double'}} : p)};
    }
    renderTable(game);
    const walk = (n: ElementStub): ElementStub[] => [n, ...n.children.flatMap(walk)];
    const panel = nodes.get('#win-result')!;
    assert.equal(walk(panel).filter(n => n.className.includes('result-dora')).length, 0);
    const won = multi ? declareRon(discardTile(game, 1, game.players[1].drawnTile!.id), 0) : declareTsumo(game, 0);
    const snapshot = structuredClone(won);
    renderTable(won, undefined, startMatch(won).lastSettlement);
    assert.ok(panel.children.length > 0);
    for (const section of panel.children) {
      const rows = section.children.filter(n => n.className.startsWith('result-dora '));
      const entitled = !mode.startsWith('plain') && section.dataset.winnerId === '0';
      assert.equal(rows.length, entitled ? 2 : 1);
      for (const [i, row] of rows.entries()) {
        const slots = row.children[1].children;
        assert.equal(slots.length, 5);
        const tile = game.deadWall[i === 0 ? 4 : 5];
        assert.equal(slots[0].dataset.tileId, tile.id);
        assert.equal(slots[0].children[0].innerHTML, tileSvgMarkup(tile.tile));
        assert.ok(slots.slice(1).every(n => !n.children.length && !Object.keys(n.dataset).length));
      }
      if (!entitled) assert.ok(!JSON.stringify(walk(section).map(n => [n.dataset, n.attributes, n.textContent, n.innerHTML])).includes(game.deadWall[5].id));
    }
    const central = nodes.get('#dora-indicators')!;
    for (const kanCount of [0,1,2,3,4]) {
      renderTable({...game, kanCount});
      assert.equal(central.children.length, 5);
      renderTable({...won, kanCount});
      assert.equal(central.children.length, mode.startsWith('plain') ? 5 : 10);
      for (let i=0; i<5; i++) {
        assert.equal(central.children[i].dataset.tileId, i<=kanCount ? game.deadWall[4+i*2].id : undefined);
        assert.equal(central.children[5+i]?.dataset.tileId, !mode.startsWith('plain') && i<=kanCount ? game.deadWall[5+i*2].id : undefined);
      }
    }
    assert.deepEqual(won, snapshot);
    const reset = startGame();
    renderTable(reset);
    assert.deepEqual(panel.children, []);
    // Physical IDs are reused across games: compare against the new ura tile,
    // since the previous game's ura can legitimately be the new public indicator.
    assert.ok(!JSON.stringify(walk(nodes.get('#dora-indicators')!).map(n => [n.dataset, n.attributes])).includes(reset.deadWall[5].id));
  } finally { globalThis.document = original; }
});

for (const mode of ['discard', 'red', 'pending', 'ron', 'pass', 'reset', 'new-match', 'reload', 'seat0', 'seat1', 'seat2', 'seat3'] as const) test(`Step 13.5.1 public ron preview: ${mode}`, async () => {
  const { scenarioGame } = await import('../src/verification/scenarios.ts');
  const { declareKan, getKanOptions } = await import('../src/game/kan.ts');
  const { passRon } = await import('../src/game/ron.ts');
  const { ronGame } = await import('./ron-fixture.ts');
  const nodes = new Map<string, ElementStub>();
  for (const id of [0,1,2,3]) {
    nodes.set(`#label-${id}`, new ElementStub());
    nodes.set(`.river[data-player-id="${id}"]`, new ElementStub());
    nodes.set(`.open-melds[data-player-id="${id}"]`, new ElementStub());
  }
  for (const key of ['#player-hand','#wall-count','#win-result','#dora-indicators']) nodes.set(key,new ElementStub());
  const original=globalThis.document;
  globalThis.document={querySelector:(s:string)=>nodes.get(s), querySelectorAll:()=>nodes.get('#player-hand')!.children.map(c=>c.children[0]), createElement:(tag:string)=>new ElementStub(tag)} as unknown as Document;
  const walk=(n:ElementStub):ElementStub[]=>[n,...n.children.flatMap(walk)];
  try {
    const initial=scenarioGame('chankan');
    const pending=declareKan(initial,1,getKanOptions(initial,1)[0].id);
    let game=mode==='discard'||mode==='red'?ronGame(1,[0]):pending;
    const snapshot=structuredClone(game);
    renderTable(game);renderSelection(game,null);
    assert.deepEqual(game,snapshot);
    const physical=game.ronWindow!.kan?.tile ?? game.players[1].river.at(-1)!;
    const actionState=createLocalActionPanelState(startMatch(game),null,false,false);
    assert.equal(actionState.ronGroup.visible,true);
    assert.deepEqual(actionState.ronGroup.target?.tile,physical.tile);
    if(mode==='red') assert.match(actionState.ronGroup.status,/赤5索/);
    if(game===pending) {
      const group=nodes.get('.open-melds[data-player-id="1"]')!.children[0];
      assert.equal(group.dataset.meldType,'pon');assert.equal(group.dataset.kanPending,'true');
      const called=group.children.find(n=>n.className==='called-tile')!;
      assert.equal(group.children.filter(n=>n.children.length).length,3);
      const preview=called.children.find(n=>n.className.includes('pending-kan-tile'))!;
      assert.equal(preview.dataset.tileId,undefined);
      assert.equal(preview.children[0].innerHTML,tileSvgMarkup(physical.tile));
      assert.match(actionState.ronGroup.status,/CPU1が1萬を加カン/);
    }
    for(const p of game.players.slice(1)) for(const t of p.hand) assert.ok(![...nodes.values()].flatMap(walk).some(n=>n.dataset.tileId===t.id));
    inventory(game,mode==='discard'||mode==='red'?game:initial);
    if(mode==='ron') {game=declareRon(game,0);assert.equal(game.players[1].melds![0].type,'pon');}
    if(mode==='pass') {game=passRon(game,0);assert.equal(game.players[1].melds![0].type,'kakan');assert.equal(game.players[0].temporaryFuriten,true);}
    if(['reset','new-match','reload'].includes(mode)) game=scenarioGame('chankan');
    if(mode.startsWith('seat')) {
      const id=Number(mode.at(-1));
      game={...pending,players:pending.players.map(p=>({...p,melds:initial.players[1].melds})),ronWindow:{...pending.ronWindow!,kan:{...pending.ronWindow!.kan!,playerId:id as 0|1|2|3}}};
      renderTable(game);
      for(const seat of [0,1,2,3]) assert.equal(nodes.get(`.open-melds[data-player-id="${seat}"]`)!.children[0].dataset.kanPending,seat===id?'true':undefined);
    } else if(game!==pending && !['discard','red'].includes(mode)) {
      renderTable(game);renderSelection(game,null);
      const actionStateAfter=createLocalActionPanelState(startMatch(game),null,false,false);
      assert.equal(actionStateAfter.ronGroup.target,null);
      assert.equal(actionStateAfter.ronGroup.status,'');
      assert.ok(![...nodes.values()].flatMap(walk).some(n=>n.dataset.kanPending==='true'));
      if(mode==='ron') {
        const { allTiles }=await import('./helpers.ts');
        assert.deepEqual(allTiles(game).map(t=>t.id).sort(),allTiles(initial).map(t=>t.id).sort());
        assert.equal(new Set(allTiles(game).map(t=>t.id)).size,136);
      } else inventory(game,['reset','new-match','reload'].includes(mode)?game:initial);
    }
  } finally {globalThis.document=original;}
});

for (const source of [1,2,3] as const) test(`Step 13.5.2 added kan preserves pon footprint from seat ${source}`, async()=>{
  const {renderMelds}=await import('../src/rendering/melds.ts');
  const {scenarioGame}=await import('../src/verification/scenarios.ts');
  const {declareKan,getKanOptions}=await import('../src/game/kan.ts');
  const {passRon}=await import('../src/game/ron.ts');
  const initial=scenarioGame('chankan');
  const pending=declareKan(initial,1,getKanOptions(initial,1)[0].id);
  const confirmed=passRon(pending,0);
  const player=confirmed.players[1];
  const meld=player.melds![0];
  const original=globalThis.document;
  globalThis.document={createElement:(tag:string)=>new ElementStub(tag)} as unknown as Document;
  try {
    const container=new ElementStub();
    renderMelds(container as unknown as HTMLElement,{...player,id:0,melds:[{...meld,fromPlayerId:source}]});
    const group=container.children[0];
    assert.equal(group.children.length,3);
    const calledIndex=source===3?0:source===2?1:2;
    const called=group.children[calledIndex];
    assert.equal(called.className,'called-tile');
    assert.equal(group.style['--called-offset'],undefined);
    const added=called.children.find(n=>n.className.includes('added-kan-tile'))!;
    assert.ok(added);
    assert.equal(added.dataset.tileId,meld.addedTileId);
  } finally {globalThis.document=original;}
});

test('Step 13.5.2 chi retains numeric order and marks the acquired tile',async()=>{
  const {renderMelds}=await import('../src/rendering/melds.ts');
  const {callStart}=await import('./calls-fixture.ts');
  const {getCallOptions,declareCall}=await import('../src/game/calls.ts');
  let game=callStart(3,{0:['3467m','234p','678s','19p','1z']},'man-5');
  game=discardTile(game,3,game.players[3].drawnTile!.id);
  const option=getCallOptions(game,0).find(o=>o.type==='chi')!;
  game=declareCall(game,0,option.id);
  const original=globalThis.document;
  globalThis.document={createElement:(tag:string)=>new ElementStub(tag)} as unknown as Document;
  try {
    const container=new ElementStub();renderMelds(container as unknown as HTMLElement,game.players[0]);
    const meld=game.players[0].melds![0], group=container.children[0];
    assert.deepEqual(group.children.map(n=>n.dataset.tileId),meld.tiles.map(t=>t.id));
    assert.equal(group.children.find(n=>n.className==='called-tile')!.dataset.tileId,meld.calledTileId);
    assert.equal(group.dataset.fromDirection,'3');
  } finally {globalThis.document=original;}
});
