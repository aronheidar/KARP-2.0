// karp21 Worker (LOTA 13): þjónar static-assets ÁFRAM en bætir við smá-proxy-um
// fyrir lifandi gögn sem hafa ekki CORS fyrir app.karp.is. Skyndiminni í caches.default.
const PROXIES = {
  // ✈️ OpenSky: lifandi flug yfir Íslandi (bbox). 5-mín cache heldur okkur innan kvóta.
  '/api/flug': {
    url: 'https://opensky-network.org/api/states/all?lamin=62.5&lomin=-26&lamax=67.5&lomax=-12',
    ttl: 300,
  },
  // 📋 Útboðsvefur (WP REST): nýjustu útboð — 30 mín cache
  '/api/utbod': {
    url: 'https://utbodsvefur.is/wp-json/wp/v2/posts?per_page=20&_fields=id,date,title,link',
    ttl: 1800,
  },
  // 🌍 Google News: Ísland í erlendum miðlum (RSS) — 15 mín cache
  '/api/erlent': {
    url: 'https://www.bing.com/news/search?q=Iceland&format=rss',
    ttl: 900,
    type: 'text/xml; charset=utf-8',
  },
  // 📄 TED: EES-útboð á Íslandi — POST í uppruna, GET út — 60 mín cache
  '/api/ted': {
    url: 'https://api.ted.europa.eu/v3/notices/search',
    ttl: 3600,
    post: JSON.stringify({ query: 'place-of-performance IN (ISL) SORT BY publication-date DESC', fields: ['publication-number', 'notice-title', 'publication-date'], limit: 20 }),
  },
  // 🏛️ Alþingi: lifandi málalisti þingsins (XML) — 10 mín cache
  '/api/thingmal': {
    url: 'https://www.althingi.is/altext/xml/thingmalalisti/?lthing=157',
    ttl: 600,
    type: 'text/xml; charset=utf-8',
  },
  // 💬 Samráðsgátt: nýjustu mál í samráði — opin GraphQL-gátt island.is — 30 mín cache
  '/api/samrad': {
    url: 'https://island.is/api/graphql',
    ttl: 1800,
    post: JSON.stringify({ query: 'query { consultationPortalGetCases(input: {pageSize: 15, pageNumber: 0}) { total cases { id caseNumber name statusName typeName institutionName adviceCount created processEnds } } }' }),
  },
};

// ⚖️ Dómavakt: Hæstiréttur + Landsréttur bera nýjustu dóma í __NEXT_DATA__ á
// /domar/-síðunum (sama Next.js-vél). Sótt samhliða, aðeins visibleVerdicts
// skilað (örfá KB í stað ~850 KB á síðu). 45 mín cache.
const DOMAR = [
  { key: 'hr', url: 'https://www.haestirettur.is/domar/' },
  { key: 'lr', url: 'https://www.landsrettur.is/domar-og-urskurdir/' },
];
function extractVerdicts(html) {
  const i = html.indexOf('__NEXT_DATA__');
  if (i < 0) return [];
  const m = html.slice(i).match(/>({[\s\S]*?})<\/script>/);
  if (!m) return [];
  let j;
  try { j = JSON.parse(m[1]); } catch (e) { return []; }
  const find = (o, d) => {
    if (!o || typeof o !== 'object' || d > 12) return null;
    if (Array.isArray(o.visibleVerdicts)) return o.visibleVerdicts;
    for (const k of Object.keys(o)) { const r = find(o[k], d + 1); if (r) return r; }
    return null;
  };
  return (find(j.props, 0) || []).map((v) => ({
    id: v.id, nr: v.caseNumber, titill: v.title, dags: v.verdictDate,
    efnisord: (v.keywords || []).slice(0, 4),
    um: String(v.presentings || '').slice(0, 220),
  }));
}
async function domarHandler(ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/domar');
  let res = await cache.match(cacheKey);
  if (res) return res;
  const out = { updated: new Date().toISOString() };
  let anyOk = false;
  await Promise.all(DOMAR.map(async (c) => {
    try {
      const up = await fetch(c.url, { headers: { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)' } });
      const list = up.ok ? extractVerdicts(await up.text()) : [];
      out[c.key] = list;
      if (list.length) anyOk = true;
    } catch (e) { out[c.key] = []; }
  }));
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=2700' },
  });
  if (anyOk) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/domar') return domarHandler(ctx);
    const proxy = PROXIES[url.pathname];
    if (proxy) {
      const cache = caches.default;
      const cacheKey = new Request('https://cache.karp.internal' + url.pathname);
      let res = await cache.match(cacheKey);
      if (!res) {
        try {
          const up = await fetch(proxy.url, {
            method: proxy.post ? 'POST' : 'GET',
            headers: { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)', ...(proxy.post ? { 'Content-Type': 'application/json' } : {}) },
            body: proxy.post || undefined,
          });
          const body = await up.text();
          res = new Response(up.ok ? body : JSON.stringify({ error: up.status }), {
            status: 200,
            headers: {
              'content-type': proxy.type || 'application/json; charset=utf-8',
              'access-control-allow-origin': '*',
              'cache-control': `public, max-age=${proxy.ttl}`,
            },
          });
          if (up.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
        } catch (e) {
          res = new Response(JSON.stringify({ error: 'upstream' }), { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
        }
      }
      return res;
    }
    return env.ASSETS.fetch(request);
  },
};
