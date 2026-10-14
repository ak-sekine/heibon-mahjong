import { GameController } from '../src/ui/controller.ts';
import { startGame } from '../src/game/start.ts';
import { chooseRandomDiscard } from '../src/game/cpu.ts';
import { calculateShanten } from '../src/analysis/shanten.ts';
import { seeded } from './helpers.ts';
export async function simulate(seed:number, random=false) {
 const initial=startGame(seeded(seed));
 const initialShanten=initial.players.slice(1).map(p=>calculateShanten(p.hand.map(t=>t.tile)).minimum);
 const records: { seat:number; turn:number; shanten:number; riichi:boolean; deposits:number }[]=[];
 let turns=0;
 const ui=new GameController(()=>initial,{wait:async()=>{}, ...(random?{chooseDiscard:chooseRandomDiscard,random:seeded(seed+1000)}:{}),onChange:()=>{
   for(const p of ui.game.players.slice(1)) if(p.river.length && !p.drawnTile) {
     const key=p.id+':'+p.river.length;
     if(!seen.has(key)){seen.add(key);records.push({seat:p.id,turn:p.river.length,shanten:calculateShanten(p.hand.map(t=>t.tile)).minimum,riichi:!!p.riichi,deposits:ui.match.depositSticks});}
   }
 }});
 const seen=new Set<string>();
 while(ui.match.status==='playing' && turns++<80) {
   if(ui.canRon) {await ui.passRon();continue;}
   if(ui.game.turnPlayerId!==0 || !ui.game.players[0].drawnTile) break;
   ui.select(ui.game.players[0].drawnTile.id);await ui.confirm();
 }
 return {seed,random,initial,initialShanten,records,final:ui.match};
}
