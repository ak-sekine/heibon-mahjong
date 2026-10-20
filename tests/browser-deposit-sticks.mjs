const { chromium } = await import(process.env.QUILL_PLAYWRIGHT ?? 'playwright');
import fs from 'node:fs';
const out='docs/screenshots/step13.1.1'; fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
for (const [width,height] of [[320,568],[375,667],[390,844],[414,896],[1280,800],[375,547],[390,724]]) {
 const page=await browser.newPage({viewport:{width,height}});
 page.setDefaultTimeout(120000);
 await page.goto('http://127.0.0.1:5173/heibon-mahjong/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#player-hand li');
 let base;
 for (const units of [0,1,5,6,10,17]) {
  await page.evaluate(async units=>{
   const {renderMatch}=await import('/heibon-mahjong/src/rendering/match.ts');
   const {renderTable}=await import('/heibon-mahjong/src/rendering/table.ts');
   const {startMatch}=await import('/heibon-mahjong/src/game/match.ts');
   const original=startMatch();
   const m={...original,points:[25000-units*1000,25000,25000,25000]};
   // Filled public rivers make overlap visible; no concealed tiles are exposed.
   const game={...m.game,players:m.game.players.map(p=>({...p,river:m.game.liveWall.slice(0,18)}))};
   window.depositFixture=game;renderTable(game,m.points);renderMatch({...m,game,depositSticks:units});
  },units);
  const check=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
   const area=document.querySelector('#deposit-sticks');
   const sticks=[...area.children].map(rect);
   const overlaps=(a,b)=>a.x<b.right-.1&&a.right>b.x+.1&&a.y<b.bottom-.1&&a.bottom>b.y+.1;
   const hazards=[...document.querySelectorAll('.river,.dora-slot,#wall-count')].map(rect);
   const hand=[...document.querySelectorAll('#player-hand li')].map(rect);
   const buttons=[...document.querySelectorAll('#discard,#riichi,#tsumo')].map(rect);
   return {scrollWidth:document.documentElement.scrollWidth,width:innerWidth,handCount:hand.length,handOneRow:hand.every(r=>Math.abs(r.y-hand[0].y)<1),handBottom:Math.max(...hand.map(r=>r.bottom)),handClearOfControls:hand.every(r=>r.bottom<=rect(document.querySelector('#local-game-controls')).y+.1),buttonsVisible:buttons.every(r=>r.x>=0&&r.right<=innerWidth+.1&&r.bottom<=innerHeight+.1),overlap:sticks.some((s,i)=>hazards.some(h=>overlaps(s,h))||sticks.slice(i+1).some(t=>overlaps(s,t))),stickCount:sticks.length,points:[...area.children].reduce((s,e)=>s+Number(e.dataset.points),0),table:rect(document.querySelector('.table')),center:rect(document.querySelector('.center-info')),hidden:area.hidden,doraSlots:document.querySelector('#dora-indicators').children.length,privateTilesExposed:[...window.depositFixture.players.slice(1).flatMap(p=>p.hand),...window.depositFixture.deadWall.filter((_,i)=>i!==4)].some(t=>document.querySelector('main').innerHTML.includes(t.id))};
  });
  if (!units) base=check;
  const result={width,height,expectedPoints:units*1000,...check,heightIncrease:check.table.h-base.table.h};
  results.push(result);
  await page.screenshot({path:`${out}/${width}x${height}-${units*1000}.png`,fullPage:true});
 }
 await page.close();
}
fs.writeFileSync(`${out}/chromium-results.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({size:`${r.width}x${r.height}`,points:r.points,overlap:r.overlap,buttons:r.buttonsVisible,row:r.handOneRow,scroll:r.scrollWidth>r.width,increase:r.heightIncrease})),null,2));
await browser.close();
if(results.some(r=>r.overlap||!r.buttonsVisible||!r.handOneRow||!r.handClearOfControls||r.handCount!==14||r.scrollWidth>r.width||r.points!==r.expectedPoints||r.privateTilesExposed||r.heightIncrease!==0||r.doraSlots!==5))process.exitCode=1;
