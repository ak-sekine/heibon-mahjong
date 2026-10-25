import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
reports = []
errors = []
concealed_hand_counts = {17: 8, 18: 5, 19: 8, 23: 2}

def verify_cpu1_river_geometry(page, width, stage):
    metrics = page.evaluate('''() => {
      const rect = element => {
        const r = element.getBoundingClientRect();
        return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
      };
      const table = rect(document.querySelector('#local-table'));
      const center = rect(document.querySelector('#local-table .center-info'));
      const cpu1 = [...document.querySelectorAll('.river[data-player-id="1"] .river-tile .tile-svg')].map(element => ({
        face: rect(element),
        cell: rect(element.parentElement),
        row: element.parentElement.dataset.riverRow,
        column: element.parentElement.dataset.riverColumn,
        declaration: element.parentElement.dataset.riichiDeclaration === 'true',
        transform: getComputedStyle(element).transform,
      }));
      const others = [...document.querySelectorAll('.river:not([data-player-id="1"]) .river-tile .tile-svg')].map(rect);
      const cpu1Seat = [...document.querySelectorAll('.seat[data-player-id="1"] .concealed-hand .tile-back,.seat[data-player-id="1"] .open-melds .tile-svg')].map(rect);
      return {table,center,cpu1,others,cpu1Seat,riverRows:document.querySelector('.river[data-player-id="1"]').dataset.riverRows};
    }''')
    assert len(metrics['cpu1']) in (18, 19, 20), (width, stage, len(metrics['cpu1']))
    table = metrics['table']
    faces = [entry['face'] for entry in metrics['cpu1']]

    def overlaps(a, b):
        return a['x'] < b['right'] - .5 and a['right'] > b['x'] + .5 and a['y'] < b['bottom'] - .5 and a['bottom'] > b['y'] + .5

    for index, face in enumerate(faces):
        assert face['x'] >= table['x'] - 1 and face['y'] >= table['y'] - 1 and face['right'] <= table['right'] + 1 and face['bottom'] <= table['bottom'] + 1, (width, stage, 'tile outside table', index, face, table)
        assert not overlaps(face, metrics['center']), (width, stage, 'tile overlaps table center', index, face, metrics['center'])
        assert not any(overlaps(face, other) for other in metrics['others']), (width, stage, 'tile overlaps another river', index, face)
        assert not any(overlaps(face, other) for other in metrics['cpu1Seat']), (width, stage, 'tile overlaps CPU1 hand or melds', index, face)
        assert not any(overlaps(face, other) for other in faces[index + 1:]), (width, stage, 'CPU1 river tiles overlap', index)

    last = metrics['cpu1'][-1]
    transform = last['transform']
    orientation = page.evaluate('''transform => {
      const m = new DOMMatrix(transform);
      return ((Math.atan2(m.b,m.a) * 180 / Math.PI) % 360 + 360) % 360;
    }''', transform)
    expected = 0 if last['declaration'] else 270
    delta = abs(((orientation - expected + 180) % 360) - 180)
    assert delta < 1, (width, stage, 'unexpected CPU1 tile orientation', orientation, expected, last)
    return metrics

with sync_playwright() as playwright:
    browser = getattr(playwright, browser_name).launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.on('pageerror', lambda error: errors.append(str(error)))

    viewports = [(320, 568), (355, 812), (375, 812), (390, 844), (430, 932)]
    for width, height in viewports:
        page.set_viewport_size({'width': width, 'height': height})
        page.goto(base + 'test.html?debug=river')
        page.wait_for_selector('#river-test-badge', state='visible')
        assert page.locator('#scenario').input_value() == 'river-test'
        assert page.locator('#river-count').input_value() == '18'

        for start_count in [17, 18, 19, 23]:
            page.locator('#river-count').select_option(str(start_count))
            page.locator('#start-river-test').click()
            river = page.locator('.river[data-player-id="0"]')
            assert river.locator('.river-tile').count() == start_count, (width, start_count)
            assert page.locator('#player-hand button[data-tile-id]').count() == concealed_hand_counts[start_count]

            drawn = page.locator('#player-hand li.drawn-tile button[data-tile-id]')
            assert drawn.count() == 1, (width, start_count, 'drawn tile missing')
            drawn.click()
            discard = page.locator('[data-panel-part="discard"]')
            assert discard.is_enabled(), (width, start_count, 'discard remained disabled')
            discard.click()
            river.locator(f'.river-tile').nth(start_count).wait_for(state='attached', timeout=5000)
            assert river.locator('.river-tile').count() == start_count + 1, (width, start_count)
            if start_count + 1 >= 19:
                newest = river.locator('.river-tile').nth(start_count)
                assert newest.get_attribute('data-river-row') == '3', (width, start_count, 'not on fourth row')

            if start_count == 18:
                page.wait_for_function(f'''() => document.querySelector('#player-hand').children.length === {concealed_hand_counts[18]} &&
                  document.querySelector('#label-0')?.dataset.active === 'true' ''', timeout=5000)
                # The active-turn label and restored drawn tile show that CPU processing
                # returned control after the next human draw.
                assert page.locator('#player-hand button[data-tile-id]').count() == concealed_hand_counts[18]
                drawn = page.locator('#player-hand li.drawn-tile button[data-tile-id]')
                drawn.click()
                discard.click()
                river.locator('.river-tile').nth(19).wait_for(state='attached', timeout=5000)
                assert river.locator('.river-tile').count() == 20, (width, '20th discard')
                assert river.locator('.river-tile').nth(19).get_attribute('data-river-row') == '3'

            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'horizontal overflow')
            reports.append({'width': width, 'start': start_count, 'result': start_count + 1,
                            'riverRows': river.get_attribute('data-river-rows')})

        cpu1 = page.locator('.river[data-player-id="1"]')
        page.locator('#river-count').select_option('cpu1-18')
        page.locator('#start-river-test').click()
        page.wait_for_function("document.querySelector('.river[data-player-id=\\\"1\\\"]')?.children.length === 18 && document.querySelector('#label-1')?.dataset.active === 'true'")
        assert cpu1.locator('.river-tile').count() == 18, (width, 'CPU1 initial river')
        initial_positions = cpu1.locator('.river-tile').evaluate_all('els=>els.map(e=>{const r=e.querySelector("svg").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})')
        initial_metrics = verify_cpu1_river_geometry(page, width, '18')
        initial_counts = {seat: page.locator(f'.river[data-player-id="{seat}"] .river-tile').count() for seat in (2, 3)}
        page.wait_for_function("document.querySelector('.river[data-player-id=\\\"1\\\"]')?.children.length === 19", timeout=15000)
        assert cpu1.locator('.river-tile').count() == 19, (width, 'CPU1 19th discard')
        newest = cpu1.locator('.river-tile').nth(18)
        assert (newest.get_attribute('data-river-row'), newest.get_attribute('data-river-column')) == ('5', '2'), (width, 'CPU1 19th tile eighth-column third lane')
        after_positions = cpu1.locator('.river-tile').evaluate_all('els=>els.slice(0,18).map(e=>{const r=e.querySelector("svg").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})')
        initial_origin = initial_positions[0]
        after_origin = after_positions[0]
        assert all(
            abs((before[0] - initial_origin[0]) - (after[0] - after_origin[0])) < .1 and
            abs((before[1] - initial_origin[1]) - (after[1] - after_origin[1])) < .1 and
            all(abs(before[axis] - after[axis]) < .1 for axis in (2, 3))
            for before,after in zip(initial_positions,after_positions)
        ), (width, 'CPU1 original 18 tile arrangement changed')
        cpu1_metrics = verify_cpu1_river_geometry(page, width, '19')
        assert cpu1_metrics['riverRows'] == '3', (width, 'CPU1 river did not remain within three lanes', cpu1_metrics['riverRows'])
        page.wait_for_function("document.querySelector('#label-0')?.dataset.active === 'true' && document.querySelector('.river[data-player-id=\\\"2\\\"] .river-tile')?.parentElement.children.length > 0", timeout=15000)
        assert all(page.locator(f'.river[data-player-id="{seat}"] .river-tile').count() > count for seat,count in initial_counts.items()), (width, 'normal next CPU turns did not progress')
        page.wait_for_function("document.querySelector('#test-status')?.textContent.includes('19枚目')", timeout=5000)
        drawn = page.locator('#player-hand li.drawn-tile button[data-tile-id]')
        assert drawn.count() == 1, (width, 'human turn did not receive its legal draw')
        drawn.click()
        page.locator('[data-panel-part="discard"]').click()
        page.wait_for_function("document.querySelector('.river[data-player-id=\\\"1\\\"]')?.children.length === 20", timeout=15000)
        assert cpu1.locator('.river-tile').count() == 20, (width, 'CPU1 20th discard')
        twentieth = cpu1.locator('.river-tile').nth(19)
        assert (twentieth.get_attribute('data-river-row'), twentieth.get_attribute('data-river-column')) == ('4', '2'), (width, 'CPU1 20th tile eighth-column third lane')
        verify_cpu1_river_geometry(page, width, '20')
        assert '19枚目' in page.locator('#test-status').inner_text(), (width, 'CPU1 completion status missing')
        if width == 390:
            screenshot_dir = os.environ.get('HEIBON_SCREENSHOTS')
            if screenshot_dir:
                os.makedirs(screenshot_dir, exist_ok=True)
                page.screenshot(path=os.path.join(screenshot_dir, 'cpu1-river-19-390.png'), full_page=True)
        reports.append({'width': width, 'target': 'CPU1 right', 'start': 18, 'result': 19,
                        'fourthLine': [newest.get_attribute('data-river-row'), newest.get_attribute('data-river-column')],
                        'initialRiverRows': initial_metrics['riverRows'], 'riverRows': cpu1_metrics['riverRows'],
                        'cpu1TwentiethTile': [twentieth.get_attribute('data-river-row'), twentieth.get_attribute('data-river-column')],
                        'geometry': '18/19/20 table bounds, center, peer rivers and self overlap clear'})

    assert page.locator('#river-count option:disabled').count() == 2
    page.goto(base)
    page.locator('#main-menu-toggle').click()
    assert page.locator('#river-test-open').is_visible(), 'development menu does not expose 河テスト'
    page.locator('#river-test-open').click()
    page.wait_for_function("location.pathname.endsWith('/test.html') && location.search === '?debug=river'")
    assert page.locator('#online-match').count() == 0, 'river test page must not mount online gameplay'
    assert not errors, errors
    print(json.dumps({'browser': browser_name, 'riverTest': reports, 'developmentMenu': 'pass',
                      'onlineSeparation': 'pass', 'pageErrors': errors}, ensure_ascii=False))
    browser.close()
