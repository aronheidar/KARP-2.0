#!/usr/bin/env node
// build_loftfor.mjs — Loftfaraskrá Samgöngustofu → gogn/loftfor.json (byKt).
// Uppspretta: island.is/api/graphql aircraftRegistryAllAircrafts (OPIÐ, óauðkennt, engin operationName).
// Skilar owners[].ssn + operator.ssn (KT) BEINT. Aðeins ~356 loftför → öll skráin í 1 kalli.
// Aðeins LÖGAÐILA-kt (dagur 41–71) í byKt → forðast fjölda-birtingu einstaklings-kt (skráin opinber á /gogn/).
// Sjá memory/iceland-islandis-graphql-audit.md. Neytandi: worker /api/loftfor?kt= + #fs-loftfor flís.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'loftfor.json');
const GQL = 'https://island.is/api/graphql';
const UA = { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0 (KARP dashboard build; karp.is)' };
const Q = 'query($input: AircraftRegistryAllAircraftsInput!){ aircraftRegistryAllAircrafts(input:$input){ pageNumber pageSize totalCount aircrafts { identifiers type maxWeight productionYear registrationNumber unregistered operator { name ssn } owners { name ssn } } } }';
const erLogadili = (kt) => /^\d{10}$/.test(kt) && +kt.slice(0, 2) >= 41 && +kt.slice(0, 2) <= 71;
const normKt = (ssn) => String(ssn ?? '').replace(/\D/g, '').padStart(10, '0');

async function page(pageNumber, pageSize) {
  const r = await fetch(GQL, { method: 'POST', headers: UA, body: JSON.stringify({ query: Q, variables: { input: { pageNumber, pageSize } } }) });
  const j = await r.json().catch(() => null);
  return j && j.data && j.data.aircraftRegistryAllAircrafts;
}

(async () => {
  const first = await page(1, 500);
  if (!first) throw new Error('Ekkert svar frá aircraftRegistryAllAircrafts');
  let all = first.aircrafts || [];
  const total = first.totalCount || all.length;
  for (let p = 2; all.length < total && p <= 20; p++) {   // öryggis-blaðsíðun ef >500
    const nx = await page(p, 500); if (!nx || !(nx.aircrafts || []).length) break;
    all = all.concat(nx.aircrafts);
  }
  const byKt = {};
  const nofn = {};   // kt → nafn lögaðila (kemur í sama svari; til nafngreiningar á /loftfor/)
  const add = (kt, ac, hlutverk, nafn) => {
    if (!erLogadili(kt)) return;
    if (nafn && !nofn[kt]) nofn[kt] = String(nafn).trim();
    const arr = (byKt[kt] = byKt[kt] || []);
    const ex = arr.find((x) => x.skrnr === ac.identifiers);
    if (ex) { if (!ex.hlutverk.includes(hlutverk)) ex.hlutverk.push(hlutverk); return; }
    arr.push({ skrnr: ac.identifiers || null, tegund: ac.type || null, argerd: ac.productionYear || null, hamth: ac.maxWeight || null, afskrad: !!ac.unregistered, hlutverk: [hlutverk] });
  };
  for (const ac of all) {
    add(normKt(ac.operator && ac.operator.ssn), ac, 'rekandi', ac.operator && ac.operator.name);
    for (const o of (ac.owners || [])) add(normKt(o.ssn), ac, 'eigandi', o.name);
  }
  if (all.length < 100) throw new Error('Grunsamlega fá loftför (' + all.length + ') — hætti');
  const data = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'Loftfaraskrá Samgöngustofu um island.is (aircraftRegistryAllAircrafts)',
    n: all.length, logadilar: Object.keys(byKt).length, nofn, byKt,
  };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('loftfor.json | loftför:', all.length, '| lögaðilar:', data.logadilar, '| bytes:', fs.statSync(OUT).size);
  // sýnishorn
  for (const kt of Object.keys(byKt).sort((a, b) => byKt[b].length - byKt[a].length).slice(0, 5)) console.log('   ', kt, byKt[kt].length, 'loftför →', byKt[kt].slice(0, 3).map((x) => x.skrnr + '/' + (x.tegund || '').slice(0, 20)).join(', '));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
