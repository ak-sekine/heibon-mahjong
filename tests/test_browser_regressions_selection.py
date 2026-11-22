#!/usr/bin/env python3
"""Unit checks for engine and script selection in the Browser UI runner."""

import ast
import csv
import fnmatch
import io
import runpy
from contextlib import redirect_stdout
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / 'tests' / 'run-browser-regressions.py'
GEOMETRY = ROOT / 'tests' / 'browser-candidate-geometry.py'
WORKFLOW = ROOT / '.github' / 'workflows' / 'browser-ui.yml'
RUNNER_MODULE = runpy.run_path(str(RUNNER))
SUITE = RUNNER_MODULE['SUITE']
select_scenarios = RUNNER_MODULE['select_scenarios']
parse_scenario_ids = RUNNER_MODULE['parse_scenario_ids']

EXPECTED_GROUP_ONE_IDS = {
    'chromium': {
        'browser-create-dialog-layout-chromium',
        'browser-dialog-scroll-chromium',
        'browser-online-dialog-layout-chromium-production-url-http-127-0-0-1-4174-heibon-mahjong',
        'browser-pwa-chromium',
        'browser-keyboard-help-chromium',
        'browser-app-idle-chromium',
        'browser-offline-rules-chromium',
        'browser-online-waiting-room-chromium-online-next-round-only-1',
        'browser-online-waiting-room-chromium-online-rematch-multi-client-only-1',
        'browser-riichi-discard-layout-chromium',
        'browser-action-controls-chromium',
        'browser-call-decision-dialog-chromium',
        'browser-table-ui-chromium',
        'browser-river-capacity-chromium',
        'browser-candidate-geometry-chromium',
    },
    'webkit': {
        'browser-dialog-scroll-webkit',
        'browser-online-dialog-layout-webkit-production-url-http-127-0-0-1-4174-heibon-mahjong',
        'browser-keyboard-help-webkit',
        'browser-online-waiting-room-webkit-online-exit-notice-only-1',
        'browser-online-waiting-room-webkit-online-rules-only-1',
        'browser-call-test-webkit',
        'browser-riichi-claimed-discard-webkit',
        'browser-river-capacity-webkit',
        'browser-candidate-geometry-webkit',
    },
}


class BrowserRegressionSelectionTests(unittest.TestCase):
    def test_manifest_classifies_80_required_and_two_manual_geometry_baselines(self):
        required = [item for item in SUITE if item['classification'] == 'required']
        manual = [item for item in SUITE if item['classification'] == 'manual']

        self.assertEqual(len(SUITE), 82)
        self.assertEqual(len({item['id'] for item in SUITE}), 82)
        self.assertEqual(len(required), 80)
        self.assertEqual(len(manual), 2)
        self.assertTrue(all(item['group'] in (1, 2) for item in required))
        self.assertTrue(all(item['group'] is None for item in manual))
        self.assertEqual(
            {item['id'] for item in manual},
            {
                'browser-candidate-geometry-chromium-candidate-baseline-1',
                'browser-candidate-geometry-webkit-candidate-baseline-1',
            },
        )
        self.assertEqual(
            {item['browser'] for item in manual},
            {'chromium', 'webkit'},
        )

    def test_normal_selection_paths_exclude_manual_baselines(self):
        default = select_scenarios()
        chromium = select_scenarios(browser='chromium')
        webkit = select_scenarios(browser='webkit')
        all_engines = select_scenarios(browser='both')
        geometry_script = select_scenarios(['browser-candidate-geometry.py'], 'both')
        required_indexes = {index for index, item in enumerate(SUITE) if item['classification'] == 'required'}

        self.assertEqual(len(chromium), 45)
        self.assertEqual(len(webkit), 35)
        self.assertEqual(set(chromium).intersection(webkit), set())
        self.assertEqual(set(chromium).union(webkit), set(all_engines))
        self.assertEqual(set(all_engines), required_indexes)
        self.assertEqual(default, all_engines)
        self.assertEqual(
            {SUITE[index]['id'] for index in geometry_script},
            {'browser-candidate-geometry-chromium', 'browser-candidate-geometry-webkit'},
        )
        self.assertFalse(any('HEIBON_CANDIDATE_BASELINE' in SUITE[index]['env'] for index in geometry_script))
        dialog_layout = next(item for item in SUITE if item['script'] == 'tests/browser-online-dialog-layout.py')
        self.assertEqual({item['browser'] for item in SUITE if item['script'] == dialog_layout['script']}, {'chromium', 'webkit'})
        dialog_scroll = next(item for item in SUITE if item['script'] == 'tests/browser-dialog-scroll.py')
        self.assertEqual({item['browser'] for item in SUITE if item['script'] == dialog_scroll['script']}, {'chromium', 'webkit'})

    def test_required_groups_are_disjoint_complete_and_match_manifest_assignments(self):
        groups = {
            (browser, group): select_scenarios(browser=browser, group=group)
            for browser in ('chromium', 'webkit') for group in (1, 2)
        }
        self.assertEqual([len(groups[('chromium', 1)]), len(groups[('chromium', 2)])], [15, 30])
        self.assertEqual([len(groups[('webkit', 1)]), len(groups[('webkit', 2)])], [9, 26])
        for browser in ('chromium', 'webkit'):
            first, second = groups[(browser, 1)], groups[(browser, 2)]
            self.assertFalse(set(first) & set(second))
            self.assertEqual(set(first) | set(second), set(select_scenarios(browser=browser)))
            self.assertEqual(
                {SUITE[index]['id'] for index in first},
                EXPECTED_GROUP_ONE_IDS[browser],
            )
            self.assertTrue(all(SUITE[index]['classification'] == 'required' for index in first + second))
            self.assertTrue(all(SUITE[index]['group'] == 2 for index in second))
            self.assertEqual(
                [SUITE[index]['id'] for index in first if SUITE[index]['script'] == 'tests/browser-candidate-geometry.py'],
                [f'browser-candidate-geometry-{browser}'],
            )
            self.assertIn(f'browser-round-end-ui-{browser}', {SUITE[index]['id'] for index in second})
            self.assertFalse(any('HEIBON_CANDIDATE_BASELINE' in SUITE[index]['env'] for index in first + second))

    def test_baseline_can_only_be_selected_by_explicit_manifest_ids(self):
        baseline = [item for item in SUITE if item['classification'] == 'manual']
        for item in baseline:
            selected = select_scenarios(browser=item['browser'], scenario_ids=[item['id']])
            self.assertEqual([SUITE[index]['id'] for index in selected], [item['id']])

        chromium_baseline = next(item for item in baseline if item['browser'] == 'chromium')
        with self.assertRaisesRegex(ValueError, 'do not match the requested browser'):
            select_scenarios(browser='webkit', scenario_ids=[chromium_baseline['id']])

        both_ids = [item['id'] for item in baseline]
        selected = select_scenarios(browser='both', scenario_ids=both_ids)
        self.assertEqual({SUITE[index]['id'] for index in selected}, set(both_ids))

        workflow = WORKFLOW.read_text(encoding='utf-8')
        self.assertIn('elif [[ "$HEIBON_TARGETED_CANDIDATE_GEOMETRY" == "true" ]]; then', workflow)
        self.assertIn('--script browser-candidate-geometry.py', workflow)

    def test_exact_scenario_id_selection_is_unique_and_browser_scoped(self):
        chosen = SUITE[0]['id']
        self.assertEqual(select_scenarios(browser=SUITE[0]['browser'], scenario_ids=[chosen]), [0])
        other_browser = 'webkit' if SUITE[0]['browser'] == 'chromium' else 'chromium'
        with self.assertRaisesRegex(ValueError, 'do not match the requested browser'):
            select_scenarios(browser=other_browser, scenario_ids=[chosen])
        with self.assertRaisesRegex(ValueError, 'unknown scenario ID'):
            select_scenarios(scenario_ids=['not-in-the-manifest'])
        with self.assertRaisesRegex(ValueError, 'empty entries'):
            parse_scenario_ids('known-id,')
        with self.assertRaisesRegex(ValueError, 'duplicates'):
            parse_scenario_ids('known-id, known-id')

    def test_mixed_browser_ids_are_validated_before_filtering_the_matrix_job(self):
        chromium = 'browser-candidate-geometry-chromium'
        webkit = 'browser-candidate-geometry-webkit'
        with self.assertRaisesRegex(ValueError, 'do not match the requested browser'):
            select_scenarios(browser='chromium', scenario_ids=[chromium, webkit])
        selected = select_scenarios(browser='both', scenario_ids=[chromium, webkit], matrix_browser='webkit')
        self.assertEqual([SUITE[index]['id'] for index in selected], [webkit])
        with self.assertRaisesRegex(ValueError, 'zero manifest entries'):
            select_scenarios(browser='both', scenario_ids=[chromium], matrix_browser='webkit')
        with self.assertRaisesRegex(ValueError, 'invalid scenario ID format'):
            parse_scenario_ids('tests/browser-candidate-geometry.py')

    def test_workflow_artifact_names_include_browser_and_group(self):
        workflow = WORKFLOW.read_text(encoding='utf-8')
        self.assertIn('max-parallel: 4', workflow)
        for artifact in ('browser-ui', 'candidate-frame', 'center-round-display', 'river-spacing-diagnostics'):
            self.assertRegex(
                workflow,
                rf'name: {artifact}-\$\{{\{{ matrix\.browser \}}\}}-group-\$\{{\{{ matrix\.group \}}\}}-',
            )
        self.assertIn('/tmp/heibon-browser-ui-${{ matrix.browser }}-group-${{ matrix.group }}-timings.csv', workflow)
        self.assertIn("options: [chromium, webkit, both]", workflow)
        self.assertIn('diagnostic_scenarios:', workflow)

    def test_geometry_baseline_screenshots_do_not_overwrite_current_artifacts(self):
        tree = ast.parse(GEOMETRY.read_text(encoding='utf-8'))
        filename_function = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == 'screenshot_filename'
        )
        namespace = {}
        exec(
            compile(ast.Module(body=[filename_function], type_ignores=[]), str(GEOMETRY), 'exec'),
            namespace,
        )
        filename = namespace['screenshot_filename']

        current = filename('chromium', 320, 568, 'online', 'chi', 'before', 'current')
        baseline = filename('chromium', 320, 568, 'online', 'chi', 'before', 'baseline')

        self.assertEqual(current, 'chromium-320x568-online-chi-before.png')
        self.assertEqual(baseline, 'chromium-320x568-online-chi-before-baseline.png')
        self.assertNotEqual(current, baseline)
        self.assertTrue(fnmatch.fnmatch(baseline, '*-320x568-*-chi-*.png'))

    def test_engine_runs_write_only_the_selected_engine_to_csv(self):
        class SuccessfulProcess:
            returncode = 0

            def communicate(self):
                return ('scenario passed\n', None)

            def poll(self):
                return None

        for engine, group, expected_count in [
            ('chromium', 1, 15), ('chromium', 2, 30),
            ('webkit', 1, 9), ('webkit', 2, 26),
        ]:
            with self.subTest(engine=engine, group=group), tempfile.TemporaryDirectory() as directory:
                report = Path(directory) / 'timings.csv'
                argv = [str(RUNNER), '--browser', engine, '--group', str(group), '--timings-file', str(report)]
                with (
                    patch.object(RUNNER_MODULE['sys'], 'argv', argv),
                    patch.object(RUNNER_MODULE['signal'], 'signal'),
                    patch.object(RUNNER_MODULE['subprocess'], 'Popen', return_value=SuccessfulProcess()),
                    redirect_stdout(io.StringIO()),
                ):
                    self.assertEqual(RUNNER_MODULE['main'](), 0)

                with report.open(newline='', encoding='utf-8') as timings:
                    rows = list(csv.DictReader(timings))
                self.assertEqual(len(rows), expected_count)
                self.assertEqual({row['browser'] for row in rows}, {engine})
                self.assertEqual({row['status'] for row in rows}, {'success'})

    def test_script_selection_remains_compatible_with_engine_filter(self):
        script = 'browser-app-idle.py'
        both = select_scenarios([script], 'both')
        webkit = select_scenarios([script], 'webkit')

        self.assertEqual(len(both), 2)
        self.assertEqual(len(webkit), 1)
        self.assertEqual(SUITE[webkit[0]]['browser'], 'webkit')
        self.assertEqual(SUITE[webkit[0]]['script'], f'tests/{script}')

    def test_responsive_table_layout_runs_in_both_engines(self):
        both = select_scenarios(['browser-mobile-table-layout.py'], 'both')
        self.assertEqual(len(both), 2)
        self.assertEqual({SUITE[index]['browser'] for index in both}, {'chromium', 'webkit'})

    def test_pc_table_layout_runs_in_both_engines(self):
        both = select_scenarios(['browser-pc-table-layout.py'], 'both')
        self.assertEqual(len(both), 2)
        self.assertEqual({SUITE[index]['browser'] for index in both}, {'chromium', 'webkit'})

    def test_call_decision_dialog_runs_in_both_engines(self):
        both = select_scenarios(['browser-call-decision-dialog.py'], 'both')
        self.assertEqual(len(both), 2)
        self.assertEqual({SUITE[index]['browser'] for index in both}, {'chromium', 'webkit'})

    def test_call_test_page_runs_in_both_engines(self):
        both = select_scenarios(['browser-call-test.py'], 'both')
        self.assertEqual(len(both), 2)
        self.assertEqual({SUITE[index]['browser'] for index in both}, {'chromium', 'webkit'})

    def test_unknown_script_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unknown script'):
            select_scenarios(['missing-browser-test.py'])

    def test_invalid_engine_is_rejected_by_cli(self):
        result = subprocess.run(
            [sys.executable, str(RUNNER), '--browser', 'firefox'],
            capture_output=True, text=True, check=False,
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn('invalid choice', result.stderr)

    def test_empty_unknown_and_zero_match_id_inputs_fail_before_execution(self):
        for browser, scenario_ids, expected in [
            ('chromium', '', 'empty entries'),
            ('chromium', 'unknown-id', 'unknown scenario ID'),
            ('webkit', SUITE[0]['id'], 'do not match the requested browser'),
        ]:
            result = subprocess.run(
                [sys.executable, str(RUNNER), '--browser', browser, '--scenario-ids', scenario_ids, '--list-only'],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn(expected, result.stderr)

    def test_list_only_reports_exact_manifest_ids_without_starting_browser_scripts(self):
        expected = [SUITE[index]['id'] for index in select_scenarios(browser='chromium', scenario_ids=[SUITE[0]['id']])]
        result = subprocess.run(
            [sys.executable, str(RUNNER), '--browser', 'chromium', '--scenario-ids', ','.join(expected), '--list-only'],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), expected)

    def test_cli_normal_full_suite_and_script_selection_omit_baseline(self):
        full = subprocess.run(
            [sys.executable, str(RUNNER), '--list-only'],
            capture_output=True, text=True, check=False,
        )
        geometry = subprocess.run(
            [sys.executable, str(RUNNER), '--browser', 'both', '--script', 'browser-candidate-geometry.py', '--list-only'],
            capture_output=True, text=True, check=False,
        )

        self.assertEqual(full.returncode, 0, full.stderr)
        self.assertEqual(len(full.stdout.splitlines()), 80)
        self.assertNotIn('candidate-baseline', full.stdout)
        self.assertEqual(geometry.returncode, 0, geometry.stderr)
        self.assertEqual(
            set(geometry.stdout.splitlines()),
            {'browser-candidate-geometry-chromium', 'browser-candidate-geometry-webkit'},
        )

    def test_cli_selects_both_manual_baselines_only_by_explicit_id(self):
        baseline_ids = [item['id'] for item in SUITE if item['classification'] == 'manual']
        result = subprocess.run(
            [
                sys.executable, str(RUNNER), '--browser', 'both',
                '--scenario-ids', ','.join(baseline_ids), '--list-only',
            ],
            capture_output=True, text=True, check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(set(result.stdout.splitlines()), set(baseline_ids))


if __name__ == '__main__':
    unittest.main()
