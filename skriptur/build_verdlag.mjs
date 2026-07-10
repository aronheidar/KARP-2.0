#!/usr/bin/env node
// build_verdlag.mjs — snapshot fyrir /verdlag/:
//   • Ársverðbólga — 12-mán breyting VNV (CPI, change_A), 24 mán      (Hagstofa VIS01000)
//   • Uppruni verðbólgu — framlag útgjaldaflokka (vægi × 12-mán %)     (Hagstofa VIS01101)
//   • Neyslukarfan — vægi COICOP-yfirflokka í vísitölunni             (Hagstofa VIS01300)
//   • Gengi krónunnar — EUR/USD/GBP + 1 árs EUR/ISK ferill            (frankfurter.app + .dev)
//   • Verðbólguspá — VNV % milli ára, með spáárum fram í tímann        (IMF WEO)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga + spá).
// ⚠ Atvinnuleysi/Numbeo/Seðlabanki eru ÖNNUR snapshots — áfram sótt beint í síðunni gegnum @gogn.
// -> gogn/verdlag.json + web/public/gogn/verdlag.json
import { px, sel, num, getJson, loadPrev, writeSnapshot, today, fyear } from './_pxlib.mjs';
import { monthLabel } from '../src/lib/format.mjs';

const prev = loadPrev('verdlag');

// Ársverðbólga: 12-mán breyting VNV (CPI, change_A), 24 mánuðir. (VIS01000)
let rows = null;
try {
  const j = await px('Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px', [
    sel('Mánuður', 'top', ['24']), sel('Vísitala', 'item', ['CPI']), sel('Liður', 'item', ['change_A']),
  ]);
  const r = j.data.map((d) => ({ t: d.key[0], v: num(d.values[0]) })).filter((x) => x.v != null);
  if (r.length) rows = r;
} catch (e) { console.error('rows', e.message); }

// Gengi (frankfurter.app / ECB): nýjasta EUR/USD/GBP → efstu Lykiltölur.
let fx = null;
try {
  const fj = await getJson('https://api.frankfurter.app/latest?from=EUR&to=ISK,USD,GBP');
  const eurIsk = fj.rates.ISK; // ISK per EUR
  fx = { date: fj.date, eur: eurIsk, usd: eurIsk / fj.rates.USD, gbp: eurIsk / fj.rates.GBP };
} catch (e) { console.error('fx', e.message); }

// Gengi (frankfurter.dev): nýjasta EUR/USD/GBP + 1 árs EUR/ISK ferill → gengisrit.
let FX = null;
try {
  const [lat, rng] = await Promise.all([
    getJson('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=ISK,USD,GBP'),
    getJson('https://api.frankfurter.dev/v1/2025-07-01..?base=EUR&symbols=ISK'),
  ]);
  const dates = Object.keys(rng.rates || {}).sort();
  FX = {
    eur: Math.round(lat.rates.ISK * 10) / 10,
    usd: Math.round((lat.rates.ISK / lat.rates.USD) * 10) / 10,
    gbp: Math.round((lat.rates.ISK / lat.rates.GBP) * 10) / 10,
    date: lat.date, dates, vals: dates.map((d) => Math.round(rng.rates[d].ISK * 100) / 100),
  };
  if (!FX.dates.length) FX = null;
} catch (e) { console.error('FX', e.message); }

// Uppruni verðbólgunnar (VIS01101): framlag = vægi × 12-mán verðbreyting flokks.
const INFLCAT = { '2a': ['Innlendar vörur', '#46e08a'], '2ai': ['Innfluttar vörur', '#3a8dff'], '2bii': ['Blandaðar vörur', '#1fb6c9'], '5a': ['Ferðaþjónusta', '#c95cf7'], '5b': ['Húsnæði', '#f6b13b'], '5c': ['Opinber þjónusta', '#ff8a3d'], '5d': ['Önnur þjónusta', '#8892a6'] };
let INFLSRC = null;
try {
  const CATS = Object.keys(INFLCAT);
  const j = await px('Efnahagur/visitolur/1_vnv/3_greiningarvisitolur/VIS01101.px', [
    sel('Mánuður', 'top', ['27']), sel('Liður', 'item', ['index', 'breakdown']), sel('Útgjaldaflokkur', 'item', CATS),
  ]);
  const idx = {}, wgt = {};
  j.data.forEach((d) => {
    const t = d.key.find((k) => /^\d{4}M\d{2}$/.test(k));
    const cat = d.key.find((k) => CATS.includes(k));
    const lidur = d.key.find((k) => k === 'index' || k === 'breakdown');
    const v = num(d.values[0]);
    if (!t || !cat || !lidur || v == null) return;
    const M = lidur === 'index' ? idx : wgt;
    (M[cat] = M[cat] || {})[t] = v;
  });
  const months = [...new Set(j.data.map((d) => d.key.find((k) => /^\d{4}M\d{2}$/.test(k))))].filter(Boolean).sort();
  const prev12 = (t) => { const m = /^(\d{4})M(\d{2})$/.exec(t); return m ? `${+m[1] - 1}M${m[2]}` : null; };
  const useM = months.filter((t) => months.includes(prev12(t))).slice(-13);
  const series = CATS.map((c) => ({
    name: INFLCAT[c][0], color: INFLCAT[c][1],
    data: useM.map((t) => {
      const a = idx[c] && idx[c][t], b = idx[c] && idx[c][prev12(t)], w = wgt[c] && wgt[c][t];
      return a != null && b != null && w != null ? Math.round((w / 100) * ((a / b - 1) * 100) * 100) / 100 : null;
    }),
  }));
  if (useM.length) INFLSRC = { months: useM.map(monthLabel), series };
} catch (e) { console.error('INFLSRC', e.message); }

// Neyslukarfan (VIS01300): vægi COICOP-yfirflokka í vísitölunni.
const CPLBL = { CP01: 'Matur & drykkir', CP02: 'Áfengi & tóbak', CP03: 'Föt & skór', CP04: 'Húsnæði & orka', CP05: 'Húsbúnaður', CP06: 'Heilsa', CP07: 'Ferðir & flutningar', CP08: 'Póstur & sími', CP09: 'Tómstundir & menning', CP10: 'Menntun', CP11: 'Hótel & veitingar', CP12: 'Annað' };
let BASKET = null;
try {
  const j = await px('Efnahagur/visitolur/1_vnv/2_undirvisitolur/VIS01300.px', [
    sel('Mánuður', 'top', ['1']), sel('Liður', 'item', ['breakdown']), sel('Undirvísitala', 'item', Object.keys(CPLBL)),
  ]);
  const items = [];
  j.data.forEach((d) => {
    const cp = d.key.find((k) => CPLBL[k]);
    const v = num(d.values[0]);
    if (cp && v != null) items.push({ name: CPLBL[cp], value: Math.round(v * 10) / 10 });
  });
  if (items.length >= 8) BASKET = items.sort((a, b) => b.value - a.value);
} catch (e) { console.error('BASKET', e.message); }

// Verðbólguspá — IMF WEO (VNV, % milli ára; inniheldur spáár fram í tímann).
let forecast = null;
try {
  const j = await getJson('https://www.imf.org/external/datamapper/api/v1/PCPIPCH/ISL');
  const series = (j && j.values && j.values.PCPIPCH && j.values.PCPIPCH.ISL) || {};
  const split = fyear(); // fyrsta spáár (WEO: líðandi ár + fram í tímann)
  const years = [];
  for (let y = split - 10; y <= split + 4; y++) years.push(y);
  const values = years.map((y) => { const v = num(series[String(y)]); return v == null ? null : Math.round(v * 10) / 10; });
  if (years.length) forecast = { source: 'Alþjóðagjaldeyrissjóðurinn (IMF WEO)', metric: 'Verðbólga (VNV), % milli ára', splitYear: split, years, values };
} catch (e) { console.error('forecast', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
rows = rows ?? prev.rows ?? null;
fx = fx ?? prev.fx ?? null;
FX = FX ?? prev.FX ?? null;
INFLSRC = INFLSRC ?? prev.INFLSRC ?? null;
BASKET = BASKET ?? prev.BASKET ?? null;
forecast = forecast ?? prev.forecast ?? null;
if (!rows && !fx && !FX && !INFLSRC && !BASKET && !forecast) { console.error('verdlag: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('verdlag', { updated: today(), rows, fx, FX, INFLSRC, BASKET, forecast });
console.log('verdlag.json | rows', rows && rows.length, '| fx', !!fx, '| FX', FX && FX.dates.length, 'punktar | INFLSRC', INFLSRC && INFLSRC.months.length, 'mán | BASKET', BASKET && BASKET.length, 'flokkar | spá', forecast && forecast.years.length, 'ár | bytes', bytes);
