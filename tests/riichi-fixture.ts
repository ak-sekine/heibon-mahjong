import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { deal } from '../src/game/deal.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { TILE_KINDS, tileKindKey } from '../src/model/tile.ts';
import type { PhysicalTile } from '../src/model/game.ts';
const seeded = (seed: number) => () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296);

export const NO_YAKU_WAIT = ['123m','456p','789s','22p','46m'];
/** Complete legal wall, not isolated/fabricated hands. CPU1 draws the ron tile.
 * tsumo mode reserves the winning tile for the human's next draw instead.
 */
export function riichiStart(mode: 'ron' | 'tsumo' | 'declared-ron' | 'same-kind' | 'cpu-tsumo' | 'furiten' = 'ron') {
  const pool = shuffle(createWall(), seeded(913));
  const wall: (PhysicalTile | undefined)[] = Array(136);
  const take = (key: string, red = false) => {
    const index = pool.findIndex(t => tileKindKey(t.tile) === key && t.tile.isRed === red);
    if (index < 0) throw new RangeError(`No physical tile ${key}`);
    return pool.splice(index,1)[0];
  };
  const hand = (groups: readonly string[], id: number) => groups.flatMap(g => [...g.slice(0,-1)].map(n =>
    take(tileKindKey(TILE_KINDS[({m:0,p:9,s:18,z:27}[g.at(-1)!]!)+Number(n)-1]))))
    .forEach((tile,round) => { wall[round*4+id] = tile; });
  hand(mode === 'same-kind' ? ['123m','55m','789s','22p','456p'] : NO_YAKU_WAIT, 0);
  if (mode === 'declared-ron' || mode === 'cpu-tsumo') hand(['123p','456p','789s','22m','34s'],1);
  wall[52] = take(mode === 'declared-ron' ? 'sou-5' : 'north');
  wall[53] = take(mode === 'ron' || mode === 'furiten' ? 'man-5' : mode === 'cpu-tsumo' ? 'sou-5' : 'west');
  wall[54] = take('north'); wall[55] = take('west');
  wall[56] = mode === 'furiten' ? take('east') : take('man-5', true);
  if (mode === 'furiten') {
    wall[57] = take('south'); wall[58] = take('man-5'); wall[59] = take('north'); wall[60] = take('man-5',true);
  }
  wall[126] = take('sou-9');
  for (let i=0;i<136;i++) if (!wall[i]) wall[i] = pool.shift()!;
  return deal(reserveDeadWall(wall as PhysicalTile[]));
}
