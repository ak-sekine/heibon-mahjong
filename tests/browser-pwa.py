"""Install, offline-play, stale-cache update and multi-client PWA checks."""
import os
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

BASE_PATH = '/heibon-mahjong/'
DIST = Path('dist').resolve()


def report_browser_failure(exception_type, exception, trace):
    """Put the failing test line in the GitHub check API, not only its log blob."""
    frames = traceback.extract_tb(trace)
    line = frames[-1].lineno if frames else 1
    message = f'{exception_type.__name__}: {exception}'.replace('\n', ' ')
    print(f'::error file=tests/browser-pwa.py,line={line},title=PWA browser failure::{message}', flush=True)
    sys.__excepthook__(exception_type, exception, trace)


sys.excepthook = report_browser_failure


class PagesHandler(SimpleHTTPRequestHandler):
    root = DIST
    failure_path = None
    failed_requests = 0

    def guess_type(self, path):
        if path.endswith('.webmanifest'):
            return 'application/manifest+json'
        return super().guess_type(path)

    def translate_path(self, request_path):
        path = unquote(urlsplit(request_path).path)
        if path in (BASE_PATH, BASE_PATH + 'index.html'):
            relative = 'index.html'
        elif path.startswith(BASE_PATH):
            relative = path[len(BASE_PATH):]
        else:
            relative = path.lstrip('/')
        return str(self.root / relative)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == self.failure_path:
            type(self).failed_requests += 1
            self.send_error(503, 'Simulated temporary asset failure')
            return
        return super().do_GET()

    def end_headers(self):
        if self.path.split('?', 1)[0] in (BASE_PATH, BASE_PATH + 'index.html'):
            # Model a fresh, cached GitHub Pages HTML response. SW navigation and
            # update installation must bypass this response after a new build.
            self.send_header('Cache-Control', 'public, max-age=600')
        super().end_headers()

    def log_message(self, _format, *_args):
        pass


with tempfile.TemporaryDirectory(prefix='heibon-pwa-browser-') as tmp:
    PagesHandler.root = Path(tmp)
    shutil.copytree(DIST, PagesHandler.root, dirs_exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), PagesHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f'http://127.0.0.1:{server.server_port}{BASE_PATH}'

    with sync_playwright() as playwright:
        browser = getattr(playwright, os.environ.get('HEIBON_BROWSER', 'chromium')).launch()
        context = browser.new_context(viewport={'width': 390, 'height': 750}, service_workers='allow')
        page = context.new_page()
        page.goto(base_url, wait_until='networkidle')
        page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=20000)
        assert page.evaluate('async () => { await navigator.serviceWorker.ready; return true; }')

        manifest = page.evaluate("""async () => {
          const response = await fetch('manifest.webmanifest');
          if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
          return {body: await response.json(), type: response.headers.get('content-type')};
        }""")
        assert manifest['body']['id'] == BASE_PATH
        assert manifest['body']['start_url'] == BASE_PATH
        assert manifest['body']['scope'] == BASE_PATH
        assert manifest['body']['display'] == 'standalone'
        assert 'manifest' in manifest['type']
        icons = [icon['src'] for icon in manifest['body']['icons']] + ['icons/icon-180.png']
        icon_results = page.evaluate("""async paths => Promise.all(paths.map(async path => {
          const response = await fetch(path);
          const bytes = new Uint8Array(await response.arrayBuffer());
          return {status: response.status, type: response.headers.get('content-type'),
            signature: Array.from(bytes.slice(0, 8)), width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]};
        }))""", icons)
        assert all(item['status'] == 200 and item['type'].startswith('image/png') and
                   item['signature'] == [137, 80, 78, 71, 13, 10, 26, 10] for item in icon_results), icon_results
        assert icon_results[0]['width'] == 192 and icon_results[-1]['width'] == 180
        assert page.evaluate("navigator.serviceWorker.controller.scriptURL.endsWith('/heibon-mahjong/sw.js')")
        cache_names = page.evaluate('caches.keys()')
        app_caches = [name for name in cache_names if name.startswith('heibon-mahjong-shell-')]
        assert len(app_caches) == 1, cache_names
        old_cache_name = app_caches[0]
        cached_urls = page.evaluate("""async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)""", old_cache_name)
        assert all(path == BASE_PATH or path.startswith(BASE_PATH) for path in cached_urls), cached_urls

        # First install must leave the ordinary browser entry usable.
        assert page.evaluate('window.matchMedia("(display-mode: standalone)").matches') is False
        page.locator('#main-menu-toggle').click()
        assert page.locator('#online-create-open').is_visible()
        page.locator('#main-menu-toggle').click()
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.locator('#app-idle').wait_for(state='visible')
        page.locator('#main-menu-toggle').click()
        page.locator('#new-game').click()
        page.locator('#confirm-new-game').click()
        page.locator('#local-table').wait_for(state='visible')
        assert page.locator('#player-hand li').count() in (13, 14)
        context.set_offline(False)
        page.reload(wait_until='networkidle')
        page.locator('#app-idle').wait_for(state='visible')
        page.locator('#main-menu-toggle').click()
        page.locator('#new-game').click()
        page.locator('#confirm-new-game').click()
        page.locator('#local-table').wait_for(state='visible')

        # Change the served build while its previous HTML is fresh in HTTP cache.
        index_path = PagesHandler.root / 'index.html'
        old_html = index_path.read_text(encoding='utf-8')
        index_path.write_text(old_html.replace('<main>', '<main data-pwa-version="v2">', 1), encoding='utf-8')
        sw_path = PagesHandler.root / 'sw.js'
        worker = sw_path.read_text(encoding='utf-8')
        match = re.search(r'const CACHE = "([^"]+)";', worker)
        assert match, 'versioned cache declaration missing'
        worker = worker[:match.start(1)] + match.group(1) + '-v2' + worker[match.end(1):]
        precache_match = re.search(r'const PRECACHE = (\[.*?\]);', worker)
        assert precache_match, 'precache URL list missing'
        precache = json.loads(precache_match.group(1))
        failed_asset = next(url for url in precache if url.endswith('.js'))
        sw_path.write_text(worker, encoding='utf-8')

        # A failed precache install must leave the old active worker and app
        # usable. After delivery recovers, a changed worker script can retry.
        PagesHandler.failure_path = failed_asset
        page.evaluate('async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); }')
        deadline = time.monotonic() + 20
        while PagesHandler.failed_requests == 0 and time.monotonic() < deadline:
            time.sleep(0.05)
        assert PagesHandler.failed_requests > 0, 'the simulated install asset failure was not requested'
        page.wait_for_function("async () => { const registration = await navigator.serviceWorker.getRegistration(); return !registration.installing && !registration.waiting; }")
        assert page.evaluate('navigator.serviceWorker.controller.scriptURL') == f'{base_url}sw.js'
        assert page.locator('#app-idle').is_visible()
        assert old_cache_name in page.evaluate('caches.keys()'), 'failed update removed the active version cache'
        PagesHandler.failure_path = None
        worker = sw_path.read_text(encoding='utf-8').replace('-v2";', '-v2-retry";')
        retry_cache = re.search(r'const CACHE = "([^"]+)";', worker)
        assert retry_cache, 'retry cache declaration missing'
        new_cache_name = retry_cache.group(1)
        sw_path.write_text(worker, encoding='utf-8')

        page.evaluate('async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); }')
        page.locator('#pwa-update-notice').wait_for(state='visible', timeout=20000)
        waiting_state = page.evaluate("""async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return {waiting: registration.waiting !== null, state: registration.waiting?.state};
        }""")
        assert waiting_state == {'waiting': True, 'state': 'installed'}, waiting_state
        cache_names = page.evaluate('caches.keys()')
        assert old_cache_name in cache_names, f'active cache was removed before user approval: {cache_names}'
        assert new_cache_name in cache_names, f'new waiting cache is missing: {cache_names}'
        assert page.locator('#local-table').is_visible(), 'update detection reloaded the in-progress CPU game'

        # A regular browser tab and an installed-app-like tab share the same
        # Service Worker scope. A second client must block an approved update.
        second_page = context.new_page()
        second_page.goto(base_url, wait_until='networkidle')
        second_page.wait_for_function('navigator.serviceWorker.controller !== null')
        page.on('dialog', lambda dialog: dialog.accept())
        page.locator('#pwa-update-notice button').click()
        page.get_by_text('別のタブでも開かれています。ほかのタブを閉じてから更新してください。').wait_for(timeout=10000)
        assert page.evaluate("document.querySelector('main').dataset.pwaVersion || 'v1'") == 'v1'
        assert page.locator('#local-table').is_visible(), 'blocked update interrupted the in-progress CPU game'
        second_page.close()

        page.locator('#pwa-update-notice button').click()
        page.wait_for_function("document.querySelector('main')?.dataset.pwaVersion === 'v2'", timeout=20000)
        page.wait_for_function("navigator.serviceWorker.controller?.scriptURL.endsWith('/heibon-mahjong/sw.js')")
        page.wait_for_function("name => caches.keys().then(keys => keys.filter(key => key.startsWith('heibon-mahjong-shell-')).length === 1 && keys.includes(name))", arg=new_cache_name)
        assert page.locator('#app-idle').is_visible()
        assert page.evaluate('navigator.onLine') is True

        print('PWA initial activation, manifest/icons, offline CPU game, failed-install recovery, stale-HTTP-cache update detection, multi-tab blocking, approved update and old-cache cleanup passed. Online/reconnect remains covered by the existing online browser and Worker tests; mobile installation remains unverified.')
        context.close()
        browser.close()
    server.shutdown()
    server.server_close()
