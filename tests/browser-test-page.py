import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
errors = []
with sync_playwright() as playwright:
    browser_type = getattr(playwright, os.environ.get('HEIBON_BROWSER', 'chromium'))
    browser = browser_type.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + 'test.html')
    assert page.locator('.test-badge').inner_text() == 'TEST'
    assert page.locator('#player-hand button').count() == 14
    assert page.locator('.concealed-hand .revealed-tile').count() == 0
    assert page.locator('#kyuushu').is_visible()
    page.locator('#kyuushu').click()
    page.wait_for_function("document.querySelector('#round-result-summary').innerText.includes('九種九牌')")
    expected_order = ['1萬', '2萬', '3萬', '4萬', '9萬', '1筒', '2筒', '3筒', '9筒', '1索', '9索', '東', '南', '西']
    page.locator('#repeat-scenario').click()
    assert page.locator('#player-hand button').count() == 14, 'repeat did not restore the same initial hand'
    page.locator('#kyuushu').click()
    page.wait_for_function("document.querySelector('#round-result-summary').innerText.includes('九種九牌')")
    assert page.locator('#next-round').is_visible(), 'replayed declaration did not settle normally'
    page.locator('#next-round').click()
    page.wait_for_function("document.querySelector('#round-result-summary').hidden")

    cases = [('kyuushu-self', 0, '自分'), ('kyuushu-cpu1', 1, 'CPU1'),
             ('kyuushu-cpu2', 2, 'CPU2'), ('kyuushu-cpu3', 3, 'CPU3')]
    for scenario, seat, name in cases:
        if scenario != 'kyuushu-self':
            page.locator('#scenario').select_option(scenario)
            page.locator('#load-scenario').click()
            page.wait_for_function("document.querySelector('#test-status').innerText.includes('CPUの第一ツモ処理を実行中')")
            assert page.locator('.revealed-tile').count() == 0, scenario + ': concealed hand exposed before declaration'
            page.wait_for_function('''seat => document.querySelectorAll('.revealed-tile').length === 14 &&
                document.querySelector('#round-result-summary').innerText.includes('九種九牌')''', seat)
        assert page.locator('.revealed-tile').count() == 14, scenario
        for other_seat in range(1, 4):
            if other_seat != seat:
                assert page.locator(f'.concealed-hand[data-player-id="{other_seat}"] .revealed-tile').count() == 0, scenario
        declarer_selector = '#player-hand' if seat == 0 else f'.concealed-hand[data-player-id="{seat}"]'
        labels = page.locator(f'{declarer_selector} .tile-svg').evaluate_all('(tiles) => tiles.map(tile => tile.getAttribute("aria-label"))')
        assert labels == expected_order, (scenario, 'table tile order', labels)
        for width in [320, 375, 390, 430]:
            page.set_viewport_size({'width': width, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (scenario, width, 'horizontal overflow')
            assert page.locator('.test-actions button').first.evaluate('(el) => el.getBoundingClientRect().height >= 44'), (scenario, width, 'small tap target')
        page.locator('#show-result').click()
        assert page.locator('#result-title').inner_text() == '途中流局（九種九牌）'
        assert page.locator('#match-result .winning-hand li').count() == 14, scenario
        result_order = page.locator('#match-result .winning-hand svg').evaluate_all('(tiles) => tiles.map(tile => tile.getAttribute("aria-label"))')
        assert result_order == expected_order, (scenario, 'result tile order', result_order)
        details = page.locator('#match-result').inner_text()
        assert f'宣言者：{name}' in details, details
        page.locator('#view-table').click()
        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), scenario
        page.locator('#view-table').click()
        page.locator('#next-round').click()
        page.wait_for_function("document.querySelector('#round-result-summary').hidden")
        assert page.locator('.revealed-tile').count() == 0, scenario

    page.goto(base)
    assert page.locator('.test-lab, #scenario, .test-badge').count() == 0, 'test controls leaked to regular entry'
    page.goto(base + 'kan-test.html')
    assert page.locator('#scenario option').count() == 6, 'kan verification page changed'
    assert not errors, errors
    print(json.dumps({'testPage': 'pass', 'scenarios': [case[0] for case in cases],
                      'widths': [320, 375, 390, 430], 'regularPageIsolation': 'pass',
                      'kanPage': 'pass'}, ensure_ascii=False))
    browser.close()
