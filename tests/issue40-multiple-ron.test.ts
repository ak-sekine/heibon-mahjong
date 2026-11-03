import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAME_RULES, normalizeGameRules, saveLastGameRules, loadLastGameRules } from '../src/model/rules.ts';
import { getRonCandidates, resolveRonDeclarations } from '../src/game/ron.ts';
import { discardTile } from '../src/game/discard.ts';
import { isFourWindsDraw } from '../src/game/special-draws.ts';
import { ronStart } from './ron-fixture.ts';
import { startMatch, updateMatchGame, nextRound, assertPointConservation } from '../src/game/match.ts';
import { startGame } from '../src/game/start.ts';
import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';
import type { OnlineGameSession, PlayerDecisionWindow } from '../src/online/game-view.ts';
import { applyOnlineGameAction, hydrateOnlineGame, timeoutOnlineDecision, OnlineGameRuleError } from '../src/online/game-engine.ts';
import { createPlayerGameView } from '../src/online/game-view.ts';
import { onlineResultTitle } from '../src/online/result-content.ts';
import { ronGame } from './ron-fixture.ts';
import { kanGame } from './kan-fixture.ts';
import { declareKanForOnline, getKanOptions } from '../src/game/kan.ts';

const three = (discarder: PlayerId) => {
  const candidates = [1, 2, 3].map(offset => ((discarder + offset) % 4) as PlayerId);
  const source = ronStart(discarder, candidates);
  const players = [...source.players] as typeof source.players;
  players[candidates[0]] = { ...players[candidates[0]], control: 'human' };
  const ready = { ...source, players };
  return discardTile(ready, discarder, ready.players[discarder].drawnTile!.id);
};

for (const multipleRon of [false, true]) for (const tripleRonAbortiveDraw of [false, true]) {
  const rules = { ...DEFAULT_GAME_RULES, multipleRon, tripleRonAbortiveDraw };
  for (const count of [1, 2, 3]) test(`宣言人数${count}・複数ロン${multipleRon}・三家和${tripleRonAbortiveDraw}`, () => {
    const source = three(1);
    const ids = getRonCandidates(source).slice(0, count).map(candidate => candidate.winnerId);
    assert.equal(ids.length, count);
    const result = resolveRonDeclarations({ ...source, rules }, ids);
    if (count === 3 && tripleRonAbortiveDraw) {
      assert.equal(result.phase, 'wall-exhausted');
      assert.equal(result.abortiveDraw, 'triple-ron');
      assert.equal(result.winResult, null);
    } else {
      assert.equal(result.phase, 'won');
      assert.equal(result.abortiveDraw, undefined);
      const declared = multipleRon ? ids : [ids[0]];
      assert.deepEqual(result.winResult?.winMethod === 'ron' ? result.winResult.winners.map(w => w.winnerId) : [], declared);
    }
  });
}

for (const discarder of [0, 1, 2, 3] as const) test(`頭ハネは放銃者${discarder}から下家を先に選び、宣言者だけを対象にする`, () => {
  const game = three(discarder);
  const candidates = getRonCandidates(game);
  assert.equal(candidates.length, 3);
  const ids = candidates.map(candidate => candidate.winnerId);
  const result = resolveRonDeclarations({ ...game, rules: { ...DEFAULT_GAME_RULES, multipleRon: false } }, ids.slice(1));
  assert.equal(result.winResult?.winMethod, 'ron');
  if (result.winResult?.winMethod === 'ron') assert.deepEqual(result.winResult.winners.map(w => w.winnerId), [ids[1]]);
});

test('頭ハネで除外されたロン宣言者には得点・本場・供託を配分しない', () => {
  const source = three(1);
  const ids = getRonCandidates(source).map(candidate => candidate.winnerId);
  const result = resolveRonDeclarations({ ...source, rules: { ...DEFAULT_GAME_RULES, multipleRon: false } }, ids.slice(1));
  const starting = startMatch(source, { ...DEFAULT_GAME_RULES, multipleRon: false });
  const before = { ...starting, points: [24000, 25000, 25000, 25000] as const, depositSticks: 1, honba: 2 };
  const settled = updateMatchGame(before, result);
  assert.equal(result.winResult?.winMethod === 'ron' ? result.winResult.winners.length : 0, 1);
  const winnerId = result.winResult?.winMethod === 'ron' ? result.winResult.winners[0].winnerId : -1;
  assert.equal(settled.lastSettlement?.payments.length, 1);
  assert.equal(settled.lastSettlement?.payments[0].recipientId, winnerId);
  assert.equal(settled.lastSettlement?.deposits?.recipientId, winnerId);
  assertPointConservation(settled);
});

test('3候補だけではロンを確定せず、宣言なしは通常の応答終了、無効宣言は拒否する', () => {
  const source = three(1);
  assert.equal(getRonCandidates(source).length, 3);
  const noYes = resolveRonDeclarations(source, []);
  assert.equal(noYes.phase, 'awaiting-call');
  assert.equal(noYes.winResult, null);
  assert.equal(noYes.abortiveDraw, undefined);
  assert.throws(() => resolveRonDeclarations(source, [1 as PlayerId]), /Invalid ron declarations/);
});

test('三人候補でもyesが2人とpassが1人なら三家和にならず、yesが1人だけなら通常ロン', () => {
  const source = three(1);
  const candidates = getRonCandidates(source).map(candidate => candidate.winnerId);
  const twoYes = resolveRonDeclarations({ ...source, rules: { ...DEFAULT_GAME_RULES, multipleRon: false, tripleRonAbortiveDraw: true } }, candidates.slice(0, 2));
  assert.equal(twoYes.phase, 'won');
  assert.equal(twoYes.winResult?.winMethod === 'ron' ? twoYes.winResult.winners.length : 0, 1);
  const oneYes = resolveRonDeclarations({ ...source, rules: { ...DEFAULT_GAME_RULES, multipleRon: true, tripleRonAbortiveDraw: true } }, candidates.slice(0, 1));
  assert.equal(oneYes.phase, 'won');
  assert.equal(oneYes.winResult?.winMethod === 'ron' ? oneYes.winResult.winners.length : 0, 1);
});

test('四風連打条件の4枚目に有効ロンがある場合はロンを先に確定する', () => {
  const source = three(1);
  const eastTiles = [0, 1, 2, 3].map(seat => ({ id: `issue40-east-${seat}`,
    tile: { category: 'honor' as const, honor: 'east' as const, isRed: false } }));
  const players = source.players.map((player, seat) => ({ ...player,
    river: seat === 1 ? [eastTiles[seat], source.players[1].river.at(-1)!] : [eastTiles[seat]],
    discardHistory: [eastTiles[seat]],
  })) as typeof source.players;
  const windWindow = { ...source, players };
  assert.equal(isFourWindsDraw({ ...windWindow, phase: 'awaiting-call' }), true);
  const ids = getRonCandidates(windWindow).map(candidate => candidate.winnerId);
  assert.equal(ids.length, 3);
  const single = resolveRonDeclarations(windWindow, [ids[0]]);
  assert.equal(single.phase, 'won');
  const triple = resolveRonDeclarations({ ...windWindow, rules: { ...DEFAULT_GAME_RULES, multipleRon: false, tripleRonAbortiveDraw: true } }, ids);
  assert.equal(triple.abortiveDraw, 'triple-ron');
});

test('三家和は既存の途中流局精算で点棒と供託を保ち、親・局数・本場を進行する', () => {
  const game = resolveRonDeclarations({ ...three(1), rules: { ...DEFAULT_GAME_RULES, tripleRonAbortiveDraw: true } },
    getRonCandidates(three(1)).map(candidate => candidate.winnerId));
  const started = startMatch(ronGame(1, [0]), { ...DEFAULT_GAME_RULES, tripleRonAbortiveDraw: true, agariYame: true });
  const before = { ...started, points: [24000, 24000, 25000, 25000] as const, depositSticks: 2, honba: 4 };
  const settled = updateMatchGame(before, game);
  assert.equal(settled.lastSettlement?.reason, 'triple-ron');
  assert.deepEqual(settled.lastSettlement?.payments, []);
  assert.equal(settled.lastSettlement?.deposits, null);
  assert.deepEqual(settled.points, before.points);
  assert.equal(settled.depositSticks, 2);
  assert.equal(settled.status, 'round-ended');
  assert.equal(settled.lastSettlement?.matchEnded, false);
  assert.deepEqual(settled.lastSettlement?.next, { roundWind: 'east', roundNumber: 1, dealerId: before.dealerId, honba: 5 });
  assert.deepEqual(nextRound(settled).game.rules, before.rules);
  assertPointConservation(settled);
});

for (const [format, wind] of [['tonpu', 'east'], ['tonnan', 'south']] as const) test(`三家和は${format}の最終予定局でも対局を終了しない`, () => {
  const rules = { ...DEFAULT_GAME_RULES, matchFormat: format, tripleRonAbortiveDraw: true, agariYame: true, tenpaiYame: true };
  const base = three(1);
  const game = resolveRonDeclarations({ ...base, roundWind: wind, rules }, getRonCandidates(base).map(candidate => candidate.winnerId));
  const starting = startMatch({ ...base, roundWind: wind }, rules);
  const before = { ...starting, roundWind: wind, roundNumber: 4, honba: 3, points: [25000, 25000, 25000, 25000] as const };
  const settled = updateMatchGame(before, game);
  assert.equal(settled.status, 'round-ended');
  assert.equal(settled.lastSettlement?.matchEnded, false);
  assert.deepEqual(settled.lastSettlement?.next, { roundWind: wind, roundNumber: 4,
    dealerId: before.dealerId, honba: 4 });
  assert.deepEqual(settled.points, before.points);
  assert.equal(settled.depositSticks, 0);
});

test('リーチ宣言牌の三家和はpending riichiを取消し、1,000点を払わず既存供託を維持する', () => {
  const source = { ...three(1), rules: { ...DEFAULT_GAME_RULES, tripleRonAbortiveDraw: true },
    pendingRiichi: { playerId: 1 as PlayerId, declarationTileId: three(1).ronWindow!.tileId } };
  const declarations = getRonCandidates(source).map(candidate => candidate.winnerId);
  const ended = resolveRonDeclarations(source, declarations);
  assert.equal(ended.abortiveDraw, 'triple-ron');
  assert.equal(ended.pendingRiichi, null);
  const rules = { ...DEFAULT_GAME_RULES, tripleRonAbortiveDraw: true };
  const started = startMatch(ronGame(1, [0]), rules);
  const before = { ...started, points: [24000, 24000, 25000, 25000] as const, depositSticks: 2 };
  const settled = updateMatchGame(before, ended);
  assert.deepEqual(settled.points, before.points);
  assert.equal(settled.depositSticks, 2);
});

test('槍槓も通常ロンと同じ設定を使い、成立する前に加槓を保留する', () => {
  const source = kanGame({ hands: {
    1: ['23m', '456p', '789s', '333z', '66s'],
    2: ['23m', '123p', '456s', '444z', '77s'], 3: ['23m', '789p', '123s', '555z', '88s'],
  }, melds: { 0: [{ type: 'pon', group: '111m' }] }, draw: 'man-1' });
  const option = getKanOptions(source, 0).find(candidate => candidate.meld.type === 'kakan');
  assert.ok(option);
  const window = declareKanForOnline(source, 0, option.id);
  assert.equal(window.phase, 'awaiting-ron');
  assert.equal(window.kanCount, 0);
  assert.equal(window.players[0].melds?.[0].type, 'pon');
  assert.equal(getRonCandidates(window).length, 3);

  const draw = resolveRonDeclarations({ ...window, rules: { ...DEFAULT_GAME_RULES, multipleRon: false, tripleRonAbortiveDraw: true } },
    getRonCandidates(window).map(candidate => candidate.winnerId));
  assert.equal(draw.abortiveDraw, 'triple-ron');
  assert.equal(draw.phase, 'wall-exhausted');
  assert.equal(draw.kanCount, 0);
  assert.equal(draw.players[0].melds?.[0].type, 'pon');

  const headBump = resolveRonDeclarations({ ...window, rules: { ...DEFAULT_GAME_RULES, multipleRon: false } },
    getRonCandidates(window).map(candidate => candidate.winnerId));
  assert.equal(headBump.phase, 'won');
  assert.equal(headBump.kanCount, 0);
  assert.equal(headBump.players[0].melds?.[0].type, 'pon');
  assert.equal(headBump.winResult?.winMethod === 'ron' ? headBump.winResult.winners.length : 0, 1);
});

test('複数ロンの各和了を個別精算し、頭ハネでは選ばれたパオ和了だけを支払う', () => {
  const base = kanGame({ hands: {
    0: ['12m', '77s'], 1: ['45m', '234p', '678s', '456s', '22p'],
  }, melds: { 0: [
    { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 },
    { type: 'pon', group: '777z', from: 3 },
  ] }, draw: 'man-3', turn: 2 });
  const tile = base.players[2].drawnTile!;
  const players = [...base.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[2] = { ...players[2], river: [tile], drawnTile: null, drawnTileSource: null };
  const source: GameState = { ...base, rules: { ...DEFAULT_GAME_RULES, pao: true }, players, phase: 'awaiting-ron',
    ronWindow: { kind: 'discard', discarderId: 2, tileId: tile.id }, paoResponsibilities: { daisangen: 3 },
    paoResponsibilityOrder: ['daisangen'] };
  assert.deepEqual(getRonCandidates(source).map(candidate => candidate.winnerId), [0, 1]);
  const declared = [1, 0] as const;
  const multi = resolveRonDeclarations({ ...source, rules: { ...source.rules!, multipleRon: true } }, declared);
  const points = [24000, 25000, 25000, 25000] as const;
  const multiMatch = updateMatchGame({ ...startMatch(source, { ...source.rules!, multipleRon: true }), points, honba: 2, depositSticks: 1 }, multi);
  assert.equal(multiMatch.lastSettlement?.payments.length, 3);
  assert.equal(multiMatch.lastSettlement?.deposits?.recipientId, 0);
  assert.deepEqual(multiMatch.lastSettlement?.payments.filter(payment => payment.recipientId === 0)
    .map(({ payerId, honbaPoints }) => [payerId, honbaPoints]), [[2, 600], [3, 0]]);
  assert.ok(multiMatch.lastSettlement?.payments.some(payment => payment.recipientId === 1 && payment.honbaPoints === 600));
  assertPointConservation(multiMatch);

  const bumped = resolveRonDeclarations({ ...source, rules: { ...source.rules!, multipleRon: false } }, declared);
  const bumpedMatch = updateMatchGame({ ...startMatch(source, { ...source.rules!, multipleRon: false }), points, honba: 2, depositSticks: 1 }, bumped);
  assert.equal(bumped.winResult?.winMethod === 'ron' ? bumped.winResult.winners.length : 0, 1);
  assert.ok(bumpedMatch.lastSettlement?.payments.every(payment => payment.recipientId === 0));
  assert.deepEqual(bumpedMatch.lastSettlement?.deposits, { recipientId: 0, points: 1000 });
  assertPointConservation(bumpedMatch);

  const triple = resolveRonDeclarations({ ...source, rules: { ...source.rules!, multipleRon: true, tripleRonAbortiveDraw: true } }, [0, 1]);
  assert.equal(triple.abortiveDraw, undefined, 'two declarations do not trigger sancha-ron');
});

test('schema v1-v4 defaults and schema v5 storage retain the independent ron settings', () => {
  for (const version of [1, 2, 3, 4]) {
    const base = version === 1 ? { schemaVersion: 1, matchFormat: 'tonpu' } : version === 2
      ? { schemaVersion: 2, matchFormat: 'tonpu', redDora: true, uraDora: true, ippatsu: true, kanDora: true }
      : version === 3 ? { schemaVersion: 3, matchFormat: 'tonpu', redDora: true, kuitan: true, uraDora: true, ippatsu: true, kanDora: true }
        : { ...DEFAULT_GAME_RULES, schemaVersion: 4 };
    const normalized = normalizeGameRules(base);
    assert.equal(normalized.multipleRon, true);
    assert.equal(normalized.tripleRonAbortiveDraw, false);
  }
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  const selected = { ...DEFAULT_GAME_RULES, multipleRon: false, tripleRonAbortiveDraw: true };
  assert.equal(saveLastGameRules(selected, storage), true);
  assert.deepEqual(loadLastGameRules(storage), selected);
});

function onlineRonSession(source: ReturnType<typeof ronGame>, humanSeats: readonly PlayerId[], revision = 7): OnlineGameSession {
  const identities = [0, 1, 2, 3].map(seat => ({ seat: seat as PlayerId, name: `P${seat}`,
    control: humanSeats.includes(seat as PlayerId) ? 'human' as const : 'cpu' as const,
    connected: humanSeats.includes(seat as PlayerId) } )) as OnlineGameSession['identities'];
  const players = source.players.map((player, seat) => ({ ...player, control: identities[seat as PlayerId].control })) as PlayerState[];
  const game = { ...source, rules: { ...DEFAULT_GAME_RULES, multipleRon: true, tripleRonAbortiveDraw: true },
    players: players as unknown as typeof source.players };
  const match = startMatch(game, game.rules);
  const decision: PlayerDecisionWindow = { windowId: 'issue40-ron-window', type: 'ron', openedAt: 1000,
    expiresAt: 31_000, baseGameRevision: revision,
    requiredSeats: getRonCandidates(game).filter(candidate => identities[candidate.winnerId].control === 'human').map(candidate => candidate.winnerId),
    responses: {} };
  return { schemaVersion: 1, gameRevision: revision, match, status: match.status, identities,
    hostSeat: 0, decision: { ...decision, responses: Object.fromEntries(decision.requiredSeats.map(seat => [seat, 'pending'])) }, declarations: [] };
}

test('Worker includes both CPU yes declarations with the human yes and persists one unanimous sancha-ron draw', () => {
  const source = { ...three(1), rules: { ...DEFAULT_GAME_RULES, tripleRonAbortiveDraw: true } };
  const session = onlineRonSession(source, [0]);
  const window = session.decision!;
  const connected = new Set<PlayerId>([0]);
  const settled = applyOnlineGameAction(session, 0, { type: 'declare-ron', requestId: 'issue40-human-yes',
    expectedGameRevision: session.gameRevision, windowId: window.windowId }, connected, 2000);
  assert.equal(settled.status, 'round-ended');
  assert.equal(settled.match.game.abortiveDraw, 'triple-ron');
  for (const seat of [0, 1, 2, 3] as const) {
    assert.equal(onlineResultTitle(createPlayerGameView(settled, seat, 'ABC234', connected)), '途中流局（三家和）');
  }
  const restored = hydrateOnlineGame(JSON.stringify(settled));
  assert.equal(restored?.match.lastSettlement?.reason, 'triple-ron');
  assert.throws(() => applyOnlineGameAction(restored!, 0, { type: 'declare-ron', requestId: 'issue40-duplicate',
    expectedGameRevision: session.gameRevision, windowId: window.windowId }, connected, 2001),
    error => error instanceof OnlineGameRuleError);
});

test('Worker collects all three humans before deciding; JSON restore preserves partial answers and timeout treats missing votes as pass', () => {
  const rules = { ...DEFAULT_GAME_RULES, tripleRonAbortiveDraw: true };
  const base = three(1);
  const humanSeats = getRonCandidates(base).map(candidate => candidate.winnerId);
  const source = { ...base, rules };
  const session = onlineRonSession(source, humanSeats, 17);
  const connected = new Set<PlayerId>(humanSeats);
  const window = session.decision!;
  let waiting = applyOnlineGameAction(session, humanSeats[0], { type: 'declare-ron', requestId: 'issue40-first',
    expectedGameRevision: 17, windowId: window.windowId }, connected, 2000);
  assert.equal(waiting.status, 'playing');
  waiting = hydrateOnlineGame(JSON.stringify(waiting))!;
  waiting = applyOnlineGameAction(waiting, humanSeats[1], { type: 'declare-ron', requestId: 'issue40-second',
    expectedGameRevision: 17, windowId: window.windowId }, connected, 2001);
  assert.equal(waiting.status, 'playing');
  const third = applyOnlineGameAction(waiting, humanSeats[2], { type: 'declare-ron', requestId: 'issue40-third',
    expectedGameRevision: 17, windowId: window.windowId }, connected, 2002);
  assert.equal(third.status, 'round-ended');
  assert.equal(third.match.lastSettlement?.reason, 'triple-ron');
  const restored = hydrateOnlineGame(JSON.stringify(third))!;
  assert.equal(restored.match.lastSettlement?.reason, 'triple-ron');
  assert.equal(timeoutOnlineDecision(restored, 40_000), restored);
  assert.throws(() => applyOnlineGameAction(restored, humanSeats[2], { type: 'declare-ron', requestId: 'issue40-late',
    expectedGameRevision: 17, windowId: window.windowId }, connected, 40_001),
    error => error instanceof OnlineGameRuleError && error.code === 'game_not_playing');

  for (const pair of [[humanSeats[0], humanSeats[1]], [humanSeats[0], humanSeats[2]], [humanSeats[1], humanSeats[2]]] as const) {
    for (const order of [pair, [...pair].reverse()] as const) {
      const twoHumans = onlineRonSession(source, pair, 19);
      const twoConnected = new Set<PlayerId>(pair);
      const twoWindow = twoHumans.decision!;
      const first = applyOnlineGameAction(twoHumans, order[0], { type: 'declare-ron', requestId: `issue40-order-${order.join('-')}-first`,
        expectedGameRevision: 19, windowId: twoWindow.windowId }, twoConnected, 3_000);
      assert.equal(first.status, 'playing');
      const final = applyOnlineGameAction(first, order[1], { type: 'declare-ron', requestId: `issue40-order-${order.join('-')}-second`,
        expectedGameRevision: 19, windowId: twoWindow.windowId }, twoConnected, 3_001);
      assert.equal(final.match.lastSettlement?.reason, 'triple-ron');
      assert.equal(final.match.game.kanCount, source.kanCount);
    }
  }

  const timedWindow = { ...window, windowId: 'issue40-timeout-window', openedAt: 50_000, expiresAt: 80_000,
    baseGameRevision: 18, responses: Object.fromEntries(humanSeats.map(seat => [seat, 'pending'])) };
  const timedSession = { ...onlineRonSession(source, humanSeats, 18), decision: timedWindow };
  const oneYes = applyOnlineGameAction(timedSession, humanSeats[0], { type: 'declare-ron', requestId: 'issue40-timeout-one-yes',
    expectedGameRevision: 18, windowId: timedWindow.windowId }, connected, 51_000);
  const timed = timeoutOnlineDecision(oneYes, 80_000);
  assert.equal(timed.status, 'round-ended');
  assert.equal(timed.match.lastSettlement?.reason, 'ron');
  assert.equal(timed.match.game.winResult?.winMethod === 'ron' ? timed.match.game.winResult.winners.length : 0, 1);

  const allTimeout = timeoutOnlineDecision(timedSession, 80_000);
  assert.equal(allTimeout.status, 'playing');
  assert.notEqual(allTimeout.match.game.phase, 'won');
  assert.equal(allTimeout.match.game.abortiveDraw, undefined);
});
