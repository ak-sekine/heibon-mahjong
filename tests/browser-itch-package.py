"""Smoke-test the standalone relative-base itch.io output in Chromium/WebKit."""
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_ITCH_URL', 'http://127.0.0.1:4175/')
BROWSER_NAME = os.environ.get('HEIBON_BROWSER', 'chromium')
REPETITIONS = int(os.environ.get('HEIBON_SMOKE_REPETITIONS', '3'))
ARTIFACT_DIR = Path(os.environ.get('HEIBON_SMOKE_ARTIFACT_DIR', '/tmp/heibon-itch-smoke'))
TURN_TIMEOUT_MS = 20_000

# DiagnosticLog already applies an allowlist, but artifacts apply a second
# allowlist so this test cannot persist a newly added sensitive field by
# accident.
SAFE_DIAGNOSTIC_KEYS = {
    'actionType', 'seat', 'phase', 'startPhase', 'endPhase', 'runnerState',
    'currentTurn', 'remainingTiles', 'round', 'honba', 'lastTransition',
    'currentStage', 'lastCompletedStage', 'waitingAsync', 'decisionPending',
    'previousPhase', 'nextPhase', 'progressing', 'stateUpdateResult',
    'candidateCount', 'disabled', 'delta', 'source', 'status', 'outcome',
    'stage', 'lastProgressElapsedMs', 'startedAt', 'lastProgressAt',
}
SAFE_EVENT_PATTERN = r'^(?:local_game_diagnostic_snapshot|local_runner_started|local_cpu_.*|local_action_(?:state_update|progress)_(?:started|succeeded|failed|completed)|local_game_(?:phase_changed|round_ended|render_succeeded|state_transition)|local_game_render_failed|local_cpu_runner_stalled)$'
def safe_url(url):
    """Keep origin and path while removing query, fragment, and credentials."""
    parsed = urlsplit(url)
    host = parsed.hostname or ''
    if ':' in host and not host.startswith('['):
        host = f'[{host}]'
    if parsed.port:
        host = f'{host}:{parsed.port}'
    return urlunsplit((parsed.scheme, host, parsed.path, '', ''))


def safe_message(message):
    message = str(message)
    message = re.sub(r'(?i)(token|ticket|authorization|cookie|password|secret|room.?code|participant)[=:][^\s&]+', r'\1=[redacted]', message)
    message = re.sub(r'https?://[^\s]+', lambda match: safe_url(match.group(0)), message)
    return message[:1000]


def collect_game_state(page):
    """Use the game's diagnostics UI to record a safe snapshot and public DOM state."""
    page.locator('#main-menu-toggle').click()
    page.locator('#menu-diagnostics').click()
    state = page.evaluate('''({safeKeys, safeEventPattern}) => {
      const rows = (() => {
        try { return JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2') || '[]'); }
        catch { return []; }
      })();
      const safeEntries = rows.filter(row => new RegExp(safeEventPattern).test(row.event))
        .slice(-40).map(row => ({
          timestamp: row.timestamp, level: row.level, event: row.event,
          details: Object.fromEntries(Object.entries(row.details || {}).filter(([key]) => safeKeys.includes(key)))
        }));
      const snapshot = [...safeEntries].reverse().find(row => row.event === 'local_game_diagnostic_snapshot')?.details ?? null;
      const hand = document.querySelector('#player-hand');
      const buttons = [...document.querySelectorAll('#player-hand button')];
      const activeDialogs = [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id || 'dialog');
      const bottomWind = document.querySelector('#label-0 .seat-wind')?.textContent?.trim() ?? null;
      const seatByWind = {'東':0,'南':1,'西':2,'北':3};
      return {
        phase: snapshot?.phase ?? null,
        currentTurn: snapshot?.currentTurn ?? null,
        humanSeat: bottomWind ? (seatByWind[bottomWind] ?? null) : null,
        round: snapshot?.round ?? document.querySelector('#table-round')?.textContent?.trim() ?? null,
        honba: snapshot?.honba ?? null,
        runnerState: snapshot?.runnerState ?? null,
        cpuProgressing: snapshot?.runnerState === 'running',
        hand: { exists: Boolean(hand), visible: Boolean(hand && hand.getClientRects().length),
          count: hand?.querySelectorAll('li').length ?? 0,
          buttonCount: buttons.length, enabled: buttons.filter(button => !button.disabled).length,
          disabled: buttons.filter(button => button.disabled).length },
        activeDialogs,
        callDecisionOpen: Boolean(document.querySelector('#call-decision-dialog')?.open),
        decisions: {
          callPending: Boolean(document.querySelector('#call-controls') && !document.querySelector('#call-controls').hidden),
          ronPending: Boolean(document.querySelector('#ron-controls') && !document.querySelector('#ron-controls').hidden),
        },
        panel: { visible: Boolean(document.querySelector('#local-game-controls')?.getClientRects().length),
          status: document.querySelector('#selection-status')?.textContent?.trim() ?? '' },
        riverTiles: document.querySelectorAll('.river-tile[data-tile-id]').length,
        riverCounts: [...document.querySelectorAll('.river')].map(river => ({
          displaySeat: river.dataset.playerId ?? null, count: river.querySelectorAll('.river-tile[data-tile-id]').length,
        })),
        melds: [...document.querySelectorAll('.open-melds')].map(root => ({
          visible: Boolean(root.getClientRects().length), tileCount: root.querySelectorAll('[data-tile-id]').length,
        })),
        meldTiles: document.querySelectorAll('.open-melds [data-tile-id]').length,
        diagnostics: safeEntries,
      };
    }''', {'safeKeys': sorted(SAFE_DIAGNOSTIC_KEYS), 'safeEventPattern': SAFE_EVENT_PATTERN})
    page.locator('#diagnostic-close').click()
    return state


def wait_for_human_action(page, timeout_ms=TURN_TIMEOUT_MS):
    """Advance only through normal decision controls until the human can discard."""
    deadline = time.monotonic() + timeout_ms / 1000
    decisions = {'calls_passed': 0, 'ron_passed': 0, 'rounds_advanced': 0}
    while time.monotonic() < deadline:
        if page.locator('#player-hand button:enabled').count() > 0:
            return decisions

        call_dialog = page.locator('#call-decision-dialog')
        if call_dialog.evaluate('(dialog) => dialog.open'):
            pass_call = page.locator('#pass-calls')
            if pass_call.is_enabled():
                pass_call.click()
                decisions['calls_passed'] += 1
                page.wait_for_function("!document.querySelector('#call-decision-dialog').open", timeout=3000)
                continue

        pass_ron = page.locator('#pass-ron')
        if pass_ron.is_visible() and pass_ron.is_enabled():
            pass_ron.click()
            decisions['ron_passed'] += 1
            page.wait_for_timeout(50)
            continue

        result_dialog = page.locator('#result-dialog')
        if result_dialog.evaluate('(dialog) => dialog.open'):
            page.locator('#view-table').click()
            next_round = page.locator('#next-round')
            if next_round.is_visible() and next_round.is_enabled():
                next_round.click()
                decisions['rounds_advanced'] += 1
                continue

        page.wait_for_timeout(100)

    state = collect_game_state(page)
    raise TimeoutError(
        f'Human discard state was not reached within {timeout_ms}ms; '
        f'decisions={decisions}; safeState={json.dumps(state, ensure_ascii=False)}'
    )


def capture_failure(page, context, events, repetition, error, observations):
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    stem = f'{BROWSER_NAME}-iteration-{repetition}'
    state = None
    try:
        page.screenshot(path=str(ARTIFACT_DIR / f'{stem}.png'), full_page=True, timeout=5000)
    except Exception as screenshot_error:
        state = {'screenshotError': safe_message(screenshot_error)}
    try:
        # If a call decision is pending, use the real "卓を確認する" control to
        # reveal the table before opening diagnostics. This does not pass it.
        dialog = page.locator('#call-decision-dialog')
        if dialog.count() and dialog.evaluate('(node) => node.open'):
            page.locator('#call-decision-view-table').click()
        for dialog_id, close_id in (
            ('#diagnostic-dialog', '#diagnostic-close'),
            ('#result-dialog', '#view-table'),
            ('#match-result-dialog', '#match-result-close'),
            ('#new-game-dialog', '#cancel-new-game'),
        ):
            dialog = page.locator(dialog_id)
            if dialog.count() and dialog.evaluate('(node) => node.open'):
                page.locator(close_id).click()
        if page.locator('#main-menu-toggle').count() and page.locator('#menu-diagnostics').count():
            state = collect_game_state(page)
    except Exception as diagnostic_error:
        state = {**(state or {}), 'collectionError': safe_message(diagnostic_error)}
    output = {
        'browser': BROWSER_NAME,
        'iteration': repetition,
        'url': safe_url(page.url),
        'error': safe_message(error),
        'gameState': state,
        'observations': observations,
        'pageErrors': [safe_message(value) for value in events['page_errors']],
        'consoleErrors': [safe_message(value) for value in events['console_errors']],
        'requestFailures': events['request_failures'],
        'httpErrors': events['http_errors'],
    }
    (ARTIFACT_DIR / f'{stem}.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    try:
        context.tracing.stop(path=str(ARTIFACT_DIR / f'{stem}.zip'))
    except Exception as trace_error:
        output['traceError'] = safe_message(trace_error)
        (ARTIFACT_DIR / f'{stem}.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')


def run_iteration(browser, repetition):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    context.add_init_script('''(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.execCommand = command => {
        if (command !== 'copy') return false;
        window.__copiedDiagnosticText = document.querySelector('textarea')?.value ?? '';
        return true;
      };
    })();''')
    context.tracing.start(screenshots=True, snapshots=True, sources=False)
    page = context.new_page()
    page.set_default_timeout(3000)
    events = {'page_errors': [], 'console_errors': [], 'request_failures': [], 'http_errors': []}
    observations = {}
    page.on('pageerror', lambda error: events['page_errors'].append(safe_message(error)))
    page.on('console', lambda message: events['console_errors'].append(safe_message(message.text)) if message.type == 'error' else None)
    page.on('requestfailed', lambda request: events['request_failures'].append({'url': safe_url(request.url), 'error': safe_message(request.failure or 'unknown')}))
    page.on('response', lambda response: events['http_errors'].append({'status': response.status, 'url': safe_url(response.url)}) if response.status >= 400 else None)
    try:
        response = page.goto(BASE_URL, wait_until='networkidle')
        assert response and response.status == 200, 'itch package entry point did not load'
        assert page.title() == 'Heibon Mahjong'
        assert page.locator('link[rel="manifest"]').count() == 0, 'itch package still links the Pages PWA manifest'
        assert page.locator('link[rel="apple-touch-icon"]').count() == 0, 'itch package still links the Pages PWA icon'
        assert page.evaluate('''async () => {
          if (!('serviceWorker' in navigator)) return true;
          await new Promise(resolve => setTimeout(resolve, 100));
          return (await navigator.serviceWorker.getRegistrations()).length === 0;
        }'''), 'itch package registered a Service Worker'

        page.locator('#main-menu-toggle').click()
        page.locator('#menu-diagnostics').click()
        assert page.locator('#diagnostic-execution-origin').inner_text() == page.evaluate('location.origin')
        origin_info = page.locator('#diagnostic-origin-info').inner_text()
        assert '配布モード: itch' in origin_info, origin_info
        assert 'iframe内実行: いいえ' in origin_info, origin_info
        assert 'HTTP Request Origin: 未確認' in origin_info
        page.locator('#diagnostic-copy').click()
        assert page.locator('#diagnostic-status').inner_text() == 'コピーしました。'
        copied = page.evaluate('window.__copiedDiagnosticText')
        assert 'Build Mode: itch' in copied
        assert f'Execution Origin: {page.evaluate("location.origin")}' in copied
        assert 'API Origin: https://online-mock.invalid' in copied
        assert 'token=' not in copied and 'participantToken' not in copied
        page.locator('#diagnostic-close').click()

        page.locator('#main-menu-toggle').click()
        page.locator('#new-game').click()
        page.locator('#confirm-new-game').click()
        page.wait_for_function("document.querySelectorAll('#player-hand li').length >= 13", timeout=10000)
        decisions = wait_for_human_action(page)
        observations['startupDecisions'] = decisions
        before = collect_game_state(page)
        observations['beforeDiscard'] = before
        assert before['phase'] == 'awaiting-discard', before
        assert before['currentTurn'] == before['humanSeat'], before
        assert before['hand']['enabled'] > 0 and before['hand']['count'] in (13, 14), before

        selected = page.locator('#player-hand button:enabled').first
        selected_tile_id = selected.get_attribute('data-tile-id')
        assert selected_tile_id, 'selected hand tile has no physical ID'
        selected.click()
        discard = page.locator('#discard')
        assert discard.is_enabled(), 'discard control did not become available for the selected tile'
        discard.click()

        # The action log proves the controller accepted a discard transition;
        # the physical public tile ID must then occur exactly once in the river
        # or in a called meld. A river-only condition rejects valid calls.
        page.wait_for_function('''tileId => {
          const hand = document.querySelector(`#player-hand [data-tile-id="${CSS.escape(tileId)}"]`);
          const river = document.querySelectorAll(`.river-tile[data-tile-id="${CSS.escape(tileId)}"]`).length;
          const called = document.querySelectorAll(`.open-melds .called-tile[data-tile-id="${CSS.escape(tileId)}"]`).length;
          const rows = JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2') || '[]');
          const accepted = rows.some(row => row.event === 'local_action_state_update_succeeded' &&
            row.details?.actionType === 'discard' && row.details?.previousPhase === 'awaiting-discard' &&
            ['awaiting-ron','awaiting-call','awaiting-draw','awaiting-discard','won','wall-exhausted'].includes(row.details?.nextPhase) &&
            row.details?.stateUpdateResult === 'accepted');
          const samePhaseCall = rows.some(row => row.event === 'local_game_state_transition' &&
            row.details?.source === 'GameController.confirm' && row.details?.previousPhase === 'awaiting-discard' &&
            row.details?.nextPhase === 'awaiting-discard');
          const action = rows.find(row => row.event === 'local_action_state_update_succeeded' && row.details?.actionType === 'discard');
          const stateProgressed = accepted && (action.details.nextPhase !== 'awaiting-discard' || samePhaseCall);
          return !hand && river + called === 1 && stateProgressed;
        }''', arg=selected_tile_id, timeout=5000)
        after = collect_game_state(page)
        observations['afterDiscard'] = after
        action = next((entry for entry in reversed(after['diagnostics'])
                       if entry['event'] == 'local_action_state_update_succeeded' and entry['details'].get('actionType') == 'discard'), None)
        assert action and action['details'].get('previousPhase') == 'awaiting-discard' and action['details'].get('nextPhase') in ('awaiting-ron', 'awaiting-call', 'awaiting-draw', 'awaiting-discard', 'won', 'wall-exhausted'), after
        if action['details'].get('nextPhase') == 'awaiting-discard':
            assert any(entry['event'] == 'local_game_state_transition' and
                       entry['details'].get('source') == 'GameController.confirm' and
                       entry['details'].get('previousPhase') == 'awaiting-discard' and
                       entry['details'].get('nextPhase') == 'awaiting-discard'
                       for entry in after['diagnostics']), after
        location = page.evaluate('''tileId => ({
          hand: Boolean(document.querySelector(`#player-hand [data-tile-id="${CSS.escape(tileId)}"]`)),
          river: document.querySelectorAll(`.river-tile[data-tile-id="${CSS.escape(tileId)}"]`).length,
          calledMeld: document.querySelectorAll(`.open-melds .called-tile[data-tile-id="${CSS.escape(tileId)}"]`).length,
          meldTiles: document.querySelectorAll('.open-melds [data-tile-id]').length,
          riverTiles: document.querySelectorAll('.river-tile[data-tile-id]').length,
        })''', selected_tile_id)
        assert not location['hand'] and location['river'] + location['calledMeld'] == 1, location
        assert location['river'] in (0, 1) and location['calledMeld'] in (0, 1), location
        observations['discardDestination'] = {'kind': 'river' if location['river'] else 'called-meld', **location}

        if os.environ.get('HEIBON_SMOKE_INDUCE_FAILURE') == 'after-discard':
            raise AssertionError('controlled failure to verify smoke diagnostics artifact capture')

        page.set_viewport_size({'width': 1280, 'height': 800})
        page.wait_for_timeout(100)
        dimensions = page.evaluate('({width: innerWidth, documentWidth: document.documentElement.scrollWidth, height: innerHeight})')
        assert dimensions['documentWidth'] <= dimensions['width'], f'horizontal overflow: {dimensions}'
        assert not events['http_errors'], f'HTTP errors for package resources: {events["http_errors"]}'
        assert not events['request_failures'], f'failed package requests: {events["request_failures"]}'
        assert not events['page_errors'], f'uncaught browser errors: {events["page_errors"]}'
        assert not events['console_errors'], f'browser console errors: {events["console_errors"]}'
        context.tracing.stop()
        print(f'{BROWSER_NAME} iteration {repetition}/{REPETITIONS}: itch package loaded; startup decisions handled={decisions}; human discard accepted; tile remained in {"river" if location["river"] else "called meld"}; no errors.')
    except BaseException as error:
        capture_failure(page, context, events, repetition, error, observations)
        raise
    finally:
        context.close()


with sync_playwright() as playwright:
    browser = getattr(playwright, BROWSER_NAME).launch()
    try:
        for iteration in range(1, REPETITIONS + 1):
            run_iteration(browser, iteration)
    finally:
        browser.close()
