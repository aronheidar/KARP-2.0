#!/usr/bin/env node
// build_hagvoxtur.mjs — snapshot fyrir /hagvoxtur/:
//   • VLF ársfj. (magnbreyting frá fyrra ári) + einkaneysla   (Hagstofa THJ01601)
//   • VLF-Sankey — útgjaldaaðferðin, síðustu 4 ársfj.          (Hagstofa THJ01601)
//   • Norðurlönd — VLF á mann (USD)                            (World Bank)
//   • Hagvaxtarspá — raun-VLF % milli ára, með spáárum          (IMF WEO)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga + spá).
// -> gogn/hagvoxtur.json + web/public/gogn/hagvoxtur.json
import { px, sel, num, getJson, loadPrev, writeSnapshot, today, fyear } from './_pxlib.mjs';

const T = 'Efnahagur/thjodhagsreikningar/landsframl/2_landsframleidsla_arsfj/THJ01601.px';
const qLbl = (t) => t.replace(/(\d{4})Q?([1-4])$/, '$1 F$2').replace(/(\d{4})-?Q([1-4])/, '$1 F$2');
const prev = loadPrev('hagvoxtur');

// VLF + einkaneysla, magnbreyting frá fyrra ári (%), ársfjórðungslega (16 ársfj.).
let GDP = null;
try {
  const [vj, cj] = await Promise.all([
    px(T, [sel('Mælikvarði', 'item', ['2']), sel('Skipting', 'item', ['14']), sel('Ársfjórðungur', 'top', ['16'])]),
    px(T, [sel('Mælikvarði', 'item', ['2']), sel('Skipting', 'item', ['0']), sel('Ársfjórðungur', 'top', ['16'])]),
  ]);
  const grab = (j) => { const m = {}; j.data.forEach((d) => { const t = d.key.find((k) => /\d{4}/.test(k) && /[QF]?[1-4]$/.test(k)) || d.key[d.key.length - 1]; const v = num(d.values[0]); if (t && v != null) m[t] = v; }); return m; };
  const g = grab(vj), c = grab(cj);
  const ts = Object.keys(g).sort();
  if (ts.length) GDP = { labels: ts.map(qLbl), vlf: ts.map((t) => g[t]), neysla: ts.map((t) => c[t] ?? null), latest: g[ts[ts.length - 1]], latestQ: qLbl(ts[ts.length - 1]) };
} catch (e) { console.error('GDP', e.message); }

// VLF-Sankey: útgjaldaaðferðin, summa síðustu 4 ársfj. (verðlag hvers árs, m.kr → ma.kr).
let VSAN = null;
try {
  const j = await px(T, [sel('Mælikvarði', 'item', ['0']), sel('Skipting', 'item', ['0', '1', '2', '8', '11', '14']), sel('Ársfjórðungur', 'top', ['4'])]);
  const LBL = { 0: 'Einkaneysla', 1: 'Samneysla', 2: 'Fjárfesting', 8: 'Útflutningur', 11: 'Innflutningur', 14: 'VLF' };
  const sums = {};
  // key = [Mælikvarði, Skipting, Ársfjórðungur]; Mælikvarði="0" hér → nota key[1] (Skipting) beint.
  j.data.forEach((d) => { const s = d.key[1]; const v = num(d.values[0]); if (LBL[s] != null && v != null) sums[s] = (sums[s] || 0) + v; });
  if (sums[14]) {
    const ma = (v) => Math.round(Math.abs(v) / 1000);
    VSAN = {
      vlf: ma(sums[14]),
      nodes: [
        { name: 'Einkaneysla', itemStyle: { color: '#46e08a' } }, { name: 'Samneysla', itemStyle: { color: '#3a8dff' } },
        { name: 'Fjárfesting', itemStyle: { color: '#c95cf7' } }, { name: 'Útflutningur', itemStyle: { color: '#1fb6c9' } },
        { name: 'Heildareftirspurn', itemStyle: { color: '#f6b13b' } },
        { name: 'Innflutningur', itemStyle: { color: '#ff6d7a' } }, { name: 'VLF', itemStyle: { color: '#ffd479' } },
      ],
      links: [
        { source: 'Einkaneysla', target: 'Heildareftirspurn', value: ma(sums[0]) },
        { source: 'Samneysla', target: 'Heildareftirspurn', value: ma(sums[1]) },
        { source: 'Fjárfesting', target: 'Heildareftirspurn', value: ma(sums[2]) },
        { source: 'Útflutningur', target: 'Heildareftirspurn', value: ma(sums[8]) },
        { source: 'Heildareftirspurn', target: 'Innflutningur', value: ma(sums[11]) },
        { source: 'Heildareftirspurn', target: 'VLF', value: ma(sums[14]) },
      ],
    };
  }
} catch (e) { console.error('VSAN', e.message); }

// Norðurlönd: VLF á mann (USD) — World Bank (MRV=2 + fyrsta non-null gildi).
let WB = null;
try {
  const j = await getJson('https://api.worldbank.org/v2/country/isl;dnk;nor;swe;fin/indicator/NY.GDP.PCAP.CD?format=json&MRV=2');
  const NAME = { Iceland: 'Ísland', Denmark: 'Danmörk', Norway: 'Noregur', Sweden: 'Svíþjóð', Finland: 'Finnland' };
  const byC = {};
  (j[1] || []).forEach((r) => {
    if (r.value == null) return;
    const key = r.countryiso3code;
    if (!byC[key] || +r.date > +byC[key].yr) byC[key] = { label: NAME[r.country.value] || r.country.value, v: Math.round(r.value), yr: r.date, isl: key === 'ISL' };
  });
  const rows = Object.values(byC).sort((a, b) => b.v - a.v);
  if (rows.length) WB = rows;
} catch (e) { console.error('WB', e.message); }

// Hagvaxtarspá — IMF WEO (raun-VLF, % milli ára; inniheldur spáár fram í tímann).
let FORECAST = null;
try {
  const j = await getJson('https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/ISL');
  const series = (j && j.values && j.values.NGDP_RPCH && j.values.NGDP_RPCH.ISL) || {};
  const split = fyear(); // fyrsta spáár (WEO: líðandi ár + fram í tímann)
  const years = Object.keys(series).map(Number).filter((y) => y >= split - 10 && y <= split + 4).sort((a, b) => a - b);
  if (years.length) FORECAST = { source: 'Alþjóðagjaldeyrissjóðurinn (IMF WEO)', metric: 'Raun-VLF, % breyting milli ára', splitYear: split, years, values: years.map((y) => { const v = num(series[String(y)]); return v == null ? null : Math.round(v * 10) / 10; }) };
} catch (e) { console.error('FORECAST', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
GDP = GDP ?? prev.GDP ?? null;
VSAN = VSAN ?? prev.VSAN ?? null;
WB = WB ?? prev.WB ?? null;
FORECAST = FORECAST ?? prev.forecast ?? null;
if (!GDP && !VSAN && !WB && !FORECAST) { console.error('hagvoxtur: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('hagvoxtur', { updated: today(), GDP, VSAN, WB, forecast: FORECAST });
console.log('hagvoxtur.json | GDP', !!GDP, '| VSAN', !!VSAN, '| WB', WB && WB.length, '| spá', FORECAST && FORECAST.years.length, 'ár | bytes', bytes);
