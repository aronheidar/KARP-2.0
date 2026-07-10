#!/usr/bin/env node
// build_landbunadur.mjs — snapshot fyrir /atvinnuvegir/landbunadur/:
//   • Kjötframleiðsla eftir tegundum (tonn, stöfluð)            (Hagstofa LAN10201)  → C1, kjotL
//   • Bústofninn — nautgripir og sauðfé (þús. dýr)              (Hagstofa LAN10102)  → C2
//   • Uppskera/afurðir: mjólk, korn alls, grænmeti eftir teg.   (Hagstofa LAN10103)  → C3, C4, C5, milkL, grainL, vegL
//   • Útflutningur búvara — verðmæti (ma.kr)                    (Hagstofa UTA06105 fl.11) → C6, expL
//   • Framleiðsluvirði landbúnaðar (verð til bænda, ma.kr)      (Hagstofa LAN1101)   → C7, valL
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla per hluta).
// Matvælasjóðs-úthlutanir (C8/grantK) eru áfram bakað-inn @gogn/styrkir.json á síðunni — EKKI hér.
// -> gogn/landbunadur.json + web/public/gogn/landbunadur.json
import { px, sel, num, loadPrev, writeSnapshot, today, fyear } from './_pxlib.mjs';

const curYear = fyear(); // sjálf-uppfærist (var harðkóðað 2026)
const prev = loadPrev('landbunadur');

// 1. Kjötframleiðsla eftir tegundum (tonn), stöpluð, 2000..fyrir líðandi ár (LAN10201).
const KJOT = { 0: ['Kindakjöt', '#3a8dff'], 1: ['Nautakjöt', '#e8436f'], 2: ['Hrossakjöt', '#8892a6'], 3: ['Svínakjöt', '#f6b13b'], 4: ['Alifuglakjöt', '#46e08a'] };
let C1 = null, kjotL = null;
try {
  const j = await px('Atvinnuvegir/landbunadur/landframleidsla/LAN10201.px', [sel('Kjöttegund', 'item', Object.keys(KJOT)), sel('Flokkar', 'item', ['1']), sel('Ár', 'all', ['*'])]);
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const kt = d.key.find((k) => KJOT[k] && k.length === 1); const v = num(d.values[0]); if (y && kt && v != null && +y >= 2000 && +y < curYear) ((by[kt] = by[kt] || {})[y] = Math.round(v)); });
  const ys = [...new Set(Object.values(by).flatMap((o) => Object.keys(o)))].sort();
  if (ys.length) {
    C1 = { x: ys, u: 'tonn', series: Object.keys(KJOT).filter((k) => by[k]).map((k) => ({ name: KJOT[k][0], color: KJOT[k][1], data: ys.map((y) => by[k][y] ?? null) })), stack: true };
    const l = ys[ys.length - 1];
    kjotL = { y: l, v: Object.keys(by).reduce((s, k) => s + (by[k][l] || 0), 0) };
  }
} catch (e) { console.error('C1', e.message); }

// 2. Bústofninn — nautgripir + sauðfé (þús. dýr), allt landið, frá 1995 (LAN10102).
const BUFE = { 0: ['Nautgripir', '#e8436f'], 6: ['Sauðfé', '#3a8dff'] };
let C2 = null;
try {
  const j = await px('Atvinnuvegir/landbunadur/landbufe/LAN10102.px', [sel('Búpeningur', 'item', ['0', '6']), sel('Landshluti', 'item', ['0']), sel('Ár', 'all', ['*'])]);
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const b = d.key.find((k) => BUFE[k] && k.length === 1); const v = num(d.values[0]); if (y && b && v != null && +y >= 1995) ((by[b] = by[b] || {})[y] = Math.round(v / 100) / 10); });
  const ys = [...new Set(Object.values(by).flatMap((o) => Object.keys(o)))].sort();
  if (ys.length) C2 = { x: ys, u: 'þús. dýr', series: Object.keys(BUFE).filter((k) => by[k]).map((k) => ({ name: BUFE[k][0], color: BUFE[k][1], data: ys.map((y) => by[k][y] ?? null) })) };
} catch (e) { console.error('C2', e.message); }

// 3–5. Uppskera og afurðir (mjólk / korn / grænmeti) — LAN10103.
const VEG = { 10: ['Kartöflur', '#f6b13b'], 12: ['Gulrætur', '#ff8a3d'], 13: ['Tómatar', '#e8436f'], 14: ['Gúrkur', '#46e08a'], 15: ['Paprika', '#c95cf7'], 21: ['Salat', '#3a8dff'] };
let C3 = null, C4 = null, C5 = null, milkL = null, grainL = null, vegL = null;
try {
  const codes = ['5', '25', ...Object.keys(VEG)];
  const j = await px('Atvinnuvegir/landbunadur/landbufe/LAN10103.px', [sel('Tegund', 'item', codes), sel('Ár', 'all', ['*'])]);
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const t = d.key.find((k) => k !== y); const v = num(d.values[0]); if (y && t != null && v != null && +y >= 1990 && +y < curYear) ((by[t] = by[t] || {})[y] = v); });
  // Mjólk (t=25) → þús. tonn
  if (by['25']) {
    const ys = Object.keys(by['25']).sort();
    C3 = { x: ys, u: 'þús. tonn', series: [{ name: 'Mjólk', color: '#dfe7f2', data: ys.map((y) => Math.round(by['25'][y] / 100) / 10) }] };
    const l = ys[ys.length - 1]; milkL = { y: l, v: Math.round(by['25'][l] / 1000) };
  }
  // Korn alls (t=5) → tonn
  if (by['5']) {
    const ys = Object.keys(by['5']).sort();
    C5 = { x: ys, u: 'tonn', area: true, series: [{ name: 'Kornuppskera', color: '#e0b64a', data: ys.map((y) => Math.round(by['5'][y])) }] };
    const l = ys[ys.length - 1]; grainL = { y: l, v: Math.round(by['5'][l]) };
  }
  // Grænmeti (stöfluð svæði) → tonn
  const vegYs = [...new Set(Object.keys(VEG).flatMap((k) => (by[k] ? Object.keys(by[k]) : [])))].sort();
  if (vegYs.length) {
    C4 = { x: vegYs, u: 'tonn', stack: true, series: Object.keys(VEG).filter((k) => by[k]).map((k) => ({ name: VEG[k][0], color: VEG[k][1], data: vegYs.map((y) => (by[k][y] != null ? Math.round(by[k][y]) : null)) })) };
    const l = vegYs[vegYs.length - 1]; vegL = { y: l, v: Object.keys(VEG).reduce((s, k) => s + (by[k] && by[k][l] || 0), 0) };
  }
} catch (e) { console.error('C3/C4/C5', e.message); }

// 6. Útflutningur búvara — UTA06105 Flokkur 11 (verðmæti þús.kr → ma.kr).
let C6 = null, expL = null;
try {
  const j = await px('Efnahagur/utanrikisverslun/1_voruvidskipti/01_voruskipti/UTA06105.px', [sel('Eining', 'item', ['1']), sel('Flokkur', 'item', ['11']), sel('Ár', 'all', ['*'])]);
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const v = num(d.values[0]); if (y && v != null && +y >= 2000 && +y < curYear) by[y] = Math.round(v / 1e5) / 10; });
  const ys = Object.keys(by).sort();
  if (ys.length) { C6 = { x: ys, u: 'ma.kr', area: true, series: [{ name: 'Landbúnaðarafurðir', color: '#46e08a', data: ys.map((y) => by[y]) }] }; const l = ys[ys.length - 1]; expL = { y: l, v: by[l] }; }
} catch (e) { console.error('C6', e.message); }

// 7. Framleiðsluvirði landbúnaðar (verð til bænda) — LAN1101 (m.kr → ma.kr).
let C7 = null, valL = null;
try {
  const j = await px('Atvinnuvegir/landbunadur/landbhagreikn/afkomalandbundadarins/LAN1101.px', [sel('Verð', 'item', ['Framleiðsluverð']), sel('Mælikvarði', 'item', ['Verðlag hvers árs']), sel('Vöruflokkur', 'item', ['16', '17']), sel('Ár', 'all', ['*'])]);
  const by = { 16: {}, 17: {} };
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const f = d.key.find((k) => k === '16' || k === '17'); const v = num(d.values[0]); if (y && f && v != null) by[f][y] = Math.round(v / 100) / 10; });
  const ys = [...new Set([...Object.keys(by[16]), ...Object.keys(by[17])])].sort();
  if (ys.length) {
    C7 = { x: ys, u: 'ma.kr', stack: true, series: [{ name: 'Búfjárafurðir', color: '#e8436f', data: ys.map((y) => by[16][y] ?? null) }, { name: 'Jarðargróði', color: '#46e08a', data: ys.map((y) => by[17][y] ?? null) }] };
    const l = ys[ys.length - 1]; valL = { y: l, v: Math.round((by[16][l] || 0) + (by[17][l] || 0)) };
  }
} catch (e) { console.error('C7', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
C1 = C1 ?? prev.C1 ?? null;
C2 = C2 ?? prev.C2 ?? null;
C3 = C3 ?? prev.C3 ?? null;
C4 = C4 ?? prev.C4 ?? null;
C5 = C5 ?? prev.C5 ?? null;
C6 = C6 ?? prev.C6 ?? null;
C7 = C7 ?? prev.C7 ?? null;
kjotL = kjotL ?? prev.kjotL ?? null;
milkL = milkL ?? prev.milkL ?? null;
grainL = grainL ?? prev.grainL ?? null;
vegL = vegL ?? prev.vegL ?? null;
expL = expL ?? prev.expL ?? null;
valL = valL ?? prev.valL ?? null;
if (!C1 && !C2 && !C3 && !C4 && !C5 && !C6 && !C7 && !kjotL && !milkL && !grainL && !vegL && !expL && !valL) {
  console.error('landbunadur: allt tómt og ekkert fyrra snapshot — hætti án skrifa');
  process.exit(1);
}

const bytes = writeSnapshot('landbunadur', { updated: today(), C1, C2, C3, C4, C5, C6, C7, kjotL, milkL, grainL, vegL, expL, valL });
console.log('landbunadur.json | C1', !!C1, 'C2', !!C2, 'C3', !!C3, 'C4', !!C4, 'C5', !!C5, 'C6', !!C6, 'C7', !!C7, '| kjöt', kjotL && kjotL.v, 'tonn (' + (kjotL && kjotL.y) + ') | bytes', bytes);
