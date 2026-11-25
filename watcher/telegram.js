// PolyGlance watcher — Telegram Bot API client.
// The token is passed in by watcher.js from the environment. It is used
// only to build request URLs inside this module and is never logged:
// errors report the HTTP status, never the URL (the URL holds the token).

export function createTelegram(token, fetchImpl = fetch, base = 'https://api.telegram.org') {
  async function call(method, payload) {
    let res;
    try {
      res = await fetchImpl(`${base}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error(`Telegram API unreachable (network error on ${method})`);
    }
    if (!res.ok) throw new Error(`Telegram API answered ${res.status} on ${method}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram API refused ${method}: ${data.description || 'unknown error'}`);
    return data.result;
  }

  // Long-poll for updates. Resolves with the update array (may be empty).
  function getUpdates(offset, timeoutSec = 50) {
    return call('getUpdates', {
      offset,
      timeout: timeoutSec,
      allowed_updates: ['message'],
    });
  }

  function sendMessage(chatId, text) {
    return call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
  }

  return { getUpdates, sendMessage };
}
