"""Run historical browser suites with isolated Step 13.5.4 evidence paths.

Start a fresh Vite server on 4173 before running this script. Set
HEIBON_CHROMIUM to a Chromium/Chrome executable if not installed by Playwright.
Optional arguments select suite names; no arguments run all suites.
"""
import os
import pathlib
import shutil
import subprocess
import sys

OUT = pathlib.Path('docs/verification/step13.5.4')
SUITES = [
    'browser-step13-5-3', 'browser-step13-5-2', 'browser-step13-5',
    'browser-step13-4', 'browser-step13-3', 'browser-step13-3-1',
    'browser-step13-3-regression', 'browser-action-controls',
    'browser-call-viewport', 'browser-kan-page', 'browser-check',
    'browser-tsumo-fixture', 'browser-cpu-riichi', 'browser-cpu-tsumo',
    'browser-match', 'browser-riichi', 'browser-ron', 'browser-scoring',
    'browser-shanten', 'dora-layout-check',
]


def run_child(name):
    os.environ['HEIBON_SCREENSHOTS'] = str(OUT / 'screenshots')
    original_which = shutil.which
    shutil.which = lambda command, *args, **kwargs: (
        os.environ['HEIBON_CHROMIUM']
        if command == 'chromium' and os.environ.get('HEIBON_CHROMIUM')
        else original_which(command, *args, **kwargs)
    )
    script = 'browser-check' if name == 'browser-tsumo-fixture' else name
    path = pathlib.Path('tests', script + '.py')
    sys.argv = [str(path)]
    if script == 'browser-check':
        sys.argv += ['--screenshots', str(OUT / 'screenshots/browser-check')]
    if name == 'browser-tsumo-fixture':
        sys.argv += ['--only-tsumo-fixture']
    # Only relocate evidence; keep the historical test assertions intact.
    source = path.read_text(encoding='utf-8')
    source = source.replace('docs/verification/step13.5.3', str(OUT / 'previous-suite').replace('\\', '/'))
    source = source.replace('docs/screenshots/', str(OUT / 'screenshots').replace('\\', '/') + '/')
    exec(compile(source, str(path), 'exec'), {'__name__': '__main__', '__file__': str(path.resolve())})


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--child':
        if sys.argv[2] not in SUITES:
            raise ValueError(sys.argv[2])
        run_child(sys.argv[2])
    else:
        names = sys.argv[1:] or SUITES
        if any(name not in SUITES for name in names):
            raise ValueError(names)
        OUT.mkdir(parents=True, exist_ok=True)
        failures = []
        for name in names:
            with (OUT / (name + '.log')).open('w', encoding='utf-8') as log:
                result = subprocess.run([sys.executable, __file__, '--child', name], stdout=log, stderr=subprocess.STDOUT)
            print(f'{name}: {result.returncode}', flush=True)
            if result.returncode:
                failures.append(name)
        if failures:
            raise SystemExit('Failed: ' + ', '.join(failures))
