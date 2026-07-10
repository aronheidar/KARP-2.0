#!/usr/bin/env node
// build_umferd.mjs — snapshot fyrir /umferd/ (byggingartíma-hlutinn):
//   • Farþegar um Keflavíkurflugvöll — allir farþegar, mánaðarlega (20 ár → COVID-dýfan sést)  (Hagstofa SAM02001)
// Áður sótt í .astro-frontmatter á hverri byggingu → nú daglegt snapshot (seigla + saga).
// ⚠ LIFANDI vegaumferð (Vegagerðin) + flug (OpenSky) eru áfram sótt á keyrslutíma í <script>-eyjum
//   síðunnar — EKKI hér og EKKI í snapshot.
// -> gogn/umferd.json + web/public/gogn/umferd.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';
import { monthLabel } from '../src/lib/format.mjs';

const prev = loadPrev('umferd');

// Keflavík: allir farþegar, mánaðarlega (20 ár → COVID-dýfan sést).
let KEF = null;
try {
  const j = await px('Atvinnuvegir/ferdathjonusta/ferdaidnadurhagvisar/SAM02001.px', [sel('Ríkisfang', 'item', ['0']), sel('Mánuður', 'top', ['240'])]);
  const m = {};
  j.data.forEach((d) => { const t = d.key.find((k) => /^\d{4}M\d{2}$/.test(k)); const v = num(d.values[0]); if (t && v != null) m[t] = v; });
  const ts = Object.keys(m).sort();
  if (ts.length) {
    const last = ts[ts.length - 1], y1 = ts[ts.length - 13];
    KEF = {
      labels: ts.map(monthLabel), vals: ts.map((t) => m[t]),
      now: m[last], nowLbl: monthLabel(last),
      yoy: m[y1] ? Math.round(((m[last] - m[y1]) / m[y1]) * 1000) / 10 : null,
    };
  }
} catch (e) { console.error('KEF', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
KEF = KEF ?? prev.KEF ?? null;
if (!KEF) { console.error('umferd: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('umferd', { updated: today(), KEF });
console.log('umferd.json | KEF', KEF.now, 'farþegar', KEF.nowLbl, '| yoy', KEF.yoy, '% | punktar', KEF.vals.length, '| bytes', bytes);
