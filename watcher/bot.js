// PolyGlance watcher — the bot core. Telegram and Gamma clients are
// injected, and the alert store is a plain object the caller persists,
// so this whole file runs in tests with fakes and no network.
//
// Store shape (watcher/alerts.json, kept out of git — chat ids are
// user data):
//   { "chats": { "<chatId>": [ {marketId, slug, question, dir,
//     threshold, armed, lastPrice, createdAt}, ... ] } }

import {
  parseBotCommand, applyPrice, startsArmed,
  HELP_TEXT, formatAlertList, formatCrossingMessage, formatAlertSetMessage,
} from './logic.js';

export function emptyStore() { return { chats: {} }; }

export function createBot({ telegram, gamma, store, save = () => {}, now = () => new Date() }) {
  if (!store.chats) store.chats = {};

  const alertsOf = (chatId) => {
    const key = String(chatId);
    if (!store.chats[key]) store.chats[key] = [];
    return store.chats[key];
  };

  async function reply(chatId, text) {
    await telegram.sendMessage(chatId, text);
  }

  // Handle one Telegram update. Returns true when the store changed.
  async function handleUpdate(update) {
    const msg = update && update.message;
    if (!msg || typeof msg.text !== 'string' || !msg.chat) return false;
    const chatId = msg.chat.id;
    const cmd = parseBotCommand(msg.text);
    if (!cmd) {
      // Plain text: only answer in a private chat, so the bot stays
      // quiet if it is ever added to a group.
      if (msg.chat.type === 'private') {
        await reply(chatId, 'Send /help to see what I can do — or paste an /alert command from the PolyGlance app.');
      }
      return false;
    }

    if (cmd.type === 'start') {
      alertsOf(chatId); // register the chat, even before its first alert
      save();
      await reply(chatId, `Hello — I am the PolyGlance watcher.\n\n${HELP_TEXT}`);
      return true;
    }
    if (cmd.type === 'help') {
      await reply(chatId, HELP_TEXT);
      return false;
    }
    if (cmd.type === 'error') {
      await reply(chatId, cmd.message);
      return false;
    }
    if (cmd.type === 'list') {
      await reply(chatId, formatAlertList(alertsOf(chatId)));
      return false;
    }
    if (cmd.type === 'remove') {
      const list = alertsOf(chatId);
      if (cmd.index < 0 || cmd.index >= list.length) {
        await reply(chatId, list.length
          ? `There is no alert number ${cmd.index + 1}. /list shows ${list.length}.`
          : 'You have no alerts to remove.');
        return false;
      }
      const [gone] = list.splice(cmd.index, 1);
      save();
      await reply(chatId, `Removed: ${gone.question} (Yes ${gone.dir} ${Math.round(gone.threshold * 100)}%).`);
      return true;
    }
    if (cmd.type === 'alert') {
      let market = null;
      try { market = await gamma.resolveMarket(cmd.ref); } catch { market = null; }
      if (!market) {
        await reply(chatId, `I could not find a Polymarket market called "${cmd.ref}". Check the slug or id and try again — the app panel copies it exactly.`);
        return false;
      }
      const threshold = cmd.percent / 100;
      const price = market.prices[0];
      const alert = {
        marketId: market.id,
        slug: market.slug || '',
        question: market.question,
        dir: cmd.dir,
        threshold,
        armed: startsArmed(cmd.dir, threshold, price),
        lastPrice: price,
        createdAt: now().toISOString(),
      };
      alertsOf(chatId).push(alert);
      save();
      await reply(chatId, formatAlertSetMessage(alert, price));
      return true;
    }
    return false;
  }

  // One price-check cycle over every stored alert. Prices are fetched
  // once per market, however many chats watch it. A market that cannot
  // be read is skipped this cycle — its alerts keep their old state.
  // Returns {checked, fired}.
  async function checkAll() {
    let checked = 0;
    let fired = 0;
    let changed = false;
    const priceByMarket = new Map();
    for (const list of Object.values(store.chats)) {
      for (const a of list) {
        if (!priceByMarket.has(a.marketId)) {
          priceByMarket.set(a.marketId, await gamma.yesPrice(a.marketId));
        }
      }
    }
    for (const [chatId, list] of Object.entries(store.chats)) {
      for (let i = 0; i < list.length; i += 1) {
        const price = priceByMarket.get(list[i].marketId);
        if (price == null || !Number.isFinite(price)) continue;
        checked += 1;
        const { alert, fired: didFire } = applyPrice(list[i], price);
        if (alert.armed !== list[i].armed || alert.lastPrice !== list[i].lastPrice) changed = true;
        list[i] = alert;
        if (didFire) {
          fired += 1;
          changed = true;
          await telegram.sendMessage(chatId, formatCrossingMessage(alert, price));
        }
      }
    }
    if (changed) save();
    return { checked, fired };
  }

  return { handleUpdate, checkAll, store };
}
