import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateMatchGame, startMatch } from '../src/game/match.ts';
import { isRenhouState } from '../src/game/first-turn-wins.ts';
import { resolveDiscardRon, getRonCandidates, declareRon } from '../src/game/ron.ts';
import { discardTileForOnline } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { getCallOptions } from '../src/game/calls.ts';
import { discardTile } from '../src/game/discard.ts';
import { evaluateWin } from '../src/game/win.ts';
import { DEFAULT_GAME_RULES, normalizeGameRules, saveLastGameRules, loadLastGameRules, type RulesStorage } from '../src/model/rules.ts';
import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';
import { tileKindKey } from '../src/model/tile.ts';
import { ronStart } from './ron-fixture.ts';

const noYakuHand = ['123m', '456m', '789p', '456s', '2p'];
const v = (options: { hand?: readonly string[]; tile?: string; indicator?: string } = {}) => {
  const rules = { ...DEFAULT_GAME_RULES, renhou: 'mangan' as const };
  const initial = { ...ronStart(1, [0], options.hand ? [options.hand] : undefined,
    options.tile ?? 'sou-5', false, options.indicator ?? 'sou-4'), rules };
  return discardTile(initial, 1, initial.players[1].drawnTile!.id);
};
function playerChange(game: GameState, id: PlayerId, change: Partial<PlayerState>): GameState {
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[id] = { ...players[id], ...change };
  return { ...game, players };
}

test('Issue #38: first-discard ron before a child first draw accepts no-yaku hand as fixed mangan', () => {
  const game = v({ hand: noYakuHand, tile: 'pin-2', indicator: 'pin-1' });
  assert.equal(isRenhouState(game, 0), true);
  const candidate = getRonCandidates(game).find(win => win.winnerId === 0)!;
  assert.ok(candidate);
  assert.deepEqual(candidate.candidate.yaku.map(yaku => yaku.id), ['renhou']);
  assert.equal(candidate.totalHanIncludingDora, 0);
  assert.equal(candidate.yakuHan, 0);
  assert.equal(candidate.doraCount, 2);
  assert.equal(candidate.doraHan, 0);
  assert.equal(candidate.basePoints, 2000);
  assert.equal(candidate.scoreTier, 'mangan');
  assert.equal(candidate.totalPoints, 8000);
  assert.deepEqual(candidate.payments, [{ playerId: 1, points: 8000 }]);

  const settled = updateMatchGame({ ...startMatch(game), honba: 2, points: [24_000, 25_000, 25_000, 25_000], depositSticks: 1 }, declareRon(game, 0));
  assert.equal(settled.lastSettlement?.reason, 'ron');
  assert.equal(settled.lastSettlement?.payments.find(payment => payment.recipientId === 0)?.honbaPoints, 600);
  assert.equal(settled.lastSettlement?.deposits?.points, 1000);
});

test('Issue #38: parent first discard is eligible; a parent winner is not', () => {
  const parentStart = { ...ronStart(0, [1]), rules: { ...DEFAULT_GAME_RULES, renhou: 'mangan' as const } };
  const firstDiscard = discardTileForOnline(parentStart, 0, parentStart.players[0].drawnTile!.id);
  assert.equal(isRenhouState(firstDiscard, 1), true);
  const parent = { ...v({ hand: noYakuHand, tile: 'pin-2', indicator: 'pin-1' }), dealerId: 0 };
  assert.equal(isRenhouState(parent, 0), false);
  assert.equal(evaluateWin(parent, 0, parent.players[1].river.at(-1)!, 'ron'), null);
});

test('Issue #38: a discard after another seat has drawn is still Renhou before this child draws', () => {
  const initial = { ...ronStart(0, [2]), rules: { ...DEFAULT_GAME_RULES, renhou: 'mangan' as const } };
  const humans = initial.players.map((player, id) => ({ ...player, control: id === 2 ? 'human' as const : player.control })) as unknown as GameState['players'];
  const game = { ...initial, players: humans };
  const safeDiscard = game.players[0].hand.map(tile => discardTileForOnline(game, 0, tile.id)).find(window =>
    getRonCandidates(window).length === 0 && [1, 2, 3].every(id => getCallOptions(window, id as PlayerId).length === 0));
  assert.ok(safeDiscard, 'fixture has a safe first discard');
  // No ron or call was available, so normal turn progression gives seat 1 its first draw.
  let next = { ...safeDiscard, phase: 'awaiting-draw' as const, turnPlayerId: 1 as const, ronWindow: null };
  const draw = next.liveWall.find(tile => tileKindKey(tile.tile) === 'sou-5')!;
  next = { ...next, liveWall: [draw, ...next.liveWall.filter(tile => tile !== draw)] };
  next = drawTile(next, 1);
  const laterDiscard = discardTileForOnline(next, 1, next.players[1].drawnTile!.id);
  assert.equal(laterDiscard.phase, 'awaiting-ron');
  assert.equal(isRenhouState(laterDiscard, 2), true);
  assert.equal(getRonCandidates(laterDiscard).find(candidate => candidate.winnerId === 2)?.candidate.yaku[0].id, 'renhou');
});

test('Issue #38: first draw immediately blocks Renhou, before or after the river changes', () => {
  const game = v({ hand: noYakuHand, tile: 'pin-2', indicator: 'pin-1' });
  const drawn = game.liveWall[0];
  const withDraw = playerChange({ ...game, liveWall: game.liveWall.slice(1) }, 0,
    { drawnTile: drawn, drawnTileSource: 'live-wall' });
  assert.equal(isRenhouState(withDraw, 0), false);
  const discarded = playerChange({ ...withDraw, phase: 'awaiting-ron' }, 0,
    { drawnTile: null, drawnTileSource: null, river: [drawn], discardHistory: [drawn] });
  assert.equal(isRenhouState(discarded, 0), false);
  const historyOnly = game.liveWall.find(tile => tile.id !== game.ronWindow!.tileId)!;
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[0] = { ...players[0], river: [], discardHistory: [historyOnly] };
  players[1] = { ...players[1], hand: [...players[1].hand, historyOnly] };
  const historyState = { ...game, players, liveWall: game.liveWall.filter(tile => tile !== historyOnly) };
  assert.equal(isRenhouState(historyState, 0), false, 'a retained discard history blocks Renhou even with an empty visible river');
});

test('Issue #38: OFF, calls, kans, and every ordinary furiten rule block a no-yaku Renhou', () => {
  const game = v({ hand: noYakuHand, tile: 'pin-2', indicator: 'pin-1' });
  assert.equal(getRonCandidates({ ...game, rules: { ...DEFAULT_GAME_RULES, renhou: 'off' } }).length, 0);
  assert.equal(getRonCandidates({ ...game, callsMade: true }).length, 0);
  assert.equal(getRonCandidates({ ...game, kanCount: 1 }).length, 0);
  for (const [type, tileCount] of [['pon', 3], ['chi', 3], ['daiminkan', 4], ['ankan', 4], ['kakan', 4]] as const) {
    const tiles = game.players[1].hand.slice(0, tileCount);
    const meld = { type, tiles, calledTileId: tiles[0].id, fromPlayerId: 1 as PlayerId } as unknown as NonNullable<PlayerState['melds']>[number];
    const caller = playerChange(game, 1, { hand: game.players[1].hand.slice(tileCount), melds: [meld] });
    assert.equal(isRenhouState(caller, 0), false, `${type} ended Renhou eligibility`);
  }
  for (const riichi of [
    { declarationTileId: 'riichi', passedRon: true },
  ]) assert.equal(getRonCandidates(playerChange(game, 0, { riichi } )).length, 0);
  assert.equal(getRonCandidates(playerChange(game, 0, { temporaryFuriten: true })).length, 0);
  const historyTile = game.liveWall.find(tile => tileKindKey(tile.tile) === 'pin-2')!;
  const discardFuriten = playerChange({ ...game, liveWall: game.liveWall.filter(tile => tile !== historyTile) }, 0,
    { river: [historyTile], discardHistory: [historyTile] });
  assert.equal(getRonCandidates(discardFuriten).length, 0);
  const invalidShape = playerChange(game, 0, { hand: game.players[0].hand.slice(1) });
  assert.equal(getRonCandidates(invalidShape).length, 0);
  assert.equal(getRonCandidates({ ...game, phase: 'awaiting-draw', ronWindow: null }).length, 0);
});

test('Issue #38: normal yaku below or equal to mangan are replaced by Renhou', () => {
  const below = getRonCandidates(v({ indicator: 'sou-2' })).find(candidate => candidate.winnerId === 0)!;
  assert.deepEqual(below.candidate.yaku.map(yaku => yaku.id), ['renhou']);

  const fiveHan = v({ hand: ['112233m', '77889p', '11z'], tile: 'pin-9', indicator: 'sou-2' });
  const equal = getRonCandidates(fiveHan).find(candidate => candidate.winnerId === 0)!;
  assert.deepEqual(equal.candidate.yaku.map(yaku => yaku.id), ['renhou']);
  assert.equal(equal.totalPoints, 8000);

  const doraAbove = v({ hand: ['112233m', '77889p', '11z'], tile: 'pin-9', indicator: 'man-1' });
  const higher = getRonCandidates(doraAbove).find(candidate => candidate.winnerId === 0)!;
  assert.ok(!higher.candidate.yaku.some(yaku => yaku.id === 'renhou'));
  assert.ok(higher.totalPoints > 8000);
  assert.ok(higher.doraHan > 0, 'ordinary scoring includes dora before it is compared with Renhou');
});

test('Issue #38: a normal yakuman above fixed mangan wins by high score', () => {
  const kokushi = ['19m', '19p', '19s', '1234566z'];
  const game = v({ hand: kokushi, tile: 'red', indicator: 'green' });
  const win = getRonCandidates(game).find(candidate => candidate.winnerId === 0)!;
  assert.ok(win.candidate.yaku.some(yaku => yaku.id === 'kokushi-musou'));
  assert.ok(!win.candidate.yaku.some(yaku => yaku.id === 'renhou'));
  assert.equal(win.yakumanCount, 1);
  assert.equal(win.totalPoints, 32_000);
});

test('Issue #38: CPU declares the same legal Renhou candidate automatically', () => {
  const source = v({ hand: noYakuHand, tile: 'pin-2', indicator: 'pin-1' });
  const players = source.players.map(player => ({ ...player, control: 'cpu' as const })) as unknown as GameState['players'];
  const game = { ...source, players };
  const resolved = resolveDiscardRon(game);
  assert.equal(resolved.phase, 'won');
  assert.equal(resolved.winResult?.winMethod === 'ron' && resolved.winResult.winners[0].candidate.yaku[0].id, 'renhou');
});

test('Issue #38: legacy GameRules v1-v4 disable Renhou, and v5 persists the selected value', () => {
  const v5 = { ...DEFAULT_GAME_RULES, renhou: 'mangan' as const };
  for (const version of [1, 2, 3, 4] as const) {
    const base = { schemaVersion: version, matchFormat: 'tonpu', ...(version > 1 ? { redDora: true, uraDora: true, ippatsu: true, kanDora: true } : {}),
      ...(version > 2 ? { kuitan: true } : {}),
      ...(version > 3 ? { dealerTenpaiRenchan: true, kyuushuKyuuhai: true, fourWinds: true, fourRiichi: true, fourKans: true, agariYame: false, tenpaiYame: false } : {}) };
    assert.equal(normalizeGameRules(base).renhou, 'off');
  }
  const storage: RulesStorage = { value: null, getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
  assert.equal(saveLastGameRules(v5, storage), true);
  assert.equal(loadLastGameRules(storage).renhou, 'mangan');
});
