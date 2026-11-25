// PolyGlance watcher — pure logic: bot command parsing, the crossing
// state machine, and message wording. No network, no filesystem — the
// network clients are injected by bot.js, so everything here is tested
// in Node by tests/watcher.test.js.
//
// Alert semantics match the app (js/core.js checkAlerts): an alert fires
// ONCE when the price crosses its line, then stays quiet until the price
// crosses back — only then can it fire again.

export const APP_URL = 'https://msabhishek22.github.io/polyglance/';

export function fmtPct(p) { return `${Math.round(p * 100)}%`; }

function arrow(dir) { return dir === 'above' ? '≥' : '≤'; }

// ---------- command parsing ----------
// Returns one of:
//   {type:'start'|'help'|'list'}
//   {type:'alert', ref, dir, percent}
//   {type:'remove', index}          index is 0-based
//   {type:'error', message}         a command was meant, but malformed
//   null                            not a bot command at all

export function parseBotCommand(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return null;
  const parts = t.split(/\s+/);
  const cmd = parts[0].toLowerCase().split('@')[0]; // /alert@BotName works too

  if (cmd === '/start') return { type: 'start' };
  if (cmd === '/help') return { type: 'help' };
  if (cmd === '/list') return { type: 'list' };

  if (cmd === '/remove') {
    const n = Number(parts[1]);
    if (parts.length !== 2 || !Number.isInteger(n) || n < 1) {
      return { type: 'error', message: 'Use /remove <number> — /list shows the numbers.' };
    }
    return { type: 'remove', index: n - 1 };
  }

  if (cmd === '/alert') {
    if (parts.length !== 4) {
      return { type: 'error', message: 'Use /alert <market-slug-or-id> <above|below> <price-percent>, e.g. /alert will-btc-hit-100k above 65' };
    }
    const [, ref, dirRaw, pctRaw] = parts;
    const dir = dirRaw.toLowerCase();
    if (dir !== 'above' && dir !== 'below') {
      return { type: 'error', message: 'The direction must be "above" or "below", e.g. /alert will-btc-hit-100k above 65' };
    }
    const percent = Number(pctRaw);
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      return { type: 'error', message: 'The price must be a percent between 1 and 99, e.g. 65 for 65%.' };
    }
    return { type: 'alert', ref, dir, percent };
  }

  return { type: 'error', message: 'I do not know that command. /help lists what I understand.' };
}

// ---------- the crossing state machine ----------

// 'fire'  — armed and the price is now past the line
// 'rearm' — fired before, and the price is back on the near side
// 'none'  — nothing changed
export function crossingStep(alert, price) {
  if (!Number.isFinite(price)) return 'none';
  const crossed = alert.dir === 'above' ? price >= alert.threshold : price <= alert.threshold;
  if (alert.armed && crossed) return 'fire';
  if (!alert.armed && !crossed) return 'rearm';
  return 'none';
}

// Pure: returns {alert: <new state>, fired: bool}. Never mutates the input.
export function applyPrice(alert, price) {
  const step = crossingStep(alert, price);
  if (step === 'fire') return { alert: { ...alert, armed: false, lastPrice: price }, fired: true };
  if (step === 'rearm') return { alert: { ...alert, armed: true, lastPrice: price }, fired: false };
  return { alert: { ...alert, lastPrice: Number.isFinite(price) ? price : alert.lastPrice }, fired: false };
}

// Should a freshly created alert start armed? If the price is already past
// the line, no: it first has to come back across, then cross again — the
// same rule as a fired alert re-arming.
export function startsArmed(dir, threshold, currentPrice) {
  const crossed = dir === 'above' ? currentPrice >= threshold : currentPrice <= threshold;
  return !crossed;
}

// ---------- wording ----------

export const HELP_TEXT = [
  'I watch Polymarket price lines for you and send a message here when one is crossed — the PolyGlance app does not need to be open.',
  '',
  'Commands:',
  '/alert <market-slug-or-id> <above|below> <percent> — watch a line, e.g. /alert will-btc-hit-100k above 65',
  '/list — your alerts',
  '/remove <number> — drop an alert (numbers from /list)',
  '/help — this text',
  '',
  'Tip: in the PolyGlance app, open a market, set an alert, and the Telegram panel builds the /alert command for you to copy.',
  `App: ${APP_URL}`,
].join('\n');

export function formatAlertList(alerts) {
  if (!alerts.length) return 'You have no alerts yet. Add one with /alert <market-slug-or-id> <above|below> <percent>.';
  const lines = ['Your alerts:'];
  alerts.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.question}`);
    lines.push(`   Yes ${arrow(a.dir)} ${fmtPct(a.threshold)}${a.lastPrice != null ? ` · last seen ${fmtPct(a.lastPrice)}` : ''}`);
  });
  lines.push('');
  lines.push('Drop one with /remove <number>.');
  return lines.join('\n');
}

export function formatCrossingMessage(alert, price) {
  return [
    `PolyGlance alert: ${alert.question}`,
    `Yes crossed ${alert.dir} ${fmtPct(alert.threshold)} — now at ${fmtPct(price)}.`,
    `Open it in PolyGlance: ${APP_URL}`,
  ].join('\n');
}

export function formatAlertSetMessage(alert, currentPrice) {
  const lines = [
    `Watching: ${alert.question}`,
    `I will message you when Yes crosses ${alert.dir} ${fmtPct(alert.threshold)}. It is at ${fmtPct(currentPrice)} now.`,
  ];
  if (!alert.armed) {
    lines.push('That is already past your line, so I will wait for it to cross back and over again before firing — otherwise you would get a message for a move that already happened.');
  }
  lines.push('/list shows your alerts.');
  return lines.join('\n');
}
