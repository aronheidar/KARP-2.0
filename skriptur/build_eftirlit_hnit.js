// build_eftirlit_hnit.js (LOTA 91) — hnitar heimilisföng Eftirlitsvaktarinnar fyrir Leaflet-kort.
// Notar HNITUNAR-API (Google Geocoding EÐA Mapbox) með lykli úr umhverfisbreytu (secret í CI).
// VARANLEGT cache (gogn/eftirlit_hnit.json) → aðeins NÝ heimilisföng hnituð hverju sinni.
// MERGE-ar lat/lng inn í eftirlit.json (+ public). INERT ef enginn lykill (sleppir hljóðlaust).
//
// LYKLAR (settu ANNAN í .env / GitHub secret / Cloudflare):
//   GOOGLE_GEOCODE_KEY  (eða GEOCODE_KEY)  — Google Geocoding API (nákvæmast f. íslensk heimilisföng)
//   MAPBOX_TOKEN                            — Mapbox Geocoding (fríþak 100k/mán)
// KEYRSLA (á EFTIR build_eftirlit.js):  node skriptur/build_eftirlit_hnit.js
const fs = require('fs');
const path = require('path');
const G = path.join(__dirname, '..', 'gogn');
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
const IN = path.join(G, 'eftirlit.json');
const CACHE = path.join(G, 'eftirlit_hnit.json');
const GKEY = process.env.GOOGLE_GEOCODE_KEY || process.env.GEOCODE_KEY || '';
const MKEY = process.env.MAPBOX_TOKEN || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const rnd = (n) => Math.round(n * 1e6) / 1e6;

async function geocode(q) {
  if (GKEY) {
    const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?region=is&language=is&address=' + encodeURIComponent(q) + '&key=' + GKEY);
    const j = await r.json().catch(() => null);
    if (j && j.status === 'OK' && j.results && j.results[0]) { const l = j.results[0].geometry.location; return [rnd(l.lat), rnd(l.lng)]; }
    if (j && (j.status === 'OVER_QUERY_LIMIT' || j.status === 'RESOURCE_EXHAUSTED')) throw new Error('limit');
    return null;                                              // ZERO_RESULTS o.fl. → ekkert (cache-a sem null)
  }
  if (MKEY) {
    const r = await fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(q) + '.json?country=is&limit=1&language=is&access_token=' + MKEY);
    if (r.status === 429) throw new Error('limit');
    const j = await r.json().catch(() => null);
    if (j && j.features && j.features[0] && j.features[0].center) { const c = j.features[0].center; return [rnd(c[1]), rnd(c[0])]; }
    return null;
  }
  return null;
}

(async () => {
  if (!GKEY && !MKEY) { console.log('build_eftirlit_hnit: enginn hnitunar-lykill (GOOGLE_GEOCODE_KEY/MAPBOX_TOKEN) — sleppi (kort óvirkt þar til lykill er settur).'); return; }
  if (!fs.existsSync(IN)) { console.log('vantar eftirlit.json — keyrðu build_eftirlit.js fyrst'); return; }
  const data = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

  const addrs = new Map();
  for (const s of data.stadir || []) {
    if (!s.street) continue;
    const key = norm(s.street + '|' + (s.postnr || ''));
    if (!addrs.has(key)) addrs.set(key, s.street.replace(/,.*$/, '') + (s.postnr ? ', ' + s.postnr : '') + ' ' + (s.city || 'Reykjavík') + ', Ísland');
  }
  const todo = [...addrs].filter(([k]) => !(k in cache));
  console.log('hnita ' + todo.length + ' ný heimilisföng (af ' + addrs.size + ') · lykill: ' + (GKEY ? 'Google' : 'Mapbox'));

  let ok = 0, i = 0;
  for (const [key, q] of todo) {
    i++;
    try { const c = await geocode(q); cache[key] = c; if (c) ok++; }
    catch (e) { console.log('  … þak, bíð 12s'); fs.writeFileSync(CACHE, JSON.stringify(cache)); await sleep(12000); i--; continue; }
    if (i % 50 === 0 || i === todo.length) { fs.writeFileSync(CACHE, JSON.stringify(cache)); console.log('  [' + i + '/' + todo.length + '] ' + ok + ' hnituð'); }
    await sleep(120);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  let n = 0;
  for (const s of data.stadir || []) {
    const c = s.street ? cache[norm(s.street + '|' + (s.postnr || ''))] : null;
    if (c) { s.lat = c[0]; s.lng = c[1]; n++; } else { delete s.lat; delete s.lng; }
  }
  data.withHnit = n;
  const str = JSON.stringify(data);
  [G, PUB].forEach((d) => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'eftirlit.json'), str); });
  fs.writeFileSync(path.join(PUB, 'eftirlit_hnit.json'), JSON.stringify(cache));
  const found = Object.values(cache).filter(Boolean).length;
  console.log('eftirlit_hnit.json — ' + Object.keys(cache).length + ' heimilisföng (' + found + ' m/hnit) | eftirlit.json: ' + n + '/' + (data.stadir || []).length + ' staðir á korti');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
