#!/usr/bin/env node
// build_rekstrarleyfi.mjs — Sýslumanna rekstrarleyfi (veitingar/gisting + vínveitingaleyfi).
// Opið island.is GraphQL getOperatingLicensesCSV → CSV → index á kt (úr Leyfishafa) → gogn/rekstrarleyfi.json.
// Áfangi 1 leyfaskrár (KYC). Kt-lyklað beint (engin nafna-samsvörun).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'rekstrarleyfi.json');

// Fullur CSV-tokenizer (þolir tilvitnanir + kommur/línubil innan reita).
function parseCsv(text) {
  const rows = []; let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* sleppa */ }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const ktOf = (s) => { const m = String(s || '').match(/\((\d{6})-?(\d{4})\)/); return m ? m[1] + m[2] : null; };
const nameOf = (s) => String(s || '').replace(/,?\s*\(\d{6}-?\d{4}\)\s*$/, '').trim();

(async () => {
  console.log('sæki Sýslumanna rekstrarleyfi (island.is)…');
  const r = await fetch('https://island.is/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'User-Agent': 'KARP dashboard build (karp.is)' },
    body: JSON.stringify({ query: '{ getOperatingLicensesCSV { value } }' }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const csv = ((await r.json()).data?.getOperatingLicensesCSV?.value) || '';
  if (csv.length < 5000) throw new Error('Grunsamlega stutt CSV (' + csv.length + ')');
  const rows = parseCsv(csv);
  const head = rows[0];
  const col = (n) => head.indexOf(n);
  const iLeyfishafi = col('Leyfishafi'), iTeg = col('Tegund'), iTeg2 = col('Tegund2'), iTegV = col('TegundVeitingastadar'),
    iFlokkur = col('Flokkur'), iStadur = col('Stadur'), iPost = col('Postnumer'), iFra = col('GildirFra'), iTil = col('GildirTil'),
    iAfengi = col('Afgr_Afgengis_Virkirdagar'), iGestir = col('HamarksfjoldiGesta'), iUtg = col('UtgefidAf');

  const byKt = {};
  for (const row of rows.slice(1)) {
    if (!row[iLeyfishafi]) continue;
    const kt = ktOf(row[iLeyfishafi]);
    if (!kt) continue;
    const afengi = !!(row[iAfengi] && /\d/.test(row[iAfengi]));   // afgreiðslutími víns skráður → vínveitingaleyfi
    const rec = {
      teg: (row[iTeg2] || row[iTeg] || '').trim() || null,
      undir: (row[iTegV] || '').trim() || null,
      flokkur: (row[iFlokkur] || '').replace(/^Flokkur\s*/i, '').trim() || null,
      stadur: (row[iStadur] || '').trim() || null,
      postnr: (row[iPost] || '').trim() || null,
      fra: (row[iFra] || '').trim() || null,
      til: (row[iTil] || '').trim() || null,     // tómt = í gildi
      afengi,
      gestir: row[iGestir] ? parseInt(row[iGestir], 10) || null : null,
      utg: (row[iUtg] || '').replace(/^Sýslumaðurinn\s*/i, '').trim() || null,
    };
    (byKt[kt] = byKt[kt] || []).push(rec);
  }

  const data = { updated: new Date().toISOString().slice(0, 10), source: 'Sýslumenn — rekstrarleyfi veitinga/gististaða + vínveitingaleyfi (island.is)', n: rows.length - 1, felog: Object.keys(byKt).length, byKt };
  fs.writeFileSync(OUT, JSON.stringify(data));
  const afengiN = Object.values(byKt).flat().filter((x) => x.afengi).length;
  console.log('rekstrarleyfi.json | leyfi:', data.n, '| félög:', data.felog, '| m/vínveitingaleyfi:', afengiN, '| bytes:', fs.statSync(OUT).size);
  // sanngæfa
  const dæmi = Object.entries(byKt).find(([k, v]) => v.length > 1);
  if (dæmi) console.log('  dæmi (fjölleyfi):', dæmi[0], '→', dæmi[1].map((x) => x.teg + (x.undir ? '/' + x.undir : '')).join(' · '));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
