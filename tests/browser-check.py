from playwright.sync_api import sync_playwright
import json
import argparse
import pathlib
import shutil
import tempfile

parser = argparse.ArgumentParser(description="Optional Chromium check (requires Python Playwright and Chromium)")
parser.add_argument("--url", default="http://localhost:4173/quill-mahjong/")
parser.add_argument("--screenshots", default=str(pathlib.Path(tempfile.gettempdir()) / "quill-screenshots"))
options = parser.parse_args()
pathlib.Path(options.screenshots).mkdir(parents=True, exist_ok=True)

def box(page, selector):
    return page.locator(selector).bounding_box()
def separate(a,b):
    return a['x']+a['width']<=b['x'] or b['x']+b['width']<=a['x'] or a['y']+a['height']<=b['y'] or b['y']+b['height']<=a['y']
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
            assert tile['width'] >= 20 and tile['height'] >= 28, tile
            assert tile['x'] >= 0 and tile['x']+tile['width'] <= page.viewport_size['width'], tile
            if i:
                previous = tiles[i-1]
                if i % river['columns']:
                    assert abs(tile['y']-previous['y']) < .5 and tile['x'] > previous['x']
                else:
                    assert tile['y'] > previous['y'] and abs(tile['x']-tiles[0]['x']) < .5
    assert separate(box(page,'#player-hand'),box(page,'.rivers'))
    control=box(page,'#discard')
    assert control['width']>=44 and control['height']>=44
    selected=page.locator('[aria-pressed="true"]')
    if selected.count():
        assert separate(selected.bounding_box(),box(page,'#label-0'))
        assert separate(selected.bounding_box(),box(page,'.rivers'))
    for id in [1,2,3]:
        assert page.locator(f'#hand-{id} .tile-back').count() in [13,14]
        assert page.locator(f'#hand-{id} svg, #hand-{id} [data-tile-id], #hand-{id} [aria-label]').count()==0
        assert page.locator(f'#hand-{id}').evaluate('(el) => !el.innerHTML.includes("data-tile-id") && !el.innerHTML.includes("<svg")')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('chromium-browser'),args=['--no-sandbox'])
    for w,h in [(320,568),(375,667),(390,844),(414,896),(1280,800)]:
        page=browser.new_page(viewport={'width':w,'height':h})
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.goto(options.url)
        for source in ['drawn','hand']:
            page.locator('#new-game').click()
            assert page.locator('#player-hand li').count()==14
            assert page.locator('.river svg').count()==0
            assert page.locator('#discard').is_disabled()
            assert page.locator('[aria-pressed="true"]').count()==0
            geometry(page)
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
            page.wait_for_function('document.querySelector("#player-hand button:enabled") !== null')
            assert page.locator('#player-hand li').count()==14
            assert page.evaluate('window.cpuDiscards')==[1,2,3]
            assert page.locator('#label-0').get_attribute('data-active')=='true'
            for id in [1,2,3]:
                assert page.locator(f'.river[data-player-id="{id}"] svg').count()==1
                assert page.locator(f'#hand-{id} .tile-back').count()==13
            assert '65枚' in page.locator('#wall-count').inner_text() and '14枚' in page.locator('#wall-count').inner_text()
            # Two more complete rounds prove selection becomes usable repeatedly.
            for turn_round in [2,3]:
                page.locator('#player-hand button').first.click()
                page.locator('#discard').click()
                page.wait_for_function('document.querySelector("#player-hand button:enabled") !== null')
                assert page.locator('#player-hand li').count()==14
                for id in [0,1,2,3]:
                    assert page.locator(f'.river[data-player-id="{id}"] svg').count()==turn_round
            assert page.evaluate('window.cpuDiscards')==[1,2,3]*3
            geometry(page)
            page.screenshot(path=f'{options.screenshots}/{w}-{source}-discarded.png',full_page=True)
        # Reset while a real CPU timer is pending. Its old result must never appear.
        page.locator('#new-game').click()
        page.locator('#player-hand button').first.click()
        page.locator('#discard').click()
        page.locator('#new-game').click()
        reset_ids=page.locator('#player-hand li').evaluate_all('(els) => els.map(el => el.dataset.tileId)')
        page.wait_for_timeout(1100)
        assert page.locator('#player-hand li').evaluate_all('(els) => els.map(el => el.dataset.tileId)')==reset_ids
        assert page.locator('#player-hand li').count()==14 and page.locator('.river svg').count()==0
        assert '69枚' in page.locator('#wall-count').inner_text()
        page.screenshot(path=f'{options.screenshots}/{w}-initial.png',full_page=True)
        # Clock control skips presentation time, without exposing private state to DOM.
        page.clock.install()
        previous_rivers = [[] for _ in range(4)]
        for turn_round in range(18):
            page.locator('#player-hand button').first.click()
            page.locator('#discard').click()
            page.clock.run_for(1000)
            if turn_round < 17:
                assert page.locator('#player-hand li').count()==14
                assert page.locator('#player-hand button:enabled').count()==14
            geometry(page)
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
            assert all(b['y'] >= 0 and b['y']+b['height'] <= h for b in
                       [box(page,f'.river-{name}') for name in ['top','right','bottom','left']])
        print(json.dumps({'viewport':[w,h], 'pageVerticalScroll':page.evaluate('document.documentElement.scrollHeight > innerHeight')}))
        assert '牌山がなくなりました' in page.locator('#selection-status').inner_text()
        assert '生きた牌山 0枚' in page.locator('#wall-count').inner_text()
        assert '王牌 14枚' in page.locator('#wall-count').inner_text()
        assert page.locator('#player-hand li').count()==13
        assert page.locator('#player-hand button:enabled').count()==0
        assert page.locator('#discard').is_disabled()
        assert [page.locator(f'.river[data-player-id="{id}"] svg').count() for id in [0,1,2,3]]==[18,18,17,17]
        river_ids=page.locator('.river [data-tile-id]').evaluate_all('(els) => els.map(el => el.dataset.tileId)')
        assert len(set(river_ids))==70
        page.screenshot(path=f'{options.screenshots}/{w}-exhausted.png',full_page=True)
        page.evaluate('document.querySelector("#discard").click()')
        page.clock.run_for(2000)
        assert page.locator('.river svg').count()==70
        page.locator('#new-game').click()
        assert page.locator('#player-hand li').count()==14 and page.locator('.river svg').count()==0
        page.locator('#player-hand button').first.click()
        assert page.locator('#discard').is_enabled()
        page.locator('#new-game').click()
        assert page.locator('#discard').is_disabled()
        assert not errors, errors
        print(json.dumps({'viewport':[w,h],'drawn':'pass','hand':'pass','resetDuringCPU':'pass','keyboard':'pass','geometry':'pass','cpuOrder':'pass','multipleRounds':'pass','wallExhaustion':'pass','concealment':'pass','pageErrors':errors}))
        page.close()
    browser.close()
