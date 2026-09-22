#!/usr/bin/env node
// build_sveitarfelog_pop.mjs — íbúafjöldi eftir sveitarfélagi (Hagstofa MAN02005, nýjasta 1. janúar)
//   → gogn/sveitarfelog_pop.json.
//
// ⚠ Skráin var skrifuð EINU SINNI við flutninginn 29.6.2026 og aldrei aftur, þótt sjö síður og skriptur
// lesi hana. Hagstofa birtir nýtt ár í febrúar; dagleg keyrsla kostar eina fyrirspurn.
// ⚠ Sniðið er flatt { nafn: íbúar } með STUTTNEFNUM Karp og aðeins sveitarfélögum á aðallistanum
//   (gogn/sveitarfelog_meta.json), svo neytendurnir haldast óbreyttir. Sjá lib/sveitarfelog_pop.mjs.
// ⚠ Vanti fleiri en 2 af aðallistanum = biluð sókn → skrifar EKKI og gamla skráin heldur sér.
import fs from 'node:fs';
import { px, sel, getJson } from './_pxlib.mjs';
import { ibuarEftirSveitarfelogum, samraemaNofn } from './lib/sveitarfelog_pop.mjs';

const SKRA = new URL('../gogn/sveitarfelog_pop.json', import.meta.url);
const P = 'Ibuar/mannfjoldi/2_byggdir/sveitarfelog/MAN02005.px';
const adallisti = Object.keys(JSON.parse(fs.readFileSync(new URL('../gogn/sveitarfelog_meta.json', import.meta.url), 'utf8')));

const meta = await getJson('https://px.hagstofa.is/pxis/api/v1/is/' + P);
const svar = await px(P, [
  sel('Sveitarfélag', 'all', ['*']), sel('Aldur', 'item', ['-1']), sel('Kyn', 'item', ['0']), sel('Ár', 'top', ['1']),
]);
const { pop, utan, vantar } = samraemaNofn(ibuarEftirSveitarfelogum(meta, svar), adallisti);
if (utan.length) console.log('utan aðallista Karp (sleppt):', utan.join(', '));
if (vantar.length > 2) { console.error(`sveitarfelog_pop: ${vantar.length} vantar (${vantar.join(', ')}) — skrifa EKKI`); process.exit(1); }
if (vantar.length) console.log('⚠ vantar hjá Hagstofu:', vantar.join(', '));
fs.writeFileSync(SKRA, JSON.stringify(pop));
const ar = svar.data?.[0]?.key?.[2];
console.log(`sveitarfelog_pop.json | 1.1.${ar} | ${Object.keys(pop).length} sveitarfélög | ${Object.values(pop).reduce((s, v) => s + v, 0)} íbúar`);
