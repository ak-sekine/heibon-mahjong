"""Step 13.1.1 deposit lifecycle and Step 13.1 Chromium regression. Test injection never ships in the app."""
import json,pathlib,shutil
from playwright.sync_api import sync_playwright
out=pathlib.Path('docs/screenshots/step13.1.1/lifecycle');out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800),(375,547),(390,724)]:
  page=browser.new_page(viewport={'width':width,'height':height});page.set_default_timeout(120000);errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import { riichiStart } from '/quill-mahjong/tests/riichi-fixture.ts';
import { startMatch, updateMatchGame } from '/quill-mahjong/src/game/match.ts';
import { discardTile } from '/quill-mahjong/src/game/discard.ts';
import { drawTile } from '/quill-mahjong/src/game/draw.ts';
"""+response.text()+"""
window.riichiCheck = () => controller.match;
window.riichiRestore = (match) => {controller.newGame();controller.match=match;render();};
window.riichiFixture = (mode) => { controller.newGame(); controller.match=startMatch(riichiStart(mode)); render(); };
window.riichiDraw = () => { if(controller.game.phase==='awaiting-draw') controller.game=drawTile(controller.game,controller.game.turnPlayerId);render(); };
window.riichiDiscard = () => {controller.game=discardTile(controller.game,controller.game.turnPlayerId,controller.game.players[controller.game.turnPlayerId].drawnTile.id);render();};
"""
   # Hold the CPU loop until reset; test controls advance the same pure APIs.
   source=source.replace('new GameController(void 0, { onChange: render })', 'new GameController(undefined, { onChange: render, wait: (_ms, signal) => new Promise(resolve => signal.addEventListener("abort", resolve, {once:true})) })')
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject);page.goto('http://127.0.0.1:5173/quill-mahjong/',wait_until='domcontentloaded');page.wait_for_function('typeof riichiCheck === "function"')
  def conservation():
   assert page.evaluate("[...document.querySelector('#deposit-sticks').children].reduce((s,e)=>s+Number(e.dataset.points),0)")==page.evaluate("riichiCheck().depositSticks*1000")
   assert page.evaluate('riichiCheck().points.reduce((a,b)=>a+b,0)+riichiCheck().depositSticks*1000')==100000
  def shot(name): page.screenshot(path=str(out/f'{width}x{height}-{name}.png'))
  def geometry():
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
   boxes=page.locator('#player-hand li').evaluate_all('els=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
   assert len(set(round(b['y'],1) for b in boxes))==1
   assert all(b['x']>=0 and b['x']+b['w']<=width for b in boxes)
   controls=page.locator('.discard-controls').bounding_box()
   assert all(b['y']+b['h']<=controls['y'] for b in boxes),(width,height,boxes[-1],controls)
   assert page.locator('.dora-slot').count()==5
   assert page.locator('#dora-indicators').evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==3
   for selector in ['#discard','#tsumo','#riichi']:
    if page.locator(selector).is_visible():
     box=page.locator(selector).bounding_box();assert box['height']>=44 and box['y']+box['height']<=height and box['width']>=44,(selector,box)
   html=page.locator('main').inner_html()
   for player in page.evaluate('riichiCheck().game.players.slice(1)'):
    if page.evaluate('riichiCheck().game.phase')!='won':
     for tile in player['hand']: assert tile['id'] not in html
  def select_draw():
   tile_id=page.evaluate('riichiCheck().game.players[0].drawnTile.id');page.locator(f'#player-hand button[data-tile-id="{tile_id}"]').click()
  page.evaluate("riichiFixture('ron')");geometry()
  tile_id=page.evaluate('riichiCheck().game.players[0].hand.find(t=>t.tile.suit==="man" && t.tile.rank===1).id')
  page.locator(f'#player-hand button[data-tile-id="{tile_id}"]').click();assert page.locator('#riichi').is_disabled()
  select_draw();assert page.locator('#riichi').is_enabled();geometry();shot('before')
  page.locator('#discard').click();assert page.evaluate('riichiCheck().depositSticks')==0;assert page.evaluate('riichiCheck().game.players[0].riichi') is None;conservation()
  page.evaluate("riichiFixture('tsumo')");select_draw();page.locator('#riichi').click();assert page.evaluate('riichiCheck().depositSticks')==1
  assert page.evaluate('riichiCheck().points[0]')==24000;assert 'リーチ' in page.locator('#label-0').inner_text();assert page.locator('#riichi').is_hidden();conservation();geometry();shot('established')
  assert page.locator('#player-hand button:enabled').count()==0
  # Stop the scheduler by resetting its generation while retaining the test match.
  page.evaluate('window.savedRiichi=riichiCheck()')
  page.evaluate('riichiRestore(savedRiichi)')
  for _ in range(3):page.evaluate('riichiDraw();riichiDiscard()')
  page.evaluate('riichiDraw()');geometry();shot('next-draw')
  assert page.locator('#player-hand button:enabled').count()==1
  assert page.locator('#discard').inner_text()=='ツモ切り';assert page.locator('#discard').is_enabled();assert page.locator('#tsumo').is_enabled()
  draw=page.evaluate('riichiCheck().game.players[0].drawnTile.id');page.locator('#discard').click()
  assert page.evaluate('riichiCheck().game.players[0].river.at(-1).id')==draw;conservation();geometry();shot('tsumogiri')
  # Repeat to choose tsumo instead of tsumogiri.
  page.evaluate('riichiRestore(savedRiichi)')
  for _ in range(3):page.evaluate('riichiDraw();riichiDiscard()')
  page.evaluate('riichiDraw()');page.locator('#tsumo').click()
  assert page.locator('#result-dialog').is_visible();assert '立直 1翻' in page.locator('#win-result').inner_text();assert '門前清自摸和 1翻' in page.locator('#win-result').inner_text()
  assert page.evaluate('riichiCheck().lastSettlement.deposits.points')==1000;conservation();shot('tsumo-result')
  page.locator('#view-table').click();assert page.locator('#result-dialog').is_hidden();page.locator('#show-result').click();assert page.locator('#result-dialog').is_visible()
  page.locator('#next-round').click();assert page.evaluate('riichiCheck().game.players.every(p=>p.riichi===null)');conservation()
  page.evaluate("riichiFixture('ron')");select_draw();page.locator('#riichi').click();page.evaluate('window.savedRiichi=riichiCheck();riichiRestore(savedRiichi);riichiDiscard()')
  assert page.locator('#ron').is_enabled();assert page.locator('#riichi').is_hidden();page.locator('#ron').click()
  assert page.locator('#result-dialog').is_visible();text=page.locator('#win-result').inner_text();assert '立直 1翻' in text;assert '役合計：1翻' in text
  assert page.evaluate('riichiCheck().lastSettlement.deposits.points')==1000;conservation();shot('ron-result')
  page.evaluate("riichiFixture('declared-ron')");select_draw();page.locator('#riichi').click()
  assert page.locator('#result-dialog').is_visible();assert page.evaluate('riichiCheck().depositSticks')==0;assert page.evaluate('riichiCheck().game.players[0].riichi') is None
  assert page.evaluate('riichiCheck().lastSettlement.before[0]')==25000;assert '立直' not in page.locator('#win-result').inner_text();conservation();shot('declaration-ron')
  page.locator('#view-table').click();page.locator('#new-game').click();page.locator('#confirm-new-game').click()
  assert page.evaluate('riichiCheck().points')==[25000]*4;assert page.evaluate('riichiCheck().depositSticks')==0;assert page.evaluate('riichiCheck().game.players.every(p=>p.riichi===null)');geometry();conservation()
  assert not errors,errors
  reports.append({'width':width,'height':height,'result':'passed','checks':['eligible-ineligible','normal-discard','deposit','riichi-label','concealed-disabled','physical-tsumogiri','riichi-tsumo','riichi-only-ron','declaration-ron-no-deposit','deposit-settlement','modal','table-result-toggle','next-round-clear','confirmed-reset','conservation','one-row-hand','no-horizontal-scroll','dora-3+2','touch-44','cpu-hidden']})
  print(f'{width}x{height}: passed',flush=True)
  page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2));print(json.dumps(reports,ensure_ascii=False))
