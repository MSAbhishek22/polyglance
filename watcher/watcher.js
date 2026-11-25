// PolyGlance watcher — entrypoint.
//
// Watches Polymarket price lines and sends a Telegram message when one
// is crossed, so an alert reaches you while the PolyGlance app is
// closed. Read-only: it fetches public prices and sends messages.
// It never trades and never touches money.
//
// Setup (full steps in the README):
//   1. Create a bot with @BotFather in Telegram.
//   2. Put its token in the environment — never in code, never in git:
//        export POLYGLANCE_BOT_TOKEN=<the token BotFather gave you>
//   3. Run:  node watcher/watcher.js
// Optional: POLYGLANCE_POLL_SECONDS — price-check interval (default 60,
// minimum 10).
//
// Alerts live in watcher/alerts.json next to this file. That file holds
// Telegram chat ids, so it is gitignored — see alerts.example.json for
// the shape.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createTelegram } from './telegram.js';
import { createGamma } from './gamma.js';
import { createBot, emptyStore } from './bot.js';

const token = process.env.POLYGLANCE_BOT_TOKEN;
if (!token) {
  console.error([
    'PolyGlance watcher: POLYGLANCE_BOT_TOKEN is not set, so there is no bot to run.',
    '',
    'To set it up:',
    '  1. In Telegram, open @BotFather and send /newbot. Pick a name and a username.',
    '  2. BotFather replies with a token. Keep it secret — anyone with it controls the bot.',
    '  3. In this terminal:  export POLYGLANCE_BOT_TOKEN=<paste the token>',
    '  4. Run again:         node watcher/watcher.js',
  ].join('\n'));
  process.exit(1);
}

const pollSeconds = Math.max(10, Number(process.env.POLYGLANCE_POLL_SECONDS) || 60);

const here = dirname(fileURLToPath(import.meta.url));
const storePath = join(here, 'alerts.json');

function loadStore() {
  if (!existsSync(storePath)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.chats) return parsed;
  } catch { /* a broken store must not take the watcher down */ }
  console.error('watcher: alerts.json was unreadable — starting with an empty store (the old file was left in place).');
  return emptyStore();
}

const store = loadStore();
function save() {
  const tmp = `${storePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  renameSync(tmp, storePath);
}

const telegram = createTelegram(token);
const bot = createBot({
  telegram,
  gamma: createGamma(),
  store,
  save,
});

let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('\nwatcher: stopping…'); });
process.on('SIGTERM', () => { stopping = true; console.log('watcher: stopping…'); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function updateLoop() {
  let offset = 0;
  while (!stopping) {
    try {
      const updates = await telegram.getUpdates(offset, 50);
      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        try {
          await bot.handleUpdate(u);
        } catch (e) {
          console.error(`watcher: one update failed (${e.message}) — continuing.`);
        }
      }
    } catch (e) {
      console.error(`watcher: update poll failed (${e.message}) — retrying in 5s.`);
      await sleep(5000);
    }
  }
}

async function priceLoop() {
  while (!stopping) {
    try {
      const { checked, fired } = await bot.checkAll();
      if (fired) console.log(`watcher: checked ${checked} alerts, ${fired} crossing message(s) sent.`);
    } catch (e) {
      console.error(`watcher: price check failed (${e.message}) — will retry next cycle.`);
    }
    // Sleep in short slices so a stop signal lands quickly.
    for (let s = 0; s < pollSeconds && !stopping; s += 1) await sleep(1000);
  }
}

console.log(`watcher: running. Price checks every ${pollSeconds}s. Send /start to the bot in Telegram. Ctrl-C stops.`);
await Promise.all([updateLoop(), priceLoop()]);
console.log('watcher: stopped.');
