"""Keyboard-help visibility and action input across mouse and touch contexts."""
import os
import shutil
import sys
import traceback
from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture


ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
BASE_URL = 'http://127.0.0.1:4173/heibon-mahjong/'


def report_browser_failure(exception_type, exception, trace):
    frames = traceback.extract_tb(trace)
    line = frames[-1].lineno if frames else 1
    message = f'{exception_type.__name__}: {exception}'.replace('\n', ' ')
    print(f'::error file=tests/browser-keyboard-help.py,line={line},title=Keyboard help browser failure::{message}', flush=True)
    sys.__excepthook__(exception_type, exception, trace)


sys.excepthook = report_browser_failure


def install_fixtures(page):
    def inject(route):
        response = route.fetch()
        source = """import { riichiStart } from '/heibon-mahjong/tests/riichi-fixture.ts';
import { callStart } from '/heibon-mahjong/tests/calls-fixture.ts';
import { startMatch } from '/heibon-mahjong/src/game/match.ts';
import { discardTile } from '/heibon-mahjong/src/game/discard.ts';
""" + response.text() + """
window.keyboardHelpState = () => controller.match;
window.keyboardHelpRiichi = () => {
  controller.newGame();
  controller.match = startMatch(riichiStart('ron'));
  render();
};
window.keyboardHelpCall = () => {
  controller.newGame();
  const game = callStart(3, {0:['555m','234p','678s','19p','12z']}, 'red:man-5');
  controller.match = startMatch(discardTile(game, 3, game.players[3].drawnTile.id));
  render();
};
"""
        source = fixed_seat_fixture(
            source,
            '(_ms, signal) => new Promise(resolve => signal.addEventListener("abort", resolve, {once:true}))',
        )
        route.fulfill(response=response, body=source)

    page.route('**/src/main.ts', inject)
    page.goto(BASE_URL)
    page.wait_for_function('typeof keyboardHelpRiichi === "function"')


with sync_playwright() as playwright:
    browser_type = getattr(playwright, ENGINE)
    launch = {}
    if ENGINE == 'chromium':
        launch['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
    browser = browser_type.launch(**launch)

    # Primary touch input must hide the help at a phone viewport above all
    # legacy width/height cutoffs, for both action-panel modes.
    touch_context = browser.new_context(
        viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True,
    )
    touch_page = touch_context.new_page()
    touch_page.set_default_timeout(8000)
    touch_page.set_default_navigation_timeout(12000)
    install_fixtures(touch_page)
    assert touch_page.evaluate("matchMedia('(hover: none) and (pointer: coarse)').matches"), \
        'touch context did not expose coarse primary pointer media features'
    touch_page.evaluate('keyboardHelpRiichi()')
    touch_page.wait_for_selector('#local-game-controls .keyboard-help', state='attached')

    panel_results = touch_page.evaluate("""async () => {
      const { mountActionPanel } = await import('/heibon-mahjong/src/ui/action-panel.ts');
      const panels = [];
      for (const mode of ['local', 'online']) {
        const host = document.createElement('div');
        document.body.append(host);
        const root = mountActionPanel(host, mode);
        panels.push({mode, display: getComputedStyle(root.querySelector('.keyboard-help')).display});
        root.remove();
      }
      const live = document.querySelector('#local-game-controls .keyboard-help');
      return {panels, local: getComputedStyle(live).display,
        localHeight: live.getBoundingClientRect().height};
    }""")
    assert panel_results['local'] == 'none' and panel_results['localHeight'] == 0, panel_results
    assert panel_results['panels'] == [
        {'mode': 'local', 'display': 'none'}, {'mode': 'online', 'display': 'none'},
    ], panel_results

    standard_display = panel_results['local']
    if ENGINE == 'chromium':
        standalone_context = browser.new_context(
            viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True,
        )
        standalone_context.add_init_script("""(() => {
          const nativeMatchMedia = window.matchMedia.bind(window);
          window.matchMedia = query => {
            const result = nativeMatchMedia(query);
            if (!query.includes('(display-mode: standalone)')) return result;
            return new Proxy(result, {get(target, property) {
              if (property === 'matches') return true;
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            }});
          };
        })();""")
        standalone_page = standalone_context.new_page()
        standalone_page.set_default_timeout(8000)
        standalone_page.set_default_navigation_timeout(12000)
        standalone_page.goto(BASE_URL)
        assert standalone_page.evaluate("matchMedia('(hover: none) and (pointer: coarse)').matches")
        assert standalone_page.evaluate("matchMedia('(display-mode: standalone)').matches"), \
            'standalone display-mode hint was not applied in the test context'
        standalone_panel_results = standalone_page.evaluate("""async () => {
          const { mountActionPanel } = await import('/heibon-mahjong/src/ui/action-panel.ts');
          const displays = [];
          for (const mode of ['local', 'online']) {
            const host = document.createElement('div');
            document.body.append(host);
            const root = mountActionPanel(host, mode);
            displays.push(getComputedStyle(root.querySelector('.keyboard-help')).display);
            root.remove();
          }
          const response = await fetch('/heibon-mahjong/src/style.css');
          if (!response.ok) throw new Error(`keyboard help CSS HTTP ${response.status}`);
          const cssSource = await response.text();
          return {displays, cssSource};
        }""")
        assert standalone_panel_results['displays'] == [standard_display, standard_display], \
            standalone_panel_results
        assert standalone_panel_results['displays'] == ['none', 'none'], standalone_panel_results
        assert '@media (hover: none) and (pointer: coarse)' in standalone_panel_results['cssSource'], \
            'touch help rule does not use the required hover/pointer media features'
        assert 'display-mode' not in standalone_panel_results['cssSource'], \
            'touch help CSS must not depend on display-mode'
        standalone_context.close()

    # Touch must continue to select/discard a tile and choose an actual pon.
    selected = touch_page.locator('#player-hand button').first
    selected.tap()
    assert selected.get_attribute('aria-pressed') == 'true'
    touch_page.locator('#discard').tap()
    assert touch_page.evaluate("keyboardHelpState().game.players[0].river.length") >= 1

    touch_page.evaluate('keyboardHelpCall()')
    pon = touch_page.locator('#call-pon')
    pon.wait_for(state='visible')
    pon.tap()
    touch_page.wait_for_function("keyboardHelpState().game.players[0].melds.length === 1")
    assert touch_page.evaluate("keyboardHelpState().game.players[0].melds[0].type") == 'pon'

    # The traditional desktop presentation remains visible and native Tab,
    # Enter, and Space continue to select and discard tiles.
    desktop_context = browser.new_context(viewport={'width': 1280, 'height': 800})
    desktop_page = desktop_context.new_page()
    desktop_page.set_default_timeout(8000)
    desktop_page.set_default_navigation_timeout(12000)
    install_fixtures(desktop_page)
    assert not desktop_page.evaluate("matchMedia('(hover: none) and (pointer: coarse)').matches")
    desktop_page.evaluate('keyboardHelpRiichi()')
    help_text = desktop_page.locator('#local-game-controls .keyboard-help')
    assert help_text.is_visible(), 'keyboard help should remain visible for mouse/keyboard input'

    first_tile = desktop_page.locator('#player-hand button').first
    first_tile.focus()
    desktop_page.keyboard.press('Enter')
    assert first_tile.get_attribute('aria-pressed') == 'true', 'Enter did not select the focused tile'
    focused_discard = False
    for _ in range(24):
        desktop_page.keyboard.press('Tab')
        if desktop_page.locator('#discard').evaluate('element => document.activeElement === element'):
            focused_discard = True
            break
    assert focused_discard, 'Tab did not reach the discard button from the hand'
    before_river = desktop_page.evaluate('keyboardHelpState().game.players[0].river.length')
    desktop_page.keyboard.press('Space')
    desktop_page.wait_for_function(
        'n => keyboardHelpState().game.players[0].river.length > n', arg=before_river,
    )

    print(f'{ENGINE}: coarse touch hides local/online help in normal and standalone-query contexts; '
          'touch discard/pon and desktop Tab/Enter/Space passed')
    desktop_context.close()
    touch_context.close()
    browser.close()
