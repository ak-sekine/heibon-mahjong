import type { GameState, OpenMeld, PhysicalTile, PlayerId, PlayerState } from '../model/game.ts';
import { tileKindKey, ordinaryTile } from '../model/tile.ts';
import { concealedSize, winningMelds } from './melds.ts';
import { cancelAllIppatsu } from './ippatsu.ts';
import { getWaitingTileKinds, resolveDiscardRon } from './ron.ts';
import { analyzeWinningShapes } from '../analysis/winning-shape.ts';
import { calculateShanten } from '../analysis/shanten.ts';

export interface KanOption {
  readonly id: string;
  readonly playerId: PlayerId;
  readonly meld: OpenMeld;
  readonly handTileIds: readonly string[];
  readonly meldIndex: number | null;
  readonly tile: PhysicalTile;
}
export function canTakeRinshan(game: GameState): boolean {
  return Number.isInteger(game.kanCount ?? 0) && (game.kanCount ?? 0)>=0 && (game.kanCount ?? 0)<4 && game.deadWall.length===14 && game.liveWall.length>0 && !game.abortiveDraw;
}
/** Conservative riichi policy: every pre-kan winning decomposition must contain
 * this exact concealed triplet; neither seven pairs nor sequence reassignment. */
function riichiAnkanAllowed(p: PlayerState, tiles: readonly PhysicalTile[]): boolean {
  if(p.drawnTileSource!=='live-wall' || !tiles.some(t=>t.id===p.drawnTile?.id)) return false;
  const key=tileKindKey(tiles[0].tile), fixed=winningMelds(p.melds);
  const before=getWaitingTileKinds(p.hand.map(t=>t.tile),fixed);
  const remaining=p.hand.filter(t=>tileKindKey(t.tile)!==key).map(t=>t.tile);
  const after=getWaitingTileKinds(remaining,[...fixed,{type:'triplet',tile:tiles[0].tile,kan:true,concealed:true}]);
  if(!before.length || before.map(tileKindKey).join()!==after.map(tileKindKey).join()) return false;
  return before.every(wait=>{
    const shapes=analyzeWinningShapes([...p.hand.map(t=>t.tile),ordinaryTile(wait)],fixed);
    return !shapes.sevenPairs.isWinning && !shapes.thirteenOrphans.isWinning && shapes.standard.decompositions.length>0 && shapes.standard.decompositions.every(d=>d.melds.slice(fixed.length).some(m=>m.type==='triplet' && tileKindKey(m.tile)===key));
  });
}
export function getKanOptions(game: GameState, playerId: PlayerId): readonly KanOption[] {
  const p=game.players[playerId];
  if(!p || p.id!==playerId || game.turnPlayerId!==playerId || game.phase!=='awaiting-discard' || game.pendingRiichi || game.ronWindow || game.winResult || !canTakeRinshan(game) || !p.drawnTile || !['live-wall','rinshan'].includes(p.drawnTileSource ?? '') || p.callDiscard || p.hand.length!==concealedSize(p)) return [];
  const all=[...p.hand,p.drawnTile], physical=[...all,...(p.melds ?? []).flatMap(m=>m.tiles)];
  if(new Set(physical.map(t=>t.id)).size!==physical.length) return [];
  const options:KanOption[]=[];
  for(const key of [...new Set(all.map(t=>tileKindKey(t.tile)))].sort()) {
    const tiles=all.filter(t=>tileKindKey(t.tile)===key).sort((a,b)=>a.id.localeCompare(b.id));
    if(tiles.length===4 && (!p.riichi || riichiAnkanAllowed(p,tiles))) {
      const meld:OpenMeld={type:'ankan',tiles:tiles as [PhysicalTile,PhysicalTile,PhysicalTile,PhysicalTile],calledTileId:'',fromPlayerId:playerId};
      options.push({id:`ankan:${tiles.map(t=>t.id).join(':')}`,playerId,meld,handTileIds:tiles.map(t=>t.id),meldIndex:null,tile:tiles.find(t=>t.id===p.drawnTile!.id) || tiles[3]});
    }
  }
  if(!p.riichi) (p.melds ?? []).forEach((m,index)=>{
    if(m.type!=='pon') return;
    for(const tile of all.filter(t=>tileKindKey(t.tile)===tileKindKey(m.tiles[0].tile))) {
      const meld:OpenMeld={...m,type:'kakan',tiles:[...m.tiles,tile],addedTileId:tile.id};
      options.push({id:`kakan:${index}:${tile.id}`,playerId,meld,handTileIds:[tile.id],meldIndex:index,tile});
    }
  });
  return options;
}
/** Called only after all robbery decisions; move the live tail into a used slot. */
export function completeKan(game: GameState, option: Omit<KanOption,'id'>): GameState {
  if(!canTakeRinshan(game)) throw new RangeError('No rinshan available');
  const p=game.players[option.playerId], count=game.kanCount ?? 0;
  const hand=[...p.hand,...(p.drawnTile?[p.drawnTile]:[])].filter(t=>!option.handTileIds.includes(t.id));
  const melds=[...(p.melds ?? [])];
  if(option.meldIndex===null) melds.push(option.meld); else melds[option.meldIndex]=option.meld;
  const deadWall=[...game.deadWall],rinshan=deadWall[count];deadWall[count]=game.liveWall.at(-1)!;
  const players=[...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[p.id]={...p,hand,melds,drawnTile:rinshan,drawnTileSource:'rinshan',temporaryFuriten:false,callDiscard:null};
  const distributed=count===3 && players.filter(p=>(p.melds ?? []).some(m=>m.tiles.length===4)).length>1;
  // Four distributed kans end immediately on confirmation, before any win/discard.
  // The reserved fourth rinshan is still transferred to keep all 136 IDs unique.
  return cancelAllIppatsu({...game,turnPlayerId:p.id,players,deadWall,liveWall:game.liveWall.slice(0,-1),kanCount:count+1,callsMade:true,ronWindow:null,phase:distributed?'wall-exhausted':'awaiting-discard',...(distributed?{abortiveDraw:'four-kans' as const}:{})});
}
export function declareKan(game: GameState, playerId: PlayerId, optionId: string): GameState {
  const option=getKanOptions(game,playerId).find(o=>o.id===optionId);
  if(!option) throw new RangeError('Invalid kan');
  return resolveDiscardRon({...game,phase:'awaiting-ron',ronWindow:{kind:option.meld.type as 'ankan'|'kakan',discarderId:playerId,tileId:option.tile.id,kan:option}});
}
/** Deterministic, own-hand-only: ankan preserves groups; kakan needs an existing
 * value route and must not worsen the best post-discard shanten. */
export function chooseCpuKan(game: GameState, playerId: PlayerId): KanOption | null {
  const p=game.players[playerId];
  if(p.control!=='cpu') return null;
  return getKanOptions(game,playerId).find(o=>{
    if(o.meld.type==='ankan') {
      if(p.riichi) return true;
      const before=Math.min(...[...p.hand,p.drawnTile!].map(t=>calculateShanten([...p.hand,p.drawnTile!].filter(x=>x.id!==t.id).map(x=>x.tile),p.melds?.length ?? 0).minimum));
      const after=[...p.hand,p.drawnTile!].filter(t=>!o.handTileIds.includes(t.id));
      return calculateShanten(after.map(t=>t.tile),(p.melds?.length ?? 0)+1).minimum<=before;
    }
    const remaining=[...p.hand,p.drawnTile!].filter(t=>!o.handTileIds.includes(t.id));
    const before=calculateShanten(p.hand.map(t=>t.tile),p.melds?.length ?? 0).minimum;
    const value=(p.melds ?? []).some(m=>m.type!=='chi' && m.tiles[0].tile.category==='honor' && ['white','green','red','east',p.wind].includes(m.tiles[0].tile.honor));
    return value && calculateShanten(remaining.map(t=>t.tile),p.melds?.length ?? 0).minimum<=before;
  }) ?? null;
}
