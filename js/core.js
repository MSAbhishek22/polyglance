// PolyGlance core — pure logic, no DOM, no network.
// Shared by the browser simulator (js/app.js) and the Even Hub adapter
// (js/evenhub.js). Tested in Node by tests/core.test.js.

export const DISPLAY_WIDTH = 44; // characters per line on the G2 display model
export const BODY_LINES = 8;     // body lines under the header line
export const BET_SIZES = [5, 10, 25, 50];
export const START_BALANCE = 1000;

// ---------- parsing ----------

function toFloat(v, fallback = NaN) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : null; } catch { return null; }
  }
  return null;
}

// Turn one raw Gamma API market object into a clean Market, or null when the
// market cannot be shown honestly (missing question, outcomes or prices).
export function parseMarket(raw) {
  if (!raw || typeof raw.question !== 'string' || !raw.question.trim()) return null;
  const outcomes = parseJsonArray(raw.outcomes);
  const pricesRaw = parseJsonArray(raw.outcomePrices);
  if (!outcomes || !pricesRaw || outcomes.length < 2 || pricesRaw.length !== outcomes.length) return null;
  const prices = pricesRaw.map((p) => toFloat(p));
  if (prices.some((p) => !Number.isFinite(p) || p < 0 || p > 1)) return null;
  return {
    id: String(raw.id ?? raw.slug ?? raw.question),
    slug: typeof raw.slug === 'string' ? raw.slug : '',
    question: raw.question.trim(),
    outcomes: outcomes.map(String),
    prices,
    volume24hr: toFloat(raw.volume24hr, 0),
    oneDayChange: toFloat(raw.oneDayPriceChange, 0), // fraction: 0.09 = +9 points
    lastPrice: toFloat(raw.lastTradePrice, prices[0]),
    endDate: typeof raw.endDate === 'string' ? raw.endDate : '',
  };
}

export function parseMarkets(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of rawArray) {
    const m = parseMarket(raw);
    if (m && !seen.has(m.id)) { seen.add(m.id); out.push(m); }
  }
  return out;
}

export function topByVolume(markets, n) {
  return [...markets].sort((a, b) => b.volume24hr - a.volume24hr).slice(0, n);
}

export function topMovers(markets, n) {
  return [...markets]
    .filter((m) => m.oneDayChange !== 0)
    .sort((a, b) => Math.abs(b.oneDayChange) - Math.abs(a.oneDayChange))
    .slice(0, n);
}

// ---------- formatting ----------

export function fmtPct(p) { return `${Math.round(p * 100)}%`; }

export function fmtChange(frac) {
  const pts = frac * 100;
  const arrow = pts > 0 ? '▲' : pts < 0 ? '▼' : '·';
  return `${arrow}${Math.abs(pts).toFixed(1)}`;
}

export function fmtMoney(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
}

// The body holds BODY_LINES lines. When a screen composes more than that,
// window the lines so the selected line is always on the display — a
// control the user cannot see might as well not exist. The window keeps
// the top of the screen in view until the selection moves deep enough
// that it has to follow.
export function windowLines(lines, selectedIdx) {
  if (lines.length <= BODY_LINES) return lines;
  const maxStart = lines.length - BODY_LINES;
  const start = Math.min(Math.max(0, selectedIdx - (BODY_LINES - 2)), maxStart);
  return lines.slice(start, start + BODY_LINES);
}

export function wrapText(s, width) {
  const words = String(s).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (w.length > width) {
      if (line) { lines.push(line); line = ''; }
      for (let i = 0; i < w.length; i += width) lines.push(w.slice(i, i + width));
      continue;
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- paper portfolio ----------
// Paper money only. A position is keyed by market id + outcome index.

export class PaperBook {
  constructor(balance = START_BALANCE) {
    this.balance = balance;
    this.positions = new Map(); // key -> {marketId, outcomeIndex, shares, cost}
  }

  static key(marketId, outcomeIndex) { return `${marketId}::${outcomeIndex}`; }

  // Buy `dollars` of an outcome at its live price. Returns a receipt or
  // {error}. Never lets the balance go negative.
  buy(market, outcomeIndex, dollars) {
    const price = market?.prices?.[outcomeIndex];
    if (!Number.isFinite(price) || price <= 0 || price >= 1) {
      return { error: 'That outcome cannot be bought right now.' };
    }
    if (!(dollars > 0)) return { error: 'Pick an amount first.' };
    if (dollars > this.balance) return { error: 'Not enough paper balance.' };
    const shares = dollars / price;
    const key = PaperBook.key(market.id, outcomeIndex);
    const prev = this.positions.get(key);
    if (prev) { prev.shares += shares; prev.cost += dollars; }
    else this.positions.set(key, { marketId: market.id, outcomeIndex, shares, cost: dollars });
    this.balance -= dollars;
    return { shares, price, dollars };
  }

  positionList() { return [...this.positions.values()]; }

  // Value every position at the current prices of the given market map.
  value(marketById) {
    let value = 0, cost = 0, missing = 0;
    for (const pos of this.positions.values()) {
      cost += pos.cost;
      const m = marketById.get(pos.marketId);
      const price = m?.prices?.[pos.outcomeIndex];
      if (Number.isFinite(price)) value += pos.shares * price;
      else missing += 1;
    }
    return { value, cost, pnl: value - cost, missing };
  }

  toJSON() {
    return { balance: this.balance, positions: this.positionList() };
  }

  static fromJSON(json) {
    const book = new PaperBook(START_BALANCE);
    if (!json || typeof json !== 'object') return book;
    if (Number.isFinite(json.balance) && json.balance >= 0) book.balance = json.balance;
    if (Array.isArray(json.positions)) {
      for (const p of json.positions) {
        if (p && typeof p.marketId === 'string' && Number.isFinite(p.outcomeIndex)
          && Number.isFinite(p.shares) && p.shares > 0 && Number.isFinite(p.cost)) {
          book.positions.set(PaperBook.key(p.marketId, p.outcomeIndex), {
            marketId: p.marketId, outcomeIndex: p.outcomeIndex, shares: p.shares, cost: p.cost,
          });
        }
      }
    }
    return book;
  }
}

// ---------- alerts ----------
// A watch alert: fire once when the price crosses the threshold, then stay
// quiet until the price crosses back (so it can fire again later).

export function makeAlert(market, outcomeIndex) {
  const price = market.prices[outcomeIndex];
  const dir = price <= 0.9 ? 'above' : 'below';
  const raw = dir === 'above' ? price + 0.05 : price - 0.05;
  const threshold = Math.min(0.99, Math.max(0.01, Math.round(raw * 100) / 100));
  return {
    marketId: market.id, outcomeIndex, threshold, dir,
    armed: true, lastPrice: price,
  };
}

// Returns the list of alerts that fired on this price update (mutates armed).
export function checkAlerts(alerts, marketById) {
  const fired = [];
  for (const a of alerts) {
    const m = marketById.get(a.marketId);
    const price = m?.prices?.[a.outcomeIndex];
    if (!Number.isFinite(price)) continue;
    const crossed = a.dir === 'above' ? price >= a.threshold : price <= a.threshold;
    if (a.armed && crossed) { a.armed = false; fired.push({ alert: a, market: m, price }); }
    else if (!a.armed && !crossed) { a.armed = true; }
    a.lastPrice = price;
  }
  return fired;
}

// ---------- voice / command parsing ----------
// The same parser serves real speech (Web Speech API) and the on-screen
// command chips, so both paths do exactly the same thing.

export function parseCommand(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return null;
  if (/\b(back|go back|return)\b/.test(t)) return { type: 'back' };
  if (/\b(positions?|portfolio|my bets)\b/.test(t)) return { type: 'positions' };
  if (/\bwatch( this)?\b/.test(t)) return { type: 'watch' };
  const bet = t.match(/bet\s+(?:\$?\s*)?(\d+|five|ten|twenty[ -]?five|fifty)?\s*(?:dollars?\s+)?on\s+(yes|no)\b/);
  if (bet) {
    const words = { five: 5, ten: 10, 'twenty-five': 25, 'twenty five': 25, fifty: 50 };
    const rawAmt = (bet[1] || '').replace(/\s+/g, ' ').trim();
    const amount = /^\d+$/.test(rawAmt) ? parseInt(rawAmt, 10) : (words[rawAmt] ?? 10);
    return { type: 'bet', outcome: bet[2] === 'yes' ? 0 : 1, amount: BET_SIZES.includes(amount) ? amount : 10 };
  }
  if (/\b(next|down|scroll)\b/.test(t)) return { type: 'scrollDown' };
  if (/\b(up|previous)\b/.test(t)) return { type: 'scrollUp' };
  if (/\b(open|select|show|read)\b/.test(t)) return { type: 'open' };
  if (/\b(confirm|yes|place it)\b/.test(t)) return { type: 'confirm' };
  return null;
}

// ---------- the glance state machine ----------
// Screens: glance -> detail -> bet (confirm) ; glance -> positions ;
// alert can take over from anywhere while the app is open.

export class GlanceApp {
  constructor() {
    this.markets = [];
    this.marketById = new Map();
    this.watchlist = new Set();
    this.book = new PaperBook();
    this.alerts = [];
    this.screen = 'glance';
    this.cursor = 0;          // index into the current screen's rows
    this.detailId = null;     // market open in detail/bet
    this.betOutcome = 0;
    this.betSizeIndex = 1;    // $10 default
    this.alertQueue = [];     // fired alerts waiting to be seen
    this.notice = '';         // one-line transient message (e.g. bet placed)
    this.updatedAt = null;    // Date of last good fetch
    this.stale = false;
  }

  setMarkets(markets, at = new Date()) {
    // Anchor the selection to a market id before the list changes. A
    // refresh re-sorts the feed, so a bare row index would silently land
    // on a different market; the highlight (and the tap that follows it)
    // must stay on the market the user is actually looking at.
    const anchorRow = this.rows()[this.cursor];
    const anchorId = anchorRow && anchorRow.id ? anchorRow.id : null;
    this.markets = markets;
    this.marketById = new Map(markets.map((m) => [m.id, m]));
    this.updatedAt = at;
    this.stale = false;
    const fired = checkAlerts(this.alerts, this.marketById);
    for (const f of fired) this.alertQueue.push(f);
    if (fired.length && this.screen !== 'alert') this.screen = 'alert';
    this.clampCursor();
    if (anchorId) {
      const idx = this.rows().findIndex((r) => r.id === anchorId);
      // Market gone from the new list: fall back to the first row.
      this.cursor = idx >= 0 ? idx : 0;
    }
  }

  markStale() { this.stale = true; }

  // The glance feed: watched markets first (in feed order), then top movers,
  // then top by volume — de-duplicated, capped.
  feed() {
    const out = [];
    const seen = new Set();
    const push = (m) => { if (m && !seen.has(m.id)) { seen.add(m.id); out.push(m); } };
    for (const m of this.markets) if (this.watchlist.has(m.id)) push(m);
    for (const m of topMovers(this.markets, 6)) push(m);
    for (const m of topByVolume(this.markets, 10)) push(m);
    return out.slice(0, 12);
  }

  detail() { return this.marketById.get(this.detailId) || null; }

  rows() {
    // Selectable rows for the current screen: [{label, action}]
    if (this.screen === 'glance') {
      return this.feed().map((m) => ({ label: m.question, action: 'open', id: m.id }));
    }
    if (this.screen === 'detail') {
      const m = this.detail();
      if (!m) return [];
      const watching = this.watchlist.has(m.id);
      const alert = this.alerts.find((a) => a.marketId === m.id && a.outcomeIndex === 0);
      return [
        { label: watching ? 'Stop watching' : 'Watch this market', action: 'watch' },
        ...m.outcomes.map((name, i) => ({
          label: `Paper bet ${fmtMoney(BET_SIZES[this.betSizeIndex])} on ${truncate(name, 14)}`,
          action: 'bet', outcomeIndex: i,
        })),
        // The alert row states what is true: an existing alert shows its
        // trigger, so the user is never offered "set" for one already set
        // (tapping it explains instead — see addAlert).
        {
          label: alert
            ? `Alert on ${truncate(m.outcomes[0], 12)} ${alert.dir === 'above' ? '≥' : '≤'} ${fmtPct(alert.threshold)}`
            : 'Set a price alert',
          action: 'alert',
        },
        { label: 'My positions', action: 'positions' },
      ];
    }
    if (this.screen === 'positions') {
      return this.book.positionList()
        .filter((p) => this.marketById.has(p.marketId))
        .map((p) => ({ label: this.marketById.get(p.marketId).question, action: 'open', id: p.marketId }));
    }
    return [];
  }

  clampCursor() {
    const n = this.rows().length;
    if (n === 0) this.cursor = 0;
    else this.cursor = Math.min(Math.max(0, this.cursor), n - 1);
  }

  scrollDown() { this.notice = ''; const n = this.rows().length; if (n) this.cursor = (this.cursor + 1) % n; }
  scrollUp() { this.notice = ''; const n = this.rows().length; if (n) this.cursor = (this.cursor - 1 + n) % n; }

  // Frame tap / ring click.
  click() {
    this.notice = '';
    if (this.screen === 'alert') { this.openAlertMarket(); return; }
    if (this.screen === 'bet') { this.confirmBet(); return; }
    const row = this.rows()[this.cursor];
    if (!row) return;
    if (row.action === 'open') {
      this.detailId = row.id; this.screen = 'detail'; this.cursor = 0;
    } else if (row.action === 'watch') {
      this.toggleWatch();
    } else if (row.action === 'bet') {
      this.betOutcome = row.outcomeIndex; this.screen = 'bet';
    } else if (row.action === 'alert') {
      this.addAlert();
    } else if (row.action === 'positions') {
      this.screen = 'positions'; this.cursor = 0;
    }
  }

  // Double tap: back one screen; on detail it also steps the bet size when
  // the cursor sits on a bet row (the quick way to change the amount).
  doubleClick() {
    this.notice = '';
    if (this.screen === 'alert') { this.dismissAlert(); return; }
    if (this.screen === 'bet') { this.screen = 'detail'; return; }
    if (this.screen === 'detail') {
      const row = this.rows()[this.cursor];
      if (row && row.action === 'bet') {
        this.betSizeIndex = (this.betSizeIndex + 1) % BET_SIZES.length;
        return;
      }
      this.screen = 'glance'; this.clampCursor(); return;
    }
    if (this.screen === 'positions') { this.screen = 'glance'; this.clampCursor(); return; }
    if (this.screen === 'glance') { this.screen = 'positions'; this.cursor = 0; }
  }

  toggleWatch() {
    const m = this.detail();
    if (!m) return;
    if (this.watchlist.has(m.id)) { this.watchlist.delete(m.id); this.notice = 'Stopped watching.'; }
    else { this.watchlist.add(m.id); this.notice = 'Watching this market.'; }
  }

  addAlert() {
    const m = this.detail();
    if (!m) return;
    const exists = this.alerts.some((a) => a.marketId === m.id && a.outcomeIndex === 0);
    if (exists) { this.notice = 'Alert already set on this market.'; return; }
    const a = makeAlert(m, 0);
    this.alerts.push(a);
    this.notice = `Alert set: ${m.outcomes[0]} ${a.dir === 'above' ? '≥' : '≤'} ${fmtPct(a.threshold)}.`;
  }

  confirmBet() {
    const m = this.detail();
    if (!m) { this.screen = 'glance'; return; }
    const amount = BET_SIZES[this.betSizeIndex];
    const r = this.book.buy(m, this.betOutcome, amount);
    if (r.error) { this.notice = r.error; this.screen = 'detail'; return; }
    this.notice = `Paper bet placed: ${fmtMoney(amount)} on ${m.outcomes[this.betOutcome]}.`;
    this.screen = 'positions'; this.cursor = 0;
  }

  openAlertMarket() {
    const f = this.alertQueue[0];
    if (f) { this.detailId = f.market.id; this.alertQueue.shift(); }
    this.screen = this.alertQueue.length ? 'alert' : 'detail';
    this.cursor = 0;
  }

  dismissAlert() {
    this.alertQueue.shift();
    if (!this.alertQueue.length) this.screen = 'glance';
    this.clampCursor();
  }

  command(cmd) {
    if (!cmd) return;
    switch (cmd.type) {
      case 'back': this.doubleClick(); break;
      case 'positions':
        if (this.screen !== 'positions') { this.screen = 'positions'; this.cursor = 0; }
        break;
      case 'scrollDown': this.scrollDown(); break;
      case 'scrollUp': this.scrollUp(); break;
      case 'open': this.click(); break;
      case 'confirm': if (this.screen === 'bet') this.click(); break;
      case 'watch':
        if (this.screen === 'detail') this.toggleWatch();
        break;
      case 'bet': {
        if (this.screen === 'detail') {
          const idx = BET_SIZES.indexOf(cmd.amount);
          if (idx >= 0) this.betSizeIndex = idx;
          this.betOutcome = cmd.outcome;
          this.screen = 'bet';
        }
        break;
      }
      default: break;
    }
  }

  // ---------- rendering: header + body lines for any 576x288 face ----------

  render() {
    const W = DISPLAY_WIDTH;
    const bal = fmtMoney(this.book.balance);
    let header;
    let lines = [];
    if (this.screen === 'glance') {
      header = `POLYGLANCE · paper ${bal}`;
      lines = this.renderGlance(W);
    } else if (this.screen === 'detail') {
      header = 'MARKET';
      lines = this.renderDetail(W);
    } else if (this.screen === 'bet') {
      header = 'PAPER BET — NO REAL MONEY';
      lines = this.renderBet(W);
    } else if (this.screen === 'positions') {
      header = `POSITIONS · paper ${bal}`;
      lines = this.renderPositions(W);
    } else if (this.screen === 'alert') {
      header = '!! PRICE ALERT !!';
      lines = this.renderAlert(W);
    }
    // The notice stays until the next action, so two faces (glasses +
    // simulator) can both render the same state and both show it.
    if (this.notice && this.screen !== 'alert') {
      lines = [...lines.slice(0, BODY_LINES - 1), truncate(this.notice, W)];
    }
    return { header: truncate(header, W), lines: lines.slice(0, BODY_LINES) };
  }

  marketLine(m, selected) {
    const W = DISPLAY_WIDTH;
    const cur = selected ? '>' : ' ';
    const pct = fmtPct(m.prices[0]).padStart(4);
    const chg = fmtChange(m.oneDayChange);
    const star = this.watchlist.has(m.id) ? '*' : ' ';
    const prefix = `${cur}${star}${pct} ${chg} `;
    return truncate(prefix + m.question.replace(/\s+/g, ' '), W);
  }

  renderGlance(W) {
    const feed = this.feed();
    if (!feed.length) {
      return ['No markets loaded yet.', this.stale ? 'Last fetch failed — retrying.' : 'Loading live odds…'];
    }
    const lines = feed.map((m, i) => this.marketLine(m, i === this.cursor));
    lines.push('scroll move · tap open · 2xtap positions');
    if (this.stale) lines.push('Showing last good numbers (fetch failed).');
    return windowLines(lines, this.cursor);
  }

  renderDetail(W) {
    const m = this.detail();
    if (!m) return ['That market is gone.', '2xtap: back'];
    const lines = [];
    lines.push(...wrapText(m.question, W).slice(0, 3));
    m.outcomes.forEach((name, i) => {
      lines.push(`${truncate(name, 18).padEnd(18)} ${fmtPct(m.prices[i])}`);
    });
    lines.push(`Today ${fmtChange(m.oneDayChange)} · Vol ${fmtMoney(m.volume24hr)}${m.endDate ? ` · Ends ${fmtDate(m.endDate)}` : ''}`);
    const rows = this.rows();
    rows.forEach((r, i) => lines.push(`${i === this.cursor ? '>' : ' '} ${truncate(r.label, W - 2)}`));
    // Question + outcomes + stats + rows is 9–11 lines — more than the
    // display holds. Window around the selected row so every row,
    // including the alert row at the bottom, can actually be seen.
    return windowLines(lines, lines.length - rows.length + this.cursor);
  }

  renderBet(W) {
    const m = this.detail();
    if (!m) return ['That market is gone.', '2xtap: back'];
    const amount = BET_SIZES[this.betSizeIndex];
    const price = m.prices[this.betOutcome];
    const shares = price > 0 ? amount / price : 0;
    return [
      `Bet ${fmtMoney(amount)} on ${truncate(m.outcomes[this.betOutcome], 20)}`,
      `at ${fmtPct(price)} — you get ${shares.toFixed(1)} shares.`,
      'Paper money only. No real order',
      'is placed, ever.',
      `Balance after: ${fmtMoney(this.book.balance - amount)}`,
      '> Tap: confirm',
      '  2xtap: cancel',
    ];
  }

  renderPositions(W) {
    const rows = this.rows();
    const { value, pnl } = this.book.value(this.marketById);
    if (!rows.length) {
      return ['No paper positions yet.', 'Open a market and place a', 'paper bet to see it here.', '2xtap: back'];
    }
    const lines = rows.map((r, i) => {
      const m = this.marketById.get(r.id);
      const pos = this.book.positions.get(PaperBook.key(r.id, 0))
        || this.book.positionList().find((p) => p.marketId === r.id);
      const price = m.prices[pos.outcomeIndex];
      const cur = pos.shares * price;
      const diff = cur - pos.cost;
      const sign = diff >= 0 ? '+' : '-';
      return truncate(`${i === this.cursor ? '>' : ' '} ${fmtPct(price)} ${sign}${fmtMoney(Math.abs(diff))} ${m.question}`, W);
    });
    lines.push(`Value ${fmtMoney(value)} · P&L ${pnl >= 0 ? '+' : ''}${fmtMoney(pnl)}`);
    lines.push('tap: open · 2xtap: back');
    return windowLines(lines, this.cursor);
  }

  renderAlert(W) {
    const f = this.alertQueue[0];
    if (!f) return ['No alerts.'];
    const { market, price, alert } = f;
    return [
      ...wrapText(market.question, W).slice(0, 3),
      `${market.outcomes[alert.outcomeIndex]} crossed ${fmtPct(alert.threshold)}`,
      `Now at ${fmtPct(price)}.`,
      '',
      '> Tap: view market',
      '  2xtap: dismiss',
    ];
  }
}
