// PolyGlance data layer — Polymarket Gamma API (public, no key, CORS open).
// Docs: https://docs.polymarket.com — GET /markets on gamma-api.polymarket.com.

import { parseMarkets } from './core.js';

export const GAMMA_URL =
  'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=40&order=volume24hr&ascending=false';

export async function fetchMarkets(fetchImpl = fetch, url = GAMMA_URL, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Gamma API answered ${res.status}`);
    const json = await res.json();
    const markets = parseMarkets(json);
    if (!markets.length) throw new Error('Gamma API returned no usable markets');
    return markets;
  } finally {
    clearTimeout(timer);
  }
}
