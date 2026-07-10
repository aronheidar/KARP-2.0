#!/usr/bin/env node
// build_menntun.mjs — snapshot fyrir /menntun/ (auðgað, 6 hlutar):
//   • EDU    — menntunarstaða 25–64 eftir ISCED-stigum + eftir kyni          (Hagstofa SKO00002)
//   • ENROLL — fjöldi nemenda eftir skólastigi                                (Hagstofa SKO00000)
//   • FIELD  — brautskráning á háskólastigi eftir fræðasviði                  (Hagstofa SKO04205)
//   • SPEND  — fræðsluútgjöld sem hlutfall af VLF                             (Hagstofa THJ05631)
//   • COST   — kostnaður á hvern nemanda eftir skólastigi                     (Hagstofa THJ05661)
//   (PISA-samanburður Norðurlanda er HARÐKÓÐUÐ heimild í .astro — ekki sótt, ekki hér.)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla per hluta).
// -> gogn/menntun.json + web/public/gogn/menntun.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const prev = loadPrev('menntun');

// 1. EDU — menntunarstaða 25–64 (SKO00002): þróun (bæði kyn) + nýjasta ár eftir kyni ------
const ISCED = { 'ISCED 1, 2': ['Grunnmenntun', '#ff8a3d'], 'ISCED 3, 4': ['Framhaldsskólastig', '#3a8dff'], 'ISCED 5, 6, 7, 8': ['Háskólastig', '#46e08a'] };
const LVLS = Object.keys(ISCED);
let EDU = null;
try {
  const [aj, sj] = await Promise.all([
    px('Samfelag/skolamal/5_menntunarstada/SKO00002.px', [sel('Kyn', 'item', ['Alls']), sel('Aldursflokkur/búseta', 'item', ['25-64']), sel('Menntun', 'item', LVLS)]),
    px('Samfelag/skolamal/5_menntunarstada/SKO00002.px', [sel('Kyn', 'item', ['1', '2']), sel('Aldursflokkur/búseta', 'item', ['25-64']), sel('Menntun', 'item', LVLS)]),
  ]);
  const byLvl = {};
  aj.data.forEach((d) => { const t = d.key.find((k) => /^\d{4}$/.test(k)); const l = d.key.find((k) => ISCED[k]); const v = num(d.values[0]); if (t && l && v != null) (byLvl[l] = byLvl[l] || {})[t] = v; });
  const years = [...new Set(Object.values(byLvl).flatMap((m) => Object.keys(m)))].sort();
  let C_edu = null, uniPct = null, uniY = null;
  if (years.length) {
    C_edu = { x: years, u: '%', stack: true, max: 100, pct: true, series: LVLS.map((l) => ({ name: ISCED[l][0], color: ISCED[l][1], data: years.map((y) => byLvl[l]?.[y] ?? null) })) };
    uniY = years[years.length - 1];
    uniPct = byLvl['ISCED 5, 6, 7, 8']?.[uniY] ?? null;
  }
  const sx = { 1: {}, 2: {} };
  sj.data.forEach((d) => { const t = d.key.find((k) => /^\d{4}$/.test(k)); const kyn = d.key.includes('1') && !d.key.includes('2') ? '1' : d.key.includes('2') ? '2' : null; const l = d.key.find((k) => ISCED[k]); const v = num(d.values[0]); if (t && kyn && l && v != null) ((sx[kyn][t] = sx[kyn][t] || {})[l] = v); });
  const yrs = Object.keys(sx[1]).filter((y) => sx[2][y]).sort();
  const sexY = yrs[yrs.length - 1] ?? null;
  let C_sex = null, uniK = null, uniM = null;
  if (sexY) {
    C_sex = { kind: 'hbar', u: '%', max: 100, pct: true, showLabel: true, gridLeft: 132, x: LVLS.map((l) => ISCED[l][0]), series: [
      { name: 'Konur', color: '#c95cf7', data: LVLS.map((l) => sx[2][sexY][l] ?? null) },
      { name: 'Karlar', color: '#3a8dff', data: LVLS.map((l) => sx[1][sexY][l] ?? null) },
    ] };
    uniK = sx[2][sexY]['ISCED 5, 6, 7, 8'] ?? null; uniM = sx[1][sexY]['ISCED 5, 6, 7, 8'] ?? null;
  }
  if (C_edu || C_sex) EDU = { C_edu, C_sex, uniPct, uniY, uniK, uniM, sexY };
} catch (e) { console.error('EDU', e.message); }

// 2. ENROLL — fjöldi nemenda eftir skólastigi (SKO00000) -----------------------------------
let ENROLL = null;
try {
  const j = await px('Samfelag/skolamal/0_yfirlit/yfirlit/SKO00000.px', [sel('Skólastig', 'item', ['1', '2', '3', '4', '5', '6']), sel('Kyn', 'item', ['Alls']), sel('Ár', 'all', ['*'])]);
  const FOLD = { 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3 };
  const GROUPS = ['Leikskóli', 'Grunnskóli', 'Framhalds- & viðbótarstig', 'Háskóla- & doktorsstig'];
  const GCOL = ['#46e08a', '#3a8dff', '#f6b13b', '#c95cf7'];
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const st = d.key.find((k) => k.length === 1 && FOLD[k] != null); const v = num(d.values[0]); if (y && st && v != null) { const gi = FOLD[st]; (by[gi] = by[gi] || {})[y] = (by[gi][y] || 0) + v; } });
  const years = [...new Set(Object.values(by).flatMap((o) => Object.keys(o)))].sort();
  while (years.length && [0, 1, 2, 3].some((i) => by[i]?.[years[years.length - 1]] == null)) years.pop(); // sleppa ófullgerðu nýjasta ári (t.d. leikskólatölur ekki komnar)
  if (years.length) {
    const C_enroll = { x: years, u: 'nemendur', stack: true, series: GROUPS.map((g, i) => ({ name: g, color: GCOL[i], data: years.map((y) => by[i]?.[y] ?? null) })) };
    const enrollY = years[years.length - 1];
    const haskN = by[3]?.[enrollY] ?? null;
    const totN = [0, 1, 2, 3].reduce((s, i) => s + (by[i]?.[enrollY] || 0), 0);
    ENROLL = { C_enroll, haskN, totN, enrollY };
  }
} catch (e) { console.error('ENROLL', e.message); }

// 3. FIELD — brautskráning á háskólastigi eftir sviði (SKO04205) ---------------------------
const SVID = { 1: 'Menntun', 2: 'Hugvísindi og listir', 3: 'Félagsvís., viðskipti, lögfr.', 4: 'Raunvís., stærðfr., tölvun.', 5: 'Verkfræði & mannvirki', 6: 'Landbúnaður & dýralækn.', 7: 'Heilbrigði & velferð', 8: 'Þjónusta' };
let FIELD = null;
try {
  const j = await px('Samfelag/skolamal/4_haskolastig/1_hsProf/SKO04205.px', [sel('Svið', 'item', Object.keys(SVID)), sel('Prófgráða', 'item', ['Alls']), sel('Kyn', 'item', ['Alls']), sel('Ár', 'top', ['1'])]);
  const by = {};
  let fieldY = null;
  j.data.forEach((d) => { const sv = d.key.find((k) => SVID[k]); const v = num(d.values[0]); if (sv && v != null) by[sv] = v; if (!fieldY) { const yr = d.key.find((k) => /^\d{4}-\d{4}$/.test(k)); if (yr) fieldY = yr; } });
  const rows = Object.keys(SVID).filter((k) => by[k] != null).map((k) => [SVID[k], by[k]]).sort((a, b) => b[1] - a[1]);
  if (rows.length) {
    const C_field = { kind: 'hbar', u: 'brautskráðir', gridLeft: 168, showLabel: true, x: rows.map((r) => r[0]), series: [{ name: 'Brautskráðir ' + (fieldY || ''), color: '#46e08a', data: rows.map((r) => r[1]) }] };
    const gradTot = rows.reduce((s, r) => s + r[1], 0);
    FIELD = { C_field, fieldY, gradTot };
  }
} catch (e) { console.error('FIELD', e.message); }

// 4. SPEND — fræðsluútgjöld % af VLF (THJ05631) -------------------------------------------
let SPEND = null;
try {
  const j = await px('Efnahagur/fjaropinber/fjarmal_fraedsla/1_utgjold_fraedsla/THJ05631.px', [sel('Skipting', 'item', ['5', '7']), sel('Ár', 'all', ['*'])]);
  const b5 = {}, b7 = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const s = d.key.find((k) => k === '5' || k === '7'); const v = num(d.values[0]); if (y && s && v != null) (s === '5' ? b5 : b7)[y] = v; });
  const years = [...new Set([...Object.keys(b5), ...Object.keys(b7)])].sort();
  if (years.length) {
    const C_spend = { x: years, u: '% af VLF', pct: true, series: [
      { name: 'Hið opinbera', color: '#3a8dff', data: years.map((y) => b5[y] ?? null) },
      { name: 'Alls (m. heimilum)', color: '#f6b13b', data: years.map((y) => b7[y] ?? null) },
    ] };
    const spendY = years[years.length - 1];
    const spendPct = b5[spendY] ?? null;
    SPEND = { C_spend, spendPct, spendY };
  }
} catch (e) { console.error('SPEND', e.message); }

// 5. COST — kostnaður á nemanda eftir skólastigi (THJ05661, þús.kr) -----------------------
let COST = null;
try {
  const j = await px('Efnahagur/fjaropinber/fjarmal_fraedsla/1_utgjold_fraedsla/THJ05661.px', [sel('Skipting', 'all', ['*']), sel('Ár', 'top', ['1'])]);
  const map = [['11 Pre-primary', 'Leikskóli', '#46e08a'], ['12 Primary', 'Barnaskóli', '#3a8dff'], ['22 Upper-secondary', 'Framhaldsskóli', '#f6b13b'], ['University', 'Háskóli', '#c95cf7']];
  const got = {};
  let costY = null;
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const sk = d.key.find((k) => k !== y); const v = num(d.values[0]); if (!costY && y) costY = y; if (sk && v != null) map.forEach(([m], i) => { if (sk.includes(m)) got[i] = v; }); });
  if (Object.keys(got).length) {
    const C_cost = { kind: 'bar', u: 'þús.kr', showLabel: true, x: map.map((m) => m[1]), series: [{ name: 'Kostnaður á nemanda ' + (costY || ''), color: '#f6b13b', data: map.map((m, i) => got[i] ?? null) }] };
    const costHask = got[3] ?? null;
    COST = { C_cost, costHask, costY };
  }
} catch (e) { console.error('COST', e.message); }

// Seigla per hluta: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
EDU = EDU ?? prev.EDU ?? null;
ENROLL = ENROLL ?? prev.ENROLL ?? null;
FIELD = FIELD ?? prev.FIELD ?? null;
SPEND = SPEND ?? prev.SPEND ?? null;
COST = COST ?? prev.COST ?? null;
if (!EDU && !ENROLL && !FIELD && !SPEND && !COST) { console.error('menntun: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('menntun', { updated: today(), EDU, ENROLL, FIELD, SPEND, COST });
console.log('menntun.json | EDU', !!EDU, '(háskóli', EDU && EDU.uniPct, '%,', EDU && EDU.uniY, ') | ENROLL', !!ENROLL, '(háskólan.', ENROLL && ENROLL.haskN, ',', ENROLL && ENROLL.enrollY, ') | FIELD', !!FIELD, '(', FIELD && FIELD.gradTot, FIELD && FIELD.fieldY, ') | SPEND', !!SPEND, '(', SPEND && SPEND.spendPct, '%,', SPEND && SPEND.spendY, ') | COST', !!COST, '(', COST && COST.costHask, 'þús,', COST && COST.costY, ') | bytes', bytes);
