"""Call choices and Safari visual viewport regressions.

Run against npm run dev -- --host 127.0.0.1 --port 4173. Select chromium or
webkit with HEIBON_BROWSER. WebKit automation is not iPhone Safari hardware.
"""
import os
import shutil
from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture

browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
with sync_playwright() as p:
 browser_type = getattr(p, browser_name)
 launch = {'args': ['--no-sandbox', '--disable-crashpad', '--disable-crash-reporter']} if browser_name == 'chromium' else {}
 if browser_name == 'chromium': launch['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
 browser = browser_type.launch(**launch)
 for width in [320,375,390,430,844]:
  # Playwright's mobile WebKit context does not implement mouse-wheel input.
  # Keep the portrait CSS viewport and touch support, while using desktop input
  # plumbing for the manual wheel-scroll assertion in WebKit.
  page = browser.new_page(viewport={'width':width,'height':844}, has_touch=True, is_mobile=browser_name != 'webkit')
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import {callStart} from '/heibon-mahjong/tests/calls-fixture.ts';
import {ronGame} from '/heibon-mahjong/tests/ron-fixture.ts';
import {ankanGame} from '/heibon-mahjong/tests/kan-fixture.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {startMatch} from '/heibon-mahjong/src/game/match.ts';
"""+response.text()+"""
window.loadCalls=(mode)=>{controller.newGame();let g=callStart(3,
 mode==='one'?{0:['345m','234p','678s','19p','12z']}:
 mode==='two'?{0:['3456m','234p','678s','19p','1z']}:
 mode==='three'?{0:['3467m','234p','678s','19p','1z']}:
 mode==='mixed'?{0:['445567m','234p','19p','12z']}:
 mode==='red'?{0:['4450m','234p','678s','19p','1z']}:
 {0:['555m','234p','678s','19p','12z']},mode==='pon'?'red:man-5':mode==='red'?'man-6':'man-5');
window.callState=()=>controller.game;
controller.match=startMatch(discardTile(g,3,g.players[3].drawnTile.id));render();};
window.loadRon=()=>{controller.newGame();controller.match=startMatch(ronGame(3,[0]));render();};
window.loadKan=()=>{controller.newGame();controller.match=startMatch(ankanGame());render();};
"""
   source=fixed_seat_fixture(source)
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject)
  page.goto('http://127.0.0.1:4173/heibon-mahjong/')
  page.wait_for_function('typeof loadCalls === "function"')
  def visible():
   page.wait_for_function("!document.querySelector('#call-controls').hidden")
   assert page.evaluate('''()=>[...document.querySelectorAll('#call-options button,#pass-calls')].every(e=>{
    const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44&&e.isConnected;
   })''')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.evaluate('''()=>document.querySelector('#local-game-controls').getBoundingClientRect().top>=document.querySelector('.table').getBoundingClientRect().bottom''')
  def geometry():
   return page.evaluate('''()=>{const p=document.querySelector('#call-controls'),r=p.getBoundingClientRect(),v=visualViewport;return {
    scrollY,innerHeight,visualViewportHeight:v?.height??innerHeight,offsetTop:v?.offsetTop??0,
    panel:{top:r.top,bottom:r.bottom,height:r.height,width:r.width},
    buttons:[...p.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return {action:b.dataset.diagnosticActionType??b.id,top:q.top,bottom:q.bottom,height:q.height};})
   }}''')
  def load_call(height=844,mode='mixed',expected=3):
   page.set_viewport_size({'width':width,'height':height})
   page.evaluate("document.querySelector('#call-controls').hidden=true")
   page.wait_for_function("document.querySelector('#call-controls').hidden")
   page.evaluate('window.scrollTo(0,0)')
   before=geometry()
   page.evaluate(f'loadCalls("{mode}")')
   visible()
   page.wait_for_timeout(100)
   after=geometry()
   assert after['scrollY']==before['scrollY'],{'before':before,'after':after}
   assert page.locator('#call-options button').count()==expected
   print(f'{browser_name} {width}x{height} {mode} display metrics: before={before} after={after}')
   return before,after
  for height in [844,564,448]:
   load_call(height,'mixed',3)
   # A user scroll followed by Safari visual viewport changes must retain the
   # chosen position; resizing does not run another scroll correction.
   page.evaluate('''()=>{
    window.scrollTo(0,0);
    const v=visualViewport;
    v?.dispatchEvent(new Event('scroll'));
    v?.dispatchEvent(new Event('resize'));
   }''')
   page.wait_for_timeout(50)
   assert page.evaluate('scrollY')==0
   # Confirm that the controls remain in normal flow and can be reached by
   # ordinary user scrolling after viewport events.
   if height <= 564:
    page.mouse.wheel(0,1200)
    page.wait_for_function('scrollY>0')
    manual_y=page.evaluate('scrollY')
    page.wait_for_timeout(1100)
    assert page.evaluate('scrollY')==manual_y
    assert page.evaluate("""()=>{const r=document.querySelector('#pass-calls').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}""")
    page.evaluate('''()=>{window.nativeViewport=visualViewport;window.testViewport=new EventTarget();Object.assign(testViewport,{height:Math.max(300,innerHeight-80),offsetTop:20});Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>testViewport});testViewport.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('resize'));testViewport.dispatchEvent(new Event('scroll'));}''')
    page.wait_for_timeout(50)
    assert page.evaluate('scrollY')==manual_y
    page.evaluate('Object.defineProperty(window,"visualViewport",{configurable:true,get:()=>nativeViewport})')
    entries=page.evaluate("JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2')||'[]')")
    assert any(e['event']=='call_viewport_user_scroll' and e['details'].get('source')=='user' for e in entries),entries[-20:]
   assert page.locator('#pass-calls').is_enabled()

  if width==375:
   # Candidate growth is measured with the page at the top and again after a
   # real wheel gesture. Skip/pass remains in the normal page flow.
   for mode,count in [('one',1),('two',2),('three',3),('mixed',3)]:
    before,after=load_call(448,mode,count)
    chi_count=page.locator('#call-options button').filter(has_text='チー').count()
    pon_count=page.locator('#call-options button').filter(has_text='ポン').count()
    assert chi_count==({'one':1,'two':2,'three':3,'mixed':2}[mode]) and pon_count==({'mixed':1}.get(mode,0))
    page.mouse.wheel(0,1200)
    page.wait_for_function('scrollY>0')
    manual_y=page.evaluate('scrollY')
    page.wait_for_timeout(1100)
    assert page.evaluate('scrollY')==manual_y
    metrics=geometry()
    entries=page.evaluate("JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2')||'[]')")
    assert any(e['event']=='call_viewport_user_scroll' and e['details'].get('source')=='user' for e in entries),entries[-20:]
    assert metrics['scrollY']==manual_y
    page.locator('#pass-calls').click()
    page.wait_for_function('callState().phase!=="awaiting-call"')
    assert page.evaluate('callState().phase')!='awaiting-call'
    print(f'{browser_name} 375x448 {mode} manual-scroll metrics: {metrics}; pass advanced match')
    if mode=='three':
     for chi_index in range(3):
      load_call(448,'three',3)
      page.mouse.wheel(0,1200)
      page.wait_for_function('scrollY>0')
      choice=page.locator('#call-options button').filter(has_text='チー').nth(chi_index)
      assert choice.is_enabled()
      choice.click()
      page.wait_for_function('callState().players[0].melds?.length===1')
      assert page.evaluate('callState().players[0].melds[0].type')=='chi'
      assert page.evaluate('callState().phase')=='awaiting-discard'

   for chi_index in [0,1]:
    load_call(844,'mixed',3)
    page.locator('#call-options button').filter(has_text='チー').nth(chi_index).click()
    page.wait_for_function('callState().players[0].melds?.length===1')
    assert page.evaluate('callState().players[0].melds[0].type')=='chi'
    assert page.evaluate('callState().phase')=='awaiting-discard'
    if chi_index==0:
     page.wait_for_timeout(250)
     trace=page.evaluate('''()=>{
      const entries=JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2')||'[]');
      const click=[...entries].reverse().find(e=>e.event==='action_panel_click_received'&&e.details.actionType==='chi');
      const success=entries.find(e=>e.event==='local_action_state_update_succeeded'&&e.details.operationId===click?.details.operationId);
      const rendered=entries.find(e=>e.event==='local_game_render_succeeded'&&e.details.operationId===click?.details.operationId);
      return {click,success,rendered,serialized:JSON.stringify(entries)};
     }''')
     assert trace['click'] and trace['success'] and trace['rendered'],trace
     assert trace['click']['details']['candidateId'].startswith('call-')
     assert 'man-' not in trace['serialized'] and 'sou-' not in trace['serialized']
   load_call(844,'mixed',3)
   page.locator('#call-options button').filter(has_text='ポン').click()
   page.wait_for_function('callState().players[0].melds?.length===1')
   assert page.evaluate('callState().players[0].melds[0].type')=='pon'
   assert page.evaluate('callState().phase')=='awaiting-discard'
   load_call(844,'mixed',3)
   page.locator('#pass-calls').click()
   page.wait_for_function('callState().phase!=="awaiting-call"')
   assert page.evaluate('callState().players[0].melds?.length??0')==0
   assert page.evaluate('callState().phase')!='awaiting-call'

   page.evaluate('window.scrollTo(0,0);loadRon()')
   page.wait_for_function("!document.querySelector('#ron-controls').hidden")
   assert page.locator('#ron').is_enabled() and page.locator('#pass-ron').is_enabled()
   page.evaluate('''()=>{
     window.scrollTo(0,0);visualViewport?.dispatchEvent(new Event('scroll'));visualViewport?.dispatchEvent(new Event('resize'));
   }''')
   assert page.evaluate('scrollY')==0
   page.locator('#pass-ron').click()
   page.wait_for_function("callState().phase==='awaiting-call'")

   page.evaluate('window.scrollTo(0,0);loadKan()')
   page.wait_for_function("!document.querySelector('#kan').hidden")
   page.locator('#kan').click()
   page.wait_for_function("!document.querySelector('#kan-controls').hidden")
   assert page.locator('#kan-options button').count()==1
   page.evaluate('''()=>{
     window.scrollTo(0,0);visualViewport?.dispatchEvent(new Event('scroll'));visualViewport?.dispatchEvent(new Event('resize'));
   }''')
   assert page.evaluate('scrollY')==0
   page.locator('#cancel-kan').click()
   assert page.locator('#kan-controls').is_hidden()

   # A touch gesture already in progress must not reposition the page.
   page.set_viewport_size({'width':width,'height':448})
   page.evaluate('''()=>{
     const event=(name,touches)=>{const e=new Event(name);Object.defineProperty(e,'touches',{value:touches});window.dispatchEvent(e);};
     event('touchstart',[{clientX:10,clientY:200}]);
     loadCalls('mixed');
     event('touchmove',[{clientX:10,clientY:130}]);
     event('touchend',[]);
   }''')
   page.wait_for_timeout(250)
   assert page.evaluate('''()=>{
     const entries=JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2')||'[]');
     return entries.some(e=>e.event==='call_viewport_panel_displayed'&&e.details.source==='initial_display_no_page_scroll');
   }''')
   assert page.locator('#call-options button').count()==3
   # Simulate address bar expansion/collapse while the viewport origin remains
   # unchanged. The panel remains scrollable and resize never forces a return.
   page.evaluate('''()=>{
     window.scrollTo(0,0);
     window.nativeViewport=visualViewport;
     window.testViewport=new EventTarget();Object.assign(testViewport,{height:404,offsetTop:24});
     Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>testViewport});
     for(const [height,offset] of [[404,24],[700,0],[484,24]]){
       Object.assign(testViewport,{height,offsetTop:offset});
       testViewport.dispatchEvent(new Event('resize'));
       window.dispatchEvent(new Event('resize'));
       testViewport.dispatchEvent(new Event('scroll'));
     }
   }''')
   page.wait_for_timeout(50)
   assert page.evaluate('scrollY')==0
   page.evaluate("document.querySelector('#call-controls').hidden=true")
   page.wait_for_function("document.querySelector('#call-controls').hidden")
   page.evaluate("Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>nativeViewport});window.scrollTo(0,0);loadCalls('mixed')")
   visible()
   assert page.evaluate('scrollY')==0
  assert not errors,errors
  page.close()
  print(f'{browser_name} {width}px: candidate choices, manual scroll, viewport changes, gameplay, ron, and kan passed')
 browser.close()
