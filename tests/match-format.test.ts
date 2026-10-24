import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRound, settleRound, startMatch } from '../src/game/match.ts';
import { startGame } from '../src/game/start.ts';
import { evaluateWin } from '../src/game/win.ts';
import { startOnlineGame, transferOnlineSeatToCpu, hydrateOnlineGame } from '../src/online/game-engine.ts';
import { createPlayerGameView } from '../src/online/game-view.ts';
import type { PlayerId } from '../src/model/game.ts';
import { fixedRon, fixedRound } from './match-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';

const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const identities = [0,1,2,3].map(seat => ({ seat: seat as PlayerId, name: `Seat ${seat}`,
  control: seat < 2 ? 'human' as const : 'cpu' as const, connected: seat < 2 }));

test('default match format is tonpu and its final East 4 rule remains unchanged', () => {
  const initial = startMatch();
  assert.equal(initial.format, 'tonpu');
  assert.equal(initial.roundWind, 'east');
  let final = settleRound({ ...initial, roundNumber: 4, game: fixedRon(0, [1]) });
  assert.equal(final.status, 'match-ended');
  assert.equal(final.lastSettlement?.next, null);
  final = settleRound({ ...initial, roundNumber: 4, game: fixedRon(0, [0]) });
  assert.equal(final.status, 'round-ended');
  assert.deepEqual(final.lastSettlement?.next, { roundWind: 'east', roundNumber: 4, dealerId: 0, honba: 1 });
});

test('tonnan crosses East 4 to South 1, advances through South 4, and ends after a non-repeat', () => {
  const eastFour = settleRound({ ...startMatch(startGame(), 'tonnan'), roundNumber: 4, game: fixedRon(0, [1]) });
  assert.equal(eastFour.status, 'round-ended');
  assert.deepEqual(eastFour.lastSettlement?.next, { roundWind: 'south', roundNumber: 1, dealerId: 1, honba: 0 });
  let match = nextRound(eastFour, id => startGame(seeded(11), id));
  assert.equal(match.roundWind, 'south');
  assert.equal(match.game.roundWind, 'south');
  for (let round = 1; round <= 4; round++) {
    const dealer = match.dealerId;
    match = settleRound({ ...match, game: fixedRound(dealer, []) });
    assert.equal(match.lastSettlement?.roundWind, 'south');
    if (round < 4) {
      assert.equal(match.status, 'round-ended');
      match = nextRound(match, id => startGame(seeded(20 + round), id));
      assert.equal(match.roundWind, 'south');
      assert.equal(match.roundNumber, round + 1);
    } else {
      assert.equal(match.status, 'match-ended');
      assert.equal(match.lastSettlement?.matchEnded, true);
      assert.equal(match.lastSettlement?.next, null);
    }
  }
});

test('South 4 dealer repeat retains South 4 and increments honba', () => {
  const match = settleRound({ ...startMatch(startGame(), 'tonnan'), roundWind: 'south', roundNumber: 4, game: fixedRon(0, [0]) });
  assert.equal(match.status, 'round-ended');
  assert.deepEqual(match.lastSettlement?.next, { roundWind: 'south', roundNumber: 4, dealerId: 0, honba: 1 });
});

test('game win evaluation uses South as the round wind for yakuhai', () => {
  const game = tsumoGame(['123m','456p','789s','222z','33z']);
  const tile = game.players[0].drawnTile!;
  assert.ok(evaluateWin(game, 0, tile, 'tsumo'));
  const south = evaluateWin({ ...game, roundWind: 'south' }, 0, tile, 'tsumo')!;
  assert.ok(south.analysis.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'yakuhai-round-wind')));
});

test('online session format reaches participants and survives persistence and host transfer', () => {
  const session = startOnlineGame(identities, 0, seeded(3), 'tonnan');
  const view = createPlayerGameView(session, 1, 'ABCDEF', new Set([0, 1]));
  assert.equal(view.format, 'tonnan');
  assert.equal(view.round.format, 'tonnan');
  const restored = hydrateOnlineGame(JSON.stringify(session))!;
  assert.equal(createPlayerGameView(restored, 1, 'ABCDEF', new Set([0, 1])).format, 'tonnan');
  const transferred = transferOnlineSeatToCpu(restored, 0, 1);
  assert.equal(transferred.match.format, 'tonnan');
  assert.equal(createPlayerGameView(transferred, 1, 'ABCDEF', new Set([1])).format, 'tonnan');
});

test('legacy serialized matches without a format hydrate as East-only', () => {
  const session = startOnlineGame(identities, 0, seeded(4));
  const legacy = structuredClone(session) as { match: Record<string, unknown> } & typeof session;
  delete legacy.match.format;
  const restored = hydrateOnlineGame(JSON.stringify(legacy))!;
  assert.equal(restored.match.format, undefined);
  assert.equal(startMatch(restored.match.game, restored.match.format ?? 'tonpu').format, 'tonpu');
});
