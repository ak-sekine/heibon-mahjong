import { TILE_KINDS, ordinaryTile } from '../src/model/tile.ts';
export const faces=(text:string)=>text.split(' ').flatMap(g=>[...g.slice(0,-1)].map(n=>ordinaryTile(TILE_KINDS[({m:0,p:9,s:18,z:27}[g.at(-1)!]!)+Number(n)-1])));
