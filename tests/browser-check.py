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
    assert separate(box(page,'.river-bottom'),box(page,'.center-info'))
    control=box(page,'#discard')
    assert control['width']>=44 and control['height']>=44
    selected=page.locator('[aria-pressed="true"]')
    if selected.count():
        assert separate(selected.bounding_box(),box(page,'#label-0'))
        assert separate(selected.bounding_box(),box(page,'.rivers'))
    for id in [1,2,3]:
        assert page.locator(f'#hand-{id} .tile-back').count()==13
        assert page.locator(f'#hand-{id} svg, #hand-{id} [data-tile-id], #hand-{id} [aria-label]').count()==0
        assert page.locator(f'.river[data-player-id="{id}"]').locator('*').count()==0
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('chromium-browser'),args=['--no-sandbox'])
    for w,h in [(320,568),(375,667),(390,844),(1280,800)]:
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
            assert '打牌完了' in page.locator('#selection-status').inner_text()
            assert '69枚' in page.locator('#wall-count').inner_text() and '14枚' in page.locator('#wall-count').inner_text()
            geometry(page)
            page.screenshot(path=f'{options.screenshots}/{w}-{source}-discarded.png',full_page=True)
        page.locator('#new-game').click()
        assert page.locator('#player-hand li').count()==14 and page.locator('.river svg').count()==0
        assert page.locator('#discard').is_disabled()
        assert not errors, errors
        print(json.dumps({'viewport':[w,h],'drawn':'pass','hand':'pass','reset':'pass','keyboard':'pass','geometry':'pass','pageErrors':errors}))
        page.close()
    browser.close()
