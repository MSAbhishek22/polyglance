# Interaction Inventory — PolyGlance

Every visible control, what it does, and how it was verified.
Browser QA: `qa/run_qa.py` (Playwright, real clicks/keys) — **34/34 passed, 0 console errors**, 23 Nov 2026 against the local build (live Polymarket data for the main flow; the recorded fixture, served through request interception, for the deterministic re-sort and alert-row checks). Live-deployment verification is still owed (see PLAN.md) and this file gets a dated addendum then.

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

## Fix addendum — 23 Nov 2026 (two live-verification findings)

Both findings came from the live-deployment check of https://msabhishek22.github.io/polyglance/ and were reproduced locally in `qa/run_qa.py` before any code changed (pre-fix run: the 10 new checks below failed; post-fix: 34/34, Node tests still 16/16).

1. **Alert row missing on most detail screens.** `renderDetail()` composes question + outcomes + stats + 5 action rows = 9–11 lines, but the display body holds 8 and `render()` sliced from the top, so the alert row (line 9 or lower whenever the question wraps to 2+ lines — most real markets) was never rendered, even when the cursor sat on it. Fixed in `js/core.js`: screens now window their lines around the selected line (`windowLines`), so every detail row — alert included — is visible when selected, on every market. The alert row also shows its true state now: "Set a price alert" when none exists, "Alert on Yes ≥ 23%" (the real trigger) when one does; tapping a set alert explains instead of re-offering "set".
2. **Selection drifted across refreshes.** The cursor was a bare row index, and `setMarkets()` only range-clamped it, so when the 30 s refresh re-sorted the feed, the highlight — and the market a tap opened — silently became whatever landed at the old index. Fixed in `js/core.js`: `setMarkets()` anchors the selection to the highlighted market's id before swapping the list and re-resolves the cursor to that id afterwards. **If the selected market is gone from the new list, the selection falls back to the first row** (verified by QA: fixture variant with the selected market removed leaves the first row selected).

New QA checks covering both: fixture feed loads · selection survives a re-sort · re-sort really moved the market · missing-market fallback to first row · alert row reachable / selectable / tappable on a long-question market · alert row shows set state on revisit · alert row shows not-set state on a fresh market.
