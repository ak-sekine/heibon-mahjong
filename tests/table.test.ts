import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ronStart, withRiverTile } from './ron-fixture.ts';
import { declareRon } from '../src/game/ron.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { startGame } from '../src/game/start.ts';
import { renderTable, renderSelection } from '../src/rendering/table.ts';
import { discardTile } from '../src/game/discard.ts';
import { SUITS } from '../src/model/tile.ts';
import { tileSvgMarkup, tileLabel } from '../src/rendering/tile-svg.ts';
import { doraKindFromIndicator } from '../src/analysis/dora.ts';
import { ordinaryTile } from '../src/model/tile.ts';
import { inventory } from './helpers.ts';

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

for (const count of [0, 1, 2, 3, 'zero-normal', 'yakuman'] as const) test(`result separates yaku and bonuses: ${count}`, () => {
  const nodes = new Map<string, ElementStub>();
  for (const id of [0, 1, 2, 3]) {
    nodes.set(`#label-${id}`, new ElementStub());
    nodes.set(`.river[data-player-id="${id}"]`, new ElementStub());
  }
  for (const key of ['#player-hand', '#wall-count', '#win-result', '#dora-indicators']) nodes.set(key, new ElementStub());
  for (const key of ['#ron-controls', '#ron-status', '#ron', '#pass-ron', '.discard-controls']) {
    const node = new ElementStub(); node.hidden = true; nodes.set(key, node);
  }
  const original = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) => nodes.get(selector),
    createElement: (tag: string) => new ElementStub(tag),
  } as unknown as Document;
  try {
    const game = count === 'yakuman'
      ? tsumoGame(['19m', '19p', '19s', '12345677z'], false, undefined, 'man-9')
      : tsumoGame(['123m', '456m', '456p', '22p', '456s'], false, SUITS.slice(0, count === 'zero-normal' ? 2 : count), count === 'zero-normal' ? 'sou-8' : 'man-4');
    const won = declareTsumo(game, 0);
    renderTable(won); inventory(won, game);
    const panel = nodes.get('#win-result')!;
    const strings = (node: ElementStub): string[] => [node.textContent, ...node.children.flatMap(strings)];
    const output = strings(panel);
    const list = panel.children[0].children.find(c => c.tagName === 'ul')!;
    assert.ok(!strings(list).some(s => s.includes('ドラ')));
    const exposed = nodes.get('#dora-indicators')!.children;
    assert.equal(exposed.length, 5);
    assert.ok(exposed.slice(1).every(slot => slot.className === 'dora-slot dora-placeholder' && slot.children.length === 0 && Object.keys(slot.dataset).length === 0));
    assert.equal(exposed[0].dataset.tileId, game.deadWall[4].id);
    assert.equal(exposed[0].children[1].innerHTML, tileSvgMarkup(game.deadWall[4].tile));
    assert.equal(exposed[0].children[2].textContent, `ドラ：\n${tileLabel(ordinaryTile(doraKindFromIndicator(game.deadWall[4].tile)))}`);
    assert.ok(output.some(s => s.startsWith('獲得点数：')));
    assert.ok(output.includes('支払い：'));
    assert.equal(output.includes('符の内訳'), count !== 'yakuman');
    if (count === 'yakuman') {
      assert.ok(output.includes('国士無双 1役満'));
      assert.ok(output.includes('役満：1役満'));
      assert.ok(!output.some(s => s.includes('翻') || s.includes('合計：') || s.includes('赤ドラ')));
    } else {
      assert.deepEqual(list.children.map(c => c.textContent).sort(), ['平和 1翻', '門前清自摸和 1翻']);
      assert.ok(output.includes('役合計：2翻'));
      const normal = count === 'zero-normal' ? 0 : 1, red = count === 'zero-normal' ? 2 : count;
      assert.ok(output.includes(`通常ドラ：${normal}枚（${normal}翻）`));
      assert.ok(output.includes(`赤ドラ：${red}枚（${red}翻）`));
      assert.ok(output.includes(`合計：${2 + normal + red}翻`));
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
  nodes.set('#tsumo', new ElementStub());
  nodes.set('#discard', new ElementStub());
  nodes.set('#selection-status', new ElementStub());
  for (const key of ['#ron-controls', '#ron-status', '#ron', '#pass-ron', '.discard-controls']) {
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
      assert.ok(exposed.slice(1).every(slot => slot.className === 'dora-slot dora-placeholder' && slot.children.length === 0 && Object.keys(slot.dataset).length === 0));
      assert.equal(exposed[0].dataset.tileId, game.deadWall[4].id);
      assert.equal(exposed[0].children[1].innerHTML, tileSvgMarkup(game.deadWall[4].tile));
      const publicIds = [...nodes.values()].flatMap(node => node.children.flatMap(child => child.dataset.tileId ? [child.dataset.tileId] : []));
      for (const physical of game.deadWall.filter((_,i) => i !== 4)) assert.ok(!publicIds.includes(physical.id));
      for (const player of game.players.slice(1)) for (const physical of player.hand) assert.ok(!publicIds.includes(physical.id));
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
        const backs = nodes.get(`.concealed-hand[data-player-id="${id}"]`)!.children;
        assert.equal(backs.length, 13);
        assert.ok(backs.every(item => item.className === 'tile-back' && item.children.length === 0 && Object.keys(item.dataset).length === 0));
        assert.match(nodes.get(`#label-${id}`)!.textContent, new RegExp(`^CPU${id} · ${['', '南', '西', '北'][id]} · 13枚$`));
      }
      assert.deepEqual(nodes.get('#wall-count')!.children.map(item => item.textContent), ['生きた牌山 69枚', '王牌 14枚']);
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
    // Render all 18 entries for every seat, preserving state and DOM discard order.
    const game = startGame(seeded(42));
    const tiles = game.liveWall.slice(0, 18);
    const fullRivers = { ...game, players: game.players.map(player => ({ ...player, river: tiles })) };
    const snapshot = structuredClone(fullRivers);
    renderTable(fullRivers);
    for (const id of [0, 1, 2, 3]) {
      const items = nodes.get(`.river[data-player-id="${id}"]`)!.children;
      assert.deepEqual(items.map(item => item.dataset.tileId), tiles.map(tile => tile.id));
      assert.equal(new Set(items.map(item => `${item.style.gridRow},${item.style.gridColumn}`)).size, 18);
      for (const [index, item] of items.entries()) {
        const row = Math.floor(index / 6), col = index % 6;
        const expected = [[row+1,col+1], [6-col,row+1], [3-row,6-col], [col+1,3-row]][id];
        assert.deepEqual([Number(item.style.gridRow), Number(item.style.gridColumn)], expected);
      }
    }
    assert.deepEqual(fullRivers, snapshot);
    const eligible = tsumoGame();
    renderTable(eligible);
    renderSelection(eligible, eligible.players[0].hand[0].id);
    assert.equal(nodes.get('#tsumo')!.disabled, false);
    renderSelection(eligible, null, true);
    assert.equal(nodes.get('#tsumo')!.disabled, true);
    const won = declareTsumo(eligible, 0);
    renderTable(won); renderSelection(won, null);
    assert.equal(nodes.get('#tsumo')!.disabled, true);
    assert.equal(nodes.get('#discard')!.disabled, true);
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

for (const id of [1, 2, 3] as const) test(`CPU${id} result publishes only winner, sorted thirteen plus accessible red winning draw, disables UI and resets`, async () => {
  const { cpuTsumoGame, cpuTsumoStart } = await import('./cpu-tsumo-fixture.ts');
  const nodes = new Map<string, ElementStub>();
  for (const seat of [0, 1, 2, 3]) {
    nodes.set(`#label-${seat}`, new ElementStub());
    nodes.set(`.river[data-player-id="${seat}"]`, new ElementStub());
  }
  for (const key of ['#player-hand', '#wall-count', '#win-result', '#dora-indicators', '#discard', '#tsumo', '#selection-status']) nodes.set(key, new ElementStub());
  for (const key of ['#ron-controls', '#ron-status', '#ron', '#pass-ron', '.discard-controls']) {
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
    renderTable(won); renderSelection(won, null);
    const panel = nodes.get('#win-result')!;
    assert.equal(panel.hidden, false);
    const hand = panel.children[0].children.find(n => n.className === 'winning-hand')!;
    assert.equal(hand.tagName, 'ol'); assert.equal(hand.children.length, 14);
    const player = game.players[id];
    const order = (t: typeof player.hand[number]) => t.tile.category === 'suited'
      ? ['man', 'pin', 'sou'].indexOf(t.tile.suit) * 9 + t.tile.rank - 1
      : 27 + ['east','south','west','north','white','green','red'].indexOf(t.tile.honor);
    const sorted = [...player.hand].sort((a,b) => order(a)-order(b) || a.id.localeCompare(b.id));
    assert.deepEqual(hand.children.map(n => n.dataset.tileId), [...sorted, player.drawnTile!].map(t => t.id));
    assert.equal(hand.children[13].className, 'winning-draw');
    assert.equal(hand.children[13].children[0].innerHTML, tileSvgMarkup(player.drawnTile!.tile));
    assert.match(hand.children[13].children[0].innerHTML, /aria-label="赤5索"/);
    assert.ok(!descend(hand).some(n => n.tagName === 'button'));
    for (const p of game.players.slice(1).filter(p => p.id !== id)) for (const t of p.hand) {
      assert.ok(!rendered().some(n => n.dataset.tileId === t.id));
    }
    assert.deepEqual(nodes.get('#player-hand')!.children.map(n => n.dataset.tileId), own);
    assert.ok(nodes.get('#player-hand')!.children.every(n => n.children[0].disabled));
    assert.equal(nodes.get('#discard')!.disabled, true); assert.equal(nodes.get('#tsumo')!.disabled, true);
    const text = descend(panel).map(n => n.textContent);
    assert.ok(text.includes(`CPU${id}（${['', '南','西','北'][id]}）`));
    for (const s of ['平和 1翻', '門前清自摸和 1翻', '通常ドラ：1枚（1翻）', '赤ドラ：2枚（2翻）', '合計：5翻']) assert.ok(text.includes(s));
    assert.equal(nodes.get('#selection-status')!.textContent, `CPU${id}がツモ和了！`);
    inventory(won, game);
    renderTable(cpuTsumoStart(id));
    assert.equal(panel.hidden, true); assert.equal(panel.children.length, 0);
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
    }
    for (const key of ['#player-hand','#wall-count','#win-result','#dora-indicators','#discard','#tsumo','#selection-status','#ron-controls','#ron-status','#ron','#pass-ron','.discard-controls']) nodes.set(key,new ElementStub());
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
      renderTable(game); renderSelection(game,null,true);
      assert.deepEqual(game,snapshot);
      const pending = scenario === 'waiting';
      assert.equal(nodes.get('#ron-controls')!.hidden,!pending);
      assert.equal(nodes.get('#ron')!.disabled,!pending);
      assert.equal(nodes.get('#pass-ron')!.disabled,!pending);
      if (pending) {
        assert.equal(nodes.get('#ron')!.focused,true);
        assert.match(nodes.get('#ron-status')!.textContent,/CPU1が赤5索を捨てました/);
      }
      assert.equal(nodes.get('#discard')!.disabled,true); assert.equal(nodes.get('#tsumo')!.disabled,true);
      assert.ok(nodes.get('#player-hand')!.children.every(c=>c.children[0].disabled));
      const panel = nodes.get('#win-result')!;
      assert.equal(panel.hidden,game.phase!=='won');
      const actualWinners = game.winResult?.winMethod==='ron' ? game.winResult.winners.map(w=>w.winnerId) : [];
      assert.deepEqual(panel.children.map(c=>Number(c.dataset.winnerId)),actualWinners);
      for (const section of panel.children) {
        const list = section.children.find(c=>c.className==='winning-hand')!;
        assert.equal(list.children.length,14);
        assert.equal(list.children[13].dataset.tileId,game.winResult!.winningTileId);
        assert.equal(list.children[13].className,'winning-draw');
        assert.match(list.children[13].children[0].innerHTML,/aria-label="赤5索"/);
        assert.ok(!descend(section).some(n=>n.textContent.includes('門前清自摸和')));
      }
      const publicNodes = [...nodes.values()].flatMap(descend);
      for (const player of game.players.slice(1).filter(p=>!actualWinners.includes(p.id))) {
        for (const tile of player.hand) assert.ok(!publicNodes.some(n=>n.dataset.tileId===tile.id));
      }
      for (const tile of game.deadWall.filter((_,i)=>i!==4)) assert.ok(!publicNodes.some(n=>n.dataset.tileId===tile.id));
    } finally { globalThis.document = original; }
  });
}

for (const mode of ['plain', 'riichi', 'double', 'double-ron', 'triple-ron'] as const) test(`result indicator visibility and reset: ${mode}`, () => {
  const nodes = new Map<string, ElementStub>();
  for (const id of [0, 1, 2, 3]) {
    nodes.set(`#label-${id}`, new ElementStub());
    nodes.set(`.river[data-player-id="${id}"]`, new ElementStub());
  }
  for (const key of ['#player-hand', '#wall-count', '#win-result', '#dora-indicators', '#ron-controls', '#ron-status', '#ron', '#pass-ron', '.discard-controls']) nodes.set(key, new ElementStub());
  const original = globalThis.document;
  globalThis.document = { querySelector: (s: string) => nodes.get(s), createElement: (t: string) => new ElementStub(t) } as unknown as Document;
  try {
    const multi = mode.endsWith('-ron');
    let game = multi ? ronStart(1, mode === 'double-ron' ? [0,2] : [0,2,3]) : tsumoGame();
    if (mode !== 'plain') {
      game = withRiverTile(game, 0, 'north');
      game = {...game, players: game.players.map(p => p.id === 0 ? {...p, riichi: {declarationTileId: p.river.at(-1)!.id, ippatsuEligible: false, doubleRiichi: mode === 'double'}} : p)};
    }
    renderTable(game);
    const walk = (n: ElementStub): ElementStub[] => [n, ...n.children.flatMap(walk)];
    const panel = nodes.get('#win-result')!;
    assert.equal(walk(panel).filter(n => n.className.includes('result-dora')).length, 0);
    const won = multi ? declareRon(discardTile(game, 1, game.players[1].drawnTile!.id), 0) : declareTsumo(game, 0);
    const snapshot = structuredClone(won);
    renderTable(won);
    assert.ok(panel.children.length > 0);
    for (const section of panel.children) {
      const rows = section.children.filter(n => n.className.startsWith('result-dora '));
      const entitled = mode !== 'plain' && section.dataset.winnerId === '0';
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
  for (const key of ['#player-hand','#wall-count','#win-result','#dora-indicators','#discard','#tsumo','#selection-status','#ron-controls','#ron-status','#ron-target','#ron','#pass-ron','.discard-controls']) nodes.set(key,new ElementStub());
  nodes.get('#ron-controls')!.hidden=true;
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
    const target=nodes.get('#ron-target')!;
    const physical=game.ronWindow!.kan?.tile ?? game.players[1].river.at(-1)!;
    assert.equal(target.children[0].innerHTML,tileSvgMarkup(physical.tile));
    assert.equal(target.children[0].attributes['aria-hidden'],'true');
    assert.equal(target.children[0].dataset.tileId,undefined);
    if(mode==='red') assert.match(target.children[0].innerHTML,/赤5索/);
    if(game===pending) {
      const group=nodes.get('.open-melds[data-player-id="1"]')!.children[0];
      assert.equal(group.dataset.meldType,'pon');assert.equal(group.dataset.kanPending,'true');
      assert.equal(group.children.filter(n=>n.children.length).length,4);
      assert.equal(group.children[3].dataset.tileId,undefined);
      assert.match(group.children[3].className,/pending-kan-tile/);
      assert.equal(group.children[3].children[0].innerHTML,tileSvgMarkup(physical.tile));
      assert.match(nodes.get('#ron-status')!.textContent,/CPU1が1萬を加カン/);
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
      assert.equal(target.children.length,0);
      assert.equal(nodes.get('#ron-status')!.textContent,'');
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
    assert.equal(group.children.length,4);
    const calledIndex=source===3?0:source===2?1:2;
    assert.equal(group.children[calledIndex].className,'called-tile');
    assert.equal(group.style['--called-offset'],`calc(${calledIndex} * (var(--table-tile-width) + 1px))`);
    assert.match(group.children[3].className,/added-kan-tile/);
    assert.equal(group.children[3].dataset.tileId, meld.type==='kakan'?meld.addedTileId:undefined);
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
