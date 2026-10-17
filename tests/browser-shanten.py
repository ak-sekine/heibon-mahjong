"""Test-only route injection; normal seeded deal, real 300ms waits, no production hooks."""
import json,pathlib,shutil,time
from playwright.sync_api import sync_playwright
out=pathlib.Path('docs/screenshots/step13.2.1');out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800),(375,547),(390,724)]:
  page=browser.new_page(viewport={'width':width,'height':height});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import { startGame } from '/heibon-mahjong/src/game/start.ts';
import { seeded } from '/heibon-mahjong/tests/helpers.ts';
import { calculateShanten } from '/heibon-mahjong/src/analysis/shanten.ts';
"""+response.text().replace('new GameController(void 0, { onChange: render })','new GameController(() => startGame(seeded(0)), { onChange: render })')+"""
window.stepCheck=()=>controller.match;
window.stepPlay=async()=>{if(controller.canRon){await controller.passRon();return;}const p=controller.game.players[0];controller.select(p.drawnTile.id);await controller.confirm();};
window.stepShanten=()=>controller.game.players.slice(1).map(p=>calculateShanten(p.hand.map(t=>t.tile)).minimum);
window.stepLongTasks=[];new PerformanceObserver(list=>stepLongTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
window.stepFrames=[];let last=performance.now();const frame=t=>{stepFrames.push(t-last);last=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
"""
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject);page.goto('http://127.0.0.1:4173/heibon-mahjong/');page.wait_for_function('typeof stepCheck === "function"')
  def geometry():
   page.locator('.discard-controls').scroll_into_view_if_needed()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   boxes=page.locator('#player-hand li').evaluate_all('es=>es.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}})')
   assert len(set(round(b['y'],1) for b in boxes))==1
   assert all(b['x']>=0 and b['x']+b['w']<=width+.1 for b in boxes)
   controls=page.locator('#discard,#riichi,#tsumo').evaluate_all('es=>es.map(e=>{let r=e.getBoundingClientRect(),s=getComputedStyle(e);return {w:r.width,h:r.height,y:r.y,bg:s.backgroundColor,disabled:e.disabled}})')
   assert max(c['w'] for c in controls)-min(c['w'] for c in controls)<.1
   assert all(c['h']==44 and c['y']+44<=height and c['bg']==('rgb(212, 229, 219)' if c['disabled'] else 'rgb(255, 218, 125)') for c in controls)
   g=page.evaluate('stepCheck().game');html=page.locator('main').inner_html()
   if not g['winResult']:
    for player in g['players'][1:]:
     for tile in player['hand']+([player['drawnTile']] if player['drawnTile'] else []):assert tile['id'] not in html
   assert page.evaluate('stepCheck().points.reduce((a,b)=>a+b,0)+stepCheck().depositSticks*1000')==100000
  initial=page.evaluate('stepShanten()');assert all(n>0 for n in initial);geometry()
  page.screenshot(path=str(out/f'{width}x{height}-initial.png'))
  records=[];times=[];captured=False;tsumogiri=False
  for turn in range(1,20):
   before=page.evaluate('stepCheck().game');t=time.monotonic();page.evaluate('stepPlay()');times.append((time.monotonic()-t)*1000)
   state=page.evaluate('stepCheck()');records.append({'turn':turn,'shanten':page.evaluate('stepShanten()'),'deposits':state['depositSticks'],'riichi':[bool(p['riichi']) for p in state['game']['players']]})
   if state['game']['phase']=='won':
    assert page.locator('#result-dialog').is_visible();page.screenshot(path=str(out/f'{width}x{height}-result.png'));break
   geometry()
   if turn==1:page.screenshot(path=str(out/f'{width}x{height}-normal-discard.png'))
   if state['game']['players'][1]['riichi'] and not captured:
    assert state['points'][1]==24000 and state['depositSticks']>=1
    declaration=page.locator('.river[data-player-id="1"] [data-riichi-declaration="true"] svg')
    assert declaration.count()==1 and declaration.evaluate('e=>getComputedStyle(e).transform')!='none'
    page.screenshot(path=str(out/f'{width}x{height}-natural-riichi.png'));captured=True
   if before['players'][1]['riichi']:
    after=state['game']['players'][1];assert after['hand']==before['players'][1]['hand'];tsumogiri=True
  assert captured and tsumogiri and not errors,(width,height,initial,records,captured,tsumogiri,errors)
  reports.append({'width':width,'height':height,'seed':0,'initialShanten':initial,'records':records,'humanToHumanMs':times,'frames':page.evaluate('({count:stepFrames.length,max:Math.max(...stepFrames),over50:stepFrames.filter(x=>x>50).length})'),'longTasksMs':page.evaluate('stepLongTasks'),'result':'passed'})
  print(f'{width}x{height}: passed',flush=True)
  if width==1280:
   bench=page.evaluate('''async()=>{
    const {startGame}=await import('/heibon-mahjong/src/game/start.ts');const {seeded}=await import('/heibon-mahjong/tests/helpers.ts');const {calculateShanten}=await import('/heibon-mahjong/src/analysis/shanten.ts');const {evaluateShantenDiscards}=await import('/heibon-mahjong/src/game/cpu.ts');
    const times=[],shanten=[],cache=[];for(let i=-20;i<120;i++){let g=startGame(seeded(i+20),1),p=g.players[1];let t=performance.now();calculateShanten(p.hand.map(t=>t.tile));let a=performance.now()-t;t=performance.now();evaluateShantenDiscards({tiles:[...p.hand,p.drawnTile],visibleTiles:[g.deadWall[4]]},n=>{if(i>=0)cache.push(n)});if(i>=0){times.push(performance.now()-t);shanten.push(a);}await new Promise(r=>setTimeout(r,0));}
    const stats=a=>({mean:a.reduce((x,y)=>x+y,0)/a.length,median:[...a].sort((x,y)=>x-y)[60],max:Math.max(...a)});return {hands:120,warmup:20,unit:'ms',shanten:stats(shanten),selection:stats(times),cacheEntries:stats(cache)};
   }''')
   (out/'chromium-benchmark.json').write_text(json.dumps(bench,indent=2))
  page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
