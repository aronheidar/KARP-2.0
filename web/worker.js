// karp21 Worker (LOTA 13): þjónar static-assets ÁFRAM en bætir við smá-proxy-um
// fyrir lifandi gögn sem hafa ekki CORS fyrir karp.is. Skyndiminni í caches.default.
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
// 🤖 Spyrðu Karp: grundað spjall — svarar EINGÖNGU úr samhengispakka síðunnar
// (web/public/gogn/spyrdu_context.json, bakaður úr gogn/ við hverja byggingu).
// Lykill er CF-secret (ANTHROPIC_API_KEY) — sé hann ósettur svarar veitan
// {error:'unconfigured'} og framendinn birtir „í gangsetningu". 20 svör/dag/IP.
let SPYRDU_CTX = null;
const sjson = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'https://karp.is' },
});
async function spyrduHandler(request, env, ctx) {
  if (request.method !== 'POST') return sjson({ error: 'post' });
  if (!env.ANTHROPIC_API_KEY) return sjson({ error: 'unconfigured' });
  let q = '', prev = null;
  try {
    const body = (await request.json()) || {};
    q = String(body.q || '').trim();
    // LOTA 23: EIN framhaldsspurning — síðasta spurning+svar fylgja með sem samhengi
    if (body.prev && body.prev.q && body.prev.a) prev = { q: String(body.prev.q).slice(0, 300), a: String(body.prev.a).slice(0, 1200) };
  } catch (e) { return sjson({ error: 'body' }); }
  if (q.length < 3 || q.length > 300) return sjson({ error: 'lengd' });
  // Dagskvóti á IP (cache-byggt, per-gagnaver — gróft en heiðarlegt öryggisnet)
  const cache = caches.default;
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'x';
  const ipKey = new Request('https://cache.karp.internal/spyrdu-ip/' + day + '/' + encodeURIComponent(ip));
  const qhit = await cache.match(ipKey);
  const n = qhit ? parseInt(await qhit.text(), 10) || 0 : 0;
  if (n >= 20) return sjson({ error: 'kvoti' });
  ctx.waitUntil(cache.put(ipKey, new Response(String(n + 1), { headers: { 'cache-control': 'public, max-age=86400' } })));
  if (!SPYRDU_CTX) {
    try { SPYRDU_CTX = await (await env.ASSETS.fetch(new Request('https://karp.internal/gogn/spyrdu_context.json'))).json(); } catch (e) { SPYRDU_CTX = { text: '', pages: '', updated: '' }; }
  }
  const sys = 'Þú ert „Karp“, aðstoðarmaður á íslenska hagvísavefnum karp.is. Svaraðu á íslensku, stutt og skýrt (að hámarki ~120 orð). Notaðu EINGÖNGU staðreyndirnar hér að neðan og vísaðu á viðeigandi undirsíðu vefjarins (t.d. /verdlag/). Ef svarið er ekki í staðreyndunum: segðu það hreinskilnislega og bentu á líklegustu síðu til að skoða. Aldrei giska á tölur. Þú veitir hvorki fjármála- né lögfræðiráðgjöf.\n\nSTAÐREYNDIR KARP (' + (SPYRDU_CTX.updated || '') + '):\n' + SPYRDU_CTX.text + '\n\nSÍÐUR VEFJARINS:\n' + SPYRDU_CTX.pages;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 600, system: sys, messages: prev ? [{ role: 'user', content: prev.q }, { role: 'assistant', content: prev.a }, { role: 'user', content: q }] : [{ role: 'user', content: q }] }),
    });
    if (!res.ok) return sjson({ error: 'ai', status: res.status });
    const j = await res.json();
    const text = (j.content || []).map((b) => b.text || '').join('').trim();
    return sjson({ svar: text });
  } catch (e) {
    return sjson({ error: 'ai' });
  }
}

// 💸 Greiðsluvakt: opnirreikningar.is (Fjársýslan) — DataTables-bakendinn svarar
// GET /data_pagination_search sé FULLT DataTables-sett sent OG tímabil (DD.MM.YYYY;
// tómt tímabil → 500). Glugginn reiknast af /rest/max_time_period. 3 klst cache.
function dtQuery(fra, til) {
  const cols = ['org_name', 'check_date', 'vendor_name', 'invoice_amount', 'check_amount', '5'];
  const P = new URLSearchParams();
  P.set('draw', '1');
  cols.forEach((c, i) => {
    P.set(`columns[${i}][data]`, c);
    P.set(`columns[${i}][name]`, '');
    P.set(`columns[${i}][searchable]`, 'true');
    P.set(`columns[${i}][orderable]`, i < 5 ? 'true' : 'false');
    P.set(`columns[${i}][search][value]`, '');
    P.set(`columns[${i}][search][regex]`, 'false');
  });
  P.set('order[0][column]', '1'); P.set('order[0][dir]', 'desc');
  P.set('start', '0'); P.set('length', '20');
  P.set('search[value]', ''); P.set('search[regex]', 'false');
  P.set('vendor_id', ''); P.set('type_id', ''); P.set('org_id', '');
  P.set('timabil_fra', fra); P.set('timabil_til', til);
  return P.toString();
}
const ddmmyyyy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
async function greidslurHandler(ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/greidslur');
  let res = await cache.match(cacheKey);
  if (res) return res;
  try {
    const H = { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
    let maxD = new Date();
    try {
      const mt = (await (await fetch('https://opnirreikningar.is/rest/max_time_period', { headers: H })).text()).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(mt)) maxD = new Date(mt + 'T12:00:00Z');
    } catch (e) {}
    const fraD = new Date(maxD.getTime() - 45 * 86400000);
    const up = await fetch('https://opnirreikningar.is/data_pagination_search?' + dtQuery(ddmmyyyy(fraD), ddmmyyyy(maxD)), { headers: H });
    const j = up.ok ? await up.json() : null;
    const rows = ((j && j.data) || []).map((r) => ({
      stofnun: r.org_name, birgir: r.vendor_name, dags: r.check_date,
      upph: r.invoice_amount, lysing: String(r.invoice_description || '').slice(0, 90),
    }));
    res = new Response(JSON.stringify({ til: maxD.toISOString().slice(0, 10), rows }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=10800' },
    });
    if (rows.length) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream' }), { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
  }
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

// 🩺 Villu-beacon (LOTA 23): framendinn sendir client-villur hingað; þær fara í
// console.error → sjást í Cloudflare Live Logs / wrangler tail. Engin geymsla,
// engin persónugögn — bara skilaboð, slóð og user-agent-stytting. 5/mín/IP.
async function villaHandler(request, ctx) {
  if (request.method !== 'POST') return sjson({ ok: false });
  try {
    const cache = caches.default;
    const ip = request.headers.get('cf-connecting-ip') || 'x';
    const min = new Date().toISOString().slice(0, 16);
    const k = new Request('https://cache.karp.internal/villa/' + encodeURIComponent(ip) + '/' + min);
    const prev = await cache.match(k);
    const n = prev ? parseInt(await prev.text(), 10) || 0 : 0;
    if (n >= 5) return sjson({ ok: false });
    ctx.waitUntil(cache.put(k, new Response(String(n + 1), { headers: { 'cache-control': 'public, max-age=60' } })));
    const b = (await request.json()) || {};
    console.error('[karp-villa]', JSON.stringify({ m: String(b.m || '').slice(0, 300), u: String(b.u || '').slice(0, 120), ua: (request.headers.get('user-agent') || '').slice(0, 80) }));
    return sjson({ ok: true });
  } catch (e) { return sjson({ ok: false }); }
}

// 📺 YouTube-fyrirtækjagreining (LOTA 33): rásatölfræði fyrir Umfjöllun —
// ALLT ÁN LYKLA: RSS ber áhorf + likes (starRating) per myndband, rásarsíðan
// ber áskrifendafjölda. Valfrjáls YOUTUBE_API_KEY (CF-secret) bætir við
// nákvæmum tölum + fjölda ummæla (videos.list). 6 klst cache per fyrirtæki.
const YTCO = {
  // Eimskip á TVÆR rásir: virka (nýtt efni 2026, fáir subs) + gömlu aðalrásina
  // (21,9þ subs, þögul síðan 2022) — samanlagt gefur rétta markaðsmynd.
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
function parseSubs(s) {
  const m = String(s || '').match(/([\d.,]+)\s*([KM])?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Math.round(n * (m[2] === 'M' || m[2] === 'm' ? 1e6 : m[2] ? 1e3 : 1));
}
async function ytstatsHandler(request, env, ctx) {
  const co = new URL(request.url).searchParams.get('co') || '';
  const mapped = YTCO[co];
  if (!mapped) return sjson({ channel: null });
  const ids = Array.isArray(mapped) ? mapped : [mapped];
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/ytstats/v2/' + encodeURIComponent(co));
  let res = await cache.match(cacheKey);
  if (res) return res;
  const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; karp.is dashboard; aronheidars@gmail.com)' };
  const out = { channel: { id: ids[0], subs: null, subsRaw: '', chans: ids.length }, videos: [], api: false };
  try {
    let subsSum = 0, subsAny = false;
    await Promise.all(ids.map(async (chId) => {
      const [rssR, pageR] = await Promise.all([
        fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + chId, { headers: UA }),
        fetch('https://www.youtube.com/channel/' + chId + '/about', { headers: { ...UA, 'Accept-Language': 'en' } }),
      ]);
      if (rssR.ok) {
        const xml = await rssR.text();
        for (const entry of xml.split('<entry>').slice(1)) {
          const t = (entry.match(/<title>([^<]+)<\/title>/) || [])[1];
          const u = (entry.match(/<link rel="alternate" href="([^"]+)"/) || [])[1];
          const d = ((entry.match(/<published>([^<]+)<\/published>/) || [])[1] || '').slice(0, 10);
          const views = +((entry.match(/<media:statistics views="(\d+)"/) || [])[1] || 0);
          const likes = +((entry.match(/<media:starRating count="(\d+)"/) || [])[1] || 0);
          const vid = (entry.match(/<yt:videoId>([^<]+)/) || [])[1] || '';
          if (t && u) out.videos.push({ id: vid, t, u, d, views, likes });
        }
      }
      if (pageR.ok) {
        const html = await pageR.text();
        const raw = (html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) || html.match(/([\d.,]+[KM]?) subscribers/) || [])[1] || '';
        const n = parseSubs(raw.replace(/ subscribers?/i, ''));
        if (n != null) { subsSum += n; subsAny = true; }
      }
    }));
    out.videos.sort((a, b) => String(b.d).localeCompare(String(a.d)));
    if (subsAny) {
      out.channel.subs = subsSum;
      out.channel.subsRaw = (subsSum >= 1e6 ? (Math.round(subsSum / 1e5) / 10).toString().replace('.', ',') + ' m' : subsSum >= 1000 ? (Math.round(subsSum / 100) / 10).toString().replace('.', ',') + ' þús.' : String(subsSum)) + (ids.length > 1 ? ' (samanlagt á ' + ids.length + ' rásum)' : '');
    }
    // Valfrjáls nákvæmni: opinbert Data API (frír lykill) → ummæli + nákvæm like
    if (env.YOUTUBE_API_KEY && out.videos.length) {
      try {
        const ids = out.videos.slice(0, 15).map((v) => v.id).filter(Boolean).join(',');
        const ar = await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics&id=' + ids + '&key=' + env.YOUTUBE_API_KEY);
        if (ar.ok) {
          const aj = await ar.json();
          const st = {}; (aj.items || []).forEach((it) => { st[it.id] = it.statistics || {}; });
          out.videos.forEach((v) => { const s = st[v.id]; if (s) { v.views = +s.viewCount || v.views; v.likes = +s.likeCount || v.likes; v.comments = s.commentCount != null ? +s.commentCount : undefined; } });
          out.api = true;
        }
      } catch (e) {}
    }
  } catch (e) {}
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=21600' },
  });
  if (out.videos.length || out.channel.subs != null) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // LEIÐ A (lénaflutningur): app.karp.is og www.karp.is 301-a á karp.is —
    // SEO-flutningurinn sjálfur. Gamla WP-mælaborðið fær möppun á forsíðuna.
    if (url.hostname === 'app.karp.is' || url.hostname === 'www.karp.is') {
      url.hostname = 'karp.is';
      return Response.redirect(url.toString(), 301);
    }
    if (/^\/hagvisir\/?$/.test(url.pathname)) return Response.redirect('https://karp.is/', 301);
    if (url.pathname === '/api/villa') return villaHandler(request, ctx);
    if (url.pathname === '/api/domar') return domarHandler(ctx);
    if (url.pathname === '/api/greidslur') return greidslurHandler(ctx);
    if (url.pathname === '/api/spyrdu') return spyrduHandler(request, env, ctx);
    if (url.pathname === '/api/ytstats') return ytstatsHandler(request, env, ctx);
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
