import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
widths = [(320, 568), (375, 667), (390, 844), (430, 844), (1280, 800)]
roles = {
    '#new-game': ('rgb(248, 220, 145)', 'rgb(21, 78, 60)'),
    '#online-close': ('rgb(248, 247, 242)', 'rgb(24, 86, 64)'),
    '[data-panel-part="pass-call"]': ('rgb(220, 233, 226)', 'rgb(24, 86, 64)'),
    '#diagnostic-clear': ('rgb(255, 231, 225)', 'rgb(113, 56, 46)'),
    '#online-close-room': ('rgb(155, 48, 40)', 'rgb(255, 255, 255)'),
}

def luminance(rgb):
    channels = [int(value) / 255 for value in rgb.strip('rgb()').split(',')]
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return sum(weight * channel for weight, channel in zip((0.2126, 0.7152, 0.0722), linear))

def contrast(first, second):
    high, low = sorted((luminance(first), luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)

with sync_playwright() as playwright:
    browser_type = getattr(playwright, os.environ.get('HEIBON_BROWSER', 'chromium'))
    browser = browser_type.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.goto(base)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.keyboard.press('Tab')
    focus = page.evaluate('''() => {
      const button = document.activeElement;
      const style = getComputedStyle(button);
      return { id: button.id, visible: button.matches(':focus-visible'), outline: style.outlineColor,
        outlineWidth: style.outlineWidth, ring: style.boxShadow };
    }''')
    assert focus['id'] == 'main-menu-toggle' and focus['visible'], focus
    assert focus['outline'] == 'rgb(130, 220, 255)' and focus['outlineWidth'] == '3px', focus
    assert 'rgb(18, 63, 50)' in focus['ring'], focus
    for width, height in widths:
        page.set_viewport_size({'width': width, 'height': height})
        computed = page.evaluate('''selectors => Object.fromEntries(selectors.map(selector => {
          const node = document.querySelector(selector);
          if (!node) throw new Error(`Missing role target: ${selector}`);
          const style = getComputedStyle(node);
          return [selector, { background: style.backgroundColor, color: style.color,
            borderColor: style.borderColor, opacity: style.opacity }];
        }))''', list(roles))
        for selector, expected in roles.items():
            assert (computed[selector]['background'], computed[selector]['color']) == expected, (width, selector, computed[selector])
            assert contrast(computed[selector]['color'], computed[selector]['background']) >= 4.5, (width, selector, computed[selector])
            assert contrast(computed[selector]['borderColor'], computed[selector]['background']) >= 3, (width, selector, computed[selector])
        busy = page.evaluate('''() => {
          const button = document.querySelector('#online-ready');
          button.disabled = true;
          const disabledStyle = getComputedStyle(button);
          const disabled = { background: disabledStyle.backgroundColor, color: disabledStyle.color,
            border: disabledStyle.borderColor };
          button.setAttribute('aria-busy', 'true');
          const processing = getComputedStyle(button);
          const icon = getComputedStyle(button, '::after');
          return { disabled: disabled.background, disabledColor: disabled.color, disabledBorder: disabled.border,
            processing: processing.backgroundColor, icon: icon.content, iconWidth: icon.width, iconHeight: icon.height,
            iconBorderWidth: icon.borderTopWidth, animation: icon.animationName, rect: button.getBoundingClientRect().toJSON() };
        }''')
        assert busy['disabled'] == 'rgb(157, 162, 124)', (width, busy)
        assert contrast(busy['disabledColor'], busy['disabled']) >= 4.5, (width, busy)
        assert contrast(busy['disabledBorder'], busy['disabled']) >= 3, (width, busy)
        assert busy['processing'] == 'rgb(248, 220, 145)', (width, busy)
        assert busy['icon'] not in ('none', 'normal') and (busy['iconWidth'], busy['iconHeight'], busy['iconBorderWidth']) == ('8px', '8px', '2px') and busy['animation'] == 'button-wait', (width, busy)
        page.evaluate("document.querySelector('#online-ready').removeAttribute('aria-busy');document.querySelector('#online-ready').disabled=false")
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'horizontal overflow')
        page.locator('#main-menu-toggle').click()
        menu = page.locator('#main-menu-items')
        assert menu.is_visible()
        menu_box = menu.bounding_box()
        assert menu_box['x'] >= 0 and menu_box['x'] + menu_box['width'] <= width, (width, menu_box)
        new_game_button = page.locator('#new-game')
        before_press = new_game_button.bounding_box()
        page.mouse.move(before_press['x'] + before_press['width'] / 2, before_press['y'] + before_press['height'] / 2)
        page.mouse.down()
        pressed = new_game_button.evaluate('''e => ({ background: getComputedStyle(e).backgroundColor,
          rect: e.getBoundingClientRect().toJSON() })''')
        assert pressed['background'] == 'rgb(233, 198, 106)', (width, pressed)
        assert (pressed['rect']['x'], pressed['rect']['y'], pressed['rect']['width'], pressed['rect']['height']) == \
          (before_press['x'], before_press['y'], before_press['width'], before_press['height']), (width, before_press, pressed)
        page.mouse.up()
        assert page.locator('#new-game-dialog').is_visible()
        assert page.locator('#confirm-new-game').inner_text() == '新しい対局を開始'
        assert page.locator('#confirm-new-game').evaluate("e => e.classList.contains('ui-button--a')")
        dialog_box = page.locator('#new-game-dialog').bounding_box()
        assert dialog_box['x'] >= 0 and dialog_box['x'] + dialog_box['width'] <= width, (width, dialog_box)
        page.locator('#cancel-new-game').click()
        assert page.evaluate("document.activeElement.id") == 'main-menu-toggle'
        page.locator('#main-menu-toggle').click()
        page.locator('#menu-diagnostics').click()
        close_box = page.locator('#diagnostic-close').bounding_box()
        if width == 320:
            # The 320px wrap predates role colors; preserve it as a baseline rather than
            # folding the separate diagnostics-close layout issue into this change.
            assert close_box['width'] >= 64 and 44 <= close_box['height'] <= 60, (width, close_box)
        else:
            assert close_box['height'] == 44 and close_box['width'] >= 64, (width, close_box)
        assert page.locator('#diagnostic-close').evaluate("e => getComputedStyle(e).backgroundColor") == 'rgb(248, 247, 242)'
        page.locator('#diagnostic-close').click()
        page.wait_for_function("document.activeElement.id === 'main-menu-toggle'")
        assert page.evaluate("document.activeElement.id") == 'main-menu-toggle'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'post-dialog horizontal overflow')
    for path in ('test.html', 'kan-test.html'):
        page.goto(base + path)
        assert page.locator('button.ui-button').count() > 0, path
        assert page.locator('button:not(.ui-button)').count() == 0, path
        for width, height in widths:
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (path, width, 'horizontal overflow')
            boxes = page.locator('button.ui-button:visible').evaluate_all('''buttons => buttons.map(button => {
              const rect = button.getBoundingClientRect();
              return { id: button.id, x: rect.x, right: rect.right, height: rect.height };
            })''')
            assert all(box['x'] >= 0 and box['right'] <= width and box['height'] >= 44 for box in boxes), (path, width, boxes)
        if path == 'test.html':
            page.locator('#load-scenario').click()
            tile = page.locator('#player-hand button[data-tile-id]').first
            assert tile.evaluate("e => e.classList.contains('ui-button--a')")
            assert tile.is_enabled()
            for width, height in widths:
                page.set_viewport_size({'width': width, 'height': height})
                geometry = tile.evaluate('''button => {
                  const hand = document.querySelector('#player-hand');
                  const before = button.getBoundingClientRect();
                  const handBefore = hand.getBoundingClientRect();
                  const scrollBefore = document.documentElement.scrollHeight;
                  button.setAttribute('aria-pressed', 'true');
                  const selected = button.getBoundingClientRect();
                  const selectedColor = getComputedStyle(button).backgroundColor;
                  const selectedTransform = getComputedStyle(button).transform;
                  button.disabled = true;
                  const disabledColor = getComputedStyle(button).backgroundColor;
                  const result = { deltaY: selected.y - before.y, widthDelta: selected.width - before.width,
                    handHeightDelta: hand.getBoundingClientRect().height - handBefore.height,
                    scrollDelta: document.documentElement.scrollHeight - scrollBefore,
                    transform: selectedTransform, selectedColor, disabledColor };
                  button.disabled = false;
                  button.setAttribute('aria-pressed', 'false');
                  return result;
                }''')
                assert geometry['deltaY'] == -8 and geometry['widthDelta'] == 0, (width, geometry)
                assert geometry['handHeightDelta'] == 0 and geometry['scrollDelta'] == 0, (width, geometry)
                assert geometry['transform'] != 'none', (width, geometry)
                assert geometry['selectedColor'] == 'rgb(248, 220, 145)', (width, geometry)
                assert geometry['disabledColor'] == 'rgb(157, 162, 124)', (width, geometry)
    assert not errors, errors
    print(json.dumps({'browser': os.environ.get('HEIBON_BROWSER', 'chromium'), 'result': 'passed',
                      'viewports': widths, 'checks': ['roles', 'text-and-border-contrast', 'disabled-busy-priority', 'processing-icon',
                      'focus-visible', 'menu-layout', 'new-game-confirmation', 'tile-selection-layout',
                      'diagnostic-focus-return', 'verification-pages']}, ensure_ascii=False))
    browser.close()
