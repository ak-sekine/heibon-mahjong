import { getRiichiDiscardOptions } from './riichi.ts';
import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import type { RandomSource } from './shuffle.ts';

/** Replaceable strategy; knows nothing about turns, timers or the DOM. */
export type DiscardStrategy = (player: PlayerState, random: RandomSource) => string;

export const chooseRandomDiscard: DiscardStrategy = (player, random = Math.random) => {
  if (player.hand.length !== 13 || player.drawnTile === null) {
    throw new RangeError('CPU selection requires fourteen tiles');
  }
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Random source must return a value in [0, 1)');
  }
  const candidates = [...player.hand, player.drawnTile];
  return candidates[Math.floor(value * candidates.length)].id;
};

/** Most wait kinds, then lexicographically ascending physical ID. No mutation/RNG. */
export function chooseCpuRiichiDiscard(game: GameState, playerId: PlayerId, points: number): string | null {
  if (game.players[playerId].control !== 'cpu') return null;
  return [...getRiichiDiscardOptions(game, playerId, points)]
    .sort((a,b) => b.waitKindCount - a.waitKindCount || (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0))[0]?.tileId ?? null;
}
