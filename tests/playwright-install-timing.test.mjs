import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('timed Playwright install records a failure and preserves its exit code', () => {
  const pythonTest = String.raw`
import contextlib
import importlib.util
import io
import json
import sys
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location(
    "timed_playwright_install", ".github/scripts/timed-playwright-install.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.subprocess.run = lambda *args, **kwargs: SimpleNamespace(returncode=23)
sys.argv = ["timed-playwright-install.py", "install-deps", "webkit"]
output = io.StringIO()
with contextlib.redirect_stdout(output):
    assert module.main() == 23
print(output.getvalue().strip())
`;
  const result = spawnSync('python3', ['-c', pythonTest], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const timingLine = result.stdout.trim();
  assert.match(timingLine, /^\[playwright-install-timing\] /);
  const timing = JSON.parse(timingLine.replace(/^\[playwright-install-timing\] /, ''));
  assert.deepEqual(
    { process: timing.process, browser: timing.browser, status: timing.status },
    { process: 'OS dependency installation', browser: 'webkit', status: 'failure' },
  );
  assert.match(timing.start_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(timing.end_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(typeof timing.elapsed_seconds, 'number');
});
