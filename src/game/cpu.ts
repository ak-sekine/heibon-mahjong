import type { PlayerState } from '../model/game.ts';
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
