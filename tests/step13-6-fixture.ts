import { tileKindKey } from '../src/model/tile.ts';
import type { GameState, PlayerState } from '../src/model/game.ts';
import { tsumoGame } from './tsumo-fixture.ts';

/** A real 136-tile wall with a declared pon and a legal open chinitsu tsumo. */
export function openChinitsuPonTsumoGame(): GameState {
  const game = tsumoGame(['555m', '123m', '678m', '789m', '11m'], false, [], 'sou-9');
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  const player = players[0];
  const matching = player.hand.filter(tile => tileKindKey(tile.tile) === 'man-5');
  if (matching.length !== 3) throw new RangeError('Open chinitsu fixture requires a physical five triplet');
  const ids = new Set(matching.map(tile => tile.id));
  players[0] = { ...player, hand: player.hand.filter(tile => !ids.has(tile.id)), melds: [{
    type: 'pon', tiles: [matching[0], matching[1], matching[2]],
    calledTileId: matching[0].id, fromPlayerId: 1,
  }] };
  return { ...game, players };
}
