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
- [ ] Live verification as a signed-out stranger (after the push)
- [ ] Demo video (≤3 min) recorded from the live deployment, in the simulator face (after live verification)
- [ ] Submission pack for DoraHacks (description + 5 feature requests already drafted in README) — filing after review

## Risks, stated plainly
- The vendored SDK's bridge only truly connects inside the Even App or the official simulator; in a plain browser the adapter must detect that and step aside within ~1.2 s. The fallback is a designed mode, not an error.
- Gamma API field names can drift; the parser is defensive and the tests pin the current shape from a recorded real response (fixture, tests only).
