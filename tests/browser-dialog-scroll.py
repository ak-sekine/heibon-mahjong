"""Common scroll controls for rules, round-result, and match-result dialogs."""
import os
import shutil
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
VIEWPORTS = [(1280, 800), (1280, 420), (390, 844), (320, 480)]
DIALOGS = [
    ('rules', '#online-rules-dialog', '#online-rules-list', '.online-dialog-header', '#online-rules-close'),
    ('round-result', '#result-dialog', '#result-body', '.result-header', '#view-table'),
    ('match-result', '#match-result-dialog', '#match-result-body', '.result-header', '#match-result-close'),
]

with sync_playwright() as playwright:
    browser_type = getattr(playwright, ENGINE)
    options = {}
    if ENGINE == 'chromium':
        options['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
        options['args'] = ['--no-sandbox']
    browser = browser_type.launch(**options)
    for width, height in VIEWPORTS:
        mobile = width < 500
        page = browser.new_page(viewport={'width': width, 'height': height}, is_mobile=mobile,
                                has_touch=mobile, device_scale_factor=2 if mobile else 1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def expose_app(route):
            response = route.fetch()
            source = response.text() + '''
window.dialogScrollTest = {
  controller,
  openRules() {
    const trigger = document.querySelector('#menu-offline-rules');
    openReadOnlyRules(trigger, rulesForMatch(controller.match), 'offline');
  }
};
'''
            route.fulfill(response=response, body=source)

        page.route('**/src/main.ts', expose_app)
        page.goto('http://127.0.0.1:4173/heibon-mahjong/')
        page.wait_for_function('typeof window.dialogScrollTest === "object"')
        page.evaluate('''() => {
          window.dialogScrollTest.controller.random = () => 0.999999;
          window.dialogScrollTest.controller.newGame();
        }''')

        appearance = []
        for name, dialog_selector, content_selector, header_selector, action_selector in DIALOGS:
            dialog = page.locator(dialog_selector)
            content = page.locator(content_selector)
            track = dialog.locator('.dialog-scroll-indicator')
            header = dialog.locator(header_selector)
            action = dialog.locator(action_selector)
            if name == 'rules':
                page.evaluate('window.dialogScrollTest.openRules()')
            else:
                page.evaluate('''({dialogSelector,contentSelector,name}) => {
                  const dialog = document.querySelector(dialogSelector);
                  const content = document.querySelector(contentSelector);
                  const host = name === 'round-result' ? document.querySelector('#win-result') : content;
                  if (name === 'round-result') {
                    host.replaceChildren();
                    host.hidden = false;
                  } else content.replaceChildren();
                  if (name === 'round-result') {
                    document.querySelector('#result-title').textContent = 'ロン和了';
                    const facts = ['役：立直・平和・一発', '3翻 30符', 'ドラ：1枚', '点数：7700点', '和了手牌'];
                    for (const fact of facts) { const p = document.createElement('p'); p.textContent = fact; host.append(p); }
                  } else {
                    const title = document.createElement('p'); title.className = 'match-result-format'; title.textContent = '東風戦・最終順位';
                    content.append(title);
                    for (const [rank, points] of [[1, 42000], [2, 32000], [3, 22000], [4, 4000]]) {
                      const row = document.createElement('p'); row.textContent = `${rank}位　プレイヤー${rank}　${points.toLocaleString('ja-JP')}点`; content.append(row);
                    }
                  }
                  dialog.showModal();
                }''', {'dialogSelector': dialog_selector, 'contentSelector': content_selector, 'name': name})

            dialog.wait_for(state='visible')
            page.evaluate('''({contentSelector,name}) => {
              const content = document.querySelector(contentSelector);
              const host = name === 'round-result' ? document.querySelector('#win-result') : content;
              for (let index = 0; index < 48; index++) {
                const row = document.createElement(name === 'rules' ? 'div' : 'p');
                if (name === 'rules') row.className = 'confirmed-rule-row';
                row.textContent = name === 'rules'
                  ? `ルール項目${index + 1}　長い説明文を追加してスクロール領域の末尾まで操作できることを検査します。`
                  : `結果詳細 ${index + 1}　役・翻・符・ドラ・点数および和了手牌の説明。`;
                host.append(row);
              }
            }''', {'contentSelector': content_selector, 'name': name})
            page.wait_for_timeout(100)
            initial_scroll = content.evaluate('(node) => ({scrollHeight:node.scrollHeight,clientHeight:node.clientHeight})')
            assert initial_scroll['scrollHeight'] > initial_scroll['clientHeight'], (width, height, name, 'long fixture did not create a scroll range', initial_scroll)
            try:
                page.wait_for_function('selector => !document.querySelector(selector).querySelector(".dialog-scroll-indicator").hidden', arg=dialog_selector, timeout=3000)
            except PlaywrightTimeoutError:
                print('dialog scroll indicator diagnostics', ENGINE, width, height, name, page.evaluate('''({dialogSelector,contentSelector}) => {
                  const dialog = document.querySelector(dialogSelector), content = document.querySelector(contentSelector);
                  const panel = dialog.querySelector('.dialog-scroll-panel'), track = dialog.querySelector('.dialog-scroll-indicator');
                  const rect = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
                  return {open:dialog.open,dialogRect:rect(dialog),panelRect:rect(panel),contentRect:rect(content),
                    scrollHeight:content.scrollHeight,clientHeight:content.clientHeight,trackHidden:track.hidden,trackRect:rect(track)};
                }''', {'dialogSelector':dialog_selector,'contentSelector':content_selector}))
                raise

            geometry = page.evaluate('''({dialogSelector,contentSelector,headerSelector,actionSelector}) => {
              const dialog = document.querySelector(dialogSelector);
              const content = document.querySelector(contentSelector);
              const track = dialog.querySelector('.dialog-scroll-indicator');
              const thumb = track.querySelector('span');
              const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
              return {
                overflow: content.scrollHeight > content.clientHeight,
                tabIndex: content.tabIndex,
                overflowY: getComputedStyle(content).overflowY,
                scrollbarWidth: getComputedStyle(content).scrollbarWidth,
                webkitScrollbarDisplay: getComputedStyle(content, '::-webkit-scrollbar').display,
                touchAction: getComputedStyle(content).touchAction,
                trackWidth: rect(track).width,
                trackRect: rect(track), thumbRect: rect(thumb),
                panelRect: rect(dialog.querySelector('.dialog-scroll-panel')),
                contentRect: rect(content),
                trackColor: getComputedStyle(track).backgroundColor,
                thumbColor: getComputedStyle(thumb).backgroundColor,
                headerRect: rect(dialog.querySelector(headerSelector)),
                actionRect: rect(dialog.querySelector(actionSelector)),
                horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth,
              };
            }''', {'dialogSelector': dialog_selector, 'contentSelector': content_selector,
                    'headerSelector': header_selector, 'actionSelector': action_selector})
            assert geometry['overflow'], (width, height, name, 'long fixture did not overflow')
            assert geometry['tabIndex'] == 0, (width, height, name, 'scroll body is not keyboard reachable')
            assert geometry['overflowY'] == 'auto', (ENGINE, name, geometry)
            assert geometry['scrollbarWidth'] == 'none', (ENGINE, name, geometry)
            assert geometry['webkitScrollbarDisplay'] == 'none', (ENGINE, name, geometry)
            assert geometry['touchAction'] == 'auto', (ENGINE, name, geometry)
            assert abs(geometry['trackWidth'] - 6) < 1, (ENGINE, name, geometry)
            assert abs(geometry['trackRect']['y'] - geometry['panelRect']['y']) < 1, (ENGINE, name, geometry)
            assert abs(geometry['trackRect']['height'] - geometry['panelRect']['height']) < 1, (ENGINE, name, geometry)
            assert abs(geometry['panelRect']['x'] + geometry['panelRect']['width'] - geometry['trackRect']['x'] - geometry['trackWidth'] - 1) < 1, (ENGINE, name, geometry)
            assert abs(geometry['trackRect']['x'] - geometry['contentRect']['x'] - geometry['contentRect']['width'] - 9) < 1, (ENGINE, name, geometry)
            assert geometry['trackColor'] == 'rgb(21, 78, 60)', (ENGINE, name, geometry)
            assert geometry['thumbColor'] == 'rgb(255, 218, 125)', (ENGINE, name, geometry)
            assert geometry['actionRect']['height'] >= 44, (width, height, name, geometry)
            assert not geometry['horizontalOverflow'], (width, height, name, geometry)
            appearance.append((geometry['trackWidth'], geometry['trackColor'], geometry['thumbColor']))
            content.evaluate('(node) => { node.scrollTop = node.scrollHeight; }')
            page.wait_for_function('selector => { const node = document.querySelector(selector); return node.scrollTop >= node.scrollHeight - node.clientHeight - 1; }', arg=content_selector)

            before_header = geometry['headerRect']['y']
            before_action = geometry['actionRect']['y']
            content.scroll_into_view_if_needed()
            page.mouse.move(geometry['trackRect']['x'] - 20, geometry['trackRect']['y'] + 20)
            page.mouse.wheel(0, 360)
            page.wait_for_function('selector => document.querySelector(selector).scrollTop > 0', arg=content_selector)
            after_wheel = content.evaluate('(node) => node.scrollTop')

            content.evaluate('(node) => { node.focus(); node.scrollTop = 0; }')
            page.keyboard.press('PageDown')
            page.wait_for_function('selector => document.querySelector(selector).scrollTop > 0', arg=content_selector)
            after_keyboard = content.evaluate('(node) => node.scrollTop')
            assert after_keyboard > 0 and after_wheel > 0, (width, height, name, after_wheel, after_keyboard)
            page.keyboard.press('PageUp')
            page.wait_for_function('({selector,before}) => document.querySelector(selector).scrollTop < before', arg={'selector': content_selector, 'before': after_keyboard})

            if mobile:
                for target in [content, track]:
                    assert target.evaluate("""node => {
                      const event = new PointerEvent('pointerdown', {bubbles:true,cancelable:true,
                        pointerType:'touch',pointerId:42,button:0});
                      return node.dispatchEvent(event) && !event.defaultPrevented;
                    }"""), (ENGINE, name, 'touch pointer was cancelled')
                if ENGINE == 'chromium':
                    content.evaluate('(node) => { node.scrollTop = 0; }')
                    box = content.bounding_box()
                    session = page.context.new_cdp_session(page)
                    start_x, start_y = box['x'] + box['width'] / 2, box['y'] + box['height'] * .8
                    session.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':start_x,'y':start_y}]})
                    for step in range(1, 9):
                        session.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':start_x,'y':start_y - box['height'] * .6 * step / 8}]})
                        page.wait_for_timeout(20)
                    session.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
                    page.wait_for_function('selector => document.querySelector(selector).scrollTop > 0', arg=content_selector)
                    session.detach()

            track_box = track.bounding_box()
            page.mouse.click(track_box['x'] + track_box['width'] / 2,
                             track_box['y'] + track_box['height'] * .85)
            page.wait_for_function('selector => document.querySelector(selector).scrollTop > 0', arg=content_selector)
            after_track = content.evaluate('(node) => node.scrollTop')
            thumb_box = track.locator('span').bounding_box()
            page.mouse.move(thumb_box['x'] + thumb_box['width'] / 2, thumb_box['y'] + thumb_box['height'] / 2)
            page.mouse.down()
            page.mouse.move(track_box['x'] + track_box['width'] / 2, track_box['y'] + 2, steps=8)
            page.mouse.up()
            after_drag = content.evaluate('(node) => node.scrollTop')
            assert after_track > 0 and after_drag < after_track, (width, height, name, after_track, after_drag)
            assert abs(header.bounding_box()['y'] - before_header) < 1, (name, 'header scrolled')
            assert abs(action.bounding_box()['y'] - before_action) < 1, (name, 'action button moved with content')

            content.evaluate('''(node) => {
              node.scrollTop = 0;
              if (node.id === 'result-body') {
                const section = document.querySelector('#win-result');
                section.replaceChildren();
                section.hidden = false;
                const short = document.createElement('p'); short.textContent = '短い内容'; section.append(short);
              } else node.replaceChildren();
              if (node.id === 'result-body') return;
              const short = document.createElement('p'); short.textContent = '短い内容'; node.append(short);
            }''')
            page.wait_for_function('selector => document.querySelector(selector).querySelector(".dialog-scroll-indicator").hidden', arg=dialog_selector)
            assert not page.evaluate('selector => document.querySelector(selector).querySelector(".dialog-scroll-panel").scrollWidth > document.querySelector(selector).querySelector(".dialog-scroll-panel").clientWidth', dialog_selector), (name, 'panel overflowed horizontally')

            dialog.locator(action_selector).click()
            page.wait_for_function('selector => !document.querySelector(selector).open', arg=dialog_selector)
            page.evaluate('''({dialogSelector}) => { const dialog = document.querySelector(dialogSelector); dialog.showModal(); }''', {'dialogSelector': dialog_selector})
            assert dialog.is_visible(), (name, 'failed to reopen')
            dialog.locator(action_selector).click()
            page.wait_for_function('selector => !document.querySelector(selector).open', arg=dialog_selector)

        assert len(set(appearance)) == 1, (ENGINE, width, height, appearance)
        assert not errors, (width, height, errors)
        page.close()
        print(f'{ENGINE} {width}x{height}: rules, round-result, and match-result scroll passed')
    browser.close()
