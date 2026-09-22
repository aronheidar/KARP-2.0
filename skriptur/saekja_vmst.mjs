#!/usr/bin/env node
// saekja_vmst.mjs — sækir nýjustu „Helstu talnagögn um atvinnuleysi" (xlsm) Vinnumálastofnunar
//   → gogn/Talnagogn_atvinnuleysi.xlsm, sem build_atvinnuleysi.js les. Keyrir daglega Á UNDAN henni.
//
// ⚠ 21.9.2026: atvinnuleysið á forsíðunni stóð í maí í meira en þrjá mánuði. build_atvinnuleysi.js las
//   skrá sem hafði verið sett í repo-ið 30.7 og sótti aldrei neitt, en VMST var komin í ágúst.
// Slóðin er lesin af síðunni í hvert sinn (lib/islandis_skra.mjs): Contentful skiptir um slóð þegar
// VMST skiptir skránni út. Sama skrá = engin breyting skrifuð.
import fs from 'node:fs';
import { finnaCtfSlod } from './lib/islandis_skra.mjs';

const SIDA = 'https://island.is/s/vinnumalastofnun/maelabord-og-toelulegar-upplysingar';
const SKRA = new URL('../gogn/Talnagogn_atvinnuleysi.xlsm', import.meta.url);
const HAUS = { 'user-agent': 'Mozilla/5.0 (Karp gagnasokn; karp.is)' };
const haetta = (skilabod) => { console.error('⚠ saekja_vmst:', skilabod); process.exit(1); };

const sida = await fetch(SIDA, { headers: HAUS });
if (!sida.ok) haetta(`VMST-síða svaraði HTTP ${sida.status}`);
const slod = finnaCtfSlod(await sida.text(), /^Talnagogn_atvinnuleysi.*\.xlsm$/i);
if (!slod) haetta(`enginn Talnagögn-hlekkur á ${SIDA} — breyttist síðan?`);
const r = await fetch(slod, { headers: HAUS });
if (!r.ok) haetta(`xlsm svaraði HTTP ${r.status}: ${slod}`);
const nytt = Buffer.from(await r.arrayBuffer());
// xlsm er zip-skrá: byrjar á „PK". Villusíða eða hálf skrá má aldrei leysa gömlu af hólmi.
if (nytt.length < 100000 || nytt.subarray(0, 2).toString() !== 'PK') haetta(`skráin er ekki gild xlsm (${nytt.length} bæti)`);
let gamalt = null;
try { gamalt = fs.readFileSync(SKRA); } catch { /* engin fyrri skrá */ }
if (gamalt && gamalt.equals(nytt)) {
  console.log(`VMST talnagögn óbreytt (síðast breytt ${r.headers.get('last-modified')})`);
} else {
  fs.writeFileSync(SKRA, nytt);
  console.log(`VMST talnagögn UPPFÆRÐ: ${nytt.length} bæti, síðast breytt ${r.headers.get('last-modified')}`);
}
