// build_stadfong.js (LOTA 92) — Staðfangaskrá RVK (opin CSV m/ WGS84-hnit) → götu→hnit uppflettitafla.
// Leysir Nominatim-429: allt bakað úr opinni skrá, engin lifandi geo-köll. Neytandi = build_eftirlit_hnit.js.
// Heimild: rvkdata/stadfangaskra_extra (vikul. spegill Staðfangaskrár Þjóðskrár frá Gagnaþj. RVK; GitHub → engin
// ský-throttla, öfugt við hms.is=429). N_HNIT_WGS84=lat, E_HNIT_WGS84=lon (neikvæð) → BEINT í Leaflet, engin proj.
// Sjá memory/iceland-stadfangaskra-api.md. KEYRSLA (á undan build_eftirlit_hnit.js): node skriptur/build_stadfong.js
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'gogn', 'stadfong_rvk.json');
const URL = 'https://raw.githubusercontent.com/rvkdata/stadfangaskra_extra/master/stadfangaskra_extra.csv';
const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();

// RFC4180 (quote-aware) — sumir reitir gæsalappaðir m/ kommu inni (ATH-dálkur, 149/23k raðir)
function splitCSV(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

(async () => {
  const r = await fetch(URL);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const lines = (await r.text()).split(/\r?\n/);
  const H = splitCSV(lines[0]); const ix = (n) => H.indexOf(n);
  const iNf = ix('HEITI_NF'), iTgf = ix('HEITI_TGF'), iHm = ix('HUSMERKING'), iHn = ix('HUSNR'), iBk = ix('BOKST'), iPn = ix('POSTNR'), iN = ix('N_HNIT_WGS84'), iE = ix('E_HNIT_WGS84');
  const idx = {};
  let rows = 0, withHnit = 0;
  for (let r2 = 1; r2 < lines.length; r2++) {
    if (!lines[r2]) continue;
    const c = splitCSV(lines[r2]); rows++;
    const lat = parseFloat(c[iN]), lon = parseFloat(c[iE]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    withHnit++;
    const hm = ((c[iHm] || '').trim() || ((c[iHn] || '').trim() + (c[iBk] || '').trim()));
    const pn = (c[iPn] || '').trim();
    const coord = [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6];
    const nhm = norm(hm);
    const add = (street) => {
      const s = norm(street); if (!s || !nhm) return;
      idx[s + '|' + nhm + '|' + pn] = coord;                 // nákvæmt (m/ póstnr)
      if (!(s + '|' + nhm in idx)) idx[s + '|' + nhm] = coord; // fallback án póstnr (fyrsta vinnur)
    };
    add(c[iNf]);                                             // nefnifall
    add(c[iTgf]);                                            // þágufall ("Laugavegi")
  }
  const out = { _meta: { updated: new Date().toISOString(), source: 'Staðfangaskrá (rvkdata/stadfangaskra_extra)', rows, withHnit, keys: Object.keys(idx).length }, idx };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('stadfong_rvk.json — ' + rows + ' föng (' + withHnit + ' m/hnit) → ' + Object.keys(idx).length + ' lyklar, ' + (fs.statSync(OUT).size / 1048576).toFixed(1) + ' MB');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
