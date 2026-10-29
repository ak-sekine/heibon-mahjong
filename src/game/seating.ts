import type { PlayerId } from '../model/game.ts';
import { shuffle, type RandomSource } from './shuffle.ts';

export type MatchParticipant = Readonly<{ id: string; control: 'human' | 'cpu'; name: string }>;

/** Assigns the four participants to fixed clockwise game seats for one match. */
export function drawSeatAssignment<T>(participants: readonly [T, T, T, T], random: RandomSource = Math.random): readonly [T, T, T, T] {
  return shuffle(participants, random) as [T, T, T, T];
}
