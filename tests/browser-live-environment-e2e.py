"""Explicit Phase 6-B E2E against the published production and development Pages."""
import hashlib
import json
import os
import platform
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


ENVIRONMENTS = (
    {
        "name": "production",
        "pages_url": "https://ak-sekine.github.io/heibon-mahjong/",
        "worker_url": "https://heibon-mahjong-online.ak-sekine.workers.dev",
        "title": "Heibon Mahjong",
        "release_path": "site/release.json",
    },
    {
        "name": "development",
        "pages_url": "https://ak-sekine.github.io/heibon-mahjong/dev/",
        "worker_url": "https://heibon-mahjong-online-dev.ak-sekine.workers.dev",
        "title": "Heibon Mahjong DEV",
        "release_path": "site/dev/release.json",
    },
)
RESOURCE_TYPES = {"document", "script", "stylesheet", "image", "font", "manifest"}
PRODUCTION_RULES_KEY = "heibon-mahjong-last-rules"
DEVELOPMENT_RULES_KEY = "heibon-mahjong-dev:heibon-mahjong-last-rules"
PRODUCTION_SESSION_KEY = "heibon-mahjong-online-session"
DEVELOPMENT_SESSION_KEY = "heibon-mahjong-dev:heibon-mahjong-online-session"
PRODUCTION_CACHE_PREFIX = "heibon-mahjong-shell-"
DEVELOPMENT_CACHE_PREFIX = "heibon-mahjong-dev-shell-"


class LiveE2EFailure(RuntimeError):
    pass


def require(condition, code):
    if not condition:
        raise LiveE2EFailure(code)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def write_report(report):
    path = Path(os.environ["LIVE_E2E_REPORT"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def origin(value):
    parsed = urlsplit(value)
    return f"{parsed.scheme}://{parsed.hostname}" if parsed.scheme and parsed.hostname else "invalid-origin"


def configure_page(page, environment, page_report, allowed_worker_urls=None):
    worker_urls = allowed_worker_urls or [environment["worker_url"]]
    pages_host = urlsplit(environment["pages_url"]).hostname
    worker_hosts = {urlsplit(value).hostname for value in worker_urls}
    expected_hosts = {pages_host, *worker_hosts}
    page_report.setdefault("blockedExternalHosts", [])
    page_report.setdefault("httpOrigins", [])
    page_report.setdefault("websocketOrigins", [])
    page_report.setdefault("pageErrorTypes", [])
    page_report.setdefault("consoleErrorCount", 0)

    def guard_host(route):
        parsed = urlsplit(route.request.url)
        allowed_scheme = parsed.scheme == "https" or (parsed.scheme == "wss" and parsed.hostname in worker_hosts)
        if not allowed_scheme or parsed.hostname not in expected_hosts:
            page_report["blockedExternalHosts"].append(parsed.hostname or "invalid-url")
            route.abort("blockedbyclient")
            return
        route.continue_()

    def record_http_request(request):
        request_origin = origin(request.url)
        target = "websocketOrigins" if urlsplit(request.url).scheme == "wss" else "httpOrigins"
        if request_origin not in page_report[target]:
            page_report[target].append(request_origin)

    page.route("**/*", guard_host)
    page.on("request", record_http_request)
    page.on("pageerror", lambda error: page_report["pageErrorTypes"].append(type(error).__name__))
    page.on(
        "console",
        lambda message: page_report.__setitem__(
            "consoleErrorCount", page_report["consoleErrorCount"] + 1
        ) if message.type == "error" else None,
    )
    page.on("websocket", lambda socket: page_report["websocketOrigins"].append(origin(socket.url)))
    return page


def make_page(browser, environment, page_report, viewport=None, allowed_worker_urls=None):
    context = browser.new_context(
        viewport=viewport or {"width": 390, "height": 844},
        service_workers="allow",
    )
    page = context.new_page()
    configure_page(page, environment, page_report, allowed_worker_urls)
    return context, page


def open_public_page(page, environment, *, wait_until="networkidle"):
    response = page.goto(environment["pages_url"], wait_until=wait_until, timeout=30_000)
    require(response is not None and response.status == 200, f"entry-status-{environment['name']}")
    require(page.url == environment["pages_url"], f"entry-redirect-{environment['name']}")
    page.locator("#app-idle").wait_for(state="visible", timeout=15_000)
    return response


def open_menu_item(page, selector):
    if page.locator("#main-menu-items").is_hidden():
        page.locator("#main-menu-toggle").click()
    page.locator(selector).click()


def verify_worker_configuration(page, environment):
    open_menu_item(page, "#menu-diagnostics")
    page.locator("#diagnostic-origin-info").wait_for(state="visible", timeout=5_000)
    info = page.locator("#diagnostic-origin-info").inner_text()
    expected = f"API Origin: {environment['worker_url']}"
    matched = expected in info
    page.locator("#diagnostic-close").click()
    require(matched, f"worker-config-mismatch-{environment['name']}")


def require_worker_origins(page_report, environment, *, previous_count=0):
    observed = page_report["websocketOrigins"][previous_count:]
    expected_host = urlsplit(environment["worker_url"]).hostname
    require(observed, f"worker-websocket-missing-{environment['name']}")
    require(
        all(urlsplit(item).hostname == expected_host for item in observed),
        f"worker-websocket-origin-mismatch-{environment['name']}",
    )
    return sorted(set(observed))


def session_key_presence(page):
    return page.evaluate(
        "keys => Object.fromEntries(keys.map(key => [key, sessionStorage.getItem(key) !== null]))",
        [PRODUCTION_SESSION_KEY, DEVELOPMENT_SESSION_KEY],
    )


def start_cpu_and_discard(page, report, suffix):
    page.locator("#main-menu-toggle").click()
    page.locator("#new-game").click()
    require(page.locator("#new-game-dialog").evaluate("dialog => dialog.open"), f"new-game-dialog-{suffix}")
    page.locator("#confirm-new-game").click()
    page.locator("#local-table").wait_for(state="visible", timeout=15_000)
    page.wait_for_function(
        "document.body.dataset.gameMode === 'offline' && document.querySelectorAll('#player-hand button:enabled').length >= 13",
        timeout=20_000,
    )
    report["cpuGameStarted"] = True
    river = page.locator('.river[data-player-id="0"] svg')
    before_discard = river.count()
    page.locator("#player-hand button:enabled").first.click()
    page.wait_for_function("!document.querySelector('#discard').disabled", timeout=5_000)
    page.locator("#discard").click()
    page.wait_for_function(
        "before => document.querySelectorAll('.river[data-player-id=\"0\"] svg').length > before",
        arg=before_discard,
        timeout=10_000,
    )
    report["discardCount"] = river.count() - before_discard
    require(report["discardCount"] == 1, f"cpu-discard-not-recorded-{suffix}")


def total_online_river_tiles(page):
    return page.evaluate("document.querySelectorAll('#online-table [data-online-river] .river-tile').length")


def create_room(page, display_name):
    open_menu_item(page, "#online-create-open")
    page.locator("#online-create-name").fill(display_name)
    page.locator("#online-create").click()
    page.wait_for_function(
        """() => document.querySelector('#online-dialog').open &&
          /^[A-HJ-NP-Z2-9]{6}$/.test(document.querySelector('#online-room-code').textContent.trim()) &&
          !document.querySelector('#online-ready').hidden""",
        timeout=30_000,
    )
    require(page.locator("#online-seats").inner_text().find(display_name) >= 0, "host-room-not-visible")
    return page.locator("#online-room-code").inner_text().strip()


def join_room(page, display_name, room_code):
    open_menu_item(page, "#online-join-open")
    page.locator("#online-join-name").fill(display_name)
    page.locator("#online-join-code").fill(room_code)
    page.locator("#online-join").click()
    page.wait_for_function(
        """() => document.querySelector('#online-dialog').open &&
          !document.querySelector('#online-ready').hidden &&
          document.querySelector('#online-seats').innerText.includes('P6B-')""",
        timeout=30_000,
    )
    require(display_name in page.locator("#online-seats").inner_text(), "guest-room-not-visible")


def start_online_game(host_page, guest_page, guest_name):
    host_page.locator("#online-ready").click()
    guest_page.locator("#online-ready").click()
    host_page.wait_for_function(
        "!document.querySelector('#online-finalize').disabled && !document.querySelector('#online-finalize').hidden",
        timeout=20_000,
    )
    host_page.locator("#online-finalize").click()
    host_page.wait_for_function("!document.querySelector('#online-start-game').hidden", timeout=20_000)
    host_page.locator("#online-start-game").click()
    for page in (host_page, guest_page):
        page.locator("#online-match").wait_for(state="visible", timeout=30_000)
    host_page.locator("#online-player-hand button[data-tile-id]:not([disabled])").first.wait_for(timeout=30_000)
    require(guest_name in guest_page.locator("#online-score-strip").inner_text(), "guest-name-not-in-match")


def online_discard_and_sync(host_page, guest_page, guest_name, page_report):
    before = total_online_river_tiles(host_page)
    host_page.locator("#online-player-hand button[data-tile-id]:not([disabled])").first.click()
    host_page.locator("#online-discard").wait_for(state="visible", timeout=5_000)
    host_page.wait_for_function("!document.querySelector('#online-discard').disabled", timeout=5_000)
    host_page.locator("#online-discard").click()
    guest_page.wait_for_function(
        "name => document.querySelector('#online-game-action-status').textContent.includes(name)",
        arg=guest_name,
        timeout=30_000,
    )
    host_page.wait_for_function(
        "expected => document.querySelector('#online-game-action-status').textContent === expected",
        arg=guest_page.locator("#online-game-action-status").inner_text(),
        timeout=10_000,
    )
    host_count = total_online_river_tiles(host_page)
    guest_count = total_online_river_tiles(guest_page)
    require(host_count > before and host_count == guest_count, "online-discard-state-not-synchronized")
    page_report["synchronizedRiverTileCount"] = host_count


def disconnect_reconnect_guest(guest_context, guest_page, host_page, guest_report, environment, *, previous_count=0):
    guest_report["websocketCountBeforeReconnect"] = len(guest_report["websocketOrigins"])
    guest_context.set_offline(True)
    guest_page.wait_for_function(
        """() => {
          const status = document.querySelector('#online-connection');
          return status && (!status.hidden || !document.querySelector('#online-reconnect').hidden);
        }""",
        timeout=20_000,
    )
    guest_context.set_offline(False)
    if not guest_page.locator("#online-reconnect").is_hidden():
        guest_page.locator("#online-reconnect").click()
    guest_page.wait_for_function(
        """() => document.querySelector('#online-match') && !document.querySelector('#online-match').hidden &&
          document.querySelector('#online-connection').hidden""",
        timeout=30_000,
    )
    require(
        total_online_river_tiles(guest_page) == total_online_river_tiles(host_page),
        "reconnected-game-state-not-restored",
    )
    guest_report["reconnectRestoredGameState"] = True
    guest_report["websocketCountAfterReconnect"] = len(guest_report["websocketOrigins"])
    require(
        guest_report["websocketCountAfterReconnect"] > guest_report["websocketCountBeforeReconnect"],
        f"websocket-not-reopened-{environment['name']}",
    )
    require_worker_origins(guest_report, environment, previous_count=previous_count)


def load_service_worker(page, environment):
    scope = environment["pages_url"]
    script = scope + "sw.js"
    page.wait_for_function(
        """expected => navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(registrations =>
          registrations.some(registration => registration.scope === expected.scope &&
            registration.active && registration.active.scriptURL === expected.script))""",
        arg={"scope": scope, "script": script},
        timeout=30_000,
    )
    page.reload(wait_until="networkidle", timeout=30_000)
    page.wait_for_function(
        "expected => navigator.serviceWorker.controller?.scriptURL === expected",
        arg=script,
        timeout=30_000,
    )
    return page.evaluate(
        """() => navigator.serviceWorker.getRegistrations().then(registrations => {
          const registration = registrations.find(value => value.active?.scriptURL === navigator.serviceWorker.controller?.scriptURL);
          return {scope: registration?.scope ?? null, script: registration?.active?.scriptURL ?? null,
            hasWaitingWorker: Boolean(registration?.waiting)};
        })"""
    )


def cache_inventory(page):
    return page.evaluate(
        """async () => {
          const result = {};
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            result[name] = (await cache.keys()).map(request => new URL(request.url).pathname).sort();
          }
          return result;
        }"""
    )


def expected_cache_inventory(inventory, environment):
    prefix = DEVELOPMENT_CACHE_PREFIX if environment["name"] == "development" else PRODUCTION_CACHE_PREFIX
    own_names = [name for name in inventory if name.startswith(prefix)]
    require(own_names, f"cache-namespace-missing-{environment['name']}")
    expected_prefix = environment["pages_url"].replace("https://ak-sekine.github.io", "")
    for name in own_names:
        require(
            all(path.startswith(expected_prefix) for path in inventory[name]),
            f"cache-content-cross-environment-{environment['name']}",
        )
        if environment["name"] == "production":
            development_path = urlsplit(ENVIRONMENTS[1]["pages_url"]).path
            require(
                all(not path.startswith(development_path) for path in inventory[name]),
                "production-cache-contains-development-path",
            )
    return own_names


def read_rule_editor(page):
    return page.evaluate(
        """() => ({
          matchFormat: document.querySelector('#new-game-rules-editor input[name="new-game-rules-editor-match-format"]:checked')?.value,
          doubleYakuman: document.querySelector('#new-game-rules-editor input[data-rule-key="doubleYakuman"]')?.checked
        })"""
    )


def set_and_save_rules(page, match_format, double_yakuman, label):
    open_menu_item(page, "#new-game")
    page.locator(f'input[name="new-game-rules-editor-match-format"][value="{match_format}"]').check()
    control = page.locator('#new-game-rules-editor input[data-rule-key="doubleYakuman"]')
    if double_yakuman:
        control.check()
    else:
        control.uncheck()
    page.locator("#confirm-new-game").click()
    page.locator("#local-table").wait_for(state="visible", timeout=15_000)
    page.wait_for_function("document.body.dataset.gameMode === 'offline'", timeout=10_000)
    saved = page.evaluate(
        """key => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const value = JSON.parse(raw);
          return {matchFormat: value.rules?.matchFormat, doubleYakuman: value.rules?.doubleYakuman};
        }""",
        label,
    )
    require(saved == {"matchFormat": match_format, "doubleYakuman": double_yakuman}, f"rules-not-saved-{match_format}")


def reopen_and_check_rules(page, match_format, double_yakuman, label):
    open_menu_item(page, "#new-game")
    values = read_rule_editor(page)
    require(
        values == {"matchFormat": match_format, "doubleYakuman": double_yakuman},
        f"rules-not-restored-{label}",
    )
    page.locator("#cancel-new-game").click()


def run_online_checks(browser, browser_name, report, save_report):
    browser_letter = "C" if browser_name == "chromium" else "W"
    tag = os.environ.get("GITHUB_RUN_ID", os.environ.get("GITHUB_SHA", "local")[:7])[-10:]
    online_results = {environment["name"]: {} for environment in ENVIRONMENTS}
    observer = {
        "host": {
            "blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [],
            "pageErrorTypes": [], "consoleErrorCount": 0,
            "allowedWorkerHost": urlsplit(ENVIRONMENTS[0]["worker_url"]).hostname,
        },
        "guest": {
            "blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [],
            "pageErrorTypes": [], "consoleErrorCount": 0,
            "allowedWorkerHost": urlsplit(ENVIRONMENTS[0]["worker_url"]).hostname,
        },
    }
    report["online"] = online_results
    save_report()
    host_context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="allow")
    guest_context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="allow")
    host_page = None
    guest_page = None
    try:
        host_page = host_context.new_page()
        guest_page = guest_context.new_page()
        # The same tabs cross between the two fixed Pages paths to prove that
        # each build selects its own session key and Worker after navigation.
        for page, label in ((host_page, "host"), (guest_page, "guest")):
            page_report = observer[label]
            pages_host = urlsplit(ENVIRONMENTS[0]["pages_url"]).hostname

            def guard_host(route, *, page_report=page_report, pages_host=pages_host):
                parsed = urlsplit(route.request.url)
                allowed_scheme = parsed.scheme == "https" or (
                    parsed.scheme == "wss" and parsed.hostname == page_report["allowedWorkerHost"]
                )
                if not allowed_scheme or (parsed.hostname != pages_host and parsed.hostname != page_report["allowedWorkerHost"]):
                    page_report["blockedExternalHosts"].append(parsed.hostname or "invalid-url")
                    route.abort("blockedbyclient")
                    return
                route.continue_()

            page.route("**/*", guard_host)
            def record_request(request, *, page_report=page_report):
                target = "websocketOrigins" if urlsplit(request.url).scheme == "wss" else "httpOrigins"
                request_origin = origin(request.url)
                if request_origin not in page_report[target]:
                    page_report[target].append(request_origin)

            page.on("request", record_request)
            page.on("pageerror", lambda error, page_report=page_report: page_report["pageErrorTypes"].append(type(error).__name__))
            page.on(
                "console",
                lambda message, page_report=page_report: page_report.__setitem__(
                    "consoleErrorCount", page_report["consoleErrorCount"] + 1
                ) if message.type == "error" else None,
            )
            page.on("websocket", lambda socket, page_report=page_report: page_report["websocketOrigins"].append(origin(socket.url)))

        for index, environment in enumerate(ENVIRONMENTS):
            key = environment["name"]
            stage_report = {
                "status": "NOT_STARTED",
                "pagesUrl": environment["pages_url"],
                "configuredWorkerOrigin": origin(environment["worker_url"]),
                "roomCreated": False,
                "guestJoined": False,
                "gameStarted": False,
                "discardSynchronized": False,
                "guestDisconnected": False,
                "guestReconnected": False,
                "sessionKeys": {},
                "websocketOrigins": [],
                "httpOrigins": [],
            }
            online_results[key] = stage_report
            save_report()
            for label in ("host", "guest"):
                observer[label]["allowedWorkerHost"] = urlsplit(environment["worker_url"]).hostname
            host_socket_start = len(observer["host"]["websocketOrigins"])
            guest_socket_start = len(observer["guest"]["websocketOrigins"])
            host_http_start = len(observer["host"]["httpOrigins"])
            guest_http_start = len(observer["guest"]["httpOrigins"])
            if index == 0:
                open_public_page(host_page, environment)
                open_public_page(guest_page, environment)
            else:
                prior = ENVIRONMENTS[index - 1]
                for page, label in ((host_page, "host"), (guest_page, "guest")):
                    response = page.goto(environment["pages_url"], wait_until="networkidle", timeout=30_000)
                    require(response is not None and response.status == 200, f"cross-path-entry-{label}-{key}")
                    require(page.url == environment["pages_url"], f"cross-path-redirect-{label}-{key}")
                    page.locator("#app-idle").wait_for(state="visible", timeout=15_000)
                    keys = session_key_presence(page)
                    expected_prior_key = PRODUCTION_SESSION_KEY if prior["name"] == "production" else DEVELOPMENT_SESSION_KEY
                    expected_current_key = PRODUCTION_SESSION_KEY if key == "production" else DEVELOPMENT_SESSION_KEY
                    require(keys[expected_prior_key] and not keys[expected_current_key], f"cross-environment-session-selected-{label}-{key}")
                    require(page.locator("#online-dialog").evaluate("dialog => !dialog.open"), f"cross-environment-session-auto-joined-{label}-{key}")
                    require(page.locator("#menu-room").is_hidden(), f"cross-environment-room-menu-visible-{label}-{key}")
            verify_worker_configuration(host_page, environment)
            verify_worker_configuration(guest_page, environment)

            suffix = "P" if key == "production" else "D"
            host_name = f"P6B-{browser_letter}-{suffix}-H-{tag}"
            guest_name = f"P6B-{browser_letter}-{suffix}-G-{tag}"
            room_code = create_room(host_page, host_name)
            stage_report["roomCreated"] = True
            host_keys = session_key_presence(host_page)
            expected_session_key = PRODUCTION_SESSION_KEY if key == "production" else DEVELOPMENT_SESSION_KEY
            opposite_session_key = DEVELOPMENT_SESSION_KEY if key == "production" else PRODUCTION_SESSION_KEY
            require(host_keys[expected_session_key], f"host-session-key-missing-{key}")
            if index == 0:
                require(not host_keys[opposite_session_key], f"host-opposite-session-key-present-{key}")
            guest_keys_before_join = session_key_presence(guest_page)
            require(not guest_keys_before_join[expected_session_key], f"guest-session-existed-before-join-{key}")
            if index == 1:
                require(guest_keys_before_join[opposite_session_key], f"guest-prior-session-missing-{key}")
            join_room(guest_page, guest_name, room_code)
            stage_report["guestJoined"] = True
            start_online_game(host_page, guest_page, guest_name)
            stage_report["gameStarted"] = True
            online_discard_and_sync(host_page, guest_page, guest_name, stage_report)
            stage_report["discardSynchronized"] = True

            require_worker_origins(observer["host"], environment, previous_count=host_socket_start)
            require_worker_origins(observer["guest"], environment, previous_count=guest_socket_start)
            disconnect_reconnect_guest(
                guest_context, guest_page, host_page, observer["guest"], environment,
                previous_count=guest_socket_start,
            )
            stage_report["guestDisconnected"] = True
            stage_report["guestReconnected"] = True
            stage_report["sessionKeys"] = {
                "expectedEnvironmentKeyPresent": True,
                "oppositeEnvironmentKeyPresent": bool(session_key_presence(host_page)[opposite_session_key]),
                "guestExpectedEnvironmentKeyPresent": bool(session_key_presence(guest_page)[expected_session_key]),
                "guestOppositeEnvironmentKeyPresent": bool(session_key_presence(guest_page)[opposite_session_key]),
            }
            stage_report["websocketOrigins"] = sorted(
                set(observer["host"]["websocketOrigins"][host_socket_start:] + observer["guest"]["websocketOrigins"][guest_socket_start:])
            )
            stage_report["httpOrigins"] = sorted(
                set(
                    observer["host"]["httpOrigins"][host_http_start:]
                    + observer["guest"]["httpOrigins"][guest_http_start:]
                )
            )
            stage_report["status"] = "PASSED"
            save_report()

        # Both same-origin session keys should now coexist in the same tab
        # storage area. Navigate back through both URLs and prove each page
        # resumes its own saved room on its corresponding Worker.
        for environment in ENVIRONMENTS:
            key = environment["name"]
            for page, label in ((host_page, "host"), (guest_page, "guest")):
                previous_count = len(observer[label]["websocketOrigins"])
                observer[label]["allowedWorkerHost"] = urlsplit(environment["worker_url"]).hostname
                response = page.goto(environment["pages_url"], wait_until="networkidle", timeout=30_000)
                require(response is not None and response.status == 200, f"session-restore-entry-{label}-{key}")
                require(page.url == environment["pages_url"], f"session-restore-redirect-{label}-{key}")
                page.wait_for_function("!document.querySelector('#menu-room').hidden", timeout=20_000)
                page.wait_for_function(
                    "!document.querySelector('#online-match').hidden && document.querySelector('#online-connection').hidden",
                    timeout=30_000,
                )
                keys = session_key_presence(page)
                require(keys[PRODUCTION_SESSION_KEY] and keys[DEVELOPMENT_SESSION_KEY], f"session-key-coexistence-{label}")
                require_worker_origins(observer[label], environment, previous_count=previous_count)
            online_results[key]["crossPathSessionRestore"] = True
            online_results[key]["status"] = "PASSED"
            save_report()

        for label in ("host", "guest"):
            require(not observer[label]["blockedExternalHosts"], f"online-external-host-request-{label}")
            require(not observer[label]["pageErrorTypes"], f"online-page-error-{label}")
            require(not observer[label]["consoleErrorCount"], f"online-console-error-{label}")
        report["online"] = online_results
        report["workerEnvironmentSeparation"] = {
            key: {
                "expectedWorkerOrigin": origin(environment["worker_url"]),
                "observedWebSocketOrigins": online_results[key]["websocketOrigins"],
                "observedHttpOrigins": online_results[key]["httpOrigins"],
            }
            for key, environment in ((environment["name"], environment) for environment in ENVIRONMENTS)
        }
        save_report()
    finally:
        guest_context.close()
        host_context.close()


def run_storage_partition_check(browser, report, save_report):
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="allow")
    try:
        observers = {}
        production_observer = {"blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [], "pageErrorTypes": [], "consoleErrorCount": 0}
        observers["production"] = production_observer
        production = context.new_page()
        configure_page(production, ENVIRONMENTS[0], production_observer)
        open_public_page(production, ENVIRONMENTS[0])
        set_and_save_rules(production, "tonnan", True, PRODUCTION_RULES_KEY)
        page_storage = production.evaluate(
            "keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]))",
            [PRODUCTION_RULES_KEY, DEVELOPMENT_RULES_KEY],
        )
        require(page_storage[PRODUCTION_RULES_KEY] is not None, "production-rules-storage-missing")
        require(page_storage[DEVELOPMENT_RULES_KEY] is None, "development-rules-existed-before-use")

        development_observer = {"blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [], "pageErrorTypes": [], "consoleErrorCount": 0}
        observers["development"] = development_observer
        development = context.new_page()
        configure_page(development, ENVIRONMENTS[1], development_observer)
        open_public_page(development, ENVIRONMENTS[1])
        open_menu_item(development, "#new-game")
        initial_dev = read_rule_editor(development)
        require(
            initial_dev == {"matchFormat": "tonpu", "doubleYakuman": False},
            "development-rules-inherited-production-settings",
        )
        development.locator("#cancel-new-game").click()
        set_and_save_rules(development, "tonpu", False, DEVELOPMENT_RULES_KEY)

        saved = production.evaluate(
            """keys => Object.fromEntries(keys.map(key => {
              const value = JSON.parse(localStorage.getItem(key));
              return [key, {matchFormat: value.rules?.matchFormat, doubleYakuman: value.rules?.doubleYakuman}];
            }))""",
            [PRODUCTION_RULES_KEY, DEVELOPMENT_RULES_KEY],
        )
        require(saved[PRODUCTION_RULES_KEY] == {"matchFormat": "tonnan", "doubleYakuman": True}, "production-rules-overwritten")
        require(saved[DEVELOPMENT_RULES_KEY] == {"matchFormat": "tonpu", "doubleYakuman": False}, "development-rules-not-isolated")
        reopen_and_check_rules(production, "tonnan", True, "production")
        reopen_and_check_rules(development, "tonpu", False, "development")

        for key in ("production", "development"):
            require(not observers[key]["blockedExternalHosts"], f"storage-external-host-request-{key}")
            require(not observers[key]["pageErrorTypes"], f"storage-page-error-{key}")
            require(not observers[key]["consoleErrorCount"], f"storage-console-error-{key}")
        report["storageSeparation"] = {
            "sameBrowserContext": True,
            "sameOrigin": production.evaluate("location.origin") == development.evaluate("location.origin"),
            "productionRulesKey": PRODUCTION_RULES_KEY,
            "developmentRulesKey": DEVELOPMENT_RULES_KEY,
            "productionValuePreserved": True,
            "developmentValuePreserved": True,
            "crossTabLocalStorage": True,
            "sessionStorageKeysCheckedInOnlineFlow": True,
        }
        require(report["storageSeparation"]["sameOrigin"], "pages-not-same-origin")
        save_report()
    finally:
        context.close()


def run_pwa_and_multitab_check(browser, report, save_report):
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="allow")
    pages = {}
    observers = {}
    registrations = {}
    try:
        for environment in ENVIRONMENTS:
            key = environment["name"]
            observer = {"blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [], "pageErrorTypes": [], "consoleErrorCount": 0}
            page = context.new_page()
            configure_page(page, environment, observer)
            open_public_page(page, environment)
            manifest = page.evaluate(
                """async () => {
                  const link = document.querySelector('link[rel="manifest"]');
                  if (!link) return null;
                  const response = await fetch(link.href, {cache: 'no-store'});
                  if (!response.ok) return {httpStatus: response.status};
                  const value = await response.json();
                  return {
                    url: link.href,
                    id: value.id,
                    startUrl: value.start_url,
                    scope: value.scope,
                    httpStatus: response.status
                  };
                }"""
            )
            expected_path = urlsplit(environment["pages_url"]).path
            require(manifest is not None, f"manifest-missing-{key}")
            require(manifest["httpStatus"] == 200, f"manifest-status-{key}")
            require(manifest["url"] == environment["pages_url"] + "manifest.webmanifest", f"manifest-url-{key}")
            require(
                manifest["id"] == expected_path
                and manifest["startUrl"] == expected_path
                and manifest["scope"] == expected_path,
                f"manifest-scope-mismatch-{key}",
            )
            pwa = load_service_worker(page, environment)
            expected_script = environment["pages_url"] + "sw.js"
            expected_scope = environment["pages_url"]
            require(pwa["scope"] == expected_scope, f"service-worker-scope-{key}")
            require(pwa["script"] == expected_script, f"service-worker-script-{key}")
            registrations[key] = {
                "waitingWorkerPresent": pwa["hasWaitingWorker"],
                "manifest": manifest,
            }
            pages[key] = page
            observers[key] = observer

        production = pages["production"]
        development = pages["development"]
        require(
            production.evaluate("navigator.serviceWorker.controller?.scriptURL") == ENVIRONMENTS[0]["pages_url"] + "sw.js",
            "production-controller-changed-after-development-registration",
        )
        inventory = cache_inventory(development)
        production_cache_names = expected_cache_inventory(inventory, ENVIRONMENTS[0])
        development_cache_names = expected_cache_inventory(inventory, ENVIRONMENTS[1])
        require(set(production_cache_names).isdisjoint(development_cache_names), "cache-namespaces-overlap")

        # Open a second tab for each scope, then reload one tab per environment.
        second_tabs = {}
        for environment in ENVIRONMENTS:
            key = environment["name"]
            observer = {"blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [], "pageErrorTypes": [], "consoleErrorCount": 0}
            page = context.new_page()
            configure_page(page, environment, observer)
            open_public_page(page, environment)
            pwa = load_service_worker(page, environment)
            require(pwa["script"] == environment["pages_url"] + "sw.js", f"second-tab-worker-{key}")
            registrations[f"{key}SecondTab"] = {"waitingWorkerPresent": pwa["hasWaitingWorker"]}
            second_tabs[key] = page
            observers[f"{key}SecondTab"] = observer

        before_reload = {name: sorted(paths) for name, paths in inventory.items()}
        for key in ("production", "development"):
            second_tabs[key].reload(wait_until="networkidle", timeout=30_000)
            second_tabs[key].wait_for_function(
                "expected => navigator.serviceWorker.controller?.scriptURL === expected",
                arg=ENVIRONMENTS[0 if key == "production" else 1]["pages_url"] + "sw.js",
                timeout=20_000,
            )
        require(
            production.evaluate("navigator.serviceWorker.controller?.scriptURL") == ENVIRONMENTS[0]["pages_url"] + "sw.js",
            "production-controller-affected-by-other-tab",
        )
        require(
            development.evaluate("navigator.serviceWorker.controller?.scriptURL") == ENVIRONMENTS[1]["pages_url"] + "sw.js",
            "development-controller-affected-by-other-tab",
        )
        after_reload = {
            name: sorted(paths)
            for name, paths in cache_inventory(development).items()
        }
        require(before_reload == after_reload, "cache-namespace-changed-during-tab-reload")
        for key, observer in observers.items():
            require(not observer["blockedExternalHosts"], f"pwa-external-host-request-{key}")
            require(not observer["pageErrorTypes"], f"pwa-page-error-{key}")
            require(not observer["consoleErrorCount"], f"pwa-console-error-{key}")

        report["pwa"] = {
            "production": {"scope": ENVIRONMENTS[0]["pages_url"], "script": ENVIRONMENTS[0]["pages_url"] + "sw.js", "cacheNames": production_cache_names},
            "development": {"scope": ENVIRONMENTS[1]["pages_url"], "script": ENVIRONMENTS[1]["pages_url"] + "sw.js", "cacheNames": development_cache_names},
            "registrations": registrations,
        }
        report["multiTab"] = {
            "tabsPerEnvironment": 2,
            "productionAndDevelopmentControllersRemainDistinct": True,
            "crossEnvironmentReloadPreservedOtherController": True,
            "cacheNamesBefore": sorted(before_reload),
            "cacheNamesAfter": sorted(after_reload),
            "cacheContentsUnchanged": True,
            "waitingUpdateBehavior": "NOT_TESTED_NO_PUBLICATION_PERMITTED",
        }
        save_report()
    finally:
        context.close()


def run_offline_cpu_check(browser, environment, report, save_report):
    key = environment["name"]
    check = {
        "status": "NOT_STARTED",
        "pagesUrl": environment["pages_url"],
        "serviceWorkerControlledBeforeOffline": False,
        "offlineEntryStatus": None,
        "cpuGameStarted": False,
        "discardCount": 0,
        "networkRestored": False,
    }
    observer = {"blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [], "pageErrorTypes": []}
    context, page = make_page(browser, environment, observer)
    try:
        open_public_page(page, environment)
        pwa = load_service_worker(page, environment)
        require(pwa["script"] == environment["pages_url"] + "sw.js", f"offline-service-worker-{key}")
        inventory = cache_inventory(page)
        own_cache_names = expected_cache_inventory(inventory, environment)
        root_path = urlsplit(environment["pages_url"]).path
        require(
            any(root_path in inventory[name] for name in own_cache_names),
            f"offline-app-shell-not-cached-{key}",
        )
        check["serviceWorkerControlledBeforeOffline"] = True
        context.set_offline(True)
        response = page.goto(environment["pages_url"], wait_until="domcontentloaded", timeout=20_000)
        check["offlineEntryStatus"] = response.status if response else None
        require(response is not None and response.status == 200, f"offline-entry-failed-{key}")
        page.locator("#app-idle").wait_for(state="visible", timeout=15_000)
        start_cpu_and_discard(page, check, f"offline-{key}")
        require(not observer["pageErrorTypes"], f"offline-page-error-{key}")
        require(not observer["blockedExternalHosts"], f"offline-external-host-request-{key}")
        require(not observer["consoleErrorCount"], f"offline-console-error-{key}")
        check["status"] = "PASSED"
    finally:
        context.set_offline(False)
        check["networkRestored"] = True
        context.close()
        report.setdefault("offline", {})[key] = check
        save_report()




def main():
    browser_name = os.environ.get("HEIBON_BROWSER", "chromium")
    require(browser_name in {"chromium", "webkit"}, "unsupported-browser")
    snapshot_root = Path(os.environ["SNAPSHOT_ROOT"])
    report = {
        "schemaVersion": 1,
        "phase": "B1-B7",
        "outcome": "NOT_STARTED",
        "runId": os.environ.get("GITHUB_RUN_ID"),
        "attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "sourceSha": os.environ.get("GITHUB_SHA"),
        "snapshotSha": os.environ.get("SNAPSHOT_SHA"),
        "browser": browser_name,
        "python": platform.python_version(),
        "environments": [],
        "checks": {
            key: {"status": "NOT_STARTED"}
            for key in ("B1", "B2", "B3", "B4", "B5", "B6", "B7")
        },
    }
    stage = "snapshot-metadata"
    def save_report():
        write_report(report)

    try:
        state_path = snapshot_root / "state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        require(state.get("pending", "missing") is None, "snapshot-pending-not-null")
        current = state.get("current", {})
        require(isinstance(current, dict), "snapshot-current-missing")
        snapshot_site = snapshot_root / "site"
        report["snapshot"] = {
            "pendingNull": True,
            "productionSourceSha": current.get("production", {}).get("sha"),
            "developmentSourceSha": current.get("development", {}).get("sha"),
            "productionReleaseDigest": current.get("production", {}).get("digest"),
            "developmentReleaseDigest": current.get("development", {}).get("digest"),
        }

        with sync_playwright() as playwright:
            browser = getattr(playwright, browser_name).launch()
            report["browserVersion"] = browser.version
            try:
                request = playwright.request.new_context(timeout=20_000)
                try:
                    stage = "public-environments-metadata"
                    snapshot_environments_bytes = (snapshot_site / "environments.json").read_bytes()
                    response = request.get(
                        ENVIRONMENTS[0]["pages_url"] + "environments.json",
                        headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
                        max_redirects=0,
                    )
                    require(response.status == 200, "public-environments-json-status")
                    require(
                        response.url == ENVIRONMENTS[0]["pages_url"] + "environments.json",
                        "public-environments-json-redirect",
                    )
                    public_environments_bytes = response.body()
                    require(
                        sha256(public_environments_bytes) == sha256(snapshot_environments_bytes),
                        "public-environments-json-hash-mismatch",
                    )
                    public_environments = json.loads(public_environments_bytes)
                    require(public_environments == current, "public-environments-json-state-mismatch")
                    report["publicMetadata"] = {
                        "environmentsJsonSha256": sha256(public_environments_bytes),
                        "matchesSnapshot": True,
                    }

                    expected_releases = {}
                    for environment in ENVIRONMENTS:
                        key = environment["name"]
                        stage = f"snapshot-release-metadata-{key}"
                        state_release = current.get(key)
                        require(isinstance(state_release, dict), f"snapshot-release-missing-{key}")
                        release_path = snapshot_site / environment["release_path"].removeprefix("site/")
                        release_bytes = release_path.read_bytes()
                        release = json.loads(release_bytes)
                        require(release.get("environment") == key, f"snapshot-release-environment-{key}")
                        require(release.get("workerUrl") == environment["worker_url"], f"snapshot-worker-url-{key}")
                        require(release.get("workerUrl") == state_release.get("workerUrl"), f"snapshot-state-worker-url-{key}")
                        require(release.get("sha") == state_release.get("sha"), f"snapshot-source-sha-{key}")
                        require(release.get("digest") == state_release.get("digest"), f"snapshot-release-digest-{key}")
                        expected_releases[key] = (release, release_bytes)

                        live_release_response = request.get(
                            environment["pages_url"] + "release.json",
                            headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
                            max_redirects=0,
                        )
                        require(live_release_response.status == 200, f"public-release-status-{key}")
                        require(
                            live_release_response.url == environment["pages_url"] + "release.json",
                            f"public-release-redirect-{key}",
                        )
                        live_release_bytes = live_release_response.body()
                        require(
                            sha256(live_release_bytes) == sha256(release_bytes),
                            f"public-release-hash-mismatch-{key}",
                        )
                        report["publicMetadata"][key] = {
                            "sourceSha": release["sha"],
                            "releaseDigest": release["digest"],
                            "releaseJsonSha256": sha256(live_release_bytes),
                            "matchesSnapshot": True,
                        }

                    report["checks"]["B1"]["status"] = "RUNNING"
                    save_report()
                    for environment in ENVIRONMENTS:
                        key = environment["name"]
                        stage = f"B1-page-load-{key}"
                        page_report = {
                            "environment": key,
                            "pagesUrl": environment["pages_url"],
                            "configuredWorkerOrigin": origin(environment["worker_url"]),
                            "releaseSha": expected_releases[key][0]["sha"],
                            "releaseDigest": expected_releases[key][0]["digest"],
                            "entryStatus": None,
                            "title": None,
                            "criticalResourceFailures": [],
                            "blockedExternalHosts": [],
                            "httpOrigins": [],
                            "consoleErrorCount": 0,
                            "pageErrorTypes": [],
                            "cpuGameStarted": False,
                            "discardCount": 0,
                        }
                        context, page = make_page(
                            browser,
                            environment,
                            page_report,
                            viewport={"width": 1280, "height": 900},
                        )
                        try:
                            def on_response(response):
                                request_info = response.request
                                if request_info.resource_type in RESOURCE_TYPES and response.status >= 400:
                                    if not response.url.endswith("/favicon.ico"):
                                        page_report["criticalResourceFailures"].append(
                                            {"resourceType": request_info.resource_type, "status": response.status}
                                        )

                            page.on("response", on_response)

                            def on_request_failed(request):
                                if request.resource_type in RESOURCE_TYPES and not request.url.endswith("/favicon.ico"):
                                    page_report["criticalResourceFailures"].append(
                                        {"resourceType": request.resource_type, "failure": "network"}
                                    )

                            page.on("requestfailed", on_request_failed)
                            response = open_public_page(page, environment)
                            page_report["entryStatus"] = response.status
                            page_report["title"] = page.title()
                            require(page_report["title"] == environment["title"], f"B1-page-title-{key}")
                            require(page.locator("#main-menu-toggle").is_visible(), f"B1-main-menu-missing-{key}")
                            require(not page_report["criticalResourceFailures"], f"B1-critical-resource-failure-{key}")
                            stage = f"B1-cpu-{key}"
                            start_cpu_and_discard(page, page_report, key)
                            require(not page_report["blockedExternalHosts"], f"B1-external-host-request-{key}")
                            require(not page_report["consoleErrorCount"], f"B1-console-error-{key}")
                            require(not page_report["pageErrorTypes"], f"B1-page-error-{key}")
                            page_report["status"] = "PASSED"
                            report["environments"].append(page_report)
                            save_report()
                        finally:
                            context.close()

                    report["checks"]["B1"] = {
                        "status": "PASSED",
                        "production": "PASSED",
                        "development": "PASSED",
                    }
                    save_report()

                    stage = "B2-online-and-reconnect"
                    report["checks"]["B2"]["status"] = "RUNNING"
                    report["checks"]["B3"]["status"] = "RUNNING"
                    save_report()
                    run_online_checks(browser, browser_name, report, save_report)
                    report["checks"]["B2"] = {
                        "status": "PASSED",
                        "production": report["online"]["production"]["status"],
                        "development": report["online"]["development"]["status"],
                    }
                    report["checks"]["B3"] = {
                        "status": "PASSED",
                        "productionToProductionWorker": True,
                        "developmentToDevelopmentWorker": True,
                        "crossPathSessionRestoration": True,
                    }
                    save_report()

                    stage = "B4-storage-separation"
                    report["checks"]["B4"]["status"] = "RUNNING"
                    save_report()
                    run_storage_partition_check(browser, report, save_report)
                    report["checks"]["B4"] = {
                        "status": "PASSED",
                        "sameBrowserContextAndOrigin": report["storageSeparation"]["sameOrigin"],
                        "productionAndDevelopmentRulesRemainDistinct": True,
                        "onlineSessionKeysRemainDistinct": True,
                    }
                    save_report()

                    stage = "B5-and-B7-pwa-multitab"
                    report["checks"]["B5"]["status"] = "RUNNING"
                    report["checks"]["B7"]["status"] = "RUNNING"
                    save_report()
                    run_pwa_and_multitab_check(browser, report, save_report)
                    report["checks"]["B5"] = {
                        "status": "PASSED",
                        "production": "PASSED",
                        "development": "PASSED",
                        "distinctScopesAndCacheNamespaces": True,
                    }
                    report["checks"]["B7"] = {
                        "status": "PARTIAL",
                        "crossEnvironmentTabsAndReload": "PASSED",
                        "cacheNamespaceUnchanged": "PASSED",
                        "waitingUpdateBehavior": "NOT_TESTED_NO_PUBLICATION_PERMITTED",
                    }
                    save_report()

                    stage = "B6-offline-cpu"
                    report["checks"]["B6"]["status"] = "RUNNING"
                    save_report()
                    for environment in ENVIRONMENTS:
                        run_offline_cpu_check(browser, environment, report, save_report)
                    report["checks"]["B6"] = {
                        "status": "PASSED",
                        "production": report["offline"]["production"]["status"],
                        "development": report["offline"]["development"]["status"],
                    }
                    save_report()

                    stage = "public-metadata-stability"
                    final_environments = request.get(
                        ENVIRONMENTS[0]["pages_url"] + "environments.json",
                        headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
                        max_redirects=0,
                    )
                    require(final_environments.status == 200, "final-public-environments-status")
                    require(
                        sha256(final_environments.body()) == sha256(snapshot_environments_bytes),
                        "public-environments-changed-during-e2e",
                    )
                    for environment in ENVIRONMENTS:
                        key = environment["name"]
                        final_release = request.get(
                            environment["pages_url"] + "release.json",
                            headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
                            max_redirects=0,
                        )
                        require(final_release.status == 200, f"final-public-release-status-{key}")
                        require(
                            sha256(final_release.body()) == sha256(expected_releases[key][1]),
                            f"public-release-changed-during-e2e-{key}",
                        )
                    report["publicMetadata"]["unchangedAfterChecks"] = True
                    report["checks"]["B7"]["publicMetadataUnchanged"] = True
                finally:
                    request.dispose()
            finally:
                browser.close()

        report["checks"]["B7"]["status"] = "PARTIAL"
        report["checks"]["B7"]["reason"] = (
            "Waiting Service Worker update behavior requires a published version change, "
            "which this verification is not authorized to trigger."
        )
        report["outcome"] = "PARTIAL"
    except Exception as error:
        report["outcome"] = "FAILURE"
        report["failure"] = {"stage": stage, "type": type(error).__name__}
        if isinstance(error, LiveE2EFailure) and error.args:
            report["failure"]["code"] = error.args[0]
        for check in report["checks"].values():
            if check["status"] == "RUNNING":
                check["status"] = "FAILED"
        write_report(report)
        print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)
        raise SystemExit(f"live public Pages E2E failed at {stage}: {type(error).__name__}") from None

    finally:
        if report["outcome"] in {"SUCCESS", "PARTIAL"}:
            write_report(report)
            print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
