import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { deal } from '../src/game/deal.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { seeded } from './helpers.ts';
import { tileKindKey } from '../src/model/tile.ts';
import { faces } from './shanten-fixture.ts';
import type { PhysicalTile } from '../src/model/game.ts';
export function shantenProgressionStart() {
 const pool=shuffle(createWall(),seeded(1321));const wall:(PhysicalTile|undefined)[]=Array(136);
 const take=(key:string)=>{const i=pool.findIndex(t=>tileKindKey(t.tile)===key);if(i<0)throw new Error(key);return pool.splice(i,1)[0];};
 faces('123m 11z 23p 45s 67s 2z 3z').forEach((t,i)=>{wall[i*4]=take(tileKindKey(t));});
 for(const [i,key] of [[52,'pin-4'],[56,'sou-3'],[60,'north']] as const)wall[i]=take(key);
 for(const i of [53,54,55,57,58,59])wall[i]=take(['white','green','red'][i%3]);
 wall[126]=take('man-9');
 for(let i=0;i<136;i++)if(!wall[i])wall[i]=pool.shift()!;
 return deal(reserveDeadWall(wall as PhysicalTile[]),1);
}
