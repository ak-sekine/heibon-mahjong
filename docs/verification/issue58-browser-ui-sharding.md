# Issue 58: Browser UI sharding and targeted diagnostics

## Current policy: 80 required scenarios, two manual-only baselines

The revised Issue #58 acceptance criteria dated 2026-11-15 keep all 82 manifest entries but classify the two `HEIBON_CANDIDATE_BASELINE=1` entries as manual-only. They compare the historical UI at a fixed revision and report observations; they do not decide whether the current UI is correct. The current Geometry scenario remains a required regression.

| Browser | Required Group 1 | Required Group 2 | Required total | Manual-only baseline |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 15 | 30 | 45 | 1 |
| WebKit | 9 | 26 | 35 | 1 |
| Total | 24 | 56 | 80 | 2 |

`tests/run-browser-regressions.py` is the source of truth. Each manifest entry now declares `classification` (`required` or `manual`) and a group for required entries. An entry with missing classification or group fails the selection tests. The groups are disjoint and their union is exactly the 80 required entries; baseline entries have no full-suite group.

Group 1 contains Geometry current in both browsers plus measured work moved from the former Group 2. Chromium Group 1 additionally contains dialog creation, dialog scroll, production URL dialog layout, PWA, keyboard help, app idle, offline rules, online next-round, online rematch multi-client, riichi discard layout, action controls, call decision dialog, table UI, and river capacity. WebKit Group 1 additionally contains dialog scroll, production URL dialog layout, keyboard help, online exit notice, online rules, call test, riichi claimed discard, and river capacity. Group 2 contains the remaining required entries. `browser-round-end-ui` stays in Group 2 because the existing geometry report step reads its screenshot there. The group 2-only itch smoke and setup checks remain once per browser.

The current manifest IDs for manual baseline runs are:

| Browser | Explicit diagnostic ID |
| --- | --- |
| Chromium | `browser-candidate-geometry-chromium-candidate-baseline-1` |
| WebKit | `browser-candidate-geometry-webkit-candidate-baseline-1` |

Use `diagnostic_mode=scenarios` and supply the exact ID. To run both baselines concurrently in one dispatch, use `diagnostic_browser=both` and comma-separate both IDs. The workflow filters the list per browser; each runner validates and runs only its matching baseline. Normal default selection, `--browser`, `--group`, and `--script browser-candidate-geometry.py` select required entries only. The legacy `targeted_candidate_geometry=true` input continues to select Geometry current through `--script`; it no longer implicitly includes either baseline.

The latest pre-revision run [Environment CI #43685891092](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43685891092), SHA `957b0f5ac68a48dcd1cabba5cd6ddbad6923c813`, still used the old 82-entry assignment. Its per-scenario logs provide the workload data used for this reallocation. After excluding the baseline durations, the previous assignment put Chromium current at 3m13.315s against the other 44 required entries at 11m48.275s; WebKit current was 4m14.587s against the other 34 at 7m31.368s.

| Browser | Required scenario total after baseline removal | New Group 1 | New Group 2 | Estimated max job time including observed setup/smoke overhead |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 15m01.590s | 7m41.111s (15 entries) | 7m20.479s (30 entries) | about 8m31s per group |
| WebKit | 11m45.955s | 6m04.684s (9 entries) | 5m41.271s (26 entries) | about 7m19s per group |

These are estimates from the prior run's scenario timings and group overhead, not results from the revised workflow. The two baseline scenarios measured 20m30.996s (Chromium) and 17m16.050s (WebKit) in that run. The revised full suite and baseline dispatch still require GitHub Actions verification.

## Historical initial implementation: all 82 entries were required

The following records describe the successful initial implementation before the revised acceptance criteria moved the baselines to manual-only. Keep them as historical verification; they do not establish success of the new 80-entry policy.

## Implemented on `develop` from `0a889f38b05a0f60c31be61a6a5be04033e5ddbb`

The sharding and diagnostic change was committed as `6942eb4c582abea99b88ec39150e41c386744929`. GitHub rejected that workflow revision because its job-level `if` used the unavailable `matrix` context, and the push-triggered Browser UI and Environment CI runs failed before creating jobs. Commit `5ab20448833b7f051b69d405a09d948de070bd26` removes matrix references from the job condition and computes diagnostic matrix values from dispatch inputs. The corrected workflow was accepted by GitHub and exercised by the runs recorded below.

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

After correcting the job-level matrix context in `5ab2044`:

- `npm test`: 91/91 passed.
- `tests/test_browser_regressions_selection.py`: 14/14 passed.
- The Browser UI classifier, Deploy matrix audit, and Environment workflow tests passed with the dynamic dispatch matrix assertions.
- All workflow YAML parsed and `git diff --check` passed. GitHub accepted the workflow and created both the four-job full matrix and single-browser diagnostic matrix.

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

### Codex-dispatched diagnostics on `5ab20448833b7f051b69d405a09d948de070bd26`

| Selection | Run | Result | Runner log evidence |
| --- | --- | --- | --- |
| Chromium: `browser-test-page-chromium` | [43682915455](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43682915455) | success | Only the requested ID; 5.597s scenario time. |
| Chromium: `browser-test-page-chromium,browser-dialog-scroll-chromium` | [43683055744](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43683055744) | success | Both requested IDs, no others; 16.456s combined scenario time. |
| WebKit: `browser-test-page-webkit` | [43683064959](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43683064959) | success | Only the requested ID; 9.834s scenario time. |
| WebKit: `browser-test-page-webkit,browser-dialog-scroll-webkit` | [43683074187](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43683074187) | success | Both requested IDs, no others; 19.391s combined scenario time. |

Each run checked out the target SHA, selected one browser/group-1 diagnostic job, and uploaded `pages-dist` plus a browser/group-specific result artifact. The `verify-build` job skipped the full unit suite and itch build; the browser job skipped itch smoke checks. An intentionally invalid Chromium ID, `issue58-unknown-scenario`, was dispatched in [run 43683270517](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43683270517); it failed at scenario validation with `unknown scenario ID(s)` before installing or launching a browser. This expected diagnostic failure is not a full-CI result.

## Timing comparison

Baseline run links:

- [Browser UI run 43663419576](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43663419576), SHA `0a889f38b05a0f60c31be61a6a5be04033e5ddbb`, success, wall clock 33m26s.
- [Environment CI run 43663419582](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43663419582), same SHA, success, wall clock 38m09s.

The user-supplied scenario timing labels do not match the successful baseline runner logs. The logs identify the longer geometry invocation as `HEIBON_CANDIDATE_BASELINE` and the shorter one as current:

| Browser | Geometry baseline | Geometry current | Other manifest entries | Baseline + other (the requested Group 2) |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 17m21.895s | 3m14.058s | 10m08.265s (44) | 27m30.160s |
| WebKit | 14m55.917s | 2m54.711s | 6m30.220s (34) | 21m26.137s |

The values previously supplied as “Geometry current” (Chromium 17m22s, WebKit 14m56s) match the baseline invocation in the logs. The supplied “baseline + other” values (Chromium 13m22s, WebKit 9m25s) match current geometry plus the other manifest entries. The timing comparison below uses the runner's recorded labels and the actual requested group assignments.

Baseline whole-job wall clock values are Chromium 32m02s and WebKit 26m38s. Runner time, summed across non-skipped jobs, is approximately 60m03s for the Browser UI run and 73m54s for Environment CI. The two workflows overlapped in time and are reported separately.

## Historical 82-entry GitHub Actions results

The corrected full-suite runs target `5ab20448833b7f051b69d405a09d948de070bd26`.

- Environment CI [run 43682888262](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43682888262) succeeded in 26m31s. All four child Browser UI groups succeeded; the `audit` job verified one successful job for each required group. `verify`, both isolation browser jobs, and `local-online` passed. `publish`, `online`, and Worker jobs were skipped; no deployment occurred.
- Environment CI group job wall times: Chromium Group 1 4m00s, Group 2 23m42s; WebKit Group 1 4m09s, Group 2 25m09s. Group 1 scenario time was 3m12.719s for Chromium and 2m52.844s for WebKit. Group 2 logged 45/45 Chromium IDs in 22m43.203s and 35/35 WebKit IDs in 23m42.221s; local manifest comparison found no missing, extra, or duplicate ID and no timeout.
- Environment CI runner wall time summed from started/completed job timestamps was 60m08s. This is job wall time, not GitHub billable minutes.
- The four full-suite artifacts include `browser-ui-{chromium,webkit}-group-{1,2}-<sha>-1`; the Environment CI run listed all four, and the corresponding group artifacts are also present in the direct Browser UI run. The artifact upload logs and scenario timing notices are available from the run. The CLI artifact ZIP download redirected to `productionresultssa0.blob.core.windows.net`, which is not in this Cloud instance's enforced allowlist, so the ZIP bytes could not be expanded locally. No allowlist or network setting was changed.

The push-triggered Browser UI run [43682888254](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43682888254) also succeeded. The exact job results were Chromium Group 1 3m55s, Group 2 31m07s; WebKit Group 1 4m32s, Group 2 25m43s. Runner logs matched Group 1's one ID and Group 2's 45 Chromium / 35 WebKit IDs exactly against the local manifest, with no missing, extra, duplicate, failed, or timed-out scenario. Group 1 scenario times were 3m08.301s (Chromium) and 3m19.022s (WebKit); Group 2 sums were 29m46.679s and 24m19.462s.

All four full-suite artifacts were present with SHA-, browser-, and group-specific names. Group 2 also uploaded `itch-dist` and the review artifacts. The Environment CI audit and direct job conclusions were successful. The Environment CI run had all publication jobs skipped; the `deploy.yml` workflow did not run for this develop push.

## Performance comparison

The pre-change Browser UI run [43663419576](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43663419576) took 33m26s wall clock and 60m03s summed job time. Its Chromium/WebKit jobs took 32m02s/26m38s. Environment CI [run 43663419582](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43663419582) took 38m09s and 73m54s summed job time.

| Workflow | Before wall | After wall | Wall change | Before summed job wall | After summed job wall | Runner-time change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Browser UI | 33m26s | 32m20s | −1m06s (−3.3%) | 60m03s | 66m34s | +6m31s (+10.8%) |
| Environment CI | 38m09s | 26m31s | −11m38s (−30.5%) | 73m54s | 60m08s | −13m46s (−18.6%) |

The Browser UI group job durations were Chrome 3m55s + 31m07s and WebKit 4m32s + 25m43s. Each group ran its own checkout, npm install, Playwright setup, and artifact upload. Browser OS/browser install logs show this repeated setup; group 1 skipped the standalone itch smoke tests, while group 2 ran the existing smoke and failure-capture checks once per browser. The direct Browser UI wall-clock gain was modest and its summed job wall time increased, while Environment CI improved substantially. The long baseline geometry invocation remains in Group 2, so Group 2 is much longer than Group 1. The measurements support retaining the requested two-group change for this issue; a third shard was not added. If a shorter direct Browser UI wall time is required, a separate measured follow-up should split the baseline geometry entry from the remaining scenarios.

Runner-time totals are sums of GitHub job elapsed wall times, not billing measurements. The two workflows overlapped and are reported separately. Scenario times varied between successful runs; the post-change direct Browser UI regression job totals were slower than the old per-browser scenario totals even though the full workflow wall time was 66 seconds shorter. This makes the modest Browser UI wall-clock gain a run-specific measurement rather than evidence that every individual scenario became faster.

The current Codex Cloud network policy is enforced and does not include the GitHub artifact redirect host `productionresultssa0.blob.core.windows.net`. The GitHub artifact connector returned ZIP file references and artifact metadata; the runner logs expose the scenario IDs/timings, but the ZIP payloads could not be expanded locally. No network setting was changed. Local ZIP inspection requires an approved Cloud allowlist change for the redirect destination.

## Revised-policy verification status

The revised implementation is based on `develop` SHA `957b0f5ac68a48dcd1cabba5cd6ddbad6923c813`. GitHub API and an explicit fetch of `refs/heads/develop` both confirmed that SHA. The repository's default fetch refspec tracks only `main`; the explicit develop refspec was therefore used to update `origin/develop` safely.

Local verification after the policy and manifest changes:

- `python tests/test_browser_regressions_selection.py`: 18 tests passed. Coverage includes 82 entries, 80 required plus two manual-only baselines, exact group memberships/counts, default/browser/group/script baseline exclusion, exact-ID baseline selection, mixed-browser selection, and malformed or mismatched selection rejection.
- `node --test tests/ci-change-classifier.test.mjs tests/deploy-gate-matrix.test.mjs tests/environment-workflows.test.mjs`: passed. The audit still requires all four exact group jobs to conclude `success`; failure, cancellation, skip, absence, and duplication remain failures.
- `npm test`: 91/91 passed; `npm run typecheck`, `npm run typecheck:worker`, `npm run build`, and `VITE_ONLINE_API_URL=https://online-mock.invalid npm run build:itch` passed.
- All seven workflow YAML files parsed successfully; `git diff --check` passed. `--list-only` showed that the legacy geometry script selector returns the two current-geometry IDs only, while the explicit two-baseline ID selection returns exactly the two baseline IDs. No browser was launched in Codex Cloud.

The revised full Browser UI workflow, its 80-entry matrix audit, the Environment CI wrapper, artifact uploads, and either baseline diagnostic have **not yet run** on the revised implementation. Current `gh auth status` reports that the injected `GH_TOKEN` is invalid, and with that variable omitted the CLI has no saved GitHub login. GitHub read APIs work, but this environment has no authenticated Actions-dispatch client. The previous 82-entry run links above remain historical evidence only; they do not satisfy the revised 80-entry acceptance criteria. Issue #58 remains open pending a successful push-triggered 80-entry run and explicit baseline diagnostics.
