# Step 13.5.1 verification

Base: f3e4e82df06e1c5112ae2c369e62fd3f25275196 (origin/main fetched before edits).

- npm ci: success, Node 24.19.0.
- npm test: 975 passed, 0 failed/skipped; 12 new cases.
- node --test --test-isolation=none tests/*.test.ts: 975 passed, 0 failed/skipped.
- npm run build: success (TypeScript and Vite).
- git diff --check: success (empty log).
- browser-kan-page.py: real public verification controls, five viewport sizes; robbery/pass, pending pon vs completed kakan, physical inventory, private hand/draw/dead-wall IDs, reload/new match clearing, 300px simulated visualViewport, button focus and visible controls.
- browser-step13-5.py: eight viewport sizes; kan/rinshan regressions, normal red-five ron and pass, robbery/pass, preview at CPU1/2/3, all four meld directions, next round, 380px simulated visualViewport, 44px targets, no horizontal overflow or JavaScript errors.

Screenshots: ../../screenshots/step13.5.1/. Visually inspected 320px normal ron, public pending preview, simulated visualViewport, CPU2/3 pending previews; corrected the top-seat declaration label to remain upright.

Run the public-page browser check against a fresh Vite dev server (port 4173). During development, HMR module timestamps can cause a plain dynamic import of main.ts in the read-only test helper to refer to a separate controller from the public page. Restarting Vite removes that test-observation mismatch. Privacy state and DOM are captured together to avoid CPU-turn timing races.

No GameState, kan resolution, scoring, ron conditions or physical inventory implementation changed. iPhone Safari hardware and VoiceOver remain untested; check address-bar resizing, safe-area/home indicator, announcement/focus and both public chankan choices on device.

Initial CI run 38911263277 failed an existing randomized reset test: it compared the old game's hidden ura ID against a new game's public indicator, although physical IDs legitimately recur across games. The check now compares with the new game's hidden ura ID. No production behavior changed. Local full tests were rerun after this correction.
