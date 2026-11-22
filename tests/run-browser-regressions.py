#!/usr/bin/env python3
"""Run the Browser UI manifest with per-invocation timing and a CSV report."""

import argparse
import csv
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
from datetime import datetime, timezone


def run(script, browser='chromium', *, classification=None, group=None, **extra_env):
    env = {'HEIBON_BROWSER': browser, **extra_env}
    parts = [Path(script).stem, browser]
    for key, value in sorted(extra_env.items()):
        key = re.sub(r'^HEIBON_', '', key).lower().replace('_', '-')
        value = re.sub(r'[^a-zA-Z0-9]+', '-', str(value)).strip('-').lower()
        parts.append(f'{key}-{value}')
    scenario_id = '-'.join(parts)
    return {
        'id': scenario_id,
        'script': script,
        'browser': browser,
        'env': env,
        'classification': classification,
        'group': group,
    }


SUITE = [
    run('tests/browser-create-dialog-layout.py', classification='required', group=1),
    run('tests/browser-create-dialog-layout.py', 'webkit', classification='required', group=2),
    run('tests/browser-dialog-scroll.py', classification='required', group=1),
    run('tests/browser-dialog-scroll.py', 'webkit', classification='required', group=1),
    run('tests/browser-online-dialog-layout.py', HEIBON_PRODUCTION_URL='http://127.0.0.1:4174/heibon-mahjong/', classification='required', group=1),
    run('tests/browser-online-dialog-layout.py', 'webkit', HEIBON_PRODUCTION_URL='http://127.0.0.1:4174/heibon-mahjong/', classification='required', group=1),
    run('tests/browser-pwa.py', classification='required', group=1),
    run('tests/browser-pwa.py', 'webkit', classification='required', group=2),
    run('tests/browser-keyboard-help.py', classification='required', group=1),
    run('tests/browser-keyboard-help.py', 'webkit', classification='required', group=1),
    run('tests/browser-app-idle.py', classification='required', group=1),
    run('tests/browser-app-idle.py', 'webkit', classification='required', group=2),
    run('tests/browser-offline-rules.py', classification='required', group=1),
    run('tests/browser-offline-rules.py', 'webkit', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_NEXT_ROUND_ONLY='1', classification='required', group=1),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_NEXT_ROUND_ONLY='1', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_RESULT_BUTTON_FONTS_ONLY='1', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_RESULT_BUTTON_FONTS_ONLY='1', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_REMATCH_MULTI_CLIENT_ONLY='1', classification='required', group=1),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_REMATCH_MULTI_CLIENT_ONLY='1', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_EXIT_NOTICE_ONLY='1', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_EXIT_NOTICE_ONLY='1', classification='required', group=1),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_RULES_ONLY='1', classification='required', group=1),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_ACTION_SYNC_ONLY='1', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_ACTION_SYNC_ONLY='1', classification='required', group=2),
    run('tests/browser-riichi-discard-layout.py', classification='required', group=1),
    run('tests/browser-action-controls.py', classification='required', group=1),
    run('tests/browser-action-panel.py', classification='required', group=2),
    run('tests/browser-action-panel.py', 'webkit', classification='required', group=2),
    run('tests/browser-call-decision-dialog.py', classification='required', group=1),
    run('tests/browser-call-decision-dialog.py', 'webkit', classification='required', group=2),
    run('tests/browser-call-test.py', classification='required', group=2),
    run('tests/browser-call-test.py', 'webkit', classification='required', group=1),
    run('tests/browser-table-ui.py', classification='required', group=1),
    run('tests/browser-random-seating.py', classification='required', group=2),
    run('tests/browser-random-seating.py', 'webkit', classification='required', group=2),
    run('tests/browser-riichi-claimed-discard.py', classification='required', group=2),
    run('tests/browser-riichi-claimed-discard.py', 'webkit', classification='required', group=1),
    run('tests/browser-river-capacity.py', classification='required', group=1),
    run('tests/browser-river-capacity.py', 'webkit', classification='required', group=1),
    run('tests/browser-declaration-bubbles.py', classification='required', group=2),
    run('tests/browser-declaration-gameplay.py', classification='required', group=2),
    run('tests/browser-declaration-gameplay.py', 'webkit', classification='required', group=2),
    run('tests/browser-round-end-ui.py', classification='required', group=2),
    run('tests/browser-round-end-ui.py', 'webkit', classification='required', group=2),
    run('tests/browser-result-hand-layout.py', classification='required', group=2),
    run('tests/browser-result-hand-layout.py', 'webkit', classification='required', group=2),
    run('tests/browser-dora-rows.py', classification='required', group=2),
    run('tests/browser-center-round-display.py', classification='required', group=2),
    run('tests/browser-center-round-display.py', 'webkit', classification='required', group=2),
    run('tests/browser-dora-rows.py', 'webkit', classification='required', group=2),
    run('tests/browser-mobile-table-layout.py', classification='required', group=2),
    run('tests/browser-mobile-table-layout.py', 'webkit', classification='required', group=2),
    run('tests/browser-pc-table-layout.py', classification='required', group=2),
    run('tests/browser-pc-table-layout.py', 'webkit', classification='required', group=2),
    run('tests/browser-seat-kan-overlap.py', classification='required', group=2),
    run('tests/browser-step13-5-5.py', classification='required', group=2),
    run('tests/browser-step13-5-5-kan.py', classification='required', group=2),
    run('tests/browser-step13-6.py', classification='required', group=2),
    run('tests/browser-step13-7.py', classification='required', group=2),
    run('tests/browser-step13-8.py', classification='required', group=2),
    run('tests/browser-step13-8.py', 'webkit', classification='required', group=2),
    run('tests/browser-step13-9.py', classification='required', group=2),
    run('tests/browser-step13-10.py', classification='required', group=2),
    run('tests/browser-step13-10.py', 'webkit', classification='required', group=2),
    run('tests/browser-step13-11.py', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', HEIBON_ONLINE_RIVER_SPACING_ONLY='1', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_RIVER_SPACING_ONLY='1', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', classification='required', group=2),
    run('tests/browser-online-waiting-room.py', 'webkit', HEIBON_ONLINE_PUBLIC_HAND_ONLY='1', classification='required', group=2),
    run('tests/browser-test-page.py', classification='required', group=2),
    run('tests/browser-test-page.py', 'webkit', classification='required', group=2),
    run('tests/browser-river-test-mode.py', classification='required', group=2),
    run('tests/browser-river-test-mode.py', 'webkit', classification='required', group=2),
    run('tests/browser-diagnostics.py', classification='required', group=2),
    run('tests/browser-diagnostics.py', 'webkit', classification='required', group=2),
    run('tests/browser-button-roles.py', classification='required', group=2),
    run('tests/browser-button-roles.py', 'webkit', classification='required', group=2),
    # Geometry baselines are opt-in historical probes, not mandatory UI regressions.
    run('tests/browser-candidate-geometry.py', HEIBON_CANDIDATE_BASELINE='1', classification='manual', group=None),
    run('tests/browser-candidate-geometry.py', 'webkit', HEIBON_CANDIDATE_BASELINE='1', classification='manual', group=None),
    run('tests/browser-candidate-geometry.py', classification='required', group=1),
    run('tests/browser-candidate-geometry.py', 'webkit', classification='required', group=1),
]


def scenario_group(item):
    """Return the assigned full-suite shard, or None for diagnostic-only entries."""
    return item['group'] if item['classification'] == 'required' else None


def parse_scenario_ids(value):
    """Parse comma-separated manifest IDs without silently accepting blanks or duplicates."""
    if value is None:
        return None
    ids = [scenario_id.strip() for scenario_id in value.split(',')]
    if not ids or any(not scenario_id for scenario_id in ids):
        raise ValueError('scenario IDs must be a comma-separated list with no empty entries')
    if any(not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', scenario_id) for scenario_id in ids):
        raise ValueError('invalid scenario ID format')
    if len(ids) != len(set(ids)):
        raise ValueError('scenario IDs must not contain duplicates')
    return ids


def select_scenarios(script_names=None, browser=None, group=None, scenario_ids=None, *, matrix_browser=None):
    """Return manifest indexes selected by script, engine, shard, or exact IDs."""
    selected = [
        index for index, item in enumerate(SUITE)
        if item['classification'] == 'required'
    ]
    if matrix_browser is not None and (scenario_ids is None or browser not in ('both', matrix_browser)):
        raise ValueError('matrix browser requires an exact scenario selection for that browser')
    if script_names and scenario_ids is not None:
        raise ValueError('script names cannot be combined with exact scenario IDs')
    if group is not None and scenario_ids is not None:
        raise ValueError('scenario IDs cannot be combined with a full-suite group')
    if group is not None and group not in (1, 2):
        raise ValueError(f'unknown full-suite group: {group}')
    if script_names:
        names = {Path(name).name for name in script_names}
        known = {Path(item['script']).name for item in SUITE}
        unknown = names - known
        if unknown:
            raise ValueError(f"unknown script(s): {', '.join(sorted(unknown))}")
        selected = [
            i for i, item in enumerate(SUITE)
            if item['classification'] == 'required' and Path(item['script']).name in names
        ]

    if scenario_ids is not None:
        known = {item['id'] for item in SUITE}
        unknown = set(scenario_ids) - known
        if unknown:
            raise ValueError(f"unknown scenario ID(s): {', '.join(sorted(unknown))}")
        selected = [i for i, item in enumerate(SUITE) if item['id'] in scenario_ids]

    if browser:
        engines = {'chromium', 'webkit'} if browser == 'both' else {browser}
        if scenario_ids is not None and any(SUITE[i]['browser'] not in engines for i in selected):
            raise ValueError('scenario IDs do not match the requested browser')
        selected = [i for i in selected if SUITE[i]['browser'] in engines]
        if script_names:
            found = {SUITE[i]['browser'] for i in selected}
            missing = engines - found
            if missing:
                raise ValueError(f"selected script has no manifest entry for: {', '.join(sorted(missing))}")
    if group is not None:
        selected = [i for i in selected if scenario_group(SUITE[i]) == group]
        if not selected:
            raise ValueError('selected group has no matching scenarios')
    if matrix_browser is not None:
        selected = [i for i in selected if SUITE[i]['browser'] == matrix_browser]
    if scenario_ids is not None and not selected:
        raise ValueError('scenario selection matched zero manifest entries for the requested browser')
    return selected


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def save_report(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as report:
        writer = csv.DictWriter(report, fieldnames=[
            'scenario_id', 'script', 'browser', 'start_utc', 'end_utc', 'duration_seconds', 'status', 'timed_out',
        ])
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--script', action='append', help='Run a named script from the full-suite manifest; repeat to select more scripts.')
    parser.add_argument('--browser', choices=['chromium', 'webkit', 'both'], help='Select required scenarios for one or both engines, or filter --script.')
    parser.add_argument('--group', type=int, choices=[1, 2], help='Select one required full-suite shard.')
    parser.add_argument('--scenario-ids', help='Run exact comma-separated manifest IDs, including explicit manual-only diagnostics.')
    parser.add_argument('--matrix-browser', choices=['chromium', 'webkit'], help='Run only this engine after validating the requested diagnosis.')
    parser.add_argument('--list-only', action='store_true', help='Validate selection and print selected scenario IDs without running them.')
    parser.add_argument('--timings-file', type=Path, default=Path(os.environ.get('HEIBON_BROWSER_TIMINGS', '/tmp/heibon-browser-ui-timings.csv')))
    args = parser.parse_args()

    try:
        scenario_ids = parse_scenario_ids(args.scenario_ids)
        selected = select_scenarios(args.script, args.browser, args.group, scenario_ids, matrix_browser=args.matrix_browser)
    except ValueError as error:
        parser.error(str(error))

    if args.list_only:
        for index in selected:
            print(SUITE[index]['id'])
        return 0

    report_indexes = selected
    report_rows = {}
    rows = [
        {
            'scenario_id': item['id'], 'script': item['script'], 'browser': item['browser'], 'start_utc': '', 'end_utc': '',
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
        print(f"::group::Browser UI {item['id']} {item['script']}", flush=True)
        print(f"::notice title=Browser UI started::scenario_id={item['id']} browser={item['browser']} script={item['script']} start={start}", flush=True)
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
            f"::notice title=Browser UI timing::{status} scenario_id={item['id']} browser={item['browser']} script={item['script']} "
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
