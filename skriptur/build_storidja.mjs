#!/usr/bin/env node
// build_storidja.mjs — daglegt gagna-snapshot fyrir /atvinnuvegir/storidja/:
//   • Álverð — LME framvirkt gegnum Yahoo (ALI=F), 10 ár (USD/tonn)
//   • Útflutningsverðmæti áls (UTA06105 fl.15) + kísiljárns (fl.13), frá 1995 (ma.kr)   (Hagstofa UTA06105)
//   • Raforkunotkun — stóriðja vs almenn + eftir grein (GWh)                              (Orkustofnun/Hagstofa IDN02103)
//   • Ferlalosun málmframleiðslu — UNFCCC 2.C (kt CO₂-íg)                                 (Hagstofa UMH31107)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga). #2 LOTA 10 → auðgað.
// Framleiðslugeta álveranna þriggja er harðkóðuð beint í síðunni (engin sókn) → ekki hér.
// -> gogn/storidja.json + web/public/gogn/storidja.json
import { px, sel, num, loadPrev, writeSnapshot, today, fyear } from './_pxlib.mjs';

const curYear = fyear(); // sjálf-uppfærist (var harðkóðað 2026 í frontmatter)
const prev = loadPrev('storidja');

// 1. Álverð — LME framvirkt gegnum Yahoo (ALI=F) --------------------------
let C_price = null, priceL = null;
try {
  const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent('ALI=F') + '?interval=1mo&range=10y', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j = await r.json();
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (res) {
    const ts = res.timestamp || []; const cl = (res.indicators && res.indicators.quote[0].close) || [];
    const x = [], d = [];
    ts.forEach((t, i) => { if (cl[i] != null) { const dt = new Date(t * 1000); x.push(dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0')); d.push(Math.round(cl[i])); } });
    if (x.length > 3) { C_price = { x, u: 'USD/tonn', area: true, series: [{ name: 'Ál — LME framvirkt', color: '#cdd6e6', data: d }] }; priceL = { v: d[d.length - 1] }; }
  }
} catch (e) { console.error('C_price', e.message); }

// 2. Útflutningsverðmæti áls (fl.15) + kísiljárns (fl.13) — UTA06105 -------
let C_export = null, alL = null;
try {
  const j = await px('Efnahagur/utanrikisverslun/1_voruvidskipti/01_voruskipti/UTA06105.px', [sel('Eining', 'item', ['1']), sel('Flokkur', 'item', ['15', '13']), sel('Ár', 'all', ['*'])]);
  const al = {}, kis = {};
  j.data.forEach((d) => { const f = d.key[1], y = d.key[2]; const v = num(d.values[0]); if (!y || v == null || +y < 1995 || +y >= curYear) return; (f === '15' ? al : kis)[y] = Math.round(v / 1e5) / 10; });
  const ys = [...new Set([...Object.keys(al), ...Object.keys(kis)])].sort();
  if (ys.length) {
    C_export = { x: ys, u: 'ma.kr', series: [{ name: 'Ál', color: '#cdd6e6', data: ys.map((y) => al[y] ?? null) }, { name: 'Kísiljárn', color: '#8892a6', data: ys.map((y) => kis[y] ?? null) }] };
    const l = ys[ys.length - 1]; alL = { y: l, al: al[l], kis: kis[l] };
  }
} catch (e) { console.error('C_export', e.message); }

// 3–4. Raforkunotkun — stóriðja vs almenn + eftir grein (IDN02103) --------
let C_use = null, C_sector = null, heavyPct = null, useY = null;
try {
  const SEC = { zALUMINUM_PRODUCTION: ['Álver', '#f6b13b'], zIRON_BLENDE: ['Járnblendi', '#e8436f'], zDATA: ['Gagnaver', '#46e08a'], zFERTILIZER: ['Áburðarverksmiðja', '#8892a6'] };
  const j = await px('Umhverfi/4_orkumal/2_framleidslaognotkun/IDN02103.px', [sel('Ár', 'all', ['*']), sel('Tegund', 'item', ['GENERAL_USE', 'HEAVY_INDUSTRY', 'TOTAL_USE', ...Object.keys(SEC)])]);
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const t = d.key.find((k) => k !== y); const v = num(d.values[0]); if (y && t && v != null) (by[t] = by[t] || {})[y] = v; });
  const years = [...new Set(Object.keys(by).flatMap((t) => Object.keys(by[t])))].sort();
  if (years.length) {
    C_use = { x: years, u: 'GWh', stack: true, series: [{ name: 'Almenn notkun', color: '#3a8dff', data: years.map((y) => by.GENERAL_USE?.[y] ?? null) }, { name: 'Stóriðja', color: '#f6b13b', data: years.map((y) => by.HEAVY_INDUSTRY?.[y] ?? null) }] };
    useY = years[years.length - 1];
    if (by.TOTAL_USE?.[useY] && by.HEAVY_INDUSTRY?.[useY]) heavyPct = Math.round((by.HEAVY_INDUSTRY[useY] / by.TOTAL_USE[useY]) * 1000) / 10;
    C_sector = { x: years, u: 'GWh', stack: true, series: Object.keys(SEC).map((k) => ({ name: SEC[k][0], color: SEC[k][1], data: years.map((y) => by[k]?.[y] ?? null) })) };
  }
} catch (e) { console.error('C_use', e.message); }

// 5. Ferlalosun málmframleiðslu — UMH31107 UNFCCC 2.C (kt CO₂-íg) ---------
let C_emis = null, emisL = null, emisChg = null;
try {
  const j = await px('Umhverfi/2_losunlofttegunda/1_losunlofttegunda_nir/UMH31107.px', [sel('UNFCCC liður', 'item', ['2.C']), sel('Ár', 'all', ['*'])]);
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const v = num(d.values[0]); if (y && v != null) by[y] = Math.round(v * 10) / 10; });
  const years = Object.keys(by).sort();
  if (years.length) {
    C_emis = { x: years, u: 'kt CO₂-íg', area: true, series: [{ name: 'Ferlalosun málmframleiðslu (UNFCCC 2.C)', color: '#e8436f', data: years.map((y) => by[y]) }] };
    const l = years[years.length - 1], f = years.find((y) => by[y] > 0) || years[0];
    emisL = { y: l, v: by[l] };
    if (by[f]) emisChg = Math.round((by[l] / by[f] - 1) * 100);
  }
} catch (e) { console.error('C_emis', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
C_price = C_price ?? prev.C_price ?? null;
priceL = priceL ?? prev.priceL ?? null;
C_export = C_export ?? prev.C_export ?? null;
alL = alL ?? prev.alL ?? null;
C_use = C_use ?? prev.C_use ?? null;
C_sector = C_sector ?? prev.C_sector ?? null;
heavyPct = heavyPct ?? prev.heavyPct ?? null;
useY = useY ?? prev.useY ?? null;
C_emis = C_emis ?? prev.C_emis ?? null;
emisL = emisL ?? prev.emisL ?? null;
emisChg = emisChg ?? prev.emisChg ?? null;
if (!C_price && !C_export && !C_use && !C_sector && !C_emis) { console.error('storidja: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('storidja', { updated: today(), C_price, priceL, C_export, alL, C_use, C_sector, heavyPct, useY, C_emis, emisL, emisChg });
console.log('storidja.json | price', C_price && C_price.x.length, 'mán | export', C_export && C_export.x.length, 'ár | use', C_use && C_use.x.length, '| sector', C_sector && C_sector.series.length, 'grein | emis', C_emis && C_emis.x.length, 'ár | heavyPct', heavyPct, '| bytes', bytes);
