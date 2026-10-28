#!/usr/bin/env python3
"""Run the Browser UI manifest with per-invocation timing and a CSV report."""

import argparse
import csv
import os
from pathlib import Path
import signal
import subprocess
import sys
from datetime import datetime, timezone


def run(script, browser='chromium', **extra_env):
    env = {'HEIBON_BROWSER': browser, **extra_env}
    return {'script': script, 'browser': browser, 'env': env}


SUITE = [
    run('tests/browser-online-dialog-layout.py', HEIBON_PRODUCTION_URL='http://127.0.0.1:4174/heibon-mahjong/'),
    run('tests/browser-app-idle.py'),
    run('tests/browser-app-idle.py', 'webkit'),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_EXIT_NOTICE_ONLY='1'),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_EXIT_NOTICE_ONLY='1'),
    run('tests/browser-riichi-discard-layout.py'),
    run('tests/browser-action-controls.py'),
    run('tests/browser-action-panel.py'),
    run('tests/browser-table-ui.py'),
    run('tests/browser-riichi-claimed-discard.py'),
    run('tests/browser-riichi-claimed-discard.py', 'webkit'),
    run('tests/browser-river-capacity.py'),
    run('tests/browser-river-capacity.py', 'webkit'),
    run('tests/browser-declaration-bubbles.py'),
    run('tests/browser-declaration-gameplay.py'),
    run('tests/browser-declaration-gameplay.py', 'webkit'),
    run('tests/browser-round-end-ui.py'),
    run('tests/browser-round-end-ui.py', 'webkit'),
    run('tests/browser-result-hand-layout.py'),
    run('tests/browser-result-hand-layout.py', 'webkit'),
    run('tests/browser-dora-rows.py'),
    run('tests/browser-center-round-display.py'),
    run('tests/browser-center-round-display.py', 'webkit'),
    run('tests/browser-dora-rows.py', 'webkit'),
    run('tests/browser-mobile-table-layout.py'),
    run('tests/browser-seat-kan-overlap.py'),
    run('tests/browser-step13-5-5.py'),
    run('tests/browser-step13-5-5-kan.py'),
    run('tests/browser-step13-6.py'),
    run('tests/browser-step13-7.py'),
    run('tests/browser-step13-8.py'),
    run('tests/browser-step13-9.py'),
    run('tests/browser-step13-10.py'),
    run('tests/browser-step13-10.py', 'webkit'),
    run('tests/browser-step13-11.py'),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_RIVER_SPACING_ONLY='1'),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_RIVER_SPACING_ONLY='1'),
    run('tests/browser-online-waiting-room.py'),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_PUBLIC_HAND_ONLY='1'),
    run('tests/browser-test-page.py'),
    run('tests/browser-test-page.py', 'webkit'),
    run('tests/browser-river-test-mode.py'),
    run('tests/browser-river-test-mode.py', 'webkit'),
    run('tests/browser-diagnostics.py'),
    run('tests/browser-diagnostics.py', 'webkit'),
]


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def save_report(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as report:
        writer = csv.DictWriter(report, fieldnames=[
            'script', 'browser', 'start_utc', 'end_utc', 'duration_seconds', 'status', 'timed_out',
        ])
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--script', action='append', help='Run a named script from the full-suite manifest; repeat to select more scripts.')
    parser.add_argument('--browser', choices=['chromium', 'webkit', 'both'], help='Select a supported engine for --script. Defaults to every manifest variant.')
    parser.add_argument('--timings-file', type=Path, default=Path(os.environ.get('HEIBON_BROWSER_TIMINGS', '/tmp/heibon-browser-ui-timings.csv')))
    args = parser.parse_args()

    if args.browser and not args.script:
        parser.error('--browser requires at least one --script')

    selected = list(range(len(SUITE)))
    if args.script:
        names = {Path(name).name for name in args.script}
        known = {Path(item['script']).name for item in SUITE}
        unknown = names - known
        if unknown:
            parser.error(f"unknown script(s): {', '.join(sorted(unknown))}")
        selected = [i for i, item in enumerate(SUITE) if Path(item['script']).name in names]
        if args.browser:
            engines = {'chromium', 'webkit'} if args.browser == 'both' else {args.browser}
            selected = [i for i in selected if SUITE[i]['browser'] in engines]
            found = {SUITE[i]['browser'] for i in selected}
            missing = engines - found
            if missing:
                parser.error(f"selected script has no manifest entry for: {', '.join(sorted(missing))}")

    selected_set = set(selected)
    rows = [
        {
            'script': item['script'], 'browser': item['browser'], 'start_utc': '', 'end_utc': '',
            'duration_seconds': '', 'status': 'skipped', 'timed_out': 'no',
        }
        for item in SUITE
    ]
    save_report(args.timings_file, rows)
    cancelled = False
    current_process = None

    def stop(signum, _frame):
        nonlocal cancelled
        cancelled = True
        if current_process is not None and current_process.poll() is None:
            current_process.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    failed = False
    for index in selected:
        item = SUITE[index]
        start = timestamp()
        start_clock = datetime.now(timezone.utc)
        env = os.environ.copy()
        env.update(item['env'])
        print(f"::group::Browser UI {item['browser']} {item['script']}", flush=True)
        print(f"::notice title=Browser UI started::browser={item['browser']} script={item['script']} start={start}", flush=True)
        try:
            current_process = subprocess.Popen(
                [sys.executable, item['script']], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding='utf-8', errors='replace', env=env,
            )
            output, _ = current_process.communicate()
            if output:
                print(output, end='' if output.endswith('\n') else '\n', flush=True)
            status_code = current_process.returncode
            if cancelled:
                status, timed_out = 'cancelled', 'no'
            elif status_code == 0:
                status, timed_out = 'success', 'no'
            elif status_code in (124, 137, -9) or 'TimeoutError' in output or 'Timeout ' in output:
                status, timed_out = 'timeout', 'yes'
            else:
                status, timed_out = 'failure', 'no'
        except OSError as error:
            print(f'Browser UI process failed to start: {error}', file=sys.stderr, flush=True)
            status_code = 1
            status, timed_out = 'failure', 'no'
        end = timestamp()
        elapsed = (datetime.now(timezone.utc) - start_clock).total_seconds()
        rows[index].update({
            'start_utc': start, 'end_utc': end, 'duration_seconds': f'{elapsed:.3f}',
            'status': status, 'timed_out': timed_out,
        })
        current_process = None
        save_report(args.timings_file, rows)
        print(
            f"::notice title=Browser UI timing::{status} browser={item['browser']} script={item['script']} "
            f"start={start} end={end} duration_seconds={elapsed:.3f} timed_out={timed_out}",
            flush=True,
        )
        print('::endgroup::', flush=True)
        if status != 'success':
            failed = True
            break

    print(f'Browser UI timing report: {args.timings_file}', flush=True)
    if cancelled:
        return 130
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
