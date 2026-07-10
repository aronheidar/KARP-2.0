#!/usr/bin/env node
// build_ferdathjonusta.mjs — snapshot fyrir /atvinnuvegir/ferdathjonusta/:
//   • Erlendir farþegar um Keflavík, mánaðarlega (síðustu 180 mán)   (Hagstofa SAM02001)
//   • Gistinætur — erlendir gestir vs. Íslendingar, árlega           (Hagstofa SAM01601)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga).
// -> gogn/ferdathjonusta.json + web/public/gogn/ferdathjonusta.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';
import { monthLabel } from '../src/lib/format.mjs';

const curYear = new Date().getFullYear(); // sjálf-uppfærist (var harðkóðað 2026)
const prev = loadPrev('ferdathjonusta');

// Erlendir farþegar um Keflavík (SAM02001) — Ríkisfang="2" (erlendir), síðustu 180 mánuði.
let C1 = null, kefL = null;
try {
  const j = await px('Atvinnuvegir/ferdathjonusta/ferdaidnadurhagvisar/SAM02001.px', [sel('Ríkisfang', 'item', ['2']), sel('Mánuður', 'top', ['180'])]);
  const m = {};
  j.data.forEach((d) => { const t = d.key.find((k) => /^\d{4}M\d{2}$/.test(k)); const v = num(d.values[0]); if (t && v != null) m[t] = v; });
  const ts = Object.keys(m).sort();
  if (ts.length) { C1 = { x: ts.map(monthLabel), u: 'farþegar', series: [{ name: 'Erlendir farþegar', color: '#f6b13b', data: ts.map((t) => m[t]) }], area: true }; const l = ts[ts.length - 1]; kefL = { t: monthLabel(l), v: m[l] }; }
} catch (e) { console.error('KEF', e.message); }

// Gistinætur (SAM01601) — erlendir gestir (Foreigners) vs. Íslendingar (IS), árlega, allt landið, millj. gistinátta.
let C2 = null, gistL = null;
try {
  const j = await px('Atvinnuvegir/ferdathjonusta/Gisting/3_allartegundirgististada/SAM01601.px', [sel('Þjóðerni', 'item', ['Foreigners', 'IS']), sel('Ár', 'all', ['*']), sel('Landshluti', 'item', ['IS']), sel('Eining', 'item', ['0']), sel('Mánuður', 'item', ['0'])]);
  const erl = {}, isl = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const t = d.key.includes('Foreigners') ? erl : isl; const v = num(d.values[0]); if (y && v != null && +y < curYear) t[y] = Math.round(v / 1e5) / 10; });
  const ys = Object.keys(erl).sort();
  if (ys.length) { C2 = { x: ys, u: 'millj. gistinætur', series: [{ name: 'Erlendir gestir', color: '#c95cf7', data: ys.map((y) => erl[y] ?? null) }, { name: 'Íslendingar', color: '#3a8dff', data: ys.map((y) => isl[y] ?? null) }], stack: true }; gistL = { y: ys[ys.length - 1], v: Math.round(((erl[ys[ys.length - 1]] || 0) + (isl[ys[ys.length - 1]] || 0)) * 10) / 10 }; }
} catch (e) { console.error('GIST', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
C1 = C1 ?? prev.C1 ?? null;
kefL = kefL ?? prev.kefL ?? null;
C2 = C2 ?? prev.C2 ?? null;
gistL = gistL ?? prev.gistL ?? null;
if (!C1 && !C2 && !kefL && !gistL) { console.error('ferdathjonusta: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('ferdathjonusta', { updated: today(), C1, C2, kefL, gistL });
console.log('ferdathjonusta.json | KEF', kefL ? kefL.t + ' ' + kefL.v : false, '| C1', C1 && C1.x.length + ' mán', '| gist', gistL ? gistL.y + ' ' + gistL.v : false, '| C2', C2 && C2.x.length + ' ár', '| bytes', bytes);
