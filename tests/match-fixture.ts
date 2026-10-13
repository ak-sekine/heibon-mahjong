import type { GameState, PhysicalTile, PlayerId, PlayerState } from '../src/model/game.ts';
import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { deal } from '../src/game/deal.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { seeded } from './helpers.ts';
import { TILE_KINDS, tileKindKey } from '../src/model/tile.ts';
import { discardTile } from '../src/game/discard.ts';
import { declareRon, getWaitingTileKinds } from '../src/game/ron.ts';
import { RON_HANDS } from './ron-fixture.ts';
const DRAW_HANDS = [...RON_HANDS, ['789p','123m','789s','22z','34m']];
/** Test-only factory arranging an actual 136-tile wall before dealing. */
export function fixedRound(dealerId: PlayerId, ready: readonly PlayerId[], ron = false, discarderId: PlayerId = 3, readyGroups: readonly (readonly string[])[] = DRAW_HANDS): GameState {
  const pool = shuffle(createWall(),seeded(137));
  const take = (key: string) => {
    const index=pool.findIndex(t=>tileKindKey(t.tile)===key);
    if(index<0) throw new RangeError(`Missing physical tile ${key}`);
    return pool.splice(index,1)[0];
  };
  const wall: (PhysicalTile|undefined)[] = Array(136);
  if(ron) wall[53]=take('sou-5');
  wall[126]=take('sou-4');
  ready.forEach((id,index)=> {
    const groups = (ron ? RON_HANDS : readyGroups)[index];
    const tiles=groups.flatMap(g=>[...g.slice(0,-1)].map(n=>take(tileKindKey(TILE_KINDS[({m:0,p:9,s:18,z:27}[g.at(-1)!]!)+Number(n)-1]))));
    tiles.forEach((tile,round)=>wall[round*4+(id-dealerId+4)%4]=tile);
  });
  for(let i=0;i<136;i++) if(!wall[i]) wall[i]=pool.shift()!;
  let game=deal(reserveDeadWall(wall as PhysicalTile[]),dealerId);
  const players=game.players.map(p=>({...p,river:p.drawnTile ? [p.drawnTile] : [],drawnTile:null,drawnTileSource:null})) as unknown as [PlayerState,PlayerState,PlayerState,PlayerState];
  if(ron) {
    players[discarderId]={...players[discarderId],drawnTile:game.liveWall[0],drawnTileSource:'live-wall'};
    game={...game,players,liveWall:game.liveWall.slice(1),turnPlayerId:discarderId};
    game=discardTile(game,discarderId,players[discarderId].drawnTile!.id);
    return game.phase==='awaiting-ron' ? declareRon(game,0) : game;
  }
  game.liveWall.forEach((tile,index)=> {
    const id=(index%4) as PlayerId; players[id]={...players[id],river:[...players[id].river,tile]};
  });
  game={...game,players,liveWall:[],phase:'wall-exhausted'};
  for(const p of players) if((getWaitingTileKinds(p.hand.map(t=>t.tile)).length>0)!==ready.includes(p.id)) throw new RangeError('Unexpected fixture tenpai');
  return game;
}
export const fixedRon = (dealerId: PlayerId, winners: readonly PlayerId[], discarderId: PlayerId = 3) => fixedRound(dealerId,winners,true,discarderId);
