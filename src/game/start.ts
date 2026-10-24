import type { GameState, PlayerId, RoundWind } from '../model/game.ts';
import { createWall, reserveDeadWall } from './wall.ts';
import { shuffle, type RandomSource } from './shuffle.ts';
import { deal } from './deal.ts';

export function startGame(random: RandomSource = Math.random, dealerId: PlayerId = 0, roundWind: RoundWind = 'east'): GameState {
  return { ...deal(reserveDeadWall(shuffle(createWall(), random)), dealerId), roundWind };
}
