"""PWA shell: manifest, install, offline launch and basic offline play in Chromium/WebKit."""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_PRODUCTION_URL', 'http://127.0.0.1:4174/heibon-mahjong/')

with sync_playwright() as playwright:
    browser = getattr(playwright, os.environ.get('HEIBON_BROWSER', 'chromium')).launch()
    context = browser.new_context(viewport={'width': 390, 'height': 750}, service_workers='allow')
    page = context.new_page()
    page.goto(BASE_URL, wait_until='networkidle')
    page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=20000)
    manifest = page.evaluate("""async () => {
      const res = await fetch('manifest.webmanifest');
      return res.json();
    }""")
    assert manifest['scope'] == '/heibon-mahjong/'
    assert manifest['display'] == 'standalone'
    assert page.evaluate("navigator.serviceWorker.controller.scriptURL.endsWith('/heibon-mahjong/sw.js')")
    cache_names = page.evaluate("caches.keys()")
    assert any(name.startswith('heibon-mahjong-shell-') for name in cache_names), cache_names

    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.locator('#app-idle').wait_for(state='visible')
    page.locator('#main-menu-toggle').click()
    page.locator('#new-game').click()
    page.locator('#confirm-new-game').click()
    page.locator('#local-table').wait_for(state='visible')
    assert page.locator('#player-hand li').count() in (13, 14)
    assert page.evaluate('window.matchMedia("(display-mode: standalone)").matches') is False

    context.set_offline(False)
    page.reload(wait_until='networkidle')
    page.locator('#app-idle').wait_for(state='visible')
    print('PWA shell installed; offline startup and basic local play passed. Real mobile installation remains unverified.')
    context.close()
    browser.close()
