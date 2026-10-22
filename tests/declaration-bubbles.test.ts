import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startGame } from '../src/game/start.ts';
import { resolveRonDeclarations } from '../src/game/ron.ts';
import type { GameState, OpenMeld, PlayerId, PlayerState } from '../src/model/game.ts';
import { declarationsBetween, type DeclarationKind } from '../src/model/declaration.ts';
import type { PublicDeclarationEvent } from '../src/model/declaration.ts';
import { collectRecentDeclarations } from '../src/online/declaration-cursor.ts';
import {
  calculateDeclarationBubblePoint,
  DECLARATION_BUBBLE_DURATION_MS,
  declarationLabel,
} from '../src/rendering/declaration-bubbles.ts';
import { ronGame } from './ron-fixture.ts';

const base = startGame(() => 0.25);

function withPlayer(game: GameState, seat: PlayerId, update: (player: PlayerState) => PlayerState): GameState {
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[seat] = update(players[seat]);
  return { ...game, players };
}

function meld(type: 'pon' | 'chi' | 'ankan' | 'daiminkan' | 'kakan', seat: PlayerId): OpenMeld {
  const tiles = base.liveWall.slice(0, type === 'pon' || type === 'chi' ? 3 : 4);
  return {
    type,
    tiles: tiles as unknown as OpenMeld['tiles'],
    calledTileId: type === 'ankan' ? '' : tiles[0].id,
    fromPlayerId: seat,
    ...(type === 'kakan' ? { addedTileId: tiles[3].id } : {}),
  } as OpenMeld;
}

test('all five declarations have the expected large-display labels and a two-second lifetime', () => {
  const labels: Record<DeclarationKind, string> = {
    riichi: 'リーチ', pon: 'ポン', kan: 'カン', chi: 'チー', ron: 'ロン',
  };
  for (const [kind, label] of Object.entries(labels) as [DeclarationKind, string][]) {
    assert.equal(declarationLabel(kind), label);
  }
  assert.equal(DECLARATION_BUBBLE_DURATION_MS, 2000);
});

test('declaration changes emit only newly established calls, kans, riichi, and every ron winner', () => {
  const cases: readonly [DeclarationKind, PlayerId, GameState][] = [
    ['riichi', 1, withPlayer(base, 1, player => ({ ...player, riichi: { declarationTileId: player.hand[0].id } }))],
    ['pon', 2, withPlayer(base, 2, player => ({ ...player, melds: [meld('pon', 2)] }))],
    ['chi', 3, withPlayer(base, 3, player => ({ ...player, melds: [meld('chi', 3)] }))],
    ['kan', 1, withPlayer(base, 1, player => ({ ...player, melds: [meld('ankan', 1)] }))],
    ['kan', 0, withPlayer(base, 0, player => ({ ...player, melds: [meld('daiminkan', 0)] }))],
    ['kan', 0, withPlayer(base, 0, player => ({ ...player, melds: [meld('kakan', 0)] }))],
  ];
  for (const [kind, seat, next] of cases) {
    assert.deepEqual(declarationsBetween(base, next), [{ seat, kind }]);
    assert.deepEqual(declarationsBetween(next, next), [], 'a render of the same state must not replay a declaration');
  }

  const pon = meld('pon', 0);
  const addedKan = meld('kakan', 0);
  const withPon = withPlayer(base, 0, player => ({ ...player, melds: [pon] }));
  const withKakan = withPlayer(withPon, 0, player => ({ ...player, melds: [addedKan] }));
  assert.deepEqual(declarationsBetween(withPon, withKakan), [{ seat: 0, kind: 'kan' }]);

  const ron = resolveRonDeclarations(ronGame(1, [0, 2]), [0, 2]);
  assert.deepEqual(declarationsBetween(ronGame(1, [0, 2]), ron)
    .map(event => event.seat).sort(), [0, 2]);
  assert.ok(declarationsBetween(ronGame(1, [0, 2]), ron).every(event => event.kind === 'ron'));
  assert.deepEqual(declarationsBetween(null, ron), [], 'the first view is a baseline, not a new declaration');
});

test('four positions keep the bubble inside a 320px square table', () => {
  const table = { left: 0, top: 0, right: 312, bottom: 312 };
  const rivers = {
    bottom: { left: 110, top: 228, right: 200, bottom: 270 },
    right: { left: 250, top: 110, right: 292, bottom: 200 },
    top: { left: 110, top: 20, right: 200, bottom: 62 },
    left: { left: 20, top: 110, right: 62, bottom: 200 },
  } as const;
  for (const position of ['bottom', 'right', 'top', 'left'] as const) {
    const point = calculateDeclarationBubblePoint(table, rivers[position], { width: 100, height: 50 }, position);
    assert.ok(point.left >= 16 && point.top >= 16, `${position}: ${JSON.stringify(point)}`);
    assert.ok(point.left + 100 <= 296 && point.top + 50 <= 296, `${position}: ${JSON.stringify(point)}`);
  }
});

test('online event cursor baselines on first state, catches skipped updates, and ignores duplicates and old rounds', () => {
  const events: readonly PublicDeclarationEvent[] = [
    { id: 1, roundNumber: 2, dealerId: 0, honba: 1, seat: 0, kind: 'riichi', occurredAt: 900 },
    { id: 2, roundNumber: 2, dealerId: 0, honba: 1, seat: 1, kind: 'pon', occurredAt: 950 },
    { id: 3, roundNumber: 2, dealerId: 0, honba: 0, seat: 2, kind: 'kan', occurredAt: 990 },
    { id: 4, roundNumber: 2, dealerId: 1, honba: 0, seat: 3, kind: 'ron', occurredAt: -1500 },
    { id: 5, roundNumber: 2, dealerId: 0, honba: 1, seat: 3, kind: 'chi', occurredAt: 1001 },
  ];
  const round = { roundNumber: 2, dealerId: 0, honba: 1 };
  const initial = collectRecentDeclarations(null, events.slice(0, 1), round, 1000);
  assert.equal(initial.cursor, 1);
  assert.deepEqual(initial.recent, [], 'a page entering an existing game does not replay history');

  const afterSkippedUpdates = collectRecentDeclarations(initial.cursor, events, round, 1000);
  assert.equal(afterSkippedUpdates.cursor, 5);
  assert.deepEqual(afterSkippedUpdates.recent.map(({ event, remainingMs }) => [event.id, remainingMs]), [
    [2, 1950],
  ]);
  assert.deepEqual(collectRecentDeclarations(afterSkippedUpdates.cursor, events, round, 1100).recent, [],
    're-rendering or re-receiving the same state must not repeat a bubble');
});
