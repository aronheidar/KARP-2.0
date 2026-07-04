// ─────────────────────────────────────────────────────────────
// build_ytsaga.js (LOTA 33) — dagleg YouTube-saga fyrirtækjarása, KEYLESS:
// áskrifendur af rásarsíðu + meðal-likes 3 nýjustu myndbanda úr RSS.
// Safnast í gogn/ytsaga.json {co:[{d,subs,likes3}]} (þak 400 punktar/rás) →
// fyrirtækjakortið getur sýnt áskrifendaþróun þegar saga er komin.
// Rásalistinn SAMI og YTCO í web/worker.js — haldið samstilltu í höndunum.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; karp.is dashboard; aronheidars@gmail.com)', 'Accept-Language': 'en' };
const YTCO = {
  // Eimskip: virk rás + gamla aðalrásin (21,9þ subs, þögul frá 2022) — samanlagt.
  'Eimskip': ['UCiPZhGeTpFL9wvvVR9uFQgA', 'UCJKK3LJ0Fs6UcWs6QMRWs8g'],
  'Icelandair': 'UC0auMGlERL_q9IfaYPysb1Q',
  'Play': 'UCHGNsNarIoZP3QuBzuqtHqg',
  'Landsvirkjun': 'UC9VZ9wDIJJ4LSXlK7Vgnjsw',
  'Síminn': 'UC9-sEuaG0dXpbcr0wScvMvg',
  'Nova': 'UCRijU8XCs80USak_fB7KziA',
  'Arion banki': 'UC3R4Nvk_EL7BODeuoYv0Q9w',
  'Íslandsbanki': 'UCvKAwqQCubhM-Hwayvcd2bA',
  'Ölgerðin': 'UCtTyhVmndlpjloldBtguR6Q',
  'Össur': 'UClVW7BGbRvC5-0kowu8quhw',
};
const parseSubs = (s) => {
  const m = String(s || '').match(/([\d.,]+)\s*([KM])?/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(',', '.')) * (/m/i.test(m[2] || '') ? 1e6 : m[2] ? 1e3 : 1));
};
// LOTA 40: YOUTUBE_API_KEY (umhverfi/.env) → nákvæmir áskrifendur úr channels.list í EINU kalli
function loadYtKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY.trim();
  try {
    const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^YOUTUBE_API_KEY=(.+)$/m);
    return m && !/SETTU/.test(m[1]) ? m[1].trim() : null;
  } catch (e) { return null; }
}
async function fetchApiSubs() {
  const key = loadYtKey();
  if (!key) return null;
  const ids = [...new Set(Object.values(YTCO).flatMap((v) => (Array.isArray(v) ? v : [v])))];
  try {
    const u = new URL('https://www.googleapis.com/youtube/v3/channels');
    u.searchParams.set('part', 'statistics'); u.searchParams.set('id', ids.join(',')); u.searchParams.set('maxResults', '50'); u.searchParams.set('key', key);
    const r = await fetch(u);
    if (!r.ok) return null;
    const j = await r.json();
    const m = {};
    for (const it of j.items || []) if (it.statistics && it.statistics.subscriberCount != null) m[it.id] = +it.statistics.subscriberCount;
    return m;
  } catch (e) { return null; }
}
async function main() {
  const G = path.join(__dirname, '..', 'gogn', 'ytsaga.json');
  let saga = {};
  try { saga = JSON.parse(fs.readFileSync(G, 'utf8')); } catch (e) {}
  const d = new Date().toISOString().slice(0, 10);
  const apiSubs = await fetchApiSubs(); // null = enginn lykill → skrap-fallback
  if (apiSubs) console.log('ytsaga: nákvæmir áskrifendur úr YouTube Data API (' + Object.keys(apiSubs).length + ' rásir)');
  let ok = 0;
  for (const [co, mapped] of Object.entries(YTCO)) {
    try {
      const ids = Array.isArray(mapped) ? mapped : [mapped];
      let subs = null;
      const allLikes = [];
      for (const id of ids) {
        const [page, rss] = await Promise.all([
          apiSubs ? Promise.resolve('') : fetch('https://www.youtube.com/channel/' + id + '/about', { headers: UA }).then((r) => (r.ok ? r.text() : '')),
          fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + id, { headers: UA }).then((r) => (r.ok ? r.text() : '')),
        ]);
        const s = apiSubs ? (apiSubs[id] != null ? apiSubs[id] : null) : parseSubs((page.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) || page.match(/([\d.,]+[KM]?) subscribers/) || [])[1]);
        if (s != null) subs = (subs || 0) + s;
        for (const m of rss.matchAll(/<media:starRating count="(\d+)"[^>]*>[\s\S]{0,40}/g)) allLikes.push(+m[1]);
      }
      const likes = allLikes.slice(0, 3);
      const likes3 = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
      if (subs == null && likes3 == null) continue;
      saga[co] = (saga[co] || []).filter((p) => p.d !== d);
      saga[co].push({ d, subs, likes3 });
      saga[co] = saga[co].slice(-400);
      ok++;
    } catch (e) {}
  }
  fs.writeFileSync(G, JSON.stringify(saga));
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'ytsaga.json'), JSON.stringify(saga));
  console.log('ytsaga:', ok, 'af', Object.keys(YTCO).length, 'rásum skráðar fyrir', d);
}
main().catch((e) => { console.error(e); process.exit(1); });
