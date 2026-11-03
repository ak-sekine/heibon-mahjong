import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAME_RULES, normalizeGameRules, saveLastGameRules, loadLastGameRules, GAME_RULES_STORAGE_KEY } from '../src/model/rules.ts';
import { startMatch, updateMatchGame } from '../src/game/match.ts';
import { canDeclareKyuushuKyuuhai, declareKyuushuKyuuhai, isFourWindsDraw } from '../src/game/special-draws.ts';
import { resolveDiscardCalls } from '../src/game/calls.ts';
import { startGame } from '../src/game/start.ts';
import type { GameState } from '../src/model/game.ts';
import { fixedRound, fixedRon } from './match-fixture.ts';
import { kanGame } from './kan-fixture.ts';
import { getKanOptions, declareKan, canTakeRinshan } from '../src/game/kan.ts';
import { exposedDoraIndicators } from '../src/game/dora.ts';
import { childKyuushuGame } from './step13-10-fixture.ts';
import { nagashiGame } from './step13-10-fixture.ts';
import { startOnlineGame, startNextOnlineRound, hydrateOnlineGame } from '../src/online/game-engine.ts';
import type { OnlineGameSession } from '../src/online/game-view.ts';

test('GameRules v1-v5 data normalize to v6 standard defaults and the difficulty setting persists', () => {
  const v3 = { schemaVersion: 3, matchFormat: 'tonnan', redDora: false, kuitan: false, uraDora: true, ippatsu: false, kanDora: false };
  assert.deepEqual(normalizeGameRules(v3), { ...DEFAULT_GAME_RULES, ...v3, schemaVersion: 6,
    dealerTenpaiRenchan: true, kyuushuKyuuhai: true, fourWinds: true, fourRiichi: true, fourKans: true,
    agariYame: false, tenpaiYame: false });
  const selected = { ...DEFAULT_GAME_RULES, dealerTenpaiRenchan: false, kyuushuKyuuhai: false,
    fourWinds: false, fourRiichi: false, fourKans: false, agariYame: true, tenpaiYame: true,
    renhou: 'mangan' as const, pao: true, doubleYakuman: true, multipleRon: false, tripleRonAbortiveDraw: true };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  assert.equal(saveLastGameRules(selected, storage), true);
  assert.equal(JSON.parse(values.get(GAME_RULES_STORAGE_KEY)!).version, 6);
  assert.deepEqual(loadLastGameRules(storage), selected);
  for (const [key, value] of [
    ['dealerTenpaiRenchan', false], ['kyuushuKyuuhai', false], ['fourWinds', false], ['fourRiichi', false],
    ['fourKans', false], ['agariYame', true], ['tenpaiYame', true], ['renhou', 'mangan'], ['pao', true],
    ['doubleYakuman', true], ['multipleRon', false], ['tripleRonAbortiveDraw', true],
  ] as const) {
    const one = { ...DEFAULT_GAME_RULES, [key]: value };
    saveLastGameRules(one, storage);
    assert.deepEqual(loadLastGameRules(storage), one, `${key} is independent and persistent`);
  }
});

for (const [on, nextDealer] of [[true, 0], [false, 1]] as const) test(`dealer tenpai draw renchan=${on}: unchanged noten settlement, honba and deposits`, () => {
  const rules = { ...DEFAULT_GAME_RULES, dealerTenpaiRenchan: on };
  const started = startMatch(startGame(), rules);
  const match = updateMatchGame({ ...started, honba: 2, points: [24000, 25000, 25000, 25000], depositSticks: 1 }, fixedRound(0, [0]));
  assert.deepEqual(match.lastSettlement!.tenpai, [true, false, false, false]);
  assert.equal(match.lastSettlement!.payments.reduce((sum, payment) => sum + payment.notenPoints, 0), 3000);
  assert.equal(match.depositSticks, 1);
  assert.equal(match.lastSettlement!.next!.dealerId, nextDealer);
  assert.equal(match.lastSettlement!.next!.honba, 3);
});

test('dealer-tenpai rule does not change child or dealer win renchan', () => {
  for (const result of [fixedRon(0, [1]), fixedRon(0, [0])]) {
    const match = updateMatchGame(startMatch(startGame(), { ...DEFAULT_GAME_RULES, dealerTenpaiRenchan: false }), result);
    assert.equal(match.lastSettlement!.next!.dealerId, result.winResult!.winMethod === 'ron' && result.winResult!.winners.some(w => w.winnerId === 0) ? 0 : 1);
  }
});

test('CPU difficulty and local rules survive online creation, persisted reconnect state and a rematch round', () => {
  const rules = { ...DEFAULT_GAME_RULES, dealerTenpaiRenchan: false, kyuushuKyuuhai: false,
    fourWinds: false, fourRiichi: false, fourKans: false, agariYame: true, tenpaiYame: true,
    cpuDifficulty: 'advanced' as const, renhou: 'mangan' as const, pao: true, doubleYakuman: true, multipleRon: false, tripleRonAbortiveDraw: true };
  const identities = [0, 1, 2, 3].map(seat => ({ seat: seat as 0 | 1 | 2 | 3, name: `Player ${seat}`, control: 'human' as const, connected: true })) as OnlineGameSession['identities'];
  const created = startOnlineGame(identities, 0, () => 0.5, rules);
  assert.deepEqual(created.match.rules, rules);
  const reconnected = hydrateOnlineGame(JSON.stringify(created));
  assert.ok(reconnected);
  assert.deepEqual(reconnected.match.rules, rules);
  const ended = updateMatchGame(reconnected.match, fixedRound(0, [1]));
  const roundEnded = { ...reconnected, status: 'round-ended' as const, match: ended, gameRevision: reconnected.gameRevision + 1 };
  const rematch = startNextOnlineRound(roundEnded, () => 0.5);
  assert.deepEqual(rematch.match.rules, rules);
  assert.deepEqual(rematch.match.game.rules, rules);
});

for (const [format, wind] of [['tonpu', 'east'], ['tonnan', 'south']] as const) for (const enabled of [false, true]) test(`${format} final dealer win agari-yame=${enabled}`, () => {
  const rules = { ...DEFAULT_GAME_RULES, matchFormat: format, agariYame: enabled };
  const match = startMatch(startGame(), rules);
  const final = { ...match, roundNumber: 4, roundWind: wind };
  const settled = updateMatchGame(final, fixedRon(0, [0]));
  assert.equal(settled.lastSettlement!.reason, 'ron');
  assert.equal(settled.lastSettlement!.after[0], settled.points[0]);
  assert.equal(settled.status === 'match-ended', enabled);
  assert.equal(settled.lastSettlement!.next === null, enabled);
  if (!enabled) assert.equal(settled.lastSettlement!.next!.dealerId, 0);
});

test('agari-yame requires a strict post-settlement sole lead; tied or second-place dealer continues', () => {
  const rules = { ...DEFAULT_GAME_RULES, agariYame: true };
  const base = startMatch(startGame(), rules);
  const final = { ...base, roundNumber: 4, roundWind: 'east' as const };
  const tied = updateMatchGame({ ...final, points: [20000, 25800, 25800, 28400] }, fixedRon(0, [0]));
  assert.equal(tied.status, 'round-ended');
  assert.equal(tied.lastSettlement!.after[0], 25800);
  assert.equal(tied.lastSettlement!.after[1], 25800);
  const behind = updateMatchGame({ ...final, points: [15000, 45000, 20000, 20000] }, fixedRon(0, [0]));
  assert.equal(behind.status, 'round-ended');
  assert.equal(behind.lastSettlement!.next!.dealerId, 0);
});

test('dealer nagashi mangan uses existing parent-win continuation then applies agari-yame after settlement', () => {
  const match = startMatch(startGame(), { ...DEFAULT_GAME_RULES, agariYame: true });
  const final = { ...match, roundNumber: 4, roundWind: 'east' as const };
  const settled = updateMatchGame(final, nagashiGame([0]));
  assert.equal(settled.lastSettlement!.reason, 'nagashi-mangan');
  assert.ok(settled.lastSettlement!.after[0] > Math.max(...settled.lastSettlement!.after.slice(1)));
  assert.equal(settled.status, 'match-ended');
  assert.equal(settled.lastSettlement!.next, null);
});

test('agari-yame checks the post-settlement balance after existing riichi deposits are awarded', () => {
  const match = startMatch(startGame(), { ...DEFAULT_GAME_RULES, agariYame: true });
  const final = { ...match, roundNumber: 4, roundWind: 'east' as const,
    points: [20000, 25800, 25800, 27400] as const, depositSticks: 1 };
  const settled = updateMatchGame(final, fixedRon(0, [0]));
  assert.deepEqual(settled.lastSettlement!.deposits, { recipientId: 0, points: 1000 });
  assert.equal(settled.points[0], 26800);
  assert.equal(settled.status, 'match-ended');
});

for (const [format, wind] of [['tonpu', 'east'], ['tonnan', 'south']] as const) for (const enabled of [false, true]) test(`${format} final dealer tenpai draw tenpai-yame=${enabled}`, () => {
  const rules = { ...DEFAULT_GAME_RULES, matchFormat: format, tenpaiYame: enabled };
  const match = startMatch(startGame(), rules);
  const final = { ...match, roundNumber: 4, roundWind: wind };
  const settled = updateMatchGame(final, fixedRound(0, [0]));
  assert.equal(settled.lastSettlement!.reason, 'draw');
  assert.deepEqual(settled.lastSettlement!.tenpai, [true, false, false, false]);
  assert.equal(settled.status === 'match-ended', enabled);
  assert.equal(settled.lastSettlement!.next === null, enabled);
});

test('tenpai-yame requires the renchan rule and a strict sole lead after noten payments', () => {
  const final = { ...startMatch(startGame(), { ...DEFAULT_GAME_RULES, tenpaiYame: true }), roundNumber: 4, roundWind: 'east' as const };
  const tied = updateMatchGame({ ...final, points: [22000, 26000, 26000, 26000] }, fixedRound(0, [0]));
  assert.equal(tied.status, 'round-ended');
  assert.deepEqual(tied.points, [25000, 25000, 25000, 25000]);
  const renchanOff = updateMatchGame({ ...final, rules: { ...final.rules!, dealerTenpaiRenchan: false } }, fixedRound(0, [0]));
  assert.equal(renchanOff.status, 'match-ended');
  assert.equal(renchanOff.lastSettlement!.next, null);
  assert.equal(renchanOff.lastSettlement!.dealerId, 0);
});

test('abortive final draw never triggers tenpai-yame or agari-yame', () => {
  const rules = { ...DEFAULT_GAME_RULES, tenpaiYame: true, agariYame: true };
  const match = startMatch(startGame(), rules);
  const final = { ...match, roundNumber: 4, roundWind: 'east' as const };
  const special = { ...fixedRound(0, [0]), abortiveDraw: 'four-winds' as const };
  const settled = updateMatchGame(final, special);
  assert.equal(settled.status, 'round-ended');
  assert.equal(settled.lastSettlement!.reason, 'four-winds');
  assert.equal(settled.lastSettlement!.next!.dealerId, 0);
});

function windsGame(enabled: boolean, phase: 'awaiting-draw' | 'awaiting-call'): GameState {
  const source = startMatch(startGame(), { ...DEFAULT_GAME_RULES, fourWinds: enabled }).game;
  const tiles = [...source.players.flatMap(player => [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]), ...source.liveWall, ...source.deadWall]
    .filter(tile => tile.tile.category === 'honor' && tile.tile.honor === 'east').slice(0, 4);
  assert.equal(tiles.length, 4);
  const players = source.players.map((player, seat) => ({ ...player, drawnTile: null, drawnTileSource: null,
    river: seat < 3 ? [tiles[seat]] : [tiles[3]], discardHistory: seat < 3 ? [tiles[seat]] : [tiles[3]],
  })) as typeof source.players;
  const call = phase === 'awaiting-call';
  return { ...source, players, phase, callsMade: false, kanCount: 0,
    ...(call ? { ronWindow: { discarderId: 3 as const, tileId: tiles[3].id } } : { ronWindow: null }) };
}

test('four winds OFF keeps call processing and the next draw alive after the fourth first discard', () => {
  const on = windsGame(true, 'awaiting-draw');
  const off = windsGame(false, 'awaiting-call');
  assert.equal(isFourWindsDraw(on), true);
  assert.equal(isFourWindsDraw(off), false);
  const passed = resolveDiscardCalls(off);
  assert.equal(passed.abortiveDraw, undefined);
  assert.equal(passed.phase, 'awaiting-draw');
});

test('九種九牌 OFF removes declaration availability and rejects direct declaration', () => {
  const source = childKyuushuGame();
  const game = startMatch(source, { ...DEFAULT_GAME_RULES, kyuushuKyuuhai: false }).game;
  assert.equal(canDeclareKyuushuKyuuhai(game, game.turnPlayerId), false);
  assert.throws(() => declareKyuushuKyuuhai(game, game.turnPlayerId), RangeError);
});

test('four-riichi OFF establishes the fourth riichi and deposit without interrupting the hand', () => {
  for (const fourRiichi of [true, false]) {
    const match = startMatch(startGame(), { ...DEFAULT_GAME_RULES, fourRiichi });
    const players = match.game.players.map(player => ({ ...player,
      river: [player.hand[0]], discardHistory: [player.hand[0]],
      riichi: player.id === 3 ? null : { declarationTileId: player.hand[0].id, passedRon: false, ippatsuEligible: false },
    })) as typeof match.game.players;
    const game = { ...match.game, phase: 'awaiting-draw' as const, players, pendingRiichi: { playerId: 3 as const, declarationTileId: players[3].hand[0].id } };
    const resolved = updateMatchGame({ ...match, game }, game);
    assert.equal(resolved.depositSticks, 1);
    assert.equal(resolved.game.players.every(player => player.riichi), true);
    assert.equal(resolved.game.abortiveDraw, fourRiichi ? 'four-riichi' : undefined);
    assert.equal(resolved.status, fourRiichi ? 'round-ended' : 'playing');
  }
});

test('four-kans OFF completes the fourth distributed kan and keeps fifth-kan cap', () => {
  const rules = { ...DEFAULT_GAME_RULES, fourKans: false };
  const source = kanGame({ hands: { 0: ['444z', '234m', '456p', '5z'] },
    melds: { 0: [{ type: 'ankan', group: '1111z' }], 1: [{ type: 'ankan', group: '2222z' }, { type: 'ankan', group: '3333z' }] },
    draw: 'north', rinshan: ['sou-9', 'pin-9', 'man-9', 'white'] });
  const game = { ...source, rules };
  const result = declareKan(game, 0, getKanOptions(game, 0)[0].id);
  assert.equal(result.kanCount, 4);
  assert.equal(result.phase, 'awaiting-discard');
  assert.equal(result.abortiveDraw, undefined);
  assert.equal(result.players[0].drawnTile, source.deadWall[3]);
  assert.equal(exposedDoraIndicators(result, rules).length, 5);
  assert.equal(canTakeRinshan(result), false);
});
