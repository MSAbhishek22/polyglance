// Node tests for PolyGlance core. Run: node tests/core.test.js
// The fixture is a REAL Gamma API response recorded 23 Nov 2026 — it pins the
// parser to the live API shape. It is a test fixture only; the app itself
// always fetches live data.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseMarket, parseMarkets, topByVolume, topMovers,
  fmtPct, fmtChange, fmtMoney, truncate, wrapText,
  PaperBook, makeAlert, checkAlerts, parseCommand, GlanceApp,
  DISPLAY_WIDTH, BODY_LINES,
} from '../js/core.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`ok ${passed} - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

const fixture = JSON.parse(readFileSync(new URL('./fixture-markets.json', import.meta.url), 'utf8'));
const markets = parseMarkets(fixture);
const byId = new Map(markets.map((m) => [m.id, m]));

// ---------- parsing ----------

test('fixture parses into usable markets', () => {
  assert.ok(markets.length >= 4, `expected >=4 markets, got ${markets.length}`);
  for (const m of markets) {
    assert.equal(m.outcomes.length, m.prices.length);
    assert.ok(m.prices.every((p) => p >= 0 && p <= 1));
    assert.ok(m.question.length > 0);
  }
});

test('parseMarket rejects broken rows instead of inventing data', () => {
  assert.equal(parseMarket(null), null);
  assert.equal(parseMarket({ question: 'Q?' }), null);
  assert.equal(parseMarket({ question: 'Q?', outcomes: '["Yes"]', outcomePrices: '["0.5"]' }), null);
  assert.equal(parseMarket({ question: 'Q?', outcomes: '["Yes","No"]', outcomePrices: '["x","0.5"]' }), null);
  assert.equal(parseMarket({ question: 'Q?', outcomes: 'not json', outcomePrices: '["0.5","0.5"]' }), null);
  assert.equal(parseMarket({ question: '  ', outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]' }), null);
});

test('parseMarkets de-duplicates by id', () => {
  const raw = { id: '1', question: 'A?', outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]' };
  assert.equal(parseMarkets([raw, raw]).length, 1);
});

test('topByVolume and topMovers sort correctly', () => {
  const fake = [
    { id: 'a', volume24hr: 10, oneDayChange: 0.01 },
    { id: 'b', volume24hr: 99, oneDayChange: -0.2 },
    { id: 'c', volume24hr: 50, oneDayChange: 0.05 },
  ];
  assert.deepEqual(topByVolume(fake, 2).map((m) => m.id), ['b', 'c']);
  assert.deepEqual(topMovers(fake, 2).map((m) => m.id), ['b', 'c']);
  assert.equal(topMovers([{ id: 'z', volume24hr: 1, oneDayChange: 0 }], 3).length, 0);
});

// ---------- formatting ----------

test('formatting is glance-sized and honest', () => {
  assert.equal(fmtPct(0.625), '63%');
  assert.equal(fmtPct(0), '0%');
  assert.equal(fmtChange(0.032), '▲3.2');
  assert.equal(fmtChange(-0.1), '▼10.0');
  assert.equal(fmtChange(0), '·0.0');
  assert.equal(fmtMoney(1234567), '$1.2M');
  assert.equal(fmtMoney(42000), '$42.0k');
  assert.equal(fmtMoney(9.5), '$9.50');
  assert.equal(fmtMoney(-3), '-$3.00');
  assert.ok(truncate('a'.repeat(60), DISPLAY_WIDTH).length <= DISPLAY_WIDTH);
  for (const line of wrapText('Will the Fed increase interest rates by December?', 20)) {
    assert.ok(line.length <= 20, `line too long: ${line}`);
  }
});

// ---------- paper book ----------

test('paper bets buy shares at the live price and cannot overspend', () => {
  const m = markets[0];
  const book = new PaperBook(100);
  const price = m.prices[0];
  assert.ok(price > 0 && price < 1, 'fixture market must be buyable');
  const r = book.buy(m, 0, 10);
  assert.ok(!r.error);
  assert.ok(Math.abs(r.shares - 10 / price) < 1e-9);
  assert.equal(book.balance, 90);
  assert.equal(book.buy(m, 0, 1000).error, 'Not enough paper balance.');
  assert.equal(book.balance, 90, 'failed bet must not move the balance');
});

test('positions revalue at current prices (P&L maths)', () => {
  const m = { id: 'x', question: 'Q?', outcomes: ['Yes', 'No'], prices: [0.5, 0.5], volume24hr: 1, oneDayChange: 0, lastPrice: 0.5, endDate: '' };
  const book = new PaperBook(1000);
  book.buy(m, 0, 100); // 200 shares @ 0.50
  const moved = new Map([['x', { ...m, prices: [0.6, 0.4] }]]);
  const v = book.value(moved);
  assert.ok(Math.abs(v.value - 120) < 1e-9);
  assert.ok(Math.abs(v.pnl - 20) < 1e-9);
  const gone = book.value(new Map());
  assert.equal(gone.missing, 1);
});

test('paper book survives a JSON round trip and rejects junk', () => {
  const m = markets[0];
  const book = new PaperBook(500);
  book.buy(m, 1, 25);
  const back = PaperBook.fromJSON(JSON.parse(JSON.stringify(book.toJSON())));
  assert.equal(back.balance, book.balance);
  assert.equal(back.positionList().length, 1);
  assert.equal(PaperBook.fromJSON({ balance: -5, positions: 'junk' }).balance, 1000);
  assert.equal(PaperBook.fromJSON(null).balance, 1000);
});

// ---------- alerts ----------

test('alerts fire once on a cross, then re-arm after crossing back', () => {
  const base = { id: 'a1', question: 'Q?', outcomes: ['Yes', 'No'], prices: [0.5, 0.5], volume24hr: 1, oneDayChange: 0, lastPrice: 0.5, endDate: '' };
  const alert = makeAlert(base, 0);
  assert.equal(alert.dir, 'above');
  assert.equal(alert.threshold, 0.55);
  const at = (p) => new Map([['a1', { ...base, prices: [p, 1 - p] }]]);
  assert.equal(checkAlerts([alert], at(0.54)).length, 0);
  assert.equal(checkAlerts([alert], at(0.56)).length, 1, 'crossing fires');
  assert.equal(checkAlerts([alert], at(0.57)).length, 0, 'no repeat while still above');
  assert.equal(checkAlerts([alert], at(0.52)).length, 0, 'crossing back re-arms quietly');
  assert.equal(checkAlerts([alert], at(0.58)).length, 1, 'fires again on the next cross');
});

// ---------- commands ----------

test('voice commands parse to the same actions as the buttons', () => {
  assert.deepEqual(parseCommand('next'), { type: 'scrollDown' });
  assert.deepEqual(parseCommand('go back'), { type: 'back' });
  assert.deepEqual(parseCommand('watch this'), { type: 'watch' });
  assert.deepEqual(parseCommand('bet 25 on no'), { type: 'bet', outcome: 1, amount: 25 });
  assert.deepEqual(parseCommand('bet on yes'), { type: 'bet', outcome: 0, amount: 10 });
  assert.deepEqual(parseCommand('bet ten on yes'), { type: 'bet', outcome: 0, amount: 10 });
  assert.deepEqual(parseCommand('bet fifty on no'), { type: 'bet', outcome: 1, amount: 50 });
  assert.deepEqual(parseCommand('show my positions'), { type: 'positions' });
  assert.equal(parseCommand('blah blah'), null);
  assert.equal(parseCommand(''), null);
});

// ---------- state machine ----------

function freshApp() {
  const app = new GlanceApp();
  app.setMarkets(markets);
  return app;
}

test('glance feed puts watched markets first', () => {
  const app = freshApp();
  const target = markets[markets.length - 1];
  app.watchlist.add(target.id);
  assert.equal(app.feed()[0].id, target.id);
});

test('tap opens detail, watch toggles, bet flow places a paper bet', () => {
  const app = freshApp();
  app.click(); // open first feed market
  assert.equal(app.screen, 'detail');
  const m = app.detail();
  assert.ok(m);
  app.cursor = 0; app.click(); // watch
  assert.ok(app.watchlist.has(m.id));
  const betRow = app.rows().findIndex((r) => r.action === 'bet');
  app.cursor = betRow; app.click();
  assert.equal(app.screen, 'bet');
  const before = app.book.balance;
  app.click(); // confirm
  assert.equal(app.screen, 'positions');
  assert.ok(app.book.balance < before, 'balance spent');
  assert.equal(app.book.positionList().length, 1);
});

test('double-tap on a bet row cycles the amount, elsewhere goes back', () => {
  const app = freshApp();
  app.click();
  const betRow = app.rows().findIndex((r) => r.action === 'bet');
  app.cursor = betRow;
  const size0 = app.betSizeIndex;
  app.doubleClick();
  assert.equal(app.screen, 'detail');
  assert.notEqual(app.betSizeIndex, size0);
  app.cursor = 0;
  app.doubleClick();
  assert.equal(app.screen, 'glance');
  app.doubleClick(); // glance -> positions
  assert.equal(app.screen, 'positions');
  app.doubleClick(); // positions -> glance
  assert.equal(app.screen, 'glance');
});

test('a fired alert takes over the screen and dismisses cleanly', () => {
  const app = freshApp();
  const m = markets[0];
  app.alerts.push({ marketId: m.id, outcomeIndex: 0, threshold: 0.01, dir: 'above', armed: true, lastPrice: 0 });
  app.setMarkets(markets); // price is well above 0.01 -> fires
  assert.equal(app.screen, 'alert');
  app.doubleClick(); // dismiss
  assert.equal(app.screen, 'glance');
  assert.equal(app.alertQueue.length, 0);
});

test('every rendered screen fits the G2 display model', () => {
  const app = freshApp();
  const screens = [];
  screens.push(app.render()); // glance
  app.click(); screens.push(app.render()); // detail
  const betRow = app.rows().findIndex((r) => r.action === 'bet');
  app.cursor = betRow; app.click(); screens.push(app.render()); // bet
  app.click(); screens.push(app.render()); // positions after bet
  for (const s of screens) {
    assert.ok(s.header.length <= DISPLAY_WIDTH, `header too wide: ${s.header}`);
    assert.ok(s.lines.length <= BODY_LINES, `too many lines: ${s.lines.length}`);
    for (const line of s.lines) assert.ok(line.length <= DISPLAY_WIDTH, `line too wide (${line.length}): ${line}`);
  }
});

test('empty state renders honestly, never invents markets', () => {
  const app = new GlanceApp();
  const s = app.render();
  assert.ok(s.lines.join(' ').includes('No markets loaded'));
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures above)' : ''}`);
