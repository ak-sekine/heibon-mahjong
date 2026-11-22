"""Best-effort collection for the WebKit result-reopen regression."""
import json
from pathlib import Path

TRACE = Path(__file__).with_name('browser_result_reopen_trace.js')


def observe(operation, *args, **kwargs):
    try:
        return operation(*args, **kwargs)
    except Exception as error:
        # Exception messages may contain page data. Keep the original test failure.
        print(f'Result reopen diagnostic unavailable: {type(error).__name__}', flush=True)
        return None


def save_report(path, report):
    observe(lambda: path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'))


class ResultReopenTrace:
    def __init__(self, page, enabled):
        self.page = page
        self.enabled = enabled

    def __enter__(self):
        if self.enabled:
            observe(lambda: self.page.evaluate(TRACE.read_text(encoding='utf-8')))
        return self

    def mark(self, name):
        if self.enabled:
            observe(self.page.evaluate, 'name => window.resultReopenTrace?.mark(name)', name)

    def finish(self):
        if self.enabled:
            return observe(self.page.evaluate, '() => window.resultReopenTrace?.finish()')
        return None

    def __exit__(self, *_):
        self.finish()
