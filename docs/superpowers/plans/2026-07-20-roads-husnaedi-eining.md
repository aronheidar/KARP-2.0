# ROADS Húsnæðis-eining (module 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dýpka húsnæðis-hlið ROADS-hermisins með vogarstöngum (framboð), sjokki (aðflutningur) og útkomum (leiga, greiðslubyrði) — allt sem gögn, engin vélar-/UI-breyting.

**Architecture:** *Módel = gögn.* Útvíkka aðeins `skriptur/build_roads.mjs` (nýir levers/shocks/outcomes/links/scenarios) → regen `gogn/roads/*.json`. `engine.mjs` og `hermir.astro` (gagna-drifið UI) eru ÓBREYTT — ný útkoma → nýtt kort sjálfkrafa, ný lever/shock → nýr sleði sjálfkrafa.

**Tech Stack:** Node ES-module (build_roads/verify/backtest), engin ný dependency.

## Global Constraints

- Vinna í worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`, branch `b2b-topbar`. ⚠ Deildur worktree — margar sessionir commit-a samtímis; `git add <nákvæmar skrár>` + commit-a promptly, ekki `git add -A`. Deploy = push b2b-topbar:main (bíður notanda).
- **Engin breyting á `src/lib/roads/engine.mjs` né `web/src/pages/hermir.astro`.**
- **Útkomu-röð:** `verdbolga, hagvoxtur, atvinnuleysi, kaupmattur, husnaedi, leiga, greidslubyrdi` — `leiga`/`greidslubyrdi` VERÐA á eftir `husnaedi`/`kaupmattur` (feedback-regla: uppspretta útkoma→útkoma-tengsla verður á undan neytanda; auk þess lag≥1).
- **Hvert nýtt tengsl** ber `{from,to,coef,lag,unit,source,ci_lo,ci_hi}` með `ci_lo ≤ coef ≤ ci_hi`.
- Greiðslubyrði = **vísitala base 100** (unit `''`), leiga = `%`. Framboð röð-ómetið (sviðsmynda-lever m/birtri teygni). Leigu-gögn til 2024F1 (fyrirvari).
- `verify_roads_model.mjs` og `engine.mjs` breytast EKKI — reglur þeirra alhæfa.

---

## File Structure

- **Modify** `skriptur/build_roads.mjs` — bæta `frambod` (levers), `adflutningur` (shocks), `leiga`+`greidslubyrdi` (outcomes+clamp), `rentNow`-útreikning, 9 tengsl, 3 sviðsmyndir.
- **Regen** `gogn/roads/{baseline,links,scenarios}.json` (afurð skriptsins).
- **Modify** `skriptur/backtest_roads.mjs` — húsnæðis-átta-próf.

---

## Task 1: Útvíkka `build_roads.mjs` (húsnæðis-módel) + regen + verify

**Files:**
- Modify: `skriptur/build_roads.mjs`
- Regen: `gogn/roads/{baseline,links,scenarios}.json`

**Interfaces:**
- Consumes: `gogn/leiga.json` (`.quarters[].medM2`). Engine data shapes óbreyttar.
- Produces: baseline með 7 outcomes + 4 levers + 4 shocks; links með 26 tengsl; scenarios með 9.

- [ ] **Step 1: Bæta `rentNow`-útreikningi (leigu-vöxtur núna)**

Í `skriptur/build_roads.mjs`, meðal hinna `const … = g('…')`-lína efst (t.d. eftir línu með `houseNow`), bæta:
```js
const lq = g('leiga').quarters;
const rentNow = lq.length >= 5 ? +(100 * (lq[lq.length - 1].medM2 / lq[lq.length - 5].medM2 - 1)).toFixed(1) : 5; // ~6.6% (2024F1, gögn stöðnuð)
```

- [ ] **Step 2: Bæta `frambod`-vogarstöng**

Finna:
```js
    vedhlutfall: { base: 80, min: 50, max: 90, step: 5, unit: '%', label: 'Hámarks veðsetningarhlutfall' },
  },
  shocks: {
```
Skipta út fyrir:
```js
    vedhlutfall: { base: 80, min: 50, max: 90, step: 5, unit: '%', label: 'Hámarks veðsetningarhlutfall' },
    frambod: { base: 0, min: -20, max: 40, step: 5, unit: '%', label: 'Nýbygginga-framboð (frávik)' },
  },
  shocks: {
```

- [ ] **Step 3: Bæta `adflutningur`-sjokki**

Finna:
```js
    ferdamenn: { base: 0, min: -40, max: 40, step: 5, unit: '%', label: 'Ferðamenn (frávik)' },
  },
  outcomes: {
```
Skipta út fyrir:
```js
    ferdamenn: { base: 0, min: -40, max: 40, step: 5, unit: '%', label: 'Ferðamenn (frávik)' },
    adflutningur: { base: 0, min: -60, max: 60, step: 10, unit: '%', label: 'Aðflutningur (frávik)' },
  },
  outcomes: {
```

- [ ] **Step 4: Bæta `leiga`+`greidslubyrdi`-útkomum (á EFTIR husnaedi) + clamp**

Finna:
```js
    husnaedi: { label: 'Húsnæðisverð (12-mán)', unit: '%', path: glide(houseNow, 3.0) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30] },
```
Skipta út fyrir:
```js
    husnaedi: { label: 'Húsnæðisverð (12-mán)', unit: '%', path: glide(houseNow, 3.0) },
    leiga: { label: 'Leiga (12-mán)', unit: '%', path: glide(rentNow, 4.0) },
    greidslubyrdi: { label: 'Greiðslubyrði (vísit.)', unit: '', path: glide(100, 100) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30], leiga: [-15, 25], greidslubyrdi: [50, 200] },
```

- [ ] **Step 5: Bæta 9 húsnæðis-tengslum (fyrir `];` sem lokar `links`-fylkinu)**

Finna síðasta tengslið:
```js
  { id: 'infl_wageloop', from: 'verdbolga', to: 'laun', coef: 0.35, lag: 4, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.55, source: 'Verðbólga → næstu kjarasamningar (vísitölu-tenging)' },
];
```
Skipta út fyrir (sama lína + 9 ný fyrir ofan `];`):
```js
  { id: 'infl_wageloop', from: 'verdbolga', to: 'laun', coef: 0.35, lag: 4, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.55, source: 'Verðbólga → næstu kjarasamningar (vísitölu-tenging)' },
  // ── Húsnæðis-eining (module 2) ──
  { id: 'fr_house', from: 'frambod', to: 'husnaedi', coef: -0.30, lag: 4, unit: '%/%', ci_lo: -0.50, ci_hi: -0.12, source: 'Framboðs-teygni húsnæðis (OECD/HMS)' },
  { id: 'mig_house', from: 'adflutningur', to: 'husnaedi', coef: 0.06, lag: 2, unit: '%/%', ci_lo: 0.02, ci_hi: 0.10, source: 'Aðflutningur → húsnæðiseftirspurn (HMS/SÍ)' },
  { id: 'mig_rent', from: 'adflutningur', to: 'leiga', coef: 0.08, lag: 1, unit: '%/%', ci_lo: 0.03, ci_hi: 0.14, source: 'Aðflutningur → leigueftirspurn' },
  { id: 'house_rent', from: 'husnaedi', to: 'leiga', coef: 0.35, lag: 2, unit: '%/%', ci_lo: 0.15, ci_hi: 0.55, source: 'Verð↔leiga samhreyfing (HMS)' },
  { id: 'fr_rent', from: 'frambod', to: 'leiga', coef: -0.15, lag: 4, unit: '%/%', ci_lo: -0.30, ci_hi: -0.03, source: 'Framboð → lægri leiga' },
  { id: 'r_burden', from: 'vextir', to: 'greidslubyrdi', coef: 2.5, lag: 1, unit: 'vísit/pp', ci_lo: 1.5, ci_hi: 3.5, source: 'Greiðslubyrði-næmni f. vöxtum' },
  { id: 'house_burden', from: 'husnaedi', to: 'greidslubyrdi', coef: 0.40, lag: 1, unit: 'vísit/%', ci_lo: 0.20, ci_hi: 0.60, source: 'Hærra verð → stærra lán' },
  { id: 'kaup_burden', from: 'kaupmattur', to: 'greidslubyrdi', coef: -0.60, lag: 1, unit: 'vísit/pp', ci_lo: -1.0, ci_hi: -0.30, source: 'Hærri ráðstöfunartekjur → lægri byrði' },
  { id: 'ltv_burden', from: 'vedhlutfall', to: 'greidslubyrdi', coef: 0.30, lag: 2, unit: 'vísit/pp', ci_lo: 0.10, ci_hi: 0.50, source: 'Hærra veðhlutfall → stærra lán' },
];
```

- [ ] **Step 6: Bæta 3 húsnæðis-sviðsmyndum (fyrir `];` sem lokar `scenarios`)**

Finna síðustu sviðsmyndina (`id: 'oliuskellur'`) og `];` sem fylgir, og bæta 3 fyrir ofan `];`:
```js
  { id: 'adflutningur_upp', label: 'Aðflutningur +50%', tldr: 'Mikil fólksfjölgun', levers: {}, shocks: { adflutningur: 50 }, sentence: 'Aukinn aðflutningur (+50% umfram forsendur) eykur eftirspurn eftir húsnæði og leigu — hækkar verð og leigu og þyngir greiðslubyrði nýrra kaupenda.' },
  { id: 'byggingarhrina', label: 'Byggingarhrina (+30% framboð)', tldr: 'Aukið nýbygginga-framboð', levers: { frambod: 30 }, shocks: {}, sentence: 'Aukið framboð nýbygginga (+30%) hægir á húsnæðisverði og leigu með nokkurra ára töf — helsta tækið gegn húsnæðisverðbólgu.' },
  { id: 'adflutningsstopp', label: 'Aðflutningsstopp (−40%)', tldr: 'Samdráttur í aðflutningi', levers: {}, shocks: { adflutningur: -40 }, sentence: 'Snörp fækkun aðflutnings (−40%) dregur úr húsnæðis- og leigueftirspurn — kælir verð og leigu.' },
```

- [ ] **Step 7: Regen + verify**

Run:
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt
node skriptur/build_roads.mjs
node skriptur/verify_roads_model.mjs; echo "verify exit=$?"
```
Expected: build prentar `7 útkomur, 26 tengsl, 9 sviðsmyndir. Vextir=7.75 …`; verify prentar `✓ módel heilbrigt…`, exit 0. (Ef verify fellur á lag-0 hringrás/röð → athuga að leiga/greidslubyrdi séu á eftir husnaedi/kaupmattur og ný útkoma→útkoma tengsl hafi lag≥1.)

- [ ] **Step 8: Staðfesta merki/röð með stakri keyrslu**

Run:
```bash
node -e "
const { simulate } = await import('./src/lib/roads/engine.mjs');
const fs=require('fs'); const R='./gogn/roads/';
const b=JSON.parse(fs.readFileSync(R+'baseline.json')), L=JSON.parse(fs.readFileSync(R+'links.json'));
const base=simulate({baseline:b,links:L,quarters:12});
const fr=simulate({baseline:b,links:L,levers:{frambod:20},quarters:12});
const mig=simulate({baseline:b,links:L,shocks:{adflutningur:40},quarters:12});
const q=11;
console.log('outcomes:', Object.keys(base.outcomes).join(','));
console.log('+framboð → húsnæði lægra:', fr.outcomes.husnaedi.mid[q] < base.outcomes.husnaedi.mid[q]);
console.log('+aðflutn. → húsnæði hærra:', mig.outcomes.husnaedi.mid[q] > base.outcomes.husnaedi.mid[q]);
console.log('+aðflutn. → leiga hærri:', mig.outcomes.leiga.mid[q] > base.outcomes.leiga.mid[q]);
" 2>&1 | tail -5
```
Expected: `outcomes: verdbolga,hagvoxtur,atvinnuleysi,kaupmattur,husnaedi,leiga,greidslubyrdi`; öll þrjú `true`.

- [ ] **Step 9: Commit**

```bash
git add skriptur/build_roads.mjs gogn/roads/baseline.json gogn/roads/links.json gogn/roads/scenarios.json
git commit -m "ROADS module 2: húsnæðis-eining (framboð/aðflutningur → leiga/greiðslubyrði, 9 tengsl m/heimild)"
```

---

## Task 2: Back-test húsnæðis-áttir + heildar-staðfesting + deploy-hlið

**Files:**
- Modify: `skriptur/backtest_roads.mjs`

**Interfaces:**
- Consumes: `engine.mjs`, `gogn/roads/*` (7 outcomes frá Task 1).

- [ ] **Step 1: Bæta húsnæðis-áttum í back-test**

Í `skriptur/backtest_roads.mjs`, fyrir `const bad = …`-línuna, bæta:
```js
// Húsnæðis-eining (module 2)
const frH = simulate({ baseline, links, levers: { frambod: 20 }, quarters: 12 });
const migH = simulate({ baseline, links, shocks: { adflutningur: 40 }, quarters: 12 });
const rtB = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 3 }, quarters: 12 });
const okFrHouse = frH.outcomes.husnaedi.mid[q] < baseline.outcomes.husnaedi.path[q];
const okMigHouse = migH.outcomes.husnaedi.mid[q] > baseline.outcomes.husnaedi.path[q];
const okMigRent = migH.outcomes.leiga.mid[q] > baseline.outcomes.leiga.path[q];
const okRateBurden = rtB.outcomes.greidslubyrdi.mid[q] > baseline.outcomes.greidslubyrdi.path[q];
const okHouseBand = [frH, migH, rtB].every((r) => ['leiga', 'greidslubyrdi'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i])));
console.log('+framboð→húsnæði↓:', okFrHouse, '| +aðflutn→húsnæði↑:', okMigHouse, '| +aðflutn→leiga↑:', okMigRent, '| +vextir→greiðslubyrði↑:', okRateBurden, '| húsnæðis-bönd gild:', okHouseBand);
```
Og uppfæra `bad`-línuna svo hún taki nýju prófin með:
```js
const bad = !(okDir && okHouse && okGdp && okBand && okFrHouse && okMigHouse && okMigRent && okRateBurden && okHouseBand);
```

- [ ] **Step 2: Heildar-svíta**

Run:
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt
node src/lib/roads/engine.test.mjs; echo "engine=$?"
node skriptur/verify_roads_model.mjs; echo "verify=$?"
node skriptur/backtest_roads.mjs; echo "backtest=$?"
```
Expected: engine `11 passed` exit 0; verify heilbrigt exit 0; backtest öll `true` exit 0.

- [ ] **Step 3: astro build + UI-staðfesting (7 kort, gagna-drifið)**

Run:
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt/web && npx astro build 2>&1 | tail -3
```
Expected: build klárar. Þar sem `hermir.astro` er ÓBREYTT og gagna-drifið teiknar UI nú 7 útkomu-kort + `frambod`/`adflutningur` sleða + 3 nýjar sviðsmyndir sjálfkrafa (`Object.keys(BASELINE.outcomes)` → 7 kort). Valfrjáls headless-staðfesting: preview + puppeteer telja `.card` == 7, `.sl input` == 8 (4 levers + 4 shocks), `.scn button` == 9.

- [ ] **Step 4: Commit**

```bash
git add skriptur/backtest_roads.mjs
git commit -m "ROADS module 2: back-test húsnæðis-áttir (framboð/aðflutningur/vextir → verð/leiga/greiðslubyrði)"
```

- [ ] **Step 5: Deploy-hlið (BÍÐUR staðfestingar notanda)**

STOPP: ekki pusha sjálfkrafa. Segja notanda: module 2 tilbúið á branch (7 kort, staðfest). Bíða „deploy" áður en `git fetch origin && git rebase origin/main (ef þarf) && git push origin b2b-topbar:main`.

---

## Self-Review

**Spec coverage:**
- frambod (lever) + adflutningur (shock) → Task 1 Step 2-3 ✓
- leiga + greidslubyrdi (outcomes, vísitala base 100, röð rétt) → Task 1 Step 4 ✓
- 9 ný tengsl m/heimild+ci → Task 1 Step 5 ✓
- 3 sviðsmyndir → Task 1 Step 6 ✓
- Leigu-BAU úr leiga.quarters (rentNow) → Task 1 Step 1 ✓
- Engin engine/UI-breyting; 7 kort sjálfkrafa → Task 2 Step 3 (staðfest) ✓
- verify óbreytt nær nýju tengslunum → Task 1 Step 7 ✓
- backtest húsnæðis-áttir → Task 2 Step 1 ✓

**Placeholder scan:** Engin TODO/TBD. Öll tengsl m/heilum coef/ci/source. rentNow fallback (5) ef gögn vantar.

**Type consistency:** Reitir `from,to,coef,lag,unit,source,ci_lo,ci_hi` samræmdir v0. Útkomu-lyklar `leiga,greidslubyrdi` samræmdir baseline↔links↔clamp↔backtest. Sviðsmynda-reitir `adflutningur`/`frambod` samræmdir levers/shocks-skilgreiningum. `verify`/`engine`/`hermir.astro` óbreytt (staðfest í constraints).
