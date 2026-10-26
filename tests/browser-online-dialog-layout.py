"""Check the built online dialogs in Chromium and WebKit at mobile widths."""
import json
import os
import pathlib
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_PRODUCTION_URL', 'http://127.0.0.1:4174/heibon-mahjong/')
BROWSER_NAME = os.environ.get('HEIBON_BROWSER', 'chromium')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [(320, 700), (375, 812), (390, 844), (414, 896)]
DIALOGS = [
    ('create', '#online-create-dialog', '#online-create-close', '#online-create-open'),
    ('join', '#online-join-dialog', '#online-join-close', '#online-join-open'),
    ('waiting', '#online-dialog', '#online-close', None),
]

with sync_playwright() as playwright:
    if BROWSER_NAME not in ('chromium', 'webkit'):
        raise ValueError(f'Unsupported browser: {BROWSER_NAME}')
    browser_type = getattr(playwright, BROWSER_NAME)
    launch_options = {'chromium_sandbox': True} if BROWSER_NAME == 'chromium' else {}
    browser = browser_type.launch(**launch_options)
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    page.goto(BASE_URL, wait_until='networkidle')
    css_assets = page.evaluate("""() => performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(url => new URL(url).pathname.match(/\\/assets\\/main-[^/]+\\.css$/))""")
    assert css_assets, f'production CSS asset was not loaded from {BASE_URL}'

    reports = []
    for width, height in VIEWPORTS:
        page.set_viewport_size({'width': width, 'height': height})
        for name, dialog_selector, close_selector, open_selector in DIALOGS:
            if open_selector:
                if page.locator('#main-menu-items').is_hidden():
                    page.locator('#main-menu-toggle').click()
                page.locator(open_selector).click()
            else:
                page.locator(dialog_selector).evaluate('''dialog => {
                  dialog.querySelector('#online-status').hidden = true;
                  dialog.querySelector('#online-room').hidden = false;
                  dialog.querySelector('#online-room-code').textContent = 'ABC234';
                  dialog.querySelector('#online-room-format').textContent = '対局形式：東風戦';
                  dialog.querySelector('#online-connection').hidden = false;
                  dialog.querySelector('#online-connection').textContent = '接続中';
                  const seats = dialog.querySelector('#online-seats');
                  seats.replaceChildren();
                  for (const [wind, name] of [['東', 'テストホスト'], ['南', 'テスト参加者'], ['西', '空席'], ['北', '空席']]) {
                    const row = document.createElement('li');
                    const windLabel = document.createElement('span');
                    windLabel.className = 'online-seat-wind';
                    windLabel.textContent = wind;
                    const content = document.createElement('div');
                    content.className = `online-seat-content${name === '空席' ? ' is-empty' : ''}`;
                    const playerName = document.createElement('span');
                    playerName.className = 'online-seat-name';
                    playerName.textContent = name;
                    content.append(playerName);
                    row.append(windLabel, content);
                    seats.append(row);
                  }
                  dialog.querySelector('#online-ready').hidden = false;
                  dialog.querySelector('#online-finalize').hidden = false;
                  dialog.querySelector('#online-finalize').disabled = true;
                  dialog.querySelector('#online-room-expiry').textContent = '2026/10/27 14:00';
                  dialog.showModal();
                }''')

            layout = page.locator(dialog_selector).evaluate('''dialog => {
              const close = dialog.querySelector('.online-dialog-close');
              const header = close.parentElement;
              const title = header.querySelector('h2');
              const buttonBox = close.getBoundingClientRect();
              const dialogBox = dialog.getBoundingClientRect();
              const titleBox = title.getBoundingClientRect();
              const titleRange = document.createRange();
              titleRange.selectNodeContents(title);
              const titleTextRects = [...titleRange.getClientRects()];
              const text = close.firstChild;
              const range = document.createRange();
              range.selectNodeContents(close);
              const textRects = [...range.getClientRects()];
              const glyphTops = [];
              for (let index = 0; index < text.textContent.length; index++) {
                const glyph = document.createRange();
                glyph.setStart(text, index);
                glyph.setEnd(text, index + 1);
                glyphTops.push(glyph.getBoundingClientRect().top);
              }
              const style = getComputedStyle(close);
              const headerStyle = getComputedStyle(header);
              const titleStyle = getComputedStyle(title);
              const contentWidth = buttonBox.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
              const textBox = range.getBoundingClientRect();
              const visibleButtons = [...dialog.querySelectorAll('button:not([hidden])')].map(button => {
                const box = button.getBoundingClientRect();
                return {id: button.id, left: box.left, right: box.right, width: box.width, height: box.height};
              });
              return {
                label: text.textContent,
                lineBoxes: textRects.length,
                textWidth: textBox.width,
                contentWidth,
                textFitsContent: textBox.width <= contentWidth + 0.5,
                glyphTops,
                oneVisualLine: glyphTops.length > 0 && glyphTops.every(top => Math.abs(top - glyphTops[0]) < 1),
                whiteSpace: style.whiteSpace,
                width: style.width,
                minWidth: style.minWidth,
                maxWidth: style.maxWidth,
                padding: style.padding,
                boxSizing: style.boxSizing,
                flexGrow: style.flexGrow,
                flexShrink: style.flexShrink,
                flexBasis: style.flexBasis,
                headerDisplay: headerStyle.display,
                titleMinWidth: titleStyle.minWidth,
                titleRight: titleBox.right,
                titleTextRects: titleTextRects.map(rect => ({left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom})),
                closeLeft: buttonBox.left,
                closeRight: buttonBox.right,
                closeHeight: buttonBox.height,
                dialogLeft: dialogBox.left,
                dialogRight: dialogBox.right,
                insideDialog: buttonBox.left >= dialogBox.left && buttonBox.right <= dialogBox.right,
                titleDoesNotOverlap: titleTextRects.length > 0 && titleTextRects.every(rect => rect.right <= buttonBox.left),
                dialogInsideViewport: dialogBox.left >= 0 && dialogBox.right <= innerWidth && dialogBox.top >= 0 && dialogBox.bottom <= innerHeight,
                noHorizontalOverflow: dialog.scrollWidth <= dialog.clientWidth && document.documentElement.scrollWidth <= innerWidth,
                visibleButtonsFit: visibleButtons.every(button => button.left >= dialogBox.left && button.right <= dialogBox.right && button.height >= 44),
                visibleButtons,
              };
            }''')
            assert layout['label'] == '閉じる', f'{name} close button label changed at {width}px: {layout}'
            assert layout['whiteSpace'] == 'nowrap', f'{name} close button allows wrapping at {width}px: {layout}'
            assert layout['lineBoxes'] == 1 and layout['oneVisualLine'], f'{name} close label is not one actual text line at {width}px: {layout}'
            assert layout['textFitsContent'], f'{name} close label does not fit inside the button at {width}px: {layout}'
            assert layout['flexShrink'] == '0', f'{name} close button can shrink in its flex header at {width}px: {layout}'
            assert layout['headerDisplay'] == 'flex' and layout['titleMinWidth'] == '0px', f'{name} header does not allow the title to shrink safely at {width}px: {layout}'
            assert layout['closeHeight'] >= 44 and layout['insideDialog'], f'{name} close button is outside its dialog or undersized at {width}px: {layout}'
            assert layout['titleDoesNotOverlap'], f'{name} title overlaps its close button at {width}px: {layout}'
            assert layout['dialogInsideViewport'], f'{name} dialog exceeds the viewport at {width}px: {layout}'
            assert layout['noHorizontalOverflow'], f'{name} dialog overflows horizontally at {width}px: {layout}'
            assert layout['visibleButtonsFit'], f'{name} operation button does not fit at {width}px: {layout}'

            page.screenshot(path=str(OUT / f'online-dialog-{name}-{width}-{BROWSER_NAME}.png'))
            reports.append({'dialog': name, 'viewport': f'{width}x{height}', **layout})
            page.locator(close_selector).click()
            assert page.locator(dialog_selector).evaluate('dialog => !dialog.open'), f'{name} close button did not close at {width}px'

    report = {'browser': BROWSER_NAME, 'url': BASE_URL, 'cssAssets': css_assets, 'layouts': reports}
    print(json.dumps(report, ensure_ascii=False))
    (OUT / f'online-dialog-layout-{BROWSER_NAME}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
