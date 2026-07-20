# ROADS Lýðfræði-eining (module 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bæta lýðfræði-/vinnumarkaðs-vídd við ROADS (aðflutningur/frjósemi → mannfjöldi → vinnuafl → atvinnuleysi/hagvöxtur) — allt sem gögn, engin vélar-/UI-breyting.

**Architecture:** *Módel = gögn.* Útvíkka aðeins `skriptur/build_roads.mjs` (nýtt sjokk, 2 útkomur, 5 tengsl, 2 sviðsmyndir) → regen `gogn/roads/*.json`. `engine.mjs` + `hermir.astro` (gagna-drifið UI) ÓBREYTT → 9 kort/9 sleðar sjálfkrafa.

**Tech Stack:** Node ES-module. Engin ný dependency.

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`, branch `b2b-topbar`. ⚠ Deildur worktree — `git add <nákvæmar skrár>` + commit promptly, ekki `git add -A`. Deploy bíður notanda.
- **Engin breyting á `src/lib/roads/engine.mjs`, `web/src/pages/hermir.astro`, `skriptur/verify_roads_model.mjs`.**
- **Útkomu-röð:** nýju útkomurnar `mannfjoldi`, `vinnuafl` bætast AFTAST (verða 8., 9.). Öll ný útkoma→útkoma tengsl (`labor_gdp`, `labor_unem`) hafa **lag≥1** → röð óháð, verify stenst óbreytt.
- **Hvert nýtt tengsl** ber `{from,to,coef,lag,unit,source,ci_lo,ci_hi}` með `ci_lo ≤ coef ≤ ci_hi`.
- **Engin tvítalning:** EKKI bæta `mannfjoldi→husnaedi` (aðflutningur→húsnæði er þegar í module 2).
- Frjósemi = langtíma → lítið nærtíma-tengsl `fer_pop` + fyrirvari í `source`/sviðsmynd. Vinnuafl-BAU curated.

---

## File Structure

- **Modify** `skriptur/build_roads.mjs` — `frjosemi` (shocks), `mannfjoldi`+`vinnuafl` (outcomes+clamp), `popNow`-lestur, 5 tengsl, 2 sviðsmyndir.
- **Regen** `gogn/roads/{baseline,links,scenarios}.json`.
- **Modify** `skriptur/backtest_roads.mjs` — lýðfræði-átta-próf.

---

## Task 1: Útvíkka `build_roads.mjs` (lýðfræði-módel) + regen + verify

**Files:**
- Modify: `skriptur/build_roads.mjs`
- Regen: `gogn/roads/{baseline,links,scenarios}.json`

**Interfaces:**
- Consumes: `gogn/mannfjoldi.json` (`.POP.yoy`). Engine data shapes óbreyttar.
- Produces: baseline 9 outcomes / 4 levers / 5 shocks; links 31; scenarios 11.

- [ ] **Step 1: Bæta `popNow`-lestri**

Finna (línu með rentNow):
```js
const rentNow = lq.length >= 5 ? +(100 * (lq[lq.length - 1].medM2 / lq[lq.length - 5].medM2 - 1)).toFixed(1) : 5; // ~6.6% (2024F1, gögn stöðnuð)
```
Skipta út fyrir (sama lína + popNow):
```js
const rentNow = lq.length >= 5 ? +(100 * (lq[lq.length - 1].medM2 / lq[lq.length - 5].medM2 - 1)).toFixed(1) : 5; // ~6.6% (2024F1, gögn stöðnuð)
const popNow = g('mannfjoldi').POP.yoy; // 1.3 (%/ári)
```

- [ ] **Step 2: Bæta `frjosemi`-sjokki (á eftir adflutningur)**

Finna:
```js
    adflutningur: { base: 0, min: -60, max: 60, step: 10, unit: '%', label: 'Aðflutningur (frávik)' },
  },
```
Skipta út fyrir:
```js
    adflutningur: { base: 0, min: -60, max: 60, step: 10, unit: '%', label: 'Aðflutningur (frávik)' },
    frjosemi: { base: 0, min: -40, max: 40, step: 5, unit: '%', label: 'Frjósemi (frávik)' },
  },
```

- [ ] **Step 3: Bæta `mannfjoldi`+`vinnuafl`-útkomum (aftast) + clamp**

Finna:
```js
    greidslubyrdi: { label: 'Greiðslubyrði (vísit.)', unit: '', path: glide(100, 100) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30], leiga: [-15, 25], greidslubyrdi: [50, 200] },
```
Skipta út fyrir:
```js
    greidslubyrdi: { label: 'Greiðslubyrði (vísit.)', unit: '', path: glide(100, 100) },
    mannfjoldi: { label: 'Fólksfjölgun', unit: '%', path: glide(popNow, 1.0) },
    vinnuafl: { label: 'Vinnuaflsvöxtur', unit: '%', path: glide(1.5, 1.2) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30], leiga: [-15, 25], greidslubyrdi: [50, 200], mannfjoldi: [-1, 4], vinnuafl: [-2, 5] },
```

- [ ] **Step 4: Bæta 5 lýðfræði-tengslum (fyrir `];` sem lokar `links`)**

Finna (síðasta tengsl, ltv_burden):
```js
  { id: 'ltv_burden', from: 'vedhlutfall', to: 'greidslubyrdi', coef: 0.30, lag: 2, unit: 'vísit/pp', ci_lo: 0.10, ci_hi: 0.50, source: 'Hærra veðhlutfall → stærra lán' },
];
```
Skipta út fyrir:
```js
  { id: 'ltv_burden', from: 'vedhlutfall', to: 'greidslubyrdi', coef: 0.30, lag: 2, unit: 'vísit/pp', ci_lo: 0.10, ci_hi: 0.50, source: 'Hærra veðhlutfall → stærra lán' },
  // ── Lýðfræði-eining (module 3) ──
  { id: 'adf_pop', from: 'adflutningur', to: 'mannfjoldi', coef: 0.010, lag: 1, unit: '%/%', ci_lo: 0.006, ci_hi: 0.016, source: 'Aðflutningur = meginþáttur mannfjölgunar (Hagstofa)' },
  { id: 'fer_pop', from: 'frjosemi', to: 'mannfjoldi', coef: 0.004, lag: 1, unit: '%/%', ci_lo: 0.001, ci_hi: 0.008, source: 'Fæðingar → höfðatala; ⚠langtíma-áhrif, 3-ára hverfandi — sjá /mannfjoldi/ (spá til 2074)' },
  { id: 'adf_labor', from: 'adflutningur', to: 'vinnuafl', coef: 0.015, lag: 1, unit: '%/%', ci_lo: 0.008, ci_hi: 0.024, source: 'Vinnualdurs-innflytjendur → vinnuafl (Hagstofa/VMST)' },
  { id: 'labor_gdp', from: 'vinnuafl', to: 'hagvoxtur', coef: 0.30, lag: 1, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.50, source: 'Vinnuafl sem framleiðsluþáttur' },
  { id: 'labor_unem', from: 'vinnuafl', to: 'atvinnuleysi', coef: 0.10, lag: 2, unit: 'pp/pp', ci_lo: 0.02, ci_hi: 0.20, source: 'Aukið framboð vinnuafls (skammtíma frásog)' },
];
```

- [ ] **Step 5: Bæta 2 sviðsmyndum (fyrir `];` sem lokar `scenarios`)**

Finna (síðasta sviðsmynd, adflutningsstopp):
```js
  { id: 'adflutningsstopp', label: 'Aðflutningsstopp (−40%)', tldr: 'Samdráttur í aðflutningi', levers: {}, shocks: { adflutningur: -40 }, sentence: 'Snörp fækkun aðflutnings (−40%) dregur úr húsnæðis- og leigueftirspurn — kælir verð og leigu.' },
];
```
Skipta út fyrir:
```js
  { id: 'adflutningsstopp', label: 'Aðflutningsstopp (−40%)', tldr: 'Samdráttur í aðflutningi', levers: {}, shocks: { adflutningur: -40 }, sentence: 'Snörp fækkun aðflutnings (−40%) dregur úr húsnæðis- og leigueftirspurn — kælir verð og leigu.' },
  { id: 'folksfjolgun', label: 'Fólksfjölgun (+aðflutn. +frjós.)', tldr: 'Ör fólksfjölgun', levers: {}, shocks: { adflutningur: 40, frjosemi: 20 }, sentence: 'Ör fólksfjölgun (aðflutningur +40%, frjósemi +20%) eykur mannfjölda og vinnuafl — ýtir undir hagvöxt en einnig húsnæðis- og leigueftirspurn.' },
  { id: 'oldrun', label: 'Öldrun (frjósemi −30%)', tldr: 'Lækkandi frjósemi', levers: {}, shocks: { frjosemi: -30 }, sentence: 'Lækkandi frjósemi (−30%) hefur hverfandi áhrif á 3 árum — raunveruleg áhrif á vinnuafl og framfærslubyrði koma áratugum síðar. Sjá mannfjöldaspá til 2074 á /mannfjoldi/.' },
];
```

- [ ] **Step 6: Regen + verify + merki/röð-athugun**

Run:
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt
node skriptur/build_roads.mjs
node skriptur/verify_roads_model.mjs; echo "verify=$?"
node --input-type=module -e "
import { simulate } from './src/lib/roads/engine.mjs';
import { readFileSync } from 'node:fs';
const R='./gogn/roads/'; const b=JSON.parse(readFileSync(R+'baseline.json')), L=JSON.parse(readFileSync(R+'links.json'));
const base=simulate({baseline:b,links:L,quarters:12}), mig=simulate({baseline:b,links:L,shocks:{adflutningur:40},quarters:12}), fer=simulate({baseline:b,links:L,shocks:{frjosemi:30},quarters:12});
const q=11;
console.log('outcomes('+Object.keys(base.outcomes).length+'):', Object.keys(base.outcomes).join(','));
console.log('+aðflutn→mannfj↑:', mig.outcomes.mannfjoldi.mid[q]>base.outcomes.mannfjoldi.mid[q]);
console.log('+aðflutn→vinnuafl↑:', mig.outcomes.vinnuafl.mid[q]>base.outcomes.vinnuafl.mid[q]);
console.log('+aðflutn→hagvöxtur↑ (v/vinnuafl):', mig.outcomes.hagvoxtur.mid[q]>base.outcomes.hagvoxtur.mid[q]);
console.log('+frjós→mannfj↑ (lítið):', fer.outcomes.mannfjoldi.mid[q]>base.outcomes.mannfjoldi.mid[q]);
"
```
Expected: build `9 útkomur, 31 tengsl, 11 sviðsmyndir`; verify heilbrigt exit 0; `outcomes(9): verdbolga,hagvoxtur,atvinnuleysi,kaupmattur,husnaedi,leiga,greidslubyrdi,mannfjoldi,vinnuafl`; öll fjögur `true`.

- [ ] **Step 7: Commit**

```bash
git add skriptur/build_roads.mjs gogn/roads/baseline.json gogn/roads/links.json gogn/roads/scenarios.json
git commit -m "ROADS module 3: lýðfræði-eining (aðflutningur/frjósemi → mannfjöldi/vinnuafl, 5 tengsl m/heimild)"
```

---

## Task 2: Back-test lýðfræði-áttir + heildar-staðfesting + deploy-hlið

**Files:**
- Modify: `skriptur/backtest_roads.mjs`

**Interfaces:**
- Consumes: `engine.mjs`, `gogn/roads/*` (9 outcomes frá Task 1).

- [ ] **Step 1: Bæta lýðfræði-áttum í back-test**

Í `skriptur/backtest_roads.mjs`, finna línuna sem byrjar `const bad = !(` og setja lýðfræði-blokkina beint FYRIR hana, svo uppfæra `bad`-línuna. Finna:
```js
const bad = !(okDir && okHouse && okGdp && okBand && okFrHouse && okMigHouse && okMigRent && okRateBurden && okHouseBand);
```
Skipta út fyrir:
```js
// Lýðfræði-eining (module 3)
const migD = simulate({ baseline, links, shocks: { adflutningur: 40 }, quarters: 12 });
const ferD = simulate({ baseline, links, shocks: { frjosemi: 30 }, quarters: 12 });
const okMigPop = migD.outcomes.mannfjoldi.mid[q] > baseline.outcomes.mannfjoldi.path[q];
const okMigLabor = migD.outcomes.vinnuafl.mid[q] > baseline.outcomes.vinnuafl.path[q];
const okMigGdp = migD.outcomes.hagvoxtur.mid[q] > baseline.outcomes.hagvoxtur.path[q];
const okFerPop = ferD.outcomes.mannfjoldi.mid[q] > baseline.outcomes.mannfjoldi.path[q];
const okDemoBand = [migD, ferD].every((r) => ['mannfjoldi', 'vinnuafl'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i])));
console.log('+aðflutn→mannfj↑:', okMigPop, '| →vinnuafl↑:', okMigLabor, '| →hagvöxtur↑:', okMigGdp, '| +frjós→mannfj↑:', okFerPop, '| lýðfr-bönd gild:', okDemoBand);
const bad = !(okDir && okHouse && okGdp && okBand && okFrHouse && okMigHouse && okMigRent && okRateBurden && okHouseBand && okMigPop && okMigLabor && okMigGdp && okFerPop && okDemoBand);
```

- [ ] **Step 2: Heildar-svíta**

Run:
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt
node src/lib/roads/engine.test.mjs; echo "engine=$?"
node skriptur/verify_roads_model.mjs; echo "verify=$?"
node skriptur/backtest_roads.mjs; echo "backtest=$?"
```
Expected: engine `11 passed` exit 0; verify heilbrigt exit 0; backtest öll `true` (upprunaleg + húsnæði + lýðfræði) exit 0.

- [ ] **Step 3: astro build + UI-staðfesting (9 kort)**

Run:
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt/web && npx astro build 2>&1 | tail -3
```
Expected: build klárar. `hermir.astro` óbreytt + gagna-drifið → UI teiknar nú **9 kort** (…+mannfjöldi+vinnuafl) + `frjosemi`-sleða (9 sleðar alls) + 2 nýjar sviðsmyndir sjálfkrafa. Valfrjáls headless: `.card`==9, `.sl input`==9, `.scn button`==11.

- [ ] **Step 4: Commit**

```bash
git add skriptur/backtest_roads.mjs
git commit -m "ROADS module 3: back-test lýðfræði-áttir (aðflutningur/frjósemi → mannfjöldi/vinnuafl/hagvöxtur)"
```

- [ ] **Step 5: Deploy-hlið (BÍÐUR staðfestingar notanda)**

STOPP: ekki pusha sjálfkrafa. Segja notanda: module 3 tilbúið á branch (9 kort, staðfest). Bíða „deploy" áður en `git fetch origin && git rebase origin/main && git push origin b2b-topbar:main`.

---

## Self-Review

**Spec coverage:**
- frjosemi (shock) → Task 1 Step 2 ✓
- mannfjoldi + vinnuafl (outcomes, aftast, BAU/clamp) → Task 1 Step 3 ✓
- 5 tengsl (adf_pop/fer_pop/adf_labor/labor_gdp/labor_unem, öll lag≥1, m/source+ci) → Task 1 Step 4 ✓
- Engin tvítalning (ekkert mannfjoldi→husnaedi) → Task 1 Step 4 (ekki bætt) + Global Constraints ✓
- 2 sviðsmyndir (folksfjolgun, oldrun m/langtíma-fyrirvara) → Task 1 Step 5 ✓
- popNow úr mannfjoldi.POP.yoy → Task 1 Step 1 ✓
- Engin engine/UI/verify-breyting; 9 kort sjálfkrafa → Task 2 Step 3 ✓
- backtest lýðfræði-áttir → Task 2 Step 1 ✓

**Placeholder scan:** Engin TODO/TBD. Öll tengsl m/heilum coef/ci/source.

**Type consistency:** Reitir samræmdir v0/module2. Útkomu-lyklar `mannfjoldi,vinnuafl` samræmdir baseline↔links↔clamp↔backtest. Sjokk-reitur `frjosemi` samræmdur shocks-skilgreiningu↔tengslum↔sviðsmyndum. `okMigPop`/`okMigLabor`/`okMigGdp`/`okFerPop`/`okDemoBand` skilgreind áður en notuð í `bad`.
