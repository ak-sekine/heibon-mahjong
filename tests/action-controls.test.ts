import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalActionPanelState } from '../src/rendering/local-action-panel-state.ts';
import { startMatch } from '../src/game/match.ts';
import { riichiStart } from './riichi-fixture.ts';

test('legal-only display: discard remains visible while riichi and tsumo require a legal selected operation', () => {
  const match = startMatch(riichiStart('tsumo'));
  const snapshot = structuredClone(match);
  const player = match.game.players[0];
  const selected = player.drawnTile!.id;
  const invalid = player.hand.find(tile => tile.tile.category === 'suited' && tile.tile.suit === 'man' && tile.tile.rank === 1)!.id;

  const unselected = createLocalActionPanelState(match, null, false, false);
  assert.equal(unselected.buttons.discard.visible, true);
  assert.equal(unselected.buttons.discard.enabled, false);
  assert.equal(unselected.buttons.riichi.visible, false);
  assert.equal(unselected.buttons.tsumo.visible, false);

  const eligible = createLocalActionPanelState(match, selected, false, false);
  assert.equal(eligible.buttons.discard.enabled, true);
  assert.equal(eligible.buttons.riichi.visible, true);
  assert.equal(eligible.buttons.riichi.enabled, true);

  const ineligible = createLocalActionPanelState(match, invalid, false, false);
  assert.equal(ineligible.buttons.discard.enabled, true);
  assert.equal(ineligible.buttons.riichi.visible, false);
  assert.deepEqual(match, snapshot);
});
