#!/usr/bin/env python3
"""Unit checks for engine and script selection in the Browser UI runner."""

import runpy
import csv
from contextlib import redirect_stdout
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / 'tests' / 'run-browser-regressions.py'
WORKFLOW = ROOT / '.github' / 'workflows' / 'browser-ui.yml'
RUNNER_MODULE = runpy.run_path(str(RUNNER))
SUITE = RUNNER_MODULE['SUITE']
select_scenarios = RUNNER_MODULE['select_scenarios']
parse_scenario_ids = RUNNER_MODULE['parse_scenario_ids']


class BrowserRegressionSelectionTests(unittest.TestCase):
    def test_engine_selection_covers_all_manifest_entries(self):
        default = select_scenarios()
        chromium = select_scenarios(browser='chromium')
        webkit = select_scenarios(browser='webkit')
        all_engines = select_scenarios(browser='both')

        self.assertEqual(len(SUITE), 82)
        self.assertEqual(len({item['id'] for item in SUITE}), len(SUITE))
        self.assertEqual(len(chromium), 46)
        self.assertEqual(len(webkit), 36)
        self.assertEqual(set(chromium).intersection(webkit), set())
        self.assertEqual(set(chromium).union(webkit), set(all_engines))
        self.assertEqual(all_engines, list(range(len(SUITE))))
        self.assertEqual(default, all_engines)
        dialog_layout = next(item for item in SUITE if item['script'] == 'tests/browser-online-dialog-layout.py')
        self.assertEqual({item['browser'] for item in SUITE if item['script'] == dialog_layout['script']}, {'chromium', 'webkit'})
        dialog_scroll = next(item for item in SUITE if item['script'] == 'tests/browser-dialog-scroll.py')
        self.assertEqual({item['browser'] for item in SUITE if item['script'] == dialog_scroll['script']}, {'chromium', 'webkit'})

    def test_full_suite_groups_keep_geometry_current_alone(self):
        groups = {
            (browser, group): select_scenarios(browser=browser, group=group)
            for browser in ('chromium', 'webkit') for group in (1, 2)
        }
        self.assertEqual([len(groups[('chromium', 1)]), len(groups[('chromium', 2)])], [1, 45])
        self.assertEqual([len(groups[('webkit', 1)]), len(groups[('webkit', 2)])], [1, 35])
        for browser in ('chromium', 'webkit'):
            first, second = groups[(browser, 1)], groups[(browser, 2)]
            self.assertFalse(set(first) & set(second))
            self.assertEqual(set(first) | set(second), set(select_scenarios(browser=browser)))
            current = [SUITE[index] for index in first]
            self.assertEqual([item['script'] for item in current], ['tests/browser-candidate-geometry.py'])
            self.assertNotIn('HEIBON_CANDIDATE_BASELINE', current[0]['env'])
            baseline = [SUITE[index] for index in second if SUITE[index]['env'].get('HEIBON_CANDIDATE_BASELINE')]
            self.assertEqual(len(baseline), 1)
            self.assertEqual(baseline[0]['script'], 'tests/browser-candidate-geometry.py')

    def test_exact_scenario_id_selection_is_unique_and_browser_scoped(self):
        chosen = SUITE[0]['id']
        self.assertEqual(select_scenarios(browser=SUITE[0]['browser'], scenario_ids=[chosen]), [0])
        other_browser = 'webkit' if SUITE[0]['browser'] == 'chromium' else 'chromium'
        with self.assertRaisesRegex(ValueError, 'zero manifest entries'):
            select_scenarios(browser=other_browser, scenario_ids=[chosen])
        with self.assertRaisesRegex(ValueError, 'unknown scenario ID'):
            select_scenarios(scenario_ids=['not-in-the-manifest'])
        with self.assertRaisesRegex(ValueError, 'empty entries'):
            parse_scenario_ids('known-id,')
        with self.assertRaisesRegex(ValueError, 'duplicates'):
            parse_scenario_ids('known-id, known-id')

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

    def test_engine_runs_write_only_the_selected_engine_to_csv(self):
        class SuccessfulProcess:
            returncode = 0

            def communicate(self):
                return ('scenario passed\n', None)

            def poll(self):
                return None

        for engine, expected_count in [('chromium', 45), ('webkit', 35)]:
            with self.subTest(engine=engine), tempfile.TemporaryDirectory() as directory:
                report = Path(directory) / 'timings.csv'
                argv = [str(RUNNER), '--browser', engine, '--group', '2', '--timings-file', str(report)]
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
            ('webkit', SUITE[0]['id'], 'zero manifest entries'),
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


if __name__ == '__main__':
    unittest.main()
