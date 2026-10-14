import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { deal } from '../src/game/deal.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { seeded } from './helpers.ts';
import { TILE_KINDS, tileKindKey } from '../src/model/tile.ts';
import type { GameState, PhysicalTile, PlayerId } from '../src/model/game.ts';
import { RON_HANDS } from './ron-fixture.ts';
import { NO_YAKU_WAIT } from './riichi-fixture.ts';

/** Every scenario deals an intact legal wall; no physical tiles are invented. */
export function cpuRiichiStart(seat: PlayerId = 1, winners: readonly PlayerId[] = [], declaration = winners.length ? 'sou-5' : 'north', cpuGroups: readonly string[] = winners.length ? ['11z','22z','33z','44z','55z','66z','7z'] : NO_YAKU_WAIT, extraHands: Partial<Record<PlayerId, readonly string[]>> = {}): GameState {
  const pool = shuffle(createWall(), seeded(132));
  const wall: (PhysicalTile | undefined)[] = Array(136);
  const take = (key: string) => {
    const index = pool.findIndex(t => tileKindKey(t.tile) === key);
    if (index < 0) throw new RangeError(`Missing fixture tile ${key}`);
    return pool.splice(index,1)[0];
  };
  const hand = (id: PlayerId, groups: readonly string[]) => groups.flatMap(g => [...g.slice(0,-1)].map(n =>
    take(tileKindKey(TILE_KINDS[({m:0,p:9,s:18,z:27}[g.at(-1)!]!)+Number(n)-1]))))
    .forEach((tile,round) => { wall[round*4+(id-seat+4)%4] = tile; });
  hand(seat, cpuGroups);
  for (const [id, groups] of Object.entries(extraHands)) hand(Number(id) as PlayerId, groups!);
  winners.forEach((id,index) => hand(id,RON_HANDS[index]));
  wall[52] = take(declaration);
  if (!winners.length && declaration === 'north') {
    // One safe full cycle then CPU riichi tsumo, including a forced tsumogiri.
    for (let i=53;i<60;i++) wall[i] = take(['east','south','west'][i%3]);
    wall[60] = take('man-5');
  }
  wall[126] = take('sou-9');
  for (let i=0;i<136;i++) if (!wall[i]) wall[i] = pool.shift()!;
  return deal(reserveDeadWall(wall as PhysicalTile[]),seat);
}
