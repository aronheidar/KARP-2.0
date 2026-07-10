#!/usr/bin/env node
// build_menntun.mjs — snapshot fyrir /menntun/:
//   • Þróun menntunarstöðu 25–64 ára eftir ISCED-stigum (bæði kyn) + háskóla-YoY  (Hagstofa SKO00002)
//   • Nýjasta ár eftir kyni
// Áður .astro-frontmatter á hverri byggingu → nú daglegt snapshot (seigla + saga + „vs fyrra ár").
// -> gogn/menntun.json + web/public/gogn/menntun.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const ISCED = { 'ISCED 1, 2': ['Grunnmenntun', '#ff8a3d'], 'ISCED 3, 4': ['Framhaldsskólastig', '#3a8dff'], 'ISCED 5, 6, 7, 8': ['Háskólastig', '#46e08a'] };
const LVLS = Object.keys(ISCED);
const UNI = 'ISCED 5, 6, 7, 8';
const prev = loadPrev('menntun');

let EDU = null;      // þróun (bæði kyn)
let EDUSEX = null;   // nýjasta ár eftir kyni
try {
  const [aj, sj] = await Promise.all([
    px('Samfelag/skolamal/5_menntunarstada/SKO00002.px', [sel('Kyn', 'item', ['Alls']), sel('Aldursflokkur/búseta', 'item', ['25-64']), sel('Menntun', 'item', LVLS)]),
    px('Samfelag/skolamal/5_menntunarstada/SKO00002.px', [sel('Kyn', 'item', ['1', '2']), sel('Aldursflokkur/búseta', 'item', ['25-64']), sel('Menntun', 'item', LVLS)]),
  ]);
  const byLvl = {};
  aj.data.forEach((d) => {
    const t = d.key.find((k) => /^\d{4}$/.test(k));
    const l = d.key.find((k) => ISCED[k]);
    const v = num(d.values[0]);
    if (t && l && v != null) (byLvl[l] = byLvl[l] || {})[t] = v;
  });
  const years = [...new Set(Object.values(byLvl).flatMap((m) => Object.keys(m)))].sort();
  if (years.length) {
    EDU = { years, series: LVLS.map((l) => ({ name: ISCED[l][0], color: ISCED[l][1], data: years.map((y) => byLvl[l]?.[y] ?? null) })) };
    const lastY = years[years.length - 1], prevY = years.length > 1 ? years[years.length - 2] : null;
    EDU.uni = byLvl[UNI]?.[lastY] ?? null;
    EDU.uniPrev = prevY ? (byLvl[UNI]?.[prevY] ?? null) : null;
    EDU.uniYoY = EDU.uni != null && EDU.uniPrev != null ? Math.round((EDU.uni - EDU.uniPrev) * 10) / 10 : null;
    EDU.lastY = lastY;
    EDU.prevY = prevY;
  }
  const sx = { 1: {}, 2: {} };
  sj.data.forEach((d) => {
    const t = d.key.find((k) => /^\d{4}$/.test(k));
    const kyn = d.key.includes('1') && !d.key.includes('2') ? '1' : d.key.includes('2') ? '2' : null;
    const l = d.key.find((k) => ISCED[k]);
    const v = num(d.values[0]);
    if (t && kyn && l && v != null) ((sx[kyn][t] = sx[kyn][t] || {})[l] = v);
  });
  const yrs = Object.keys(sx[1]).filter((y) => sx[2][y]).sort();
  const y = yrs[yrs.length - 1];
  if (y) EDUSEX = { year: y, labels: LVLS.map((l) => ISCED[l][0]), karlar: LVLS.map((l) => sx[1][y][l] ?? null), konur: LVLS.map((l) => sx[2][y][l] ?? null) };
} catch (e) { console.error('EDU', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást.
EDU = EDU ?? prev.EDU ?? null;
EDUSEX = EDUSEX ?? prev.EDUSEX ?? null;
if (!EDU && !EDUSEX) { console.error('menntun: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('menntun', { updated: today(), EDU, EDUSEX });
console.log('menntun.json | háskóli', EDU && EDU.uni, '% (', EDU && EDU.lastY, ') YoY', EDU && EDU.uniYoY, 'pp | bytes', bytes);
