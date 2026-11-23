# Ideation — Heads Up: Even Realities (DoraHacks)

Event verified 23 Nov 2026 from the official page: https://dorahacks.io/hackathon/even-realities/detail

## What the event actually is
Build a web app for the Even Realities G2 smart glasses, through the Even Hub SDK, tested in the free official simulator (no hardware needed). The G2 shows one glanceable thing on a 576×288 monochrome green display; input is touch on the frame, the R1 ring, and voice (bring your own speech-to-text). Judges say it plainly: "read and write" — see one thing that matters, act on it in seconds — "is what we judge first."

- Tracks: 01 Messaging & News (Telegram, Discord, Slack) · 02 Crypto & DeFi (Gram Wallet, Polymarket, Hyperliquid, Trust Wallet) · 03 Exchanges & Stocks (Binance, OKX, Bybit, Coinbase, Interactive Brokers) · 04 AI Assistants & Work (Claude, ChatGPT, OpenRouter, Notion, Google Workspace). Special prize: Best Telegram integration, $1,000.
- Prizes: $10,000 USDT total — Grand $2,000; track 1st $1,250 ×4; track 2nd $375 ×4; Best Telegram $1,000; Community Partner up to $500; plus up to 10 pairs of G2. One cash prize per project. Paid in USDT within 7 days of Demo Day (3 Dec 2026, Dubai, remote demo allowed).
- Eligibility: teams of 1–4, anywhere in the world, free entry. Solo is fine. Deadline 29 Nov 23:59 Dubai time = 30 Nov 01:29 IST.
- Submission: public repo + README (setup, and what existed before 23 Nov), demo video up to 3 minutes running in the simulator or on G2, short description, up to 5 feature requests for the APIs used. Optional .ehpk package.
- Rules that shape the build: build during the hackathon; use only the apps listed in the tracks you enter; money safety — testnet, paper trading or read-only data only, no holding user funds, no financial advice, no secrets in code.
- Judging: Usefulness on G2 25% · Read and write 20% · Technical execution 20% ("works end to end on real accounts and data, not mocks") · UX for display and voice 15% · Business potential and safety 20%.

## The problem space
Prediction markets move all day, and the people who follow them check their phones dozens of times for a number that fits in one line: "62%, up 3 today." A phone forces an unlock, an app, a feed, a scroll — for one number. On glasses, that number is a glance, and the follow-up action (watch it, paper-bet it, get told when it crosses a line) is one tap. That is the exact shape the G2 was built for, and the exact shape the brief asks for.

## Concepts considered
- **A. PolyGlance — Polymarket at a glance (Track 02).** Live odds from Polymarket's public Gamma API (no key, CORS open — verified 23 Nov). Glance screen cycles the markets you watch; tap opens the detail; a paper bet is confirmed with one more tap; threshold alerts fire on the glasses while the app is open. Paper trading is explicitly allowed by the rules, so the write path is real without touching anyone's money.
- **B. PositionPeek — Hyperliquid positions (Track 02).** Read-only live positions and PnL for a wallet address. Real data, but the demo depends on finding an address with live positions, and the only write actions are alerts — a weaker read-and-write loop.
- **C. TapeWatch — exchange ticker (Track 03).** Coinbase/Binance public prices with paper confirm actions. Real data and easy to build, but a price ticker is the most obvious glasses app there is; little to choose it by.
- **D. Inbox30 — Gmail triage brief (Track 04).** The brief's own example, but Google sign-in does not work in the WebView and a real inbox needs a paired backend with the user's credentials. In this build window the inbox would have to be mocked — and the judging criteria punish mocks by name.
- **E. ChanDigest — Telegram digest with AI-drafted replies (Track 01 + Telegram prize).** The flagship example in the brief, but real Telegram data needs a bot token or a user session — a credential step only the user can do. Without it, the digest is invented data. Parked, honestly, for the same reason as D.

## Scorecard (1–5 per row)
| Concept | Judge fit (usefulness + read/write) | Real data, no mocks | Buildable by 29 Nov | Demo strength | Safety / business | Total |
|---|---|---|---|---|---|---|
| A. PolyGlance | 5 | 5 | 5 | 5 | 5 | **25** |
| B. PositionPeek | 4 | 4 | 4 | 3 | 5 | 20 |
| C. TapeWatch | 3 | 5 | 5 | 3 | 4 | 20 |
| E. ChanDigest | 5 | 1 | 2 | 4 | 3 | 15 |
| D. Inbox30 | 4 | 1 | 2 | 3 | 3 | 13 |

## Decision
**PolyGlance**, Track 02 (Crypto & DeFi), Polymarket only. It is the one concept where every judging line can be answered with something real: live data with no key and no mock, a one-tap write (paper bet, watch, alert), a display that is the product's natural size, and a money story that is safe by design — paper only, stated on screen.
