// build_hnit.js (LOTA 68) — GPS-hnit + hverfi á hvert heimilisfang úr staðfangaskrá.
// Heimild: stadfangaskra_extra (Gagnaþjónusta Reykjavíkurborgar, vikulega uppfærð spegluð
// útgáfa af staðfangaskrá HMS m/WGS84-hnitum + LUKR-hverfaheitum fyrir Reykjavík).
// https://github.com/rvkdata/stadfangaskra_extra (7,8MB CSV, uppfærð sunnudagskvöld)
//
// Úttak: web/public/gogn/hnit/<pn>.json = { "skeiðarvogur 1": [lat, lng, hverfi|'', LANDNR, HEINUM], … }
//       ⚠ ALLTAF 5 stök (hverfi = '' utan Rvk) svo vísitölur séu stöðugar. LANDNR+HEINUM (100% staðfanga hafa
//       bæði) eru sömu tölur og í slóð fasteignaskrár HMS: https://hms.is/fasteignaskra/<LANDNR>/<HEINUM>[/<FASTNUM>]
//       → fasteignavaktin tengir beint á opinbera eininga-listann (íbúðarmerkingar, stærð, fasteignamat) fyrir
//       HVERT heimilisfang landsins — líka þau 59% sem kaupskráin þekkir ekki. Þeirra API er bot-/CORS-varið,
//       svo tengill er leiðin, ekki sókn.
//       ➕ 6. stak = MATSSVÆÐI HMS (Nr, 0 = óþekkt): k-NN úr sölu-úrtaki HMS fyrir fasteignamat 2027
//       (gogn/hms/matssvaedi_punktar.json, [x,y,nr] í ISN93, byggt af build_hms_2027.py). Heimilisfangið er
//       varpað WGS84→ISN93 (lib/isn93.mjs), 5 næstu sölupunktar innan 1,5 km kjósa vegið með 1/d. Leiðbeinandi —
//       svæðamörk eru ekki til sem opin landupplýsingagögn, svo jaðar-heimilisföng geta lent röngum megin.
//       + hnit/gotur.json = { "leirdalur": ["190","260"], … } — FULLUR götuvísir (allar götur
//         landsins, ekki aðeins þær sem hafa selst). fasteignaskra/gotur.json er byggður úr
//         kaupskránni og sleppir götum án sölu síðan 2006 → fasteignavaktin fann þá ekki einu sinni
//         póstnúmerið. 59% heimilisfanga landsins (63.678 af 107.177, mælt 19.8.2026) finnast
//         aðeins hér. Lyklar eru lágstafaðir eins og í <pn>.json.
//
// KEYRSLA: node skriptur/build_hnit.js [--from-disk]
//   --from-disk = sleppa niðurhali; endurbyggja AÐEINS gotur.json úr <pn>.json sem þegar eru á diski
//   (sama regla, svo úttakið er eins og úr fullri keyrslu).
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

// Götuvísir úr heimilisfangs-lyklunum: „leirdalur 36a" → „leirdalur". Húsnúmer = síðasta
// bil-aðskilda tókenið þegar það byrjar á tölustaf; götur með tölu í nafni („hverfisgata 1")
// missa aðeins húsnúmerið, ekki nafnið.
function goturUr(byPn) {
  const g = {};
  for (const pn of Object.keys(byPn)) {
    for (const key of Object.keys(byPn[pn])) {
      const gata = key.replace(/\s+\d+[a-zæöðáéíóúýþ]*$/i, '').trim();
      if (!gata) continue;
      (g[gata] = g[gata] || new Set()).add(pn);
    }
  }
  const out = {};
  for (const k of Object.keys(g).sort()) out[k] = [...g[k]].sort();
  return out;
}

// ── Matssvæði HMS: k-NN vörpun heimilisfangs (WGS84) → matssvæðis-Nr úr sölu-úrtaki (ISN93) ──
const PUNKTAR = path.join(__dirname, '..', 'gogn', 'hms', 'matssvaedi_punktar.json');
async function matssvaediVorpun() {
  if (!fs.existsSync(PUNKTAR)) { console.warn('⚠ matssvaedi_punktar.json vantar — matssvæði verða 0 (keyrðu build_hms_2027.py)'); return () => 0; }
  const { isn93 } = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'web', 'src', 'lib', 'isn93.mjs')).href);
  const pts = JSON.parse(fs.readFileSync(PUNKTAR, 'utf8')).punktar;
  const CELL = 500, R = 1500, K = 5;
  const grid = new Map();
  for (const p of pts) { const k = Math.floor(p[0] / CELL) + ':' + Math.floor(p[1] / CELL); const a = grid.get(k); if (a) a.push(p); else grid.set(k, [p]); }
  const reach = Math.ceil(R / CELL);
  return (lat, lng) => {
    const xy = isn93(lat, lng); if (!xy) return 0;
    const cx = Math.floor(xy[0] / CELL), cy = Math.floor(xy[1] / CELL);
    const near = [];
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const a = grid.get((cx + i) + ':' + (cy + j)); if (!a) continue;
      for (const p of a) { const d = Math.hypot(p[0] - xy[0], p[1] - xy[1]); if (d <= R) near.push([d, p[2]]); }
    }
    if (!near.length) return 0;
    near.sort((a, b) => a[0] - b[0]);
    const atkv = {};
    for (const [d, nr] of near.slice(0, K)) atkv[nr] = (atkv[nr] || 0) + 1 / Math.max(d, 25);
    return +Object.entries(atkv).sort((a, b) => b[1] - a[1])[0][0];
  };
}

if (process.argv.includes('--from-disk')) {
  (async () => {
    const byPn = {};
    for (const f of fs.readdirSync(OUT)) { const m = f.match(/^(\d{3})\.json$/); if (m) byPn[m[1]] = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); }
    const gotur = goturUr(byPn);
    fs.writeFileSync(path.join(OUT, 'gotur.json'), JSON.stringify(gotur));
    console.log('gotur.json (from-disk):', Object.keys(gotur).length, 'götur úr', Object.keys(byPn).length, 'póstnúmerum');
    // matssvæði endurreiknuð og pn-skrár endurskrifaðar (lat/lng eru í skránum)
    const svaedi = await matssvaediVorpun();
    let med = 0, alls = 0;
    for (const pn of Object.keys(byPn)) {
      const d = byPn[pn];
      for (const key of Object.keys(d)) { const v = d[key]; while (v.length < 5) v.push(v.length === 2 ? '' : 0); v[5] = svaedi(v[0], v[1]); alls++; if (v[5]) med++; }
      fs.writeFileSync(path.join(OUT, pn + '.json'), JSON.stringify(d));
    }
    console.log('matssvæði (from-disk):', med, 'af', alls, 'heimilisföngum fengu svæði (' + Math.round(med / alls * 100) + '%)');
  })().catch((e) => { console.error('ERR', e); process.exit(1); });
} else
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
    landnr: H.indexOf('LANDNR'), heinum: H.indexOf('HEINUM'),
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
    const landnr = +(c[i.landnr] || 0) || 0, heinum = +(c[i.heinum] || 0) || 0;
    d[key] = [+lat.toFixed(5), +lng.toFixed(5), hverfi, landnr, heinum, 0];   // [5] = matssvæði, sett að neðan
    n++;
  }
  const svaedi = await matssvaediVorpun();
  let medSv = 0;
  for (const pn of Object.keys(byPn)) for (const key of Object.keys(byPn[pn])) { const v = byPn[pn][key]; v[5] = svaedi(v[0], v[1]); if (v[5]) medSv++; }
  console.log('matssvæði:', medSv, 'af', n, 'heimilisföngum fengu svæði (' + Math.round(medSv / n * 100) + '%)');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const index = {};
  let bytes = 0;
  for (const pn of Object.keys(byPn)) {
    const s = JSON.stringify(byPn[pn]);
    fs.writeFileSync(path.join(OUT, pn + '.json'), s);
    index[pn] = Object.keys(byPn[pn]).length; bytes += s.length;
  }
  const gotur = goturUr(byPn);
  fs.writeFileSync(path.join(OUT, 'gotur.json'), JSON.stringify(gotur));
  console.log('gotur.json:', Object.keys(gotur).length, 'götur');
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), n, note: 'WGS84-hnit (+ hverfi í Rvk) per heimilisfang úr staðfangaskrá HMS um stadfangaskra_extra (Gagnaþjónusta Rvk).', byPn: index }));
  console.log('hnit:', n, 'heimilisföng í', Object.keys(byPn).length, 'póstnúmerum |', (bytes / 1024 / 1024).toFixed(1), 'MB | sleppt:', skipped);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
