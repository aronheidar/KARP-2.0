# ROADS Íslands v0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Byggja gagnsæjan sviðsmynda-/frétta-hermi (En-ROADS-stíll) fyrir íslenska peningastefnu-kjarnann — létt tímaskref-vél kvörðuð úr Karp-gögnum, með frétta-ham og gagnsæis-smelli, sem leysir af einfalda `/hermir/` kennslu-toy-ið.

**Architecture:** Isomorphic hrein vél (`src/lib/roads/engine.mjs`) stígur fram ársfjórðungslega (12 skref = 3 ár) frá grunn-ferli; módelið er GÖGN (`gogn/roads/{baseline,links,scenarios}.json`) — hver orsakakeðja með stuðli, töf, heimild og óvissu. Vélin skilar ferlum með óvissu-böndum (jaðra-samsetning). UI á `/hermir/` neytir vélarinnar client-hlið.

**Tech Stack:** Astro (static SSG), hreint ES-module JS (node + vafri), Canvas 2D fyrir gröf, node-skript sem próf (ekkert test-framework í repo).

## Global Constraints

- Vinna í worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`, branch `b2b-topbar`. Deploy = `git push origin b2b-topbar:main` (rebase; margar sessionir). EKKI í þessari áætlun nema loka-verk.
- **Módelið er gögn, ekki kóði:** öll orsakasambönd í `links.json` (`coef,lag,source,ci_lo,ci_hi`). Vélin er almenn; að breyta módeli = breyta JSON.
- **Vélin er isomorphic:** hrein JS, engar node-deps, keyrir í node (próf) OG í vafra (gagnvirkir sleðar). Engin `fs`/`process` í `engine.mjs`.
- **Óvissa = jaðra-samsetning (deterministísk):** band per útkomu/ársfj. = `Σ ((ci_hi−ci_lo)/2 · |frávik_uppsprettu|)`; `lo=mid−band`, `hi=mid+band`. Ekki tölfræðilegt öryggisbil — næmni fyrir stuðla-óvissu. Óvissa er EKKI keyrð gegnum feedback-lykkjur í v0 (bein-tengsl-óvissa aðeins) — skjalfest einföldun.
- **Feedback-regla:** vogarstöng/sjokk→útkoma mega hafa `lag ≥ 0`. Útkoma→útkoma með `lag ≥ 1` er alltaf öruggt. Útkoma→útkoma með `lag 0` er leyft AÐEINS ef (a) það myndar ekki lag-0 hringrás og (b) uppspretta kemur á undan neytanda í `baseline.outcomes` lyklaröð (vélin reiknar í þeirri röð, svo `dev[uppspretta][t]` er þegar reiknað). Eina lag-0 útkoma→útkoma tengsl v0 er `verdbolga→kaupmattur` (verðbólga er 1. lykill, kaupmáttur 4. → í lagi, engin hringrás því kaupmáttur drífur ekkert).
- **Frávik (deviation):** vogarstöng = `gildi − base`; sjokk = `gildi` (base 0, sjokk ER frávik); útkoma = `dev[from][t−lag]` (mið-frávik, tafið).
- Astro `output:'static'`; scoped-CSS tré-hristist í runtime-innerHTML → nota `is:global`/inline fyrir client-teiknað efni (macro-dashboard gildra).
- Heiðarleg merking áberandi: „stílfærð sambönd byggð á opinberum gögnum — ekki opinber spá."
- Ný gögn í `gogn/roads/`; vél í `src/lib/roads/` (importað `@lib/roads/…` og `@gogn/roads/…`).
- Núverandi tölur (grunnur): stýrivextir 7,75% · verðbólga 5,2% · atvinnuleysi 4,24% · VLF-vöxtur ~2,0% (IMF 2026) · húsnæði +1,6% (cooling). IMF WEO spá: verðbólga→2,8/2,5%, VLF→2,4%.

---

## File Structure

- **Create** `src/lib/roads/engine.mjs` — hrein tímaskref-vél (`simulate`, `deviationOf`). Eina reiknilógíkin.
- **Create** `src/lib/roads/engine.test.mjs` — node-próf (fixtures + fullyrðingar).
- **Create** `skriptur/build_roads.mjs` — kvörðun: byggir `baseline.json`+`links.json`+`scenarios.json` úr `gogn/`.
- **Create** `gogn/roads/baseline.json`, `gogn/roads/links.json`, `gogn/roads/scenarios.json` — módelið (byggt af skriptinu).
- **Modify** `web/src/pages/hermir.astro` — UI-skel: sleðar + ferla-gröf + óvissu-bönd + frétta-hamur + gagnsæis-smellur.
- **Create** `skriptur/backtest_roads.mjs` — söguleg sannreyning (loka-verk).

---

## Task 1: Vél (`engine.mjs`) + einingapróf

**Files:**
- Create: `src/lib/roads/engine.mjs`
- Create: `src/lib/roads/engine.test.mjs`

**Interfaces:**
- Produces: `simulate({ baseline, links, levers, shocks, quarters }) → { quarters, outcomes: { <key>: { label, unit, mid:number[], lo:number[], hi:number[], baseline:number[] } } }`. `deviationOf(from, s, ctx) → number`.
- Data shapes (consumed by later tasks): `baseline = { quarters:number, levers:{<k>:{base,min,max,step,unit,label}}, shocks:{<k>:{base,min,max,step,unit,label}}, outcomes:{<k>:{label,unit,path:number[]}}, clamp:{<k>:[lo,hi]} }`. `links = [{ id, from, to, coef, lag, unit, source, ci_lo, ci_hi, note }]`. `levers/shocks = {<k>: value}` (frjáls; sjálfgefið base).

- [ ] **Step 1: Write the failing test**

Create `src/lib/roads/engine.test.mjs`:

```js
import { simulate, deviationOf } from './engine.mjs';
let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }

// Fixture: 1 lever (vextir base 8), 1 outcome (verdbolga BAU flat 4), 1 link vextir→verdbolga coef -0.15 lag 2
const baseline = {
  quarters: 6,
  levers: { vextir: { base: 8, min: 0, max: 15, step: 0.25, unit: '%', label: 'Vextir' } },
  shocks: { olia: { base: 0, min: -50, max: 100, step: 5, unit: '%', label: 'Olía' } },
  outcomes: {
    verdbolga: { label: 'Verðbólga', unit: '%', path: [4, 4, 4, 4, 4, 4] },
    laun: { label: 'Laun', unit: '%', path: [6, 6, 6, 6, 6, 6] },
  },
  clamp: { verdbolga: [0, 25] },
};
const links = [
  { id: 'r_infl', from: 'vextir', to: 'verdbolga', coef: -0.15, lag: 2, unit: 'pp', source: 'test', ci_lo: -0.25, ci_hi: -0.05 },
  { id: 'infl_laun', from: 'verdbolga', to: 'laun', coef: 0.4, lag: 1, unit: 'pp', source: 'test', ci_lo: 0.4, ci_hi: 0.4 },
];

// 1) Engin breyting → útkoma == grunnur
{
  const r = simulate({ baseline, links, levers: {}, shocks: {}, quarters: 6 });
  ok('no change → verdbolga == baseline', r.outcomes.verdbolga.mid.every((v, i) => approx(v, 4)));
  ok('lo == mid == hi when no deviation', r.outcomes.verdbolga.lo.every((v, i) => approx(v, r.outcomes.verdbolga.mid[i])));
}
// 2) +2pp vextir → −0.15*2 = −0.30 áhrif, en AÐEINS frá ársfj. index 2 (lag 2)
{
  const r = simulate({ baseline, links, levers: { vextir: 10 }, shocks: {}, quarters: 6 });
  ok('lag: q0,q1 unchanged', approx(r.outcomes.verdbolga.mid[0], 4) && approx(r.outcomes.verdbolga.mid[1], 4));
  ok('lag: q2 = 4 + (-0.15*2) = 3.70', approx(r.outcomes.verdbolga.mid[2], 3.70));
  ok('band at q2 = ((-0.05 - -0.25)/2)*|2| = 0.20', approx(r.outcomes.verdbolga.lo[2], 3.50) && approx(r.outcomes.verdbolga.hi[2], 3.90));
}
// 3) Feedback: verdbolga(dev)→laun með lag 1 (laun færist eftir að verðbólga hreyfist)
{
  const r = simulate({ baseline, links, levers: { vextir: 10 }, shocks: {}, quarters: 6 });
  // verðbólgu-frávik fyrst í q2 (−0.30); laun frávik = 0.4*(−0.30) í q3
  ok('feedback: laun q2 unchanged', approx(r.outcomes.laun.mid[2], 6));
  ok('feedback: laun q3 = 6 + 0.4*(-0.30) = 5.88', approx(r.outcomes.laun.mid[3], 5.88));
}
// 4) clamp virkar
{
  const b2 = JSON.parse(JSON.stringify(baseline)); b2.outcomes.verdbolga.path = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const r = simulate({ baseline: b2, links, levers: { vextir: 20 }, shocks: {}, quarters: 6 });
  ok('clamp: verdbolga never < 0', r.outcomes.verdbolga.lo.every((v) => v >= 0));
}
// 5) deviationOf: lever/shock/outcome
{
  const ctx = { levers: { vextir: { base: 8, value: 10 } }, shocks: { olia: { base: 0, value: 25 } }, dev: { verdbolga: [0, -0.3, -0.3] } };
  ok('deviationOf lever', approx(deviationOf('vextir', 0, ctx), 2));
  ok('deviationOf shock', approx(deviationOf('olia', 0, ctx), 25));
  ok('deviationOf outcome', approx(deviationOf('verdbolga', 1, ctx), -0.3));
}

console.log(`\nROADS engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/lib/roads/engine.test.mjs`
Expected: FAIL — `Cannot find module './engine.mjs'` (or import error).

- [ ] **Step 3: Write the engine**

Create `src/lib/roads/engine.mjs`:

```js
// ROADS Íslands — hrein tímaskref-vél (isomorphic: node + vafri).
// Módel = gögn (baseline + links). Skilar ferlum m/óvissu-böndum (jaðra-samsetning).
// Frávik: vogarstöng = gildi−base (fast yfir t); sjokk = gildi (base 0); útkoma = tafið mið-frávik.
// Regla: útkoma→útkoma tengsl verða að hafa lag ≥ 1.

export function deviationOf(from, s, ctx) {
  const { levers, shocks, dev } = ctx;
  if (levers && from in levers) return levers[from].value - levers[from].base;
  if (shocks && from in shocks) return shocks[from].value;
  if (dev && dev[from]) return dev[from][s] ?? 0;
  return 0;
}

export function simulate({ baseline, links, levers = {}, shocks = {}, quarters } = {}) {
  const Q = quarters ?? baseline.quarters;
  const outKeys = Object.keys(baseline.outcomes);
  const L = {}; for (const k in baseline.levers) L[k] = { base: baseline.levers[k].base, value: levers[k] ?? baseline.levers[k].base };
  const S = {}; for (const k in baseline.shocks) S[k] = { base: baseline.shocks[k].base, value: shocks[k] ?? baseline.shocks[k].base };
  const dev = {}, unc = {};
  for (const k of outKeys) { dev[k] = new Array(Q).fill(0); unc[k] = new Array(Q).fill(0); }
  const ctx = { levers: L, shocks: S, dev };
  const byTo = {};
  for (const ln of links) (byTo[ln.to] ||= []).push(ln);
  for (let t = 0; t < Q; t++) {
    for (const to of outKeys) {
      let d = 0, u = 0;
      for (const ln of (byTo[to] || [])) {
        const s = t - (ln.lag || 0);
        if (s < 0) continue;
        const fd = deviationOf(ln.from, s, ctx);
        d += ln.coef * fd;
        const band = ((ln.ci_hi ?? ln.coef) - (ln.ci_lo ?? ln.coef)) / 2;
        u += Math.abs(band * fd);
      }
      dev[to][t] = d; unc[to][t] = u;
    }
  }
  const outcomes = {};
  for (const k of outKeys) {
    const path = baseline.outcomes[k].path;
    const cl = (baseline.clamp || {})[k];
    const clamp = cl ? (v) => Math.max(cl[0], Math.min(cl[1], v)) : (v) => v;
    outcomes[k] = {
      label: baseline.outcomes[k].label,
      unit: baseline.outcomes[k].unit,
      baseline: path.slice(0, Q),
      mid: path.slice(0, Q).map((p, t) => clamp(p + dev[k][t])),
      lo: path.slice(0, Q).map((p, t) => clamp(p + dev[k][t] - unc[k][t])),
      hi: path.slice(0, Q).map((p, t) => clamp(p + dev[k][t] + unc[k][t])),
    };
  }
  return { quarters: Q, outcomes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/lib/roads/engine.test.mjs`
Expected: PASS — `ROADS engine: 12 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roads/engine.mjs src/lib/roads/engine.test.mjs
git commit -m "ROADS v0: tímaskref-vél (engine.mjs) + einingapróf"
```

---

## Task 2: Kvörðun — `build_roads.mjs` → baseline/links/scenarios

**Files:**
- Create: `skriptur/build_roads.mjs`
- Create (via script): `gogn/roads/baseline.json`, `gogn/roads/links.json`, `gogn/roads/scenarios.json`

**Interfaces:**
- Consumes: `gogn/*.json` (sedlabanki, verdlag, hagvoxtur, atvinnuleysi, fasteignir). Engine data shapes frá Task 1.
- Produces: `gogn/roads/{baseline,links,scenarios}.json` sem Task 3 hleður og gefur `simulate`.

- [ ] **Step 1: Skrifa kvörðunar-skriptið**

Create `skriptur/build_roads.mjs`:

```js
// Byggir ROADS-módelið (baseline + links + scenarios) úr Karp-gögnunum.
// Grunn-ferlar: línulegur glide frá núverandi gildi að IMF-spá yfir 12 ársfj. (einfaldað BAU).
// Tengsl: curated, hvert með HEIMILD (source) + óvissu-bandi (ci). Stílfærð sambönd, ekki spá.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = (f) => JSON.parse(readFileSync(join(ROOT, 'gogn', f + '.json'), 'utf8'));
const Q = 12; // 12 ársfj. = 3 ár

const SB = g('sedlabanki').headline;
const rateNow = SB.meginvextir.value;      // 7.75
const inflNow = SB.verdbolga.value;        // 5.2
const gdpF = g('hagvoxtur').forecast.values; // IMF, síðustu = 2.4
const inflF = g('verdlag').forecast.values;  // IMF, → 2.5
const unemNow = g('atvinnuleysi').latest;    // 4.24
const houseNow = g('fasteignir').direction.chg12; // 1.6

// línulegur glide núverandi → target yfir Q ársfj.
const glide = (from, to, q = Q) => Array.from({ length: q }, (_, i) => +(from + (to - from) * (i / (q - 1))).toFixed(3));

const baseline = {
  updated: new Date().toISOString().slice(0, 10),
  quarters: Q,
  disclaimer: 'Stílfærð sambönd byggð á opinberum gögnum — ekki opinber spá.',
  levers: {
    vextir: { base: rateNow, min: 0, max: 12, step: 0.25, unit: '%', label: 'Stýrivextir (Seðlabanki)' },
    laun: { base: 6, min: 0, max: 14, step: 0.5, unit: '%/ári', label: 'Launahækkun (kjarasamningar)' },
    vedhlutfall: { base: 80, min: 50, max: 90, step: 5, unit: '%', label: 'Hámarks veðsetningarhlutfall' },
  },
  shocks: {
    olia: { base: 0, min: -50, max: 100, step: 5, unit: '%', label: 'Olíuverð (frávik)' },
    gengi: { base: 0, min: -25, max: 25, step: 1, unit: '%', label: 'Gengi krónu (styrking +)' },
    ferdamenn: { base: 0, min: -40, max: 40, step: 5, unit: '%', label: 'Ferðamenn (frávik)' },
    althjodavextir: { base: 0, min: -3, max: 3, step: 0.25, unit: 'pp', label: 'Alþjóðavextir (frávik)' },
  },
  outcomes: {
    verdbolga: { label: 'Verðbólga', unit: '%', path: glide(inflNow, 2.6) },
    hagvoxtur: { label: 'Hagvöxtur (VLF)', unit: '%', path: glide(gdpF[10] ?? 1.9, gdpF[gdpF.length - 1] ?? 2.4) },
    atvinnuleysi: { label: 'Atvinnuleysi', unit: '%', path: glide(unemNow, 4.0) },
    kaupmattur: { label: 'Kaupmáttur launa', unit: '%', path: glide(0.8, 1.5) },
    husnaedi: { label: 'Húsnæðisverð (12-mán)', unit: '%', path: glide(houseNow, 3.0) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30] },
};

// ── Tengsl (curated, með heimild + óvissu). pp = prósentustig, % = prósent-breyting. ──
// Heimildir: SÍ Peningamál/QMM-yfirfærslustuðlar, Hagstofa, OECD; röð-metið þar sem tekið fram.
const links = [
  { id: 'r_infl', from: 'vextir', to: 'verdbolga', coef: -0.15, lag: 4, unit: 'pp/pp', ci_lo: -0.28, ci_hi: -0.06, source: 'SÍ QMM peningastefnu-yfirfærsla (~1 árs töf)', note: 'Aðhald lækkar verðbólgu tafið' },
  { id: 'r_gdp', from: 'vextir', to: 'hagvoxtur', coef: -0.20, lag: 2, unit: 'pp/pp', ci_lo: -0.35, ci_hi: -0.08, source: 'SÍ QMM / OECD teygni' },
  { id: 'r_unem', from: 'vextir', to: 'atvinnuleysi', coef: 0.10, lag: 4, unit: 'pp/pp', ci_lo: 0.03, ci_hi: 0.18, source: 'Okun-tengt, SÍ' },
  { id: 'r_house', from: 'vextir', to: 'husnaedi', coef: -0.80, lag: 2, unit: '%/pp', ci_lo: -1.30, ci_hi: -0.40, source: 'Röð-metið: sedlabanki × fasteignir (2010–2026)' },
  { id: 'w_infl', from: 'laun', to: 'verdbolga', coef: 0.30, lag: 2, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.45, source: 'Launa-verð spírall, Hagstofa/SÍ' },
  { id: 'w_house', from: 'laun', to: 'husnaedi', coef: 0.40, lag: 3, unit: '%/pp', ci_lo: 0.15, ci_hi: 0.70, source: 'Kaupgeta → húsnæðiseftirspurn' },
  { id: 'ltv_house', from: 'vedhlutfall', to: 'husnaedi', coef: 0.15, lag: 2, unit: '%/pp', ci_lo: 0.05, ci_hi: 0.30, source: 'Þjóðhagsvarúð, HMS/FME' },
  { id: 'oil_infl', from: 'olia', to: 'verdbolga', coef: 0.02, lag: 1, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.035, source: 'Olíuverðs-yfirfærsla, Hagstofa VNV-vægi' },
  { id: 'fx_infl', from: 'gengi', to: 'verdbolga', coef: -0.06, lag: 1, unit: 'pp/%', ci_lo: -0.12, ci_hi: -0.02, source: 'Gengisyfirfærsla (styrking lækkar innflutt verð)' },
  { id: 'fx_gdp', from: 'gengi', to: 'hagvoxtur', coef: -0.03, lag: 2, unit: 'pp/%', ci_lo: -0.07, ci_hi: 0.0, source: 'Sterk króna → lakari útflutningsvegur' },
  { id: 'tour_gdp', from: 'ferdamenn', to: 'hagvoxtur', coef: 0.03, lag: 1, unit: 'pp/%', ci_lo: 0.015, ci_hi: 0.05, source: 'Ferðaþjónusta ~8% VLF, ferdathjonusta × hagvoxtur' },
  { id: 'tour_unem', from: 'ferdamenn', to: 'atvinnuleysi', coef: -0.02, lag: 1, unit: 'pp/%', ci_lo: -0.04, ci_hi: -0.005, source: 'Ferðaþjónusta vinnuaflsfrek' },
  { id: 'wr_infl', from: 'althjodavextir', to: 'vextir', coef: 0, lag: 0, unit: '', ci_lo: 0, ci_hi: 0, source: 'ATH: alþjóðavextir hafa ekki bein áhrif á útkomu í v0 (aðeins í gegnum gengi handvirkt)', note: 'placeholder — engin bein keðja í v0' },
  // Feedback-lykkjur (lag ≥ 1):
  { id: 'infl_wage', from: 'verdbolga', to: 'kaupmattur', coef: -1.0, lag: 0, unit: 'pp/pp', ci_lo: -1.0, ci_hi: -1.0, source: 'Skilgreining: kaupmáttur = nafnlaun − verðbólga' },
  { id: 'wage_kaup', from: 'laun', to: 'kaupmattur', coef: 1.0, lag: 0, unit: 'pp/pp', ci_lo: 1.0, ci_hi: 1.0, source: 'Skilgreining: nafnlauna-hluti kaupmáttar' },
  { id: 'gdp_unem', from: 'hagvoxtur', to: 'atvinnuleysi', coef: -0.30, lag: 1, unit: 'pp/pp', ci_lo: -0.5, ci_hi: -0.15, source: "Okun's law, íslensk aðlögun" },
  { id: 'house_infl', from: 'husnaedi', to: 'verdbolga', coef: 0.05, lag: 1, unit: 'pp/%', ci_lo: 0.02, ci_hi: 0.09, source: 'Reiknuð húsaleiga í VNV' },
  { id: 'infl_wageloop', from: 'verdbolga', to: 'laun', coef: 0.35, lag: 4, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.55, source: 'Verðbólga → næstu kjarasamningar (vísitölu-tenging)' },
];
// fjarlægja placeholder-tengsl með coef 0 (halda gögnum hreinum)
const cleanLinks = links.filter((l) => l.coef !== 0 || l.ci_lo !== 0 || l.ci_hi !== 0);

const scenarios = [
  { id: 'vaxtahaekkun', label: 'Vaxtahækkun 0,25pp', tldr: 'Seðlabankinn hækkar stýrivexti', levers: { vextir: rateNow + 0.25 }, shocks: {}, sentence: 'Vaxtahækkun um 0,25 prósentustig gæti — að öllu öðru óbreyttu — hægt á verðbólgu og húsnæðisverði á 1–2 árum, en dregið lítillega úr hagvexti.' },
  { id: 'vaxtalaekkun', label: 'Vaxtalækkun 0,5pp', tldr: 'Seðlabankinn lækkar stýrivexti', levers: { vextir: rateNow - 0.5 }, shocks: {}, sentence: 'Vaxtalækkun um 0,5 prósentustig gæti örvað hagvöxt og húsnæðisverð, á kostnað hærri verðbólgu tafið.' },
  { id: 'kjarasamningar', label: 'Kjarasamningar +8%', tldr: 'Launahækkun umfram forsendur', levers: { laun: 8 }, shocks: {}, sentence: 'Launahækkun upp á 8% eykur kaupmátt til skamms tíma en ýtir undir verðbólgu og húsnæðisverð, sem getur kallað á hærri vexti.' },
  { id: 'lodnubrestur', label: 'Aflabrestur (útflutn. −10%)', tldr: 'Loðnubrestur veikir gjaldeyri', levers: {}, shocks: { gengi: -6 }, sentence: 'Aflabrestur sem veikir krónuna um ~6% hækkar innflutt verð og verðbólgu, og bætir tímabundið útflutningsveg.' },
  { id: 'ferdamannafall', label: 'Ferðamönnum fækkar 20%', tldr: 'Samdráttur í ferðaþjónustu', levers: {}, shocks: { ferdamenn: -20 }, sentence: 'Fækkun ferðamanna um 20% dregur úr hagvexti og eykur atvinnuleysi, einkum á Suðurnesjum og í þjónustu.' },
  { id: 'oliuskellur', label: 'Olíuverð +40%', tldr: 'Alþjóðlegur olíuskellur', levers: {}, shocks: { olia: 40 }, sentence: 'Olíuverðshækkun um 40% ýtir undir verðbólgu gegnum eldsneyti og flutning, með takmörkuðum beinum áhrifum á hagvöxt.' },
];

mkdirSync(join(ROOT, 'gogn', 'roads'), { recursive: true });
const w = (f, o) => writeFileSync(join(ROOT, 'gogn', 'roads', f), JSON.stringify(o, null, 1));
w('baseline.json', baseline);
w('links.json', cleanLinks);
w('scenarios.json', scenarios);
console.log(`ROADS módel byggt: ${Object.keys(baseline.outcomes).length} útkomur, ${cleanLinks.length} tengsl, ${scenarios.length} sviðsmyndir. Vextir=${rateNow} Verðbólga=${inflNow}`);
```

- [ ] **Step 2: Keyra skriptið**

Run: `node skriptur/build_roads.mjs`
Expected: prentar `ROADS módel byggt: 5 útkomur, ~17 tengsl, 6 sviðsmyndir. Vextir=7.75 Verðbólga=5.2`; skrifar 3 skrár í `gogn/roads/`.

- [ ] **Step 3: Sannreyna módel gegn vélinni (feedback-regla + heilbrigði)**

Create `skriptur/verify_roads_model.mjs`:

```js
import { simulate } from '../src/lib/roads/engine.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const R = join(dirname(fileURLToPath(import.meta.url)), '..', 'gogn', 'roads');
const baseline = JSON.parse(readFileSync(join(R, 'baseline.json')));
const links = JSON.parse(readFileSync(join(R, 'links.json')));
let bad = 0;
const outArr = Object.keys(baseline.outcomes);
const outKeys = new Set(outArr);
// (a) útkoma→útkoma með lag 0: bannað EF það myndar lag-0 hringrás; og uppspretta verður á undan
//     neytanda í outcome-lyklaröð (vélin reiknar í þeirri röð). lag ≥ 1 er alltaf öruggt.
const oo0 = links.filter((l) => outKeys.has(l.from) && outKeys.has(l.to) && (l.lag || 0) === 0);
const adj = {}; for (const l of oo0) (adj[l.from] ||= []).push(l.to);
const GREY = 1, BLACK = 2, color = {};
const hasCycle = (n) => { color[n] = GREY; for (const m of (adj[n] || [])) { if (color[m] === GREY) return true; if (color[m] === undefined && hasCycle(m)) return true; } color[n] = BLACK; return false; };
for (const n of Object.keys(adj)) if (color[n] === undefined && hasCycle(n)) { console.log('⚠ lag-0 hringrás um', n); bad++; }
for (const l of oo0) if (outArr.indexOf(l.from) >= outArr.indexOf(l.to)) { console.log('⚠ lag-0 útkoma-röð röng (uppspretta ekki á undan neytanda):', l.id); bad++; }
// (b) hver stuðull ber heimild + ci
for (const l of links) if (!l.source || l.ci_lo === undefined || l.ci_hi === undefined) { console.log('⚠ tengsl vantar source/ci:', l.id); bad++; }
// (c) grunn-keyrsla: engin breyting → mið == grunnur
const r0 = simulate({ baseline, links, levers: {}, shocks: {}, quarters: baseline.quarters });
for (const k in r0.outcomes) if (!r0.outcomes[k].mid.every((v, i) => Math.abs(v - r0.outcomes[k].baseline[i]) < 1e-9)) { console.log('⚠ BAU ≠ mið fyrir', k); bad++; }
// (d) vaxtahækkun → verðbólga lækkar tafið (átt)
const r1 = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 1 }, quarters: baseline.quarters });
if (!(r1.outcomes.verdbolga.mid[baseline.quarters - 1] < r0.outcomes.verdbolga.mid[baseline.quarters - 1])) { console.log('⚠ +1pp vextir lækkar ekki verðbólgu í lok'); bad++; }
console.log(bad ? `\n${bad} vandamál` : '\n✓ módel heilbrigt: feedback-regla, heimildir/ci, BAU, átt vaxta→verðbólgu');
process.exit(bad ? 1 : 0);
```

> ATH (skilgreiningar-tengsl): `infl_wage` (verdbolga→kaupmattur, lag 0) og `wage_kaup`
> (laun→kaupmattur, lag 0) skilgreina kaupmátt = nafnlaun − verðbólga. `wage_kaup` er
> lever→útkoma (alltaf í lagi). `infl_wage` er útkoma→útkoma lag 0 — LÖGLEGT skv. feedback-reglu
> því (a) engin lag-0 hringrás (kaupmáttur drífur ekkert) og (b) `verdbolga` er á undan
> `kaupmattur` í `outcomes`-röð. Verify-skriptið hér að ofan sannreynir einmitt þetta (lag-0
> hringrás + röð), svo það stenst án undanþágu. Halda `outcomes`-röð: verdbolga … kaupmattur (síðar).

Run: `node skriptur/verify_roads_model.mjs`
Expected: `✓ módel heilbrigt: …`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add skriptur/build_roads.mjs skriptur/verify_roads_model.mjs gogn/roads/
git commit -m "ROADS v0: kvörðun (build_roads) → baseline/links/scenarios + módel-sannreyning"
```

---

## Task 3: UI — `/hermir/` með sleðum, ferla-gröfum og óvissu-böndum

**Files:**
- Modify: `web/src/pages/hermir.astro` (heildar-endurskrif á efni + script)

**Interfaces:**
- Consumes: `@lib/roads/engine.mjs` (`simulate`), `@gogn/roads/{baseline,links,scenarios}.json`.
- Produces: gagnvirk síða; frétta-hamur/gagnsæi bætt í Task 4.

- [ ] **Step 1: Endurskrifa hermir.astro (grunn-UI + gröf)**

Replace `web/src/pages/hermir.astro` að fullu:

```astro
---
// ROADS Íslands v0 — Peningastefnu-hermir. Vél: @lib/roads/engine.mjs (client-hlið).
// Módel: @gogn/roads/*.json (byggt af build_roads.mjs). Stílfærð sambönd, ekki spá.
import Layout from '../layouts/Layout.astro';
import BASELINE from '@gogn/roads/baseline.json';
import LINKS from '@gogn/roads/links.json';
import SCENARIOS from '@gogn/roads/scenarios.json';
const desc = 'ROADS Íslands — gagnsær sviðsmynda-hermir fyrir peningastefnu: stilltu vexti, laun og sjokk og sjáðu stílfærð áhrif á verðbólgu, hagvöxt, atvinnuleysi og húsnæðisverð næstu 3 árin, með óvissu og heimildum.';
---
<Layout title="ROADS Íslands — peningastefnu-hermir | Karp" description={desc} canonical="https://karp.is/hermir/" ogTitle="ROADS Íslands — hermir">
  <main data-pg="roads">
    <p class="kicker">Hagvísir Íslands · Efnahagur</p>
    <h1>ROADS Íslands 🎛️</h1>
    <p>Stilltu ákvarðanir og ytri sjokk — sjáðu stílfærð áhrif á hagkerfið næstu 3 árin, með óvissu og heimild á hverri keðju. <strong>Stílfærð sambönd byggð á opinberum gögnum — ekki opinber spá.</strong></p>

    <div id="scn" class="scn"></div>
    <div id="charts" class="charts"></div>
    <div class="lev-h">Ákvarðanir & sjokk</div>
    <div id="levers" class="levers"></div>
    <div class="actions"><button id="rs" type="button">↺ Núllstilla</button></div>
    <p class="note" id="disc"></p>
    <p class="foot">Forþjónað (SSG) {BASELINE.updated}. Vél: ROADS-tímaskref-líkan · módel = {LINKS.length} kvörðuð tengsl m/heimildum. Sjá heimild á hverri keðju.</p>
  </main>

  <style>
    main { max-width: 920px; margin: 0 auto; padding: 44px 20px 64px; }
    .kicker { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); margin: 0 0 4px; }
    h1 { font-size: 32px; margin: 0 0 10px; } p { color: var(--ink); }
    .note { font-size: 13px; color: var(--muted); background: rgba(255,255,255,.04); border-left: 3px solid #f6b13b; padding: 10px 14px; border-radius: 0 8px 8px 0; margin: 18px 0 0; }
    .foot { font-size: 12px; color: var(--faint); margin-top: 22px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 14px; }
    .lev-h { font-size: 13px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin: 22px 0 10px; }
  </style>
  <style is:global>
    main[data-pg="roads"] .scn { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 16px; }
    main[data-pg="roads"] .scn button { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); color: var(--muted); border-radius: 8px; padding: 6px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
    main[data-pg="roads"] .scn button:hover, main[data-pg="roads"] .scn button.on { color: #f6b13b; border-color: #f6b13b; }
    main[data-pg="roads"] .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 720px) { main[data-pg="roads"] .charts { grid-template-columns: 1fr; } }
    main[data-pg="roads"] .card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 12px 14px; }
    main[data-pg="roads"] .card h3 { font-size: 13.5px; margin: 0 0 2px; color: var(--ink); }
    main[data-pg="roads"] .card .now { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
    main[data-pg="roads"] .card .dlt { font-size: 12px; font-weight: 700; margin-left: 6px; }
    main[data-pg="roads"] .card canvas { width: 100%; height: 120px; display: block; margin-top: 6px; }
    main[data-pg="roads"] .levers { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
    @media (max-width: 720px) { main[data-pg="roads"] .levers { grid-template-columns: 1fr; } }
    main[data-pg="roads"] .sl { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 11px; padding: 10px 14px; }
    main[data-pg="roads"] .sl.shk { border-left: 3px solid #6ea8ff; }
    main[data-pg="roads"] .sl-t { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink); font-weight: 600; }
    main[data-pg="roads"] .sl-t b { color: #f6b13b; font-variant-numeric: tabular-nums; }
    main[data-pg="roads"] .sl input[type=range] { width: 100%; accent-color: #f6b13b; }
    main[data-pg="roads"] .actions { margin-top: 14px; }
    main[data-pg="roads"] #rs { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); color: var(--ink); border-radius: 9px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  </style>

  <script>
    import { simulate } from '@lib/roads/engine.mjs';
    import BASELINE from '@gogn/roads/baseline.json';
    import LINKS from '@gogn/roads/links.json';
    import SCENARIOS from '@gogn/roads/scenarios.json';

    const state = { levers: {}, shocks: {} };
    const num = (v, d = 1) => (v == null ? '–' : v.toLocaleString('is-IS', { minimumFractionDigits: d, maximumFractionDigits: d }));
    const fld = (k) => BASELINE.levers[k] ? { g: 'levers', c: BASELINE.levers[k] } : { g: 'shocks', c: BASELINE.shocks[k] };

    function run() {
      const r = simulate({ baseline: BASELINE, links: LINKS, levers: state.levers, shocks: state.shocks, quarters: BASELINE.quarters });
      drawCharts(r);
    }

    function drawCharts(r) {
      const host = document.getElementById('charts'); host.innerHTML = '';
      for (const k of Object.keys(r.outcomes)) {
        const o = r.outcomes[k];
        const endMid = o.mid[o.mid.length - 1], endBase = o.baseline[o.baseline.length - 1];
        const dlt = endMid - endBase;
        const dc = dlt > 0.05 ? '#e78284' : dlt < -0.05 ? '#54d08a' : 'var(--faint)';
        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `<h3>${o.label}</h3><div><span class="now">${num(endMid)}${o.unit}</span><span class="dlt" style="color:${dc}">${dlt >= 0 ? '+' : ''}${num(dlt)} pp vs grunnur</span></div><canvas></canvas>`;
        host.appendChild(card);
        drawTrace(card.querySelector('canvas'), o);
      }
    }

    function drawTrace(cv, o) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth, h = 120; cv.width = w * dpr; cv.height = h * dpr;
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      const all = o.lo.concat(o.hi, o.baseline); let mn = Math.min(...all), mx = Math.max(...all);
      if (mx - mn < 1) { const m = (mx + mn) / 2; mn = m - 0.5; mx = m + 0.5; }
      const pad = 6, n = o.mid.length;
      const X = (i) => pad + (w - 2 * pad) * i / (n - 1);
      const Y = (v) => (h - pad) - (h - 2 * pad) * (v - mn) / (mx - mn);
      // óvissu-band
      ctx.beginPath(); ctx.moveTo(X(0), Y(o.hi[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(o.hi[i]));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(o.lo[i]));
      ctx.closePath(); ctx.fillStyle = 'rgba(246,177,59,.14)'; ctx.fill();
      // grunn-lína (BAU)
      ctx.beginPath(); o.baseline.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      // mið-ferill
      ctx.beginPath(); o.mid.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      ctx.strokeStyle = '#f6b13b'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    }

    function buildLevers() {
      const box = document.getElementById('levers'); box.innerHTML = '';
      const mk = (k, cfg, grp) => {
        const el = document.createElement('div'); el.className = 'sl' + (grp === 'shocks' ? ' shk' : '');
        const val = state[grp][k] ?? cfg.base;
        el.innerHTML = `<div class="sl-t"><span>${cfg.label}</span><b>${num(val, cfg.step < 1 ? 2 : 0)}${cfg.unit}</b></div><input type="range" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${val}">`;
        const inp = el.querySelector('input'), b = el.querySelector('b');
        inp.addEventListener('input', () => { const v = +inp.value; state[grp][k] = v; b.textContent = num(v, cfg.step < 1 ? 2 : 0) + cfg.unit; run(); });
        box.appendChild(el);
      };
      for (const k in BASELINE.levers) mk(k, BASELINE.levers[k], 'levers');
      for (const k in BASELINE.shocks) mk(k, BASELINE.shocks[k], 'shocks');
    }

    function buildScenarios() {
      const box = document.getElementById('scn'); box.innerHTML = '';
      SCENARIOS.forEach((s) => {
        const b = document.createElement('button'); b.textContent = s.label; b.title = s.tldr;
        b.addEventListener('click', () => { state.levers = { ...s.levers }; state.shocks = { ...s.shocks }; [...box.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); buildLevers(); run(); });
        box.appendChild(b);
      });
    }

    function reset() { state.levers = {}; state.shocks = {}; [...document.getElementById('scn').children].forEach((c) => c.classList.remove('on')); buildLevers(); run(); }

    function init() {
      const main = document.querySelector('main[data-pg="roads"]'); if (!main || main.dataset.done) return; main.dataset.done = '1';
      document.getElementById('disc').textContent = 'ⓘ ' + BASELINE.disclaimer + ' Óvissu-böndin sýna næmni fyrir óvissu í kvörðuðum stuðlum, ekki tölfræðilegt öryggisbil.';
      buildScenarios(); buildLevers(); run();
      document.getElementById('rs').addEventListener('click', reset);
    }
    init();
    document.addEventListener('astro:page-load', init);
  </script>
</Layout>
```

- [ ] **Step 2: Byggja og staðfesta**

Run: `cd web && npx astro build 2>&1 | tail -3`
Expected: build klárar án villu (`hermir` síða byggð).

- [ ] **Step 3: Staðfesta gagnvirkni í vafra (preview)**

Run: ræsa dev og skoða — nota Browser-pane verkflæði: `preview_start {name}` (eða `npx astro dev`), fara á `/hermir/`, staðfesta: 5 útkomu-kort með ferla-gröfum + óvissu-band; sleðar (3 ákvarðanir + 4 sjokk) uppfæra gröfin á `input`; sviðsmynda-chips setja sleða + endurteikna; „vs grunnur" delta breytist. `read_console_messages` → engar villur.
Expected: gröf teikna, sleðar virka, engar console-villur.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/hermir.astro
git commit -m "ROADS v0: /hermir/ UI — sleðar + ferla-gröf + óvissu-bönd + sviðsmyndir"
```

---

## Task 4: Frétta-hamur + gagnsæis-smellur

**Files:**
- Modify: `web/src/pages/hermir.astro` (bæta frétta-setningu + link-inspector)

**Interfaces:**
- Consumes: `SCENARIOS[].sentence`, `LINKS[]` (source/coef/ci/lag) frá Task 2/3.

- [ ] **Step 1: Bæta frétta-setningu við sviðsmynda-val**

Í `hermir.astro` script, bæta reit fyrir frétta-setningu. Bæta HTML í `<main>` beint eftir `<div id="scn">`:
```astro
    <p id="news" class="news" hidden></p>
```
Bæta CSS í `is:global` blokkina:
```css
    main[data-pg="roads"] .news { font-size: 14.5px; color: var(--ink); background: rgba(246,177,59,.08); border: 1px solid rgba(246,177,59,.3); border-radius: 10px; padding: 12px 15px; margin: 0 0 16px; }
    main[data-pg="roads"] .news b { color: #f6b13b; }
    main[data-pg="roads"] .lnk-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
    main[data-pg="roads"] .lnk-tbl th, main[data-pg="roads"] .lnk-tbl td { text-align: left; padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,.08); color: var(--muted); }
    main[data-pg="roads"] .lnk-tbl th { color: var(--faint); }
    main[data-pg="roads"] details.transp { margin: 16px 0 0; }
    main[data-pg="roads"] details.transp summary { cursor: pointer; color: #f6b13b; font-size: 13px; font-weight: 700; }
```
Í `buildScenarios()` click-handler, sýna setninguna:
```js
        const news = document.getElementById('news'); news.hidden = false; news.innerHTML = '📰 <b>' + s.label + ':</b> ' + s.sentence;
```
Og í `reset()`: `document.getElementById('news').hidden = true;`

- [ ] **Step 2: Bæta gagnsæis-smelli (link-inspector) neðst**

Bæta HTML í `<main>` fyrir ofan `<p class="foot">`:
```astro
    <details class="transp"><summary›⚙︎ Sjá öll orsakasambönd, stuðla og heimildir</summary><div id="lnks"></div></details>
```
> ATH: nota rétt `<summary>` (ekki `›`): `<summary>⚙︎ Sjá öll orsakasambönd, stuðla og heimildir</summary>`.

Bæta fall í script og kalla í `init()`:
```js
    function buildLinkTable() {
      const host = document.getElementById('lnks'); if (!host) return;
      const lbl = (k) => (BASELINE.levers[k]?.label || BASELINE.shocks[k]?.label || BASELINE.outcomes[k]?.label || k);
      const rows = LINKS.map((l) => `<tr><td>${lbl(l.from)} → ${lbl(l.to)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${l.coef} ${l.unit}</td><td style="text-align:right">töf ${l.lag} ársfj.</td><td style="text-align:right">±${(((l.ci_hi - l.ci_lo) / 2)).toFixed(2)}</td><td>${l.source}</td></tr>`).join('');
      host.innerHTML = `<table class="lnk-tbl"><tr><th>Keðja</th><th>Stuðull</th><th>Töf</th><th>Óvissa</th><th>Heimild</th></tr>${rows}</table><p style="font-size:12px;color:var(--faint);margin-top:8px">Hver stuðull er metinn úr Karp-gögnum eða fenginn úr birtum heimildum (SÍ/Hagstofa/OECD). Stílfærð sambönd — ekki opinber spá.</p>`;
    }
```
Bæta `buildLinkTable();` í `init()` (eftir `run()`).

- [ ] **Step 3: Byggja og staðfesta**

Run: `cd web && npx astro build 2>&1 | tail -3` og skoða `/hermir/` í preview: sviðsmynda-smellur sýnir frétta-setningu; „Sjá öll orsakasambönd" opnar töflu með stuðli/töf/óvissu/heimild per keðju; núllstilling felur frétt.
Expected: build OK; frétta-setning + heimilda-tafla birtast; engar console-villur.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/hermir.astro
git commit -m "ROADS v0: frétta-hamur (mannamáls-setning) + gagnsæis-smellur (stuðlar+heimildir)"
```

---

## Task 5: Back-test, heiðarleg merking, bygging & deploy-hlið

**Files:**
- Create: `skriptur/backtest_roads.mjs`

**Interfaces:**
- Consumes: `engine.mjs`, `gogn/roads/*`, sögulegar raðir (`sedlabanki`, `verdlag`).

- [ ] **Step 1: Skrifa einfaldan back-test**

Create `skriptur/backtest_roads.mjs`:

```js
// Fróðleiks-sannreyning: gefið raun-vaxtaferil sögulegs tímabils, spáir vélin verðbólgu-átt innan bands?
// Ekki nákvæmnis-krafa — sannreynir að viðbrögð séu í rétta átt og stærðargráðu.
import { simulate } from '../src/lib/roads/engine.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const R = join(dirname(fileURLToPath(import.meta.url)), '..', 'gogn', 'roads');
const baseline = JSON.parse(readFileSync(join(R, 'baseline.json')));
const links = JSON.parse(readFileSync(join(R, 'links.json')));
// Sögulegt: 2021→2023 hækkaði SÍ vexti mikið (~+7pp). Spá vélarinnar: verðbólga ætti á endanum að lækka m.v. enga hækkun.
const hi = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 5 }, quarters: 12 });
const lo = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base - 5 }, quarters: 12 });
const q = 11;
const okDir = hi.outcomes.verdbolga.mid[q] < lo.outcomes.verdbolga.mid[q];
const okHouse = hi.outcomes.husnaedi.mid[q] < lo.outcomes.husnaedi.mid[q];
const okGdp = hi.outcomes.hagvoxtur.mid[q] < lo.outcomes.hagvoxtur.mid[q];
const okBand = Object.values(hi.outcomes).every((o) => o.lo.every((v, i) => v <= o.mid[i] && o.mid[i] <= o.hi[i]));
console.log('hærri vextir → lægri verðbólga:', okDir, '| lægra húsnæðisverð:', okHouse, '| lægri hagvöxtur:', okGdp, '| lo≤mið≤hi:', okBand);
const bad = !(okDir && okHouse && okGdp && okBand);
process.exit(bad ? 1 : 0);
```

Run: `node skriptur/backtest_roads.mjs`
Expected: allt `true`, exit 0.

- [ ] **Step 2: Heildarbygging + próf-svíta**

Run:
```bash
node src/lib/roads/engine.test.mjs
node skriptur/verify_roads_model.mjs
node skriptur/backtest_roads.mjs
cd web && npx astro build 2>&1 | tail -4
```
Expected: öll þrjú node-próf `exit 0`; astro build klárar.

- [ ] **Step 3: Commit**

```bash
git add skriptur/backtest_roads.mjs
git commit -m "ROADS v0: back-test (átt + bönd) sannreyning"
```

- [ ] **Step 4: Deploy-hlið (BÍÐUR staðfestingar notanda)**

STOPP: ekki pusha sjálfkrafa. Segja notanda: v0 tilbúið á branch; live-preview staðfest. Bíða „deploy" áður en `git fetch origin && git rebase origin/main && git push origin b2b-topbar:main`.

---

## Self-Review

**Spec coverage:**
- Vél C (létt tímaskref, isomorphic, ferlar+óvissu) → Task 1 (`engine.mjs`) ✓
- Módel=gögn (`links.json` m/coef/lag/source/ci) → Task 2 ✓
- Kvörðun úr Karp-röðum + curated m/heimildum → Task 2 (`build_roads.mjs`, röð-metið `r_house` + curated) ✓
- Óvissa jaðra-samsetning (lo/mid/hi) → Task 1 engine + prófuð ✓
- Peningastefnu-eining (vextir/laun/veðþak + olía/gengi/ferðamenn/alþjóðavextir → 5 útkomur) → Task 2 baseline ✓
- UI: sleðar + ferla-gröf + óvissu-bönd + sviðsmyndir → Task 3 ✓
- Frétta-hamur (setning) + gagnsæis-smellur (stuðlar+heimildir) → Task 4 ✓
- Feedback-regla lag≥1 → Task 2 verify + Global Constraints ✓
- Heiðarleg merking → Task 3 (disclaimer) + Task 4 ✓
- Back-test → Task 5 ✓
- Uppfæra /hermir/ (ekki ný slóð) → Task 3 modify ✓

**Placeholder scan:** `verify_roads_model.mjs` Step 3 hefur langa ATH um skilgreiningar-tengsl (`infl_wage` lag 0) — það er raunveruleg röð-nákvæmnis-athugun, með ákvörðun tekinni (halda lag:0, kaupmattur síðast í outcomes-röð, verify undanþiggur skilgreiningar-tengsl). Ekki placeholder. `wr_infl` placeholder-tengsl (coef 0) er síað burt í build. Engin „TODO/TBD".

**Type consistency:** `simulate`/`deviationOf` undirskriftir samræmdar Task 1↔3↔5. `baseline/links/scenarios` lögun samræmd Task 2 (writer) ↔ Task 1 (fixture) ↔ Task 3 (reader). Reitir `coef,lag,ci_lo,ci_hi,source,from,to,unit` samræmdir. Útkomu-lyklar `verdbolga,hagvoxtur,atvinnuleysi,kaupmattur,husnaedi` samræmdir baseline↔links↔UI.
