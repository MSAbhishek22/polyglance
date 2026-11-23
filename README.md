# PolyGlance — Polymarket on Even G2

Live Polymarket odds on Even Realities G2 smart glasses. Glance at the number, act on it in one tap. **Paper money only.**

Built for **Heads Up: Even Realities** (DoraHacks) — Track 02 · Crypto & DeFi.
Event: https://dorahacks.io/hackathon/even-realities/detail

## The problem, in one breath
A prediction-market price is one line of text, but checking it on a phone takes an unlock, an app, a feed and a scroll — so most checks never happen, and acting on a move is slower still. PolyGlance puts the number on the glasses you already wear, and the action one tap behind it.

## What it does
- **Glance** — your watched markets and the day's biggest movers, one line each: price, today's move, question. Live from Polymarket, refreshed every 30 seconds.
- **Detail** — one tap opens a market: both outcomes at live prices, today's move, 24-hour volume, end date.
- **Paper bet** — one more tap places a paper bet at the live price ($5 / $10 / $25 / $50, stepped with a double-tap). Positions revalue at live prices; P&L is plain arithmetic.
- **Watch + alerts** — watch a market, set a price line in one tap; when the market crosses it while the app is open, the alert takes over the display.
- **Voice** — "next", "open", "watch this", "bet ten on yes", "positions", "back" — one parser serves real speech (Web Speech API) and the on-screen command chips, so both paths do the same thing.

## How it is built
One core, two faces. `js/core.js` holds the data shapes, the screen state machine and the paper-money maths, and renders plain-text "display lines" sized for the G2 (576 × 288, a few words per screen). Two faces consume those lines:

- **On the glasses** — `js/evenhub.js` loads the real Even Hub SDK (vendored, see below) and, inside the Even App or the official simulator, sends the lines into two text containers (header + body) and maps glasses input events (click, double-click, scroll) onto the same core actions.
- **In a browser** — `index.html` is a landing page (problem → solution → the app → outcome) with a working simulator in the middle: the same display, with buttons standing in for the frame tap and ring scroll.

Data: Polymarket Gamma API (`gamma-api.polymarket.com/markets`), public, no key. If a fetch fails, the display keeps the last good numbers and says so. It never invents a price.

## Run it
It is a static site — no build step.

```bash
# any static server, e.g.
python3 -m http.server 5173
# open http://localhost:5173
```

**In the official Even Hub simulator** (renders the real glasses path):

```bash
npm install -g @evenrealities/evenhub-simulator
evenhub-simulator http://localhost:5173
```

**On real G2 glasses:** serve the folder on your network, then use the Even Hub QR sideload flow from the official docs (https://hub.evenrealities.com/docs).

## Tests
```bash
node tests/core.test.js   # 16 tests, no dependencies
```
The tests pin the parser to a real Gamma API response recorded on 23 Nov 2026 (`tests/fixture-markets.json` — a test fixture only; the app itself always fetches live) and cover the paper-bet maths, alert crossings, voice commands and the screen state machine, including a check that every screen fits the 576 × 288 display model.

## What existed before 23 Nov 2026
Nothing of PolyGlance. The whole app was designed and built during the hackathon build week. Pre-existing pieces used, all public: the Even Hub SDK (`@evenrealities/even_hub_sdk` v0.0.16, MIT, © Even Realities — vendored unmodified at `vendor/even_hub_sdk.js` with its licence at `vendor/LICENSE-even_hub_sdk.txt`) and Polymarket's public Gamma API.

## Money and safety, plainly
Paper trading only — the event's rules require it and the app is built around it. No wallet, no real orders, no user funds, no keys anywhere in the code. Prices are market odds, not advice; nothing in PolyGlance is financial advice. Alerts work while the app is open; the G2 shows nothing while another app is in front, and the app says so rather than pretending otherwise.

## Feature requests for the APIs used (for the organisers)
1. **Gamma API:** a `min_volume24hr` filter server-side, so glasses clients do not have to download and discard thin markets.
2. **Gamma API:** a lightweight `/markets/glance` shape — id, question, outcome prices, 24h change — without the full description text; the current payload is heavy for a Bluetooth-fed glance client.
3. **Gamma API:** a websocket or long-poll change feed for watched markets, so alert checks do not need 30-second polling.
4. **Even Hub SDK:** a documented way to detect "running in a plain browser" — today `waitForEvenAppBridge()` must be raced against a timeout to find out.
5. **Even Hub SDK:** one more text container (5 instead of 4) would let a header, body and a persistent status line coexist without squeezing the body.

## Layout
```
index.html          landing page + simulator (the Even Hub entrypoint)
app.json            Even Hub manifest
css/styles.css      phosphor-terminal styling
js/core.js          data shapes, state machine, paper maths (tested)
js/data.js          Gamma API fetch
js/app.js           browser face: rendering, controls, voice, storage
js/evenhub.js       Even Hub SDK adapter (glasses face)
vendor/             the Even Hub SDK, vendored unmodified (MIT)
tests/              node tests + recorded API fixture
design/             design constitution
qa/                 interaction inventory
```
