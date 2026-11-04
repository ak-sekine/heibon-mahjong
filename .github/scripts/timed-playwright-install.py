#!/usr/bin/env python3
"""Run one Playwright install phase and report concise timing without masking failures."""

import json
import subprocess
import sys
import time
from datetime import datetime, timezone


PHASE_NAMES = {
    "install-deps": "OS dependency installation",
    "install": "Browser installation",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in PHASE_NAMES:
        print("Usage: timed-playwright-install.py {install-deps|install} {browser}", file=sys.stderr)
        return 2

    phase, browser = sys.argv[1:]
    started_utc = utc_now()
    started = time.monotonic()
    try:
        result = subprocess.run(
            [sys.executable, "-m", "playwright", phase, browser],
            check=False,
        )
        exit_code = result.returncode
    except OSError as error:
        print(f"Could not start Playwright install command: {error}", file=sys.stderr)
        exit_code = 127

    ended_utc = utc_now()
    timing = {
        "process": PHASE_NAMES[phase],
        "browser": browser,
        "start_utc": started_utc,
        "end_utc": ended_utc,
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "status": "success" if exit_code == 0 else "failure",
    }
    try:
        print(f"[playwright-install-timing] {json.dumps(timing, separators=(',', ':'))}", flush=True)
    except OSError:
        # Timing output is best effort; preserve the installer exit status.
        pass
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
