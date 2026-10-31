from playwright.sync_api import sync_playwright
import os,shutil,pathlib
out=pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS','/tmp/heibon-table-ui'))/'kan-actions';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'),args=['--no-sandbox'])
 for width in [320,390]:
  page=b.new_page(viewport={'width':width,'height':844})
  def expose_page_controller(route):
   response=route.fetch();route.fulfill(response=response,body=response.text()+"\nwindow.testController = controller;\n")
  page.route('**/src/verification/page.ts',expose_page_controller)
  page.goto('http://localhost:4173/heibon-mahjong/kan-test.html')
  page.wait_for_selector('#scenario-help:not(:empty)')
  page.evaluate('window.readGame=()=>window.testController.game')
  page.select_option('#scenario','opening');page.locator('#load-scenario').click()
  assert page.evaluate("readGame().players[0].drawnTileSource")=='deal'
  assert page.locator('#kan').is_visible() and page.locator('#discard').is_visible()
  page.locator('#kan').click()
  assert page.locator('#kan-options button').count()==2
  page.locator('#cancel-kan').click()
  page.locator('#player-hand .drawn-tile .tile-choice').click()
  page.locator('#discard').click()
  page.wait_for_function("readGame().players[0].river.length===1")
  assert page.evaluate('readGame().kanCount')==0
  page.select_option('#scenario','opening');page.locator('#load-scenario').click()
  page.locator('#kan').click();page.locator('#kan-options button').nth(1).click()
  page.wait_for_function("readGame().kanCount===1 && readGame().players[0].drawnTileSource==='rinshan'")
  assert page.locator('.open-meld[data-meld-type="ankan"]').count()==1
  assert page.locator('.dora-slot[data-tile-id]').count()==2
  assert page.evaluate("readGame().players[0].hand.length===10")
  page.screenshot(path=str(out/f'{width}-opening-ankan.png'),full_page=True)
  for mode in ['ankan','daiminkan','kakan','rinshan','multiple']:
   page.select_option('#scenario',mode);page.locator('#load-scenario').click()
   if mode=='daiminkan':page.locator('#call-options button').filter(has_text='大明カン').click()
   else:page.locator('#kan').click();page.locator('#kan-options button').first.click()
   page.wait_for_timeout(200)
   assert page.locator('.dora-slot[data-tile-id]').count()==2
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('.table').evaluate('e=>Math.abs(e.clientWidth-e.clientHeight)<1')
   page.screenshot(path=str(out/f'{width}-{mode}.png'),full_page=True)
   if mode=='kakan':
    geometry=page.evaluate('''()=>{
      const called=document.querySelector('.open-meld[data-meld-type="kakan"] .called-tile svg').getBoundingClientRect();
      const added=document.querySelector('.open-meld[data-meld-type="kakan"] .added-kan-tile svg').getBoundingClientRect();
      const meld=document.querySelector('.open-meld[data-meld-type="kakan"]');
      const group=meld.getBoundingClientRect();
      const overlapX=Math.max(0,Math.min(called.right,added.right)-Math.max(called.left,added.left));
      const overlapY=Math.max(0,Math.min(called.bottom,added.bottom)-Math.max(called.top,added.top));
      const gap=called.top-added.bottom;
      const inside=r=>r.left>=group.left-.1&&r.top>=group.top-.1&&r.right<=group.right+.1&&r.bottom<=group.bottom+.1;
      const reference=[...meld.querySelectorAll('svg')].find(tile=>!tile.closest('.called-tile,.added-kan-tile')).getBoundingClientRect();
      return {gap,overlapArea:overlapX*overlapY,called,added,contained:inside(called)&&inside(added),
        sameSize:Math.abs(called.width-added.width)<.15&&Math.abs(called.height-added.height)<.15,
        riverSize:Math.abs(called.width-reference.height)<.15&&Math.abs(called.height-reference.width)<.15&&
          Math.abs(added.width-reference.height)<.15&&Math.abs(added.height-reference.width)<.15};
    }''')
    assert geometry['overlapArea']==0 and 0<=geometry['gap']<=1.05,geometry
    assert geometry['contained'] and geometry['sameSize'] and geometry['riverSize'],geometry
    assert page.locator('#tsumo').is_enabled()
    page.locator('#tsumo').click()
    page.wait_for_function("!document.querySelector('#win-result').hidden")
    page.locator('#show-result').click()
    page.wait_for_selector('#win-result:visible')
    assert '嶺上開花 1翻' in page.locator('#win-result').inner_text()
    page.locator('#view-table').click()
    page.select_option('#scenario','kakan');page.locator('#load-scenario').click()
    page.locator('#kan').click();page.locator('#kan-options button').first.click()
    page.wait_for_timeout(200)
    assert page.locator('.dora-slot[data-tile-id]').count()==2
    page.locator('#player-hand .drawn-tile .tile-choice').click()
    page.locator('#discard').click()
    page.wait_for_function('document.querySelectorAll(".river[data-player-id=\\"0\\"] .river-tile").length===1')
 print('10 actual kan-action layouts passed')
 b.close()
