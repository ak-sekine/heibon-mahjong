import type { GameState, PlayerState } from '../model/game.ts';

/** Shared expiration; drawing and passing ron deliberately do not call this. */
export function endIppatsu(player: PlayerState): PlayerState {
  return player.riichi?.ippatsuEligible
    ? { ...player, riichi: { ...player.riichi, ippatsuEligible: false } } : player;
}

/** Every established call cancels all current ippatsu rights. */
export function cancelAllIppatsu(game: GameState): GameState {
  return { ...game, players: game.players.map(endIppatsu) as unknown as GameState['players'] };
}
