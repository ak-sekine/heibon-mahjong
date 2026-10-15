import type { GameState, OpenMeld, PhysicalTile, PlayerId, PlayerState } from '../model/game.ts';
import { tileKindKey } from '../model/tile.ts';
import { concealedSize, winningMelds } from './melds.ts';
import { cancelAllIppatsu } from './ippatsu.ts';
import { calculateShanten } from '../analysis/shanten.ts';

export interface CallOption extends OpenMeld {
  readonly playerId: PlayerId;
  readonly id: string;
  readonly handTileIds: readonly [string,string];
  readonly forbiddenKinds: readonly string[];
}
/** Called kind is always forbidden. Chi also forbids the alternative end of the
 * same two owned tiles (e.g. 123 chi on 1 forbids both 1 and 4). */
function forbidden(type: 'pon'|'chi', called: PhysicalTile, owned: readonly PhysicalTile[]): string[] {
  const keys=[tileKindKey(called.tile)];
  if(type==='chi' && called.tile.category==='suited') {
    const ranks=owned.map(t=>t.tile.category==='suited'?t.tile.rank:0).sort((a,b)=>a-b);
    if(ranks[1]-ranks[0]===1) for(const rank of [ranks[0]-1,ranks[1]+1]) {
      if(rank>=1 && rank<=9) keys.push(`${called.tile.suit}-${rank}`);
    }
  }
  return [...new Set(keys)];
}
export function getCallOptions(game: GameState, playerId: PlayerId): readonly CallOption[] {
  const w=game.ronWindow, p=game.players[playerId];
  if (!w || !['awaiting-ron','awaiting-call'].includes(game.phase) || game.winResult ||
      game.turnPlayerId!==w.discarderId || !game.liveWall.length || !p || p.id!==playerId || p.riichi ||
      p.drawnTile || p.callDiscard || p.hand.length!==concealedSize(p) || playerId===w.discarderId) return [];
  const source=game.players[w.discarderId];
  if (!source || source.id!==w.discarderId || source.hand.length!==concealedSize(source) || source.drawnTile || source.drawnTileSource!==null || source.callDiscard || p.drawnTileSource!==null) return [];
  const called=source.river.at(-1);
  if(called?.id!==w.tileId) return [];
  const owned=[...p.hand,...(p.melds ?? []).flatMap(m=>m.tiles)];
  if(new Set([...owned,called].map(t=>t.id)).size!==owned.length+1) return [];
  const options:CallOption[]=[];
  const sorted=[...p.hand].sort((a,b)=>a.id.localeCompare(b.id));
  for(let a=0;a<sorted.length;a++) for(let b=a+1;b<sorted.length;b++) {
    const owned=[sorted[a],sorted[b]] as const;
    if(new Set([called.id,...owned.map(t=>t.id)]).size!==3) continue;
    let type:'pon'|'chi';
    if(owned.every(t=>tileKindKey(t.tile)===tileKindKey(called.tile))) type='pon';
    else {
      if(playerId!==(w.discarderId+1)%4 || called.tile.category!=='suited') continue;
      const face=called.tile;
      if(!owned.every(t=>t.tile.category==='suited' && t.tile.suit===face.suit)) continue;
      const ranks=[face.rank,...owned.map(t=>t.tile.category==='suited'?t.tile.rank:0)].sort((a,b)=>a-b);
      if(ranks[1]!==ranks[0]+1 || ranks[2]!==ranks[1]+1) continue;
      type='chi';
    }
    const forbiddenKinds=forbidden(type,called,owned);
    if(!p.hand.some(t=>!owned.includes(t) && !forbiddenKinds.includes(tileKindKey(t.tile)))) continue;
    const tiles=(type==='pon'?[owned[0],called,owned[1]]:[...owned,called].sort((a,b)=>
      (a.tile.category==='suited'?a.tile.rank:0)-(b.tile.category==='suited'?b.tile.rank:0))) as [PhysicalTile,PhysicalTile,PhysicalTile];
    options.push({type,tiles,calledTileId:called.id,fromPlayerId:w.discarderId,playerId,
      id:`${type}:${playerId}:${called.id}:${owned.map(t=>t.id).join(':')}`,
      handTileIds:[owned[0].id,owned[1].id],forbiddenKinds});
  }
  return options;
}
/** Own hand/melds and the public discard only; no wall/opponent hand access. */
export function chooseCpuCall(player: PlayerState, options: readonly CallOption[]): CallOption | null {
  if(!options.length || player.control!=='cpu' || player.riichi) return null;
  const before=calculateShanten(player.hand.map(t=>t.tile),player.melds?.length ?? 0).minimum;
  const evaluated=options.flatMap(option=>{
    const remaining=player.hand.filter(t=>!option.handTileIds.includes(t.id));
    const melds=[...(player.melds ?? []),option];
    const value=winningMelds(melds).some(m=>m.type==='triplet' && m.tile.category==='honor' &&
      (['white','green','red','east',player.wind].includes(m.tile.honor)));
    const all=[...remaining,...melds.flatMap(m=>m.tiles)];
    const tanyao=all.every(t=>t.tile.category==='suited' && t.tile.rank>=2 && t.tile.rank<=8);
    const toitoi=melds.every(m=>m.type==='pon') && new Set(remaining.map(t=>tileKindKey(t.tile))).size<=5;
    if(!value && !tanyao && !toitoi) return [];
    const best=Math.min(...remaining.filter(t=>!option.forbiddenKinds.includes(tileKindKey(t.tile))).map(t=>
      calculateShanten(remaining.filter(x=>x.id!==t.id).map(x=>x.tile),melds.length).minimum));
    return best<before || (value && best===before) ? [{option,best}] : [];
  });
  return evaluated.sort((a,b)=>a.best-b.best || a.option.id.localeCompare(b.option.id))[0]?.option ?? null;
}
export function compareCallPriority(game:GameState,a:CallOption,b:CallOption):number {
  const d=game.ronWindow!.discarderId;
  return Number(a.type==='chi')-Number(b.type==='chi') || (a.playerId-d+4)%4-(b.playerId-d+4)%4 || a.id.localeCompare(b.id);
}
function cpuOptions(game:GameState):CallOption[] {
  return game.players.flatMap(p=>{const c=chooseCpuCall(p,getCallOptions(game,p.id));return c?[c]:[];});
}
function apply(game:GameState,option:CallOption):GameState {
  const p=game.players[option.playerId],source=game.players[option.fromPlayerId];
  const players=[...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[source.id]={...source,discardHistory:source.discardHistory ?? source.river,
    river:source.river.filter(t=>t.id!==option.calledTileId)};
  const {type,tiles,calledTileId,fromPlayerId}=option;
  players[p.id]={...p,hand:p.hand.filter(t=>!option.handTileIds.includes(t.id)),
    melds:[...(p.melds ?? []),{type,tiles,calledTileId,fromPlayerId}],
    callDiscard:{forbiddenKinds:option.forbiddenKinds}};
  return cancelAllIppatsu({...game,players,callsMade:true,phase:'awaiting-discard',turnPlayerId:p.id,ronWindow:null});
}
function finish(game:GameState,selected:readonly CallOption[]):GameState {
  const winner=[...selected].sort((a,b)=>compareCallPriority(game,a,b))[0];
  return winner?apply(game,winner):{...game,phase:'awaiting-draw',turnPlayerId:((game.ronWindow!.discarderId+1)%4) as PlayerId,ronWindow:null};
}
/** Entry only after all ron decisions are resolved. */
export function resolveDiscardCalls(game:GameState):GameState {
  const pending={...game,phase:'awaiting-call' as const};
  const cpu=cpuOptions(pending);
  const human=pending.players.filter(p=>p.control==='human').flatMap(p=>getCallOptions(pending,p.id));
  // A lower-priority human choice cannot change an already selected CPU pon.
  if(human.some(h=>!cpu.length || compareCallPriority(pending,h,[...cpu].sort((a,b)=>compareCallPriority(pending,a,b))[0])<0)) return pending;
  return finish(pending,cpu);
}
export function declareCall(game:GameState,playerId:PlayerId,optionId:string):GameState {
  if(game.phase!=='awaiting-call' || game.players[playerId]?.control!=='human') throw new RangeError('No call decision');
  const option=getCallOptions(game,playerId).find(c=>c.id===optionId);
  if(!option) throw new RangeError('Invalid call option');
  return finish(game,[option,...cpuOptions(game)]);
}
export function passCalls(game:GameState,playerId:PlayerId):GameState {
  if(game.phase!=='awaiting-call' || game.players[playerId]?.control!=='human' || !getCallOptions(game,playerId).length) throw new RangeError('No call decision');
  return finish(game,cpuOptions(game));
}
