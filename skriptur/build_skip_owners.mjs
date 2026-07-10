#!/usr/bin/env node
// build_skip_owners.mjs — léttur flotavísir: skipaskrárnúmer → eigendur (kt), lyklað byKt.
// Uppspretta: island.is/api/graphql shipRegistryShipSearch (OPIÐ, óauðkennt, engin operationName).
// qs leitar AÐEINS eftir skipsnafni/-númeri (ekki eiganda) og engin breið leit → verður að fara skipnr 1..MAX.
// Notað af kvotiHandler (worker): fyrirtæki-kt → skipnúmer → per-skip aflamark (fiskistofaGetShipStatusForTimePeriod).
// Aðeins LÖGAÐILA-kt (stofndagur 41–71) fara í byKt → forðast fjölda-birtingu einstaklings-kt (skráin er opinber á /gogn/).
// Sjá memory/iceland-fiskistofa-api.md + iceland-skipaskra-api.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'skip_owners.json');
const GQL = 'https://island.is/api/graphql';
const UA = { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0 (KARP dashboard build; karp.is)' };
const MAX = 7600;          // hæsta skoðaða skipnr (JÓN GVENDAR #7000 fannst; >7500 tómt)
const CONC = 6;            // hófleg samhliðni (25 hröð köll þoldust í prófun)
const Q = 'query($input: ShipRegistryShipSearchInput!){ shipRegistryShipSearch(input:$input){ ships{ shipName regno owners{ name nationalId sharePercentage } } } }';
const erLogadili = (kt) => /^\d{10}$/.test(kt) && +kt.slice(0, 2) >= 41 && +kt.slice(0, 2) <= 71;

async function fetchShip(regno, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(GQL, { method: 'POST', headers: UA, body: JSON.stringify({ query: Q, variables: { input: { qs: String(regno) } } }) });
      if (r.status === 405 || r.status === 429) { await new Promise((s) => setTimeout(s, 1500 * (t + 1))); continue; }
      const j = await r.json().catch(() => null);
      return (j && j.data && j.data.shipRegistryShipSearch && j.data.shipRegistryShipSearch.ships) || [];
    } catch (e) { await new Promise((s) => setTimeout(s, 800 * (t + 1))); }
  }
  return null;   // null = mistókst (aðgreint frá [] = ekkert skip)
}

(async () => {
  const byKt = {};
  const nofn = {};   // kt → nafn lögaðila (kemur í sama svari; til nafngreiningar á /tengsl/)
  let ships = 0, fails = 0;
  const t0 = Date.now();
  for (let base = 1; base <= MAX; base += CONC) {
    const batch = [];
    for (let n = base; n < base + CONC && n <= MAX; n++) batch.push(n);
    const res = await Promise.all(batch.map((n) => fetchShip(n).then((s) => [n, s])));
    for (const [n, s] of res) {
      if (s === null) { fails++; continue; }
      for (const ship of s) {
        if (ship.regno !== n) continue;                 // qs="123" gæti gripið nafn-samsvörun → aðeins nákvæmt regno
        for (const o of (ship.owners || [])) {
          const kt = String(o.nationalId || '').replace(/\D/g, '');
          if (!erLogadili(kt)) continue;                // aðeins lögaðilar í opinbera vísinn
          if (o.name && !nofn[kt]) nofn[kt] = String(o.name).trim();
          (byKt[kt] = byKt[kt] || []).push({ regno: ship.regno, nafn: ship.shipName || null, hlutur: o.sharePercentage ?? null });
        }
        ships++;
      }
    }
    if (base % 600 === 1) console.log('  ..' + (base - 1) + '/' + MAX + ' (' + ships + ' skip, ' + Object.keys(byKt).length + ' lögaðilar, ' + fails + ' mistök)');
  }
  // afmá tvítekt (sama regno gæti komið tvisvar úr nafn-samsvörun) + raða
  for (const kt of Object.keys(byKt)) {
    const seen = new Set();
    byKt[kt] = byKt[kt].filter((x) => (seen.has(x.regno) ? false : seen.add(x.regno))).sort((a, b) => a.regno - b.regno);
  }
  if (ships < 300) throw new Error('Grunsamlega fá skip (' + ships + ') — hætti (throttle?)');
  const data = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'Samgöngustofa skipaskrá um island.is (shipRegistryShipSearch) — eigendur (lögaðilar)',
    skip: ships, logadilar: Object.keys(byKt).length, mistok: fails, max: MAX, nofn, byKt,
  };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('skip_owners.json | skip:', ships, '| lögaðilar:', data.logadilar, '| mistök:', fails, '| ' + ((Date.now() - t0) / 1000).toFixed(0) + 's | bytes:', fs.statSync(OUT).size);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
