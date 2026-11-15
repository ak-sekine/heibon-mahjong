# Issue 58: Browser UI sharding and targeted diagnostics

## Implemented on `develop` from `0a889f38b05a0f60c31be61a6a5be04033e5ddbb`

The 82 manifest entries remain the source of truth. The full-suite shard assignment is:

| Browser | Group 1 | Group 2 | Total |
| --- | ---: | ---: | ---: | ---: |
| Chromium | Geometry current: 1 | Geometry baseline + other 44: 45 | 46 |
| WebKit | Geometry current: 1 | Geometry baseline + other 34: 35 | 36 |

The runner assigns a stable manifest `id` to each browser/environment variant. Group 1 contains only `browser-candidate-geometry.py` without `HEIBON_CANDIDATE_BASELINE`; group 2 contains the baseline invocation and every other manifest entry. The existing script starts a new subprocess for each entry. The baseline invocation writes `src/ui/issue32-baseline-action-panel.ts` only into its job checkout and removes it in `finally`. Each matrix leg runs on its own GitHub-hosted runner with a separate checkout, filesystem, ports, and `/tmp`; the screenshot directory, timings CSV, execution log, and artifact names include browser and group.

The full Browser UI matrix uses four jobs concurrently. npm setup, `npm ci`, Playwright installation, and OS browser dependencies therefore run once per job. The existing engine-selection/witness checks, standalone itch smoke startup check, before/after smoke tests, and forced-failure diagnostic check run once per browser in group 2. Group 1 is reserved for the current geometry scenario and its review artifacts. No regression assertion or timeout is changed.

The Deploy and Environment CI matrix audit requires exactly one successful job for each of Chromium groups 1/2 and WebKit groups 1/2. Missing, duplicate, skipped, cancelled, or failed groups fail the audit.

## Local verification before push (2026-11-15)

- `tests/test_browser_regressions_selection.py`: 14 tests passed, including 82-entry coverage, 46/36 engine counts, 1/45 and 1/35 group counts, unique IDs, and invalid/empty selection rejection.
- `tests/ci-change-classifier.test.mjs`: 17 tests passed. Its parallelism expectation is 4 matrix jobs; gate and failure behavior assertions remain in place.
- `tests/deploy-gate-matrix.test.mjs`: 3 tests passed for exact names, all-success, failures, cancelled/skipped, missing, duplicate, and unknown jobs.
- `tests/environment-workflows.test.mjs`: 5 tests passed, including running the audit with `always()` after a failed/cancelled matrix.
- `npm test`: 91/91 passed.
- `npm run typecheck`, `npm run typecheck:worker`, `npm run build`, and `VITE_ONLINE_API_URL=https://online-mock.invalid npm run build:itch`: passed.
- All workflow YAML files parsed with PyYAML; `git diff --check` passed. `actionlint` is not installed in this environment.
- List-only selection confirmed one and two exact IDs for each browser, and one ID per browser with `--browser both`. No browser was launched locally.

## Targeted `workflow_dispatch`

Choose `diagnostic_mode=scenarios`, `diagnostic_browser=chromium`, `webkit`, or `both`, and a comma-separated set of exact IDs from `tests/run-browser-regressions.py`. For example:

```sh
gh workflow run browser-ui.yml --ref develop \
  --field diagnostic_mode=scenarios \
  --field diagnostic_browser=chromium \
  --field diagnostic_scenarios=browser-test-page-chromium
```

Two IDs can be supplied separated by a comma. Use `--list-only` locally to validate IDs and inspect the exact set without launching a browser:

```sh
python tests/run-browser-regressions.py --browser chromium \
  --scenario-ids browser-test-page-chromium,browser-dialog-scroll-chromium --list-only
```

After dispatch, identify the exact run SHA/ID, inspect jobs and logs, and download its artifacts with the CLI:

```sh
gh run list --workflow browser-ui.yml --event workflow_dispatch --branch develop --limit 5 \
  --json databaseId,headSha,status,conclusion,url,displayTitle
gh run view <run-id> --json databaseId,headSha,status,conclusion,jobs,url
gh run view <run-id> --log
gh run download <run-id> --dir /tmp/issue58-browser-ui-diagnostic
```

Scenario mode rejects empty, duplicate, unknown, or browser-mismatched selections. It builds the Pages test site and runs only the selected IDs. It skips `npm test`, the itch build/smoke checks, group 2, and all unselected Browser UI scenarios. The run is titled `Browser UI diagnostic` and its job is labeled diagnostic; it is separate from the Deploy/Environment full-suite matrix audit and cannot satisfy those gates.

## Timing comparison

Baseline run links:

- [Browser UI run 43663419576](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43663419576), SHA `0a889f38b05a0f60c31be61a6a5be04033e5ddbb`, success, wall clock 33m26s.
- [Environment CI run 43663419582](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43663419582), same SHA, success, wall clock 38m09s.

The measured scenario sums supplied for the baseline are Chromium geometry current 17m22s and baseline + other 13m22s; WebKit geometry current 14m56s and baseline + other 9m25s. Baseline whole-job wall clock values are Chromium 32m02s and WebKit 26m38s. Runner time, summed across non-skipped jobs, is approximately 60m03s for the Browser UI run and 73m54s for Environment CI. The two workflows overlapped in time and are reported separately.

Post-change workflow results and measurements are pending the develop push. Record each shard's job duration and timing CSV, full workflow wall clock, total runner time, smoke/install overhead, artifact set, and failures/timeouts here after Actions completes. Until then, no performance improvement or CI acceptance result is claimed.
