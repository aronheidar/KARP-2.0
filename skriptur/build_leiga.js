// ─────────────────────────────────────────────────────────────
// build_leiga.js — Leiguskrá HMS → gogn/leiga.json (LOTA 13i)
// Sama opna OCI-fatan og kaupskráin: leiguskra.csv (~30 MB, ;-aðskilið,
// latin1, tölur með . sem tugabrot). Síum ónothæfa samninga (flagg=1).
// Út: landsþróun eftir ársfjórðungum (miðgildi kr/m² + fjöldi) +
// staða per sveitarfélag síðustu 12 mánuði.
// Keyrsla: node skriptur/build_leiga.js
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const URL = 'https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/leiguskra.csv';
const OUT = path.join(__dirname, '..', 'gogn', 'leiga.json');

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
    rows.push({ sv, d, m2: verd / st, verd });
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

  const out = { updated: new Date().toISOString().slice(0, 10), source: 'Leiguskrá HMS (leiguskra.csv, þinglýstir samningar)', maxDate: maxD, muniYear: lastFullYear, total: rows.length, latest, quarters, byMuni };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('Skrifað:', OUT, '·', latest ? `nýjast ${latest.q}: ${latest.medM2} kr/m² (${latest.n} samningar)` : '—');
})();
