import unittest
from unittest.mock import Mock

from browser_result_reopen_diagnostics import ResultReopenTrace, save_report


class ResultReopenDiagnosticsTests(unittest.TestCase):
    def test_failed_diagnostic_write_and_cleanup_preserve_original_assertion(self):
        page = Mock()
        path = Mock()
        path.write_text.side_effect = OSError('unavailable')
        original = AssertionError('result dialog did not reopen')
        with self.assertRaises(AssertionError) as raised:
            with ResultReopenTrace(page, True):
                page.evaluate.side_effect = RuntimeError('page closed')
                try:
                    raise original
                finally:
                    save_report(path, {'buttonClicks': 0})
        self.assertIs(raised.exception, original)
        self.assertEqual(page.evaluate.call_count, 2)
        path.write_text.assert_called_once()

    def test_disabled_observer_does_not_run_browser_commands(self):
        page = Mock()
        with ResultReopenTrace(page, False) as trace:
            trace.mark('before')
        page.evaluate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
