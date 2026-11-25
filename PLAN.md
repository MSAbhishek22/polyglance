# Plan — PolyGlance

**One line:** Polymarket odds on Even G2 — glance at the number, act on it in one tap, paper money only.

**Track:** 02 · Crypto & DeFi (Polymarket). **Event:** Heads Up: Even Realities, DoraHacks. **Deadline:** 30 Nov 2026, 01:29 IST.

## The product
A web app with two faces that share one brain:
1. **On G2 (through the Even Hub SDK):** text containers on the 576×288 display. Screens: Glance (your watched markets + top movers, one line each) → Detail (question, live %, today's move, volume, end date) → Bet (paper bet, one tap to confirm) → Positions (paper positions at live prices, P&L) → Alert (a watched market crosses your line — takes over the screen while the app is open).
2. **In a browser (the demo face):** a landing page — hero, problem, solution, the app, outcome — with a working simulator in the middle: the same 576×288 display, the same screens, driven by buttons that stand in for frame taps and ring scrolls, and voice commands (Web Speech API where the browser allows it; the same commands as clickable chips everywhere else).

One core (`js/core.js`) holds the data shapes, the screen state machine and the paper-money maths. It renders "display lines" — plain text — that both faces consume: the SDK adapter sends them to the glasses, the simulator draws them on the page. The core is tested in Node with no DOM.

## Data
Polymarket Gamma API (`https://gamma-api.polymarket.com/markets`), public, no key, CORS open. Fields used: question, outcomes, outcomePrices, volume24hr, oneDayPriceChange, lastTradePrice, endDate, slug, id. Refresh every 30 s while open. If the fetch fails, the display says so and keeps the last good numbers with their time — it never invents a number.

## Money rules (event rules, kept on screen)
Paper balance $1,000, labelled paper everywhere. A paper bet buys shares at the live price; positions revalue at live prices; P&L is arithmetic, shown to the cent. No real orders, no wallet, no advice — the footer and the bet screen both say so.

## Build order
- [x] Event verified, ideation scored, design constitution written (23 Nov)
- [x] Core logic + Node tests — 16/16 pass (parse, format, paper portfolio, alerts, state machine)
- [x] Browser face: landing + simulator + controls + voice
- [x] Even Hub adapter (vendored SDK, guarded) + app.json — container construction validated with the SDK's own validator; live-host run still owed (official simulator needs libwebkit2gtk-4.1, unavailable on the VM)
- [x] Local QA: every control exercised — Playwright 19/19, 0 console errors, screenshots in qa/
- [x] Local git repo committed (a458ab0) — push waits on repo creation: connector create_repository returned 403 (same as GeoRaksha); the repo `polyglance` must be created empty at github.com/new in the user's signed-in browser, then push via connector + enable Pages (main / root)
- [x] Live verification as a signed-out stranger (23 Nov, after the fix push): 13/13 live checks — served core.js byte-identical to the fix, alert row visible-when-selected on a two-line-question market, selection stayed on the same market across a real re-sort; see demo-video/RECORD_NOTES.md
- [x] Demo video recorded from the live deployment, in the simulator face (23 Nov): demo-video/polyglance-demo.mp4, 56.8s of the ≤3 min limit, local only — not uploaded or published
- [x] Submission pack for DoraHacks (description + 5 feature requests already drafted in README) — FILED 23 Nov 2026: BUIDL https://dorahacks.io/build/51690, Under Review; demo video PUBLIC https://www.youtube.com/watch?v=IU8VkeIynHk; ledger entry 55
- [x] Telegram alert watcher (25 Nov, after organiser feedback that in-app alerts die with the app): `watcher/` — long-poll bot (/start, /alert, /list, /remove, /help), Gamma price checks every 60 s, fires once per crossing and re-arms on the cross back, alerts in gitignored `watcher/alerts.json`, token only from `POLYGLANCE_BOT_TOKEN`. App panel builds the exact /alert command to copy; bot deep link appears only when `BOT_USERNAME` is set in js/telegram.js. Node tests 17/17 (fake clients, no network). Still owed by the user: create the bot with BotFather, set the token, run the watcher, set BOT_USERNAME — steps in README
- [x] Richer web face (25 Nov): hero scene rebuilt in the G2 palette (black-green, phosphor green, amber for alerts only) — wireframe odds terrain, lens ring, amber beacon, six orbs fed by the live fetch (top-6 by volume, height = Yes price, biggest mover turns amber); "Your board" gamification wired to real state only (score = 10/watch + 15/alert + 25/hit + paper P&L, levels, hit counter, top calls from the paper book; persisted with the session, resets with the book); scroll reveal + hero type rise, transform/opacity only, low-motion safe. Node tests 38/38 total (16 core + 17 watcher + 5 game), browser QA 44/44

## Risks, stated plainly
- The vendored SDK's bridge only truly connects inside the Even App or the official simulator; in a plain browser the adapter must detect that and step aside within ~1.2 s. The fallback is a designed mode, not an error.
- Gamma API field names can drift; the parser is defensive and the tests pin the current shape from a recorded real response (fixture, tests only).
