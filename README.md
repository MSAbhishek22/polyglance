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
- **Watch + alerts** — watch a market, set a price line in one tap; when the market crosses it while the app is open, the alert takes over the display. For when the app is closed, the Telegram watcher (below) checks the same lines and messages you instead.
- **Voice** — "next", "open", "watch this", "bet ten on yes", "positions", "back" — one parser serves real speech (Web Speech API) and the on-screen command chips, so both paths do the same thing.
- **Your board** (browser face) — a watcher score, levels, an alert-hit counter and a top-calls list, all computed from your own session: 10 points per watched market, 15 per alert set, 25 per alert that fires, plus your paper P&L in dollars. The board shows its working under the numbers and resets with the paper book. The hero scene is fed by the same live data — the six biggest markets orbit the lens, height is the Yes price, amber is the day's biggest mover.

## How it is built
One core, two faces. `js/core.js` holds the data shapes, the screen state machine and the paper-money maths, and renders plain-text "display lines" sized for the G2 (576 × 288, a few words per screen). Two faces consume those lines:

- **On the glasses** — `js/evenhub.js` loads the real Even Hub SDK (vendored, see below) and, inside the Even App or the official simulator, sends the lines into two text containers (header + body) and maps glasses input events (click, double-click, scroll) onto the same core actions.
- **In a browser** — `index.html` is a landing page (problem → solution → the app → outcome) with a working simulator in the middle: the same display, with buttons standing in for the frame tap and ring scroll.

Data: Polymarket Gamma API (`gamma-api.polymarket.com/markets`), public, no key. If a fetch fails, the display keeps the last good numbers and says so. It never invents a price.

## Telegram alerts — the watcher

The in-app alert has a platform limit: it can only fire while the app is open. The watcher in `watcher/` is the other half. It is a small Node program with no dependencies. It checks your price lines against the same live Polymarket data on a timer and sends you a Telegram message when one is crossed — the app does not need to be open, and neither do the glasses.

You talk to it in Telegram, in plain commands:

- `/start` — say hello; this registers your chat so the watcher knows where to send alerts.
- `/alert <market-slug-or-id> <above|below> <percent>` — e.g. `/alert will-btc-hit-100k above 65`. It confirms with the market's current price.
- `/list` — your alerts, numbered.
- `/remove <number>` — drop one.
- `/help` — the same list, from the bot.

An alert fires once per crossing, then stays quiet until the price crosses back — so a price wobbling around your line does not spam you. Alerts are kept in `watcher/alerts.json` on the machine running the watcher (that file holds Telegram chat ids, so it is gitignored and never committed; `watcher/alerts.example.json` shows the shape).

In the app, the **Telegram alerts** panel under the simulator builds the `/alert` command for the market on screen — open a market, set an alert as usual, and copy the ready-made command instead of typing a long slug by hand.

### Set it up (about five minutes)

1. In Telegram, open **@BotFather** and send `/newbot`. Pick a display name and a username (it must end in `bot`). BotFather replies with a token.
2. Keep the token secret — anyone who has it controls the bot. It goes in an environment variable only, never in code and never in git:
   ```bash
   export POLYGLANCE_BOT_TOKEN=<paste the token BotFather gave you>
   ```
3. Run the watcher on a machine that stays on (a laptop, a small home server — anything with Node 18+):
   ```bash
   node watcher/watcher.js
   ```
   Leave it running. It checks prices every 60 seconds; set `POLYGLANCE_POLL_SECONDS` to change that (minimum 10). Stop it with Ctrl-C.
4. Open your bot in Telegram, send `/start`, then paste an `/alert` command — the app panel copies it for you.
5. Optional, for the app panel's "Open the bot in Telegram" button: put your bot's username (without the @) in `BOT_USERNAME` at the top of `js/telegram.js` and redeploy the site. While that is empty, the button stays hidden — the panel never shows a control that goes nowhere.

The watcher is read-only, like the app: it fetches public prices and sends messages. It never trades and never touches money.

### Who uses this every day

A trader who follows a handful of markets — an election, a rate decision, a launch date — and cannot watch screens all day. She wears the glasses at work, checks the number with a glance when she can, and sets a line for the move she actually cares about. The rest of the day the market is out of sight, which is the point of the glasses; the watcher is what makes that safe, because the one move she named still reaches her phone the minute it happens.

### What makes it stick

The alert reaches you where you already are. A price line set on the glasses in the morning can land as a Telegram message at dinner, with the app closed and the glasses in a case — and the same line, set once, keeps watching for weeks without being re-entered. Add voice for the hands-busy moments and the loop is complete: glance when you can look, get told when you cannot.

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
node tests/core.test.js     # 16 tests, no dependencies
node tests/watcher.test.js  # 17 tests, no dependencies, no network (clients are faked)
node tests/game.test.js     # 5 tests — the board maths (score, levels, top calls)
```
The tests pin the parser to a real Gamma API response recorded on 23 Nov 2026 (`tests/fixture-markets.json` — a test fixture only; the app itself always fetches live) and cover the paper-bet maths, alert crossings, voice commands and the screen state machine, including a check that every screen fits the 576 × 288 display model.

## What existed before 23 Nov 2026
Nothing of PolyGlance. The whole app was designed and built during the hackathon build week. Pre-existing pieces used, all public: the Even Hub SDK (`@evenrealities/even_hub_sdk` v0.0.16, MIT, © Even Realities — vendored unmodified at `vendor/even_hub_sdk.js` with its licence at `vendor/LICENSE-even_hub_sdk.txt`) and Polymarket's public Gamma API.

## Money and safety, plainly
Paper trading only — the event's rules require it and the app is built around it. No wallet, no real orders, no user funds. The one secret in the project is the Telegram bot token, and it lives only in the watcher's environment variable — never in the code, never in git. Prices are market odds, not advice; nothing in PolyGlance is financial advice. Alerts in the app work while it is open; the G2 shows nothing while another app is in front, and the app says so rather than pretending otherwise — the watcher exists for exactly that gap.

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
js/telegram.js      builds the watcher's /alert command for the panel (tested)
js/game.js          the board maths: score, levels, top calls (tested)
watcher/            Telegram alert watcher: bot, Gamma client, crossing logic
vendor/             the Even Hub SDK, vendored unmodified (MIT)
tests/              node tests + recorded API fixture
design/             design constitution
qa/                 interaction inventory
```
