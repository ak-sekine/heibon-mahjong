"""Regression for a CPU ending the first round before the human can discard."""
from pathlib import Path
import runpy
import unittest

wait_for_human_action = runpy.run_path(str(Path(__file__).with_name('browser-itch-package.py')))['wait_for_human_action']


class StartupPage:
    def __init__(self, dialog_open):
        self.dialog_open = dialog_open
        self.advanced = False
        self.actions = []

    def locator(self, selector):
        page = self

        class Control:
            def count(self):
                return int(page.advanced)

            def is_visible(self):
                return selector == '#next-round'

            def is_enabled(self):
                return selector == '#next-round'

            def evaluate(self, expression):
                return page.dialog_open

            def click(self):
                page.actions.append(selector)
                if selector == '#view-table':
                    page.dialog_open = False
                elif selector == '#next-round':
                    page.advanced = True
                else:
                    raise AssertionError(selector)

        return Control()

    def wait_for_timeout(self, milliseconds):
        raise AssertionError('stalled at a completed round')


class ItchStartupTests(unittest.TestCase):
    def test_first_turn_abort_advances_with_result_closed_or_open(self):
        for opened in (False, True):
            with self.subTest(result_dialog_open=opened):
                page = StartupPage(opened)
                decisions = wait_for_human_action(page)
                self.assertEqual(decisions['rounds_advanced'], 1)
                self.assertEqual(page.actions, (['#view-table'] if opened else []) + ['#next-round'])


if __name__ == '__main__':
    unittest.main()
