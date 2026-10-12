import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { deal } from '../src/game/deal.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { getWaitingTileKinds } from '../src/game/ron.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { tileKindKey, TILE_KINDS } from '../src/model/tile.ts';
import type { GameState, PhysicalTile, PlayerId } from '../src/model/game.ts';

const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
/** Actual 136-tile wall, dealer 0, winner draws on its first ordinary turn. */
export function cpuTsumoStart(winner: 1 | 2 | 3, groups = ['123m', '456m', '789p', '22p', '456s'], indicator = 'man-4'): GameState {
  const pool = shuffle(createWall(), seeded(91));
  const take = (key: string): PhysicalTile => {
    // Prefer the actual red copy for fives.
    let index = pool.findIndex(t => tileKindKey(t.tile) === key && t.tile.isRed);
    if (index < 0) index = pool.findIndex(t => tileKindKey(t.tile) === key);
    if (index < 0) throw new RangeError('Invalid CPU fixture');
    return pool.splice(index, 1)[0];
  };
  const desired = groups.flatMap(g => [...g.slice(0, -1)].map(n => take(tileKindKey(TILE_KINDS[
    ({ m: 0, p: 9, s: 18, z: 27 }[g.at(-1)!]!) + Number(n) - 1]))));
  const winning = desired.pop()!;
  const wall: (PhysicalTile | undefined)[] = Array(136);
  desired.forEach((tile, round) => { wall[round * 4 + winner] = tile; });
  wall[52 + winner] = winning;
  // Earlier ordinary discards must not complete the winner's shape before its draw.
  const waits = new Set(getWaitingTileKinds(desired.map(t => t.tile)).map(tileKindKey));
  for (let i = 0; i < winner; i++) {
    const index = pool.findIndex(t => !waits.has(tileKindKey(t.tile)));
    wall[52 + i] = pool.splice(index, 1)[0];
  }
  wall[126] = take(indicator);
  for (let i = 0; i < 136; i++) if (!wall[i]) wall[i] = pool.shift()!;
  return deal(reserveDeadWall(wall as PhysicalTile[]));
}
export function cpuTsumoGame(winner: 1 | 2 | 3, groups?: string[], indicator?: string): GameState {
  let game = cpuTsumoStart(winner, groups, indicator);
  for (let id = 0; id < winner; id++) {
    game = discardTile(game, id as PlayerId, game.players[id].drawnTile!.id);
    game = drawTile(game, (id + 1) as PlayerId);
  }
  return game;
}
