"""Explicit Phase 6-B E2E against the published production and development Pages."""
import base64
import hashlib
import json
import os
import platform
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright


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


class UnsafeLiveEnvironment(LiveE2EFailure):
    """Do not continue other stages when the target or isolation is unsafe."""


def require(condition, code):
    if not condition:
        if any(part in code for part in (
            "worker-config-mismatch", "worker-websocket-origin-mismatch",
            "external-host-request", "cross-environment-session",
            "entry-redirect-", "cross-path-redirect", "session-restore-redirect",
            "host-opposite-session-key-present", "guest-session-existed-before-join",
            "guest-prior-session-missing", "session-key-coexistence",
            "cache-content-cross-environment", "production-cache-contains-development",
            "cache-namespaces-overlap", "public-environments-json-state-mismatch",
            "public-environments-json-hash-mismatch", "public-release-hash-mismatch",
            "snapshot-", "public-environments-changed", "public-release-changed",
        )):
            raise UnsafeLiveEnvironment(code)
        raise LiveE2EFailure(code)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def write_report(report):
    path = Path(os.environ["LIVE_E2E_REPORT"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def origin(value):
    parsed = urlsplit(value)
    allowed = {urlsplit(env["worker_url"]).hostname for env in ENVIRONMENTS}
    allowed.add(urlsplit(ENVIRONMENTS[0]["pages_url"]).hostname)
    return (f"{parsed.scheme}://{parsed.hostname}"
            if (parsed.scheme in {"https", "wss"} and parsed.hostname in allowed and
                parsed.port in (None, 443) and not parsed.username and not parsed.password)
            else "blocked-origin")


BLOCKED_EXTERNAL_REQUESTS = []
MAX_ONLINE_DIAGNOSTIC_EVENTS = 256
ROOM_ACTION_ERROR_CODES = frozenset({
    "invalid_message", "invalid_json", "message_too_large", "rate_limited",
    "request_id_reused", "revision_conflict", "not_host", "room_finalized",
    "game_not_ended", "already_finalized", "no_participants", "player_disconnected",
    "players_not_ready", "stale_connection", "room_closed", "unauthorized",
    "already_started", "game_not_started", "game_not_playing", "round_not_ended",
    "round_not_available", "not_your_turn", "invalid_action", "invalid_option",
    "invalid_riichi", "invalid_tsumo", "invalid_kyuushu_kyuuhai", "decision_pending",
    "stale_decision", "already_responded", "not_eligible", "game_in_progress",
})


def capture_room_action_diagnostics(page, trace_started_wall_ms):
    """Read only sanitized room-action entries from the app's existing diagnostic buffer."""
    try:
        return page.evaluate("""({traceStartedWallMs, knownErrorCodes}) => {
          const suffix = 'heibon-mahjong-diagnostics-v2';
          const eventNames = new Set([
            'room_state_updated', 'room_state_sync_requested', 'room_state_sync_response_received',
            'room_action_accepted', 'action_sent', 'server_action_result_received',
            'server_rejected_operation', 'room_action_completed', 'room_action_rejected',
            'operation_wait_released', 'action_response_timeout', 'action_send_failed'
          ]);
          const requestOperations = new Map();
          const selected = [];
          const safeInteger = value => Number.isSafeInteger(value) ? value : null;
          const known = new Set(knownErrorCodes);
          const classifyCode = (code, result) => {
            if (typeof code !== 'string') return {errorClass: result === 'accepted' ? 'none' : 'no_code', errorCode: null};
            if (!known.has(code)) return {errorClass: 'unknown', errorCode: 'unknown'};
            if (['revision_conflict', 'stale_connection', 'rate_limited'].includes(code)) {
              return {errorClass: code, errorCode: code};
            }
            return {errorClass: result === 'rejected' ? 'known_other' : 'none', errorCode: code};
          };
          const keys = [];
          for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key === suffix || key === `heibon-mahjong-dev:${suffix}`) keys.push(key);
          }
          if (!keys.length) return {status: 'not_found', events: []};

          for (const key of keys) {
            const environment = key.startsWith('heibon-mahjong-dev:') ? 'development' : 'production';
            let entries;
            try {
              entries = JSON.parse(localStorage.getItem(key) || 'null');
            } catch {
              selected.push({environment, invalidBuffer: true});
              continue;
            }
            if (!Array.isArray(entries)) {
              selected.push({environment, invalidBuffer: true});
              continue;
            }
            for (const entry of entries) {
              if (!entry || !eventNames.has(entry.event) || !entry.details || typeof entry.details !== 'object') continue;
              const details = entry.details;
              if (details.actionType === 'set-ready' && typeof details.requestId === 'string') {
                if (!requestOperations.has(details.requestId)) requestOperations.set(details.requestId, requestOperations.size + 1);
              }
              const operationIndex = typeof details.requestId === 'string'
                ? requestOperations.get(details.requestId) ?? null
                : null;
              const stateEvent = ['room_state_updated', 'room_state_sync_requested', 'room_state_sync_response_received'].includes(entry.event);
              const setReadyEvent = details.actionType === 'set-ready' && [
                'room_action_accepted', 'action_sent', 'room_action_completed', 'room_action_rejected',
                'operation_wait_released', 'action_response_timeout', 'action_send_failed'
              ].includes(entry.event);
              const correlatedResponse = [
                'server_action_result_received', 'server_rejected_operation'
              ].includes(entry.event) && operationIndex !== null;
              if (!stateEvent && !setReadyEvent && !correlatedResponse) continue;
              const timestamp = Date.parse(entry.timestamp);
              const offsetMs = Number.isFinite(timestamp)
                ? Math.max(0, Math.round(timestamp - traceStartedWallMs)) : null;
              const detailsOut = {
                environment,
                offsetMs,
                event: entry.event,
              };
              if (setReadyEvent || correlatedResponse) {
                detailsOut.operationType = 'set-ready';
                detailsOut.operationIndex = operationIndex;
              }
              if (entry.event === 'room_action_accepted' || entry.event === 'action_sent') {
                detailsOut.expectedRevision = safeInteger(details.revision);
              }
              if (stateEvent) {
                if (entry.event !== 'room_state_sync_requested') detailsOut.revision = safeInteger(details.revision);
                if (entry.event === 'room_state_sync_requested' && details.source === 'revision_conflict') {
                  detailsOut.source = 'revision_conflict';
                }
              }
              if (entry.event === 'server_action_result_received' ||
                  entry.event === 'server_rejected_operation' || entry.event === 'room_action_completed' ||
                  entry.event === 'room_action_rejected' || entry.event === 'operation_wait_released') {
                detailsOut.result = ['accepted', 'rejected'].includes(details.result)
                  ? details.result : entry.event === 'server_rejected_operation' ? 'rejected' : null;
                detailsOut.responseRevision = safeInteger(details.revision);
                Object.assign(detailsOut, classifyCode(details.errorCode, detailsOut.result));
              }
              if (entry.event === 'action_response_timeout' || entry.event === 'action_send_failed') {
                detailsOut.outcome = entry.event === 'action_response_timeout' ? 'response_unobserved' : 'send_failed';
                detailsOut.expectedRevision = safeInteger(details.revision);
              }
              if (typeof details.durationMs === 'number' && Number.isFinite(details.durationMs)) {
                detailsOut.durationMs = Math.max(0, Math.round(details.durationMs));
              }
              selected.push(detailsOut);
            }
          }
          const invalidBuffer = selected.filter(value => value.invalidBuffer);
          const events = selected.filter(value => !value.invalidBuffer);
          const responseEvents = new Set([
            'server_action_result_received', 'server_rejected_operation',
            'room_action_completed', 'room_action_rejected', 'operation_wait_released'
          ]);
          const sentOperations = events.filter(value => value.event === 'action_sent' && value.operationIndex !== null);
          for (const sent of sentOperations) {
            const responseObserved = events.some(value => value.environment === sent.environment &&
              value.operationIndex === sent.operationIndex && responseEvents.has(value.event));
            if (!responseObserved) {
              events.push({
                environment: sent.environment,
                offsetMs: null,
                event: 'worker_response_unobserved',
                operationType: 'set-ready',
                operationIndex: sent.operationIndex,
                result: 'unobserved',
              });
            }
          }
          events.sort((left, right) => (left.offsetMs ?? 0) - (right.offsetMs ?? 0));
          return {status: invalidBuffer.length ? 'partially_unavailable' : 'captured', events};
        }""", {
            "traceStartedWallMs": trace_started_wall_ms,
            "knownErrorCodes": sorted(ROOM_ACTION_ERROR_CODES),
        })
    except Exception as error:
        return {"status": "capture_failed", "errorType": type(error).__name__, "events": []}


def collect_room_action_diagnostics(trace, trace_started_wall_ms, clients):
    results = trace.setdefault("roomActionDiagnostics", {})
    for client, page in clients.items():
        if page is None:
            results[client] = {"status": "page_unavailable", "events": []}
        else:
            results[client] = capture_room_action_diagnostics(page, trace_started_wall_ms)


def record_online_communication(trace, started_at, active_action, client, event_type, **details):
    environment = details.get("environment")
    action_id = active_action.get("id")
    if event_type in {"websocket-frame-sent", "websocket-frame-received"}:
        counts = trace.setdefault("websocketFrameCounts", {})
        count_key = ":".join((str(environment), client, str(action_id), event_type))
        counts[count_key] = counts.get(count_key, 0) + 1
        recorded = trace.setdefault("websocketFrameFirstObserved", [])
        if count_key in recorded:
            return
        if len(recorded) < 128:
            recorded.append(count_key)
        else:
            trace["websocketFrameFirstObservedTruncated"] = True
        event_type = event_type.replace("websocket-frame-", "websocket-first-frame-")

    events = trace.setdefault("communicationEvents", [])
    if len(events) >= MAX_ONLINE_DIAGNOSTIC_EVENTS:
        trace["communicationEventsTruncated"] = True
        return
    event = {
        "sequence": len(events) + 1,
        "offsetMs": round(max(0.0, time.monotonic() - started_at) * 1000),
        "client": client,
        "type": event_type,
    }
    if action_id:
        event["actionId"] = action_id
    # Persist only allowlisted, non-secret network metadata. Never retain a URL,
    # request body, WebSocket frame, room code, or token.
    for key in ("origin", "resourceType", "method", "status", "closeCode", "environment"):
        value = details.get(key)
        if isinstance(value, (str, int)) and not isinstance(value, bool):
            event[key] = value
    events.append(event)


def run_traced_action(trace, started_at, active_action, action_id, operation):
    if BLOCKED_EXTERNAL_REQUESTS:
        raise UnsafeLiveEnvironment("unexpected-external-request")
    actions = trace.setdefault("actions", [])
    action = {
        "id": action_id,
        "status": "STARTED",
        "startedAfterMs": round(max(0.0, time.monotonic() - started_at) * 1000),
    }
    if len(actions) < 128:
        actions.append(action)
    else:
        trace["actionsTruncated"] = True
    active_action["id"] = action_id
    action_started = time.monotonic()
    try:
        result = operation()
        if BLOCKED_EXTERNAL_REQUESTS:
            raise UnsafeLiveEnvironment("unexpected-external-request")
    except Exception as error:
        action["status"] = "FAILED"
        action["exceptionType"] = type(error).__name__
        action["durationMs"] = round(max(0.0, time.monotonic() - action_started) * 1000)
        trace["failedActionId"] = action_id
        raise
    else:
        action["status"] = "PASSED"
        action["durationMs"] = round(max(0.0, time.monotonic() - action_started) * 1000)
        trace["lastSuccessfulActionId"] = action_id
        return result
    finally:
        active_action["id"] = None


def capture_online_ui_state(page, page_report):
    try:
        state = page.evaluate("""() => {
          const visible = element => {
            if (!element || element.hidden) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          };
          const elementState = selector => {
            const element = document.querySelector(selector);
            return {
              exists: Boolean(element),
              isConnected: element ? element.isConnected : null,
              hidden: element ? Boolean(element.hidden) : null,
              visible: visible(element),
              open: element && 'open' in element ? Boolean(element.open) : null
            };
          };
          const buttonState = selector => {
            const element = document.querySelector(selector);
            if (!element) return {exists: false, isConnected: null, hidden: null, visible: false, disabled: null, busy: false};
            return {
              exists: true,
              isConnected: element.isConnected,
              hidden: Boolean(element.hidden),
              visible: visible(element),
              disabled: Boolean(element.disabled),
              busy: element.getAttribute('aria-busy') === 'true'
            };
          };
          const connection = document.querySelector('#online-connection');
          const connectionText = connection?.textContent?.trim() ?? '';
          let connectionState = 'hidden';
          if (visible(connection)) {
            if (connectionText.startsWith('接続しています')) connectionState = 'connecting';
            else if (connectionText === '接続中') connectionState = 'connected';
            else if (connectionText.startsWith('接続しました')) connectionState = 'connected-syncing';
            else if (connectionText.includes('再接続')) connectionState = 'reconnecting';
            else if (connectionText.includes('切れました')) connectionState = 'disconnected';
            else if (connectionText.includes('問題')) connectionState = 'connection-error';
            else connectionState = 'visible-other';
          }
          const seats = Array.from(document.querySelectorAll('#online-seats > li')).map((item, index) => {
            const roleText = item.querySelector('.online-seat-role')?.textContent ?? '';
            const statusText = item.querySelector('.online-seat-status')?.textContent?.trim() ?? '';
            return {
              index,
              kind: ['human', 'cpu', 'empty'].includes(item.dataset.kind) ? item.dataset.kind : 'unknown',
              isSelf: roleText.includes('自分'),
              isHost: roleText.includes('ホスト'),
              connected: statusText ? statusText.includes('接続中') : null,
              ready: statusText ? statusText.includes('準備完了') : null
            };
          });
          const screenSelectors = {
            idle: '#app-idle',
            localGame: '#local-game-layout',
            onlineWaitingRoom: '#online-room',
            onlineMatch: '#online-match',
            onlineTable: '#online-table'
          };
          const currentScreens = Object.entries(screenSelectors)
            .filter(([, selector]) => visible(document.querySelector(selector)))
            .map(([name]) => name);
          const mode = document.body.dataset.gameMode;
          return {
            currentScreens,
            gameMode: mode === 'online' || mode === 'offline' ? mode : null,
            onlineDialog: elementState('#online-dialog'),
            waitingRoom: elementState('#online-room'),
            onlineMatch: elementState('#online-match'),
            onlineTable: elementState('#online-table'),
            connection: {visible: visible(connection), state: connectionState},
            statusVisible: visible(document.querySelector('#online-status')),
            errorVisible: visible(document.querySelector('#online-error')),
            buttons: {
              ready: buttonState('#online-ready'),
              finalizeSeats: buttonState('#online-finalize'),
              startGame: buttonState('#online-start-game')
            },
            humanSeats: seats.filter(seat => seat.kind === 'human'),
            seatCount: seats.length
          };
        }""")
        state["snapshotStatus"] = "captured"
    except Exception as error:
        state = {"snapshotStatus": "failed", "snapshotErrorType": type(error).__name__}
    state["javascript"] = {
        "pageErrorTypes": list(page_report.get("pageErrorTypes", []))[:20],
        "consoleErrorCount": int(page_report.get("consoleErrorCount", 0)),
    }
    state["blockedExternalHostCount"] = len(page_report.get("blockedExternalHosts", []))
    return state


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
        if not allowed_scheme or parsed.hostname not in expected_hosts or origin(route.request.url) == "blocked-origin":
            page_report["blockedExternalHosts"].append("blocked")
            BLOCKED_EXTERNAL_REQUESTS.append("blocked-external-request")
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
    def record_socket(socket):
        socket_origin = origin(socket.url)
        if socket_origin != "wss://" + urlsplit(environment["worker_url"]).hostname:
            BLOCKED_EXTERNAL_REQUESTS.append("unexpected-websocket-origin")
        page_report["websocketOrigins"].append(socket_origin)
    page.on("websocket", record_socket)
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


def wait_for_cpu_discard_boundary(page):
    """Pass optional offers while the randomly seated CPUs reach a human turn."""
    deadline = time.monotonic() + 30
    while True:
        remaining = int((deadline - time.monotonic()) * 1000)
        if remaining <= 0:
            raise LiveE2EFailure("cpu-human-discard-boundary-timeout")
        page.wait_for_function("""() => {
          const available = selector => {
            const button = document.querySelector(selector);
            return button && button.getClientRects().length > 0 && !button.disabled;
          };
          return available('#pass-calls') || available('#pass-ron') ||
            (document.body.dataset.gameMode === 'offline' &&
             document.querySelectorAll('#player-hand button:enabled').length >= 13);
        }""", timeout=remaining)
        passed_offer = False
        for selector in ("#pass-calls", "#pass-ron"):
            button = page.locator(selector)
            if button.is_visible() and button.is_enabled():
                button.click()
                remaining = max(1, int((deadline - time.monotonic()) * 1000))
                page.wait_for_function("""selector => {
                  const button = document.querySelector(selector);
                  return !button || !button.getClientRects().length || button.disabled;
                }""", arg=selector, timeout=remaining)
                passed_offer = True
                break
        if not passed_offer:
            return


def start_cpu_and_discard(page, report, suffix):
    page.locator("#main-menu-toggle").click()
    page.locator("#new-game").click()
    require(page.locator("#new-game-dialog").evaluate("dialog => dialog.open"), f"new-game-dialog-{suffix}")
    page.locator("#confirm-new-game").click()
    page.locator("#local-table").wait_for(state="visible", timeout=15_000)
    wait_for_cpu_discard_boundary(page)
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


ONLINE_SEAT_READY_EXPRESSION = """({displayName, requireHost}) => {
  const matches = Array.from(document.querySelectorAll('#online-seats > li')).filter(row =>
    row.dataset.kind === 'human' &&
    row.querySelector('.online-seat-name')?.textContent?.trim() === displayName
  );
  if (matches.length !== 1) return false;
  const row = matches[0];
  const role = row.querySelector('.online-seat-role')?.textContent ?? '';
  const status = row.querySelector('.online-seat-status')?.textContent ?? '';
  return (!requireHost || role.includes('ホスト')) && status.includes('準備完了');
}"""

ONLINE_GUEST_CONNECTED_EXPRESSION = """displayName => {
  const rows = Array.from(document.querySelectorAll('#online-seats > li')).filter(row =>
    row.dataset.kind === 'human' &&
    row.querySelector('.online-seat-name')?.textContent?.trim() === displayName
  );
  if (rows.length !== 1) return false;
  const role = rows[0].querySelector('.online-seat-role')?.textContent ?? '';
  const status = rows[0].querySelector('.online-seat-status')?.textContent ?? '';
  return !role.includes('ホスト') && status.includes('接続中') && status.includes('未準備');
}"""

ONLINE_PLAYERS_READY_EXPRESSION = """({hostName, guestName}) => {
  const rows = Array.from(document.querySelectorAll('#online-seats > li'));
  const matchingRows = name => rows.filter(row =>
    row.dataset.kind === 'human' &&
    row.querySelector('.online-seat-name')?.textContent?.trim() === name
  );
  const hosts = matchingRows(hostName);
  const guests = matchingRows(guestName);
  if (hosts.length !== 1 || guests.length !== 1) return false;
  const hostRole = hosts[0].querySelector('.online-seat-role')?.textContent ?? '';
  const guestRole = guests[0].querySelector('.online-seat-role')?.textContent ?? '';
  const hostStatus = hosts[0].querySelector('.online-seat-status')?.textContent ?? '';
  const guestStatus = guests[0].querySelector('.online-seat-status')?.textContent ?? '';
  return hostRole.includes('ホスト') && !guestRole.includes('ホスト') &&
    hostStatus.includes('準備完了') && guestStatus.includes('準備完了');
}"""


def wait_for_online_seat_ready(page, display_name, *, require_host=False):
    page.wait_for_function(
        ONLINE_SEAT_READY_EXPRESSION,
        arg={"displayName": display_name, "requireHost": require_host},
        timeout=20_000,
    )


def wait_for_online_players_ready(page, host_name, guest_name):
    page.wait_for_function(
        ONLINE_PLAYERS_READY_EXPRESSION,
        arg={"hostName": host_name, "guestName": guest_name},
        timeout=20_000,
    )


def wait_for_active_online_human(page, host_name, guest_name, timeout_ms):
    page.wait_for_function(
        """names => {
          const activeRows = Array.from(document.querySelectorAll(
            '#online-score-strip .seat-label[data-active="true"]'
          ));
          if (activeRows.length !== 1) return false;
          const activeName = activeRows[0].querySelector('.seat-name')?.textContent?.trim() ?? '';
          return names.includes(activeName);
        }""",
        arg=[host_name, guest_name],
        timeout=timeout_ms,
    )
    active_name = page.evaluate(
        """() => document.querySelector(
          '#online-score-strip .seat-label[data-active="true"] .seat-name'
        )?.textContent?.trim() ?? null"""
    )
    if active_name == host_name:
        return "host"
    if active_name == guest_name:
        return "guest"
    raise LiveE2EFailure("active-human-turn-name-not-recognized")


def start_online_game(host_page, guest_page, host_name, guest_name, trace_step):
    trace_step(
        "guest-connected-on-host-wait",
        lambda: host_page.wait_for_function(ONLINE_GUEST_CONNECTED_EXPRESSION, arg=guest_name, timeout=20_000),
    )
    trace_step("host-ready-click", lambda: host_page.locator("#online-ready").click())
    trace_step(
        "host-ready-sync-on-guest-wait",
        lambda: wait_for_online_seat_ready(guest_page, host_name, require_host=True),
    )
    trace_step("guest-ready-click", lambda: guest_page.locator("#online-ready").click())
    trace_step(
        "both-ready-on-host-wait",
        lambda: wait_for_online_players_ready(host_page, host_name, guest_name),
    )
    trace_step(
        "seat-confirm-enabled-wait",
        lambda: host_page.wait_for_function(
            "!document.querySelector('#online-finalize').disabled && !document.querySelector('#online-finalize').hidden",
            timeout=20_000,
        ),
    )
    trace_step("seat-confirm-click", lambda: host_page.locator("#online-finalize").click())
    trace_step(
        "game-start-visible-wait",
        lambda: host_page.wait_for_function("!document.querySelector('#online-start-game').hidden", timeout=20_000),
    )
    trace_step("game-start-click", lambda: host_page.locator("#online-start-game").click())
    for client, page in (("host", host_page), ("guest", guest_page)):
        trace_step(
            f"{client}-game-screen-wait",
            lambda page=page: page.locator("#online-match").wait_for(state="visible", timeout=30_000),
        )
    hand_deadline = time.monotonic() + 30

    def remaining_hand_timeout_ms():
        remaining = int((hand_deadline - time.monotonic()) * 1000)
        if remaining <= 0:
            raise TimeoutError("The 30-second human-turn wait expired.")
        return remaining

    first_actor = trace_step(
        "first-human-turn-visible-wait",
        lambda: wait_for_active_online_human(
            host_page, host_name, guest_name, remaining_hand_timeout_ms(),
        ),
    )
    actor_page = host_page if first_actor == "host" else guest_page
    trace_step(
        f"{first_actor}-actionable-hand-wait",
        lambda: actor_page.locator("#online-player-hand button[data-tile-id]:not([disabled])")
        .first.wait_for(timeout=remaining_hand_timeout_ms()),
    )
    trace_step(
        "guest-name-visible-in-match-check",
        lambda: require(guest_name in guest_page.locator("#online-score-strip").inner_text(), "guest-name-not-in-match"),
    )
    return first_actor


def online_discard_and_sync(actor_page, peer_page, actor_role, page_report):
    before_actor = total_online_river_tiles(actor_page)
    before_peer = total_online_river_tiles(peer_page)
    require(before_actor == before_peer, "online-river-state-diverged-before-discard")
    tile = actor_page.locator("#online-player-hand button[data-tile-id]:not([disabled])").first
    # This ID is retained only in memory. It must become a public river tile in
    # both clients before it is used as evidence of the discard.
    tile_id = tile.get_attribute("data-tile-id")
    require(bool(tile_id), "online-selected-tile-id-missing")
    tile.click()
    actor_page.locator("#online-discard").wait_for(state="visible", timeout=5_000)
    actor_page.wait_for_function("!document.querySelector('#online-discard').disabled", timeout=5_000)
    actor_page.locator("#online-discard").click()
    for page in (actor_page, peer_page):
        page.wait_for_function(
            "before => document.querySelectorAll('#online-table [data-online-river] .river-tile').length > before",
            arg=before_actor,
            timeout=30_000,
        )
        page.wait_for_function("""tileId => Array.from(
          document.querySelectorAll('#online-table [data-online-river] .river-tile')
        ).some(tile => tile.dataset.tileId === tileId)""", arg=tile_id, timeout=30_000)
    actor_count = total_online_river_tiles(actor_page)
    peer_count = total_online_river_tiles(peer_page)
    require(actor_count > before_actor and actor_count == peer_count, "online-discard-state-not-synchronized")
    page_report["firstDiscardActor"] = actor_role
    page_report["synchronizedRiverTileCount"] = actor_count


def capture_test_session(page, storage_key, room_code, display_name):
    """Keep credentials in memory only; never put them in the report or exception."""
    session = page.evaluate("key => JSON.parse(sessionStorage.getItem(key) || 'null')", storage_key)
    if not isinstance(session, dict):
        raise UnsafeLiveEnvironment("test-session-unavailable")
    code = session.get("roomCode")
    token = session.get("participantToken")
    if (code != room_code or session.get("displayName") != display_name or
            not isinstance(code, str) or not re.fullmatch(r"[A-HJ-NP-Z2-9]{6}", code) or
            not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token)):
        raise UnsafeLiveEnvironment("test-session-identity-mismatch")
    return {"roomCode": code, "participantToken": token}


def verify_environment_isolation(request, sessions, names):
    """Probe credentials only against our two known target rooms.

    A room code may coincide across Workers. Every requested room is created by
    this run on its target Worker. Verify both rooms' identities before sending
    any credential probes; never look up the other Worker's code on a target.
    Tokens, tickets and codes stay in memory.
    """
    results = {}
    for environment in ENVIRONMENTS:
        for role in ("host", "guest"):
            session = sessions[environment["name"]][role]
            code, token = session.get("roomCode"), session.get("participantToken")
            if (not isinstance(code, str) or not re.fullmatch(r"[A-HJ-NP-Z2-9]{6}", code) or
                    not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token)):
                raise UnsafeLiveEnvironment("invalid-test-session")
    tokens = [sessions[environment["name"]][role]["participantToken"]
              for environment in ENVIRONMENTS for role in ("host", "guest")]
    if len(set(tokens)) != len(tokens):
        raise UnsafeLiveEnvironment("test-participant-credentials-not-distinct")
    expected_names = [names[environment["name"]][role]
                      for environment in ENVIRONMENTS for role in ("host", "guest")]
    if (any(not isinstance(name, str) or not name for name in expected_names) or
            len(set(expected_names)) != len(expected_names)):
        raise UnsafeLiveEnvironment("test-participant-names-not-distinct")
    for environment in ENVIRONMENTS:
        owned = sessions[environment["name"]]
        if owned["host"]["roomCode"] != owned["guest"]["roomCode"]:
            raise UnsafeLiveEnvironment("test-room-session-mismatch")
    # Verify both test-created rooms before issuing any credential or ticket
    # request, so a failed ownership check cannot lead to a negative probe.
    for index, environment in enumerate(ENVIRONMENTS):
        target = environment["name"]
        other = ENVIRONMENTS[1 - index]["name"]
        host = sessions[target]["host"]
        url = environment["worker_url"] + "/api/rooms/" + host["roomCode"]
        headers = {"Origin": "https://ak-sekine.github.io"}
        state_response = request.get(url, headers=headers, timeout=20_000, max_redirects=0)
        if state_response.status != 200:
            raise UnsafeLiveEnvironment("test-room-ownership-unverified")
        state = state_response.json()
        seats = state.get("seats") if isinstance(state, dict) else None
        if not isinstance(seats, list) or state.get("roomCode") != host["roomCode"]:
            raise UnsafeLiveEnvironment("test-room-state-identity-mismatch")
        actual_names = {seat.get("name") for seat in seats if isinstance(seat, dict) and seat.get("kind") == "human"}
        if actual_names != set(names[target].values()) or actual_names & set(names[other].values()):
            raise UnsafeLiveEnvironment("cross-environment-room-state-mismatch")
        require(state.get("status") == "finalized" and isinstance(state.get("gameRevision"), int)
                and state["gameRevision"] >= 1, f"own-room-game-state-unavailable-{target}")
    for index, environment in enumerate(ENVIRONMENTS):
        target = environment["name"]
        other = ENVIRONMENTS[1 - index]["name"]
        host = sessions[target]["host"]
        foreign = sessions[other]
        url = environment["worker_url"] + "/api/rooms/" + host["roomCode"]
        headers = {"Origin": "https://ak-sekine.github.io"}
        statuses = []
        socket_statuses = []
        for role in ("host", "guest"):
            response = request.post(url + "/ticket", headers={
                **headers, "Authorization": "Bearer " + foreign[role]["participantToken"],
            }, timeout=20_000, max_redirects=0)
            if 200 <= response.status < 300:
                raise UnsafeLiveEnvironment("cross-environment-token-accepted")
            require(response.status == 401, f"cross-environment-token-rejection-status-{target}-{role}")
            body = response.json()
            require(isinstance(body, dict) and body.get("error") == "unauthorized",
                    f"cross-environment-token-rejection-code-{target}-{role}")
            statuses.append(response.status)
            # Request a valid, single-use ticket only for our source room, then
            # verify that it cannot upgrade a socket for our target room. The
            # token, ticket, room code and handshake headers are never reported.
            source = ENVIRONMENTS[1 - index]
            source_url = source["worker_url"] + "/api/rooms/" + foreign[role]["roomCode"]
            issued = request.post(source_url + "/ticket", headers={
                **headers, "Authorization": "Bearer " + foreign[role]["participantToken"],
            }, timeout=20_000, max_redirects=0)
            require(issued.status == 200, f"source-test-ticket-unavailable-{other}-{role}")
            ticket_body = issued.json()
            ticket = ticket_body.get("ticket") if isinstance(ticket_body, dict) else None
            if not isinstance(ticket, str) or not re.fullmatch(r"[a-f0-9]{64}", ticket):
                raise UnsafeLiveEnvironment("invalid-source-test-ticket")
            nonce = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
            rejected = request.get(url + "/socket", headers={
                **headers, "Upgrade": "websocket", "Connection": "Upgrade",
                "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": nonce,
                "Sec-WebSocket-Protocol": "heibon-mahjong.v1, ticket." + ticket,
            }, timeout=20_000, max_redirects=0)
            if rejected.status == 101 or 200 <= rejected.status < 300:
                raise UnsafeLiveEnvironment("cross-environment-ticket-accepted")
            require(rejected.status == 401, f"cross-environment-ticket-rejection-status-{target}-{role}")
            rejection_body = rejected.json()
            require(isinstance(rejection_body, dict) and rejection_body.get("error") == "invalid_ticket",
                    f"cross-environment-ticket-rejection-code-{target}-{role}")
            socket_statuses.append(rejected.status)
        results[target] = {"ownRoomParticipantsMatch": True, "ownRoomStatesDistinct": True,
                           "foreignCredentialsRejected": True,
                           "rejectionStatuses": statuses, "foreignTicketSocketRejectionStatuses": socket_statuses}
    return results


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


def snapshot_cache_expectation(snapshot_root, environment, release):
    key = environment["name"]
    root = urlsplit(environment["pages_url"]).path
    folder = (snapshot_root / environment["release_path"]).parent
    files = release["files"]
    worker = (folder / "sw.js").read_bytes()
    require(sha256(worker) == files.get("sw.js"), f"snapshot-worker-hash-{key}")

    def declaration(name):
        matches = re.findall(rf"^const {name} = (.+);$", worker.decode("utf-8"), re.MULTILINE)
        require(len(matches) == 1, f"snapshot-worker-{name.lower()}-{key}")
        return json.loads(matches[0])

    cache_name = declaration("CACHE")
    prefix = PRODUCTION_CACHE_PREFIX if key == "production" else DEVELOPMENT_CACHE_PREFIX
    require(declaration("ROOT") == root, f"snapshot-worker-root-{key}")
    require(isinstance(cache_name, str) and re.fullmatch(re.escape(prefix) + r"[a-f0-9]{20}", cache_name),
            f"snapshot-worker-cache-{key}")
    paths = declaration("PRECACHE")
    require(isinstance(paths, list) and paths, f"snapshot-worker-precache-{key}")
    expected = {}
    for path in paths:
        require(isinstance(path, str) and path.startswith(root) and
                (key != "production" or not path.startswith("/heibon-mahjong/dev/")),
                f"snapshot-cache-environment-path-{key}")
        relative = path[len(root):] or "index.html"
        require(re.fullmatch(r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*", relative) and
                not {".", ".."}.intersection(relative.split("/")) and relative in files,
                f"snapshot-cache-file-mapping-{key}")
        url = origin(environment["pages_url"]) + path
        require(url not in expected, f"snapshot-cache-url-duplicate-{key}")
        expected[url] = sha256((folder / relative).read_bytes())
        require(expected[url] == files[relative], f"snapshot-cache-file-hash-{key}")
    require(environment["pages_url"] in expected and environment["pages_url"] + "index.html" in expected,
            f"snapshot-cache-index-mapping-{key}")
    return {"cacheName": cache_name, "urls": expected}


CACHE_BODY_OBSERVATION = """async ({cacheName, urls}) => {
  const names = await caches.keys();
  if (!names.includes(cacheName)) return {names, entries: []};
  const cache = await caches.open(cacheName);
  const entries = [];
  for (const request of await cache.keys()) {
    if (!Object.hasOwn(urls, request.url)) {
      // Keep arbitrary URLs out of artifacts, including any query credentials.
      entries.push({url: null, outcome: 'UNEXPECTED_URL'});
      continue;
    }
    const entry = {url: request.url, actualSha256: null, status: null};
    try {
      const response = await cache.match(request);
      if (!response) entry.outcome = 'RESPONSE_MISSING';
      else {
        entry.status = response.status;
        if (response.type === 'opaque' || response.type === 'opaqueredirect') entry.outcome = 'OPAQUE';
        else if (response.status !== 200) entry.outcome = 'HTTP_STATUS';
        else {
          const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
          entry.actualSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          entry.outcome = 'READ';
        }
      }
    } catch {
      entry.outcome = 'RESPONSE_READ_FAILED';
    }
    entries.push(entry);
  }
  return {names, entries};
}"""


def compare_cached_bodies(expectation, observation, known_names):
    expected = expectation["urls"]
    name = expectation["cacheName"]
    actual_names = observation["names"]
    entries = observation["entries"]
    seen = set()
    duplicate_count = 0
    unexpected_count = 0
    results = []
    for entry in entries:
        url = entry["url"]
        if url not in expected:
            unexpected_count += 1
            continue
        if url in seen:
            duplicate_count += 1
        seen.add(url)
        outcome = entry["outcome"]
        if outcome == "READ":
            outcome = "MATCH" if entry["actualSha256"] == expected[url] else "HASH_MISMATCH"
        results.append({**entry, "expectedSha256": expected[url], "outcome": outcome})
    missing = sorted(set(expected) - seen)
    results.extend({"url": url, "expectedSha256": expected[url], "actualSha256": None,
                    "outcome": "URL_MISSING"} for url in missing)
    cache_present = name in actual_names
    matched = sum(item["outcome"] == "MATCH" for item in results)
    return {
        "expectedCacheName": name,
        "actualCacheNames": sorted(set(actual_names) & known_names),
        "otherCacheCount": len(set(actual_names) - known_names),
        "cachePresent": cache_present,
        "expectedUrlCount": len(expected),
        "missingUrlCount": len(missing),
        "unexpectedUrlCount": unexpected_count,
        "duplicateUrlCount": duplicate_count,
        "matchedBodyCount": matched,
        "mismatchedBodyCount": sum(item["outcome"] == "HASH_MISMATCH" for item in results),
        "unreadableBodyCount": sum(item["outcome"] not in {"MATCH", "HASH_MISMATCH", "URL_MISSING"}
                                   for item in results),
        "outcome": ("CACHE_MISSING" if not cache_present else
                    "PASSED" if matched == len(expected) and not unexpected_count and not duplicate_count
                    else "FAILED"),
        "entries": sorted(results, key=lambda item: item["url"]),
    }


def verify_cache_bodies(page, expectations, report, phase, save_report):
    known_names = {item["cacheName"] for item in expectations.values()}
    require(len(known_names) == len(expectations), "cache-namespaces-overlap")
    results = {}
    report.setdefault("cacheBodies", {})[phase] = results
    for key, expectation in expectations.items():
        observed = page.evaluate(CACHE_BODY_OBSERVATION, expectation)
        results[key] = compare_cached_bodies(expectation, observed, known_names)
        save_report()
    if any(item["outcome"] != "PASSED" for item in results.values()):
        raise UnsafeLiveEnvironment(f"cache-body-verification-{phase}")


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
    test_sessions = {}
    test_names = {}
    online_phase = "B2"
    trace_started = time.monotonic()
    trace_started_wall_ms = round(time.time() * 1000)
    active_action = {"id": None}
    active_environment = {"name": None}
    trace = {
        "schemaVersion": 1,
        "actions": [],
        "communicationEvents": [],
        "websocketFrameCounts": {},
    }

    def emit_communication(client, event_type, **details):
        try:
            record_online_communication(
                trace,
                trace_started,
                active_action,
                client,
                event_type,
                environment=active_environment["name"],
                **details,
            )
        except Exception as error:
            errors = trace.setdefault("diagnosticCallbackErrorTypes", [])
            if len(errors) < 8:
                errors.append(type(error).__name__)

    observer = {
        "host": {
            "blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [],
            "pageErrorTypes": [], "consoleErrorCount": 0,
            "diagnosticCallbackErrorTypes": [],
            "allowedWorkerHost": urlsplit(ENVIRONMENTS[0]["worker_url"]).hostname,
        },
        "guest": {
            "blockedExternalHosts": [], "httpOrigins": [], "websocketOrigins": [],
            "pageErrorTypes": [], "consoleErrorCount": 0,
            "diagnosticCallbackErrorTypes": [],
            "allowedWorkerHost": urlsplit(ENVIRONMENTS[0]["worker_url"]).hostname,
        },
    }
    report["online"] = online_results
    report["onlineDiagnostics"] = trace
    save_report()
    host_context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="allow")
    guest_context = None
    host_page = None
    guest_page = None
    try:
        guest_context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="allow")
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
                if (not allowed_scheme or origin(route.request.url) == "blocked-origin" or
                        (parsed.hostname != pages_host and parsed.hostname != page_report["allowedWorkerHost"])):
                    page_report["blockedExternalHosts"].append("blocked")
                    BLOCKED_EXTERNAL_REQUESTS.append("blocked-external-request")
                    route.abort("blockedbyclient")
                    return
                route.continue_()

            page.route("**/*", guard_host)
            def record_request(request, *, page_report=page_report, label=label):
                scheme = urlsplit(request.url).scheme
                is_websocket = scheme in {"ws", "wss"}
                target = "websocketOrigins" if is_websocket else "httpOrigins"
                request_origin = origin(request.url)
                if request_origin not in page_report[target]:
                    page_report[target].append(request_origin)
                if is_websocket or urlsplit(request_origin).hostname == page_report["allowedWorkerHost"]:
                    emit_communication(
                        label,
                        "websocket-request" if is_websocket else "http-request",
                        origin=request_origin,
                        resourceType=request.resource_type,
                        method=request.method,
                    )

            def record_request_failed(request, *, label=label):
                is_websocket = urlsplit(request.url).scheme in {"ws", "wss"}
                emit_communication(
                    label,
                    "websocket-request-failed" if is_websocket else "http-request-failed",
                    origin=origin(request.url),
                    resourceType=request.resource_type,
                )

            def record_response(response, *, label=label, page_report=page_report):
                request_origin = origin(response.url)
                if response.status >= 400:
                    emit_communication(
                        label,
                        "http-response-error",
                        origin=request_origin,
                        resourceType=response.request.resource_type,
                        method=response.request.method,
                        status=response.status,
                    )

            page.on("request", record_request)
            page.on("requestfailed", record_request_failed)
            page.on("response", record_response)
            page.on("pageerror", lambda error, page_report=page_report: page_report["pageErrorTypes"].append(type(error).__name__))
            page.on(
                "console",
                lambda message, page_report=page_report: page_report.__setitem__(
                    "consoleErrorCount", page_report["consoleErrorCount"] + 1
                ) if message.type == "error" else None,
            )
            def record_websocket(socket, *, label=label, page_report=page_report):
                socket_origin = origin(socket.url)
                if socket_origin != "wss://" + page_report["allowedWorkerHost"]:
                    BLOCKED_EXTERNAL_REQUESTS.append("unexpected-websocket-origin")
                page_report["websocketOrigins"].append(socket_origin)
                emit_communication(label, "websocket-created", origin=socket_origin)
                try:
                    socket.on("framesent", lambda *_: emit_communication(label, "websocket-frame-sent", origin=socket_origin))
                    socket.on("framereceived", lambda *_: emit_communication(label, "websocket-frame-received", origin=socket_origin))
                    socket.on("close", lambda *_: emit_communication(label, "websocket-closed", origin=socket_origin))
                    socket.on("socketerror", lambda *_: emit_communication(label, "websocket-error", origin=socket_origin))
                except Exception as error:
                    errors = page_report["diagnosticCallbackErrorTypes"]
                    if len(errors) < 8:
                        errors.append(type(error).__name__)

            page.on("websocket", record_websocket)

        for index, environment in enumerate(ENVIRONMENTS):
            key = environment["name"]
            active_environment["name"] = key
            action_start = len(trace["actions"])

            def trace_step(action_suffix, operation, *, environment_name=key):
                action_id = f"{environment_name}.{action_suffix}"
                return run_traced_action(trace, trace_started, active_action, action_id, operation)

            stage_report = {
                "status": "RUNNING",
                "pagesUrl": environment["pages_url"],
                "configuredWorkerOrigin": origin(environment["worker_url"]),
                "diagnosticActionStartIndex": action_start,
                "roomCreated": False,
                "guestJoined": False,
                "gameStarted": False,
                "discardSynchronized": False,
                "firstDiscardActor": None,
                "sessionKeys": {},
                "websocketOrigins": [],
                "httpOrigins": [],
            }
            online_results[key] = stage_report
            report["checks"]["B2"][key] = "RUNNING"
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
            room_code = trace_step("room-create", lambda: create_room(host_page, host_name))
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
            trace_step("room-join", lambda: join_room(guest_page, guest_name, room_code))
            stage_report["guestJoined"] = True
            test_sessions[key] = {
                "host": capture_test_session(host_page, expected_session_key, room_code, host_name),
                "guest": capture_test_session(guest_page, expected_session_key, room_code, guest_name),
            }
            test_names[key] = {"host": host_name, "guest": guest_name}
            first_discard_actor = start_online_game(
                host_page,
                guest_page,
                host_name,
                guest_name,
                lambda action_id, operation: trace_step(action_id, operation),
            )
            stage_report["firstDiscardActor"] = first_discard_actor
            stage_report["gameStarted"] = True
            actor_page = host_page if first_discard_actor == "host" else guest_page
            peer_page = guest_page if first_discard_actor == "host" else host_page
            trace_step(
                "discard-and-sync",
                lambda: online_discard_and_sync(actor_page, peer_page, first_discard_actor, stage_report),
            )
            stage_report["discardSynchronized"] = True

            trace_step(
                "host-worker-origin-check",
                lambda: require_worker_origins(observer["host"], environment, previous_count=host_socket_start),
            )
            trace_step(
                "guest-worker-origin-check",
                lambda: require_worker_origins(observer["guest"], environment, previous_count=guest_socket_start),
            )
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
            stage_report["diagnosticActionEndIndex"] = len(trace["actions"])
            stage_report["status"] = "PASSED"
            report["checks"]["B2"][key] = "PASSED"
            save_report()

        report["checks"]["B2"] = {
            "status": "PASSED", "production": "PASSED", "development": "PASSED",
            "scope": "normal-online-play-and-discard-sync",
        }
        online_phase = "B3"
        report["checks"]["B3"] = {"status": "RUNNING", "sessionKeys": "NOT_TESTED"}
        save_report()
        if BLOCKED_EXTERNAL_REQUESTS:
            raise UnsafeLiveEnvironment("unexpected-external-request")
        # The request context has no page route or diagnostic callback that can
        # expose credentials. Each target code belongs to our own test room.
        isolation = verify_environment_isolation(host_context.request, test_sessions, test_names)
        report["workerEnvironmentSeparation"] = isolation
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
                score = page.locator("#online-score-strip").inner_text()
                other = ENVIRONMENTS[1 if key == "production" else 0]["name"]
                if (not all(name in score for name in test_names[key].values()) or
                        any(name in score for name in test_names[other].values())):
                    raise UnsafeLiveEnvironment("cross-environment-game-state-mismatch")
            online_results[key]["crossPathSessionRestore"] = True
            save_report()

        report["checks"]["B3"] = {
            "status": "PASSED", "productionToProductionWorker": True,
            "developmentToDevelopmentWorker": True, "crossPathSessionRestore": True,
            "sessionKeys": "PASSED", "foreignCredentialsRejected": True,
            "ownRoomStatesSeparated": True,
        }

        for label in ("host", "guest"):
            require(not observer[label]["blockedExternalHosts"], f"online-external-host-request-{label}")
            require(not observer[label]["pageErrorTypes"], f"online-page-error-{label}")
            require(not observer[label]["consoleErrorCount"], f"online-console-error-{label}")
        collect_room_action_diagnostics(
            trace,
            trace_started_wall_ms,
            {"host": host_page, "guest": guest_page},
        )
        report["online"] = online_results
        for environment in ENVIRONMENTS:
            key = environment["name"]
            report["workerEnvironmentSeparation"][key].update({
                "expectedWorkerOrigin": origin(environment["worker_url"]),
                "observedWebSocketOrigins": online_results[key]["websocketOrigins"],
                "observedHttpOrigins": online_results[key]["httpOrigins"],
            })
        save_report()
    except Exception:
        trace["failureEnvironment"] = active_environment["name"]
        trace["failurePhase"] = online_phase
        failed_stage = online_results.get(active_environment["name"])
        if online_phase == "B2" and isinstance(failed_stage, dict):
            failed_stage["status"] = "FAILED"
            failed_stage["failedActionId"] = trace.get("failedActionId")
            failed_stage["lastSuccessfulActionId"] = trace.get("lastSuccessfulActionId")
            failed_stage["failureUiSnapshots"] = {
                "host": capture_online_ui_state(host_page, observer["host"]) if host_page else {"snapshotStatus": "page-unavailable"},
                "guest": capture_online_ui_state(guest_page, observer["guest"]) if guest_page else {"snapshotStatus": "page-unavailable"},
            }
        try:
            collect_room_action_diagnostics(
                trace,
                trace_started_wall_ms,
                {"host": host_page, "guest": guest_page},
            )
        except Exception as diagnostic_error:
            errors = trace.setdefault("roomActionDiagnosticErrorTypes", [])
            if len(errors) < 8:
                errors.append(type(diagnostic_error).__name__)
        try:
            save_report()
        except Exception as diagnostic_error:
            errors = trace.setdefault("reportWriteErrorTypes", [])
            if len(errors) < 8:
                errors.append(type(diagnostic_error).__name__)
        raise
    finally:
        cleanup_errors = []
        for context in (guest_context, host_context):
            if context is not None:
                try:
                    context.close()
                except Exception as error:
                    cleanup_errors.append(type(error).__name__)
        if cleanup_errors:
            trace["cleanupErrorTypes"] = cleanup_errors
            save_report()
            raise UnsafeLiveEnvironment("online-context-cleanup-failed") from None


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
        # Change production again after both keys exist and verify development
        # still restores its own settings in the same browser context.
        set_and_save_rules(production, "tonpu", True, PRODUCTION_RULES_KEY)
        reopen_and_check_rules(production, "tonpu", True, "production-after-change")
        reopen_and_check_rules(development, "tonpu", False, "development-after-production-change")

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
            "bothDirectionsChecked": True,
        }
        require(report["storageSeparation"]["sameOrigin"], "pages-not-same-origin")
        save_report()
    finally:
        context.close()


def run_pwa_and_multitab_check(browser, cache_expectations, report, save_report):
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
        for key, observer in observers.items():
            require(not observer["blockedExternalHosts"], f"pwa-external-host-request-{key}")
            require(not observer["pageErrorTypes"], f"pwa-page-error-{key}")
            require(not observer["consoleErrorCount"], f"pwa-console-error-{key}")
        report["pwa"] = {
            "production": {"scope": ENVIRONMENTS[0]["pages_url"], "script": ENVIRONMENTS[0]["pages_url"] + "sw.js", "cacheNames": production_cache_names},
            "development": {"scope": ENVIRONMENTS[1]["pages_url"], "script": ENVIRONMENTS[1]["pages_url"] + "sw.js", "cacheNames": development_cache_names},
            "registrations": registrations,
        }
        report["checks"]["B5"] = {
            "status": "PASSED", "production": "PASSED", "development": "PASSED",
            "distinctScopesAndCacheNamespaces": True,
        }
        report["checks"]["B7"] = {"status": "RUNNING"}
        save_report()

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

        # Take the baseline after both second tabs and their workers are ready.
        verify_cache_bodies(development, cache_expectations, report, "beforeReload", save_report)
        before_reload = {name: sorted(paths) for name, paths in cache_inventory(development).items()}
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
        verify_cache_bodies(development, cache_expectations, report, "afterReload", save_report)
        after_reload = {
            name: sorted(paths)
            for name, paths in cache_inventory(development).items()
        }
        require(before_reload == after_reload, "cache-namespace-changed-during-tab-reload")
        for key, observer in observers.items():
            require(not observer["blockedExternalHosts"], f"pwa-external-host-request-{key}")
            require(not observer["pageErrorTypes"], f"pwa-page-error-{key}")
            require(not observer["consoleErrorCount"], f"pwa-console-error-{key}")

        report["multiTab"] = {
            "tabsPerEnvironment": 2,
            "productionAndDevelopmentControllersRemainDistinct": True,
            "crossEnvironmentReloadPreservedOtherController": True,
            "cacheNamesBefore": sorted(before_reload),
            "cacheNamesAfter": sorted(after_reload),
            "cacheUrlInventoryUnchanged": True,
            "cacheResponseBodiesMatchBeforeAndAfterReload": True,
            "waitingUpdateBehavior": "NOT_TESTED_NO_PUBLICATION_PERMITTED",
        }
        save_report()
    finally:
        context.close()


def run_offline_cpu_check(browser, environment, report, save_report):
    key = environment["name"]
    check = {
        "status": "RUNNING",
        "pagesUrl": environment["pages_url"],
        "serviceWorkerControlledBeforeOffline": False,
        "offlineEntryStatus": None,
        "cpuGameStarted": False,
        "discardCount": 0,
        "offlineEmulationDisabled": False,
        "networkRecoveryVerified": False,
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
        context.set_offline(False)
        check["offlineEmulationDisabled"] = True
        page.wait_for_function("navigator.onLine", timeout=20_000)
        release_url = environment["pages_url"] + "release.json"
        with page.expect_response(lambda response: response.url == release_url and response.request.method == "GET", timeout=20_000) as observed:
            status = page.evaluate("""async url => {
              const response = await fetch(url, {cache: 'no-store'});
              return response.status;
            }""", release_url)
        response = observed.value
        require(status == 200 and response.status == 200 and not response.from_service_worker,
                f"offline-network-recovery-failed-{key}")
        check["networkRecoveryVerified"] = True
        check["status"] = "PASSED"
    except Exception as error:
        check["status"] = "FAILED"
        check["failureType"] = type(error).__name__
        raise
    finally:
        cleanup_errors = []
        try:
            context.set_offline(False)
            check["offlineEmulationDisabled"] = True
        except Exception as error:
            cleanup_errors.append(type(error).__name__)
        try:
            context.close()
        except Exception as error:
            cleanup_errors.append(type(error).__name__)
        if cleanup_errors:
            check["status"] = "FAILED"
            check["cleanupErrorTypes"] = cleanup_errors
        report.setdefault("offline", {})[key] = check
        save_report()
        if cleanup_errors:
            raise UnsafeLiveEnvironment("offline-context-cleanup-failed") from None


def run_b1_check(browser, environment, expected_release, report, save_report):
    key = environment["name"]
    page_report = {
        "environment": key, "pagesUrl": environment["pages_url"],
        "configuredWorkerOrigin": origin(environment["worker_url"]),
        "releaseSha": expected_release["sha"], "releaseDigest": expected_release["digest"],
        "entryStatus": None, "title": None, "criticalResourceFailures": [],
        "blockedExternalHosts": [], "httpOrigins": [], "consoleErrorCount": 0,
        "pageErrorTypes": [], "cpuGameStarted": False, "discardCount": 0,
    }
    context, page = make_page(browser, environment, page_report, viewport={"width": 1280, "height": 900})
    try:
        def on_response(response):
            request_info = response.request
            if request_info.resource_type in RESOURCE_TYPES and response.status >= 400:
                if not response.url.endswith("/favicon.ico"):
                    page_report["criticalResourceFailures"].append(
                        {"resourceType": request_info.resource_type, "status": response.status}
                    )

        def on_request_failed(request):
            if request.resource_type in RESOURCE_TYPES and not request.url.endswith("/favicon.ico"):
                page_report["criticalResourceFailures"].append(
                    {"resourceType": request.resource_type, "failure": "network"}
                )

        page.on("response", on_response)
        page.on("requestfailed", on_request_failed)
        response = open_public_page(page, environment)
        page_report["entryStatus"] = response.status
        page_report["title"] = page.title()
        require(page_report["title"] == environment["title"], f"B1-page-title-{key}")
        require(page.locator("#main-menu-toggle").is_visible(), f"B1-main-menu-missing-{key}")
        start_cpu_and_discard(page, page_report, key)
        require(not page_report["criticalResourceFailures"], f"B1-critical-resource-failure-{key}")
        require(not page_report["blockedExternalHosts"], f"B1-external-host-request-{key}")
        require(not page_report["consoleErrorCount"], f"B1-console-error-{key}")
        require(not page_report["pageErrorTypes"], f"B1-page-error-{key}")
        page_report["status"] = "PASSED"
    except Exception:
        page_report["status"] = "FAILED"
        raise
    finally:
        context.close()
        report["environments"].append(page_report)
        save_report()


def execute_stage(report, stage, operation, save_report):
    """Continue independent stages after expected test failures; fail closed on unknown errors."""
    try:
        operation()
        if BLOCKED_EXTERNAL_REQUESTS:
            raise UnsafeLiveEnvironment("unexpected-external-request")
        save_report()
        return True
    except UnsafeLiveEnvironment:
        raise
    except (LiveE2EFailure, PlaywrightTimeoutError, TimeoutError) as error:
        if BLOCKED_EXTERNAL_REQUESTS:
            raise UnsafeLiveEnvironment("unexpected-external-request") from None
        failure = {"stage": stage, "type": type(error).__name__}
        if isinstance(error, LiveE2EFailure) and error.args:
            failure["code"] = error.args[0]
        trace = report.get("onlineDiagnostics", {})
        if stage == "B2-B3":
            failure["stage"] = trace.get("failurePhase") or (
                "B2" if report["checks"]["B2"]["status"] == "RUNNING" else "B3")
        elif stage == "B5-B7":
            failure["stage"] = "B5" if report["checks"]["B5"]["status"] == "RUNNING" else "B7"
        if stage == "B2-B3" and trace.get("failedActionId"):
            failure["actionId"] = trace["failedActionId"]
            failure["lastSuccessfulActionId"] = trace.get("lastSuccessfulActionId")
        report.setdefault("failures", []).append(failure)
        report.setdefault("failure", failure)
        save_report()
        return False
    except Exception as error:
        # Do not persist arbitrary exception messages, which can contain URLs,
        # session data or other secrets. Unknown failures stop further work.
        raise UnsafeLiveEnvironment("unexpected-" + type(error).__name__) from None


def run_phase_checks(browser, browser_name, expected_releases, report, save_report, cache_expectations):
    checks = report["checks"]
    checks["B1"] = {"status": "RUNNING", "production": "NOT_TESTED", "development": "NOT_TESTED"}
    for environment in ENVIRONMENTS:
        key = environment["name"]
        checks["B1"][key] = "RUNNING"
        ok = execute_stage(report, "B1-" + key,
                           lambda env=environment, name=key: run_b1_check(
                               browser, env, expected_releases[name][0], report, save_report), save_report)
        checks["B1"][key] = "PASSED" if ok else "FAILED"
    checks["B1"]["status"] = "PASSED" if all(checks["B1"][env["name"]] == "PASSED" for env in ENVIRONMENTS) else "FAILED"
    save_report()

    checks["B2"] = {"status": "RUNNING", "production": "NOT_TESTED", "development": "NOT_TESTED"}
    checks["B3"] = {"status": "BLOCKED", "reason": "B2-not-completed", "sessionKeys": "NOT_TESTED"}
    if not execute_stage(report, "B2-B3", lambda: run_online_checks(browser, browser_name, report, save_report), save_report):
        if checks["B2"]["status"] == "RUNNING":
            checks["B2"]["status"] = "FAILED"
            for environment in ENVIRONMENTS:
                name = environment["name"]
                checks["B2"][name] = report.get("online", {}).get(name, {}).get("status", "BLOCKED")
            checks["B3"] = {"status": "BLOCKED", "reason": "B2-not-completed", "sessionKeys": "NOT_TESTED"}
        else:
            checks["B3"]["status"] = "FAILED"
    save_report()

    checks["B4"] = {"status": "RUNNING"}
    if execute_stage(report, "B4-settings", lambda: run_storage_partition_check(browser, report, save_report), save_report):
        session_verified = checks["B3"].get("sessionKeys") == "PASSED"
        checks["B4"] = {
            "status": "PASSED" if session_verified else "PARTIAL",
            "settings": "PASSED", "onlineSessionKeys": "PASSED" if session_verified else "BLOCKED",
            "sameBrowserContextAndOrigin": report["storageSeparation"]["sameOrigin"],
        }
    else:
        checks["B4"] = {"status": "FAILED", "settings": "FAILED", "onlineSessionKeys": checks["B3"].get("sessionKeys", "NOT_TESTED")}
    save_report()

    checks["B5"] = {"status": "RUNNING"}
    checks["B7"] = {"status": "BLOCKED", "reason": "B5-not-completed",
                    "waitingUpdateBehavior": "NOT_TESTED_NO_PUBLICATION_PERMITTED"}
    if execute_stage(report, "B5-B7", lambda: run_pwa_and_multitab_check(browser, cache_expectations, report, save_report), save_report):
        checks["B7"] = {"status": "PARTIAL", "crossEnvironmentTabsAndReload": "PASSED",
                        "cacheUrlInventoryUnchanged": "PASSED",
                        "cacheResponseBodies": "PASSED",
                        "waitingUpdateBehavior": "NOT_TESTED_NO_PUBLICATION_PERMITTED"}
    elif checks["B5"]["status"] == "RUNNING":
        checks["B5"]["status"] = "FAILED"
    else:
        checks["B7"] = {"status": "FAILED", "waitingUpdateBehavior": "NOT_TESTED_NO_PUBLICATION_PERMITTED"}
    save_report()

    checks["B6"] = {"status": "RUNNING", "production": "NOT_TESTED", "development": "NOT_TESTED"}
    for environment in ENVIRONMENTS:
        key = environment["name"]
        checks["B6"][key] = "RUNNING"
        ok = execute_stage(report, "B6-" + key,
                           lambda env=environment: run_offline_cpu_check(browser, env, report, save_report), save_report)
        checks["B6"][key] = "PASSED" if ok else "FAILED"
    checks["B6"]["status"] = "PASSED" if all(checks["B6"][env["name"]] == "PASSED" for env in ENVIRONMENTS) else "FAILED"
    save_report()


def required_checks_passed(report):
    checks = report["checks"]
    return (not report.get("failures") and
            all(checks[key]["status"] == "PASSED" for key in ("B1", "B2", "B3", "B4", "B5", "B6")) and
            checks["B7"]["status"] == "PARTIAL" and
            checks["B7"].get("crossEnvironmentTabsAndReload") == "PASSED" and
            checks["B7"].get("cacheUrlInventoryUnchanged") == "PASSED" and
            checks["B7"].get("cacheResponseBodies") == "PASSED" and
            checks["B7"].get("publicMetadataUnchanged") is True)




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
                    cache_expectations = {}
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
                        cache_expectations[key] = snapshot_cache_expectation(snapshot_root, environment, release)

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

                    stage = "phase-checks"
                    run_phase_checks(browser, browser_name, expected_releases, report, save_report, cache_expectations)

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

        if report["checks"]["B7"]["status"] == "PARTIAL":
            report["checks"]["B7"]["reason"] = (
                "Waiting Service Worker update behavior requires a published version change, "
                "which this verification is not authorized to trigger."
            )
        if not required_checks_passed(report):
            report["outcome"] = "FAILURE"
            write_report(report)
            print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)
            raise SystemExit("live public Pages E2E has failed or blocked required checks")
        report["outcome"] = "PARTIAL"
    except Exception as error:
        report["outcome"] = "FAILURE"
        fatal = {"stage": stage, "type": type(error).__name__}
        online_diagnostics = report.get("onlineDiagnostics", {})
        if online_diagnostics.get("failedActionId"):
            fatal["actionId"] = online_diagnostics["failedActionId"]
        if online_diagnostics.get("lastSuccessfulActionId"):
            fatal["lastSuccessfulActionId"] = online_diagnostics["lastSuccessfulActionId"]
        if isinstance(error, LiveE2EFailure) and error.args:
            fatal["code"] = error.args[0]
        report.setdefault("failure", fatal)
        report["fatalFailure"] = fatal
        for check in report["checks"].values():
            if check["status"] == "RUNNING":
                check["status"] = "FAILED"
                for environment in ("production", "development"):
                    if check.get(environment) == "RUNNING":
                        check[environment] = "FAILED"
                    elif check.get(environment) == "NOT_TESTED":
                        check[environment] = "BLOCKED"
            elif check["status"] == "NOT_STARTED":
                check.update({"status": "BLOCKED", "reason": "preflight-or-safety-stop"})
        write_report(report)
        print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)
        raise SystemExit(f"live public Pages E2E failed at {stage}: {type(error).__name__}") from None

    finally:
        if report["outcome"] in {"SUCCESS", "PARTIAL"}:
            write_report(report)
            print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
