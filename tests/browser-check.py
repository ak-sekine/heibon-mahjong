from playwright.sync_api import sync_playwright
import json
import re
import argparse
import pathlib
import shutil
import tempfile

parser = argparse.ArgumentParser(description="Optional Chromium check (requires Python Playwright and Chromium)")
parser.add_argument("--url", default="http://localhost:4173/heibon-mahjong/")
parser.add_argument("--screenshots", default=str(pathlib.Path(tempfile.gettempdir()) / "heibon-screenshots"))
parser.add_argument("--tsumo-fixture", action="store_true", help="Also test tsumo with a fixed legal wall (requires Vite dev server)")
parser.add_argument("--only-tsumo-fixture", action="store_true", help="Run only the optional tsumo fixture")
options = parser.parse_args()
pathlib.Path(options.screenshots).mkdir(parents=True, exist_ok=True)

def box(page, selector):
    return page.locator(selector).bounding_box()
def separate(a,b):
    return a['x']+a['width']<=b['x'] or b['x']+b['width']<=a['x'] or a['y']+a['height']<=b['y'] or b['y']+b['height']<=a['y']
def await_human_turn(page):
    # Decline new call/ron windows through the real controls before resuming
    # this discard/river-capacity scenario. Dedicated suites exercise accepting.
    for _ in range(16):
        if page.locator('#pass-calls').is_visible(): page.locator('#pass-calls').click()
        if page.locator('#pass-ron').is_visible(): page.locator('#pass-ron').click()
        if page.locator('#player-hand button:enabled').count()==14: return
        page.clock.run_for(1000)
    assert page.locator('#player-hand button:enabled').count()==14, page.locator('#selection-status').inner_text()

def geometry(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    tiles=page.locator('#player-hand li')
    bounds=[tiles.nth(i).bounding_box() for i in range(tiles.count())]
    assert len(set(round(b['y'],1) for b in bounds))==1
    assert all(b['x']>=0 and b['x']+b['width']<=page.viewport_size['width'] for b in bounds)
    for river in ['top','right','bottom','left']:
        assert separate(box(page,f'.river-{river}'),box(page,'.center-info')), (river, box(page,f'.river-{river}'), box(page,'.center-info'))
    river_boxes = [box(page, f'.river-{name}') for name in ['top','right','bottom','left']]
    for i, bounds in enumerate(river_boxes):
        assert all(separate(bounds, other) for other in river_boxes[i+1:])
    # Check every tile's coordinates and scroll dimensions, not merely SVG counts.
    report = page.locator('.river').evaluate_all("""els => els.map(el => {
        const r = el.getBoundingClientRect();
        const columns = el.matches('.river-left,.river-right') ? 3 : 6;
        const tiles = [...el.querySelectorAll('.river-tile')].map(tile => {
            const t = tile.getBoundingClientRect();
            const svg = tile.querySelector('svg').getBoundingClientRect();
            return {x:t.x,y:t.y,width:t.width,height:t.height,
                declaration:tile.dataset.riichiDeclaration === "true",row:Number(tile.style.gridRow),column:Number(tile.style.gridColumn),
                transform:getComputedStyle(tile.querySelector("svg")).transform,
                contained:t.left >= r.left + el.clientLeft - .5 &&
                    t.right <= r.left + el.clientLeft + el.clientWidth + .5 &&
                    t.top >= r.top + el.clientTop - .5 &&
                    t.bottom <= r.top + el.clientTop + el.clientHeight + .5,
                svgContained:svg.left >= t.left-.5 && svg.right <= t.right+.5 &&
                    svg.top >= t.top-.5 && svg.bottom <= t.bottom+.5};
        });
        return {player:el.dataset.playerId,columns,tiles,
            client:[el.clientWidth,el.clientHeight],scroll:[el.scrollWidth,el.scrollHeight],
            overflow:getComputedStyle(el).overflow};
    })""")
    for river in report:
        assert river['scroll'][0] <= river['client'][0], river
        assert river['scroll'][1] <= river['client'][1], river
        assert river['overflow'] == 'visible', river
        tiles = river['tiles']
        for i, tile in enumerate(tiles):
            assert tile['contained'] and tile['svgContained'], (river['player'], i, tile)
            assert min(tile['width'],tile['height']) >= 12, tile
            assert tile['x'] >= 0 and tile['x']+tile['width'] <= page.viewport_size['width'], tile
            player = int(river['player'])
            row, column = divmod(i, 6)
            expected = {0:(row+1,column+1),1:(6-column,row+1),2:(3-row,6-column),3:(column+1,3-row)}[player]
            assert (tile['row'],tile['column']) == expected, (player,i,tile)
            matrix = {0:'matrix(1, 0, 0, 1,',1:'matrix(0, -1, 1, 0,',2:'matrix(-1, 0, 0, -1,',3:'matrix(0, 1, -1, 0,'}[player]
            if not tile['declaration']: assert tile['transform'].startswith(matrix), tile
            else: assert '.714286' in tile['transform'], tile
            assert all(separate(tile, other) for other in tiles[i+1:]), (player,i)
            if i:
                previous = tiles[i-1]
                if column:
                    if player in [0,2]:
                        assert abs(tile['y']-previous['y']) < .5
                        assert (tile['x']-previous['x']) * (1 if player == 0 else -1) > 0
                    else:
                        assert abs(tile['x']-previous['x']) < .5
                        assert (tile['y']-previous['y']) * (-1 if player == 1 else 1) > 0
                else:
                    first = tiles[0]
                    if player in [0,2]:
                        assert abs(tile['x']-first['x']) < .5
                        assert (tile['y']-previous['y']) * (1 if player == 0 else -1) > 0
                    else:
                        assert abs(tile['y']-first['y']) < .5
                        assert (tile['x']-previous['x']) * (1 if player == 1 else -1) > 0
    dora_snapshot(page)
    assert separate(box(page,'#player-hand'),box(page,'.rivers'))
    if page.locator('#discard').is_visible():
        control=box(page,'#discard')
        assert control['width']>=44 and control['height']>=44
        tsumo=box(page,'#tsumo')
        assert tsumo['width']>=44 and tsumo['height']>=44
        assert separate(control,tsumo)
    selected=page.locator('[aria-pressed="true"]')
    if selected.count():
        # Step12's short-height layout raises the selected tile by 8px across
        # a 6px gap; allow its existing 2px edge overlap, preserving text visibility.
        assert selected.bounding_box()['y'] >= box(page,'#label-0')['y'] + box(page,'#label-0')['height'] - 2.1
        assert separate(selected.bounding_box(),box(page,'.rivers'))
    for id in [1,2,3]:
        assert page.locator(f'.seat[data-player-id="{id}"] .tile-back').count()==int(re.search(r'(\d+)枚', page.locator(f'.concealed-hand[data-player-id="{id}"]').get_attribute('aria-label')).group(1))
        assert page.locator(f'.seat[data-player-id="{id}"] svg, .seat[data-player-id="{id}"] [data-tile-id]').count()==0
        assert f'CPU{id}' in page.locator(f'#label-{id}').inner_text()
        assert '点' in page.locator(f'#label-{id}').inner_text()

def dora_snapshot(page):
    region = page.locator('#dora-indicators')
    assert region.locator('svg.tile-svg').count() == 1
    svg = region.locator('svg')
    assert svg.get_attribute('viewBox') == '0 0 60 84'
    label = svg.get_attribute('aria-label').removeprefix('ドラ表示牌：')
    assert label
    if re.fullmatch(r'赤?[1-9][萬筒索]', label):
        rank = int(re.search(r'[1-9]', label).group())
        expected = f'{rank % 9 + 1}{label[-1]}'
    else:
        expected = {'東':'南','南':'西','西':'北','北':'東','白':'發','發':'中','中':'白'}[label]
    assert f'ドラ：{expected}' in region.text_content().replace('\n', '')
    assert region.locator('[data-tile-id]').count() == 1
    tile_id = region.locator('[data-tile-id]').get_attribute('data-tile-id')
    assert page.locator(f'#player-hand [data-tile-id="{tile_id}"], .river [data-tile-id="{tile_id}"]').count() == 0
    for id in [1,2,3]:
        assert separate(box(page,'#dora-indicators'), box(page,f'#label-{id}'))
    return region.inner_html()

def controls_visible(page):
    for selector in ['#discard', '#tsumo', '#selection-status', '.keyboard-help']:
        if not page.locator(selector).is_visible():
            continue
        bounds = box(page,selector)
        assert bounds['y'] >= 0 and bounds['y']+bounds['height'] <= page.viewport_size['height']-10, (selector,bounds)
    if not page.locator('#discard').is_visible():
        assert page.locator('#show-result').is_visible()
        return
    assert page.locator('#discard').evaluate('el => { const r=el.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2) === el; }')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('chromium-browser'),args=['--no-sandbox'])
    for w,h in ([] if options.only_tsumo_fixture else [(320,568),(375,667),(390,844),(414,896),(1280,800)]):
        page=browser.new_page(viewport={'width':w,'height':h})
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        # Fixed seeds keep turn-order/wall-exhaustion regression checks repeatable.
        def inject_progression(route):
            response = route.fetch()
            source, count = re.subn(r'new GameController\((?:undefined|void 0),',
                'new GameController(() => { discardRandom = seeded(5); return startGame(seeded(4)); },', response.text())
            assert count == 1
            source = source.replace('onChange: render', 'chooseDiscard: chooseRandomDiscard, random: () => discardRandom(), onChange: render')
            source = ('import { chooseRandomDiscard } from "/heibon-mahjong/src/game/cpu.ts";\n'
                'import { startGame } from "/heibon-mahjong/src/game/start.ts";\n'
                'const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);\n'
                'let discardRandom = seeded(5);\n' + source)
            route.fulfill(response=response, body=source)
        page.route('**/src/main.ts', inject_progression)
        page.goto(options.url)
        page.clock.install()
        page.clock.pause_at(page.evaluate('Date.now()'))
        dora_snapshot(page)
        assert page.locator('#dora-indicators svg').evaluate('el => { const r=el.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return r.y>=0 && r.bottom<=innerHeight && (hit===el || el.contains(hit)); }')
        for source in ['drawn','hand']:
            if page.locator('#result-dialog').is_visible(): page.locator('#view-table').click()
            page.locator('#new-game').click();page.locator('#confirm-new-game').click()
            assert page.locator('#player-hand li').count()==14
            assert page.locator('.river svg').count()==0
            assert page.locator('#discard').is_disabled()
            assert page.locator('#tsumo').is_disabled()
            assert page.locator('[aria-pressed="true"]').count()==0
            geometry(page)
            indicator = dora_snapshot(page)
            page.locator('#dora-indicators svg').click()
            assert dora_snapshot(page) == indicator
            choices=page.locator('#player-hand button')
            a=choices.nth(0); b=choices.nth(1)
            a.click(); assert a.get_attribute('aria-pressed')=='true'
            b.click(); assert a.get_attribute('aria-pressed')=='false' and b.get_attribute('aria-pressed')=='true'
            b.click(); assert page.locator('#discard').is_disabled()
            tile=page.locator('.drawn-tile button') if source=='drawn' else choices.nth(0)
            tile_id=tile.get_attribute('data-tile-id')
            label=tile.get_attribute('aria-label')
            tile.focus(); page.keyboard.press('Space')
            assert tile.get_attribute('aria-pressed')=='true'
            assert label in page.locator('#selection-status').inner_text()
            assert page.locator('#player-hand li').count()==14
            assert page.locator('.river svg').count()==0
            geometry(page)
            page.screenshot(path=f'{options.screenshots}/{w}-{source}-selected.png',full_page=True)
            page.evaluate('''() => {
                window.cpuDiscards = [];
                window.lastCounts = [0,0,0];
                window.riverObserver?.disconnect();
                window.riverObserver = new MutationObserver(() => {
                    const counts = [1,2,3].map(id => document.querySelector(`.river[data-player-id="${id}"]`).children.length);
                    counts.forEach((n,i) => { if (n > window.lastCounts[i]) window.cpuDiscards.push(i+1); });
                    window.lastCounts = counts;
                });
                window.riverObserver.observe(document.querySelector('.rivers'), {subtree:true, childList:true});
            }''')
            page.locator('#discard').focus(); page.keyboard.press('Enter')
            # A repeated synthetic click must not discard another tile.
            page.evaluate('document.querySelector("#discard").click()')
            assert page.locator('#player-hand li').count()==13
            assert page.locator('.drawn-tile').count()==0
            assert page.locator('.river-bottom svg').count()==1
            assert page.locator('.river-bottom [data-tile-id]').get_attribute('data-tile-id')==tile_id
            assert page.locator('.river-bottom svg').get_attribute('aria-label')==label
            assert page.locator('#discard').is_disabled()
            assert page.locator('#player-hand button:enabled').count()==0
            assert 'CPU1の手番' in page.locator('#selection-status').inner_text()
            assert page.locator('#label-1').get_attribute('data-active')=='true'
            page.clock.run_for(1000)
            await_human_turn(page)
            assert page.locator('#player-hand li').count()==14
            assert page.evaluate('window.cpuDiscards')==[1,2,3]
            assert dora_snapshot(page) == indicator
            assert page.locator('#label-0').get_attribute('data-active')=='true'
            for id in [1,2,3]:
                assert page.locator(f'.river[data-player-id="{id}"] svg').count()==1
            assert '65枚' in page.locator('#wall-count').inner_text() and '14枚' in page.locator('#wall-count').inner_text()
            # Two more complete rounds prove selection becomes usable repeatedly.
            for turn_round in [2,3]:
                page.locator('#player-hand button').first.click()
                page.locator('#discard').click()
                page.clock.run_for(1000)
                await_human_turn(page)
                assert page.locator('#player-hand li').count()==14
                for id in [0,1,2,3]:
                    assert page.locator(f'.river[data-player-id="{id}"] svg').count()==turn_round
            assert page.evaluate('window.cpuDiscards')==[1,2,3]*3
            geometry(page)
            page.screenshot(path=f'{options.screenshots}/{w}-{source}-discarded.png',full_page=True)
        # Reset while a real CPU timer is pending. Its old result must never appear.
        if page.locator('#result-dialog').is_visible(): page.locator('#view-table').click()
        page.locator('#new-game').click();page.locator('#confirm-new-game').click()
        page.locator('#player-hand button').first.click()
        page.locator('#discard').click()
        if page.locator('#result-dialog').is_visible(): page.locator('#view-table').click()
        page.locator('#new-game').click();page.locator('#confirm-new-game').click()
        reset_indicator=dora_snapshot(page)
        reset_ids=page.locator('#player-hand li').evaluate_all('(els) => els.map(el => el.dataset.tileId)')
        page.clock.run_for(1100)
        assert page.locator('#player-hand li').evaluate_all('(els) => els.map(el => el.dataset.tileId)')==reset_ids
        assert page.locator('#player-hand li').count()==14 and page.locator('.river svg').count()==0
        assert dora_snapshot(page) == reset_indicator
        assert '69枚' in page.locator('#wall-count').inner_text()
        page.screenshot(path=f'{options.screenshots}/{w}-initial.png',full_page=True)
        # Clock control skips presentation time, without exposing private state to DOM.
        previous_rivers = [[] for _ in range(4)]
        for turn_round in range(18):
            toolbar_check = turn_round == 17 and w in [375,390]
            if toolbar_check:
                page.set_viewport_size({'width':w,'height':h-120})
                # Scroll the document to expose hand and controls together.
                page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)')
            page.locator('#player-hand button').first.click()
            if toolbar_check:
                geometry(page)
                controls_visible(page)
                assert page.locator('#discard').is_enabled()
                assert separate(box(page,'#player-hand'),box(page,'.discard-controls'))
                page.screenshot(path=f'{options.screenshots}/{w}-toolbar-selected-viewport.png')
            page.locator('#discard').click()
            if toolbar_check:
                page.set_viewport_size({'width':w,'height':h})
            page.clock.run_for(1000)
            if turn_round < 17:
                await_human_turn(page)
                assert page.locator('#player-hand li').count()==14
                assert page.locator('#player-hand button:enabled').count()==14
            geometry(page)
            if turn_round == 16:
                page.locator('#player-hand button').first.click()
                page.locator('#discard' if page.locator('#discard').is_visible() else '#show-result').scroll_into_view_if_needed()
                controls_visible(page)
                page.screenshot(path=f'{options.screenshots}/{w}-late-selected-viewport.png')
                page.locator('#player-hand button').first.click()
            current_rivers = [page.locator(f'.river[data-player-id="{id}"] [data-tile-id]').evaluate_all(
                '(els) => els.map(el => el.dataset.tileId)') for id in range(4)]
            for previous, current in zip(previous_rivers, current_rivers):
                assert current[:len(previous)] == previous, (previous, current)
            previous_rivers = current_rivers
            if turn_round == 6:
                assert [page.locator(f'.river[data-player-id="{id}"] svg').count() for id in range(4)] == [7]*4
                page.screenshot(path=f'{options.screenshots}/{w}-midgame.png',full_page=True)
            if turn_round == 7:
                assert [page.locator(f'.river[data-player-id="{id}"] svg').count() for id in range(4)] == [8]*4
                page.screenshot(path=f'{options.screenshots}/{w}-midgame-8.png',full_page=True)
        # All rivers must be simultaneously in view on the requested larger screens.
        page.evaluate('window.scrollTo(0,0)')
        if w != 320:
            controls_visible(page)
        if w != 320:
            assert all(b['y'] >= 0 and b['y']+b['height'] <= h for b in
                       [box(page,f'.river-{name}') for name in ['top','right','bottom','left']])
        print(json.dumps({'viewport':[w,h], 'pageVerticalScroll':page.evaluate('document.documentElement.scrollHeight > innerHeight')}))
        assert dora_snapshot(page) == reset_indicator
        assert page.locator('#result-dialog').is_visible()
        page.locator('#view-table').click()
        assert '牌山がなくなりました' in page.locator('#selection-status').text_content()
        assert '生きた牌山 0枚' in page.locator('#wall-count').inner_text()
        assert '王牌 14枚' in page.locator('#wall-count').inner_text()
        assert page.locator('#player-hand li').count()==13
        assert page.locator('#player-hand button:enabled').count()==0
        assert page.locator('#discard').is_disabled()
        assert [page.locator(f'.river[data-player-id="{id}"] svg').count() for id in [0,1,2,3]]==[18,18,17,17]
        river_ids=page.locator('.river [data-tile-id]').evaluate_all('(els) => els.map(el => el.dataset.tileId)')
        assert len(set(river_ids))==70
        page.locator('#discard' if page.locator('#discard').is_visible() else '#show-result').scroll_into_view_if_needed()
        controls_visible(page)
        page.screenshot(path=f'{options.screenshots}/{w}-exhausted.png',full_page=True)
        page.screenshot(path=f'{options.screenshots}/{w}-exhausted-viewport.png')
        # Approximate browser chrome with 120px less usable height, then resize back.
        if w in [375,390]:
            page.set_viewport_size({'width':w,'height':h-120})
            page.locator('#discard' if page.locator('#discard').is_visible() else '#show-result').scroll_into_view_if_needed()
            controls_visible(page)
            geometry(page)
            page.screenshot(path=f'{options.screenshots}/{w}-toolbar-viewport.png')
            page.set_viewport_size({'width':w,'height':h})
        page.evaluate('document.querySelector("#discard").click()')
        page.clock.run_for(2000)
        assert page.locator('.river svg').count()==70
        # Rendering-only capacity fixture: normal wall exhaustion leaves CPU2/3 at 17.
        # Clone the public tile into their last cell without changing game state.
        page.evaluate('''() => {
            for (const id of [2,3]) {
                const river = document.querySelector(`.river[data-player-id="${id}"]`);
                const tile = river.lastElementChild.cloneNode(true);
                tile.dataset.tileId = `capacity-${id}`;
                tile.style.gridRow = id === 2 ? '1' : '6';
                tile.style.gridColumn = '1';
                river.append(tile);
            }
        }''')
        assert [page.locator(f'.river[data-player-id="{id}"] svg').count() for id in range(4)] == [18]*4
        geometry(page)
        page.screenshot(path=f'{options.screenshots}/{w}-capacity-18.png',full_page=True)
        if page.locator('#result-dialog').is_visible(): page.locator('#view-table').click()
        page.locator('#new-game').click();page.locator('#confirm-new-game').click()
        assert page.locator('#player-hand li').count()==14 and page.locator('.river svg').count()==0
        page.locator('#player-hand button').first.click()
        assert page.locator('#discard').is_enabled()
        if page.locator('#result-dialog').is_visible(): page.locator('#view-table').click()
        page.locator('#new-game').click();page.locator('#confirm-new-game').click()
        assert page.locator('#discard').is_disabled()
        assert not errors, errors
        print(json.dumps({'viewport':[w,h],'drawn':'pass','hand':'pass','resetDuringCPU':'pass','keyboard':'pass','geometry':'pass','cpuOrder':'pass','multipleRounds':'pass','wallExhaustion':'pass','concealment':'pass','pageErrors':errors}))
        page.close()
    if options.tsumo_fixture or options.only_tsumo_fixture:
        # Replace the module's injected start factory in the test browser only.
        # Production source/bundle has no fixture import, globals or cheat controls.
        def inject(route):
            response = route.fetch()
            source = response.text()
            source, count = re.subn(r'new GameController\((?:undefined|void 0),', 'new GameController(() => fixtureStart(),', source)
            assert count == 1
            # Deterministic tsumogiri preserves the two intended human winning draws.
            source = source.replace('onChange: render', 'chooseDiscard: p => p.drawnTile.id, onChange: render')
            source = '''let fixtureStarts = 0;
import { tsumoStart, RED_PINFU } from "/heibon-mahjong/tests/tsumo-fixture.ts";
// Keep the human's next winning draw and indicators, but distribute the other
// physical tiles deterministically. The old sorted CPU hands could ron each
// other before the human draw after automatic CPU ron was introduced.
function fixtureStart() {
 const g=tsumoStart(RED_PINFU,false,undefined,fixtureStarts++ % 2 ? "sou-8" : "man-4");
 const winning=g.liveWall[3], repeatWinning=g.liveWall[7];
 const pool=[...g.players.slice(1).flatMap(p=>p.hand),...g.liveWall.filter((_,i)=>i!==3&&i!==7)];
 let seed=1;
 for(let i=pool.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=Math.floor(seed/4294967296*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 const players=g.players.map((p,i)=>i?{...p,hand:pool.splice(0,13)}:p);
 pool.splice(3,0,winning);
 pool.splice(7,0,repeatWinning);
 return {...g,players,liveWall:pool};
}
''' + source
            route.fulfill(response=response, body=source)
        for w,h in [(320,568),(375,667),(390,844),(414,896),(1280,800)]:
            page=browser.new_page(viewport={'width':w,'height':h})
            page.route('**/src/main.ts', inject)
            page.goto(options.url)
            assert page.locator('#tsumo').is_disabled()
            assert page.locator('#dora-indicators svg').get_attribute('aria-label') == 'ドラ表示牌：4萬'
            assert 'ドラ：5萬' in page.locator('#dora-indicators').text_content().replace('\n', '')
            initial_indicator=dora_snapshot(page)
            page.locator('.drawn-tile button').click()
            page.locator('#discard').click()
            assert page.locator('#tsumo').is_disabled()
            page.wait_for_function('!document.querySelector("#tsumo").disabled')
            assert page.locator('#player-hand li').count()==14
            draw_id=page.locator('.drawn-tile button').get_attribute('data-tile-id')
            page.locator('#player-hand button').first.click()
            assert page.locator('#tsumo').is_enabled()
            geometry(page)
            page.screenshot(path=f'{options.screenshots}/{w}-tsumo-eligible.png',full_page=True)
            # Reduce usable height, scroll naturally and check both tap targets.
            page.set_viewport_size({'width':w,'height':h-120})
            page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)')
            page.locator('#tsumo').scroll_into_view_if_needed()
            assert separate(box(page,'#player-hand'),box(page,'.discard-controls'))
            controls_visible(page)
            geometry(page)
            page.screenshot(path=f'{options.screenshots}/{w}-tsumo-toolbar.png')
            rivers=page.locator('.river').evaluate_all('(els)=>els.map(el=>el.innerHTML)')
            wall=page.locator('#wall-count').inner_text().splitlines()[:2]
            ids=page.locator('#player-hand li').evaluate_all('(els)=>els.map(el=>el.dataset.tileId)')
            page.locator('#tsumo').click()
            page.evaluate('document.querySelector("#tsumo").click()')
            assert page.locator('#win-result').is_visible()
            result=page.locator('#win-result').inner_text()
            assert all(text in result for text in ['ツモ和了！','自分（東）','門前清自摸和 1翻','平和 1翻','役合計：2翻','通常ドラ：1枚（1翻）','赤ドラ：2枚（2翻）','合計：5翻','今回対応している役','獲得点数：'])
            assert dora_snapshot(page) == initial_indicator
            assert '通常ドラ' not in page.locator('#win-result ul').first.inner_text()
            assert '赤ドラ' not in page.locator('#win-result ul').first.inner_text()
            assert page.locator('.drawn-tile button').get_attribute('data-tile-id')==draw_id
            assert page.locator('#player-hand li').evaluate_all('(els)=>els.map(el=>el.dataset.tileId)')==ids
            assert page.locator('[aria-pressed="true"]').count()==0
            assert page.locator('#discard').is_disabled() and page.locator('#tsumo').is_disabled()
            assert page.locator('#player-hand button:enabled').count()==0
            page.evaluate('document.querySelector("#discard").click()')
            page.wait_for_timeout(1100)
            assert page.locator('.river').evaluate_all('(els)=>els.map(el=>el.innerHTML)')==rivers
            assert page.locator('#wall-count').inner_text().splitlines()[:2]==wall
            geometry(page)
            page.set_viewport_size({'width':w,'height':h})
            page.screenshot(path=f'{options.screenshots}/{w}-tsumo-won.png',full_page=True)
            if page.locator('#result-dialog').is_visible(): page.locator('#view-table').click()
            page.locator('#new-game').click();page.locator('#confirm-new-game').click()
            assert page.locator('#dora-indicators svg').get_attribute('aria-label') == 'ドラ表示牌：8索'
            assert 'ドラ：9索' in page.locator('#dora-indicators').text_content().replace('\n', '')
            assert dora_snapshot(page) != initial_indicator
            assert page.locator('#win-result').is_hidden()
            assert page.locator('#tsumo').is_disabled()
            assert page.locator('#player-hand li').count()==14
            assert page.locator('.river svg').count()==0
            page.locator('.drawn-tile button').click()
            page.locator('#discard').click()
            page.wait_for_function('!document.querySelector("#tsumo").disabled')
            # Choosing an ordinary discard remains supported at the winning position.
            page.locator('.drawn-tile button').click()
            page.locator('#discard').click()
            assert page.locator('#tsumo').is_disabled()
            page.wait_for_function('!document.querySelector("#tsumo").disabled')
            assert page.locator('.river-bottom svg').count()==2
            print(json.dumps({'viewport':[w,h],'tsumoUI':'pass','selectionIndependent':'pass','wonStops':'pass','reset':'pass','toolbar':'pass','optionalDiscard':'pass'}))
            page.close()
    browser.close()
