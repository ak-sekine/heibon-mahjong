import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
reports = []
errors = []
concealed_hand_counts = {17: 8, 18: 5, 19: 8}

with sync_playwright() as playwright:
    browser = getattr(playwright, browser_name).launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.on('pageerror', lambda error: errors.append(str(error)))

    for width in [320, 375, 390, 430]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.goto(base + 'test.html?debug=river')
        page.wait_for_selector('#river-test-badge', state='visible')
        assert page.locator('#scenario').input_value() == 'river-test'
        assert page.locator('#river-count').input_value() == '18'

        for start_count in [17, 18, 19]:
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

    assert page.locator('#river-count option:disabled').count() == 3
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
