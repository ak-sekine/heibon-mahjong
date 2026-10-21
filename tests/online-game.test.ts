import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCallOptions } from '../src/game/calls.ts';
import { discardTileForOnline } from '../src/game/discard.ts';
import { getKanOptions } from '../src/game/kan.ts';
import { getRiichiDiscardOptions } from '../src/game/riichi.ts';
import { canDeclareTsumo } from '../src/game/tsumo.ts';
import { markRonPassed } from '../src/game/ron.ts';
import { startMatch } from '../src/game/match.ts';
import { tileKindKey } from '../src/model/tile.ts';
import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';
import { isForbiddenDiscard } from '../src/game/melds.ts';
import { ankanGame } from './kan-fixture.ts';
import { callStart } from './calls-fixture.ts';
import { riichiStart } from './riichi-fixture.ts';
import { parentKyuushuGame } from './step13-10-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import {
  applyOnlineGameAction,
  advanceOnlineCpu,
  startOnlineGame,
  startNextOnlineRound,
  transferOnlineSeatToCpu,
  timeoutOnlineDecision,
  hydrateOnlineGame,
  OnlineGameRuleError,
} from '../src/online/game-engine.ts';
import {
  createPlayerGameView,
  type OnlineGameSession,
  type OnlineSeatIdentity,
  type PlayerDecisionWindow,
} from '../src/online/game-view.ts';
import { ronGame, ronStart } from './ron-fixture.ts';

const allTiles = (game: GameState) => [
  ...game.liveWall,
  ...game.deadWall,
  ...game.players.flatMap(player => [
    ...player.hand,
    ...(player.drawnTile ? [player.drawnTile] : []),
    ...player.river,
    ...(player.melds ?? []).flatMap(meld => meld.tiles),
  ]),
];

function identities(humanSeats: readonly number[]): OnlineGameSession['identities'] {
  return [0, 1, 2, 3].map(seat => ({
    seat: seat as PlayerId,
    name: seat === 0 ? 'Host' : `Player ${seat}`,
    control: humanSeats.includes(seat) ? 'human' as const : 'cpu' as const,
    connected: humanSeats.includes(seat),
  })) as unknown as OnlineGameSession['identities'];
}

function sessionForGame(
  source: GameState,
  humanSeats: readonly number[],
  gameRevision = 1,
  decision: PlayerDecisionWindow | null = null,
): OnlineGameSession {
  const seats = identities(humanSeats);
  const players = source.players.map((player, seat) => ({
    ...player,
    control: seats[seat as PlayerId].control,
  })) as [PlayerState, PlayerState, PlayerState, PlayerState];
  const game = { ...source, players };
  const match = startMatch(game);
  return {
    schemaVersion: 1,
    gameRevision,
    match,
    status: match.status,
    identities: seats,
    hostSeat: 0,
    decision,
  };
}

function ronDecision(seats: readonly PlayerId[], baseGameRevision: number, openedAt = 1000): PlayerDecisionWindow {
  return {
    windowId: 'a'.repeat(24),
    type: 'ron',
    openedAt,
    expiresAt: openedAt + 30_000,
    baseGameRevision,
    requiredSeats: seats,
    responses: Object.fromEntries(seats.map(seat => [seat, 'pending'])) as Record<PlayerId, 'pending'>,
  };
}

test('online game start fills four seats with secure-wall inventory and 25,000 points', () => {
  for (let humanCount = 1; humanCount <= 4; humanCount++) {
    const session = startOnlineGame(identities([0, 1, 2, 3].slice(0, humanCount)), 0);
    const game = session.match.game;
    const tiles = allTiles(game);
    assert.equal(session.gameRevision, 1);
    assert.deepEqual(session.match.points, [25_000, 25_000, 25_000, 25_000]);
    assert.equal(session.match.roundNumber, 1);
    assert.equal(game.dealerId, 0);
    assert.equal(tiles.length, 136);
    assert.equal(new Set(tiles.map(tile => tile.id)).size, 136);
    const counts = new Map<string, number>();
    for (const tile of tiles) counts.set(tileKindKey(tile.tile), (counts.get(tileKindKey(tile.tile)) ?? 0) + 1);
    assert.equal(counts.size, 34);
    assert.ok([...counts.values()].every(count => count === 4));
    assert.deepEqual(game.players.map(player => player.control), [0, 1, 2, 3].map(seat => seat < humanCount ? 'human' : 'cpu'));
    assert.ok(game.players.every(player => player.hand.length === 13));
    assert.ok(game.players[0].drawnTile);
  }
});

test('every player view allowlists only that viewer hand, with no wall or CPU decision internals', () => {
  const base = startOnlineGame(identities([0, 1]), 0);
  const players = [...base.match.game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  for (const seat of [0, 1, 2, 3] as const) {
    const old = players[seat].hand[0];
    const sentinel = {
      ...old,
      id: `SECRET_PHYSICAL_TILE_ID_SEAT_${seat}`,
      tile: { ...old.tile, secretKind: `SECRET_TILE_KIND_SEAT_${seat}` },
    } as unknown as typeof old;
    players[seat] = { ...players[seat], hand: [sentinel, ...players[seat].hand.slice(1)] };
  }
  const session = { ...base, match: { ...base.match, game: { ...base.match.game, players } } };

  for (const viewer of [0, 1, 2, 3] as const) {
    const view = createPlayerGameView(session, viewer, 'A2CDEF', new Set([0, 1]));
    const wire = JSON.stringify({ type: 'game-state', view });
    assert.equal(view.self.seat, viewer);
    assert.equal(view.seats[viewer].hand?.length, 13);
    assert.equal('drawnTile' in view.seats[viewer], true);
    assert.equal(Boolean(view.seats[viewer].drawnTile), viewer === 0);
    assert.equal('liveWall' in view, false);
    assert.equal('deadWall' in view, false);
    assert.equal('match' in view, false);
    assert.equal('cpuDecision' in view, false);
    assert.equal('waitingTileKinds' in view, false);
    assert.equal('callOptions' in view.seats[0], false);
    for (const seat of view.seats) {
      if (seat.seat === viewer) continue;
      assert.equal('hand' in seat, false);
      assert.equal('drawnTile' in seat, false);
      assert.equal('riichiOptions' in seat, false);
      assert.equal('ronCandidates' in seat, false);
    }
    for (const seat of [0, 1, 2, 3] as const) {
      const privateToViewer = viewer === seat;
      assert.equal(wire.includes(`SECRET_PHYSICAL_TILE_ID_SEAT_${seat}`), privateToViewer,
        `seat ${seat}'s physical tile ID crossed viewer ${viewer}'s view boundary`);
      assert.equal(wire.includes(`SECRET_TILE_KIND_SEAT_${seat}`), privateToViewer,
        `seat ${seat}'s tile kind crossed viewer ${viewer}'s view boundary`);
    }
  }
});

test('an exhaustive draw never exposes another human hand without a declaration', () => {
  const base = startOnlineGame(identities([0, 1]), 0);
  const players = [...base.match.game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  for (const seat of [1, 2] as const) {
    const old = players[seat].hand[0];
    players[seat] = {
      ...players[seat],
      hand: [{
        ...old,
        id: `DRAW_SECRET_PHYSICAL_TILE_ID_SEAT_${seat}`,
        tile: { ...old.tile, secretKind: `DRAW_SECRET_TILE_KIND_SEAT_${seat}` },
      } as unknown as typeof old, ...players[seat].hand.slice(1)],
    };
  }
  const settlement = {
    reason: 'draw', roundNumber: 1, dealerId: 0, honba: 0,
    before: [25_000, 25_000, 25_000, 25_000], payments: [], deposits: null,
    tenpai: [false, true, true, false], deltas: [0, 0, 0, 0],
    after: [25_000, 25_000, 25_000, 25_000],
    next: { roundNumber: 2, dealerId: 1, honba: 1 }, matchEnded: false,
  } as const;
  const session: OnlineGameSession = {
    ...base,
    status: 'round-ended',
    match: {
      ...base.match,
      status: 'round-ended',
      lastSettlement: settlement,
      game: { ...base.match.game, players, phase: 'wall-exhausted' },
    },
  };

  for (const viewer of [0, 1, 2, 3] as const) {
    const wire = JSON.stringify(createPlayerGameView(session, viewer, 'DRAW01', new Set([0, 1])));
    assert.equal(wire.includes('DRAW_SECRET_PHYSICAL_TILE_ID_SEAT_1'), viewer === 1,
      `human seat 1's undeclared tenpai hand leaked to viewer ${viewer}`);
    assert.equal(wire.includes('DRAW_SECRET_TILE_KIND_SEAT_1'), viewer === 1,
      `human seat 1's undeclared tenpai tile kind leaked to viewer ${viewer}`);
    assert.equal(wire.includes('DRAW_SECRET_PHYSICAL_TILE_ID_SEAT_2'), true,
      'the existing CPU tenpai hand reveal was not preserved');
  }
});

test('server action reducer rejects wrong turns, opponent tile IDs, and stale revisions without mutation', () => {
  const session = startOnlineGame(identities([0, 1, 2, 3]), 0);
  const connected = new Set<PlayerId>([0, 1, 2, 3]);
  const otherHandId = session.match.game.players[1].hand[0].id;
  const snapshot = structuredClone(session);

  assert.throws(() => applyOnlineGameAction(session, 1, {
    type: 'discard', requestId: 'wrong-turn', expectedGameRevision: 1, tileId: session.match.game.players[1].hand[0].id,
  }, connected), error => error instanceof OnlineGameRuleError && error.code === 'not_your_turn');
  assert.throws(() => applyOnlineGameAction(session, 0, {
    type: 'discard', requestId: 'other-hand', expectedGameRevision: 1, tileId: otherHandId,
  }, connected), RangeError);
  assert.deepEqual(session, snapshot);

  const legal = session.match.game.players[0].hand[0].id;
  const accepted = applyOnlineGameAction(session, 0, {
    type: 'discard', requestId: 'legal-discard', expectedGameRevision: 1, tileId: legal,
  }, connected, 10_000);
  assert.equal(accepted.gameRevision, 2);
  assert.equal(accepted.match.game.players[0].river.at(-1)?.id, legal);
  assert.throws(() => applyOnlineGameAction(accepted, 0, {
    type: 'discard', requestId: 'old-revision', expectedGameRevision: 1, tileId: legal,
  }, connected), error => error instanceof OnlineGameRuleError && error.code === 'stale_revision');
});

test('online action reducer validates riichi, tsumo, kan, kyuushu, and starts the next round', () => {
  const connected = new Set<PlayerId>([0]);
  const riichiGame = riichiStart();
  const riichiSession = sessionForGame(riichiGame, [0]);
  const riichiOption = getRiichiDiscardOptions(riichiGame, 0, 25_000)[0];
  assert.ok(riichiOption);
  const riichi = applyOnlineGameAction(riichiSession, 0, {
    type: 'declare-riichi', requestId: 'online-riichi', expectedGameRevision: 1, tileId: riichiOption.tileId,
  }, connected, 1000);
  assert.equal(riichi.match.points[0], 24_000);
  assert.equal(riichi.match.depositSticks, 1);
  assert.ok(riichi.match.game.players[0].riichi);
  assert.equal(riichi.match.game.pendingRiichi, null);

  const kanGame = ankanGame();
  const kanSession = sessionForGame(kanGame, [0]);
  const kanOption = getKanOptions(kanGame, 0)[0];
  assert.ok(kanOption);
  const kan = applyOnlineGameAction(kanSession, 0, {
    type: 'declare-kan', requestId: 'online-kan', expectedGameRevision: 1, optionId: kanOption.id,
  }, connected, 2000);
  assert.equal(kan.match.game.kanCount, 1);
  assert.equal(kan.match.game.players[0].drawnTileSource, 'rinshan');
  assert.equal(kan.match.game.players[0].melds?.[0].type, 'ankan');

  const kyuushuGame = parentKyuushuGame(9);
  const kyuushu = applyOnlineGameAction(sessionForGame(kyuushuGame, [0]), 0, {
    type: 'declare-kyuushu-kyuuhai', requestId: 'online-kyuushu', expectedGameRevision: 1,
  }, connected, 3000);
  assert.equal(kyuushu.status, 'round-ended');
  assert.equal(kyuushu.match.lastSettlement?.reason, 'kyuushu-kyuuhai');

  const tsumoGameState = tsumoGame();
  assert.equal(canDeclareTsumo(tsumoGameState, 0), true);
  const tsumo = applyOnlineGameAction(sessionForGame(tsumoGameState, [0]), 0, {
    type: 'declare-tsumo', requestId: 'online-tsumo', expectedGameRevision: 1,
  }, connected, 4000);
  assert.equal(tsumo.status, 'round-ended');
  assert.equal(tsumo.match.lastSettlement?.reason, 'tsumo');
  const next = startNextOnlineRound(tsumo, () => 0.25);
  assert.equal(next.status, 'playing');
  assert.equal(next.match.roundNumber, tsumo.match.lastSettlement?.next?.roundNumber);
  assert.equal(next.gameRevision, tsumo.gameRevision + 1);
  assert.deepEqual(next.match.points, tsumo.match.points);
});

test('all ron candidates are collected, multiple ron resolves together, and only a passer becomes furiten', () => {
  const game = ronGame(1, [0, 2]);
  const connected = new Set<PlayerId>([0, 2]);
  const opened = ronDecision([0, 2], 9);
  const session = sessionForGame(game, [0, 2], 9, opened);
  const ron0 = applyOnlineGameAction(session, 0, {
    type: 'declare-ron', requestId: 'ron-seat-0', expectedGameRevision: 9, windowId: opened.windowId,
  }, connected, 20_000);
  assert.equal(ron0.status, 'playing');
  assert.equal(ron0.match.game.phase, 'awaiting-ron');
  assert.deepEqual(ron0.decision?.responses, { 0: 'yes', 2: 'pending' });
  assert.throws(() => applyOnlineGameAction(ron0, 0, {
    type: 'pass-ron', requestId: 'double-answer', expectedGameRevision: 9, windowId: opened.windowId,
  }, connected, 20_000), error => error instanceof OnlineGameRuleError && error.code === 'already_responded');
  const bothRon = applyOnlineGameAction(ron0, 2, {
    type: 'declare-ron', requestId: 'ron-seat-2', expectedGameRevision: 9, windowId: opened.windowId,
  }, connected, 20_001);
  assert.equal(bothRon.status, 'round-ended');
  assert.deepEqual(bothRon.match.game.winResult?.winMethod === 'ron'
    ? bothRon.match.game.winResult.winners.map(winner => winner.winnerId).sort() : [], [0, 2]);
  assert.equal(bothRon.match.lastSettlement?.reason, 'ron');
  assert.equal(bothRon.match.points.reduce((sum, points) => sum + points, 0) + bothRon.match.depositSticks * 1000, 100_000);

  const passSession = sessionForGame(game, [0, 2], 12, ronDecision([0, 2], 12));
  const passThenRon = applyOnlineGameAction(passSession, 0, {
    type: 'pass-ron', requestId: 'pass-seat-0', expectedGameRevision: 12, windowId: opened.windowId,
  }, connected, 20_000);
  const oneRon = applyOnlineGameAction(passThenRon, 2, {
    type: 'declare-ron', requestId: 'ron-only-seat-2', expectedGameRevision: 12, windowId: opened.windowId,
  }, connected, 20_001);
  assert.deepEqual(oneRon.match.game.winResult?.winMethod === 'ron'
    ? oneRon.match.game.winResult.winners.map(winner => winner.winnerId) : [], [2]);
  assert.equal(oneRon.match.game.players[0].temporaryFuriten, true);
  assert.equal(oneRon.match.game.players[2].temporaryFuriten, false);
});

test('JSON recovery preserves pending answers and settled multi-ron scoring', () => {
  const game = ronGame(1, [0, 2]);
  const window = ronDecision([0, 2], 44);
  const connected = new Set<PlayerId>([0, 2]);
  const waiting = sessionForGame(game, [0, 2], 44, window);
  const partial = applyOnlineGameAction(waiting, 0, {
    type: 'declare-ron', requestId: 'persist-first-ron', expectedGameRevision: 44, windowId: window.windowId,
  }, connected, 10_000);
  const restoredWindow = hydrateOnlineGame(JSON.stringify(partial));
  assert.deepEqual(restoredWindow?.decision, partial.decision);
  assert.equal(restoredWindow?.match.game.ronWindow?.tileId, game.ronWindow?.tileId);
  const ended = applyOnlineGameAction(restoredWindow!, 2, {
    type: 'declare-ron', requestId: 'persist-second-ron', expectedGameRevision: 44, windowId: window.windowId,
  }, connected, 10_001);
  const restoredResult = hydrateOnlineGame(JSON.stringify(ended));
  assert.equal(restoredResult?.status, 'round-ended');
  assert.deepEqual(restoredResult?.match.game.winResult?.winMethod === 'ron'
    ? restoredResult.match.game.winResult.winners.map(winner => ({
      winnerId: winner.winnerId,
      winningTileId: winner.winningTileId,
      totalPoints: winner.totalPoints,
      yaku: winner.candidate.yaku,
      payments: winner.payments,
    })) : [], ended.match.game.winResult?.winMethod === 'ron'
      ? ended.match.game.winResult.winners.map(winner => ({
        winnerId: winner.winnerId,
        winningTileId: winner.winningTileId,
        totalPoints: winner.totalPoints,
        yaku: winner.candidate.yaku,
        payments: winner.payments,
      })) : []);
  assert.deepEqual(restoredResult?.match.lastSettlement, ended.match.lastSettlement);
});

test('ron timeout treats each unanswered candidate as a pass and is idempotent', () => {
  const game = ronGame(1, [0, 2]);
  const opened = ronDecision([0, 2], 20, 1000);
  const session = sessionForGame(game, [0, 2], 20, opened);
  assert.equal(timeoutOnlineDecision(session, 30_999), session);
  assert.throws(() => applyOnlineGameAction(session, 0, {
    type: 'pass-ron', requestId: 'late-ron-pass', expectedGameRevision: 20, windowId: opened.windowId,
  }, new Set<PlayerId>([0, 2]), 31_000), error => error instanceof OnlineGameRuleError && error.code === 'stale_decision');
  const expired = timeoutOnlineDecision(session, 31_000);
  assert.equal(expired.status, 'playing');
  assert.equal(expired.match.game.players[0].temporaryFuriten, true);
  assert.equal(expired.match.game.players[2].temporaryFuriten, true);
  assert.equal(timeoutOnlineDecision(expired, 40_000), expired);
});

test('simultaneous chi and pon decisions wait for both humans and apply pon priority', () => {
  let game = ronStart(3, [0]);
  game = discardTileForOnline(game, 3, game.players[3].drawnTile!.id);
  game = markRonPassed(game, 0);
  const extraPonTiles = game.liveWall.filter(tile => tileKindKey(tile.tile) === 'sou-5').slice(0, 2);
  assert.equal(extraPonTiles.length, 2);
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  const replaced = players[2].hand.slice(0, 2);
  players[2] = { ...players[2], hand: [...players[2].hand.slice(2), ...extraPonTiles] };
  game = {
    ...game,
    phase: 'awaiting-call',
    players,
    liveWall: [...game.liveWall.filter(tile => !extraPonTiles.some(extra => extra.id === tile.id)), ...replaced],
  };
  const chi = getCallOptions(game, 0)[0];
  const pon = getCallOptions(game, 2).find(option => option.type === 'pon');
  assert.equal(chi?.type, 'chi');
  assert.equal(pon?.type, 'pon');

  const decision: PlayerDecisionWindow = {
    windowId: 'b'.repeat(24), type: 'call', openedAt: 1000, expiresAt: 31_000,
    baseGameRevision: 30, requiredSeats: [0, 2], responses: { 0: 'pending', 2: 'pending' },
  };
  const session = sessionForGame(game, [0, 2], 30, decision);
  const connected = new Set<PlayerId>([0, 2]);
  const first = applyOnlineGameAction(session, 0, {
    type: 'declare-call', requestId: 'chi-first', expectedGameRevision: 30, windowId: decision.windowId, optionId: chi.id,
  }, connected, 2000);
  assert.equal(first.match.game.phase, 'awaiting-call');
  const resolved = applyOnlineGameAction(first, 2, {
    type: 'declare-call', requestId: 'pon-second', expectedGameRevision: 30, windowId: decision.windowId, optionId: pon!.id,
  }, connected, 2001);
  assert.equal(resolved.match.game.phase, 'awaiting-discard');
  assert.equal(resolved.match.game.turnPlayerId, 2);
  assert.equal(resolved.match.game.players[2].melds?.at(-1)?.type, 'pon');
});

test('CPU takeover preserves the seat state and advances the game revision once', () => {
  const initial = sessionForGame(riichiStart(), [0, 1], 18);
  const option = getRiichiDiscardOptions(initial.match.game, 0, initial.match.points[0])[0];
  assert.ok(option);
  const riichi = applyOnlineGameAction(initial, 0, {
    type: 'declare-riichi', requestId: 'leave-riichi', expectedGameRevision: 18, tileId: option.tileId,
  }, new Set<PlayerId>([0, 1]), 1000);
  const before = structuredClone(riichi);
  const transferred = transferOnlineSeatToCpu(riichi, 0, 1, 2000);

  assert.equal(transferred.status, 'playing');
  assert.equal(transferred.gameRevision, before.gameRevision + 1);
  assert.equal(transferred.hostSeat, 1);
  assert.deepEqual(transferred.match.points, before.match.points);
  assert.deepEqual(transferred.match.game.liveWall, before.match.game.liveWall);
  assert.deepEqual(transferred.match.game.deadWall, before.match.game.deadWall);
  assert.deepEqual(transferred.match.game.players.map((player, seat) => ({
    ...player,
    control: before.match.game.players[seat].control,
  })), before.match.game.players);
  assert.equal(transferred.match.game.players[0].control, 'cpu');
  assert.equal(transferred.identities[0].control, 'cpu');
  assert.equal(transferred.identities[0].name, 'CPU1');
  assert.deepEqual(transferred.identities.filter(identity => identity.control === 'cpu').map(identity => identity.name), ['CPU1', 'CPU2', 'CPU3']);
  assert.deepEqual(transferred.identities[1], before.identities[1]);
});

test('leaving a pending ron window transfers only that answer and keeps other human answers valid', () => {
  const game = ronGame(1, [0, 2]);
  const decision = ronDecision([0, 2], 30);
  const waiting = sessionForGame(game, [0, 2], 30, decision);
  const transferred = transferOnlineSeatToCpu(waiting, 0, 2, 2000);

  assert.equal(transferred.gameRevision, 31);
  assert.deepEqual(transferred.decision?.requiredSeats, [2]);
  assert.deepEqual(transferred.decision?.responses, { 2: 'pending' });
  assert.throws(() => applyOnlineGameAction(transferred, 0, {
    type: 'declare-ron', requestId: 'old-seat-ron', expectedGameRevision: 30, windowId: decision.windowId,
  }, new Set<PlayerId>([2]), 2001), error => error instanceof OnlineGameRuleError && error.code === 'unauthorized');

  const completed = applyOnlineGameAction(transferred, 2, {
    type: 'declare-ron', requestId: 'remaining-seat-ron', expectedGameRevision: 30, windowId: decision.windowId,
  }, new Set<PlayerId>([2]), 2002);
  assert.equal(completed.status, 'round-ended');
  assert.deepEqual(completed.match.game.winResult?.winMethod === 'ron'
    ? completed.match.game.winResult.winners.map(winner => winner.winnerId).sort() : [], [0, 2]);
});

test('leaving a pending call window lets the CPU use the existing call policy immediately', () => {
  const initial = callStart();
  const discarded = discardTileForOnline(initial, 3, initial.players[3].drawnTile!.id);
  const game = { ...discarded, phase: 'awaiting-call' as const };
  assert.ok(getCallOptions(game, 0).length > 0);
  const decision: PlayerDecisionWindow = {
    windowId: 'c'.repeat(24), type: 'call', openedAt: 1000, expiresAt: 31_000,
    baseGameRevision: 30, requiredSeats: [0], responses: { 0: 'pending' },
  };
  const waiting = sessionForGame(game, [0, 1], 30, decision);
  const transferred = transferOnlineSeatToCpu(waiting, 0, 1, 2000);

  assert.equal(transferred.decision, null);
  assert.equal(transferred.match.game.phase, 'awaiting-discard');
  assert.equal(transferred.match.game.turnPlayerId, 0);
  assert.equal(transferred.match.game.players[0].control, 'cpu');
  assert.equal(transferred.match.game.players[0].melds?.at(-1)?.type, 'pon');
});

test('a deterministic human-plus-CPU online match settles through East 4', { timeout: 120_000 }, async () => {
  let seed = 0x14_0101;
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  let session = startOnlineGame(identities([0]), 0, random);
  const connected = new Set<PlayerId>([0]);
  let operations = 0;
  while (session.status !== 'match-ended' && operations < 3000) {
    if (session.status === 'round-ended') {
      session = startNextOnlineRound(session, random);
      continue;
    }
    if (session.decision) {
      const decision = session.decision;
      const action = decision.type === 'ron' ? 'pass-ron' : 'pass-call';
      session = applyOnlineGameAction(session, 0, {
        type: action, requestId: `east-match-${operations}`,
        expectedGameRevision: decision.baseGameRevision, windowId: decision.windowId,
      }, connected, operations);
      operations++;
      continue;
    }
    const game = session.match.game;
    if (game.phase === 'awaiting-discard' && game.players[game.turnPlayerId].control === 'human') {
      const player = game.players[0];
      const candidates = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
        .filter(tile => !isForbiddenDiscard(player, tile.id));
      const tileId = player.riichi ? player.drawnTile?.id : candidates[0]?.id;
      assert.ok(tileId, 'the human seat did not have a legal discard');
      session = applyOnlineGameAction(session, 0, {
        type: 'discard', requestId: `east-match-${operations}`,
        expectedGameRevision: session.gameRevision, tileId,
      }, connected, operations);
      operations++;
      continue;
    }
    const next = await advanceOnlineCpu(session, operations);
    assert.notEqual(next, session, `automatic game made no progress at ${session.match.roundNumber}局`);
    session = next;
    operations++;
  }
  assert.equal(session.status, 'match-ended', 'the deterministic East game did not finish');
  assert.equal(session.match.roundNumber, 4);
  assert.equal(session.match.lastSettlement?.matchEnded, true);
  assert.equal(session.match.points.reduce((sum, points) => sum + points, 0) + session.match.depositSticks * 1000, 100_000);
  assert.ok(operations < 3000);
});
