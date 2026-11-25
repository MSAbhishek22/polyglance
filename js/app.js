// PolyGlance browser face — landing page + G2 simulator.
// One GlanceApp (js/core.js) drives everything; this file only draws it,
// wires the controls, fetches live data and keeps the session in localStorage.

import { GlanceApp, PaperBook, parseCommand, fmtMoney, fmtPct, topByVolume } from './core.js';
import { fetchMarkets } from './data.js';
import { initEvenHub } from './evenhub.js';
import { botLink, panelAlert, alertCommandText, alertSummary } from './telegram.js';
import { scoreFor, levelFor, topCalls, POINTS } from './game.js';

const STORE_KEY = 'polyglance-v1';
const $ = (id) => document.getElementById(id);

const app = new GlanceApp();
let hubPush = () => {};
let lastFetchOk = null;
// Board stats that live outside the core: how many alerts have fired
// while this browser held them. Counted where the core's alert queue
// grows (in refresh), persisted with the rest of the session.
let stats = { alertHits: 0 };

// ---------- persistence (this browser only) ----------

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      watchlist: [...app.watchlist],
      book: app.book.toJSON(),
      alerts: app.alerts,
      stats,
    }));
  } catch { /* storage unavailable — session still works */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.watchlist)) app.watchlist = new Set(data.watchlist.filter((x) => typeof x === 'string'));
    app.book = PaperBook.fromJSON(data.book);
    if (Array.isArray(data.alerts)) {
      app.alerts = data.alerts.filter((a) => a && typeof a.marketId === 'string'
        && Number.isFinite(a.threshold) && (a.dir === 'above' || a.dir === 'below'));
    }
    if (data.stats && Number.isInteger(data.stats.alertHits) && data.stats.alertHits >= 0) {
      stats = { alertHits: data.stats.alertHits };
    }
  } catch { /* a broken save must never break the app */ }
}

// ---------- rendering ----------

const screenEl = $('g2Screen');
const headerEl = $('g2Header');
const bodyEl = $('g2Body');
const footEl = $('g2Foot');
const statusEl = $('simStatus');

function draw() {
  const view = app.render();
  headerEl.textContent = view.header;
  bodyEl.innerHTML = '';
  for (const line of view.lines) {
    const div = document.createElement('div');
    div.className = 'g2-line' + (line.trimStart().startsWith('>') ? ' selected' : '');
    div.textContent = line || ' ';
    bodyEl.appendChild(div);
  }
  const time = app.updatedAt
    ? app.updatedAt.toLocaleTimeString('en-GB', { hour12: false })
    : '—';
  footEl.textContent = app.stale
    ? `Polymarket · fetch failed — last good ${time}`
    : `Polymarket · live · updated ${time}`;
  $('sessionInfo').textContent =
    `Watching ${app.watchlist.size} · Positions ${app.book.positionList().length} · Alerts ${app.alerts.length}`;
  updateTgPanel();
  updateScoreboard();
}

function after() {
  save();
  draw();
  hubPush();
}

// A short fade marks a screen change (opacity only; killed by low motion).
let lastScreen = '';
function drawWithFlash() {
  if (app.screen !== lastScreen) {
    lastScreen = app.screen;
    screenEl.classList.remove('flash');
    void screenEl.offsetWidth;
    screenEl.classList.add('flash');
  }
  after();
}

// ---------- data ----------

async function refresh(manual = false) {
  const btn = $('btnRefresh');
  if (manual) btn.disabled = true;
  try {
    const markets = await fetchMarkets();
    const queuedBefore = app.alertQueue.length;
    app.setMarkets(markets);
    // Any growth in the alert queue is a line that really crossed while
    // this browser held the alert — that is a board "hit", counted once.
    if (app.alertQueue.length > queuedBefore) {
      stats.alertHits += app.alertQueue.length - queuedBefore;
    }
    if (window.PolyGlanceScene) window.PolyGlanceScene.setMarkets(markets);
    lastFetchOk = true;
    statusEl.textContent = `Live odds loaded — ${markets.length} markets, refreshed ${new Date().toLocaleTimeString('en-GB', { hour12: false })}.`;
    const top = topByVolume(markets, 1)[0];
    if (top) {
      $('tickerText').textContent =
        `${top.question} — ${top.outcomes[0]} at ${fmtPct(top.prices[0])}, ${fmtMoney(top.volume24hr)} traded in 24h.`;
    }
    $('statMarkets').textContent = String(markets.length);
    $('statVolume').textContent = fmtMoney(markets.reduce((s, m) => s + m.volume24hr, 0));
  } catch (e) {
    app.markStale();
    lastFetchOk = false;
    statusEl.textContent = `Could not reach Polymarket (${e.message}). Showing the last good numbers; retrying automatically.`;
  } finally {
    if (manual) btn.disabled = false;
    after();
  }
}

// ---------- controls ----------

function act(fn) { return () => { fn(); drawWithFlash(); }; }

// Buttons give up focus after a click, so the keyboard shortcuts (Enter,
// Backspace) never re-trigger the last-clicked button.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) b.blur();
});

$('btnDown').addEventListener('click', act(() => app.scrollDown()));
$('btnUp').addEventListener('click', act(() => app.scrollUp()));
$('btnTap').addEventListener('click', act(() => app.click()));
$('btnDouble').addEventListener('click', act(() => app.doubleClick()));
$('btnRefresh').addEventListener('click', () => refresh(true));
$('btnReset').addEventListener('click', () => {
  if (!window.confirm('Reset the paper book, watchlist and alerts in this browser?')) return;
  const markets = app.markets;
  app.watchlist.clear();
  app.alerts = [];
  app.alertQueue = [];
  stats = { alertHits: 0 };
  app.book = new PaperBook();
  app.screen = 'glance';
  app.cursor = 0;
  if (markets.length) app.setMarkets(markets, app.updatedAt || new Date());
  statusEl.textContent = 'Paper book reset. Balance is $1,000 of paper money.';
  drawWithFlash();
});

document.querySelectorAll('.vchip').forEach((chip) => {
  chip.addEventListener('click', act(() => app.command(parseCommand(chip.dataset.cmd))));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); app.scrollDown(); drawWithFlash(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); app.scrollUp(); drawWithFlash(); }
  else if (e.key === 'Enter') { app.click(); drawWithFlash(); }
  else if (e.key === 'Backspace') { e.preventDefault(); app.doubleClick(); drawWithFlash(); }
});

// Voice: real speech recognition where the browser offers it; the chips above
// run the exact same parser everywhere else.
const micBtn = $('btnMic');
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRec) {
  micBtn.disabled = true;
  micBtn.textContent = '🎙 No mic API here — use the chips';
} else {
  micBtn.addEventListener('click', () => {
    const rec = new SpeechRec();
    rec.lang = 'en-GB';
    rec.interimResults = false;
    micBtn.disabled = true;
    micBtn.textContent = '🎙 Listening…';
    rec.onresult = (ev) => {
      const said = ev.results[0][0].transcript;
      const cmd = parseCommand(said);
      statusEl.textContent = cmd
        ? `Heard “${said}”.`
        : `Heard “${said}” — that is not a command I know. Try “next”, “watch this” or “bet ten on yes”.`;
      if (cmd) { app.command(cmd); drawWithFlash(); }
    };
    rec.onerror = () => { statusEl.textContent = 'Microphone did not work here. The command chips do the same thing.'; };
    rec.onend = () => { micBtn.disabled = false; micBtn.textContent = '🎙 Speak'; };
    rec.start();
  });
}

// ---------- motion ----------

const motionToggle = $('motionToggle');
function setMotion(low) {
  document.documentElement.dataset.motion = low ? 'low' : '';
  motionToggle.setAttribute('aria-pressed', String(low));
  motionToggle.lastChild.textContent = `Low motion: ${low ? 'on' : 'off'}`;
}
motionToggle.addEventListener('click', () => {
  setMotion(document.documentElement.dataset.motion !== 'low');
});
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setMotion(true);

// The one spatial moment: the display tilts a few degrees toward the pointer.
// Transform only, pointer-fine devices only, off under low motion.
const bezel = $('g2Bezel');
if (window.matchMedia('(pointer: fine)').matches) {
  $('simWrap').addEventListener('pointermove', (e) => {
    if (document.documentElement.dataset.motion === 'low') return;
    const r = bezel.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    bezel.style.transform = `rotateY(${dx * 5}deg) rotateX(${-dy * 4}deg)`;
  });
  $('simWrap').addEventListener('pointerleave', () => { bezel.style.transform = ''; });
}

// ---------- Your board (score, level, hits, top calls) ----------
// Gamification with its working shown: every number is computed from
// the watchlist, the alerts, the counted alert hits and the paper book
// at live prices (js/game.js). The board resets with the paper book.

const scoreNumEl = $('scoreNum');
const scoreLevelEl = $('scoreLevel');
const scoreNextEl = $('scoreNext');
const scoreBarEl = $('scoreBar');
const statHitsEl = $('statHits');
const statWatchingEl = $('statWatchingNow');
const scoreBreakdownEl = $('scoreBreakdown');
const callsListEl = $('callsList');
let lastScore = null;

function updateScoreboard() {
  const { pnl } = app.book.value(app.marketById);
  const watched = app.watchlist.size;
  const alerts = app.alerts.length;
  const score = scoreFor({ watched, alerts, alertHits: stats.alertHits, pnl });
  const lvl = levelFor(score);

  scoreNumEl.textContent = String(score);
  scoreLevelEl.textContent = lvl.name;
  scoreNextEl.textContent = lvl.next
    ? `${lvl.next.at - score} pts to ${lvl.next.name}`
    : 'top level';
  scoreBarEl.style.transform = `scaleX(${lvl.progress})`;
  statHitsEl.textContent = String(stats.alertHits);
  statWatchingEl.textContent = String(watched);
  scoreBreakdownEl.textContent =
    `${watched} watched × ${POINTS.watch} · ${alerts} alert${alerts === 1 ? '' : 's'} × ${POINTS.alert}` +
    ` · ${stats.alertHits} hit${stats.alertHits === 1 ? '' : 's'} × ${POINTS.hit}` +
    ` · paper P&L ${pnl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(pnl))} (${Math.round(pnl) >= 0 ? '+' : '−'}${Math.abs(Math.round(pnl))} pts)`;

  if (lastScore !== null && score !== lastScore) {
    scoreNumEl.classList.remove('bump');
    void scoreNumEl.offsetWidth;
    scoreNumEl.classList.add('bump');
  }
  lastScore = score;

  const calls = topCalls(app.book, app.marketById, 3);
  callsListEl.innerHTML = '';
  if (!calls.length) {
    const p = document.createElement('p');
    p.className = 'calls-empty';
    p.textContent = 'No paper calls yet. Place a paper bet and your best calls land here.';
    callsListEl.appendChild(p);
    return;
  }
  for (const c of calls) {
    const row = document.createElement('div');
    row.className = 'call-row';
    const q = document.createElement('span');
    q.className = 'call-q';
    q.textContent = `${c.outcome} · ${c.question}`;
    const v = document.createElement('span');
    v.className = 'call-pnl' + (c.pnl >= 0 ? ' up' : ' down');
    v.textContent = `${c.pnl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(c.pnl))}`;
    row.appendChild(q);
    row.appendChild(v);
    callsListEl.appendChild(row);
  }
}

// ---------- Telegram alerts panel ----------
// The watcher bot (watcher/) takes /alert commands in Telegram. This
// panel builds the exact command for the market on screen, so the user
// copies it instead of typing a long slug by hand. It works with no bot
// configured: the command text is the product. The bot link appears only
// once BOT_USERNAME is set in js/telegram.js.

const tgCurrentEl = $('tgCurrent');
const tgCommandEl = $('tgCommand');
const tgCopyBtn = $('btnCopyTg');
const tgStatusEl = $('tgStatus');
let tgCommand = '';

// Which market the panel talks about: the one open on the detail screen;
// else the market of the most recent alert still in the feed; else the
// biggest market by volume — so the panel always offers a real command
// once odds have loaded.
function panelMarket() {
  const open = app.detail();
  if (open) return open;
  for (let i = app.alerts.length - 1; i >= 0; i -= 1) {
    const m = app.marketById.get(app.alerts[i].marketId);
    if (m) return m;
  }
  return topByVolume(app.markets, 1)[0] || null;
}

function updateTgPanel() {
  const m = panelMarket();
  if (!m) {
    tgCommand = '';
    tgCurrentEl.textContent = 'When live odds load, the Telegram command for a market appears here.';
    tgCommandEl.textContent = '—';
    tgCopyBtn.disabled = true;
    return;
  }
  const info = panelAlert(m, app.alerts);
  tgCommand = alertCommandText(m, app.alerts);
  tgCurrentEl.textContent =
    `${m.question} — message me when ${alertSummary(m, app.alerts)}` +
    (info && info.alreadySet ? ' (the alert you set on this market).' : ' (the line “Set a price alert” would use).');
  tgCommandEl.textContent = tgCommand || '—';
  tgCopyBtn.disabled = !tgCommand;
}

tgCopyBtn.addEventListener('click', async () => {
  if (!tgCommand) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(tgCommand);
    ok = true;
  } catch { /* clipboard API refused — try the selection fallback */ }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = tgCommand;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  tgStatusEl.textContent = ok
    ? 'Copied. Paste it to the bot in Telegram.'
    : 'Copy did not work here — select the command above and copy it by hand.';
});

// The deep link exists only when a bot username is configured; while it
// is not, the row stays hidden rather than showing a dead control.
const tgLink = botLink();
if (tgLink) {
  $('tgBotLink').href = tgLink;
  $('tgBotRow').hidden = false;
}

// ---------- go ----------

load();
draw();
refresh();
setInterval(refresh, 30_000);

initEvenHub(app, after, (connected) => {
  if (connected) $('modeChip').textContent = 'Connected: Even App / simulator';
}).then((hub) => { hubPush = hub.push; hubPush(); });

// Scroll reveal — sections rise into view once. Progressive enhancement:
// the class is only added when IntersectionObserver exists, and the
// low-motion rules in the stylesheet cancel the transition, so nothing
// can be left hidden or moving for a reader who opted out of motion.
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.08 });
  document.querySelectorAll('.section, .board, .tg-panel').forEach((el) => {
    el.classList.add('reveal');
    io.observe(el);
  });
}
