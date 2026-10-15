import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { deal } from '../src/game/deal.ts';
import { TILE_KINDS, tileKindKey } from '../src/model/tile.ts';
import type { GameState, PhysicalTile, PlayerId } from '../src/model/game.ts';
const seeded = (seed:number) => () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
/** Every fixture is dealt from a complete legal 136-tile wall. */
export function callStart(discarder:PlayerId=3, hands:Partial<Record<PlayerId,readonly string[]>>={0:['55z','234m','456p','678s','19p']}, called='white', next:readonly string[]=[]):GameState {
  const pool=shuffle(createWall(),seeded(734));
  const wall:(PhysicalTile|undefined)[]=Array(136);
  const take=(key:string):PhysicalTile=>{
    const red=key.startsWith('red:');key=key.replace('red:','');
    const i=pool.findIndex(t=>tileKindKey(t.tile)===key && t.tile.isRed===red);
    if(i<0) throw new RangeError(`Missing ${key}`);return pool.splice(i,1)[0];
  };
  for(const [seat,groups] of Object.entries(hands)) {
    const tiles=groups!.flatMap(g=>[...g.slice(0,-1)].map(n=>take((n==='0'?'red:':'')+tileKindKey(TILE_KINDS[({m:0,p:9,s:18,z:27}[g.at(-1)!]!)+(n==='0'?5:Number(n))-1]))));
    if(tiles.length!==13) throw new RangeError('Need thirteen');
    tiles.forEach((t,r)=>{wall[r*4+(Number(seat)-discarder+4)%4]=t;});
  }
  wall[52]=take(called);
  next.forEach((key,i)=>{wall[53+i]=take(key);});
  for(let i=0;i<136;i++) if(!wall[i]) wall[i]=pool.shift()!;
  return deal(reserveDeadWall(wall as PhysicalTile[]),discarder);
}

/** Public meld scoring fixtures retain all 136 real tiles and separate the win
 * tile from the concealed hand exactly as the game APIs do. */
export function openWinGame(groups:readonly string[], meldGroups:readonly string[], method:'ron'|'tsumo'='ron', indicatorKey?:string):GameState {
 const pool=createWall();
 const takeGroup=(g:string)=>[...g.slice(0,-1)].map(n=>{
  const kind=TILE_KINDS[({m:0,p:9,s:18,z:27}[g.at(-1)!]!)+(n==='0'?5:Number(n))-1];
  const i=pool.findIndex(t=>tileKindKey(t.tile)===tileKindKey(kind)&&t.tile.isRed===(n==='0'));
  if(i<0)throw new RangeError('Invalid open fixture');return pool.splice(i,1)[0];
 });
 const hand=groups.flatMap(takeGroup);const win=hand.pop()!;
 const melds=meldGroups.map(g=>{const tiles=takeGroup(g) as [PhysicalTile,PhysicalTile,PhysicalTile];return {type:(tiles.every(t=>tileKindKey(t.tile)===tileKindKey(tiles[0].tile))?'pon':'chi') as 'pon'|'chi',tiles,calledTileId:tiles[0].id,fromPlayerId:3 as const};});
 const indicator=indicatorKey ? pool.splice(pool.findIndex(t=>tileKindKey(t.tile)===indicatorKey),1)[0] : null;
 const base=deal(reserveDeadWall(createWall()));
 const past=pool.shift()!;
 const players=base.players.map(p=>p.id===0?{...p,hand,melds,drawnTile:method==='tsumo'?win:null,drawnTileSource:method==='tsumo'?'live-wall' as const:null,river:[past],discardHistory:[past]}:{...p,hand:pool.splice(0,13),drawnTile:null,drawnTileSource:null,river:p.id===3&&method==='ron'?[win]:[],discardHistory:p.id===3?[...melds.map(m=>m.tiles[0]),...(method==='ron'?[win]:[])]:[]}) as unknown as GameState['players'];
 const deadWall=pool.splice(-(indicator?13:14));
 if(indicator)deadWall.splice(4,0,indicator);
 return {...base,players,deadWall,liveWall:pool,callsMade:true,turnPlayerId:method==='ron'?3:0,phase:method==='ron'?'awaiting-ron':'awaiting-discard',ronWindow:method==='ron'?{discarderId:3,tileId:win.id}:null};
}
