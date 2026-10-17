# Step 13.5.5 integration notes

Base: `169fd2684db1c3f1e304ab5667958e895d33bda0` (Step 13.5.4 retained).

## CSS compatibility

Step 13.5.4 set a shared, enlarged physical tile scale, reaching 42px at 1280px and 20px at 320px. Step 13.5.5 changed the table to a square and placed four 18-tile rivers inside it; its earlier 18px cap conflicted with the shared-size rule and its desktop side-seat offsets were based on the wider page rather than the square table.

The integrated CSS uses one measured tile size for the hand, CPU backs, rivers, melds, and dora. It derives the maximum size from the square needed by the 9-cell river arrangement and the perimeter hands, uses the square as the query container for rotated CPU hands, and leaves clearance at the bottom hand. At 1280x800 the table is 698px and tiles are 42x58.8px; at 320x568 the table is 320px and tiles are 18.6x26.0px; at 390x844 the table is 390px and tiles are 23x32.2px. Phone sizes are slightly below Step 13.5.4 measurements because the square must fit both complete 18-tile rivers and perimeter hands without overlap. The previous 18px cap was not retained.

## Nine test resolutions

All nine files had the same textual conflict: Step 13.5.4 expected three dora columns at desktop widths, while Step 13.5.5 moves all five indicators to one summary row. The tests now assert five columns at every width. Existing game-rule, result, and privacy assertions remain.

- `browser-action-controls.py`: kept the Step 13.5.5 actual scroll-and-hit-target check for controls; updated only the dora column expectation.
- `browser-cpu-riichi.py`: updated the dora column expectation; retained CPU riichi, action, state, and privacy assertions.
- `browser-match.py`: retained the Step 13.5.5 no-forced-scroll visibility check and modal/state assertions; updated dora columns.
- `browser-riichi.py`: retained actual control reachability checks; updated dora columns.
- `browser-ron.py`: retained ron visibility/scoring checks and 5-slot dora assertion; updated dora columns.
- `browser-scoring.py`: retained result scoring and result-dora checks; updated dora columns.
- `browser-step13-3-1.py`: retained result/ura-dora checks; updated dora columns.
- `browser-step13-3-regression.py`: retained CPU progression, controls, and privacy checks; updated dora columns.
- `browser-step13-3.py`: retained result, ura-dora, and privacy checks; updated dora columns.

`dora-layout-check.py` also had a size-contract conflict: the Step 13.5.5 copy had replaced Step 13.5.4's equality-to-hand assertion with a 13.5–18px range. The integrated test points at `.table-summary`, requires dora, CPU backs, and hand tiles to remain the same physical size, and expects five indicators in one row. The 18-river, no-overflow, reduced-height control, and private-ID checks remain enabled.

## Focused validation

- `npm run build`: passed.
- Related Node tests (`dora-layout`, `table`, `kan-page`, `action-controls`, `step13-3`): 152 passed, 0 failed.
- `dora-layout-check.py`: passed its five established sizes; 320px dora/hand width 18.6px, 390px 23px, 1280px 42px.
- Square-table browser checks: 1280x800, 320x568, 390x844 passed with one and 18 discards per player; hands, river directions/order, non-overlap, dora/CPU/hand size equality, 44px controls, and horizontal overflow checked.
- Atomic privacy snapshot at 390x844: no hidden physical IDs in DOM attributes or text at initial state or after a human discard and CPU progression.
- Representative 1280x800 18-river screenshot: `1280x800-rivers18.png`.

These checks are a focused integration gate, not the final regression suite. iPhone Safari and full browser regressions were not run.
