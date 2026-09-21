#!/usr/bin/env node
// saekja_nikotinpuda.mjs — telur nikótínpúða á hillu Svens eftir UPPGEFNUM styrk (mg/g).
//
// Fyrir /furduhagfraedi/#nikotingjald. Tala sem enginn getur endurtekið er minning, ekki mæling
// (sama regla og maela_verdmat.mjs). Keyrð í höndunum, EKKI í cron.
//
//   node skriptur/saekja_nikotinpuda.mjs      → gogn/nikotinpudar.json   (~8 mín, 1 s bil)
//
// ⚠ Einn vefsali. Talan lýsir hillu Svens á tilteknum degi, ekki landinu, og síðan segir það.
// ⚠ Ein beiðni í einu með 1 s bili. Svens er lítil verslun, ekki API.
// ⚠ Hættir með villu ef meira en 10% síðna mistakast: hálf talning má ekki líta út eins og heil.
import { writeFileSync } from 'node:fs';
import { thattaSitemap, thattaVoru, flokka } from './lib/nikotinpudar.mjs';

const SITEMAP = 'https://svens.is/product-sitemap.xml';
const BIL_MS = 1000;
const HAUS = { 'user-agent': 'Mozilla/5.0 (Karp furduhagfraedi; aron@karp.is)' };
const bida = (ms) => new Promise((r) => setTimeout(r, ms));

const svar = await fetch(SITEMAP, { headers: HAUS });
if (!svar.ok) { console.error(`Veftré svaraði ${svar.status}`); process.exit(1); }
const slodir = thattaSitemap(await svar.text());
if (!slodir.length) { console.error('Engar vörur í veftré. Breyttist sniðið?'); process.exit(1); }

const vorur = []; const othattad = []; const villur = [];
let rafrettur = 0;
for (const [i, slod] of slodir.entries()) {
  try {
    const r = await fetch(slod, { headers: HAUS });
    if (!r.ok) villur.push({ slod, status: r.status });
    else {
      const v = thattaVoru(await r.text(), slod);
      const f = flokka(v);
      if (f === 'pudi') vorur.push(v);
      else if (f === 'othattad') othattad.push({ nafn: v.nafn, slod, strengur: v.strengur });
      else if (f === 'rafretta') rafrettur += 1;
    }
  } catch (e) {
    villur.push({ slod, villa: String(e.message || e) });
  }
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${slodir.length}: ${vorur.length} púðar með styrk`);
  await bida(BIL_MS);
}

const dags = new Date().toISOString().slice(0, 10);
const ut = { dags, heimild: 'svens.is', slodir: slodir.length, n: vorur.length, rafrettur, othattad, villur, vorur };
writeFileSync(new URL('../gogn/nikotinpudar.json', import.meta.url), JSON.stringify(ut, null, 1) + '\n');
console.log(`${dags}: ${vorur.length} púðar með styrk, ${othattad.length} púðar á öðru sniði, ${rafrettur} rafrettur/áfyllingar, ${villur.length} villur af ${slodir.length} síðum.`);
if (villur.length > slodir.length * 0.1) { console.error('⚠ Yfir 10% villur. Talningin er EKKI marktæk.'); process.exit(1); }
