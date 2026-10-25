import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discardTile } from '../src/game/discard.ts';
import { GameController } from '../src/ui/controller.ts';
import { createWall } from '../src/game/wall.ts';
import type { GameState } from '../src/model/game.ts';
import { tileKindKey } from '../src/model/tile.ts';
import { createRiverTestState } from '../src/verification/river-test-fixture.ts';

function assertPhysicalInventory(game: GameState, requireSelfDraw = true): void {
  const tiles = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
    ...player.hand,
    ...(player.drawnTile ? [player.drawnTile] : []),
    ...player.river,
    ...(player.melds ?? []).flatMap(meld => meld.tiles),
  ])];
  const canonical = new Map(createWall().map(tile => [tile.id, tileKindKey(tile.tile)]));
  assert.equal(tiles.length, 136);
  assert.equal(new Set(tiles.map(tile => tile.id)).size, 136);
  for (const tile of tiles) assert.equal(canonical.get(tile.id), tileKindKey(tile.tile));
  assert.equal(game.deadWall.length, 14);
  assert.ok(game.players.every(player => player.hand.length === 13 - 3 * (player.melds?.length ?? 0) + Number(Boolean(player.callDiscard))));
  assert.equal(game.players[0].hand.length, 13 - 3 * (game.players[0].melds?.length ?? 0));
  if (requireSelfDraw) assert.ok(game.players[0].drawnTile);
  for (const player of game.players) {
    const history = new Set((player.discardHistory ?? []).map(tile => tile.id));
    assert.ok(player.river.every(tile => history.has(tile.id)));
  }
}

for (const count of [17, 18, 19]) {
  test(`river test ${count} starts from a legal human discard turn and can append one real tile`, () => {
    const game = createRiverTestState(count);
    assert.equal(game.phase, 'awaiting-discard');
    assert.equal(game.dealerId, 0);
    assert.equal(game.turnPlayerId, 0);
    assert.deepEqual(game.players.map(player => player.control), ['human', 'cpu', 'cpu', 'cpu']);
    assert.equal(game.players[0].river.length, count);
    assertPhysicalInventory(game);

    const drawn = game.players[0].drawnTile!;
    const updated = discardTile(game, 0, drawn.id);
    assert.equal(updated.players[0].hand.length, game.players[0].hand.length);
    assert.equal(updated.players[0].drawnTile, null);
    assert.equal(updated.players[0].discardHistory!.at(-1)?.id, drawn.id);
    assert.ok(updated.players[0].river.length === count || updated.players[0].river.length === count + 1,
      'an automatically called discard is retained in history and moved to the caller meld');
    assertPhysicalInventory(updated, false);
  });
}

test('23, 24, and 25 tile river states are not fabricated without a verified legal fixture', () => {
  for (const count of [23, 24, 25]) assert.throws(() => createRiverTestState(count), RangeError);
});

test('18 tile start runs CPU turns and returns to the human for a 20th discard', async () => {
  const controller = new GameController(() => createRiverTestState(18), {
    wait: async () => {},
    chooseDiscard: player => player.drawnTile!.id,
  });
  for (const expectedRiverCount of [19, 20]) {
    assert.equal(controller.game.players[0].river.length, expectedRiverCount - 1);
    const selected = controller.game.players[0].drawnTile!.id;
    controller.select(selected);
    assert.equal(controller.canConfirm, true);
    await controller.confirm();
    assert.equal(controller.game.players[0].river.length, expectedRiverCount);
    assertPhysicalInventory(controller.game, false);
    if (expectedRiverCount === 19) {
      assert.equal(controller.game.turnPlayerId, 0);
      assert.equal(controller.game.phase, 'awaiting-discard');
      assert.ok(controller.game.players[0].drawnTile);
    }
  }
});
