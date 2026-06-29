// Orka — raforkuframleiðsla á Íslandi eftir uppruna (Orkustofnun / Raforkueftirlitið xlsx) → orka.json
//
// KEYRSLA: node skriptur/build_orka.js   → svo node build_embed.js
//
// ⚠ Slóðin inniheldur útgáfu-ID (OS-2025-1). Þegar NÝ árleg útgáfa kemur þarf að uppfæra URL —
//   finndu nýjustu „Þróun raforkuframleiðslu" hér: https://orkustofnun.is/upplysingar/talnaefni/raforka
// Sheet "Framleiðsla 1969-2024": haus á línu 15 (Ár,Vatnsafl,Jarðvarmi,Eldsneyti,Vindur,Sólarorka,
//   Samtals[MWh],Samtals[GWh],…). Sundurliðun eftir uppruna er frá 1992; heildartala frá 1969.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const URL = 'https://vefskrar.orkustofnun.is/Talnaefni/OS-2025-1-throun-raforkuframleidslu-a-islandi-1969-2024.xlsx';

(async () => {
  console.log('sæki Orkustofnun xlsx…');
  const r = await fetch(URL, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
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
  fs.writeFileSync(DIR + 'orka.json', JSON.stringify(data));
  console.log('orka.json | ár:', out.length, out[0].y, '→', out[out.length - 1].y, '| bytes:', fs.statSync(DIR + 'orka.json').size);
  const last = out[out.length - 1], ren = ((last.hydro + last.geo + (last.wind || 0)) / last.total * 100);
  console.log('nýjasta ár:', JSON.stringify(last), '| endurnýjanlegt:', ren.toFixed(2) + '%');
})().catch(e => { console.error('ERR', e); process.exit(1); });
