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
RUNNER_MODULE = runpy.run_path(str(RUNNER))
SUITE = RUNNER_MODULE['SUITE']
select_scenarios = RUNNER_MODULE['select_scenarios']


class BrowserRegressionSelectionTests(unittest.TestCase):
    def test_engine_selection_covers_all_manifest_entries(self):
        default = select_scenarios()
        chromium = select_scenarios(browser='chromium')
        webkit = select_scenarios(browser='webkit')
        all_engines = select_scenarios(browser='both')

        self.assertEqual(len(SUITE), 56)
        self.assertEqual(len(chromium), 34)
        self.assertEqual(len(webkit), 22)
        self.assertEqual(set(chromium).intersection(webkit), set())
        self.assertEqual(set(chromium).union(webkit), set(all_engines))
        self.assertEqual(all_engines, list(range(len(SUITE))))
        self.assertEqual(default, all_engines)
        dialog_layout = next(item for item in SUITE if item['script'] == 'tests/browser-online-dialog-layout.py')
        self.assertEqual(dialog_layout['browser'], 'webkit')

    def test_engine_runs_write_only_the_selected_engine_to_csv(self):
        class SuccessfulProcess:
            returncode = 0

            def communicate(self):
                return ('scenario passed\n', None)

            def poll(self):
                return None

        for engine, expected_count in [('chromium', 34), ('webkit', 22)]:
            with self.subTest(engine=engine), tempfile.TemporaryDirectory() as directory:
                report = Path(directory) / 'timings.csv'
                argv = [str(RUNNER), '--browser', engine, '--timings-file', str(report)]
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


if __name__ == '__main__':
    unittest.main()
