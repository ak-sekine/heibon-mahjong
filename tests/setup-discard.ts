import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';
import { discardFromPlayer } from '../src/game/discard.ts';
/** Fixture construction only: arrange a prior closed round without invoking any
 * declaration policies. Tests of play use the public discardTile API. */
export function setupDiscard(game: GameState, id: PlayerId, tileId: string): GameState {
  const players=[...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[id]=discardFromPlayer(players[id],tileId);
  return {...game,players,phase:'awaiting-draw',turnPlayerId:((id+1)%4) as PlayerId,ronWindow:null};
}
