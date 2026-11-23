# AGENTS.md — PolyGlance (Heads Up: Even Realities)

Read this first, then `IDEATION.md`, `PLAN.md` and `design/DESIGN_CONSTITUTION.md`.

## Governing rules
- ABHI_22 Unified Master Blueprint v2.0 (~/workspace/abhi_22/ABHI_22_UNIFIED_MASTER_BLUEPRINT.md) governs: truth over claims, no fabrication, release gates in Part V.
- The event's own rules outrank everything else: build during the hackathon (from 23 Nov 2026), only apps listed in the entered track (Polymarket — Track 02 Crypto & DeFi), money safety = paper trading / read-only data only, no user funds, no financial advice, never commit secrets.
- Human-tone rule: plain words, short sentences, no marketing/AI hype words, in the site copy, README and submission text.

## Hard project rules
- The app must work on REAL Polymarket data (Gamma API, public, no key). No mock market data anywhere in the product. Test fixtures live only in `tests/` and are labelled as fixtures.
- Paper money is labelled "paper" everywhere it appears. A paper bet is never worded as a real bet.
- Every visible control must work or be removed. Keep `qa/INTERACTION_INVENTORY.md` current.
- Never edit a test to make it pass. Fix the code or report the failure.
- The G2 display model is the product: 576×288, monochrome, a few words per screen. The landing page exists to present it, not to replace it.
- Even Hub SDK is vendored at `vendor/even_hub_sdk.js` (MIT, © Even Realities) — do not modify the vendored file.

## State of the build
- Status lives in `PLAN.md` (checkboxes) and the submission ledger — update both when something changes state.
