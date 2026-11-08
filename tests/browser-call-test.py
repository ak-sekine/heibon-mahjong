"""Exercise the public pon/kan fixture page using the real local controls."""
import os
from playwright.sync_api import sync_playwright

ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
BASE_URL = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
VIEWPORTS = [(1280, 720), (1366, 768), (1440, 900), (1660, 825), (1920, 1080)]


def assert_integrity(page, expected_meld=None, expected_kan_count=None):
    state = page.evaluate('''()=>{
      const g=window.readGame(),m=window.testController.match;
      const tiles=[...g.liveWall,...g.deadWall,...g.players.flatMap(p=>[
        ...p.hand,...(p.drawnTile?[p.drawnTile]:[]),...p.river,...p.melds.flatMap(meld=>meld.tiles)
      ])];
      return {
        tileCount:tiles.length,uniqueTileCount:new Set(tiles.map(tile=>tile.id)).size,
        points:m.points.reduce((sum,value)=>sum+value,0)+m.depositSticks*1000,
        melds:g.players[0].melds.map(meld=>({type:meld.type,size:meld.tiles.length})),
        kanCount:g.kanCount??0,phase:g.phase,turn:g.turnPlayerId,
        drawSource:g.players[0].drawnTileSource,liveWall:g.liveWall.length,
        dora:document.querySelectorAll('#local-table .dora-slot[data-tile-id]').length,
        cpuRiver:g.players[3].river.length,
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth
      };
    }''')
    assert state['tileCount'] == 136 and state['uniqueTileCount'] == 136, f'136 physical tiles must remain unique: {state}'
    assert state['points'] == 100000, f'starting points changed: {state}'
    assert not state['horizontalOverflow'], f'page has horizontal overflow: {state}'
    if expected_meld is not None:
        assert state['melds'][-1] == expected_meld, f'incorrect public meld: {state}'
    if expected_kan_count is not None:
        assert state['kanCount'] == expected_kan_count, f'incorrect kan count: {state}'
    return state


def table_rect(page):
    return page.locator('#local-table').evaluate('''e=>{
      const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom};
    }''')


def assert_same_table(before, after, label):
    for key in ('left', 'top', 'width', 'height'):
        assert abs(before[key]-after[key]) < 1, f'{label}: table {key} changed: {before} -> {after}'


def assert_click_target(page, selector, label, *, below_table=False, in_initial_view=True):
    target = page.evaluate('''selector=>{
      const e=document.querySelector(selector);
      if(!e)return null;
      const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      const t=document.querySelector('#local-table').getBoundingClientRect();
      return {hidden:e.hidden||getComputedStyle(e).display==='none'||getComputedStyle(e).visibility==='hidden',
        x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
        tableBottom:t.bottom,panelTop:document.querySelector('#local-game-controls').getBoundingClientRect().top,
        scrollY,viewportHeight:innerHeight,
        receivesPointer:hit===e||e.contains(hit)};
    }''', selector)
    assert target is not None and not target['hidden'], f'{label}: button is not visible: {target}'
    assert target['width'] >= 44 and target['height'] >= 44, f'{label}: button is smaller than 44px: {target}'
    assert target['x'] >= -0.5 and target['right'] <= page.viewport_size['width'] + 0.5, f'{label}: button is outside the viewport horizontally: {target}'
    if in_initial_view:
        assert target['y'] >= -0.5 and target['bottom'] <= target['viewportHeight'] + 0.5, f'{label}: button is outside the initial viewport: {target}'
    else:
        assert target['y'] >= -0.5 and target['bottom'] <= target['viewportHeight'] + 0.5, f'{label}: button is outside the scrolled viewport: {target}'
    assert target['receivesPointer'], f'{label}: another element covers the button center: {target}'
    if below_table:
        assert 0 <= target['panelTop']-target['tableBottom'] <= 8.5, f'{label}: operation panel must be directly below the table: {target}'
    return target


def start_scenario(page, mode):
    settings = page.locator('#call-test-settings')
    if not settings.evaluate('e=>e.open'):
        page.locator('#toggle-call-test-settings').click()
    page.select_option('#scenario', mode)
    page.locator('#load-scenario').click()
    page.wait_for_function('''()=>!document.querySelector('#call-test-settings').open''')
    page.wait_for_selector('#local-game-controls')
    assert page.evaluate('document.scrollingElement.scrollTop') <= 1, f'{mode}: initial-view check started after scrolling'
    if mode in ('pon', 'daiminkan'):
        page.wait_for_function("()=>!document.querySelector('#call-controls').hidden")
    else:
        page.wait_for_function("()=>!document.querySelector('#kan').hidden")
    assert_integrity(page)


with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width, height in VIEWPORTS:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def expose_page_controller(route):
            response = route.fetch()
            route.fulfill(response=response, body=response.text() + '\nwindow.testController=controller;')

        page.route('**/src/verification/page.ts', expose_page_controller)
        page.goto(BASE_URL + 'call-test.html')
        page.wait_for_selector('#scenario-help:not(:empty)')
        assert page.title().startswith('ポン・カン実機検証')
        assert page.locator('meta[name="robots"]').get_attribute('content') == 'noindex, nofollow'
        assert page.locator('#scenario option').evaluate_all('nodes=>nodes.map(node=>node.value)') == ['pon', 'daiminkan', 'ankan', 'kakan']
        page.evaluate('window.readGame=()=>window.testController.game')

        for mode, call_selector, meld_type, meld_size, dora_count in [
            ('pon', '#call-pon', 'pon', 3, 1),
            ('daiminkan', '#call-kan', 'daiminkan', 4, 2),
        ]:
            start_scenario(page, mode)
            before = table_rect(page)
            assert_click_target(page, call_selector, f'{width}x{height} {mode} call', below_table=True)
            assert_click_target(page, '#pass-calls', f'{width}x{height} {mode} pass', below_table=True)

            # Passing keeps the game legal and lets ordinary turn progression resume.
            page.locator('#pass-calls').click()
            page.wait_for_function("()=>document.querySelector('#call-controls').hidden && window.readGame().ronWindow===null")
            passed = assert_integrity(page)
            assert passed['melds'] == [], f'{mode}: passing must not open a meld: {passed}'
            assert passed['phase'] in ('awaiting-draw', 'awaiting-discard') and passed['turn'] == 0, f'{mode}: passing must advance to the next ordinary turn: {passed}'
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} call decision hide')

            # The visible repeat control rebuilds exactly the same pending call window.
            page.locator('#repeat-scenario').click()
            page.wait_for_function("()=>!document.querySelector('#call-controls').hidden")
            repeated = assert_integrity(page)
            assert repeated['phase'] == 'awaiting-call' and repeated['turn'] == 3 and repeated['cpuRiver'] == 1, f'{mode}: repeat must restore the pending CPU discard: {repeated}'
            assert repeated['melds'] == [], f'{mode}: repeat must remove any previous call: {repeated}'
            before = table_rect(page)
            assert_click_target(page, call_selector, f'{width}x{height} {mode} call after repeat', below_table=True)
            page.locator(call_selector).click()
            page.wait_for_function('''type=>!window.testController.progressing && window.readGame().players[0].melds.some(m=>m.type===type)''', arg=meld_type)
            called = assert_integrity(page, {'type': meld_type, 'size': meld_size}, 1 if mode == 'daiminkan' else 0)
            assert called['cpuRiver'] == 0, f'{mode}: the called discard must leave the river: {called}'
            assert called['dora'] == dora_count, f'{mode}: dora indicators must match the kan state: {called}'
            if mode == 'pon':
                assert called['drawSource'] is None, f'pon must lead to a discard turn: {called}'
            else:
                assert called['drawSource'] == 'rinshan', f'daiminkan must draw from the dead wall: {called}'
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} call completion')

        for mode, meld_type in [('ankan', 'ankan'), ('kakan', 'kakan')]:
            start_scenario(page, mode)
            original = page.evaluate('''()=>{
              const g=readGame();return {kanCount:g.kanCount??0,liveWall:g.liveWall.length,
                hand:[...g.players[0].hand.map(t=>t.id),...(g.players[0].drawnTile?[g.players[0].drawnTile.id]:[])].sort(),
                melds:g.players[0].melds.map(m=>({type:m.type,ids:m.tiles.map(t=>t.id).sort()}))};
            }''')
            before = table_rect(page)
            assert_click_target(page, '#kan', f'{width}x{height} {mode} kan toggle', below_table=True)
            page.locator('#kan').click()
            page.wait_for_function("()=>!document.querySelector('#kan-controls').hidden && document.querySelectorAll('#kan-options button').length>0")
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} candidates open')
            page.locator('#cancel-kan').scroll_into_view_if_needed()
            assert_click_target(page, '#cancel-kan', f'{width}x{height} {mode} cancel', below_table=False, in_initial_view=False)
            page.locator('#cancel-kan').click()
            page.wait_for_function("()=>document.querySelector('#kan-controls').hidden")
            page.evaluate('()=>{document.documentElement.style.scrollBehavior="auto";window.scrollTo(0,0)}')
            page.wait_for_function('window.scrollY===0')
            after_cancel = page.evaluate('''()=>{
              const g=readGame();return {kanCount:g.kanCount??0,liveWall:g.liveWall.length,
                hand:[...g.players[0].hand.map(t=>t.id),...(g.players[0].drawnTile?[g.players[0].drawnTile.id]:[])].sort(),
                melds:g.players[0].melds.map(m=>({type:m.type,ids:m.tiles.map(t=>t.id).sort()}))};
            }''')
            assert after_cancel == original, f'{mode}: cancellation changed the game: {original} -> {after_cancel}'
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} candidate cancel')

            page.locator('#kan').click()
            page.wait_for_function("()=>!document.querySelector('#kan-controls').hidden")
            assert page.locator('#kan-options button').count() >= 1
            page.locator('#kan-options button').first.scroll_into_view_if_needed()
            assert_click_target(page, '#kan-options button', f'{width}x{height} {mode} candidate', below_table=False, in_initial_view=False)
            page.locator('#kan-options button').first.click()
            page.wait_for_function('''()=>!window.testController.progressing && window.readGame().kanCount===1''')
            completed = assert_integrity(page, {'type': meld_type, 'size': 4}, 1)
            assert completed['drawSource'] == 'rinshan', f'{mode}: a confirmed kan must take a rinshan tile: {completed}'
            assert completed['dora'] == 2, f'{mode}: a confirmed kan must expose one additional dora indicator: {completed}'
            page.evaluate('()=>{document.documentElement.style.scrollBehavior="auto";window.scrollTo(0,0)}')
            page.wait_for_function('window.scrollY===0')
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} confirmation')

            page.locator('#repeat-scenario').click()
            page.wait_for_function("()=>!window.testController.progressing && window.readGame().kanCount===0 && !document.querySelector('#kan').hidden")
            repeated = assert_integrity(page, {'type': 'pon', 'size': 3} if mode == 'kakan' else None, 0)
            assert repeated['melds'] == original['melds'], f'{mode}: repeat must restore the initial melds: {repeated}'
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} repeat')

        assert page.evaluate('document.scrollingElement.scrollTop') <= 1, f'{width}x{height}: PC verification required a scroll before action checks'
        assert not errors, f'{width}x{height}: page errors: {errors}'
        print(f'{ENGINE} {width}x{height}: pon, daiminkan, ankan, kakan passed', flush=True)
        page.close()

    # A short PC window can scroll to and operate the same game control panel.
    page = browser.new_page(viewport={'width': 1280, 'height': 550})
    page.route('**/src/verification/page.ts', expose_page_controller)
    page.goto(BASE_URL + 'call-test.html')
    page.wait_for_selector('#scenario-help:not(:empty)')
    page.evaluate('window.readGame=()=>window.testController.game')
    start_scenario(page, 'ankan')
    assert page.evaluate('document.documentElement.scrollHeight>innerHeight'), 'short window should allow page scrolling'
    page.locator('#kan').scroll_into_view_if_needed()
    scrolled = assert_click_target(page, '#kan', '1280x550 ankan toggle after scrolling', below_table=False, in_initial_view=False)
    assert scrolled['scrollY'] > 0, 'short window should scroll before the control is operated'
    page.locator('#kan').click()
    page.locator('#cancel-kan').scroll_into_view_if_needed()
    assert_click_target(page, '#cancel-kan', '1280x550 cancel after scrolling', below_table=False, in_initial_view=False)
    page.locator('#cancel-kan').click()
    page.wait_for_function("()=>document.querySelector('#kan-controls').hidden")
    assert_integrity(page)
    print(f'{ENGINE} 1280x550: scrollable kan controls passed', flush=True)
    page.close()
    browser.close()
