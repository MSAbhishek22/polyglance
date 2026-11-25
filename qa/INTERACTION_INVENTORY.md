# Interaction Inventory — PolyGlance

Every visible control, what it does, and how it was verified.
Browser QA: `qa/run_qa.py` (Playwright, real clicks/keys) — **44/44 passed, 0 console errors**, 25 Nov 2026 against the local build (live Polymarket data for the main flow; the recorded fixture, served through request interception, for the deterministic re-sort, alert-row, panel and board checks). Earlier: 34/34 on 23 Nov 2026; live-deployment verification done 23 Nov (see the fix addendum) and repeated for the 25 Nov push (see the 25 Nov addendum).

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

| Copy Telegram command button | Copies the exact `/alert …` command for the market on screen (open market, else latest alert's market, else biggest by volume); confirms in the status line; falls back to manual selection if the clipboard refuses | PASS — clipboard contents matched the shown command exactly (fixture flow) |
| Telegram panel command text | Follows the app state: shows the set alert's line when one exists, else the line "Set a price alert" would use — same rule as the detail screen | PASS — set-alert command on NVIDIA (above 23) and would-be line on Fed (below 88) both matched |
| "Open the bot in Telegram" link | Appears only when `BOT_USERNAME` is set in `js/telegram.js`; hidden while no bot exists, so it is never a dead control | PASS (hidden state) — shown state follows from the same one-line config and is exercised when the user creates the bot |
| Your board — watcher score / level / progress | Computed from real session state only (10/watch, 15/alert, 25/hit, + paper P&L); breakdown line shows the components; resets with the paper book | PASS — 15 after setting one alert; 40 and level "Watcher" after a forced crossing |
| Your board — alert hits counter | Counts alerts that fired while this browser held them (core alert-queue growth at refresh), persisted with the session | PASS — forced fixture crossing moved it 0 → 1 |
| Your board — top calls | The user's own paper positions ranked by P&L at live prices; honest empty text when there are none | PASS — live flow's placed position listed; unit tests pin the ranking |
| Hero 3D scene | Three.js scene on first load, no interaction: odds terrain, lens ring, amber beacon, six orbs fed by the live fetch (top-6 by volume, height = Yes price, biggest mover amber); pauses off-screen; one static frame under reduced motion | PASS by run + screenshot — hook present, orbs at data-driven heights, 0 console errors |
| Scroll reveal / hero type rise | Sections rise once into view (IntersectionObserver, progressive enhancement); transform/opacity only; cancelled by the low-motion rules | PASS by inspection — same kill-switch CSS as the existing motion |

Known limits, stated rather than hidden:
- Alerts in the app fire only while the app is open (a G2 platform limit, also stated on the site). The watcher covers the closed-app case, but only while the watcher program itself is running on a machine the user keeps on, with a bot the user creates — the repo ships the code, not a hosted service.
- Speech recognition depends on the browser; the chips are the always-available path.

## Fix addendum — 23 Nov 2026 (two live-verification findings)

Both findings came from the live-deployment check of https://msabhishek22.github.io/polyglance/ and were reproduced locally in `qa/run_qa.py` before any code changed (pre-fix run: the 10 new checks below failed; post-fix: 34/34, Node tests still 16/16).

1. **Alert row missing on most detail screens.** `renderDetail()` composes question + outcomes + stats + 5 action rows = 9–11 lines, but the display body holds 8 and `render()` sliced from the top, so the alert row (line 9 or lower whenever the question wraps to 2+ lines — most real markets) was never rendered, even when the cursor sat on it. Fixed in `js/core.js`: screens now window their lines around the selected line (`windowLines`), so every detail row — alert included — is visible when selected, on every market. The alert row also shows its true state now: "Set a price alert" when none exists, "Alert on Yes ≥ 23%" (the real trigger) when one does; tapping a set alert explains instead of re-offering "set".
2. **Selection drifted across refreshes.** The cursor was a bare row index, and `setMarkets()` only range-clamped it, so when the 30 s refresh re-sorted the feed, the highlight — and the market a tap opened — silently became whatever landed at the old index. Fixed in `js/core.js`: `setMarkets()` anchors the selection to the highlighted market's id before swapping the list and re-resolves the cursor to that id afterwards. **If the selected market is gone from the new list, the selection falls back to the first row** (verified by QA: fixture variant with the selected market removed leaves the first row selected).

New QA checks covering both: fixture feed loads · selection survives a re-sort · re-sort really moved the market · missing-market fallback to first row · alert row reachable / selectable / tappable on a long-question market · alert row shows set state on revisit · alert row shows not-set state on a fresh market.

## Addendum — 25 Nov 2026 (Telegram watcher + richer web face)

Prompted by organiser feedback (alerts die with the app) and the user's design direction (richer, gamified, palette-disciplined — not simpler):

1. **Telegram watcher** (`watcher/`, Node, no dependencies): long-polls the Bot API; /start registers a chat, /alert resolves the market on the real Gamma API and stores the line, /list and /remove manage them; a 60 s loop checks prices and sends one message per crossing, re-arming only after the price crosses back — the app's own alert semantics. Token only from `POLYGLANCE_BOT_TOKEN`; a missing token exits with setup steps. `alerts.json` (chat ids) is gitignored. Covered by `tests/watcher.test.js` — 17 tests with fake Telegram/Gamma clients, no network. Not yet run against a real bot: creating one is the user's BotFather step (README has the steps).
2. **Telegram panel** in the app: builds the exact `/alert` command for the market on screen (the set alert's line, else the would-be line) with a working copy button; the bot deep link renders only when `BOT_USERNAME` is set in `js/telegram.js`. Six new QA checks cover it, including an exact clipboard match.
3. **Hero scene rebuilt in palette**: black-green `#050807`, phosphor green `#4dff88`, dim green `#1d5c36`, amber `#ffb224` for the alert accent only (the previous scene's cyan/purple/pink orbs are gone). Wireframe odds terrain + floor, lens ring, breathing amber beacon, six orbs fed by the app's live fetch via `window.PolyGlanceScene.setMarkets` — top-6 by volume, height = Yes price, biggest mover amber. One canvas, pauses off-screen, static frame under reduced motion. Verified by screenshot with live data loaded.
4. **Your board**: score/levels/hit counter/top calls from real session state only (`js/game.js`, 5 unit tests); hits counted where the core's alert queue grows at refresh and persisted with the session; the board resets with the paper book, and its breakdown line shows the components. QA forces a fixture crossing and watches the score move 15 → 40 (level "Watcher") and hits 0 → 1.
5. Scroll reveal (progressive, IO-gated) and a hero type rise — transform/opacity only, both cancelled by the existing low-motion rules.

Totals after this addendum: Node tests 38/38 (16 core + 17 watcher + 5 game); browser QA 44/44, 0 console errors.
