import { createWall, reserveDeadWall } from '../game/wall.ts';
import { shuffle } from '../game/shuffle.ts';
import { deal } from '../game/deal.ts';
const seeded=(seed:number)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
import { startGame } from '../game/start.ts';
import { TILE_KINDS, tileKindKey } from '../model/tile.ts';
import type { GameState, OpenMeld, PhysicalTile, PlayerId } from '../model/game.ts';
export interface KanFixture {
  hands: Partial<Record<PlayerId,readonly string[]>>;
  turn?: PlayerId;
  draw: string;
  melds?: Partial<Record<PlayerId,readonly {type:OpenMeld['type'];group:string;from?:PlayerId}[]>>;
  rinshan?: readonly string[];
  indicators?: readonly string[];
  ura?: readonly string[];
}
/** Allocate every location from one pool; impossible fifth copies fail loudly. */
export function kanGame(spec:KanFixture):GameState {
 const pool=shuffle(createWall(),seeded(937));
 const take=(key:string):PhysicalTile=>{
   const red=key.startsWith('red:');key=key.replace('red:','');
   const i=pool.findIndex(t=>tileKindKey(t.tile)===key && t.tile.isRed===red);
   if(i<0) throw new RangeError(`Missing ${key}`);return pool.splice(i,1)[0];
 };
 const group=(g:string)=>[...g.slice(0,-1)].map(n=>take((n==='0'?'red:':'')+tileKindKey(TILE_KINDS[({m:0,p:9,s:18,z:27}[g.at(-1)!]!)+(n==='0'?5:Number(n))-1])));
 const turn=spec.turn ?? 0;
 const melds=[0,1,2,3].map(id=>(spec.melds?.[id as PlayerId] ?? []).map(s=>{
   const tiles=group(s.group);return {type:s.type,tiles,calledTileId:s.type==='ankan'?'':tiles[1].id,...(s.type==='kakan'?{addedTileId:tiles[3].id}:{}),fromPlayerId:s.from ?? ((id+3)%4) as PlayerId} as unknown as OpenMeld;
 }));
 const hands=[0,1,2,3].map(id=>spec.hands[id as PlayerId]?.flatMap(group));
 const draw=take(spec.draw),rinshan=(spec.rinshan ?? []).map(take);
 const reserved:(PhysicalTile|undefined)[]=Array(14);
 rinshan.forEach((t,i)=>reserved[i]=t);
 spec.indicators?.forEach((key,i)=>reserved[4+2*i]=take(key));
 spec.ura?.forEach((key,i)=>reserved[5+2*i]=take(key));
 const base=startGame();
 const players=base.players.map((p,id)=>{
  const hand=hands[id] ?? pool.splice(0,13-3*melds[id].length);
  if(hand.length!==13-3*melds[id].length)throw new RangeError(`Wrong hand ${id}`);
  return {...p,hand,melds:melds[id],drawnTile:id===turn?draw:null,drawnTileSource:id===turn?'live-wall' as const:null,river:[],discardHistory:[]};
 }) as unknown as GameState['players'];
 const deadWall=reserved.map(t=>t);
 for(let i=0;i<14;i++) if(!deadWall[i]) deadWall[i]=pool.pop()!;
 return {...base,turnPlayerId:turn,players,deadWall:deadWall as PhysicalTile[],liveWall:pool,kanCount:melds.flat().filter(m=>m.tiles.length===4).length};
}
export function openingAnkanGame():GameState {
 const wall=shuffle(createWall(),seeded(947)),occupied=new Set<number>();
 const placeKind=(kind:string,slots:readonly number[])=>{
  for(const slot of slots){
   const source=wall.findIndex((tile,index)=>!occupied.has(index)&&tileKindKey(tile.tile)===kind);
   if(source<0)throw new RangeError(`Missing opening kan tile ${kind}`);
   [wall[slot],wall[source]]=[wall[source],wall[slot]];occupied.add(slot);
  }
 };
 // Dealer's concealed hand occupies slots 0, 4, ... 48; slot 52 is the deal tile.
 placeKind('man-1',[0,4,8,52]);
 placeKind('east',[12,16,20,24]);
 return deal(reserveDeadWall(wall),0);
}
export const ankanGame=()=>kanGame({hands:{0:['111z','234m','456p','678s','2z']},draw:'east',rinshan:['south']});
export const kakanGame=()=>kanGame({hands:{0:['234m','456p','678s','2z']},melds:{0:[{type:'pon',group:'111z'}]},draw:'east',rinshan:['south']});
