"""Install, offline-play, stale-cache update and multi-client PWA checks."""
import os
import json
import hashlib
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
    failed_request_paths = []
    worker_script_responses = []

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
            type(self).failed_request_paths.append(path)
            self.send_error(503, 'Simulated temporary asset failure')
            return
        if path == BASE_PATH + 'sw.js':
            # Record the actual worker body present when each request is served.
            # This distinguishes the failed v2 response from the recovery script.
            body = Path(self.translate_path(self.path)).read_bytes()
            match = re.search(rb'const CACHE = "([^"]+)";', body)
            type(self).worker_script_responses.append({
                'cache': match.group(1).decode('utf-8') if match else None,
                'sha256': hashlib.sha256(body).hexdigest(),
            })
        return super().do_GET()

    def end_headers(self):
        if self.path.split('?', 1)[0] in (BASE_PATH, BASE_PATH + 'index.html'):
            # Model a fresh, cached GitHub Pages HTML response. SW navigation and
            # update installation must bypass this response after a new build.
            self.send_header('Cache-Control', 'public, max-age=600')
        if self.path.split('?', 1)[0] == BASE_PATH + 'sw.js':
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, _format, *_args):
        pass


def write_worker_version(path, source):
    path.write_text(source, encoding='utf-8')
    # SimpleHTTPRequestHandler validators have one-second precision. Give
    # every simulated release a distinct Last-Modified value when updating twice.
    modified = max(time.time(), path.stat().st_mtime) + 2
    os.utime(path, (modified, modified))


def attach_worker_update_trace(page):
    page.evaluate("""async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      window.__pwaWorkerUpdates = [];
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        const record = () => {
          window.__pwaWorkerUpdates.push({
            state: worker?.state ?? null,
            scriptURL: worker?.scriptURL ?? null,
            time: performance.now()
          });
        };
        record();
        worker?.addEventListener('statechange', record);
      });
    }""")


def print_worker_diagnostics(page, stage):
    browser_state = page.evaluate("""async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const describe = worker => worker ? {state: worker.state, scriptURL: worker.scriptURL} : null;
      return {
        installing: describe(registration.installing), waiting: describe(registration.waiting),
        active: describe(registration.active), controller: describe(navigator.serviceWorker.controller),
        updates: window.__pwaWorkerUpdates ?? [], cacheNames: await caches.keys()
      };
    }""")
    print('PWA update diagnostic ' + stage + ': ' + json.dumps({
        'browser': browser_state,
        'failedRequests': PagesHandler.failed_requests,
        'failedRequestPaths': PagesHandler.failed_request_paths,
        'servedWorkerScripts': PagesHandler.worker_script_responses,
    }), flush=True)


VIEWPORTS = [(320, 568), (375, 560), (375, 635), (390, 844), (430, 844)]


def wait_for_human_discard(page):
    """A visible table can still be running the randomly seated CPU dealer.

    Stop at a human input boundary, without selecting a tile or changing the
    game during the notification comparisons. Pass intervening call/ron offers.
    """
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        page.wait_for_function("""() => {
          const visible = node => node && node.getClientRects().length > 0;
          return document.querySelector('#player-hand button:enabled') ||
            ['#pass-calls', '#pass-ron'].some(selector => {
              const button = document.querySelector(selector);
              return visible(button) && !button.disabled;
            });
        }""", timeout=max(1, int((deadline - time.monotonic()) * 1000)))
        if page.locator('#player-hand button:enabled').count():
            page.locator('#discard').wait_for(state='visible')
            return
        for selector in ('#pass-calls', '#pass-ron'):
            button = page.locator(selector)
            if button.is_visible() and button.is_enabled():
                button.click()
                break
    raise AssertionError('CPU startup did not reach a human discard boundary')


def geometry(page):
    return page.evaluate("""async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = selector => {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        return r ? {x:r.x, y:r.y, width:r.width, height:r.height} : null;
      };
      return {header:rect('.app-header'), title:rect('.app-header h1'),
        table:rect('#local-table'), controls:rect('#local-game-controls'),
        update:rect('#pwa-update-notice button'), menu:rect('#main-menu-toggle'),
        scroll:[scrollX,scrollY], overflow:document.documentElement.scrollWidth > innerWidth,
        gameState: {
          status:document.querySelector('#local-game-controls [data-panel-part="action-status"]').textContent,
          enabledHand:document.querySelectorAll('#player-hand button:enabled').length,
          wall:document.querySelector('#wall-count').textContent,
          buttons:Array.from(document.querySelectorAll('#local-game-controls button'))
            .filter(button => button.getClientRects().length > 0)
            .map(button => ({part:button.dataset.panelPart, text:button.textContent, disabled:button.disabled}))
        }};
    }""")


def assert_layout(before, after):
    assert before['gameState'] == after['gameState'], ('different game states', before, after)
    assert before['gameState']['enabledHand'] > 0, before
    assert before['header']['height'] == after['header']['height'] == 44, (before, after)
    for key in ('table', 'controls', 'scroll'):
        assert before[key] == after[key], (key, before, after)
    assert not after['overflow'], after
    update, menu, title = (after[key] for key in ('update', 'menu', 'title'))
    assert title['x'] + title['width'] <= update['x'], after
    assert update['x'] + update['width'] <= menu['x'], after
    for button in (update, menu):
        assert button['width'] >= 44 and button['height'] >= 44, after
        assert button['x'] >= 0 and button['x'] + button['width'] <= after['header']['x'] + after['header']['width'], after


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
        page.evaluate('async () => { await navigator.serviceWorker.ready; }')
        page.reload()  # Root SW avoids clients.claim: it must not steal dev clients.
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
        page.set_viewport_size({'width': 320, 'height': 568})
        page.locator('#main-menu-toggle').click()
        page.locator('#new-game').click()
        page.locator('#confirm-new-game').click()
        page.locator('#local-table').wait_for(state='visible')

        startup = geometry(page)
        wait_for_human_discard(page)
        print('PWA startup before/after human input boundary: ' + json.dumps({
            'initial': startup, 'ready': geometry(page)}), flush=True)
        baseline = {}
        for width, height in VIEWPORTS:
            page.set_viewport_size({'width': width, 'height': height})
            baseline[(width, height)] = geometry(page)
            assert page.locator('#pwa-update-notice').count() == 0

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
        write_worker_version(sw_path, worker)

        # A failed precache install must leave the old active worker and app
        # usable. Track the worker state transition: registration.update() only
        # resolves the update check, not the later install event's completion.
        PagesHandler.failed_requests = 0
        PagesHandler.failed_request_paths = []
        PagesHandler.worker_script_responses = []
        attach_worker_update_trace(page)
        first_worker_response = len(PagesHandler.worker_script_responses)
        PagesHandler.failure_path = failed_asset
        page.evaluate('async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); }')
        deadline = time.monotonic() + 20
        while PagesHandler.failed_requests == 0 and time.monotonic() < deadline:
            time.sleep(0.05)
        assert PagesHandler.failed_requests > 0, 'the simulated install asset failure was not requested'
        try:
            page.wait_for_function("""async () => {
              const registration = await navigator.serviceWorker.getRegistration();
              const updates = window.__pwaWorkerUpdates ?? [];
              return updates.some(update => update.state === 'redundant') &&
                !registration.installing && !registration.waiting;
            }""", timeout=20000)
        except Exception:
            print_worker_diagnostics(page, 'failed precache install did not settle')
            raise
        first_update_state = page.evaluate("""async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return {active: registration.active?.state, waiting: registration.waiting,
            updates: window.__pwaWorkerUpdates};
        }""")
        assert first_update_state['active'] == 'activated' and first_update_state['waiting'] is None, first_update_state
        served_v2 = PagesHandler.worker_script_responses[first_worker_response:]
        assert any(item['cache'] == match.group(1) + '-v2' for item in served_v2), (
            'the v2 worker script was not served for the failed install', served_v2)
        assert set(PagesHandler.failed_request_paths) == {failed_asset}, PagesHandler.failed_request_paths
        assert page.evaluate('navigator.serviceWorker.controller.scriptURL') == f'{base_url}sw.js'
        assert page.locator('#local-table').is_visible(), 'failed update interrupted the in-progress CPU game'
        assert old_cache_name in page.evaluate('caches.keys()'), 'failed update removed the active version cache'
        worker = sw_path.read_text(encoding='utf-8').replace('-v2";', '-v2-retry";')
        retry_cache = re.search(r'const CACHE = "([^"]+)";', worker)
        assert retry_cache, 'retry cache declaration missing'
        new_cache_name = retry_cache.group(1)
        write_worker_version(sw_path, worker)
        # The failed install is now confirmed redundant, so no -v2 install can
        # remain in flight while the recovery script and asset delivery change.
        PagesHandler.failure_path = None

        second_worker_response = len(PagesHandler.worker_script_responses)
        page.evaluate('async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); }')
        try:
            page.wait_for_function("""async cacheName => {
              const registration = await navigator.serviceWorker.getRegistration();
              const updates = window.__pwaWorkerUpdates ?? [];
              return updates.some(update => update.state === 'installed') &&
                registration.waiting?.state === 'installed' &&
                (await caches.keys()).includes(cacheName);
            }""", arg=new_cache_name, timeout=20000)
        except Exception:
            print_worker_diagnostics(page, 'retry install did not reach waiting state')
            raise
        page.locator('#pwa-update-notice').wait_for(state='visible', timeout=20000)
        served_retry = PagesHandler.worker_script_responses[second_worker_response:]
        assert any(item['cache'] == new_cache_name for item in served_retry), (
            'the -v2-retry worker script was not served before its cache was expected', served_retry)
        waiting_state = page.evaluate("""async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return {waiting: registration.waiting !== null, state: registration.waiting?.state,
            updates: window.__pwaWorkerUpdates};
        }""")
        assert waiting_state['waiting'] is True and waiting_state['state'] == 'installed', waiting_state
        cache_names = page.evaluate('caches.keys()')
        assert old_cache_name in cache_names, f'active cache was removed before user approval: {cache_names}'
        assert new_cache_name in cache_names, f'new waiting cache {new_cache_name} is missing: {cache_names}'
        assert page.locator('#local-table').is_visible(), 'update detection reloaded the in-progress CPU game'

        # A regular browser tab and an installed-app-like tab share the same
        # Service Worker scope. A second client must block an approved update.
        second_page = context.new_page()
        second_page.goto(base_url, wait_until='networkidle')
        second_page.wait_for_function('navigator.serviceWorker.controller !== null')
        measurements = []
        for width, height in VIEWPORTS:
            page.set_viewport_size({'width': width, 'height': height})
            before = baseline[(width, height)]
            available = geometry(page)
            assert_layout(before, available)
            assert page.locator('.app-header #pwa-update-notice').count() == 1
            assert page.get_by_role('button', name='更新あり').count() == 1
            page.locator('#main-menu-toggle').click()
            assert page.locator('#main-menu-toggle').get_attribute('aria-expanded') == 'true'
            page.locator('#main-menu-toggle').click()
            dialogs = []
            def cancel(dialog):
                dialogs.append(dialog.type)
                dialog.dismiss()
            page.on('dialog', cancel)
            page.locator('#pwa-update-notice button').click()
            page.remove_listener('dialog', cancel)
            assert dialogs == ['confirm'], dialogs
            cancelled = geometry(page)
            assert_layout(before, cancelled)
            assert page.evaluate('async () => !!(await navigator.serviceWorker.getRegistration()).waiting')
            dialogs = []
            def approve(dialog):
                dialogs.append(dialog.type)
                dialog.accept()
            page.on('dialog', approve)
            page.locator('#pwa-update-notice button').click()
            page.wait_for_function("document.querySelector('#pwa-update-status').textContent.startsWith('別のタブ')")
            page.wait_for_function("async () => !!(await navigator.serviceWorker.getRegistration()).waiting")
            # The alert communicates the reason visually without another header row.
            deadline = time.monotonic() + 10
            while len(dialogs) < 2 and time.monotonic() < deadline:
                page.wait_for_timeout(50)
            page.remove_listener('dialog', approve)
            assert dialogs == ['confirm', 'alert'], dialogs
            blocked = geometry(page)
            assert_layout(before, blocked)
            assert page.locator('#local-table').is_visible()
            assert page.evaluate("document.querySelector('main').dataset.pwaVersion || 'v1'") == 'v1'
            measurements.append({'viewport':[width,height], 'none':before, 'available':available,
                                 'cancelled':cancelled, 'blocked':blocked, 'confirmation':'native confirm opened and dismissed'})
        output = Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
        output.mkdir(parents=True, exist_ok=True)
        (output / f'pwa-header-{os.environ.get("HEIBON_BROWSER", "chromium")}.json').write_text(json.dumps(measurements, indent=2))
        print('PWA header measurements: ' + json.dumps(measurements), flush=True)
        page.on('dialog', lambda dialog: dialog.accept())
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
