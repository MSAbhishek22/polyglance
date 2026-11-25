// PolyGlance watcher — Polymarket Gamma API client (public, no key).
// Same data source as the app. The parser is the app's own (js/core.js),
// so the watcher and the glasses never disagree about what a market is.

import { parseMarket } from '../js/core.js';

export const GAMMA_BASE = 'https://gamma-api.polymarket.com';

export function createGamma(fetchImpl = fetch, base = GAMMA_BASE) {
  async function getJson(url) {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Gamma API answered ${res.status}`);
    return res.json();
  }

  // Resolve a market slug or numeric id to a parsed market, or null when
  // Polymarket has no such market. A numeric ref is tried as an id first,
  // anything else as a slug first; the other shape is the fallback.
  async function resolveMarket(ref) {
    const r = String(ref || '').trim();
    if (!r) return null;
    const byId = async () => {
      const raw = await getJson(`${base}/markets/${encodeURIComponent(r)}`);
      return parseMarket(raw);
    };
    const bySlug = async () => {
      const raw = await getJson(`${base}/markets?slug=${encodeURIComponent(r)}`);
      return parseMarket(Array.isArray(raw) ? raw[0] : null);
    };
    const order = /^\d+$/.test(r) ? [byId, bySlug] : [bySlug, byId];
    for (const tryOne of order) {
      try {
        const m = await tryOne();
        if (m) return m;
      } catch { /* fall through to the other shape */ }
    }
    return null;
  }

  // Current Yes price (first outcome) for a market id, or null when the
  // market cannot be read right now. Callers skip the alert this cycle —
  // a missing price is never replaced with a guessed one.
  async function yesPrice(marketId) {
    try {
      const raw = await getJson(`${base}/markets/${encodeURIComponent(marketId)}`);
      const m = parseMarket(raw);
      return m ? m.prices[0] : null;
    } catch {
      return null;
    }
  }

  return { resolveMarket, yesPrice };
}
