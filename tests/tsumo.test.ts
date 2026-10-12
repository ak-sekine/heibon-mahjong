import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDeclareTsumo, declareTsumo, selectTsumoCandidate } from '../src/game/tsumo.ts';
import { analyzeYaku } from '../src/analysis/yaku.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile, drawOrStop } from '../src/game/draw.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { GameController } from '../src/ui/controller.ts';
import { deal } from '../src/game/deal.ts';
import { reserveDeadWall } from '../src/game/wall.ts';
import type { PhysicalTile } from '../src/model/game.ts';
import { startGame } from '../src/game/start.ts';
import type { GameState, PlayerId } from '../src/model/game.ts';
import { allTiles, freeze, inventory } from './helpers.ts';
import { RED_PINFU, STANDARD, tsumoStart, tsumoGame } from './tsumo-fixture.ts';
import { SUITS } from '../src/model/tile.ts';
import { countRedDora } from '../src/analysis/dora.ts';

for (const [name, groups, last] of [
  ['standard with red five', STANDARD, false],
  ['seven pairs', ['2244m', '3355p', '226688s'], false],
  ['thirteen orphans', ['19m', '19p', '19s', '12345677z'], false],
  ['last live tile', STANDARD, true],
] as const) test(`declare tsumo: ${name}, immutable legal inventory and actual draw`, () => {
  const game = tsumoGame([...groups], last);
  const snapshot = structuredClone(game);
  freeze(game);
  assert.equal(canDeclareTsumo(game, 0), true);
  const won = declareTsumo(game, 0);
  assert.equal(won.phase, 'won');
  assert.notEqual(won, game);
  assert.deepEqual(game, snapshot);
  assert.equal(won.players, game.players);
  assert.equal(won.liveWall, game.liveWall);
  assert.equal(won.deadWall, game.deadWall);
  assert.equal(won.players[0].drawnTile, game.players[0].drawnTile);
  const result = won.winResult!;
  assert.equal(result.yakuHan, result.totalHan);
  assert.equal(result.redDoraCount, countRedDora([...game.players[0].hand, game.players[0].drawnTile!].map(t => t.tile)));
  assert.equal(result.redDoraHan, result.yakumanCount > 0 ? 0 : result.redDoraCount);
  assert.equal(result.totalHanIncludingDora, result.yakumanCount > 0 ? 0 : result.yakuHan + result.redDoraHan);
  assert.equal(result.winnerId, 0);
  assert.equal(result.winMethod, 'tsumo');
  assert.equal(result.winningTileId, game.players[0].drawnTile!.id);
  assert.deepEqual(result.analysis, analyzeYaku([...game.players[0].hand, game.players[0].drawnTile!].map(t => t.tile), {
    winMethod: 'tsumo', winningTile: game.players[0].drawnTile!.tile, seatWind: game.players[0].wind, roundWind: 'east',
  }));
  if (name === 'thirteen orphans') {
    assert.equal(result.totalHan, 0); assert.equal(result.yakumanCount, 1);
  } else {
    assert.ok(result.totalHan >= 1); assert.equal(result.yakumanCount, 0);
    assert.ok(result.candidate.yaku.some(y => y.id === 'menzen-tsumo'));
  }
  if (name === 'seven pairs') assert.equal(result.candidate.shape, 'seven-pairs');
  if (name === 'standard with red five') assert.ok(game.players[0].hand.some(t => t.tile.isRed));
  if (last) assert.equal(won.liveWall.length, 0);
  inventory(won, game);
});

test('menzen tsumo and pinfu keep two yaku han and add two red dora once', () => {
  const game = tsumoGame(RED_PINFU);
  const snapshot = structuredClone(game); freeze(game);
  const won = declareTsumo(game, 0), result = won.winResult!;
  assert.deepEqual(result.candidate.yaku.map(y => y.id).sort(), ['menzen-tsumo', 'pinfu']);
  assert.equal(result.candidate.totalHan, 2);
  assert.equal(result.totalHan, 2); assert.equal(result.yakuHan, 2);
  assert.equal(result.redDoraCount, 2); assert.equal(result.redDoraHan, 2);
  assert.equal(result.totalHanIncludingDora, 4);
  assert.deepEqual(game, snapshot); inventory(won, game);
});

test('the actual red winning draw is included in the bonus', () => {
  const game = tsumoGame(['123m', '678p', '234s', '22p', '345m']);
  assert.equal(game.players[0].drawnTile!.tile.isRed, true);
  const result = declareTsumo(game, 0).winResult!;
  assert.equal(result.redDoraCount, 1); assert.equal(result.redDoraHan, 1);
  assert.equal(result.totalHanIncludingDora, result.yakuHan + 1);
  inventory(game, game);
});

test('seven pairs and standard candidates share one physical hand bonus', () => {
  const game = tsumoGame(['11223344556677m']);
  const result = declareTsumo(game, 0).winResult!;
  assert.ok(result.analysis.candidates.some(c => c.shape === 'standard'));
  assert.ok(result.analysis.candidates.some(c => c.shape === 'seven-pairs'));
  assert.equal(result.redDoraCount, 1); assert.equal(result.redDoraHan, 1);
  assert.equal(result.totalHanIncludingDora, result.yakuHan + 1);
  assert.ok(result.analysis.candidates.every(c => c.yaku.every(y => !String(y.id).includes('dora'))));
  inventory(game, game);
});

test('red seven pairs add bonuses separately from chiitoitsu', () => {
  const game = tsumoGame(['1155m', '2255p', '335566s']);
  const result = declareTsumo(game, 0).winResult!;
  assert.equal(result.candidate.shape, 'seven-pairs');
  assert.ok(result.candidate.yaku.some(y => y.id === 'chiitoitsu' && y.han === 2));
  assert.equal(result.redDoraCount, 3); assert.equal(result.redDoraHan, 3);
  assert.equal(result.totalHanIncludingDora, result.yakuHan + 3);
  inventory(game, game);
});

test('kokushi remains one yakuman with no normal han or dora total', () => {
  const game = tsumoGame(['19m', '19p', '19s', '12345677z']);
  const result = declareTsumo(game, 0).winResult!;
  assert.equal(result.yakumanCount, 1);
  for (const value of [result.totalHan, result.yakuHan, result.redDoraCount, result.redDoraHan, result.totalHanIncludingDora]) assert.equal(value, 0);
  inventory(game, game);
});

for (const count of [0, 1, 2, 3]) test(`tsumo eligibility and candidate choice are independent of ${count} red dora`, () => {
  const groups = ['123m', '456m', '456p', '456s', '22p'];
  const game = tsumoGame(groups, false, SUITS.slice(0, count));
  const ordinary = declareTsumo(tsumoGame(groups, false, []), 0).winResult!;
  assert.equal(canDeclareTsumo(game, 0), true);
  const result = declareTsumo(game, 0).winResult!;
  assert.equal(result.redDoraCount, count);
  assert.deepEqual(result.analysis, ordinary.analysis);
  assert.equal(result.candidate.id, ordinary.candidate.id);
  const initial = tsumoStart(groups, false, SUITS.slice(0, count));
  assert.equal(canDeclareTsumo(initial, 0), false);
  inventory(game, game); inventory(initial, initial);
});

test('red bonuses do not make a supported-yaku-free shape a yaku', () => {
  const game = tsumoGame(RED_PINFU);
  const tiles = [...game.players[0].hand, game.players[0].drawnTile!].map(t => t.tile);
  // Ron on the pair removes menzen tsumo and pinfu; this engine supports no other yaku here.
  const analysis = analyzeYaku(tiles, { winMethod: 'ron', winningTile: { category: 'suited', suit: 'pin', rank: 2 }, seatWind: 'east', roundWind: 'east' });
  assert.equal(countRedDora(tiles), 2);
  assert.equal(analysis.isWinningShape, true); assert.equal(analysis.hasSupportedYaku, false);
  assert.equal(selectTsumoCandidate(analysis), null);
});

test('duplicate red physical tile is rejected before bonus counting', () => {
  const game = tsumoGame(RED_PINFU);
  const red = game.players[0].hand.find(t => t.tile.isRed)!;
  const invalid = { ...game, players: [{ ...game.players[0], drawnTile: red }, ...game.players.slice(1)] as GameState['players'] };
  const snapshot = structuredClone(invalid); freeze(invalid);
  assert.equal(canDeclareTsumo(invalid, 0), false);
  assert.throws(() => declareTsumo(invalid, 0), RangeError);
  assert.deepEqual(invalid, snapshot);
});

const replaceSelf = (game: GameState, change: Partial<GameState['players'][0]>): GameState => ({
  ...game, players: [{ ...game.players[0], ...change }, ...game.players.slice(1)] as GameState['players'],
});
const invalid: [string, (g: GameState) => GameState, PlayerId][] = [
  ['nonwinning', () => tsumoGame(['124578m', '124p', '789s', '11z']), 0],
  ['initial dealer winning fourteen', g => replaceSelf(g, { drawnTileSource: 'deal' }), 0],
  ['other turn', g => ({ ...g, turnPlayerId: 1 }), 0],
  ['CPU turn', g => ({ ...g, turnPlayerId: 1 }), 1],
  ['CPU control at self seat', g => replaceSelf(g, { control: 'cpu' }), 0],
  ['missing draw', g => replaceSelf(g, { drawnTile: null, drawnTileSource: null }), 0],
  ['twelve hand tiles', g => replaceSelf(g, { hand: g.players[0].hand.slice(1) }), 0],
  ['fourteen hand tiles', g => replaceSelf(g, { hand: [...g.players[0].hand, g.players[0].drawnTile!] }), 0],
  ['duplicate physical ID', g => replaceSelf(g, { drawnTile: g.players[0].hand[0] }), 0],
  ['exhausted', g => ({ ...g, phase: 'wall-exhausted' }), 0],
  ['already won', g => declareTsumo(g, 0), 0],
  ['unknown player', g => g, 9 as PlayerId],
];
for (const [name, update, id] of invalid) test(`reject tsumo: ${name}, state untouched`, () => {
  const game = update(tsumoGame());
  const snapshot = structuredClone(game); freeze(game);
  assert.equal(canDeclareTsumo(game, id), false);
  assert.throws(() => declareTsumo(game, id), RangeError);
  assert.deepEqual(game, snapshot);
});

test('provenance is explicit across deal, draw and either discard source', () => {
  const initial = tsumoStart();
  assert.equal(initial.winResult, null);
  assert.equal(initial.players[0].drawnTileSource, 'deal');
  assert.equal(canDeclareTsumo(initial, 0), false);
  for (const tile of [initial.players[0].drawnTile!, initial.players[0].hand[0]]) {
    const discarded = discardTile(initial, 0, tile.id);
    assert.equal(discarded.players[0].drawnTileSource, null);
    const drawn = drawTile(discarded, 1);
    assert.equal(drawn.players[1].drawnTileSource, 'live-wall');
  }
});

test('won prohibits all draws, all discards, double declarations and runner work; reset clears result', async () => {
  const game = tsumoGame(), won = declareTsumo(game, 0);
  freeze(won);
  for (const id of [0, 1, 2, 3] as const) {
    assert.throws(() => drawTile(won, id), RangeError);
    assert.throws(() => discardTile(won, id, won.players[id].hand[0].id), RangeError);
  }
  assert.throws(() => drawOrStop(won), RangeError);
  assert.throws(() => declareTsumo(won, 0), RangeError);
  const runner = new AutomaticTurnRunner({ wait: async () => assert.fail('unexpected wait') });
  await runner.run(() => won, () => assert.fail('unexpected write'));
  let initial = game;
  const ui = new GameController(() => initial);
  ui.select(game.players[0].hand[0].id);
  ui.declareTsumo();
  const stopped = ui.game;
  assert.equal(ui.selectedTileId, null);
  assert.equal(stopped.winResult!.winningTileId, game.players[0].drawnTile!.id);
  ui.declareTsumo(); await ui.confirm(); ui.select(game.players[0].hand[0].id);
  assert.equal(ui.game, stopped);
  initial = startGame(); ui.newGame();
  assert.equal(ui.game.winResult, null);
  assert.equal(ui.canTsumo, false);
  ui.select(ui.game.players[0].drawnTile!.id);
  assert.equal(ui.canConfirm, true);
});

test('winning opportunity is optional; discard ends it and next draw checks anew', async () => {
  const game = tsumoGame();
  const ui = new GameController(() => game, { wait: async () => {}, chooseDiscard: p => p.drawnTile!.id });
  assert.equal(ui.canTsumo, true);
  ui.select(game.players[0].drawnTile!.id);
  const promise = ui.confirm();
  assert.equal(ui.canTsumo, false);
  assert.equal(canDeclareTsumo(ui.game, 0), false);
  await promise;
  assert.equal(ui.canTsumo, true);
  assert.deepEqual(ui.game.players.map(p => p.river.length), [2, 2, 2, 2]);
});

test('candidate selection prefers yakuman, then han, then stable ID without mutating candidates', () => {
  const normal = declareTsumo(tsumoGame(), 0).winResult!.candidate;
  const yakuman = declareTsumo(tsumoGame(['19m', '19p', '19s', '12345677z']), 0).winResult!.candidate;
  const low = { ...normal, id: 'a', totalHan: 1 };
  const high = { ...normal, id: 'b', totalHan: 4 };
  const tie = { ...high, id: 'a' };
  const candidates = [high, low, tie]; freeze(candidates);
  const analysis = { isWinningShape: true, hasSupportedYaku: true, candidates };
  assert.equal(selectTsumoCandidate(analysis), tie);
  assert.equal(selectTsumoCandidate({ ...analysis, candidates: [...candidates, yakuman] }), yakuman);
  assert.equal(selectTsumoCandidate({ ...analysis, candidates: [{ ...normal, yaku: [] }] }), null);
});

test('completion notification sees idle runner and enables tsumo immediately after CPU3', async () => {
  const initial = tsumoStart();
  const notifications: { phase: string; progressing: boolean; eligible: boolean }[] = [];
  const pending: (() => void)[] = [];
  const ui = new GameController(() => initial, {
    wait: () => new Promise(resolve => pending.push(resolve)), chooseDiscard: p => p.drawnTile!.id,
    onChange: () => notifications.push({ phase: ui.game.phase, progressing: ui.progressing, eligible: ui.canTsumo }),
  });
  ui.select(initial.players[0].drawnTile!.id);
  const promise = ui.confirm();
  const during = ui.game;
  ui.declareTsumo(); await ui.confirm();
  assert.equal(ui.game, during);
  for (let i = 0; i < 3; i++) { pending.shift()!(); await Promise.resolve(); await Promise.resolve(); }
  await promise;
  assert.deepEqual(notifications.at(-1), { phase: 'awaiting-discard', progressing: false, eligible: true });
  ui.declareTsumo(); ui.declareTsumo();
  assert.equal(ui.game.phase, 'won');
  assert.equal(notifications.filter(n => n.phase === 'won').length, 1);
});

test('reset cancels stale writes and completion notifications, including a new won game', async () => {
  let initial = tsumoStart();
  const pending: { resolve: () => void; signal: AbortSignal }[] = [];
  let changes = 0;
  const ui = new GameController(() => initial, {
    wait: (_, signal) => new Promise(resolve => pending.push({ resolve, signal })), onChange: () => changes++,
  });
  ui.select(ui.game.players[0].drawnTile!.id);
  const oldRun = ui.confirm(), old = pending.shift()!;
  initial = tsumoGame(); ui.newGame(); ui.declareTsumo();
  const won = ui.game, count = changes;
  assert.equal(old.signal.aborted, true);
  old.resolve(); await oldRun;
  assert.equal(ui.game, won); assert.equal(changes, count); assert.equal(ui.progressing, false);
});

test('runner re-reads terminal state after a pending CPU wait and never writes a stale snapshot', async () => {
  let game = drawTile(discardTile(tsumoStart(), 0, tsumoStart().players[0].drawnTile!.id), 1);
  let resolve!: () => void;
  const runner = new AutomaticTurnRunner({ wait: () => new Promise(r => { resolve = r; }) });
  const promise = runner.run(() => game, () => assert.fail('stale write'));
  game = declareTsumo(tsumoGame(), 0);
  resolve(); await promise;
  assert.equal(game.phase, 'won');
});

test('a real dealer deal with a supported winning shape still cannot declare ordinary tsumo', () => {
  const drawn = tsumoGame();
  const desired = [...drawn.players[0].hand, drawn.players[0].drawnTile!];
  const selectedIds = new Set(desired.map(t => t.id));
  const remaining = allTiles(drawn).filter(t => !selectedIds.has(t.id));
  const wall: (PhysicalTile | undefined)[] = Array(136);
  desired.slice(0, 13).forEach((tile, i) => { wall[i * 4] = tile; });
  wall[52] = desired[13];
  for (let i = 0; i < 136; i++) if (!wall[i]) wall[i] = remaining.shift()!;
  const game = deal(reserveDeadWall(wall as PhysicalTile[]));
  const snapshot = structuredClone(game); freeze(game);
  assert.equal(game.players[0].drawnTileSource, 'deal');
  assert.equal(analyzeYaku(desired.map(t => t.tile), {
    winMethod: 'tsumo', winningTile: desired[13].tile, seatWind: 'east', roundWind: 'east',
  }).hasSupportedYaku, true);
  assert.equal(canDeclareTsumo(game, 0), false);
  assert.throws(() => declareTsumo(game, 0), RangeError);
  assert.deepEqual(game, snapshot); inventory(game, game);
});
