#!/usr/bin/env python3
"""Offline contract tests for the live E2E orchestrator and isolation probes."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch


# Contract tests do not launch a browser or require Playwright installation.
playwright = types.ModuleType('playwright')
sync_api = types.ModuleType('playwright.sync_api')
class FakePlaywrightTimeout(Exception):
    pass
sync_api.TimeoutError = FakePlaywrightTimeout
sync_api.sync_playwright = lambda: None
playwright.sync_api = sync_api
sys.modules['playwright'] = playwright
sys.modules['playwright.sync_api'] = sync_api
spec = importlib.util.spec_from_file_location('live_e2e', Path(__file__).with_name('browser-live-environment-e2e.py'))
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)


def report_fixture():
    return {'checks': {f'B{i}': {'status': 'NOT_STARTED'} for i in range(1, 8)}, 'environments': []}


def run_fake_stages(online, *, pwa_failure=None, offline_failure=None):
    report = report_fixture()
    calls = []
    releases = {env['name']: ({'sha': 'test', 'digest': 'test'}, b'') for env in live.ENVIRONMENTS}

    def b1(_browser, env, _release, _report, _save):
        calls.append('B1:' + env['name'])

    def b4(_browser, result, _save):
        calls.append('B4')
        result['storageSeparation'] = {'sameOrigin': True}

    def pwa(_browser, result, _save):
        calls.append('PWA')
        if pwa_failure == 'B5':
            raise live.LiveE2EFailure('manifest-missing-production')
        result['checks']['B5'] = {'status': 'PASSED'}
        result['checks']['B7'] = {'status': 'RUNNING'}
        if pwa_failure == 'B7':
            raise live.LiveE2EFailure('pwa-second-tab-failure')

    def b6(_browser, env, _report, _save):
        calls.append('B6:' + env['name'])
        if env['name'] == offline_failure:
            raise FakePlaywrightTimeout('PRIVATE SESSION SENTINEL')

    with patch.object(live, 'run_b1_check', side_effect=b1), \
         patch.object(live, 'run_online_checks', side_effect=online), \
         patch.object(live, 'run_storage_partition_check', side_effect=b4), \
         patch.object(live, 'run_pwa_and_multitab_check', side_effect=pwa), \
         patch.object(live, 'run_offline_cpu_check', side_effect=b6):
        live.run_phase_checks(None, 'chromium', releases, report, lambda: None)
    return report, calls


class StageContractTests(unittest.TestCase):
    def test_b2_timeout_runs_independent_stages_and_blocks_b3_session(self):
        def online(_browser, _name, report, _save):
            report['online'] = {'production': {'status': 'FAILED'}, 'development': {}}
            report['onlineDiagnostics'] = {'failedActionId': 'production.room-join'}
            raise FakePlaywrightTimeout('PRIVATE SESSION SENTINEL')
        report, calls = run_fake_stages(online)
        self.assertEqual(report['checks']['B2']['status'], 'FAILED')
        self.assertEqual(report['checks']['B2']['development'], 'BLOCKED')
        self.assertEqual(report['checks']['B3']['status'], 'BLOCKED')
        self.assertEqual(report['checks']['B4']['status'], 'PARTIAL')
        self.assertEqual(report['checks']['B4']['onlineSessionKeys'], 'BLOCKED')
        self.assertEqual(report['checks']['B5']['status'], 'PASSED')
        self.assertEqual(report['checks']['B6']['status'], 'PASSED')
        self.assertEqual(report['checks']['B7']['status'], 'PARTIAL')
        self.assertEqual(report['failure']['stage'], 'B2')
        self.assertIn('B4', calls)
        self.assertIn('PWA', calls)
        self.assertIn('B6:development', calls)
        self.assertFalse(live.required_checks_passed(report))
        self.assertNotIn('PRIVATE SESSION SENTINEL', json.dumps(report))

    def test_b3_failure_preserves_b2_success_and_blocks_session_claim(self):
        def online(_browser, _name, report, _save):
            report['checks']['B2'] = {'status': 'PASSED'}
            report['checks']['B3'] = {'status': 'RUNNING', 'sessionKeys': 'NOT_TESTED'}
            raise live.LiveE2EFailure('cross-environment-token-rejection-status-production-host')
        report, _ = run_fake_stages(online)
        self.assertEqual(report['checks']['B2']['status'], 'PASSED')
        self.assertEqual(report['checks']['B3']['status'], 'FAILED')
        self.assertEqual(report['failure']['stage'], 'B3')
        self.assertEqual(report['checks']['B4']['onlineSessionKeys'], 'BLOCKED')
        self.assertFalse(live.required_checks_passed(report))

    def test_failure_aggregation_preserves_b5_and_runs_other_offline_environment(self):
        def online(_browser, _name, report, _save):
            report['checks']['B2'] = {'status': 'PASSED'}
            report['checks']['B3'] = {'status': 'PASSED', 'sessionKeys': 'PASSED'}
        report, calls = run_fake_stages(online, pwa_failure='B7', offline_failure='production')
        self.assertEqual(report['checks']['B5']['status'], 'PASSED')
        self.assertEqual(report['checks']['B7']['status'], 'FAILED')
        self.assertEqual(report['checks']['B6']['production'], 'FAILED')
        self.assertEqual(report['checks']['B6']['development'], 'PASSED')
        self.assertEqual(len(report['failures']), 2)
        self.assertEqual([item['stage'] for item in report['failures']], ['B7', 'B6-production'])
        self.assertIn('B6:development', calls)
        self.assertFalse(live.required_checks_passed(report))

    def test_b5_failure_blocks_b7_without_marking_it_failed(self):
        def online(_browser, _name, report, _save):
            report['checks']['B2'] = {'status': 'PASSED'}
            report['checks']['B3'] = {'status': 'PASSED', 'sessionKeys': 'PASSED'}
        report, _ = run_fake_stages(online, pwa_failure='B5')
        self.assertEqual(report['checks']['B5']['status'], 'FAILED')
        self.assertEqual(report['checks']['B7']['status'], 'BLOCKED')
        self.assertEqual(report['checks']['B6']['status'], 'PASSED')

    def test_all_required_checks_and_public_metadata_are_required(self):
        def online(_browser, _name, report, _save):
            report['checks']['B2'] = {'status': 'PASSED'}
            report['checks']['B3'] = {'status': 'PASSED', 'sessionKeys': 'PASSED'}
        report, _ = run_fake_stages(online)
        self.assertFalse(live.required_checks_passed(report))
        report['checks']['B7']['publicMetadataUnchanged'] = True
        self.assertTrue(live.required_checks_passed(report))
        report['checks']['B4']['status'] = 'PARTIAL'
        self.assertFalse(live.required_checks_passed(report))

    def test_safety_failure_stops_before_independent_stages(self):
        report = report_fixture()
        releases = {env['name']: ({}, b'') for env in live.ENVIRONMENTS}
        with patch.object(live, 'run_b1_check'), \
             patch.object(live, 'run_online_checks', side_effect=live.UnsafeLiveEnvironment('worker-config-mismatch-production')), \
             patch.object(live, 'run_storage_partition_check') as storage:
            with self.assertRaises(live.UnsafeLiveEnvironment):
                live.run_phase_checks(None, 'chromium', releases, report, lambda: None)
            storage.assert_not_called()

    def test_unknown_exception_does_not_expose_message_or_continue(self):
        report = report_fixture()
        with self.assertRaises(live.UnsafeLiveEnvironment) as caught:
            live.execute_stage(report, 'B2', lambda: (_ for _ in ()).throw(ValueError('SECRET VALUE')), lambda: None)
        self.assertNotIn('SECRET VALUE', str(caught.exception))
        self.assertNotIn('SECRET VALUE', json.dumps(report))

    def test_blocked_external_request_stops_even_after_timeout(self):
        report = report_fixture()
        live.BLOCKED_EXTERNAL_REQUESTS.append('blocked-external-request')
        try:
            with self.assertRaises(live.UnsafeLiveEnvironment):
                live.execute_stage(report, 'B2', lambda: (_ for _ in ()).throw(
                    FakePlaywrightTimeout('PRIVATE SESSION SENTINEL')), lambda: None)
        finally:
            live.BLOCKED_EXTERNAL_REQUESTS.clear()
        self.assertNotIn('PRIVATE SESSION SENTINEL', json.dumps(report))


class Response:
    def __init__(self, status, value):
        self.status, self.value = status, value
    def json(self):
        return self.value


class IsolationContractTests(unittest.TestCase):
    def setUp(self):
        self.sessions = {
            'production': {'host': {'roomCode': 'AAAAAA', 'participantToken': 'a' * 64},
                           'guest': {'roomCode': 'AAAAAA', 'participantToken': 'b' * 64}},
            'development': {'host': {'roomCode': 'BBBBBB', 'participantToken': 'c' * 64},
                            'guest': {'roomCode': 'BBBBBB', 'participantToken': 'd' * 64}},
        }
        self.names = {'production': {'host': 'prod-host', 'guest': 'prod-guest'},
                      'development': {'host': 'dev-host', 'guest': 'dev-guest'}}
        self.calls = []

    def request(self, *, status=401, room_override=None, socket_status=401, unavailable_room=None):
        outer = self
        class Request:
            def get(self, url, **kwargs):
                key = 'development' if '-dev.' in url else 'production'
                outer.calls.append(('get', key, url))
                own_url = live.ENVIRONMENTS[1 if key == 'development' else 0]['worker_url'] + '/api/rooms/' + outer.sessions[key]['host']['roomCode']
                assert url in (own_url, own_url + '/socket'), 'request must target a test-owned room'
                if url.endswith('/socket'):
                    assert '/api/rooms/' + outer.sessions[key]['host']['roomCode'] + '/socket' in url
                    assert kwargs['headers']['Sec-WebSocket-Protocol'] == 'heibon-mahjong.v1, ticket.' + 'e' * 64
                    return Response(socket_status, {'error': 'invalid_ticket'})
                if key == unavailable_room:
                    return Response(404, {'error': 'room_not_found'})
                names = (room_override.get(key, outer.names[key].values())
                         if isinstance(room_override, dict) else
                         room_override if room_override is not None else outer.names[key].values())
                return Response(200, {'roomCode': outer.sessions[key]['host']['roomCode'], 'status': 'finalized',
                                      'gameRevision': 2, 'seats': [{'kind': 'human', 'name': n} for n in names]})
            def post(self, url, **kwargs):
                key = 'development' if '-dev.' in url else 'production'
                outer.calls.append(('post', key, url))
                own_url = live.ENVIRONMENTS[1 if key == 'development' else 0]['worker_url'] + '/api/rooms/' + outer.sessions[key]['host']['roomCode'] + '/ticket'
                assert url == own_url, 'request must target a test-owned room'
                other = 'production' if key == 'development' else 'development'
                authorization = kwargs['headers']['Authorization']
                foreign = {'Bearer ' + outer.sessions[other][role]['participantToken'] for role in ('host', 'guest')}
                own = {'Bearer ' + outer.sessions[key][role]['participantToken'] for role in ('host', 'guest')}
                assert authorization in foreign | own
                if authorization in own:
                    return Response(200, {'ticket': 'e' * 64})
                return Response(status, {'error': 'unauthorized'})
        return Request()

    def test_cross_credentials_are_rejected_against_own_rooms_only(self):
        result = live.verify_environment_isolation(self.request(), self.sessions, self.names)
        self.assertEqual(len(self.calls), 14)
        for method, key, url in self.calls:
            self.assertIn('/api/rooms/' + self.sessions[key]['host']['roomCode'], url)
        self.assertTrue(all(value['foreignCredentialsRejected'] for value in result.values()))
        self.assertTrue(all(value['ownRoomStatesDistinct'] for value in result.values()))
        self.assertTrue(all('foreignRoomStateNotShared' not in value for value in result.values()))
        self.assertTrue(all(value['foreignTicketSocketRejectionStatuses'] == [401, 401] for value in result.values()))
        encoded = json.dumps(result)
        for environment in self.sessions.values():
            for session in environment.values():
                self.assertNotIn(session['participantToken'], encoded)
                self.assertNotIn(session['roomCode'], encoded)
        self.assertNotIn('e' * 64, encoded)

    def test_successful_wrong_environment_ticket_is_safety_stop(self):
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(status=200), self.sessions, self.names)
        self.assertEqual(len(self.calls), 3)

    def test_unverified_second_room_stops_before_any_authentication(self):
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(room_override={'development': ['unexpected']}), self.sessions, self.names)
        self.assertEqual([call[0] for call in self.calls], ['get', 'get'])

    def test_unavailable_second_room_is_safety_stop_before_authentication(self):
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(unavailable_room='development'), self.sessions, self.names)
        self.assertEqual([call[0] for call in self.calls], ['get', 'get'])

    def test_foreign_ticket_upgrade_is_a_safety_stop_if_accepted(self):
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(socket_status=101), self.sessions, self.names)

    def test_same_codes_created_in_both_environments_do_not_probe_an_unknown_room(self):
        for role in ('host', 'guest'):
            self.sessions['development'][role]['roomCode'] = 'AAAAAA'
        result = live.verify_environment_isolation(self.request(), self.sessions, self.names)
        self.assertEqual(len(self.calls), 14)
        self.assertTrue(all(value['ownRoomStatesDistinct'] for value in result.values()))

    def test_missing_room_and_other_failures_are_not_rejections(self):
        with self.assertRaises(live.LiveE2EFailure):
            live.verify_environment_isolation(self.request(status=404), self.sessions, self.names)

    def test_mixed_room_state_is_safety_stop_before_token_requests(self):
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(room_override=['prod-host', 'dev-guest']), self.sessions, self.names)
        self.assertEqual(len(self.calls), 1)

    def test_mismatched_own_session_does_not_contact_any_room(self):
        self.sessions['production']['guest']['roomCode'] = 'CCCCCC'
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(), self.sessions, self.names)
        self.assertEqual(self.calls, [])

    def test_mismatched_source_session_stops_before_any_request(self):
        self.sessions['development']['guest']['roomCode'] = 'CCCCCC'
        with self.assertRaises(live.UnsafeLiveEnvironment) as caught:
            live.verify_environment_isolation(self.request(), self.sessions, self.names)
        self.assertEqual(self.calls, [])
        message = str(caught.exception)
        for environment in self.sessions.values():
            for session in environment.values():
                self.assertNotIn(session['participantToken'], message)
                self.assertNotIn(session['roomCode'], message)

    def test_duplicate_names_stop_before_any_request(self):
        self.names['development']['host'] = self.names['production']['host']
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(), self.sessions, self.names)
        self.assertEqual(self.calls, [])

    def test_duplicate_credentials_and_invalid_code_stop_before_requests(self):
        self.sessions['development']['guest']['participantToken'] = 'a' * 64
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(), self.sessions, self.names)
        self.assertEqual(self.calls, [])
        self.sessions['development']['guest']['participantToken'] = 'd' * 64
        self.sessions['development']['host']['roomCode'] = '../unsafe'
        with self.assertRaises(live.UnsafeLiveEnvironment):
            live.verify_environment_isolation(self.request(), self.sessions, self.names)
        self.assertEqual(self.calls, [])


class OfflineRecoveryTests(unittest.TestCase):
    def run_offline(self, *, service_worker_response=False, cleanup_failure=False):
        report, toggles = {}, []
        class Context:
            def set_offline(self, value):
                toggles.append(value)
                if cleanup_failure and toggles.count(False) == 2:
                    raise RuntimeError('private cleanup detail')
            def close(self): pass
        class Locator:
            def wait_for(self, **kwargs): pass
        class Page:
            def goto(self, *args, **kwargs): return Response(200, {})
            def locator(self, selector): return Locator()
            def wait_for_function(self, *args, **kwargs): pass
            def expect_response(self, predicate, **kwargs):
                response = types.SimpleNamespace(url=live.ENVIRONMENTS[0]['pages_url'] + 'release.json',
                    request=types.SimpleNamespace(method='GET'), status=200,
                    from_service_worker=service_worker_response)
                assert predicate(response)
                class Observation:
                    value = response
                    def __enter__(self): return self
                    def __exit__(self, *args): pass
                return Observation()
            def evaluate(self, *args): return 200
        page = Page()
        with patch.object(live, 'make_page', return_value=(Context(), page)), \
             patch.object(live, 'open_public_page'), \
             patch.object(live, 'load_service_worker', return_value={'script': live.ENVIRONMENTS[0]['pages_url'] + 'sw.js'}), \
             patch.object(live, 'cache_inventory', return_value={'cache': ['/heibon-mahjong/']}), \
             patch.object(live, 'expected_cache_inventory', return_value=['cache']), \
             patch.object(live, 'start_cpu_and_discard'):
            # configure_page normally creates the counter in make_page.
            original_make_page = live.make_page
            def make_page(*args, **kwargs):
                args[2]['consoleErrorCount'] = 0
                return original_make_page(*args, **kwargs)
            with patch.object(live, 'make_page', side_effect=make_page):
                if cleanup_failure:
                    with self.assertRaises(live.UnsafeLiveEnvironment):
                        live.run_offline_cpu_check(None, live.ENVIRONMENTS[0], report, lambda: None)
                elif service_worker_response:
                    with self.assertRaises(live.LiveE2EFailure):
                        live.run_offline_cpu_check(None, live.ENVIRONMENTS[0], report, lambda: None)
                else:
                    live.run_offline_cpu_check(None, live.ENVIRONMENTS[0], report, lambda: None)
        return report['offline']['production'], toggles

    def test_online_recovery_requires_real_network_response(self):
        check, toggles = self.run_offline()
        self.assertEqual(check['status'], 'PASSED')
        self.assertTrue(check['networkRecoveryVerified'])
        self.assertEqual(toggles, [True, False, False])

    def test_cleanup_error_is_reported_and_stops(self):
        check, _ = self.run_offline(cleanup_failure=True)
        self.assertEqual(check['status'], 'FAILED')
        self.assertEqual(check['cleanupErrorTypes'], ['RuntimeError'])
        self.assertNotIn('private cleanup detail', json.dumps(check))

    def test_service_worker_response_does_not_prove_network_recovery(self):
        check, toggles = self.run_offline(service_worker_response=True)
        self.assertEqual(check['status'], 'FAILED')
        self.assertFalse(check['networkRecoveryVerified'])
        self.assertTrue(check['offlineEmulationDisabled'])
        self.assertEqual(toggles, [True, False, False])


class ExpressionTests(unittest.TestCase):
    def test_unexpected_origin_is_not_written_to_diagnostics(self):
        self.assertEqual(live.origin('https://private-token.example.test/path?ticket=secret'), 'blocked-origin')
        self.assertEqual(live.origin('https://ak-sekine.github.io:444/path'), 'blocked-origin')
        self.assertEqual(live.origin('wss://heibon-mahjong-online.ak-sekine.workers.dev/path?ticket=secret'),
                         'wss://heibon-mahjong-online.ak-sekine.workers.dev')

    def test_guest_wait_requires_exact_unique_connected_unready_guest(self):
        js = r'''
const vm = require('node:vm');
let input = ''; process.stdin.on('data', x => input += x); process.stdin.on('end', () => {
  const expr = JSON.parse(input);
  const row = (name, status, role = '') => ({dataset:{kind:'human'}, querySelector: selector =>
    ({'.online-seat-name':{textContent:name}, '.online-seat-status':{textContent:status},
      '.online-seat-role':{textContent:role}})[selector]});
  const check = rows => vm.runInNewContext('(' + expr + ')', {document:{querySelectorAll:() => rows}})('guest');
  const results = [check([row('guest', '接続中・未準備')]), check([row('guest2', '接続中・未準備')]),
    check([row('guest', '未接続・未準備')]), check([row('guest', '接続中・準備完了')]),
    check([row('guest', '接続中・未準備', 'ホスト')]),
    check([row('guest', '接続中・未準備'), row('guest', '接続中・未準備')])];
  process.stdout.write(JSON.stringify(results));
});'''
        result = subprocess.run(['node', '-e', js], input=json.dumps(live.ONLINE_GUEST_CONNECTED_EXPRESSION),
                                text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(result.stdout), [True, False, False, False, False, False])

    def test_discard_evidence_does_not_store_tile_identifier(self):
        tile_id = 'private-until-discard-sentinel'
        class Locator:
            @property
            def first(self): return self
            def get_attribute(self, name): return tile_id
            def click(self): pass
            def wait_for(self, **kwargs): pass
        class Page:
            def __init__(self): self.waits = []
            def locator(self, selector): return Locator()
            def wait_for_function(self, expression, **kwargs):
                self.waits.append((expression, kwargs.get('arg')))
        actor, peer, report = Page(), Page(), {}
        with patch.object(live, 'total_online_river_tiles', side_effect=[0, 0, 1, 1]):
            live.online_discard_and_sync(actor, peer, 'guest', report)
        self.assertTrue(any(arg == tile_id for _, arg in actor.waits))
        self.assertTrue(any(arg == tile_id for _, arg in peer.waits))
        self.assertEqual(report['firstDiscardActor'], 'guest')
        self.assertNotIn(tile_id, json.dumps(report))

    def test_guest_connection_sync_precedes_ready_and_actual_actor_is_used(self):
        calls = []
        class Locator:
            def __init__(self, page, selector): self.page, self.selector = page, selector
            @property
            def first(self): return self
            def click(self): calls.append((self.page, self.selector, 'click'))
            def wait_for(self, **kwargs): calls.append((self.page, self.selector, 'wait'))
            def inner_text(self): return 'guest'
        class Page:
            def __init__(self, name): self.name = name
            def locator(self, selector): return Locator(self.name, selector)
            def wait_for_function(self, expression, **kwargs): calls.append((self.name, 'state', 'wait'))
        host, guest = Page('host'), Page('guest')
        phases = []
        def traced(name, action):
            phases.append(name)
            return action()
        with patch.object(live, 'wait_for_online_seat_ready'), \
             patch.object(live, 'wait_for_online_players_ready'), \
             patch.object(live, 'wait_for_active_online_human', return_value='guest'):
            actor = live.start_online_game(host, guest, 'host', 'guest', traced)
        self.assertEqual(actor, 'guest')
        self.assertLess(phases.index('guest-connected-on-host-wait'), phases.index('host-ready-click'))
        self.assertLess(phases.index('host-ready-sync-on-guest-wait'), phases.index('guest-ready-click'))
        self.assertIn(('guest', '#online-player-hand button[data-tile-id]:not([disabled])', 'wait'), calls)
        self.assertNotIn(('host', '#online-player-hand button[data-tile-id]:not([disabled])', 'wait'), calls)

    def test_cpu_wait_passes_offer_before_waiting_for_human_hand(self):
        class Page:
            def __init__(self): self.offer, self.clicks, self.waits = True, 0, []
            def wait_for_function(self, expression, **kwargs): self.waits.append((expression, kwargs))
            def locator(self, selector):
                page = self
                class Locator:
                    def is_visible(self): return selector == '#pass-calls' and page.offer
                    def is_enabled(self): return page.offer
                    def click(self): page.clicks += 1; page.offer = False
                return Locator()
        page = Page()
        live.wait_for_cpu_discard_boundary(page)
        self.assertEqual(page.clicks, 1)
        self.assertEqual(len(page.waits), 3)
        self.assertEqual(page.waits[1][1]['arg'], '#pass-calls')


if __name__ == '__main__':
    unittest.main()
