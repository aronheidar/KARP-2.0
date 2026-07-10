#!/usr/bin/env node
// build_vidskipti.mjs — snapshot fyrir /vidskipti/ (Utanríkisverslun):
//   • Útflutningur eftir MECE-flokkum (treemap)                 (Hagstofa UTA06105)
//   • Innflutningur eftir SITC-deildum (treemap)                (Hagstofa UTA06202)
//   • Vöruskiptajöfnuður eftir vöruflokkum (útfl − innfl)        (UTA06108 − UTA06202)
//   • Mánaðarleg þróun út/inn/jöfnuður (36 mán)                  (Hagstofa UTA06002)
//   • Viðskipti eftir löndum (12 mán) — fyrir heimskortin        (Hagstofa UTA06003)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla).
// ATH: heimskorta-GeoJSON (world.json) helst RUNTIME-sótt í vafra — EKKI hér.
// -> gogn/vidskipti.json + web/public/gogn/vidskipti.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';
import { monthLabel } from '../src/lib/format.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ISO2NAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'src', 'data', 'iso2name.json'), 'utf8'));

const BASE = 'Efnahagur/utanrikisverslun/1_voruvidskipti/01_voruskipti/';
const toMa = (v, total) => (total > 5e7 ? v / 1e6 : v / 1e3); // þús.kr → ma.kr EÐA m.kr → ma.kr
const curYear = new Date().getFullYear(); // sjálf-uppfærist (var harðkóðað 2026)
const prev = loadPrev('vidskipti');

// Útflutningur eftir MECE-flokkum (treemap).
const EXPLBL = { 1: ['Sjávarafurðir', '#3a8dff'], 11: ['Landbúnaðarafurðir', '#5aa84a'], 13: ['Kísiljárn', '#8892a6'], 15: ['Ál', '#cdd6e6'], 16: ['Aðrar iðnaðarvörur', '#c95cf7'], 17: ['Aðrar vörur', '#7e8ca6'] };
let EXP = null;
try {
  const j = await px(BASE + 'UTA06105.px', [sel('Eining', 'item', ['1']), sel('Flokkur', 'item', Object.keys(EXPLBL)), sel('Ár', 'top', ['2'])]);
  const by = {};
  // ATH: key = [Eining, Flokkur, Ár] og Eining er "1" = sami kóði og Flokkur 1
  // → find() gleypir Eininguna → nota STÖÐUR: key[1]=Flokkur, key[2]=Ár.
  j.data.forEach((d) => {
    const f = d.key[1], y = d.key[2];
    const v = num(d.values[0]);
    if (y && EXPLBL[f] && v != null) (by[y] = by[y] || {})[f] = v;
  });
  const years = Object.keys(by).sort();
  const useY = years.filter((y) => +y < curYear).pop() || years.pop();
  if (useY) {
    const total = Object.values(by[useY]).reduce((a, b) => a + b, 0);
    EXP = { year: useY, total: Math.round(toMa(total, total)), items: Object.keys(by[useY]).map((f) => ({ name: EXPLBL[f][0], value: Math.round(toMa(by[useY][f], total)), itemStyle: { color: EXPLBL[f][1] } })).sort((a, b) => b.value - a.value) };
  }
} catch (e) { EXP = null; }

// Innflutningur eftir SITC-deildum (1. stafur kóða) — treemap.
const SITC = { 0: 'Matvæli', 1: 'Drykkir & tóbak', 2: 'Hráefni', 3: 'Eldsneyti', 4: 'Olíur & feiti', 5: 'Efnavörur', 6: 'Unnar vörur', 7: 'Vélar & flutningatæki', 8: 'Ýmsar iðnaðarvörur', 9: 'Annað' };
const SITCCOL = ['#5aa84a', '#c95cf7', '#8892a6', '#ff6d7a', '#ffd479', '#1fb6c9', '#3a8dff', '#f6b13b', '#e8436f', '#7e8ca6'];
async function sitcAgg(table, eining) {
  const j = await px(BASE + table, [sel('Eining', 'item', [eining]), sel('Vöruflokkur', 'all', ['*']), sel('Ár', 'top', ['2'])]);
  const by = {};
  // ATH víddaröð ÞESSARA taflna er [Vöruflokkur, Ár, Eining] — ÖFUG við UTA06105!
  // → code = key[0] (SITC3-kóði), y = key[1]. Uppsafnað eftir fyrsta staf (deild).
  j.data.forEach((d) => {
    const code = d.key[0], y = d.key[1];
    const v = num(d.values[0]);
    if (!y || !code || v == null || !/^\d/.test(code)) return;
    const div = code[0];
    ((by[y] = by[y] || {})[div] = (by[y][div] || 0) + v);
  });
  const years = Object.keys(by).sort();
  const useY = years.filter((y) => +y < curYear).pop() || years.pop();
  if (!useY) return null;
  const total = Object.values(by[useY]).reduce((a, b) => a + b, 0);
  return { year: useY, total, byDiv: by[useY] };
}
let IMP = null, BAL = null;
try {
  const [im, ex] = await Promise.all([sitcAgg('UTA06202.px', 'M CIF'), sitcAgg('UTA06108.px', 'X FOB')]);
  if (im) {
    IMP = { year: im.year, total: Math.round(toMa(im.total, im.total)), items: Object.keys(im.byDiv).map((d, i) => ({ name: SITC[d] || d, value: Math.round(toMa(im.byDiv[d], im.total)), itemStyle: { color: SITCCOL[+d] || '#8892a6' } })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value) };
  }
  if (im && ex && im.year === ex.year) {
    BAL = { year: im.year, rows: Object.keys(SITC).map((d) => ({ label: SITC[d], v: Math.round(toMa(ex.byDiv[d] || 0, ex.total) - toMa(im.byDiv[d] || 0, im.total)) })).filter((r) => r.v !== 0).sort((a, b) => b.v - a.v) };
  }
} catch (e) { IMP = null; BAL = null; }

// Mánaðarleg þróun: útflutningur / innflutningur / jöfnuður (36 mán).
let TREND = null;
try {
  const j = await px(BASE + 'UTA06002.px', [sel('Mánuður', 'top', ['36']), sel('Flæði', 'item', ['0', '1', '3'])]);
  const by = { 0: {}, 1: {}, 3: {} };
  j.data.forEach((d) => {
    const t = d.key.find((k) => /^\d{4}M\d{2}$/.test(k));
    const f = d.key.find((k) => k === '0' || k === '1' || k === '3');
    const v = num(d.values[0]);
    if (t && f && v != null) by[f][t] = v;
  });
  const ts = Object.keys(by[0]).sort();
  if (ts.length) {
    const tot = ts.reduce((s, t) => s + Math.abs(by[0][t] || 0), 0);
    const sc = (v) => (v == null ? null : Math.round(toMa(v, tot) * 10) / 10);
    TREND = { labels: ts.map(monthLabel), ut: ts.map((t) => sc(by[0][t])), inn: ts.map((t) => sc(by[1][t])), jofn: ts.map((t) => sc(by[3][t])) };
  }
} catch (e) { TREND = null; }

// Viðskipti eftir LÖNDUM (UTA06003, summa 12 mán) — fyrir heimskortin.
// Land-kóðar eru ISO-2 BÓKSTAFIR → engin skörun við Flæði ("0"/"1") eða mánuð.
let BYLAND = null;
try {
  const j = await px(BASE + 'UTA06003.px', [sel('Land', 'all', ['*']), sel('Flæði', 'item', ['0', '1']), sel('Mánuður', 'top', ['12'])]);
  const ut = {}, inn = {};
  let rawTotal = 0;
  j.data.forEach((d) => {
    const t = d.key.find((k) => /^\d{4}M\d{2}$/.test(k));
    const f = d.key.find((k) => k === '0' || k === '1');
    const land = d.key.find((k) => /^[A-Z]{2}$/.test(k));
    const v = num(d.values[0]);
    if (!t || !f || !land || v == null) return;
    const M = f === '0' ? ut : inn;
    M[land] = (M[land] || 0) + v;
    rawTotal += Math.abs(v);
  });
  const sc = (v) => Math.round(toMa(v, rawTotal) * 10) / 10;
  const mk = (M) => Object.keys(M).filter((k) => ISO2NAME[k] && M[k] > 0).map((k) => ({ iso: k, name: ISO2NAME[k], v: sc(M[k]) })).sort((a, b) => b.v - a.v);
  const utArr = mk(ut), innArr = mk(inn);
  if (utArr.length && innArr.length) BYLAND = { ut: utArr, inn: innArr, utTop: utArr[0], innTop: innArr[0] };
} catch (e) { BYLAND = null; }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
EXP = EXP ?? prev.EXP ?? null;
IMP = IMP ?? prev.IMP ?? null;
BAL = BAL ?? prev.BAL ?? null;
TREND = TREND ?? prev.TREND ?? null;
BYLAND = BYLAND ?? prev.BYLAND ?? null;
if (!EXP && !IMP && !BAL && !TREND && !BYLAND) { console.error('vidskipti: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('vidskipti', { updated: today(), EXP, IMP, BAL, TREND, BYLAND });
console.log('vidskipti.json | EXP', EXP && EXP.items.length, 'flokkar | IMP', IMP && IMP.items.length, 'deildir | BAL', BAL && BAL.rows.length, 'raðir | TREND', TREND && TREND.labels.length, 'mán | BYLAND', BYLAND && (BYLAND.ut.length + '/' + BYLAND.inn.length + ' lönd'), '| bytes', bytes);
