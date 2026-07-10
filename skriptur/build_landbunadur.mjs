#!/usr/bin/env node
// build_landbunadur.mjs — snapshot fyrir /atvinnuvegir/landbunadur/:
//   • Kjötframleiðsla eftir tegundum (Hagstofa LAN10201)
//   • Bústofninn — nautgripir og sauðfé   (Hagstofa LAN10102)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla per hluta).
// -> gogn/landbunadur.json + web/public/gogn/landbunadur.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const curYear = new Date().getFullYear(); // sjálf-uppfærist (var harðkóðað 2026)
const prev = loadPrev('landbunadur');

// Kjötframleiðsla eftir tegundum (tonn), stöpluð, 2000..fyrir líðandi ár (LAN10201).
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

// Bústofninn — nautgripir + sauðfé (þús. dýr), allt landið, frá 1995 (LAN10102).
const BUFE = { 0: ['Nautgripir', '#e8436f'], 6: ['Sauðfé', '#3a8dff'] };
let C2 = null;
try {
  const j = await px('Atvinnuvegir/landbunadur/landbufe/LAN10102.px', [sel('Búpeningur', 'item', ['0', '6']), sel('Landshluti', 'item', ['0']), sel('Ár', 'all', ['*'])]);
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const b = d.key.find((k) => BUFE[k] && k.length === 1); const v = num(d.values[0]); if (y && b && v != null && +y >= 1995) ((by[b] = by[b] || {})[y] = Math.round(v / 100) / 10); });
  const ys = [...new Set(Object.values(by).flatMap((o) => Object.keys(o)))].sort();
  if (ys.length) C2 = { x: ys, u: 'þús. dýr', series: Object.keys(BUFE).filter((k) => by[k]).map((k) => ({ name: BUFE[k][0], color: BUFE[k][1], data: ys.map((y) => by[k][y] ?? null) })) };
} catch (e) { console.error('C2', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
C1 = C1 ?? prev.C1 ?? null;
C2 = C2 ?? prev.C2 ?? null;
kjotL = kjotL ?? prev.kjotL ?? null;
if (!C1 && !C2 && !kjotL) { console.error('landbunadur: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('landbunadur', { updated: today(), C1, C2, kjotL });
console.log('landbunadur.json | C1', !!C1, '| C2', !!C2, '| kjöt', kjotL && kjotL.v, 'tonn (' + (kjotL && kjotL.y) + ') | bytes', bytes);
