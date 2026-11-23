// PolyGlance browser face — landing page + G2 simulator.
// One GlanceApp (js/core.js) drives everything; this file only draws it,
// wires the controls, fetches live data and keeps the session in localStorage.

import { GlanceApp, PaperBook, parseCommand, fmtMoney, fmtPct, topByVolume } from './core.js';
import { fetchMarkets } from './data.js';
import { initEvenHub } from './evenhub.js';

const STORE_KEY = 'polyglance-v1';
const $ = (id) => document.getElementById(id);

const app = new GlanceApp();
let hubPush = () => {};
let lastFetchOk = null;

// ---------- persistence (this browser only) ----------

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      watchlist: [...app.watchlist],
      book: app.book.toJSON(),
      alerts: app.alerts,
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
    app.setMarkets(markets);
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

// ---------- go ----------

load();
draw();
refresh();
setInterval(refresh, 30_000);

initEvenHub(app, after, (connected) => {
  if (connected) $('modeChip').textContent = 'Connected: Even App / simulator';
}).then((hub) => { hubPush = hub.push; hubPush(); });
