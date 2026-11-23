# Interaction Inventory — PolyGlance

Every visible control, what it does, and how it was verified.
Browser QA: `qa/run_qa.py` (Playwright, real clicks/keys) — **19/19 passed, 0 console errors**, 23 Nov 2026 against the local build with live Polymarket data. Live-deployment verification is still owed (see PLAN.md) and this file gets a dated addendum then.

| Control | Expected behaviour | Status |
|---|---|---|
| ↑ Up / ↓ Down buttons (ring scroll) | Move the selection on the G2 display | PASS — selection visibly moves |
| Tap button (frame tap) | Open the selected market / confirm on the bet screen | PASS — detail opens; bet confirms into Positions |
| Double tap button | Back one screen; on a bet row, steps the bet size $5→$10→$25→$50 | PASS (back) · size-step covered by unit test 13 |
| Voice chips (“next”, “open”, “watch this”, “bet ten on yes”, “positions”, “back”) | Run the same command parser as speech | PASS — watch adds to watchlist; bet chip opens the confirm screen |
| 🎙 Speak button | Real speech recognition where the browser offers it; where it does not, the button disables itself and says to use the chips | PASS — live in Chromium (“Speak”); never a dead control |
| Keyboard ↑ / ↓ / Enter / Backspace | Same actions as scroll / tap / double-tap | PASS — after the focus fix (buttons blur after click so Enter cannot re-fire them) |
| Refresh odds now | Re-fetches the Gamma API; disables itself while fetching | PASS |
| Reset paper book | Asks first (confirm dialog), then clears watchlist, positions and alerts in this browser | PASS |
| Low motion toggle | Stills transitions, the screen-change fade and the hero tilt; pressed state is visible | PASS — flips both ways |
| “Try the simulator” / “How it works” links | Scroll to the app / solution sections | PASS — anchor targets exist and render |
| G2 display itself | Shows header + up to 8 body lines, cursor line highlighted, footer shows source and update time (or the fetch-failed note) | PASS — unit test 15 pins every screen to the 576×288 model |
| Hero tilt (pointer) | The display bezel tilts a few degrees toward the pointer; off for touch and under low motion | PASS by inspection — transform-only, guarded in code |
| Even Hub path (glasses / official simulator) | Creates header+body text containers, upgrades them on state change, maps hub click/double-click/scroll events onto the same actions; steps aside within 1.5 s when no host answers | PARTIAL — container construction validated against the SDK's own `validateEvenHubPageContainer` (valid: true) in Node; no live host available on this VM (the official simulator binary needs libwebkit2gtk-4.1, not installable here). Mode chip honestly reads “Browser simulator” in this state |

Known limits, stated rather than hidden:
- Alerts fire only while the app is open (a G2 platform limit, also stated on the site).
- Speech recognition depends on the browser; the chips are the always-available path.
