"""Inline call selection, responsive candidate grids and upward expansion regression."""
import os
import shutil

from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture

browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
with sync_playwright() as p:
    browser_type = getattr(p, browser_name)
    launch = {'args': ['--no-sandbox', '--disable-crashpad', '--disable-crash-reporter']} if browser_name == 'chromium' else {}
    if browser_name == 'chromium':
        launch['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
    browser = browser_type.launch(**launch)
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

    for width, height in [(375, 634), (320, 568), (375, 844), (844, 390), (667, 375), (1280, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('window.scrollTo(0,0)')
        page.evaluate('loadTurn()')
        page.wait_for_function("document.querySelector('#ron-controls').hidden === false")
        normal_action_position = page.evaluate("()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON()})")
        page.evaluate("loadCalls('max')")
        page.wait_for_function("document.querySelector('#call-controls').hidden === false")
        call_action_position = page.evaluate("()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON()})")
        if width >= 960:
            assert abs(
                normal_action_position['controls']['y'] + normal_action_position['controls']['height']
                - call_action_position['controls']['y'] - call_action_position['controls']['height']
            ) < 1, (normal_action_position, call_action_position)
        assert abs(normal_action_position['table']['y'] - call_action_position['table']['y']) < 1, (normal_action_position, call_action_position)
        assert page.locator('#call-decision-dialog').count() == 0, 'call modal remains in the page'
        assert page.locator('dialog[open]').count() == 0, 'call decision unexpectedly opened a modal'
        assert page.locator('#call-options button').count() == 0, 'candidates appeared before a type was selected'
        call_position = page.locator('#call-controls').evaluate('node=>getComputedStyle(node).position')
        assert call_position == 'absolute', (width, call_position)
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
            assert abs(panel_before['y'] - ordinary_controls_before['y'] - 1) < 1, (ordinary_controls_before, panel_before)
        page_size_before = page.evaluate("()=>({scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,innerWidth,innerHeight})")
        page.locator('#call-chi').click()
        candidates = page.locator('#call-options button[data-action-choice="call"]')
        assert candidates.count() == 5, f'{width}x{height}: expected five chi candidates'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>{const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text="";while(walker.nextNode()){if(!walker.currentNode.parentElement?.closest("svg"))text+=walker.currentNode.textContent;}return text.trim()===""})'), 'call kind text is duplicated outside the tile artwork'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>Boolean(node.getAttribute("aria-label")))'), 'candidate accessible names were removed'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})'), 'candidate hit target is clipped or too small'
        assert page.locator('#call-options .tile-svg').evaluate_all('nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.width>=22&&r.height>=31})'), 'candidate tile art became too small'
        call_back = page.locator('#call-back')
        assert call_back.inner_text().strip() == '戻る', f'back button label changed: {call_back.inner_text()!r}'
        back_state = call_back.evaluate("""node=>({hidden:node.hidden,html:node.outerHTML,rect:node.getBoundingClientRect().toJSON(),display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility})""")
        assert call_back.is_visible(), f'back button is hidden: {back_state}'
        back_box = call_back.bounding_box()
        assert back_box and back_box['width'] >= 44 and back_box['height'] >= 44 and back_box['y'] + back_box['height'] <= height, (width, height, back_box)
        assert page.locator('#pass-calls').is_hidden(), 'pass remained available while choosing a candidate'
        assert '見送る' not in page.locator('#call-controls').inner_text(), 'candidate screen still includes pass text'
        grid = page.locator('#call-options').evaluate("node=>({columns:getComputedStyle(node).gridTemplateColumns.split(' ').length,rows:getComputedStyle(node).gridTemplateRows.split(' ').length,top:node.getBoundingClientRect().top})")
        assert grid['columns'] >= 3, (width, grid)
        if grid['rows'] >= 2:
            assert grid['columns'] >= 3, (width, grid)
        if width == 320:
            assert grid['rows'] >= 2, (width, grid)
        candidate_box = page.locator('#call-options').bounding_box()
        panel_candidates = page.locator('#call-controls').bounding_box()
        back_box = page.locator('#call-back').bounding_box()
        table_candidates = page.locator('#local-table').bounding_box()
        ordinary_controls_candidates = page.locator('#local-game-controls').bounding_box()
        assert candidate_box and panel_candidates and back_box, (candidate_box, panel_candidates, back_box)
        assert page.locator('#call-options').evaluate("node=>node.closest('[data-panel-part=call-controls]')===document.querySelector('#call-controls')"), 'candidate list left the shared call action panel'
        assert page.locator('#call-back').evaluate("node=>node.closest('[data-panel-part=call-controls]')===document.querySelector('#call-controls')"), 'back action left the shared call action panel'
        assert candidate_box['x'] >= panel_candidates['x'] and candidate_box['x'] + candidate_box['width'] <= panel_candidates['x'] + panel_candidates['width'], (candidate_box, panel_candidates)
        assert candidate_box['y'] >= panel_candidates['y'] and candidate_box['y'] + candidate_box['height'] <= back_box['y'], (candidate_box, panel_candidates, back_box)
        assert 0 <= back_box['y'] - candidate_box['y'] - candidate_box['height'] <= 8, (candidate_box, back_box)
        option_frame = page.locator('#call-options').evaluate("node=>({border:getComputedStyle(node).borderWidth,background:getComputedStyle(node).backgroundColor,shadow:getComputedStyle(node).boxShadow})")
        assert option_frame == {'border':'0px','background':'rgba(0, 0, 0, 0)','shadow':'none'}, option_frame
        assert panel_candidates['y'] <= panel_before['y'] + 1, (panel_before, panel_candidates)
        assert abs(panel_candidates['y'] + panel_candidates['height'] - panel_before['y'] - panel_before['height']) < 1, (panel_before, panel_candidates)
        if grid['rows'] >= 2:
            assert panel_candidates['y'] < panel_before['y'], (panel_before, panel_candidates, grid)
        if (width, height) == (375, 634):
            page.locator('#call-options').evaluate("node=>{node.style.maxHeight='55px';node.scrollTop=0}")
            scroll_metrics = page.locator('#call-options').evaluate("node=>({height:node.clientHeight,content:node.scrollHeight,overflow:getComputedStyle(node).overflowY})")
            assert scroll_metrics['content'] > scroll_metrics['height'] and scroll_metrics['overflow'] == 'auto', scroll_metrics
            page.locator('#call-options').evaluate('node=>node.scrollTop=node.scrollHeight')
            assert page.locator('#call-options').evaluate('node=>node.scrollTop>0'), 'candidate area did not scroll independently'
            assert page.evaluate('scrollY') == 0, 'scrolling the candidate area scrolled the page'
            assert page.locator('#call-back').bounding_box()['y'] + page.locator('#call-back').bounding_box()['height'] <= height, 'back action became unavailable during candidate scroll'
            page.locator('#call-options').evaluate("node=>{node.style.removeProperty('max-height');node.scrollTop=0}")
        assert table_before and table_candidates and abs(table_candidates['y'] - table_before['y']) < 1, (table_before, table_candidates)
        if width < 960:
            assert ordinary_controls_candidates and 0 <= ordinary_controls_candidates['y'] - table_candidates['y'] - table_candidates['height'] <= 8, (table_candidates, ordinary_controls_candidates)
        else:
            assert ordinary_controls_before and ordinary_controls_candidates and abs(ordinary_controls_candidates['y'] - ordinary_controls_before['y']) < 1, (ordinary_controls_before, ordinary_controls_candidates)
        assert panel_before and panel_candidates, (panel_before, panel_candidates)
        assert page.evaluate('scrollY') == 0, 'rendering call candidates scrolled the page'
        page_size = page.evaluate("""()=>({scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,innerWidth,innerHeight,panel:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON(),callPanel:document.querySelector('#call-controls').getBoundingClientRect().toJSON(),table:document.querySelector('#local-table').getBoundingClientRect().toJSON()})""")
        assert page_size['scrollWidth'] <= page_size_before['scrollWidth'] and page_size['scrollHeight'] <= page_size_before['scrollHeight'], (width, height, page_size_before, page_size)

        if (width, height) == (375, 634):
            actions_before = page.evaluate('callState().phase')
            page.keyboard.press('Escape')
            assert page.locator('#call-options button').count() == 0
            assert page.locator('#call-chi').is_visible() and page.locator('#call-back').is_hidden()
            assert page.locator('#pass-calls').is_visible(), 'back did not restore the type screen pass action'
            assert page.evaluate('callState().phase') == actions_before, 'Escape answered the call decision'
            page.locator('#call-chi').click()
            page.locator('#call-back').click()
            assert page.evaluate('callState().phase') == actions_before, 'back answered the call decision'
            assert page.locator('#pass-calls').is_visible(), 'back did not restore the type screen pass action'
            page.locator('#pass-calls').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")

            for mode, expected_count in [('two', 2), ('three', 3)]:
                page.evaluate(f"loadCalls('{mode}')")
                page.locator('#call-chi').click()
                exact_options = page.locator('#call-options button[data-action-choice="call"]')
                assert exact_options.count() == expected_count, (mode, exact_options.count())
                exact_grid = page.locator('#call-options').evaluate("node=>({columns:getComputedStyle(node).gridTemplateColumns.split(' ').length,rows:getComputedStyle(node).gridTemplateRows.split(' ').length})")
                if expected_count == 3:
                    assert exact_grid == {'columns':3,'rows':1}, exact_grid
                exact_box = page.locator('#call-options').bounding_box()
                exact_back = page.locator('#call-back').bounding_box()
                assert exact_box and exact_back and 0 <= exact_back['y'] - exact_box['y'] - exact_box['height'] <= 8, (exact_box, exact_back)
                page.locator('#call-back').click()
                assert page.locator('#pass-calls').is_visible(), f'{mode} candidate Back did not restore the type screen'

            page.evaluate("loadCalls('multi')")
            multi_choices = [page.locator(selector).bounding_box() for selector in ['#call-chi', '#call-pon', '#pass-calls']]
            assert all(multi_choices) and len({round(box['y']) for box in multi_choices}) == 1, multi_choices
            assert all(box['width'] >= 44 and box['height'] >= 44 for box in multi_choices), multi_choices

            page.evaluate("loadCalls('max')")
            page.locator('#call-kan').click()
            kan_options = page.locator('#call-options button[data-action-choice="call"]')
            assert kan_options.count() == 1, 'the selected kan type did not show its candidate'
            kan_options.click()
            page.wait_for_function("callState().phase!=='awaiting-call'")

            page.evaluate("loadCalls('red')")
            page.locator('#call-chi').click()
            red_options = page.locator('#call-options button[data-action-choice="call"]')
            assert red_options.count() == 2
            reds = red_options.evaluate_all("nodes=>nodes.map(n=>[...n.querySelectorAll('svg path')].some(p=>p.getAttribute('d')==='M48 4h7v7Z'))")
            assert sorted(reds) == [False, True], reds
            red_options.nth(reds.index(True)).click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert page.evaluate("callState().players[0].melds[0].tiles.some(t=>t.tile.isRed)"), 'red chi candidate lost its physical red tile'

            page.evaluate("loadCalls('pon-red')")
            page.locator('#call-pon').click()
            pon_options = page.locator('#call-options button[data-action-choice="call"]')
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
            assert page.locator('#call-options button[data-action-choice="call"]').count() == 1
            single_candidate_box = page.locator('#call-options').bounding_box()
            single_panel_box = page.locator('#call-controls').bounding_box()
            single_back_box = page.locator('#call-back').bounding_box()
            assert single_candidate_box and single_panel_box and single_back_box and 0 <= single_back_box['y'] - single_candidate_box['y'] - single_candidate_box['height'] <= 8, (single_candidate_box, single_back_box)
            assert page.evaluate("callState().phase==='awaiting-call'"), 'a single candidate was selected before it was displayed'
            page.locator('#call-options button[data-action-choice="call"]').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")

            page.evaluate('loadTurn()')
            assert page.locator('#call-controls').is_hidden(), 'call controls were shown for a ron decision'
            assert page.locator('#ron-controls').is_visible(), 'ron controls were lost during call UI changes'

        page.evaluate('loadTurn()')
        page.wait_for_function("document.querySelector('#ron-controls').hidden === false")
        normal_after = page.evaluate("()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON()})")
        assert abs(normal_after['table']['width'] - normal_action_position['table']['width']) < 1, (normal_action_position, normal_after)
        assert abs(normal_after['controls']['y'] - normal_action_position['controls']['y']) < 1, (normal_action_position, normal_after)

        print(f'{browser_name} call UI at {width}x{height}: {grid["columns"]} candidate columns')

    assert not errors, errors
    page.close()
    browser.close()
