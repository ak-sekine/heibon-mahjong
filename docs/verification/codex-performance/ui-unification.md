# Codex UI unification performance log

Task: Heibon Mahjong UI unification, discard layout correction, and duration investigation.

Measurement started: 2026-10-20 21:50:15 UTC (managed environment ready; initial workspace inspection began).
Clock: UTC timestamps from the session clock. Command elapsed times use the shell/tool-reported process duration where available. Tool-call duration and command runtime are reported separately when both are observable. Phase durations are wall-clock intervals; overlapping work is flagged and is not summed twice.

## Phase timing

| Phase | Start (UTC) | End (UTC) | Elapsed | Status / notes |
|---|---|---|---:|---|
| A. Environment, specs, and source inspection | 2026-10-20 21:50:15 | 2026-10-20 21:53:48 | 3m 33s | Completed. Confirmed `work` and fetched `origin/main`; HEAD matches latest main at `77c12687406b2b98347bf12854ffc33fa1def7a4`. Read AGENTS.md, SPEC.md, Step 14.2 notes, source, tests, and workflows. |
| B. UI unification design decisions | 2026-10-20 21:53:48 | 2026-10-20 21:56:52 | 3m 04s | Completed. Use one cloned action-panel template with separate event handlers; shared seat labels and round/dora rendering; stable CPU display numbering by absolute seat; preserve the online view allowlist. River main-axis slots will use half the normal/declaration width delta plus the fixed 1px gap, and absolute positions will replace grid tracks so the declaration stays stable without full-height spacing between every portrait face. |
| C. Implementation and fixes | 2026-10-20 21:56:52 | 2026-10-20 22:16:04 | 19m 12s wall interval | Shared score-strip, center-info, and action-panel templates; shared label/round/wall/dora renderers; fixed compact river pitches; stable online CPU labels; menu CSS; migrated browser fixtures to coordinate datasets. The center/score template and test-page migration were added after an initial local test pass, so verification was rerun against final source. Phase C and D overlap from 22:14:17 to 22:16:04 (1m 47s). |
| D. Unit tests, typecheck, and build | 2026-10-20 22:14:17 | 2026-10-20 22:21:26 | 7m 09s wall interval | Completed. Final-source `npm test` passed (49/49), build passed, Python syntax parse passed, and the final full staged diff check passed. One earlier staged check flagged two trailing-space lines in the new development note; those were removed. Worker unchanged, so Worker typecheck is not applicable. D overlaps C from 22:14:17 to 22:16:04 (1m 47s); durations are not added twice. |
| E. Browser UI verification and failure analysis | 2026-10-20 22:24:03 | in progress | 6m 41s elapsed at 22:30:44 | Run 39507823447 reached the browser script and failed on a global selector that chose the hidden online center panel. The run diagnostics and artifact were inspected, 10 offline test selectors were scoped to `#local-table`, and Python/Node syntax checks passed. One corrective push and Browser UI run are pending. |
| F. Git operations, commit, and push | 2026-10-20 22:23:48 | 2026-10-20 22:24:01 | 13s wall interval | Commit `3930cea127c18ca5d3cd857cce95201cba5fdad2` was fast-forward pushed to main (one push). The targeted browser-test correction is awaiting its commit and push. |
| G. GitHub Actions check / wait | 2026-10-20 22:24:03 | 2026-10-20 22:26:09 | 2m 06s for run 1 | Actions run 39507823447 matched SHA `3930cea...`. `verify` passed; `browser-ui` failed at its first 320px local central-panel check; deployment and Pages jobs were skipped. Five bounded job-status calls returned within about one second each. A second push-triggered run is pending; no explicit Actions rerun was requested. |
| H. Documentation and final report preparation | 2026-10-20 22:18:14 | in progress | — | Added Step 14.3 development/verification notes, updated SPEC/ROADMAP indexes, and recorded the first Actions failure and its selector correction. The final Actions outcome, commit IDs, and timing totals remain pending. |

## Command timing ledger

| Command | Start (UTC) | End (UTC) | Runtime | Exit | Runs | Repeat reason |
|---|---|---|---:|---:|---:|---|
| Workspace path/listing | 2026-10-20 21:50:15 | 2026-10-20 21:50:15 | <1s tool-reported | 0 | 1 | Initial environment check |
| `git fetch origin main --no-tags` (default sandbox) | 2026-10-20 21:50 UTC* | 2026-10-20 21:50 UTC* | <0.001s command report; 2.5s batched tool call | 128 | 1 | Required current-main check; proxy port 8080 rejected connection. |
| `git fetch origin main --no-tags` (network-enabled sandbox) | 2026-10-20 21:50 UTC* | 2026-10-20 21:50 UTC* | 0.25s command; 6.2s tool call | 0 | 1 | One authorized retry after the required network permission path; updated `origin/main` to HEAD. |
| `git fetch origin main --no-tags` (pre-push refresh) | 2026-10-20 22:23:16 | 2026-10-20 22:23:23 | 0.40s command; 6.9s tool call | 0 | 1 | Rechecked main immediately before commit/push. `origin/main` remained `77c12687406b2b98347bf12854ffc33fa1def7a4`; no proxy error or retry. |
| `npm test` (initial pass) | 2026-10-20 22:14:17 | 2026-10-20 22:14:42 | 24.51s command; 24.9s tool call | 0 | 1 | Required local regression suite; 49 test files passed. Re-run after the later shared score/center template addition. |
| `npm run build` (initial pass) | 2026-10-20 22:14:45 | 2026-10-20 22:14:48 | 3.05s command; 3.4s tool call | 0 | 1 | Required TypeScript and Vite production build. Re-run after the later shared score/center template addition. |
| Python AST parse of `tests/*.py` | 2026-10-20 22:14:52 | 2026-10-20 22:14:52 | 0.39s command; 0.8s tool call | 0 | 1 | Syntax-only check for browser scripts; Chromium remains reserved for the existing GitHub Actions workflow. |
| `npm test` (final-source run; result output was truncated) | after 2026-10-20 22:16:04 | unavailable | unavailable | unavailable | 1 | Final verification was started after the shared template/page changes. The tool response exceeded the available model context, so its start/end metadata and exit code were not recoverable. One bounded rerun was made to retain the complete summary and exit code. |
| `npm test` (final-source result capture) | 2026-10-20 22:17:49 | 2026-10-20 22:18:14 | 24.90s command; 25.3s enclosing parallel tool call | 0 | 1 | Captured a concise test summary and exit code after the preceding final-source run's tool output had been truncated; 49 test files passed. |
| `npm run build` (final source) | 2026-10-20 22:17:49 | 2026-10-20 22:17:55 | 5.53s command; 25.3s enclosing parallel tool call | 0 | 1 | Rebuilt after shared score/center templates and the kan verification page were added. It ran concurrently with the final-source `npm test`; the enclosing tool call took 25.3s. |
| `git diff --check` (tracked-file pass) | 2026-10-20 22:18 UTC* | 2026-10-20 22:18 UTC* | <1s | 0 | 1 | Checked tracked implementation, tests, and documentation changes. New documentation files were not staged yet and therefore were not included. |
| `git diff --cached --check` (first full staged pass) | 2026-10-20 22:21:03 | 2026-10-20 22:21:03 | <1s | 2 | 1 | Included new files; found two trailing-space Markdown hard-break lines in `docs/development/step-14.3.md`. Removed the whitespace and reran the full check. |
| Markdown whitespace correction | 2026-10-20 22:21:03 | 2026-10-20 22:21:04 | 0.8s tool call | 0 | 1 | Removed the two trailing spaces reported by the first full staged diff check. |
| `git add -A` | 2026-10-20 22:20:59 and 22:21:25 | 2026-10-20 22:20:59 and 22:21:26 | <1s each | 0 | 2 | Staged the initial docs/source set, then restaged the timing log and whitespace correction. |
| `git diff --cached --check` (full staged passes) | 2026-10-20 22:21:26 and 22:23:12 | 2026-10-20 22:21:26 and 22:23:12 | <1s command; 0.6s enclosing parallel tool call for first pass, <1s for second | 0 | 2 | Rechecked all 41 staged files after the whitespace correction and again after updating the phase overlap record. |
| `git add -A` | 2026-10-20 22:20:59, 22:21:25, 22:23:11, 22:23:45, 22:30:29 | same minute as each start | <1s each | 0 | 5 | Staged docs/source initially, then restaged after the whitespace, timing-log, and Browser UI selector corrections. |
| `git diff --cached --check` | 2026-10-20 22:23:45 and 22:30:29 | same minute as each start | <1s each | 0 | 2 | Checked all staged files before the first commit and after the targeted test correction. |
| `git diff --check` | 2026-10-20 22:30:29 | 2026-10-20 22:30:30 | <1s | 0 | 1 | Final no-unstaged-diff check after the test-selector correction; full staged content was checked by the adjacent `--cached` command. |
| `git fetch origin main --no-tags` (before corrective push) | 2026-10-20 22:30:39 | 2026-10-20 22:30:44 | 0.42s command; 5.8s tool call | 0 | 1 | Reconfirmed latest main equals current commit `3930cea...` immediately before creating the corrective commit. |
| `git commit -m "Unify local and online game UI"` | 2026-10-20 22:23:48 | 2026-10-20 22:23:48 | <1s tool-reported | 0 | 1 | Committed the completed shared UI and local verification record after final staged diff check. |
| `git push origin HEAD:main` | 2026-10-20 22:23:54 | 2026-10-20 22:24:01 | 1.55s command; 7.8s tool call | 0 | 1 | Required fast-forward reflection to main; push output confirmed `77c1268..3930cea`. |
| GitHub connector: list Actions runs for main | 2026-10-20 22:24:08 | 2026-10-20 22:24:09 | <1s tool call | 0 | 1 | Verified a push-triggered run for the exact main SHA `3930cea...`; returned run 39507823447. |
| GitHub connector: fetch jobs for run 39507823447 | 22:24:15–16, 22:24:48–49, 22:25:17–18, 22:25:41–42, 22:26:13–14 | same as starts plus about 1s | about 1s per call; 5 calls | 0 | 5 | Bounded status polling approximately every 25–33s; observed checkout, test/browser setup, browser execution, then failure and skipped downstream jobs. No repeated API/network error. |
| GitHub connector: fetch failing Browser UI job logs | 2026-10-20 22:26:24 | 2026-10-20 22:26:26 | 1.9s tool call | 0 | 1 | Located `tests/browser-table-ui.py` 320px `centralDora` assertion and selector collision. |
| GitHub connector: download Browser UI artifact 12304556590 | 2026-10-20 22:26:40 | 2026-10-20 22:26:44 | 4.1s tool call | 0 | 1 | Inspected the diagnostic JSON and screenshot to distinguish the hidden DOM target from rendered local layout. |
| Python AST parse of `tests/*.py` after selector correction | 2026-10-20 22:28:33 | 2026-10-20 22:28:34 | 0.4s enclosing parallel tool call; per-command runtime unavailable | 0 | 1 | Reparsed all 38 browser Python scripts after changing selectors. |
| `node --check tests/browser-deposit-sticks.mjs` | 2026-10-20 22:28:33 | 2026-10-20 22:28:34 | 0.4s enclosing parallel tool call; per-command runtime unavailable | 0 | 1 | Syntax check for the modified JavaScript browser fixture. |

## Fix and revalidation loops

The river change replaces a full sideways-face pitch with the measured midpoint pitch: regular adjacent face gap `1px + half the face-size delta`, adjacent to a riichi declaration `1px`, and cross-axis slot pitch equal to the full tile length plus `1px`. Existing browser regressions measure SVG rectangles for this geometry and verify 1/6/7/18-tile scenes, four rotations, overlap, and stable non-declaration coordinates. The new online browser script compares actual online/offline summary, seat, center, river, action-panel, status, and discard-button geometry at 320/375/390/430/1280px. One final-source npm test output was unavailable because the tool response was truncated; one bounded rerun provided a retained exit code 0 and full summary. The first full staged whitespace check failed on two trailing spaces in a new Markdown note; both were removed in one correction (<1s tool call), and a later staged check passed.

Actions run 39507823447 had `verify` pass but the Browser UI job stop at 320px `centralDora`. The selector in `browser-table-ui.py` matched the hidden online center component, which precedes the local component in the DOM. The diagnostic screenshot and geometry showed the local center panel and dora within the table; this first run does not constitute a complete Browser UI pass. Ten local test scripts now scope those selectors to `#local-table`; their syntax checks passed. The selector correction took about 2m 10s from log diagnosis at 22:26:24 through syntax validation at 22:28:34, including log/artifact inspection. One issue-specific test correction has been made; the next Actions run will validate it. No expected value was weakened.
The first Git network attempt failed immediately with `Failed to connect to proxy port 8080`; the same fetch was retried once with network permission and succeeded. No unrelated network retry occurred.

## Push / Actions counts

- Pushes to `main`: 1
- GitHub Actions push-triggered runs initiated by this task: 1 (run 39507823447; failed at Browser UI)
- GitHub Actions reruns requested: 0
- `npm test`: 3 invocations total; 2 retained successful summaries (the initial pass before final template additions and final-source run), 1 intermediate final-source invocation with unrecoverable tool output/exit metadata.
- `npm run build`: 2 invocations; initial pass before final template additions and one successful final-source build.
- Implementation defect fixes: 0 failure-driven UI code corrections. One substantive extension to shared templates required final-state verification.
- Same-issue fixes: 1 documentation whitespace correction and 1 Browser UI selector correction. No third fix occurred; no expected values were relaxed.
- Whitespace check loop: 1 failed `git diff --cached --check`, 1 correction, followed by successful full staged checks; no expected-value relaxation.
- Main pushes so far: 1; `git fetch` ran 4 times (one initial default-sandbox failure, its one authorized retry, and two successful pre-push refreshes).

## Progress checkpoints

- 2026-10-20 21:50 UTC: Environment ready; repository path confirmed; source/spec/branch inspection is starting.
- 2026-10-20 21:53 UTC: Phase A completed (3m 33s). Remote `main` now matches local HEAD. Phase B design started. Existing UI has separate online score-strip/round/dora/action rendering, while both modes already share the river helper and some CSS classes.
- 2026-10-20 22:14 UTC: Initial local UI tests passed (49 files, 0 failures), the TypeScript/Vite build passed, and Python syntax parsing passed (38 files). Browser UI verification is deferred to the existing GitHub Actions workflow; no local Chromium launch was attempted.
- 2026-10-20 22:16 UTC: Added shared score-strip and center-info template mounts to both the main page and kan verification page after the first local test/build pass. Revalidation is running once against this final markup; this is a substantive code change, not a repeated successful test without cause. Total task elapsed time is about 22 minutes; no Browser UI action run or main push yet.
- 2026-10-20 22:18 UTC: Final-source regression suite passed (49/49), final build passed, and Browser UI scripts parsed successfully. One intermediate test response was truncated by the tool and had no recoverable exit metadata, so the suite was invoked once more with output summarized. Documentation and final staged diff checks are next; no Actions run or main push yet.
- 2026-10-20 22:21 UTC: First staged diff check exposed two trailing spaces in the new Step 14.3 development note. Both were removed in one documentation-only correction; final staged diff check is pending. No test failure or code correction occurred.
- 2026-10-20 22:21 UTC: Final `git diff --cached --check` passed for all 41 staged files. New environment instructions were read; the current policy snapshot is enforced and lists GitHub as an allowed preset. No push has been attempted yet.
- 2026-10-20 22:23 UTC: Re-fetched `origin/main` before commit; it still matches starting HEAD `77c12687406b2b98347bf12854ffc33fa1def7a4`. Staged diff-check passed after the latest timing-log update. Commit and the single main push are pending.
- 2026-10-20 22:24 UTC: Commit `3930cea127c18ca5d3cd857cce95201cba5fdad2` was pushed to main. Actions run 39507823447 started for that SHA; bounded status calls confirmed `verify` and `browser-ui` jobs.
- 2026-10-20 22:26 UTC: `verify` passed. Browser UI failed because an offline geometry script selected the hidden online center panel; downstream deploy/Pages jobs were skipped. Logs and artifact were inspected once. This is a test-selector failure, not a confirmed screen-layout failure.
- 2026-10-20 22:29 UTC: Ten offline Browser UI scripts now target `#local-table` components. Python syntax parse (38 scripts) and Node syntax check passed. Corrective push/run are pending. Total elapsed time is about 39m; one Actions execution and one main push have occurred.
- 2026-10-20 22:30 UTC: Re-fetched main before the correction commit; it still equals `3930cea127c18ca5d3cd857cce95201cba5fdad2`. `git diff --check` and the full staged check passed after the selector/doc correction. Push-triggered run 2 is pending.

*Only minute-level UTC timestamps were available for the first two fetch attempts; command and whole-tool runtimes are kept separate where reported.
