// build_eftirlit_hnit.js (LOTA 92) — hnitar heimilisföng Eftirlitsvaktarinnar fyrir Leaflet-kort.
// FORGANGUR: opna Staðfangaskráin (gogn/stadfong_rvk.json úr build_stadfong.js — FRÍTT, engin köll).
// FALLBACK: Google Geocoding / Mapbox (lykill úr env) fyrir það fáa sem Staðfangaskráin nær ekki.
// MERGE-ar lat/lng í eftirlit.json (+ public). Varanlegt cache gogn/eftirlit_hnit.json f. API-treff.
//
// LYKLAR (valfrjálst — Staðfangaskráin nær megninu ein):
//   GOOGLE_GEOCODE_KEY (eða GEOCODE_KEY) — Google Geocoding · MAPBOX_TOKEN — Mapbox
// KEYRSLA (á EFTIR build_eftirlit.js + build_stadfong.js): node skriptur/build_eftirlit_hnit.js
const fs = require('fs');
const path = require('path');
const G = path.join(__dirname, '..', 'gogn');
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
const IN = path.join(G, 'eftirlit.json');
const CACHE = path.join(G, 'eftirlit_hnit.json');
const SF_FILE = path.join(G, 'stadfong_rvk.json');
const GKEY = process.env.GOOGLE_GEOCODE_KEY || process.env.GEOCODE_KEY || '';
const MKEY = process.env.MAPBOX_TOKEN || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
const rnd = (n) => Math.round(n * 1e6) / 1e6;

// ── Staðfangaskrá-uppfletting (frítt) ──
const SF = fs.existsSync(SF_FILE) ? (JSON.parse(fs.readFileSync(SF_FILE, 'utf8')).idx || {}) : null;
function parseAddr(street) {
  let s = String(street || '').replace(/,\s*\d{3}\s*$/, '').trim();   // strjúka aftasta póstnr
  if (s.includes(',')) s = s.split(',').pop().trim();                 // götu á eftir nafn-forskeyti
  const m = s.match(/^(.+?)\s+(\d+)\s*([a-záðéíóúýþæö])?/i);
  if (!m) return null;
  return { street: m[1].trim(), hm: m[2] + (m[3] ? m[3].toUpperCase() : '') };
}
function fromSF(street, postnr) {
  if (!SF) return null;
  const p = parseAddr(street); if (!p) return null;
  const s = norm(p.street), hm = norm(p.hm);
  return SF[s + '|' + hm + '|' + (postnr || '')] || SF[s + '|' + hm] || null;
}

// ── API-fallback ──
async function apiGeocode(q) {
  if (GKEY) {
    const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?region=is&language=is&address=' + encodeURIComponent(q) + '&key=' + GKEY);
    const j = await r.json().catch(() => null);
    if (j && j.status === 'OK' && j.results && j.results[0]) { const l = j.results[0].geometry.location; return [rnd(l.lat), rnd(l.lng)]; }
    if (j && (j.status === 'OVER_QUERY_LIMIT' || j.status === 'RESOURCE_EXHAUSTED')) throw new Error('limit');
    return null;
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
  if (!fs.existsSync(IN)) { console.log('vantar eftirlit.json — keyrðu build_eftirlit.js fyrst'); return; }
  if (!SF && !GKEY && !MKEY) { console.log('build_eftirlit_hnit: hvorki Staðfangaskrá (build_stadfong.js) né API-lykill — sleppi.'); return; }
  const data = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

  // Einstök heimilisföng
  const addrs = new Map();
  for (const s of data.stadir || []) { if (!s.street) continue; const key = norm(s.street + '|' + (s.postnr || '')); if (!addrs.has(key)) addrs.set(key, s); }

  let sfHit = 0, apiHit = 0, miss = 0, apiTodo = [];
  for (const [key, s] of addrs) {
    if (key in cache) continue;                             // þegar leyst (API-treff)
    const c = fromSF(s.street, s.postnr);
    if (c) { cache[key] = c; sfHit++; }                     // Staðfangaskrá (frítt)
    else apiTodo.push([key, s]);                            // reyna API síðar
  }
  console.log('Staðfangaskrá: ' + sfHit + ' hnituð beint · ' + apiTodo.length + ' eftir í API' + (GKEY ? ' (Google)' : MKEY ? ' (Mapbox)' : ' (enginn lykill → sleppt)'));

  if (GKEY || MKEY) {
    let i = 0;
    for (const [key, s] of apiTodo) {
      i++;
      const q = s.street.replace(/,.*$/, '') + (s.postnr ? ', ' + s.postnr : '') + ' ' + (s.city || 'Reykjavík') + ', Ísland';
      try { const c = await apiGeocode(q); cache[key] = c; if (c) apiHit++; else miss++; }
      catch (e) { console.log('  … API-þak, bíð 12s'); fs.writeFileSync(CACHE, JSON.stringify(cache)); await sleep(12000); i--; continue; }
      if (i % 25 === 0 || i === apiTodo.length) fs.writeFileSync(CACHE, JSON.stringify(cache));
      await sleep(120);
    }
  } else { for (const [key] of apiTodo) if (!(key in cache)) miss++; }
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  // MERGE hnit inn í eftirlit.json (+ public)
  let n = 0;
  for (const s of data.stadir || []) {
    const c = s.street ? cache[norm(s.street + '|' + (s.postnr || ''))] : null;
    if (c) { s.lat = c[0]; s.lng = c[1]; n++; } else { delete s.lat; delete s.lng; }
  }
  data.withHnit = n;
  const str = JSON.stringify(data);
  [G, PUB].forEach((d) => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'eftirlit.json'), str); });
  console.log('eftirlit.json — ' + n + '/' + (data.stadir || []).length + ' staðir á korti (Staðfangaskrá ' + sfHit + ' + API ' + apiHit + ', ' + miss + ' fundust ekki)');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
