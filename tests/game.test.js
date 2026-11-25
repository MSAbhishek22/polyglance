// Node tests for the PolyGlance board maths (js/game.js).
// Run: node tests/game.test.js — no dependencies, no network.

import assert from 'node:assert/strict';
import { scoreFor, levelFor, topCalls, POINTS } from '../js/game.js';
import { PaperBook } from '../js/core.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`ok ${passed} - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

test('score is the stated sum of real state, floored at zero', () => {
  assert.equal(scoreFor({}), 0);
  assert.equal(scoreFor({ watched: 2, alerts: 1, alertHits: 1, pnl: 0 }),
    2 * POINTS.watch + POINTS.alert + POINTS.hit);
  assert.equal(scoreFor({ watched: 0, alerts: 0, alertHits: 0, pnl: 12.4 }), 12);
  assert.equal(scoreFor({ watched: 1, alerts: 0, alertHits: 0, pnl: -50 }), 0,
    'a bad book can pull the score to zero, never below');
});

test('score moves with paper P&L', () => {
  const before = scoreFor({ watched: 1, alerts: 1, alertHits: 0, pnl: 0 });
  const after = scoreFor({ watched: 1, alerts: 1, alertHits: 0, pnl: 30 });
  assert.equal(after - before, 30);
});

test('levels step at their thresholds with honest progress', () => {
  assert.equal(levelFor(0).name, 'First glance');
  assert.equal(levelFor(39).name, 'First glance');
  assert.equal(levelFor(40).name, 'Watcher');
  assert.equal(levelFor(40).next.name, 'Line setter');
  assert.ok(Math.abs(levelFor(70).progress - 0.5) < 1e-9, 'halfway from 40 to 100');
  const top = levelFor(5000);
  assert.equal(top.name, 'Market hawk');
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test('top calls rank the user\'s own positions by P&L at live prices', () => {
  const a = { id: 'a', question: 'A?', outcomes: ['Yes', 'No'], prices: [0.5, 0.5] };
  const b = { id: 'b', question: 'B?', outcomes: ['Yes', 'No'], prices: [0.5, 0.5] };
  const book = new PaperBook(1000);
  book.buy(a, 0, 100); // 200 shares
  book.buy(b, 0, 100);
  const byId = new Map([
    ['a', { ...a, prices: [0.75, 0.25] }], // +$50
    ['b', { ...b, prices: [0.4, 0.6] }],   // -$20
  ]);
  const calls = topCalls(book, byId);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].question, 'A?');
  assert.ok(Math.abs(calls[0].pnl - 50) < 1e-9);
  assert.ok(Math.abs(calls[1].pnl - -20) < 1e-9);
  assert.equal(topCalls(book, new Map()).length, 0, 'no prices, no claims');
});

test('an empty book scores only what watchlist and alerts earn', () => {
  const book = new PaperBook(1000);
  assert.equal(book.positionList().length, 0);
  assert.equal(scoreFor({ watched: 3, alerts: 2, alertHits: 0, pnl: 0 }), 60);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures above)' : ''}`);
