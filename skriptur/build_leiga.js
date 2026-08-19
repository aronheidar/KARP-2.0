// ─────────────────────────────────────────────────────────────
// build_leiga.js — Leiguskrá HMS → gogn/leiga.json (LOTA 13i)
// Sama opna OCI-fatan og kaupskráin: leiguskra.csv (~30 MB, ;-aðskilið,
// latin1, tölur með . sem tugabrot). Síum ónothæfa samninga (flagg=1).
// Út: landsþróun eftir ársfjórðungum (miðgildi kr/m² + fjöldi) +
// staða per sveitarfélag síðasta heila árið.
// ➕ 19.8.2026 (LEIGUVERÐ PER SVÆÐI + LEIGUVERÐMAT): opna skráin nær aðeins til 2023 (þinglýsingarskyldan féll),
// en HMS birtir mánaðarlega VÍSITÖLU LEIGUVERÐS úr nýju leiguskránni (leiguvisitala.csv, 2023-05=100 → 130,4 í
// 2026-07). Hver samningur 2022-01→ er því FRAMREIKNAÐUR til nýjasta vísitölumánaðar (fyrir 2023-05 keðjað með
// ársfjórðungsmiðgildum skrárinnar sjálfrar) og varpaður á matssvæði HMS (hnit/<pn>.json [5], 98,5% hitta):
//   web/public/gogn/leigusaga/<pn>.json   { til, stig, fra, n, s:[{d, st, verd, vi, teg, z}] } — sambærilegir samningar
//                                          fyrir leiguverðmat í fasteignavakt (web/src/lib/leiguverd.mjs)
//   web/public/gogn/hms/leiguverd.json    miðgildi framreiknaðs leiguverðs/m² per svæði/pn/sveitarfélag/land (SSG)
//   gogn/leiga.json                       + visitala (mánaðarstig), nu (landsmiðgildi framreiknað), byMuni[].medM2Nu
// ⚠ Vísitalan er höfuðborgarsvæðis-vísitala markaðsleigu (einstaklingar+hagnaðardrifin félög); notuð fyrir landið allt.
// ⚠ Skráin inniheldur ALLA þinglýsta samninga, þ.m.t. óhagnaðardrifna leigusala (lægri leiga) — miðgildi geta verið lág.
// Keyrsla: node skriptur/build_leiga.js
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const URL = 'https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/leiguskra.csv';
const URL_VISITALA = 'https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/leiguvisitala.csv';
const OUT = path.join(__dirname, '..', 'gogn', 'leiga.json');
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
const HNIT = path.join(PUB, 'hnit');
const SAGA_FRA = '2022-01-01';   // samningar sem fara í leigusögu/svæðismiðgildi (sl. 2 heilu ár skrárinnar)

const num = (s) => { const v = parseFloat(String(s).trim().replace(',', '.')); return isNaN(v) ? null : v; };
const median = (arr) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

(async () => {
  console.log('Sæki leiguskrá…');
  const r = await fetch(URL, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = Buffer.from(await r.arrayBuffer()).toString('latin1');
  const lines = txt.split(/\r?\n/);
  const head = lines[0].split(';').map((h) => h.trim());
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const need = ['SVEITARFELAG', 'DAGSFRA', 'HEILDARVERD', 'STAERD', 'ONOTHAEFUR_SAMNINGUR'];
  for (const k of need) if (ix[k] == null) throw new Error('Vantar dálk: ' + k);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(';');
    if (c.length < head.length) continue;
    if (c[ix.ONOTHAEFUR_SAMNINGUR].trim() !== '0') continue;
    const verd = num(c[ix.HEILDARVERD]);
    const st = num(c[ix.STAERD]);
    const d = c[ix.DAGSFRA].trim().slice(0, 10);
    const sv = c[ix.SVEITARFELAG].trim();
    if (!verd || !st || st < 10 || st > 500 || verd < 30000 || verd > 2e6 || !/^\d{4}-\d{2}/.test(d) || !sv) continue;
    rows.push({ sv, d, m2: verd / st, verd, st, a: (c[ix.HEIMILISFANG] || '').trim(), pn: (c[ix.POSTNUMER] || '').trim(), teg: (c[ix.TEGUND] || '').trim() });
  }
  console.log('Nothæfir samningar:', rows.length);

  // Landsþróun: miðgildi kr/m² per ársfjórðung (frá 2011)
  const byQ = {};
  rows.forEach((x) => {
    const q = x.d.slice(0, 4) + 'F' + Math.ceil(+x.d.slice(5, 7) / 3);
    (byQ[q] = byQ[q] || []).push(x.m2);
  });
  const quarters = Object.keys(byQ).filter((q) => q >= '2011').sort()
    .map((q) => ({ q, medM2: Math.round(median(byQ[q])), n: byQ[q].length }))
    .filter((x) => x.n >= 30); // óstöðug fjórðungsgildi út
  // Síðasti fjórðungur getur verið hálfnaður — merkja hann
  const latest = quarters[quarters.length - 1] || null;

  // Per sveitarfélag: síðasta HEILA árið í skránni (þinglýsingarskyldan féll niður 2024
  // með nýju húsaleigulögunum — skráin frýs þar; nýja leiguskráin tengist síðar)
  const maxD = rows.reduce((a, x) => (x.d > a ? x.d : a), '');
  // framvirkir samningar teygja maxD fram — veljum síðasta ár með almennilegri þekju
  const perYear = {};
  rows.forEach((x) => { const y = x.d.slice(0, 4); perYear[y] = (perYear[y] || 0) + 1; });
  const lastFullYear = Object.keys(perYear).filter((y) => perYear[y] >= 1000).sort().pop();
  const cutS = lastFullYear + '-01-01';
  const cutE = lastFullYear + '-12-31';
  const bySv = {};
  rows.forEach((x) => { if (x.d >= cutS && x.d <= cutE) (bySv[x.sv] = bySv[x.sv] || []).push(x); });
  const byMuni = {};
  Object.keys(bySv).forEach((sv) => {
    const a = bySv[sv];
    if (a.length < 12) return; // of fá gögn fyrir marktækt miðgildi
    byMuni[sv] = { n12: a.length, medM2: Math.round(median(a.map((x) => x.m2))), medRent: Math.round(median(a.map((x) => x.verd)) / 1000) * 1000 };
  });
  console.log('Sveitarfélög með 12+ samninga sl. 12 mán:', Object.keys(byMuni).length);

  // ── VÍSITALA LEIGUVERÐS HMS (mánaðarleg, 2023-05=100) → framreikningur ──
  let VI = {}, viTil = null;
  try {
    const rv = await fetch(URL_VISITALA, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
    if (!rv.ok) throw new Error('HTTP ' + rv.status);
    const vt = Buffer.from(await rv.arrayBuffer()).toString('utf8');
    for (const l of vt.split(/\r?\n/).slice(1)) { const c = l.split(','); if (c.length < 4) continue; const m = c[1].replace(/"/g, '').trim() + '-' + c[2].replace(/"/g, '').trim().padStart(2, '0'); const v = parseFloat(c[3]); if (/^\d{4}-\d{2}$/.test(m) && v > 0) VI[m] = v; }
    const ms = Object.keys(VI).sort(); viTil = ms[ms.length - 1] || null;
    console.log('Vísitala leiguverðs HMS:', ms[0], '→', viTil, '=', VI[viTil], '(' + ms.length + ' mánuðir)');
  } catch (e) { console.error('⚠ vísitala leiguverðs náðist ekki:', String(e).slice(0, 120)); }
  const Q = Object.fromEntries(quarters.map((q) => [q.q, q.medM2]));
  const qOf = (m) => m.slice(0, 4) + 'F' + Math.ceil(+m.slice(5, 7) / 3);
  const viBase = Object.keys(VI).sort()[0];   // fyrsti vísitölumánuður (2023-05) — eldri mánuðir keðjaðir með fjórðungsmiðgildum skrárinnar
  const I = (m) => (VI[m] != null ? VI[m] : (viBase && m < viBase && Q[qOf(m)] && Q[qOf(viBase)]) ? VI[viBase] * Q[qOf(m)] / Q[qOf(viBase)] : null);
  const stigNu = viTil ? VI[viTil] : null;

  const q = (arr, p) => { const s2 = arr.slice().sort((x, y) => x - y); const i2 = (s2.length - 1) * p, lo = Math.floor(i2), hi = Math.ceil(i2); return s2[lo] + (s2[hi] - s2[lo]) * (i2 - lo); };
  const stat = (arr, min) => (arr.length >= (min || 6) ? { n: arr.length, med: Math.round(median(arr.map((x) => x.ppm))), q25: Math.round(q(arr.map((x) => x.ppm), 0.25)), q75: Math.round(q(arr.map((x) => x.ppm), 0.75)), medSt: Math.round(median(arr.map((x) => x.st))), medLeiga: Math.round(median(arr.map((x) => x.vi)) / 1000) * 1000 } : null);
  let saga = [];
  if (stigNu) {
    const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const HN = {}; const hnFor = (pn) => { if (HN[pn] !== undefined) return HN[pn]; try { HN[pn] = JSON.parse(fs.readFileSync(path.join(HNIT, pn + '.json'), 'utf8')); } catch (e) { HN[pn] = null; } return HN[pn]; };
    let medZ = 0;
    for (const x of rows) {
      if (x.d < SAGA_FRA || !/^\d{3}$/.test(x.pn) || x.st < 15 || x.st > 400) continue;
      const m = x.d.slice(0, 7); const im = I(m); if (!im) continue;
      const hn = hnFor(x.pn); const h = hn && hn[norm(x.a)]; const z = h && h[5] ? h[5] : 0; if (z) medZ++;
      const vi = Math.round(x.verd * stigNu / im);   // leiga framreiknuð til nýjasta vísitölumánaðar
      saga.push({ d: x.d, st: x.st, verd: x.verd, vi, teg: x.teg, z, pn: x.pn, sv: x.sv, ppm: vi / x.st });
    }
    saga.sort((a2, b2) => b2.d.localeCompare(a2.d));
    console.log('Leigusaga ' + SAGA_FRA + '→:', saga.length, 'samningar framreiknaðir til', viTil, '|', medZ, 'með matssvæði');
    // leigusaga/<pn>.json
    const SAGA = path.join(PUB, 'leigusaga');
    fs.rmSync(SAGA, { recursive: true, force: true }); fs.mkdirSync(SAGA, { recursive: true });
    const byPn = {}; for (const x of saga) (byPn[x.pn] = byPn[x.pn] || []).push(x);
    let bytes = 0;
    for (const pn of Object.keys(byPn)) { const sx = JSON.stringify({ til: viTil, stig: stigNu, fra: SAGA_FRA, n: byPn[pn].length, s: byPn[pn].map((x) => ({ d: x.d, st: x.st, verd: x.verd, vi: x.vi, teg: x.teg, z: x.z })) }); bytes += sx.length; fs.writeFileSync(path.join(SAGA, pn + '.json'), sx); }
    fs.writeFileSync(path.join(SAGA, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), til: viTil, stig: stigNu, fra: SAGA_FRA, n: saga.length, byPn: Object.fromEntries(Object.entries(byPn).map(([k, v]) => [k, v.length])) }));
    console.log('leigusaga:', Object.keys(byPn).length, 'pn |', (bytes / 1024).toFixed(0), 'KB');
    // leiguverd.json — miðgildi per svæði/pn/sveitarfélag/land
    const grp = (key) => { const g = {}; for (const x of saga) { const k = x[key]; if (!k) continue; (g[k] = g[k] || []).push(x); } const o = {}; for (const k of Object.keys(g)) { const st2 = stat(g[k]); if (st2) o[k] = st2; } return o; };
    const LV = { updated: new Date().toISOString(), heimild: 'Leiguskrá HMS (þinglýstir leigusamningar ' + SAGA_FRA.slice(0, 4) + '–' + maxD.slice(0, 4) + ') framreiknaðir með vísitölu leiguverðs HMS til ' + viTil + ' (' + stigNu + '; 2023-05=100); matssvæði úr hnit/<pn>.json', visitala: { fra: viBase, til: viTil, stig: stigNu }, gluggi: SAGA_FRA + '→', land: stat(saga, 30), byZone: grp('z'), byPn: grp('pn'), bySv: grp('sv') };
    fs.mkdirSync(path.join(PUB, 'hms'), { recursive: true });
    fs.writeFileSync(path.join(PUB, 'hms', 'leiguverd.json'), JSON.stringify(LV));
    console.log('leiguverd.json:', Object.keys(LV.byZone).length, 'svæði,', Object.keys(LV.byPn).length, 'pn,', Object.keys(LV.bySv).length, 'sveitarfélög | land:', JSON.stringify(LV.land));
    // byMuni: framreiknað miðgildi líka (varaleið skýrslunnar)
    const bySv2 = grp('sv');
    for (const sv of Object.keys(byMuni)) { if (bySv2[sv]) { byMuni[sv].medM2Nu = bySv2[sv].med; byMuni[sv].nNu = bySv2[sv].n; } }
  }
  const nu = (stigNu && saga.length >= 30) ? { m: viTil, stig: stigNu, medM2: Math.round(median(saga.map((x) => x.ppm))), n: saga.length, fra: SAGA_FRA } : null;
  const vm = Object.keys(VI).sort();
  const yoy = (vm.length && viTil) ? (() => { const [y, mm] = viTil.split('-'); const p = (y - 1) + '-' + mm; return VI[p] ? Math.round((VI[viTil] / VI[p] - 1) * 1000) / 10 : null; })() : null;
  const out = { updated: new Date().toISOString().slice(0, 10), source: 'Leiguskrá HMS (leiguskra.csv, þinglýstir samningar) + vísitala leiguverðs HMS (leiguvisitala.csv)', maxDate: maxD, muniYear: lastFullYear, total: rows.length, latest, quarters, byMuni,
    visitala: vm.length ? { fra: vm[0], til: viTil, stig: VI, yoy, heimild: 'HMS — vísitala leiguverðs (sameinuð; 2023-05=100), höfuðborgarsvæðið, markaðsleiga' } : null, nu };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('Skrifað:', OUT, '·', latest ? `nýjast ${latest.q}: ${latest.medM2} kr/m² (${latest.n} samningar)` : '—', '· nú (framreiknað):', nu ? nu.medM2 + ' kr/m² ' + nu.m : '—');
})();
