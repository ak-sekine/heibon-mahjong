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
| E. Browser UI verification and failure analysis | — | — | — | Pending |
| F. Git operations, commit, and push | — | — | — | Pending |
| G. GitHub Actions check / wait | — | — | — | Pending |
| H. Documentation and final report preparation | 2026-10-20 22:18:14 | in progress | — | Added Step 14.3 development/verification notes, updated SPEC/ROADMAP indexes, and began the time ledger. It will be finalized with the bounded Actions result and commit identifiers. |

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

## Fix and revalidation loops

The test/build loop had no failure-driven code correction. The river change replaces a full sideways-face pitch with the measured midpoint pitch: regular adjacent face gap `1px + half the face-size delta`, adjacent to a riichi declaration `1px`, and cross-axis slot pitch equal to the full tile length plus `1px`. Existing browser regressions now measure SVG rectangles for this geometry, verify 1/6/7/18-tile scenes, all four rotations, no overlap, and stable non-declaration coordinates. The newly extended online browser script also compares actual online/offline summary, seat, center, river, action-panel, status, and discard-button geometry at 320/375/390/430/1280px. One final-source npm test output was unavailable because the tool response was truncated; one bounded rerun provided a retained exit code 0 and full summary. This caused one additional test invocation, not a test failure or code-fix loop. The first full staged whitespace check failed on two trailing spaces in a new Markdown note; both were removed in one correction (<1s tool call), and the final staged check passed.
The first Git network attempt failed immediately with `Failed to connect to proxy port 8080`; the same fetch was retried once with network permission and succeeded. No unrelated network retry occurred.

## Push / Actions counts

- Pushes to `main`: 0 (pending)
- GitHub Actions runs initiated by this task: 0 (pending)
- GitHub Actions reruns requested: 0
- `npm test`: 3 invocations total; 2 retained successful summaries (the initial pass before final template additions and final-source run), 1 intermediate final-source invocation with unrecoverable tool output/exit metadata.
- `npm run build`: 2 invocations; initial pass before final template additions and one successful final-source build.
- Implementation defect fixes: 0 failure-driven repeats. One substantive extension to shared templates required final-state verification.
- Same-issue fixes: 1 documentation whitespace correction; no third fix or design loop occurred.
- Whitespace check loop: 1 failed `git diff --cached --check`, 1 correction, 1 successful final staged check; no expected-value relaxation.
- Main pushes so far: 0; `git fetch` ran 3 times (one initial default-sandbox failure, its one authorized retry, and one successful pre-push refresh).

## Progress checkpoints

- 2026-10-20 21:50 UTC: Environment ready; repository path confirmed; source/spec/branch inspection is starting.
- 2026-10-20 21:53 UTC: Phase A completed (3m 33s). Remote `main` now matches local HEAD. Phase B design started. Existing UI has separate online score-strip/round/dora/action rendering, while both modes already share the river helper and some CSS classes.
- 2026-10-20 22:14 UTC: Initial local UI tests passed (49 files, 0 failures), the TypeScript/Vite build passed, and Python syntax parsing passed (38 files). Browser UI verification is deferred to the existing GitHub Actions workflow; no local Chromium launch was attempted.
- 2026-10-20 22:16 UTC: Added shared score-strip and center-info template mounts to both the main page and kan verification page after the first local test/build pass. Revalidation is running once against this final markup; this is a substantive code change, not a repeated successful test without cause. Total task elapsed time is about 22 minutes; no Browser UI action run or main push yet.
- 2026-10-20 22:18 UTC: Final-source regression suite passed (49/49), final build passed, and Browser UI scripts parsed successfully. One intermediate test response was truncated by the tool and had no recoverable exit metadata, so the suite was invoked once more with output summarized. Documentation and final staged diff checks are next; no Actions run or main push yet.
- 2026-10-20 22:21 UTC: First staged diff check exposed two trailing spaces in the new Step 14.3 development note. Both were removed in one documentation-only correction; final staged diff check is pending. No test failure or code correction occurred.
- 2026-10-20 22:21 UTC: Final `git diff --cached --check` passed for all 41 staged files. New environment instructions were read; the current policy snapshot is enforced and lists GitHub as an allowed preset. No push has been attempted yet.
- 2026-10-20 22:23 UTC: Re-fetched `origin/main` before commit; it still matches starting HEAD `77c12687406b2b98347bf12854ffc33fa1def7a4`. Staged diff-check passed after the latest timing-log update. Commit and the single main push are pending.

*Only minute-level UTC timestamps were available for the first two fetch attempts; command and whole-tool runtimes are kept separate where reported.
