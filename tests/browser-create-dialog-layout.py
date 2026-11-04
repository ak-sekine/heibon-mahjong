"""Verify fixed-footers, isolated rule scrolling, and synchronized indicators."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
OUT = Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui')) / 'create-dialog-layout'
OUT.mkdir(parents=True, exist_ok=True)
VIEWPORTS = [[320, 568], [320, 320], [375, 667], [390, 844], [430, 932],
             [667, 375], [844, 390], [768, 1024], [1024, 768],
             [1280, 800], [1440, 900], [812, 375]]

with sync_playwright() as playwright:
    browser = getattr(playwright, ENGINE).launch()
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE_URL, wait_until='networkidle')

    def open_menu_item(selector):
        page.locator('#main-menu-toggle').click()
        page.locator(selector).click()

    def verify_cpu_difficulty_options(dialog_selector, name):
        options = page.locator(f'{dialog_selector} .cpu-difficulty-options')
        labels = options.locator('label')
        assert labels.count() == 3, f'{name} should show exactly three CPU difficulty options'
        assert [label.strip() for label in labels.all_text_contents()] == ['初級', '標準', '上級'], f'{name} difficulty labels changed'
        assert options.locator('small').count() == 0, f'{name} difficulty descriptions remain in the DOM'
        assert options.locator('input[type="radio"]').evaluate_all("inputs => inputs.map(input => input.value)") == ['beginner', 'standard', 'advanced']
        standard = options.locator('input[value="standard"]')
        assert standard.is_checked(), f'{name} CPU difficulty did not default to standard'
        assert all(label.evaluate('element => element.getBoundingClientRect().height >= 44') for label in labels.all()), f'{name} difficulty options are smaller than 44px'
        options.locator('input[value="advanced"]').check()
        assert options.locator('input[value="advanced"]').is_checked(), f'{name} advanced radio could not be selected'
        standard.check()
        assert standard.is_checked(), f'{name} standard radio could not be restored'

    def verify_dialog(dialog_selector, content_selector, footer_selector, action_selector, name):
        snapshots = []
        for width, height in VIEWPORTS:
            page.set_viewport_size({'width': width, 'height': height})
            page.locator(content_selector).evaluate("element => element.scrollTo({top: 0, behavior: 'auto'})")
            page.wait_for_function('''selectors => {
              const dialog=document.querySelector(selectors.dialog), content=dialog.querySelector(selectors.content);
              const indicator=dialog.querySelector('.dialog-scroll-indicator'), thumb=indicator.querySelector('span');
              const shouldShow=content.scrollHeight-content.clientHeight>1;
              const expectedHeight=Math.min(indicator.clientHeight,Math.max(20,indicator.clientHeight*content.clientHeight/content.scrollHeight));
              return indicator.hidden===!shouldShow && (!shouldShow || Math.abs(parseFloat(thumb.style.height||'0')-expectedHeight)<=1);
            }''', arg={'dialog':dialog_selector,'content':content_selector}, timeout=3000)
            layout = page.locator(dialog_selector).evaluate('''(dialog, selectors) => {
              const panel = dialog.querySelector('.dialog-scroll-panel');
              const content = dialog.querySelector(selectors.content);
              const footer = dialog.querySelector(selectors.footer);
              const action = dialog.querySelector(selectors.action);
              const indicator = panel.querySelector('.dialog-scroll-indicator');
              const thumb = indicator.querySelector('span');
              const rect = element => { const r = element.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}; };
              const expectedVisible = content.scrollHeight - content.clientHeight > 1;
              const contentBox = rect(content), panelBox = rect(panel), footerBox = rect(footer), dialogBox = rect(dialog);
              const contentStyle = getComputedStyle(content);
              const webkitScrollbarStyle = getComputedStyle(content, '::-webkit-scrollbar');
              return {dialog:dialogBox, panel:panelBox, content:contentBox, footer:footerBox, action:rect(action),
                clientHeight:content.clientHeight, scrollHeight:content.scrollHeight, scrollTop:content.scrollTop,
                overflowY:contentStyle.overflowY, scrollbarWidth:contentStyle.scrollbarWidth,
                webkitScrollbarDisplay:webkitScrollbarStyle.display,
                indicatorHidden:indicator.hidden, expectedVisible, trackHeight:indicator.clientHeight,
                thumbHeight:parseFloat(thumb.style.height || '0'), thumbTransform:thumb.style.transform,
                expectedThumbHeight:Math.min(indicator.clientHeight, Math.max(20, indicator.clientHeight * content.clientHeight / content.scrollHeight)),
                actionEnabled:!action.disabled, noHorizontalOverflow:document.documentElement.scrollWidth <= innerWidth && dialog.scrollWidth <= dialog.clientWidth};
            }''', {'content':content_selector, 'footer':footer_selector, 'action':action_selector})
            assert layout['dialog']['top'] >= 0 and layout['dialog']['bottom'] <= height, f'{name} dialog escaped {width}x{height}: {layout}'
            assert layout['content']['bottom'] <= layout['footer']['top'] + 0.5, f'{name} scroll viewport crossed its footer at {width}x{height}: {layout}'
            assert layout['panel']['bottom'] <= layout['footer']['top'] + 0.5, f'{name} panel crossed its footer at {width}x{height}: {layout}'
            assert layout['action']['top'] >= layout['footer']['top'] and layout['action']['bottom'] <= layout['footer']['bottom'], f'{name} action is outside the fixed footer: {layout}'
            assert layout['action']['height'] >= 44 and layout['actionEnabled'], f'{name} action is not tappable at {width}x{height}: {layout}'
            assert layout['overflowY'] == 'auto', f'{name} body must remain natively scrollable at {width}x{height}: {layout}'
            assert layout['scrollbarWidth'] == 'none', f'{name} native scrollbar is not hidden at {width}x{height}: {layout}'
            assert layout['webkitScrollbarDisplay'] == 'none', f'{name} WebKit scrollbar is not hidden at {width}x{height}: {layout}'
            assert layout['indicatorHidden'] == (not layout['expectedVisible']), f'{name} indicator visibility disagrees with scrolling at {width}x{height}: {layout}'
            if layout['expectedVisible']:
                assert abs(layout['thumbHeight'] - layout['expectedThumbHeight']) <= 1, f'{name} indicator size disagrees with the visible content ratio: {layout}'
            assert layout['noHorizontalOverflow'], f'{name} has horizontal overflow at {width}x{height}: {layout}'

            if width == 320 and height == 320:
                assert layout['expectedVisible'], f'{name} should scroll at the compact viewport: {layout}'
                initial_thumb = layout['thumbTransform']
                page.locator(content_selector).evaluate('element => element.scrollTo({top: element.scrollHeight, behavior: "auto"})')
                page.wait_for_timeout(20)
                bottom = page.locator(dialog_selector).evaluate(r'''(dialog, selectors) => {
                  const content=dialog.querySelector(selectors.content), indicator=dialog.querySelector('.dialog-scroll-indicator');
                  const thumb=indicator.querySelector('span'), footer=dialog.querySelector(selectors.footer), action=dialog.querySelector(selectors.action);
                  const last=content.querySelector('.confirmed-rule-row:last-child');
                  const lastBox=last.getBoundingClientRect(), contentBox=content.getBoundingClientRect();
                  const maxScroll=content.scrollHeight-content.clientHeight;
                  const thumbHeight=parseFloat(thumb.style.height), trackHeight=indicator.clientHeight;
                  const expectedTop=(trackHeight-thumbHeight)*content.scrollTop/maxScroll;
                  const actualTop=parseFloat((thumb.style.transform.match(/translateY\(([-0-9.]+)px\)/)||[])[1]||'0');
                  return {scrollTop:content.scrollTop,maxScroll,contentBottom:contentBox.bottom,lastBottom:lastBox.bottom,
                    footerTop:footer.getBoundingClientRect().top,actionTop:action.getBoundingClientRect().top,
                    expectedTop,actualTop,thumbHeight,trackHeight,indicatorHidden:indicator.hidden};
                }''', {'content':content_selector, 'footer':footer_selector, 'action':action_selector})
                assert bottom['maxScroll'] > 0 and bottom['scrollTop'] >= bottom['maxScroll'] - 1, f'{name} last rule cannot be reached: {bottom}'
                assert bottom['lastBottom'] <= bottom['contentBottom'] + 1, f'{name} last rule is clipped: {bottom}'
                assert bottom['contentBottom'] <= bottom['footerTop'] + 0.5, f'{name} rules extend behind its footer: {bottom}'
                assert abs(bottom['actualTop'] - bottom['expectedTop']) <= 1, f'{name} indicator does not follow the scroll position: {bottom}'
                assert bottom['thumbHeight'] >= 20 and not bottom['indicatorHidden'], f'{name} indicator thumb is missing: {bottom}'
                assert bottom['actionTop'] == layout['action']['top'], f'{name} footer moved when content scrolled: {layout} -> {bottom}'
                assert initial_thumb != bottom['expectedTop'] and bottom['actualTop'] > 0, f'{name} indicator did not move from the top: {bottom}'
                layout['atBottom'] = bottom

            snapshots.append({'viewport':f'{width}x{height}', **layout})
        return snapshots

    open_menu_item('#new-game')
    verify_cpu_difficulty_options('#new-game-dialog', 'offline')
    offline = verify_dialog('#new-game-dialog', '#new-game-content', '.new-game-actions', '#confirm-new-game', 'offline')
    page.locator('#cancel-new-game').click()
    assert not page.locator('#new-game-dialog').evaluate('dialog => dialog.open'), 'offline cancel was blocked by scrolling'

    open_menu_item('#online-create-open')
    page.locator('#online-create-name').fill('テストホスト')
    verify_cpu_difficulty_options('#online-create-dialog', 'online')
    online = verify_dialog('#online-create-dialog', '#online-create-content', '#online-create-actions', '#online-create', 'online')
    page.locator('#online-create-cancel').click()
    assert not page.locator('#online-create-dialog').evaluate('dialog => dialog.open'), 'online cancel was blocked by scrolling'
    assert not errors, f'browser errors occurred: {errors}'

    result = {'browser':ENGINE, 'viewports':VIEWPORTS, 'offline':offline, 'online':online, 'result':'pass'}
    (OUT / f'create-dialog-layout-{ENGINE}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    browser.close()
