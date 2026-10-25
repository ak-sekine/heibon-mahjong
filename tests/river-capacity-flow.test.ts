import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCallOptions, declareCall, resolveCallResponses } from '../src/game/calls.ts';
import { discardTile, discardTileForOnline } from '../src/game/discard.ts';
import { drawOrStop } from '../src/game/draw.ts';
import { isForbiddenDiscard } from '../src/game/melds.ts';
import { getRonCandidates, passRon } from '../src/game/ron.ts';
import { calculateRiverLayout } from '../src/rendering/river-layout.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { applyOnlineGameAction } from '../src/online/game-engine.ts';
import type { OnlineGameSession } from '../src/online/game-view.ts';
import { startGame } from '../src/game/start.ts';
import { startMatch } from '../src/game/match.ts';
import type { GameState, PlayerId } from '../src/model/game.ts';
import { seeded } from './helpers.ts';
import { inventory } from './helpers.ts';

type TraceResult = { readonly before: GameState; readonly after: GameState; readonly initial: GameState };

/**
 * Replay a full dealt game using only legal draws, discards, ron passes and
 * calls. The first available call is taken (seat 0 is preferred) to make the
 * over-capacity river states deterministic without editing a game snapshot.
 */
function replayUntil(seed: number, reached: (game: GameState) => boolean): TraceResult {
  const dealt = startGame(seeded(seed));
  const initial = { ...dealt, players: dealt.players.map(player => ({ ...player, control: 'human' as const })) as unknown as GameState['players'] };
  let game = initial;
  let discardCount = 0;
  for (let operation = 0; operation < 500; operation++) {
    if (reached(game)) return { before: game, after: game, initial: dealt };

    if (game.phase === 'awaiting-ron') {
      while (game.phase === 'awaiting-ron') {
        const candidate = getRonCandidates(game)[0];
        if (!candidate) break;
        game = passRon(game, candidate.winnerId);
      }
      continue;
    }
    if (game.phase === 'awaiting-call') {
      const options = [0, 1, 2, 3].flatMap(seat => getCallOptions(game, seat as PlayerId));
      const choice = options.find(option => option.playerId === 0) ?? options[0];
      game = choice ? declareCall(game, choice.playerId, choice.id) : resolveCallResponses(game, []);
      continue;
    }
    if (game.phase === 'awaiting-draw') {
      game = drawOrStop(game);
      continue;
    }
    if (game.phase !== 'awaiting-discard') break;

    const player = game.players[game.turnPlayerId];
    const candidates = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
      .filter(tile => !isForbiddenDiscard(player, tile.id));
    assert.ok(candidates.length, `seed ${seed} must have a legal discard`);
    const tile = candidates[(seed * 31 + discardCount * 13 + player.id) % candidates.length];
    const before = game;
    game = discardTile(game, player.id, tile.id);
    discardCount++;
    if (reached(game)) return { before, after: game, initial: dealt };
  }
  assert.fail(`seed ${seed} did not reach the requested naturally played state`);
}

function riverAfterSeatZeroDiscard(seed: number, count: number): TraceResult {
  return replayUntil(seed, game => game.players[0].river.length === count && game.players[0].drawnTile === null);
}

function onlineSession(game: GameState): OnlineGameSession {
  const identities = game.players.map(player => ({
    seat: player.id,
    name: `Player ${player.id}`,
    control: 'human' as const,
    connected: true,
  })) as unknown as OnlineGameSession['identities'];
  const match = startMatch(game);
  return {
    schemaVersion: 1,
    gameRevision: 1,
    match,
    status: 'playing',
    identities,
    hostSeat: 0,
    decision: null,
    declarations: [],
  };
}

test('legal round replay appends discards 17 through 20 to the model river', () => {
  for (const count of [17, 18, 19, 20]) {
    const { before, after, initial } = riverAfterSeatZeroDiscard(8, count);
    assert.equal(before.players[0].river.length, count - 1);
    assert.equal(before.phase, 'awaiting-discard');
    assert.ok(before.players[0].drawnTile);
    assert.equal(after.players[0].river.length, count);
    const discard = after.players[0].discardHistory!.at(-1)!;
    assert.ok([...before.players[0].hand, before.players[0].drawnTile].some(tile => tile?.id === discard.id));
    assert.equal(after.players[0].river.at(-1)?.id, discard.id);
    assert.equal(after.players[0].drawnTile, null);
    assert.equal(after.liveWall.length, before.liveWall.length);
    inventory(after, initial);
  }
});

test('18th through 20th legal discards reach the renderer boundary and layout rejects 19+', () => {
  for (const count of [18, 19, 20]) {
    const { after } = riverAfterSeatZeroDiscard(8, count);
    if (count === 18) {
      for (const position of ['bottom', 'right', 'top', 'left'] as const) {
        assert.equal(calculateRiverLayout(position, count).placements.length, count);
      }
    } else {
      assert.throws(() => calculateRiverLayout('bottom', count), RangeError);
      assert.throws(() => calculateRiverLayout('right', count), RangeError);
    }
    assert.equal(after.players[0].river.length, count);
  }
});

test('offline CPU turn can make the 19th discard from a naturally reached 18-tile river', async () => {
  const { before: gameBeforeNineteen, initial } = riverAfterSeatZeroDiscard(3, 19);
  let game = gameBeforeNineteen;
  const players = [...game.players] as GameState['players'];
  players[0] = { ...players[0], control: 'cpu' };
  game = { ...game, players };
  const expected = game.players[0].drawnTile!.id;
  let updated = game;
  const runner = new AutomaticTurnRunner({ wait: async () => {}, chooseDiscard: () => expected });
  await runner.run(() => game, next => { updated = next; game = next; });
  assert.equal(updated.players[0].river.length, 19);
  assert.equal(updated.players[0].river.at(-1)?.id, expected);
  inventory(updated, initial);
  assert.throws(() => calculateRiverLayout('bottom', updated.players[0].river.length), RangeError);
});

test('online reducer accepts the 19th discard through the same state transition', () => {
  const { before: game, initial } = riverAfterSeatZeroDiscard(3, 19);
  const tileId = game.players[0].drawnTile!.id;
  const connected = new Set<PlayerId>([0, 1, 2, 3]);
  const next = applyOnlineGameAction(onlineSession(game), 0, {
    type: 'discard', requestId: 'river-capacity-replay', expectedGameRevision: 1, tileId,
  }, connected, 10_000);
  assert.equal(next.match.game.players[0].river.length, 19);
  assert.equal(next.match.game.players[0].river.at(-1)?.id, tileId);
  inventory(next.match.game, initial);
  assert.throws(() => calculateRiverLayout('bottom', next.match.game.players[0].river.length), RangeError);
});

test('last live-wall draw permits a legal 19th discard with the last-discard marker', () => {
  const { before, initial } = replayUntil(4, game => game.phase === 'awaiting-discard' &&
    game.players[game.turnPlayerId].drawnTileSource === 'live-wall' && game.liveWall.length === 0 &&
    game.players[game.turnPlayerId].river.length === 18);
  const seat = before.turnPlayerId;
  const tileId = before.players[seat].drawnTile!.id;
  const after = discardTileForOnline(before, seat, tileId);
  assert.equal(after.players[seat].river.length, 19);
  assert.equal(after.ronWindow?.lastLiveWallDiscard, true);
  assert.equal(after.liveWall.length, 0);
  inventory(after, initial);
});
