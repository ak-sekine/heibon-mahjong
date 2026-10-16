import os
"""Real public-page controls; no routed source or synthetic win results."""
import shutil, pathlib
out=pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', 'docs/verification/step13.5.2/screenshots')) / 'browser-kan-page';out.mkdir(parents=True,exist_ok=True)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    for width, height in [(320,568),(375,547),(390,844),(430,844),(1280,800)]:
        page = browser.new_page(viewport={'width':width,'height':height}, has_touch=True)
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/') + 'kan-test.html')
        page.wait_for_selector('#scenario-help:not(:empty)')
        # Read state for assertions only. Every action uses the page's public UI.
        page.evaluate("async()=>{window.readGame=()=>window.testController.game;window.testController=(await import('/heibon-mahjong/src/main.ts')).controller;}")
        def check():
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.evaluate('''()=>{const g=readGame();const ts=[...g.liveWall,...g.deadWall,...g.players.flatMap(p=>[...p.hand,...p.river,...p.melds.flatMap(m=>m.tiles),...(p.drawnTile?[p.drawnTile]:[])])];return ts.length===136&&new Set(ts.map(t=>t.id)).size===136}''')
            snapshot=page.evaluate("()=>({g:readGame(),html:document.querySelector('main').innerHTML})")
            g=snapshot['g']
            if g['phase']!='won':
                html=snapshot['html']
                for player in g['players'][1:]:
                    for tile in player['hand']+([player['drawnTile']] if player['drawnTile'] else []): assert tile['id'] not in html
                for i,t in enumerate(g['deadWall']):
                    if i in [5,7,9,11,13] or i>4+2*g['kanCount']: assert t['id'] not in html
        def load(mode):
            page.select_option('#scenario',mode)
            page.locator('#load-scenario').tap()
            check()
        for mode in ['ankan','daiminkan','kakan','rinshan']:
            load(mode)
            if mode=='daiminkan': page.locator('#call-options button').filter(has_text='大明カン').tap()
            else:
                page.locator('#kan').tap()
                page.locator('#kan-options button').tap()
            page.wait_for_function('!testController.progressing')
            assert page.locator('.dora-slot[data-tile-id]').count()==2
            check()
            page.locator('#tsumo').tap()
            assert '嶺上開花 1翻' in page.locator('#win-result').inner_text()
            check()
            page.locator('#view-table').tap()
        load('chankan')
        page.locator('#start-cpu-kan').tap()
        check()
        assert page.locator('#ron-target svg').count()==1
        assert page.locator('.pending-kan-tile svg').count()==1
        group=page.locator('.open-meld[data-kan-pending]')
        assert group.get_attribute('data-meld-type')=='pon'
        assert group.locator('svg').count()==4
        assert page.locator('.pending-kan-tile').get_attribute('data-tile-id') is None
        assert page.locator('#ron').evaluate('e=>e===document.activeElement')
        page.wait_for_timeout(100)
        for sel in ['#ron','#pass-ron','#ron-target']:
            r=page.locator(sel).bounding_box()
            assert r['y']>=0 and r['y']+r['height']<=height
        page.screenshot(path=str(out/f'{width}-pending.png'),full_page=True)
        page.locator('#ron').tap()
        assert page.locator('.pending-kan-tile').count()==0
        assert page.evaluate("readGame().players[1].melds[0].type")=='pon'
        assert '槍槓 1翻' in page.locator('#win-result').inner_text()
        page.locator('#view-table').tap()
        load('chankan')
        page.locator('#start-cpu-kan').tap()
        page.evaluate("""()=>{window.nativeViewport=visualViewport;window.testViewport=new EventTarget();Object.assign(testViewport,{height:300,offsetTop:24});Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>testViewport});nativeViewport.dispatchEvent(new Event('resize'));}""")
        page.wait_for_function("""()=>[...document.querySelectorAll('#ron,#pass-ron,#ron-target')].every(e=>{let r=e.getBoundingClientRect();return r.top>=24&&r.bottom<=324})""")
        page.screenshot(path=str(out/f'{width}-viewport.png'),full_page=True)
        page.locator('#pass-ron').tap()
        assert page.locator('.pending-kan-tile').count()==0
        assert page.locator('#ron-target svg').count()==0
        page.evaluate("Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>nativeViewport})")
        page.screenshot(path=str(out/f'{width}-passed.png'),full_page=True)
        assert page.evaluate("readGame().players[1].melds[0].type")=='kakan'
        check()
        load('chankan')
        assert page.locator('.pending-kan-tile').count()==0
        page.locator('#start-cpu-kan').tap()
        page.locator('#load-scenario').tap()
        assert page.locator('.pending-kan-tile').count()==0
        assert page.locator('#ron-target svg').count()==0
        page.locator('#start-cpu-kan').tap()
        page.locator('#new-game').tap()
        page.locator('#confirm-new-game').tap()
        assert page.locator('.pending-kan-tile').count()==0
        assert page.locator('#ron-target svg').count()==0
        check()
        load('multiple')
        for i in range(2):
            page.locator('#kan').tap()
            page.locator('#kan-options button').first.tap()
            page.wait_for_function('!testController.progressing')
            check()
        assert page.locator('.dora-slot[data-tile-id]').count()==3
        tile=page.evaluate('readGame().players[0].drawnTile.id')
        page.locator(f'#player-hand button[data-tile-id="{tile}"]').tap()
        page.locator('#discard').tap()
        assert page.evaluate('readGame().players[0].drawnTile') is None
        load('ankan')
        page.set_viewport_size({'width':width,'height':max(380,height-120)})
        page.locator('#kan').tap()
        page.locator('#cancel-kan').tap()
        check()
        page.locator('.kan-lab a').tap()
        page.wait_for_url('**/heibon-mahjong/')
        assert page.locator('#scenario').count()==0
        assert not errors,errors
        print(f'{width}x{height}: public page passed',flush=True)
        page.close()
    browser.close()
