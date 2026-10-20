"""UI-only geometry fixtures; game rules are exercised by the existing suites."""
import pathlib, shutil, json, os
from playwright.sync_api import sync_playwright
out=pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS','docs/verification/step13.5.2/screenshots'))/'layout';out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,547),(375,667),(390,844),(414,896),(430,844),(1280,800)]:
  page=browser.new_page(viewport={'width':width,'height':height})
  def expose_page_controller(route):
   response=route.fetch();route.fulfill(response=response,body=response.text()+"\nwindow.testController = controller;\n")
  page.route('**/src/main.ts*',expose_page_controller)
  page.goto('http://127.0.0.1:4173/heibon-mahjong/')
  page.wait_for_selector('#player-hand button')
  page.wait_for_function('window.testController !== undefined')
  page.evaluate("""async()=>{
   window.tableRenderer=await import('/heibon-mahjong/src/rendering/table.ts');
   window.meldRenderer=await import('/heibon-mahjong/src/rendering/melds.ts');
   window.scenarios=await import('/heibon-mahjong/src/verification/scenarios.ts');} """)
  def check():
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('#player-hand li').evaluate_all('els=>new Set(els.map(e=>Math.round(e.getBoundingClientRect().top))).size===1')
  check()
  assert page.evaluate('''()=>{const g=testController.game;return g.players.slice(1).every(p=>{
    const hand=document.querySelector(`.concealed-hand[data-player-id="${p.id}"]`);
    return hand.children.length===p.hand.length+Number(!!p.drawnTile)&&[...hand.children].every(e=>!e.children.length&&!e.dataset.tileId)&&!hand.innerHTML.includes('svg');})}''')
  assert page.evaluate('''()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();const t=rect('.seat-top'),r=rect('.seat-right'),l=rect('.seat-left'),b=rect('.seat-bottom'),c=rect('#local-table .center-info');return t.bottom<=c.top&&b.top>=c.bottom&&r.left>=c.right&&l.right<=c.left;}''')
  page.screenshot(path=str(out/f'{width}x{height}-empty.png'),full_page=True)
  before=page.locator('#player-hand').bounding_box()
  page.evaluate('''()=>{const g=testController.game,pool=[...g.liveWall,...g.deadWall];tableRenderer.renderTable({...g,players:g.players.map((p,i)=>({...p,river:pool.slice(i*18,i*18+18)}))},testController.match.points)}''')
  check()
  assert page.locator('.river-tile').count()==72
  assert abs(page.locator('#player-hand').bounding_box()['y']-before['y'])<1
  assert page.locator('.river').evaluate_all('els=>els.every(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1)')
  page.screenshot(path=str(out/f'{width}x{height}-rivers18.png'),full_page=True)
  # Render up to four public melds per seat, without introducing UI-only game state.
  page.evaluate('''()=>{const g=scenarios.scenarioGame('chankan'),meld=g.players[1].melds[0];
    const players=g.players.map((p,id)=>({...p,hand:p.hand.slice(0,1),drawnTile:null,
      melds:Array.from({length:4},()=>({...meld,fromPlayerId:(id+3)%4}))}));
    tableRenderer.renderTable({...g,players},testController.match.points);}''')
  check()
  assert page.locator('.seat .open-meld').count()==16
  assert page.locator('.seat .open-meld').evaluate_all('els=>els.every(e=>{let r=e.getBoundingClientRect(),s=e.closest(".seat").getBoundingClientRect();return r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1})')
  assert page.evaluate('''()=>[...document.querySelectorAll('.seat-left .open-meld,.seat-right .open-meld')].every(e=>{const a=e.getBoundingClientRect(),b=e.closest('.seat').querySelector('.concealed-hand').getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom})''')
  page.screenshot(path=str(out/f'{width}x{height}-four-melds-each.png'),full_page=True)
  reports.append({'width':width,'height':height,'passed':True})
  page.close()
 browser.close()
print(json.dumps(reports))
