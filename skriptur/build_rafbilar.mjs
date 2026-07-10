#!/usr/bin/env node
// build_rafbilar.mjs — snapshot fyrir /rafbilar/:
//   • Heildarfloti fólksbíla í árslok eftir orkugjafa + rafvæðingar-%  (Hagstofa SAM30120)
// SAM30120 = ökutæki undir Umhverfi (EKKI Atvinnuvegir); heildarFLOTI í árslok (ekki nýskráningar).
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga).
// -> gogn/rafbilar.json + web/public/gogn/rafbilar.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const FUEL = { BENSIN: ['Bensín', '#8892a6'], DIESEL: ['Dísil', '#5a6678'], RAFMAGN: ['Rafmagn (BEV)', '#46e08a'], TVINN_PLUGIN: ['Tengiltvinn (PHEV)', '#1fb6c9'], TVINN: ['Tvinn (HEV)', '#3a8dff'], METAN_OTH: ['Metan & annað', '#c95cf7'] };
const CODES = ['ALLIR', ...Object.keys(FUEL)];
const prev = loadPrev('rafbilar');

// Heildarfloti fólksbíla í árslok eftir orkugjafa (SAM30120, Þyngdarflokkur=ALLIR) + rafvæðingar-%.
let CARS = null;
try {
  const j = await px('Umhverfi/5_samgongur/3_okutaekiogvegir/1_okutaeki/SAM30120.px', [sel('Orkugjafi', 'item', CODES), sel('Þyngdarflokkur', 'item', ['ALLIR'])]);
  const by = {};
  j.data.forEach((d) => {
    const y = d.key.find((k) => /^\d{4}$/.test(k));
    const f = d.key.find((k) => CODES.includes(k));
    const v = num(d.values[0]);
    if (y && f && v != null) (by[f] = by[f] || {})[y] = v;
  });
  const years = Object.keys(by.ALLIR || {}).filter((y) => +y >= 2005).sort();
  if (years.length) {
    const lastY = years[years.length - 1];
    const bev = by.RAFMAGN?.[lastY] || 0, phev = by.TVINN_PLUGIN?.[lastY] || 0, total = by.ALLIR?.[lastY] || 0;
    CARS = {
      years,
      series: Object.keys(FUEL).map((f) => ({ name: FUEL[f][0], color: FUEL[f][1], data: years.map((y) => by[f]?.[y] ?? null) })),
      raf: years.map((y) => (by.ALLIR?.[y] ? Math.round((((by.RAFMAGN?.[y] || 0) + (by.TVINN_PLUGIN?.[y] || 0)) / by.ALLIR[y]) * 1000) / 10 : null)),
      lastY, total, bev, rafPct: total ? Math.round(((bev + phev) / total) * 1000) / 10 : null,
    };
  }
} catch (e) { console.error('CARS', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
CARS = CARS ?? prev.CARS ?? null;
if (!CARS) { console.error('rafbilar: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('rafbilar', { updated: today(), CARS });
console.log('rafbilar.json | CARS', !!CARS, '| ár', CARS && CARS.years.length, '| BEV', CARS && CARS.bev, '| rafPct', CARS && CARS.rafPct, '| bytes', bytes);
