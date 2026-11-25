// PolyGlance — Telegram alert helpers for the browser face.
// Pure functions, no DOM, no network — tested in Node by tests/watcher.test.js.
//
// The watcher bot (watcher/) understands one command shape:
//   /alert <market-slug-or-id> <above|below> <price-percent>
// This module builds that exact text for the market on screen, so the user
// copies it instead of typing a long market slug by hand.

import { makeAlert, fmtPct } from './core.js';

// The ONE place the bot's username is set. Create the bot with BotFather
// (steps in the README), then put its username here, without the @ — the
// "Open the bot in Telegram" link in the panel appears only while this is
// non-empty, so the panel never shows a control that goes nowhere.
export const BOT_USERNAME = 'PolyGlanceAlertsBot';

export function botLink() {
  return BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : '';
}

// The alert the panel offers for a market: the one already set on it when
// there is one (the app keeps at most one per market, on the first
// outcome), otherwise the line the app would set if the user tapped
// "Set a price alert" now — the same rule the detail screen uses.
export function panelAlert(market, alerts = []) {
  if (!market) return null;
  const existing = alerts.find((a) => a && a.marketId === market.id && a.outcomeIndex === 0);
  if (existing) return { threshold: existing.threshold, dir: existing.dir, alreadySet: true };
  const made = makeAlert(market, 0);
  return { threshold: made.threshold, dir: made.dir, alreadySet: false };
}

// The exact text to paste to the bot, e.g.
//   /alert will-btc-hit-100k above 65
// Uses the market slug (what a person recognises); falls back to the id.
export function alertCommandText(market, alerts = []) {
  const a = panelAlert(market, alerts);
  if (!a) return '';
  const ref = market.slug || market.id;
  if (!ref) return '';
  return `/alert ${ref} ${a.dir} ${Math.round(a.threshold * 100)}`;
}

// The same alert in plain words, e.g. "Yes above 65%".
export function alertSummary(market, alerts = []) {
  const a = panelAlert(market, alerts);
  if (!a || !market.outcomes || !market.outcomes[0]) return '';
  return `${market.outcomes[0]} ${a.dir} ${fmtPct(a.threshold)}`;
}
