"""Inline call selection, responsive candidate grids and upward expansion regression."""
import os
import shutil

from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture
from browser_focus_assertions import assert_button_focus, tab_candidates, check_focus_detector

browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
with sync_playwright() as p:
    browser_type = getattr(p, browser_name)
    launch = {'args': ['--no-sandbox', '--disable-crashpad', '--disable-crash-reporter']} if browser_name == 'chromium' else {}
    if browser_name == 'chromium':
        launch['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
    browser = browser_type.launch(**launch)
    check_focus_detector(browser)
    page = browser.new_page(viewport={'width': 375, 'height': 634}, has_touch=True, is_mobile=browser_name != 'webkit')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def inject(route):
        response = route.fetch()
        source = """import {callStart} from '/heibon-mahjong/tests/calls-fixture.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {startMatch} from '/heibon-mahjong/src/game/match.ts';
""" + response.text() + """
window.loadCalls=(mode)=>{
 controller.newGame();
 const hands=mode==='one'?{0:['345m','234p','678s','19p','12z']}:
   mode==='pon-one'?{0:['155m','234p','678s','9p','123z']}:
   mode==='two'?{0:['3456m','234p','678s','19p','1z']}:
   mode==='three'?{0:['3467m','234p','678s','19p','1z']}:
   mode==='multi'?{0:['345m','5m','234p','678s','12z','9p']}:
   mode==='red'?{0:['4450m','234p','678s','19p','1z']}:
   mode==='pon-red'?{0:['550m','234p','678s','9p','123z']}:
   mode==='max'?{0:['23m','444m','50m','6m','789p','12z']}:
   {0:['445567m','234p','19p','12z']};
 const called=mode==='max'?'man-4':mode==='red'?'man-6':'man-5';
 const game=callStart(3,hands,called);
 controller.match=startMatch(discardTile(game,3,game.players[3].drawnTile.id));render();
};
window.callState=()=>controller.game;
window.loadTurn=()=>{
 controller.newGame();
 const game=callStart(3,{0:['55z','234m','456p','678s','11p']},'white');
 controller.match=startMatch(discardTile(game,3,game.players[3].drawnTile.id));render();
};
"""
        route.fulfill(response=response, body=fixed_seat_fixture(source))

    page.route('**/src/main.ts', inject)
    page.goto('http://127.0.0.1:4173/heibon-mahjong/')
    page.wait_for_function('typeof loadCalls === "function"')

    for width, height in [(320, 568), (375, 634), (390, 844), (430, 932), (768, 1024),
                          (1024, 768), (1280, 720), (1366, 768), (1440, 900),
                          (1660, 825), (1920, 1080)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('window.scrollTo(0,0)')
        page.evaluate('loadTurn()')
        page.wait_for_function("document.querySelector('#ron-controls').hidden === false")
        normal_action_position = page.evaluate("()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON()})")
        page.evaluate("loadCalls('max')")
        page.wait_for_function("document.querySelector('#call-controls').hidden === false")
        call_action_position = page.evaluate("()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON()})")
        if width >= 960:
            for position in (normal_action_position, call_action_position):
                assert 0 <= position['controls']['y'] - position['table']['bottom'] <= 8.5, position
        assert abs(normal_action_position['table']['y'] - call_action_position['table']['y']) < 1, (normal_action_position, call_action_position)
        if width >= 960:
            for key in ('x', 'y', 'width', 'height'):
                assert abs(normal_action_position['table'][key] - call_action_position['table'][key]) < 1, (normal_action_position, call_action_position)
            for key in ('x', 'y', 'width'):
                assert abs(normal_action_position['controls'][key] - call_action_position['controls'][key]) < 1, (normal_action_position, call_action_position)
        assert page.locator('#call-decision-dialog').count() == 0, 'call modal remains in the page'
        assert page.locator('dialog[open]').count() == 0, 'call decision unexpectedly opened a modal'
        assert page.locator('#candidate-options button').count() == 0, 'candidates appeared before a type was selected'
        call_position = page.locator('#call-controls').evaluate('node=>getComputedStyle(node).position')
        assert call_position == 'relative', (width, call_position)
        assert page.locator('#local-game-controls').evaluate('node=>getComputedStyle(node).position') == 'relative'
        assert '見送る' in page.locator('#call-controls').inner_text(), 'the call type screen lost its pass action'
        type_choices = [page.locator(selector).bounding_box() for selector in ['#call-pon', '#call-kan', '#call-chi', '#pass-calls'] if page.locator(selector).is_visible()]
        assert len(type_choices) >= 2, (width, type_choices)
        panel_columns = page.locator('#call-controls').evaluate("node=>getComputedStyle(node).gridTemplateColumns.split(' ').length")
        first_row = [box for box in type_choices if abs(box['y'] - min(item['y'] for item in type_choices)) < 1]
        assert len(first_row) == min(len(type_choices), panel_columns), (width, height, type_choices, panel_columns)
        if len(type_choices) == 2:
            assert abs(type_choices[0]['y'] - type_choices[1]['y']) < 1, (width, type_choices)
        for selector in ['#call-pon', '#call-kan', '#call-chi', '#pass-calls']:
            if page.locator(selector).is_visible():
                box = page.locator(selector).bounding_box()
                assert box and box['width'] >= 44 and box['height'] >= 44, (width, height, selector, box)

        panel_before = page.locator('#call-controls').bounding_box()
        table_before = page.locator('#local-table').bounding_box()
        ordinary_controls_before = page.locator('#local-game-controls').bounding_box()
        assert panel_before and panel_before['y'] >= 0 and panel_before['y'] + panel_before['height'] <= height, (width, height, panel_before)
        if width < 960:
            assert table_before and ordinary_controls_before and 0 <= ordinary_controls_before['y'] - table_before['y'] - table_before['height'] <= 8, (table_before, ordinary_controls_before)
            assert panel_before['y'] >= ordinary_controls_before['y'] and panel_before['y'] + panel_before['height'] <= ordinary_controls_before['y'] + ordinary_controls_before['height'], (ordinary_controls_before, panel_before)
        page_size_before = page.evaluate("()=>({scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,innerWidth,innerHeight})")
        page.locator('#call-chi').click()
        candidates = page.locator('#candidate-options button[data-action-choice="call"]')
        assert candidates.count() == 5, f'{width}x{height}: expected five chi candidates'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>{const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text="";while(walker.nextNode()){if(!walker.currentNode.parentElement?.closest("svg"))text+=walker.currentNode.textContent;}return text.trim()===""})'), 'call kind text is duplicated outside the tile artwork'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>Boolean(node.getAttribute("aria-label")))'), 'candidate accessible names were removed'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&(hit===node||node.contains(hit))})'), 'candidate hit target is clipped, covered, or too small'
        assert page.locator('#candidate-options .tile-svg').evaluate_all('nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.width>=20&&r.height>=28})'), 'candidate tile art became too small'
        call_back = page.locator('#candidate-back')
        assert call_back.inner_text().strip() == '戻る', f'back button label changed: {call_back.inner_text()!r}'
        back_state = call_back.evaluate("""node=>({hidden:node.hidden,html:node.outerHTML,rect:node.getBoundingClientRect().toJSON(),display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility})""")
        assert call_back.is_visible(), f'back button is hidden: {back_state}'
        back_box = call_back.bounding_box()
        assert back_box and back_box['width'] >= 44 and back_box['height'] >= 44, (width, height, back_box)
        assert 0 <= back_box['y'] and back_box['y'] + back_box['height'] <= height, (width, height, back_box)
        back_hit = call_back.evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===node||node.contains(hit)}''')
        assert back_hit, (width, height, back_box)
        candidate_panel = page.locator('#candidate-controls')
        assert candidate_panel.evaluate('node=>getComputedStyle(node).position') == 'fixed', 'candidate panel is not fixed to the viewport'
        assert page.locator('#normal-controls').is_hidden(), 'regular controls remained focusable while choosing a candidate'
        assert page.locator('#call-controls').is_hidden(), 'call type controls remained visible while choosing a candidate'
        assert candidate_panel.evaluate("node=>{const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text='';while(walker.nextNode()){if(!walker.currentNode.parentElement?.closest('svg'))text+=walker.currentNode.textContent;}return text.trim()==='戻る'}"), 'candidate panel contains extra instructions or operation text'
        assert page.locator('#candidate-options').evaluate("node=>node.querySelectorAll('button').length===5 && [...node.querySelectorAll('button')].every(button=>{const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let text='';while(walker.nextNode()){if(!walker.currentNode.parentElement?.closest('svg'))text+=walker.currentNode.textContent;}return text.trim()===''})"), 'candidate buttons contain text besides tile art'
        assert page.locator('#pass-calls').is_hidden(), 'pass remained available while choosing a candidate'
        assert '見送る' not in candidate_panel.inner_text(), 'candidate screen still includes pass text'
        grid = page.locator('#candidate-options').evaluate("node=>{const rows=[...new Set([...node.querySelectorAll('button')].map(button=>Math.round(button.getBoundingClientRect().top)))];const first=rows[0];const columns=[...node.querySelectorAll('button')].filter(button=>Math.round(button.getBoundingClientRect().top)===first).length;return {columns,rows:rows.length,top:node.getBoundingClientRect().top}}")
        assert grid['columns'] >= 3, (width, grid)
        if grid['rows'] >= 2:
            assert grid['columns'] >= 3, (width, grid)
        if width == 320:
            assert grid['rows'] >= 2, (width, grid)
        candidate_box = page.locator('#candidate-options').bounding_box()
        panel_candidates = candidate_panel.bounding_box()
        back_box = page.locator('#candidate-back').bounding_box()
        table_candidates = page.locator('#local-table').bounding_box()
        ordinary_controls_candidates = page.locator('#local-game-controls').bounding_box()
        assert candidate_box and panel_candidates and back_box, (candidate_box, panel_candidates, back_box)
        assert page.locator('#candidate-options').evaluate("node=>node.closest('[data-panel-part=candidate-controls]')===document.querySelector('#candidate-controls')"), 'candidate list left the shared candidate panel'
        assert page.locator('#candidate-back').evaluate("node=>node.closest('[data-panel-part=candidate-controls]')===document.querySelector('#candidate-controls')"), 'back action left the shared candidate panel'
        assert candidate_box['x'] >= panel_candidates['x'] and candidate_box['x'] + candidate_box['width'] <= panel_candidates['x'] + panel_candidates['width'], (candidate_box, panel_candidates)
        assert candidate_box['y'] >= panel_candidates['y'] and candidate_box['y'] + candidate_box['height'] <= back_box['y'], (candidate_box, panel_candidates, back_box)
        assert 0 <= back_box['y'] - candidate_box['y'] - candidate_box['height'] <= 8, (candidate_box, back_box)
        option_frame = page.locator('#candidate-options').evaluate("node=>({border:getComputedStyle(node).borderWidth,background:getComputedStyle(node).backgroundColor,shadow:getComputedStyle(node).boxShadow})")
        assert option_frame == {'border':'0px','background':'rgba(0, 0, 0, 0)','shadow':'none'}, option_frame
        assert panel_candidates['y'] < panel_before['y'], (panel_before, panel_candidates)
        assert ordinary_controls_before and abs(panel_candidates['y'] + panel_candidates['height'] - (ordinary_controls_before['y'] + ordinary_controls_before['height'])) <= 2, (ordinary_controls_before, panel_candidates)
        multi_candidate_panel = panel_candidates if grid['rows'] >= 2 else None
        if grid['rows'] >= 2:
            assert panel_candidates['y'] < panel_before['y'], (panel_before, panel_candidates, grid)
        if (width, height) == (375, 634):
            page.locator('#candidate-options').evaluate("node=>{node.style.maxHeight='55px';node.scrollTop=0}")
            scroll_metrics = page.locator('#candidate-options').evaluate("node=>({height:node.clientHeight,content:node.scrollHeight,overflow:getComputedStyle(node).overflowY})")
            assert scroll_metrics['content'] > scroll_metrics['height'] and scroll_metrics['overflow'] == 'auto', scroll_metrics
            page.locator('#candidate-options').evaluate('node=>node.scrollTop=node.scrollHeight')
            assert page.locator('#candidate-options').evaluate('node=>node.scrollTop>0'), 'candidate area did not scroll independently'
            assert page.evaluate('scrollY') == 0, 'scrolling the candidate area scrolled the page'
            assert page.locator('#candidate-back').bounding_box()['y'] + page.locator('#candidate-back').bounding_box()['height'] <= height, 'back action became unavailable during candidate scroll'
            page.locator('#candidate-options').evaluate("node=>{node.style.removeProperty('max-height');node.scrollTop=0}")
        assert table_before and table_candidates, (table_before, table_candidates)
        for dimension in ('x', 'y', 'width', 'height'):
            assert abs(table_candidates[dimension] - table_before[dimension]) < 1, (dimension, table_before, table_candidates)
        assert ordinary_controls_before and ordinary_controls_candidates and abs(ordinary_controls_candidates['y'] - ordinary_controls_before['y']) < 1, (ordinary_controls_before, ordinary_controls_candidates)
        assert panel_before and panel_candidates, (panel_before, panel_candidates)
        assert page.evaluate('scrollY') == 0, 'rendering call candidates scrolled the page'
        page_size = page.evaluate("""()=>({scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,innerWidth,innerHeight,panel:document.querySelector('#candidate-controls').getBoundingClientRect().toJSON(),table:document.querySelector('#local-table').getBoundingClientRect().toJSON()})""")
        assert page_size['scrollWidth'] <= page_size_before['scrollWidth'], (width, height, page_size_before, page_size)
        assert page_size['scrollHeight'] <= page_size_before['scrollHeight'] + 1, (width, height, page_size_before, page_size)

        if (width, height) == (375, 634):
            actions_before = page.evaluate('callState().phase')
            page.keyboard.press('Escape')
            assert page.locator('#candidate-options button').count() == 0
            assert page.locator('#call-chi').is_visible() and page.locator('#candidate-back').is_hidden()
            assert page.locator('#pass-calls').is_visible(), 'back did not restore the type screen pass action'
            assert page.evaluate('callState().phase') == actions_before, 'Escape answered the call decision'
            page.locator('#call-chi').click()
            page.locator('#candidate-back').click()
            assert page.evaluate('callState().phase') == actions_before, 'back answered the call decision'
            assert page.locator('#pass-calls').is_visible(), 'back did not restore the type screen pass action'
            page.locator('#pass-calls').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")

            for mode, expected_count in [('two', 2), ('three', 3)]:
                page.evaluate(f"loadCalls('{mode}')")
                exact_before = page.evaluate("()=>({root:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON(),table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),scrollY})")
                page.locator('#call-chi').click()
                exact_options = page.locator('#candidate-options button[data-action-choice="call"]')
                assert exact_options.count() == expected_count, (mode, exact_options.count())
                exact_grid = page.locator('#candidate-options').evaluate("node=>{const rows=[...new Set([...node.querySelectorAll('button')].map(button=>Math.round(button.getBoundingClientRect().top)))];const first=rows[0];const columns=[...node.querySelectorAll('button')].filter(button=>Math.round(button.getBoundingClientRect().top)===first).length;return {columns,rows:rows.length}}")
                if expected_count == 3:
                    assert exact_grid == {'columns':3,'rows':1}, exact_grid
                exact_box = page.locator('#candidate-options').bounding_box()
                exact_panel_box = page.locator('#candidate-controls').bounding_box()
                exact_back = page.locator('#candidate-back').bounding_box()
                assert exact_box and exact_back and exact_panel_box and 0 <= exact_back['y'] - exact_box['y'] - exact_box['height'] <= 8, (exact_box, exact_panel_box, exact_back)
                assert abs(exact_panel_box['y'] + exact_panel_box['height'] - exact_before['root']['bottom']) < 2, (exact_panel_box, exact_before)
                exact_open = page.evaluate("()=>({root:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON(),table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),scrollY})")
                for area in ('root', 'table'):
                    for key in ('x', 'y', 'width', 'height'):
                        assert abs(exact_open[area][key] - exact_before[area][key]) < 1, (mode, area, key, exact_before, exact_open)
                assert exact_open['scrollY'] == exact_before['scrollY'] == 0, (exact_before, exact_open)
                if multi_candidate_panel:
                    assert exact_panel_box['height'] <= multi_candidate_panel['height'], (exact_panel_box, multi_candidate_panel, mode)
                page.locator('#candidate-back').click()
                assert page.locator('#pass-calls').is_visible(), f'{mode} candidate Back did not restore the type screen'
                exact_restored = page.evaluate("()=>({root:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON(),table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),scrollY})")
                for area in ('root', 'table'):
                    for key in ('x', 'y', 'width', 'height'):
                        assert abs(exact_restored[area][key] - exact_before[area][key]) < 1, (mode, area, key, exact_before, exact_restored)
                assert exact_restored['scrollY'] == exact_before['scrollY'], (exact_before, exact_restored)

            page.evaluate("loadCalls('multi')")
            multi_choices = [page.locator(selector).bounding_box() for selector in ['#call-chi', '#call-pon', '#pass-calls']]
            assert all(multi_choices) and len({round(box['y']) for box in multi_choices}) == 1, multi_choices
            assert all(box['width'] >= 44 and box['height'] >= 44 for box in multi_choices), multi_choices
            page.locator('#call-pon').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert page.evaluate("callState().players[0].melds[0].type") == 'pon', 'the pressed pon type was not selected'

            page.evaluate("loadCalls('multi')")
            page.locator('#call-chi').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert page.evaluate("callState().players[0].melds[0].type") == 'chi', 'the pressed chi type was not selected'

            page.evaluate("loadCalls('max')")
            page.locator('#call-kan').click()
            assert page.locator('#candidate-options button[data-action-choice="call"]').count() == 0
            assert page.locator('#candidate-back').is_hidden(), 'single daiminkan exposed Back'
            page.wait_for_function("callState().phase!=='awaiting-call'")

            page.evaluate("loadCalls('pon-one')")
            page.locator('#call-pon').click()
            assert page.locator('#candidate-options button[data-action-choice="call"]').count() == 0
            assert page.locator('#candidate-back').is_hidden(), 'single pon exposed Back'
            page.wait_for_function("callState().phase!=='awaiting-call'")

            page.evaluate("loadCalls('red')")
            page.locator('#call-chi').click()
            red_options = page.locator('#candidate-options button[data-action-choice="call"]')
            assert red_options.count() == 2
            reds = red_options.evaluate_all("nodes=>nodes.map(n=>[...n.querySelectorAll('svg path')].some(p=>p.getAttribute('d')==='M48 4h7v7Z'))")
            assert sorted(reds) == [False, True], reds
            red_options.nth(reds.index(True)).click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert page.evaluate("callState().players[0].melds[0].tiles.some(t=>t.tile.isRed)"), 'red chi candidate lost its physical red tile'

            page.evaluate("loadCalls('pon-red')")
            page.locator('#call-pon').click()
            pon_options = page.locator('#candidate-options button[data-action-choice="call"]')
            assert pon_options.count() == 2
            pon_reds = pon_options.evaluate_all("nodes=>nodes.map(n=>[...n.querySelectorAll('svg path')].some(p=>p.getAttribute('d')==='M48 4h7v7Z'))")
            assert sorted(pon_reds) == [False, True], pon_reds
            pon_options.nth(pon_reds.index(True)).click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert page.evaluate("callState().players[0].melds[0].tiles.some(t=>t.tile.isRed)"), 'red pon candidate lost its physical red tile'

            page.evaluate("loadCalls('one')")
            type_only = [page.locator(selector).bounding_box() for selector in ['#call-chi', '#pass-calls']]
            assert type_only[0] and type_only[1] and abs(type_only[0]['y'] - type_only[1]['y']) < 1, type_only
            assert abs(type_only[0]['x'] + type_only[0]['width'] / 2 - (type_only[1]['x'] + type_only[1]['width'] / 2)) > 40, type_only
            page.locator('#call-chi').click()
            assert page.locator('#candidate-options button[data-action-choice="call"]').count() == 0
            assert page.locator('#candidate-back').is_hidden(), 'single chi exposed Back'
            page.wait_for_function("callState().phase!=='awaiting-call'")

            page.evaluate('loadTurn()')
            assert page.locator('#call-controls').is_hidden(), 'call controls were shown for a ron decision'
            assert page.locator('#ron-controls').is_visible(), 'ron controls were lost during call UI changes'

        if width >= 960:
            back_box = page.locator('#candidate-back').bounding_box()
            assert back_box and 0 <= back_box['y'] and back_box['y'] + back_box['height'] <= height, (width, height, back_box)
            page.mouse.click(back_box['x'] + back_box['width'] / 2, back_box['y'] + back_box['height'] / 2)
            assert page.locator('#candidate-back').is_hidden() and page.locator('#pass-calls').is_visible(), f'{width}x{height}: PC Back did not restore call types'
            page.locator('#call-chi').click()
            candidate_box = page.locator('#candidate-options button[data-action-choice="call"]').first.bounding_box()
            assert candidate_box and 0 <= candidate_box['y'] and candidate_box['y'] + candidate_box['height'] <= height, (width, height, candidate_box)
            candidate_hit = page.locator('#candidate-options button[data-action-choice="call"]').first.evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===node||node.contains(hit)}''')
            assert candidate_hit, f'{width}x{height}: PC candidate was covered at its click point'
            page.mouse.click(candidate_box['x'] + candidate_box['width'] / 2, candidate_box['y'] + candidate_box['height'] / 2)
            page.wait_for_function("callState().phase!=='awaiting-call'")

            if (width, height) == (1280, 720):
                page.evaluate('loadCalls("max")')
                page.locator('#call-chi').click()
                page.locator('#candidate-options').evaluate("node=>{node.style.maxHeight='55px';node.scrollTop=0}")
                scroll_metrics = page.locator('#candidate-options').evaluate('''node=>({
                  count:node.querySelectorAll('button[data-action-choice="call"]').length,
                  maxHeight:getComputedStyle(node).maxHeight,
                  clientHeight:node.clientHeight,
                  scrollHeight:node.scrollHeight,
                  overflow:getComputedStyle(node).overflowY,
                  pageScroll:document.scrollingElement.scrollTop
                })''')
                assert scroll_metrics['count'] == 5 and scroll_metrics['maxHeight'] != 'none', scroll_metrics
                assert scroll_metrics['scrollHeight'] > scroll_metrics['clientHeight'] and scroll_metrics['overflow'] == 'auto', scroll_metrics
                page.locator('#candidate-options').evaluate('node=>node.scrollTop=node.scrollHeight')
                last_candidate = page.locator('#candidate-options button[data-action-choice="call"]').last
                last_box = last_candidate.bounding_box()
                last_hit = last_candidate.evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(hit===node||node.contains(hit))}''')
                assert last_box and last_hit and page.evaluate('scrollY') == 0, (last_box, scroll_metrics)
                page.mouse.click(last_box['x'] + last_box['width'] / 2, last_box['y'] + last_box['height'] / 2)
                page.wait_for_function("callState().phase!=='awaiting-call'")

        page.evaluate('loadTurn()')
        page.wait_for_function("document.querySelector('#ron-controls').hidden === false")
        normal_after = page.evaluate("()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON()})")
        assert abs(normal_after['table']['width'] - normal_action_position['table']['width']) < 1, (normal_action_position, normal_after)
        assert abs(normal_after['controls']['y'] - normal_action_position['controls']['y']) < 1, (normal_action_position, normal_after)

        print(f'{browser_name} call UI at {width}x{height}: {grid["columns"]} candidate columns')

    # Issue #52: native keyboard activation, actual Tab order and visual focus.
    for width, height in [(320, 568), (390, 844), (1280, 720)]:
        page.set_viewport_size({'width': width, 'height': height})
        for key in ('Enter', 'Space'):
            page.evaluate('window.scrollTo(0,0);loadCalls("max")')
            fingerprint = page.evaluate('JSON.stringify(callState())')
            types = page.locator('#call-controls button:visible:enabled')
            # Start immediately before the type row, then use real Tab navigation.
            types.first.focus()
            page.keyboard.press('Shift+Tab')
            for index in range(types.count()):
                page.keyboard.press('Tab')
                assert_button_focus(page, types.nth(index))
            assert page.evaluate('JSON.stringify(callState())') == fingerprint, 'Tab committed a call'
            # Navigate backwards from Pass to Chi without clicking or changing state.
            for _ in range(types.count()):
                if page.locator('#call-chi').evaluate('node=>node===document.activeElement'):
                    break
                page.keyboard.press('Shift+Tab')
            assert_button_focus(page, page.locator('#call-chi'))
            page.keyboard.press(key)
            tab_candidates(page, '#local-game-controls')
            assert page.evaluate('JSON.stringify(callState())') == fingerprint, 'candidate focus committed a call'
            page.keyboard.press(key)  # Back
            assert page.locator('#call-chi').evaluate('node=>node===document.activeElement')
            assert page.locator('#pass-calls').is_visible()
            assert page.evaluate('JSON.stringify(callState())') == fingerprint, 'Back committed a call'
            page.keyboard.press(key)
            tab_candidates(page, '#local-game-controls')
            page.keyboard.press('Shift+Tab')  # last candidate
            page.keyboard.press(key)
            page.wait_for_function("callState().phase!=='awaiting-call'")
            for mode, selector in [('one', '#call-chi'), ('pon-one', '#call-pon')]:
                page.evaluate(f'loadCalls("{mode}")')
                button = page.locator(selector)
                button.focus()
                page.keyboard.press('Tab')
                page.keyboard.press('Shift+Tab')
                assert_button_focus(page, button)
                assert page.evaluate('callState().phase') == 'awaiting-call'
                page.keyboard.press(key)
                page.wait_for_function("callState().phase!=='awaiting-call'")
                assert page.locator('#candidate-options button').count() == 0
        print(f'{browser_name} keyboard call focus {width}x{height}: Enter/Space, Tab order, Back, single/multiple OK')

    # Very low PC viewports may need page scrolling to reach the anchored
    # action area. The normal desktop matrix above must remain scroll-free.
    page.set_viewport_size({'width': 1280, 'height': 400})
    page.evaluate('window.scrollTo(0,0);loadCalls("max")')
    assert page.evaluate('document.scrollingElement.scrollHeight>innerHeight'), 'the low viewport did not provide a page-scroll path'
    low_table = page.locator('#local-table').bounding_box()
    page.locator('#call-chi').scroll_into_view_if_needed()
    page.locator('#call-chi').click()
    low_back = page.locator('#candidate-back')
    low_back_box = low_back.bounding_box()
    assert low_back_box and 0 <= low_back_box['y'] and low_back_box['y'] + low_back_box['height'] <= 400, (low_back_box, page.evaluate('scrollY'))
    assert low_back.evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===node||node.contains(hit)}'''), 'low viewport Back remained covered after page scrolling'
    page.mouse.click(low_back_box['x'] + low_back_box['width'] / 2, low_back_box['y'] + low_back_box['height'] / 2)
    assert page.locator('#pass-calls').is_visible(), 'low viewport Back did not restore call types'
    page.locator('#pass-calls').scroll_into_view_if_needed()
    page.locator('#pass-calls').click()
    page.wait_for_function("callState().phase!=='awaiting-call'")
    assert low_table and page.locator('#local-table').bounding_box()['width'] == low_table['width'], 'low viewport call state changed the table size'

    assert not errors, errors
    page.close()
    browser.close()
