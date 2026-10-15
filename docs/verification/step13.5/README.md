# Step 13.5 verification — 2026-10-15

Base: `e1d047e68c7b6533036348ecae4cedc670f10d70` (remote main confirmed before work).

- npm ci: passed with writable `/workspace/.npm-cache`.
- npm test: 39 files passed.
- node --test --test-isolation=none tests/*.test.ts: 954 passed, 0 failed/skipped (905 existing + 49 kan cases).
- Build and git diff --check: passed.
- Step 13.5 kan Chromium: 320×568, 375×667, 390×844, 414×896, 1280×800, 375×547, 390×724, 430×844; independent visualViewport shrinking to 380px with offset 24px: passed.
- Existing Chromium regressions: browser-step13-4, browser-call-viewport (320/375/390/430px and independent visualViewport changes), browser-action-controls, browser-riichi, browser-cpu-riichi: passed. Final combined log: browser-regressions-final.txt.
- No JavaScript errors, horizontal scrolling or table/action overlap in the tested scenarios. Touch controls >=44px. Modal scrolling, public indicators, hidden CPU hands and dead-wall information checked.
- Screenshots: ../../screenshots/step13.5/ (396 PNGs, historical Step directories preserved).
- Visual inspection: 320px kan choices/four seats, 390px rinshan result/chankan result; no overlap observed.
- iPhone Safari hardware: untested. Check tap/cancel, red tile selection, robbery decisions, rotation/address-bar resizing, safe area, VoiceOver focus and labels, modal scrolling/fixed footer.

Four distributed kans abort immediately upon confirmation, before win/discard decisions. The fourth rinshan transfer and tail replenishment are atomic with confirmation; no win on that tile. No noten payments, deposits carried, dealer repeats, honba +1. One player's fourth kan continues.

The existing browser expectations now distinguish double riichi (2 han), its immediate ippatsu ron (3 yaku han), and explicitly constructed ordinary-riichi multi-ron fixtures (1 han). CPU geometry uses document scrolling, consistent with the in-flow panel introduced in Step 13.4.

## Changed implementation and test files

- `README.md`
- `index.html`
- `src/analysis/fu.ts`
- `src/analysis/winning-shape.ts`
- `src/analysis/yaku.ts`
- `src/game/automatic-turns.ts`
- `src/game/calls.ts`
- `src/game/cpu.ts`
- `src/game/deal.ts`
- `src/game/dora.ts`
- `src/game/kan.ts`
- `src/game/match.ts`
- `src/game/melds.ts`
- `src/game/riichi.ts`
- `src/game/ron.ts`
- `src/game/tsumo.ts`
- `src/game/win.ts`
- `src/main.ts`
- `src/model/game.ts`
- `src/model/match.ts`
- `src/rendering/match.ts`
- `src/rendering/table.ts`
- `src/style.css`
- `src/ui/call-viewport.ts`
- `src/ui/controller.ts`
- `src/ui/result-dialog.ts`
- `tests/browser-action-controls.py`
- `tests/browser-call-viewport.py`
- `tests/browser-cpu-riichi.py`
- `tests/browser-riichi.py`
- `tests/browser-step13-5.py`
- `tests/call-options.test.ts`
- `tests/discard.test.ts`
- `tests/helpers.ts`
- `tests/kan-fixture.ts`
- `tests/kan.test.ts`
- `tests/run-step13-5-regressions.py`
- `tests/turns.test.ts`
