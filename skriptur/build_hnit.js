// build_hnit.js (LOTA 68) — GPS-hnit + hverfi á hvert heimilisfang úr staðfangaskrá.
// Heimild: stadfangaskra_extra (Gagnaþjónusta Reykjavíkurborgar, vikulega uppfærð spegluð
// útgáfa af staðfangaskrá HMS m/WGS84-hnitum + LUKR-hverfaheitum fyrir Reykjavík).
// https://github.com/rvkdata/stadfangaskra_extra (7,8MB CSV, uppfærð sunnudagskvöld)
//
// Úttak: web/public/gogn/hnit/<pn>.json = { "skeiðarvogur 1": [lat, lng, "Vogar"?], … }
// → fasteignavaktin: kort í verðmatsskýrslu, fjarlægð á sambærilegar, hverfi á eignaspjald.
//
// KEYRSLA: node skriptur/build_hnit.js  (vikulega nægir — hnit breytast nánast aldrei)

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'hnit');
const URL = 'https://raw.githubusercontent.com/rvkdata/stadfangaskra_extra/master/stadfangaskra_extra_complete.csv';   // _complete = allt landið (7,8MB útgáfan er Rvk-only)

// RFC4180-þolinn línu-þáttari (gildi geta verið "..." með kommum inni)
function parseLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

(async () => {
  console.log('sæki staðfangaskrá (~8MB)…');
  const r = await fetch(URL, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = await r.text();
  const lines = txt.split(/\r?\n/);
  const H = parseLine(lines[0]);
  const i = {
    pn: H.indexOf('POSTNR'), heiti: H.indexOf('HEITI_NF'), husnr: H.indexOf('HUSNR'), bokst: H.indexOf('BOKST'),
    lat: H.indexOf('N_HNIT_WGS84'), lng: H.indexOf('E_HNIT_WGS84'), hverfi: H.indexOf('LUKR_HVERFAHEITI_HEITI'),
  };
  if (i.lat < 0 || i.heiti < 0) throw new Error('dálkar fundust ekki — hausinn breyttist? ' + H.slice(0, 8).join(','));
  const byPn = {};
  let n = 0, skipped = 0;
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue;
    const c = parseLine(lines[k]);
    if (c.length < H.length - 2) continue;
    const pn = (c[i.pn] || '').trim(), heiti = (c[i.heiti] || '').trim(), husnr = (c[i.husnr] || '').trim();
    const lat = +c[i.lat], lng = +c[i.lng];
    if (!/^\d{3}$/.test(pn) || !heiti || !husnr || !(lat > 62 && lat < 67) || !(lng > -25 && lng < -12)) { skipped++; continue; }
    const key = (heiti + ' ' + husnr + (c[i.bokst] || '').trim().toLowerCase()).toLowerCase();
    const d = (byPn[pn] = byPn[pn] || {});
    if (d[key]) continue;                                   // fyrsta staðfang gildir (fleiri matshlutar → sama hús)
    const hverfi = (c[i.hverfi] || '').trim();
    d[key] = hverfi ? [+lat.toFixed(5), +lng.toFixed(5), hverfi] : [+lat.toFixed(5), +lng.toFixed(5)];
    n++;
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const index = {};
  let bytes = 0;
  for (const pn of Object.keys(byPn)) {
    const s = JSON.stringify(byPn[pn]);
    fs.writeFileSync(path.join(OUT, pn + '.json'), s);
    index[pn] = Object.keys(byPn[pn]).length; bytes += s.length;
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), n, note: 'WGS84-hnit (+ hverfi í Rvk) per heimilisfang úr staðfangaskrá HMS um stadfangaskra_extra (Gagnaþjónusta Rvk).', byPn: index }));
  console.log('hnit:', n, 'heimilisföng í', Object.keys(byPn).length, 'póstnúmerum |', (bytes / 1024 / 1024).toFixed(1), 'MB | sleppt:', skipped);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
