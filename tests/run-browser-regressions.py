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


def run(script, browser='chromium', *, group, **extra_env):
    env = {'HEIBON_BROWSER': browser, **extra_env}
    return {'script': script, 'browser': browser, 'env': env, 'group': group}


SUITE = [
    run('tests/browser-create-dialog-layout.py', group=1),
    run('tests/browser-create-dialog-layout.py', 'webkit', group=2),
    run('tests/browser-dialog-scroll.py', group=1),
    run('tests/browser-dialog-scroll.py', 'webkit', group=1),
    run('tests/browser-online-dialog-layout.py', HEIBON_PRODUCTION_URL='http://127.0.0.1:4174/heibon-mahjong/', group=1),
    run('tests/browser-online-dialog-layout.py', 'webkit', HEIBON_PRODUCTION_URL='http://127.0.0.1:4174/heibon-mahjong/', group=1),
    run('tests/browser-pwa.py', group=1),
    run('tests/browser-pwa.py', 'webkit', group=2),
    run('tests/browser-keyboard-help.py', group=1),
    run('tests/browser-keyboard-help.py', 'webkit', group=1),
    run('tests/browser-app-idle.py', group=1),
    run('tests/browser-app-idle.py', 'webkit', group=2),
    run('tests/browser-offline-rules.py', group=1),
    run('tests/browser-offline-rules.py', 'webkit', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_NEXT_ROUND_ONLY='1', group=1),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_NEXT_ROUND_ONLY='1', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_RESULT_BUTTON_FONTS_ONLY='1', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_RESULT_BUTTON_FONTS_ONLY='1', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_REMATCH_MULTI_CLIENT_ONLY='1', group=1),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_REMATCH_MULTI_CLIENT_ONLY='1', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_EXIT_NOTICE_ONLY='1', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_EXIT_NOTICE_ONLY='1', group=1),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_RULES_ONLY='1', group=1),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_ACTION_SYNC_ONLY='1', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_ACTION_SYNC_ONLY='1', group=2),
    run('tests/browser-riichi-discard-layout.py', group=1),
    run('tests/browser-action-controls.py', group=1),
    run('tests/browser-action-panel.py', group=2),
    run('tests/browser-action-panel.py', 'webkit', group=2),
    run('tests/browser-call-decision-dialog.py', group=1),
    run('tests/browser-call-decision-dialog.py', 'webkit', group=2),
    run('tests/browser-call-test.py', group=2),
    run('tests/browser-call-test.py', 'webkit', group=1),
    run('tests/browser-table-ui.py', group=1),
    run('tests/browser-random-seating.py', group=2),
    run('tests/browser-random-seating.py', 'webkit', group=2),
    run('tests/browser-riichi-claimed-discard.py', group=2),
    run('tests/browser-riichi-claimed-discard.py', 'webkit', group=1),
    run('tests/browser-river-capacity.py', group=1),
    run('tests/browser-river-capacity.py', 'webkit', group=1),
    run('tests/browser-declaration-bubbles.py', group=2),
    run('tests/browser-declaration-gameplay.py', group=2),
    run('tests/browser-declaration-gameplay.py', 'webkit', group=2),
    run('tests/browser-round-end-ui.py', group=2),
    run('tests/browser-round-end-ui.py', 'webkit', group=2),
    run('tests/browser-result-hand-layout.py', group=2),
    run('tests/browser-result-hand-layout.py', 'webkit', group=2),
    run('tests/browser-dora-rows.py', group=2),
    run('tests/browser-center-round-display.py', group=2),
    run('tests/browser-center-round-display.py', 'webkit', group=2),
    run('tests/browser-dora-rows.py', 'webkit', group=2),
    run('tests/browser-mobile-table-layout.py', group=2),
    run('tests/browser-mobile-table-layout.py', 'webkit', group=2),
    run('tests/browser-pc-table-layout.py', group=2),
    run('tests/browser-pc-table-layout.py', 'webkit', group=2),
    run('tests/browser-seat-kan-overlap.py', group=2),
    run('tests/browser-step13-5-5.py', group=2),
    run('tests/browser-step13-5-5-kan.py', group=2),
    run('tests/browser-step13-6.py', group=2),
    run('tests/browser-step13-7.py', group=2),
    run('tests/browser-step13-8.py', group=2),
    run('tests/browser-step13-8.py', 'webkit', group=2),
    run('tests/browser-step13-9.py', group=2),
    run('tests/browser-step13-10.py', group=2),
    run('tests/browser-step13-10.py', 'webkit', group=2),
    run('tests/browser-step13-11.py', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_RIVER_SPACING_ONLY='1', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_RIVER_SPACING_ONLY='1', group=2),
    run('tests/browser-online-waiting-room.py', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_PUBLIC_HAND_ONLY='1', group=2),
    run('tests/browser-test-page.py', group=2),
    run('tests/browser-test-page.py', 'webkit', group=2),
    run('tests/browser-river-test-mode.py', group=2),
    run('tests/browser-river-test-mode.py', 'webkit', group=2),
    run('tests/browser-diagnostics.py', group=2),
    run('tests/browser-diagnostics.py', 'webkit', group=2),
    run('tests/browser-button-roles.py', group=2),
    run('tests/browser-button-roles.py', 'webkit', group=2),
    # Run existing regressions before the larger before/after measurement matrix.
    run('tests/browser-candidate-geometry.py', HEIBON_CANDIDATE_BASELINE='1', group=2),
    run('tests/browser-candidate-geometry.py', 'webkit', HEIBON_CANDIDATE_BASELINE='1', group=2),
    run('tests/browser-candidate-geometry.py', group=1),
    run('tests/browser-candidate-geometry.py', 'webkit', group=1),
]


def select_scenarios(script_names=None, browser=None, group=None):
    """Return manifest indexes selected by script name, engine, and group."""
    selected = list(range(len(SUITE)))
    if script_names:
        names = {Path(name).name for name in script_names}
        known = {Path(item['script']).name for item in SUITE}
        unknown = names - known
        if unknown:
            raise ValueError(f"unknown script(s): {', '.join(sorted(unknown))}")
        selected = [i for i, item in enumerate(SUITE) if Path(item['script']).name in names]

    if browser:
        engines = {'chromium', 'webkit'} if browser == 'both' else {browser}
        selected = [i for i in selected if SUITE[i]['browser'] in engines]
        if script_names:
            found = {SUITE[i]['browser'] for i in selected}
            missing = engines - found
            if missing:
                raise ValueError(f"selected script has no manifest entry for: {', '.join(sorted(missing))}")
    if group is not None:
        selected = [i for i in selected if SUITE[i]['group'] == group]
        if not selected:
            raise ValueError('selected group has no matching scenarios')
    return selected


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
    parser.add_argument('--browser', choices=['chromium', 'webkit', 'both'], help='Select all scenarios for one engine, or filter --script; defaults to every manifest variant.')
    parser.add_argument('--group', type=int, choices=[1, 2], help='Select one of the two Browser UI groups.')
    parser.add_argument('--timings-file', type=Path, default=Path(os.environ.get('HEIBON_BROWSER_TIMINGS', '/tmp/heibon-browser-ui-timings.csv')))
    args = parser.parse_args()

    try:
        selected = select_scenarios(args.script, args.browser, args.group)
    except ValueError as error:
        parser.error(str(error))

    report_indexes = selected if args.group or (args.browser and not args.script) else range(len(SUITE))
    report_rows = {}
    rows = [
        {
            'script': item['script'], 'browser': item['browser'], 'start_utc': '', 'end_utc': '',
            'duration_seconds': '', 'status': 'skipped', 'timed_out': 'no',
        }
        for index, item in enumerate(SUITE) if index in report_indexes
    ]
    report_rows.update((index, row) for index, row in zip(report_indexes, rows))
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
        report_rows[index].update({
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
