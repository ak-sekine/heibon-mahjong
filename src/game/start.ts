import type { GameState, PlayerId, RoundWind } from '../model/game.ts';
import { createWall, reserveDeadWall } from './wall.ts';
import { shuffle, type RandomSource } from './shuffle.ts';
import { deal } from './deal.ts';
import type { GameRules } from '../model/rules.ts';

export function startGame(random: RandomSource = Math.random, dealerId: PlayerId = 0, roundWind: RoundWind = 'east', rules?: GameRules): GameState {
  const game = { ...deal(reserveDeadWall(shuffle(createWall(rules), random)), dealerId), roundWind };
  return rules && (!rules.redDora || !rules.uraDora || !rules.ippatsu || !rules.kanDora) ? { ...game, rules } : game;
}
