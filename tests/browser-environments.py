"""Same-origin production/development CPU, storage, SW, offline and update checks.
Uses temporary local copies only. Does not contact deployed Worker or Pages.
"""
import os
from pathlib import Path
import shutil
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright

BASE = '/heibon-mahjong/'


def start_cpu(page):
    page.locator('#main-menu-toggle').click()
    page.locator('#new-game').click()
    page.locator('#confirm-new-game').click()
    page.locator('#local-table').wait_for(state='visible')
    assert page.locator('#player-hand button').count() >= 13


with tempfile.TemporaryDirectory(prefix='heibon-environments-') as tmp:
    root = Path(tmp)
    site = root / 'heibon-mahjong'
    shutil.copytree('dist', site)
    shutil.copytree('dist-dev', site / 'dev')

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=tmp, **kwargs)

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as p:
        browser = getattr(p, os.environ.get('HEIBON_BROWSER', 'chromium')).launch()
        context = browser.new_context(service_workers='allow')
        prod = context.new_page()
        prod.goto(origin + BASE)
        prod.evaluate('async () => { await navigator.serviceWorker.ready; }')
        prod.reload()
        prod.wait_for_function("navigator.serviceWorker.controller?.scriptURL.endsWith('/heibon-mahjong/sw.js')")
        start_cpu(prod)
        # Keep a production session in this tab, then navigate that same tab to dev.
        prod.evaluate("sessionStorage.setItem('heibon-mahjong-online-session', 'production-sentinel')")
        production_rules = prod.evaluate("localStorage.getItem('heibon-mahjong-last-rules')")
        dev = prod
        dev.goto(origin + BASE + 'dev/')
        dev.wait_for_function("navigator.serviceWorker.controller?.scriptURL.endsWith('/dev/sw.js')")
        start_cpu(dev)
        assert dev.evaluate("sessionStorage.getItem('heibon-mahjong-online-session')") == 'production-sentinel'
        assert dev.evaluate("localStorage.getItem('heibon-mahjong-last-rules')") == production_rules
        assert dev.evaluate("localStorage.getItem('heibon-mahjong-dev:heibon-mahjong-last-rules')") is not None
        keys = dev.evaluate('caches.keys()')
        assert any(key.startswith('heibon-mahjong-shell-') for key in keys), keys
        assert any(key.startswith('heibon-mahjong-dev-shell-') for key in keys), keys
        production = context.new_page()
        production.goto(origin + BASE)
        production.wait_for_function('navigator.serviceWorker.controller !== null')
        # Production update may activate with a dev tab open, and cannot claim that tab.
        sw = site / 'sw.js'
        sw.write_text(sw.read_text() + '\n// isolated update test\n')
        production.evaluate('async () => { const r = await navigator.serviceWorker.getRegistration(location.href); await r.update(); }')
        production.wait_for_function('async () => Boolean((await navigator.serviceWorker.getRegistration(location.href)).waiting)')
        production.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(location.href); r.waiting.postMessage({type:'ACTIVATE_UPDATE'}); }")
        production.wait_for_function('async () => !(await navigator.serviceWorker.getRegistration(location.href)).waiting')
        assert dev.evaluate('navigator.serviceWorker.controller.scriptURL').endswith('/dev/sw.js')
        assert dev.evaluate('caches.keys()') == keys or set(dev.evaluate('caches.keys()')) == set(keys)
        context.set_offline(True)
        for page, suffix in [(production, ''), (dev, 'dev/')]:
            page.reload()
            assert page.evaluate('navigator.serviceWorker.controller.scriptURL') == origin + BASE + suffix + 'sw.js'
            start_cpu(page)
        print(os.environ.get('HEIBON_BROWSER', 'chromium') + ': independent CPU, storage, SW, offline and update checks passed')
        browser.close()
    server.shutdown()
