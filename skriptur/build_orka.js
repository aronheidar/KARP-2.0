// Orka — raforkuframleiðsla á Íslandi eftir uppruna (Orkustofnun / Raforkueftirlitið xlsx) → orka.json
//
// KEYRSLA: node skriptur/build_orka.js   → svo node build_embed.js
//
// ⚠ Slóð útgáfunnar er LESIN af talnaefnissíðunni (lib/orka_slod.cjs), ekki harðkóðuð. Harðkóðaða
//   slóðin OS-2025-1 lét /orka/ frjósa í 2024 eftir að ROS-2026-1 (1969–2025) kom 1.4.2026.
// Fyrsta blað: haus á línu ~15 (Ár,Vatnsafl,Jarðvarmi,Eldsneyti,Vindur,Sólarorka,
//   Samtals[MWh],Samtals[GWh],…). Sundurliðun eftir uppruna er frá 1992; heildartala frá 1969.

const fs = require('fs');
const { writeJsonUnlessEmpty } = require('./_seigla.js');   // tóm veita yfirskrifar aldrei heila skrá
const path = require('path');
const XLSX = require('xlsx');
const { TALNAEFNI, nyjastaRaforkuSlod, slodarKostir } = require('./lib/orka_slod.cjs');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const HAUS = { 'User-Agent': 'KARP dashboard build (karp.is)' };

(async () => {
  const sida = await fetch(TALNAEFNI, { headers: HAUS });
  if (!sida.ok) throw new Error('talnaefnissíða HTTP ' + sida.status);
  const utgafa = nyjastaRaforkuSlod(await sida.text());
  if (!utgafa) throw new Error('enginn „Þróun raforkuframleiðslu"-hlekkur á ' + TALNAEFNI);
  console.log('nýjasta útgáfa:', utgafa.ar, utgafa.slod);
  let r = null;
  for (const slod of slodarKostir(utgafa.slod)) {
    r = await fetch(slod, { headers: HAUS });
    if (r.ok) break;
  }
  if (!r.ok) throw new Error('xlsx HTTP ' + r.status);
  const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const num = (v, d) => (v == null ? null : Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0));
  const out = [];
  rows.forEach(rw => {
    if (rw && typeof rw[0] === 'number' && rw[0] >= 1969 && rw[0] <= 2100 && rw[7] != null) {
      out.push({ y: rw[0], total: num(rw[7]), hydro: num(rw[1]), geo: num(rw[2]), fuel: num(rw[3], 2), wind: num(rw[4], 2), solar: num(rw[5], 3) });
    }
  });
  const data = {
    source: 'Orkustofnun / Raforkueftirlitið',
    sourceUrl: 'https://orkustofnun.is/upplysingar/talnaefni/raforka',
    note: 'Raforkuframleiðsla á Íslandi eftir uppruna, GWh. Sundurliðun eftir uppruna frá 1992; heildartala frá 1969.',
    rows: out
  };
  // ⚠ SEIGLA (14.9.2026): orka.json fæðir fasta samhengispakkann, AUG-lagið og /orka/.
  const _tomt = (d) => !d || !Array.isArray(d.rows) || !d.rows.length;
  writeJsonUnlessEmpty(DIR + 'orka.json', data, { isEmpty: _tomt, label: 'orka.json' });
  console.log('orka.json | ár:', out.length, out[0].y, '→', out[out.length - 1].y, '| bytes:', fs.statSync(DIR + 'orka.json').size);
  const last = out[out.length - 1], ren = ((last.hydro + last.geo + (last.wind || 0)) / last.total * 100);
  console.log('nýjasta ár:', JSON.stringify(last), '| endurnýjanlegt:', ren.toFixed(2) + '%');
})().catch(e => { console.error('ERR', e); process.exit(1); });
