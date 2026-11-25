// Node tests for the PolyGlance Telegram watcher + the app panel's
// command builder. Run: node tests/watcher.test.js
// No network anywhere: Gamma and Telegram are fakes injected into the
// bot core, exactly the seams watcher.js wires with the real clients.

import assert from 'node:assert/strict';
import {
  parseBotCommand, crossingStep, applyPrice, startsArmed,
  formatAlertList, formatCrossingMessage, APP_URL,
} from '../watcher/logic.js';
import { createBot, emptyStore } from '../watcher/bot.js';
import { alertCommandText, alertSummary, panelAlert, botLink, BOT_USERNAME } from '../js/telegram.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`ok ${passed} - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}
async function testAsync(name, fn) {
  try { await fn(); passed += 1; console.log(`ok ${passed} - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

// ---------- command parsing ----------

test('simple commands parse', () => {
  assert.deepEqual(parseBotCommand('/start'), { type: 'start' });
  assert.deepEqual(parseBotCommand('/help'), { type: 'help' });
  assert.deepEqual(parseBotCommand('/list'), { type: 'list' });
  assert.deepEqual(parseBotCommand('  /list  '), { type: 'list' });
  assert.equal(parseBotCommand('hello there'), null);
  assert.equal(parseBotCommand(''), null);
});

test('/alert parses slug, direction and percent', () => {
  assert.deepEqual(parseBotCommand('/alert will-btc-hit-100k above 65'),
    { type: 'alert', ref: 'will-btc-hit-100k', dir: 'above', percent: 65 });
  assert.deepEqual(parseBotCommand('/alert 123456 below 40'),
    { type: 'alert', ref: '123456', dir: 'below', percent: 40 });
  assert.deepEqual(parseBotCommand('/alert some-slug ABOVE 65.5'),
    { type: 'alert', ref: 'some-slug', dir: 'above', percent: 65.5 });
});

test('/alert rejects malformed input with a usable error', () => {
  for (const bad of ['/alert', '/alert only-slug', '/alert slug up 65', '/alert slug above 0',
    '/alert slug above 100', '/alert slug above abc', '/alert slug above 65 extra']) {
    const r = parseBotCommand(bad);
    assert.equal(r.type, 'error', bad);
    assert.ok(r.message.length > 10, bad);
  }
});

test('/remove parses a 1-based number; bot suffixes are accepted', () => {
  assert.deepEqual(parseBotCommand('/remove 2'), { type: 'remove', index: 1 });
  assert.equal(parseBotCommand('/remove 0').type, 'error');
  assert.equal(parseBotCommand('/remove x').type, 'error');
  assert.deepEqual(parseBotCommand('/alert@PolyGlanceBot slug below 30'),
    { type: 'alert', ref: 'slug', dir: 'below', percent: 30 });
  assert.equal(parseBotCommand('/dance').type, 'error');
});

// ---------- crossing / re-arm ----------

test('above alert fires once on the cross, re-arms on the way back', () => {
  let a = { dir: 'above', threshold: 0.65, armed: true, lastPrice: 0.6 };
  assert.equal(crossingStep(a, 0.64), 'none');
  let r = applyPrice(a, 0.66); a = r.alert;
  assert.equal(r.fired, true);
  assert.equal(a.armed, false);
  r = applyPrice(a, 0.7); a = r.alert;
  assert.equal(r.fired, false, 'no repeat while still past the line');
  r = applyPrice(a, 0.6); a = r.alert;
  assert.equal(r.fired, false, 'crossing back is quiet');
  assert.equal(a.armed, true, 'and re-arms');
  r = applyPrice(a, 0.67);
  assert.equal(r.fired, true, 'fires again on the next cross');
});

test('below alert is the mirror image', () => {
  let a = { dir: 'below', threshold: 0.4, armed: true, lastPrice: 0.5 };
  assert.equal(crossingStep(a, 0.41), 'none');
  let r = applyPrice(a, 0.39); a = r.alert;
  assert.equal(r.fired, true);
  r = applyPrice(a, 0.45); a = r.alert;
  assert.equal(r.fired, false);
  assert.equal(a.armed, true);
  assert.equal(crossingStep(a, Number.NaN), 'none', 'a missing price changes nothing');
});

test('a new alert already past its line starts disarmed', () => {
  assert.equal(startsArmed('above', 0.65, 0.7), false);
  assert.equal(startsArmed('above', 0.65, 0.6), true);
  assert.equal(startsArmed('below', 0.4, 0.35), false);
  assert.equal(startsArmed('below', 0.4, 0.5), true);
});

test('list and crossing messages carry the facts and the app link', () => {
  const a = { question: 'Will it rain?', dir: 'above', threshold: 0.65, lastPrice: 0.61, slug: 'rain', marketId: '9' };
  const list = formatAlertList([a]);
  assert.ok(list.includes('1. Will it rain?'));
  assert.ok(list.includes('65%'));
  assert.ok(formatAlertList([]).includes('no alerts yet'));
  const msg = formatCrossingMessage(a, 0.67);
  assert.ok(msg.includes('Will it rain?'));
  assert.ok(msg.includes('above 65%'));
  assert.ok(msg.includes('now at 67%'));
  assert.ok(msg.includes(APP_URL));
});

// ---------- the bot core, with fakes ----------

function fakeTelegram() {
  const sent = [];
  return { sent, async sendMessage(chatId, text) { sent.push({ chatId, text }); } };
}

const MARKET = {
  id: '4242', slug: 'will-it-rain', question: 'Will it rain?',
  outcomes: ['Yes', 'No'], prices: [0.6, 0.4],
};

function fakeGamma({ price = 0.6, failResolve = false } = {}) {
  const state = { price };
  return {
    state,
    async resolveMarket(ref) {
      if (failResolve || (ref !== MARKET.slug && ref !== MARKET.id)) return null;
      return { ...MARKET, prices: [state.price, 1 - state.price] };
    },
    async yesPrice() { return state.price; },
  };
}

const upd = (chatId, text) => ({
  update_id: 1,
  message: { text, chat: { id: chatId, type: 'private' } },
});

await testAsync('/start registers the chat and explains the bot', async () => {
  const tg = fakeTelegram();
  const store = emptyStore();
  const bot = createBot({ telegram: tg, gamma: fakeGamma(), store });
  await bot.handleUpdate(upd(777, '/start'));
  assert.ok(store.chats['777'], 'chat registered');
  assert.equal(tg.sent.length, 1);
  assert.ok(tg.sent[0].text.includes('/alert'));
});

await testAsync('/alert stores the alert and confirms with the live price', async () => {
  const tg = fakeTelegram();
  const store = emptyStore();
  const bot = createBot({ telegram: tg, gamma: fakeGamma({ price: 0.6 }), store });
  await bot.handleUpdate(upd(777, '/alert will-it-rain above 65'));
  const list = store.chats['777'];
  assert.equal(list.length, 1);
  assert.equal(list[0].marketId, '4242');
  assert.equal(list[0].threshold, 0.65);
  assert.equal(list[0].armed, true);
  assert.ok(tg.sent[0].text.includes('Will it rain?'));
  assert.ok(tg.sent[0].text.includes('60%'), 'confirmation states the current price');
});

await testAsync('/alert for an unknown market stores nothing and says so', async () => {
  const tg = fakeTelegram();
  const store = emptyStore();
  const bot = createBot({ telegram: tg, gamma: fakeGamma({ failResolve: true }), store });
  await bot.handleUpdate(upd(777, '/alert no-such-market above 65'));
  assert.equal((store.chats['777'] || []).length, 0);
  assert.ok(tg.sent[0].text.includes('could not find'));
});

await testAsync('/list then /remove keeps numbering honest', async () => {
  const tg = fakeTelegram();
  const store = emptyStore();
  const bot = createBot({ telegram: tg, gamma: fakeGamma(), store });
  await bot.handleUpdate(upd(777, '/alert will-it-rain above 65'));
  await bot.handleUpdate(upd(777, '/alert will-it-rain below 40'));
  await bot.handleUpdate(upd(777, '/list'));
  assert.ok(tg.sent.at(-1).text.includes('1. Will it rain?'));
  assert.ok(tg.sent.at(-1).text.includes('2. Will it rain?'));
  await bot.handleUpdate(upd(777, '/remove 1'));
  assert.equal(store.chats['777'].length, 1);
  assert.equal(store.chats['777'][0].dir, 'below', 'the second alert survives');
  await bot.handleUpdate(upd(777, '/remove 5'));
  assert.ok(tg.sent.at(-1).text.includes('no alert number 5'));
  assert.equal(store.chats['777'].length, 1, 'a bad remove changes nothing');
});

await testAsync('checkAll messages once per crossing, then re-arms', async () => {
  const tg = fakeTelegram();
  const gamma = fakeGamma({ price: 0.6 });
  const store = emptyStore();
  const bot = createBot({ telegram: tg, gamma, store });
  await bot.handleUpdate(upd(777, '/alert will-it-rain above 65'));
  tg.sent.length = 0;

  gamma.state.price = 0.66;
  let r = await bot.checkAll();
  assert.equal(r.fired, 1);
  assert.equal(tg.sent.length, 1);
  assert.ok(tg.sent[0].text.includes('crossed above 65%'));
  assert.equal(tg.sent[0].chatId, '777');

  gamma.state.price = 0.7;
  r = await bot.checkAll();
  assert.equal(r.fired, 0, 'still past the line: no repeat message');
  assert.equal(tg.sent.length, 1);

  gamma.state.price = 0.6;
  await bot.checkAll();
  gamma.state.price = 0.68;
  r = await bot.checkAll();
  assert.equal(r.fired, 1, 'a fresh cross after re-arming fires again');
  assert.equal(tg.sent.length, 2);
});

await testAsync('checkAll skips a market whose price cannot be read', async () => {
  const tg = fakeTelegram();
  const gamma = fakeGamma({ price: 0.6 });
  const store = emptyStore();
  const bot = createBot({ telegram: tg, gamma, store });
  await bot.handleUpdate(upd(777, '/alert will-it-rain above 65'));
  tg.sent.length = 0;
  gamma.yesPrice = async () => null;
  const r = await bot.checkAll();
  assert.equal(r.checked, 0);
  assert.equal(r.fired, 0);
  assert.equal(store.chats['777'][0].armed, true, 'state untouched when the price is unknown');
  assert.equal(tg.sent.length, 0);
});

// ---------- the app panel's command builder (js/telegram.js) ----------

test('panel command uses the slug and the line the app would set', () => {
  const m = { id: '1', slug: 'will-it-rain', question: 'Will it rain?', outcomes: ['Yes', 'No'], prices: [0.6, 0.4] };
  // No alert set: the app rule is price + 5 points, direction above.
  assert.equal(alertCommandText(m, []), '/alert will-it-rain above 65');
  assert.equal(alertSummary(m, []), 'Yes above 65%');
  assert.equal(panelAlert(m, []).alreadySet, false);
});

test('panel command follows the alert already set, and high prices flip direction', () => {
  const m = { id: '1', slug: 'will-it-rain', question: 'Will it rain?', outcomes: ['Yes', 'No'], prices: [0.6, 0.4] };
  const set = [{ marketId: '1', outcomeIndex: 0, threshold: 0.8, dir: 'above' }];
  assert.equal(alertCommandText(m, set), '/alert will-it-rain above 80');
  assert.equal(panelAlert(m, set).alreadySet, true);
  const high = { ...m, prices: [0.93, 0.07] };
  assert.equal(alertCommandText(high, []), '/alert will-it-rain below 88');
});

test('bot link stays empty until a username is configured (no dead control)', () => {
  assert.equal(BOT_USERNAME, '');
  assert.equal(botLink(), '');
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures above)' : ''}`);
