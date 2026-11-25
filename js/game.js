// PolyGlance — the "Your board" maths for the browser face.
// Pure functions, no DOM — tested in Node by tests/game.test.js.
//
// Every number on the board is derived from state the app already
// tracks: the watchlist, the alerts, the alert hits counted when the
// core's alert queue grows, and the paper book valued at live prices.
// Nothing here invents a stat; the board shows its own working.

export const POINTS = { watch: 10, alert: 15, hit: 25 };

export const LEVELS = [
  { at: 0, name: 'First glance' },
  { at: 40, name: 'Watcher' },
  { at: 100, name: 'Line setter' },
  { at: 200, name: 'Regular' },
  { at: 400, name: 'Sharp eyes' },
  { at: 800, name: 'Market hawk' },
];

// Score = 10 per watched market + 15 per alert set + 25 per alert hit
// + paper P&L in whole dollars (it can pull the score down; the score
// itself never goes below zero).
export function scoreFor({ watched = 0, alerts = 0, alertHits = 0, pnl = 0 } = {}) {
  const raw = watched * POINTS.watch
    + alerts * POINTS.alert
    + alertHits * POINTS.hit
    + Math.round(Number.isFinite(pnl) ? pnl : 0);
  return Math.max(0, raw);
}

// The level a score sits in, the next one, and progress toward it (0..1).
export function levelFor(score) {
  let current = LEVELS[0];
  let next = null;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (score >= LEVELS[i].at) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
    }
  }
  const progress = next
    ? Math.min(1, Math.max(0, (score - current.at) / (next.at - current.at)))
    : 1;
  return { name: current.name, at: current.at, next, progress };
}

// The user's own paper positions ranked by P&L at current prices —
// the "top calls" board. Positions whose market has left the feed are
// skipped (their P&L cannot be stated honestly without a price).
export function topCalls(book, marketById, n = 3) {
  const rows = [];
  for (const pos of book.positionList()) {
    const m = marketById.get(pos.marketId);
    const price = m?.prices?.[pos.outcomeIndex];
    if (!m || !Number.isFinite(price)) continue;
    const value = pos.shares * price;
    rows.push({
      question: m.question,
      outcome: m.outcomes[pos.outcomeIndex],
      pnl: value - pos.cost,
      price,
    });
  }
  rows.sort((a, b) => b.pnl - a.pnl);
  return rows.slice(0, n);
}
