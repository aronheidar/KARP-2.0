# ROADS Auðlinda-eining (module 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bæta auðlinda-módúli (kvóti/orka/kolefnisgjald → útflutningur/losun) við ROADS — hrein gögn, 0 vélar-/UI-breyting.

**Architecture:** *Módel = gögn.* Útvíkka aðeins `skriptur/build_roads.mjs` → regen `gogn/roads/*.json`. `engine.mjs` + `hermir.astro` (stjórnborð) ÓBREYTT → 13 kort/14 sleðar birtast sjálfkrafa.

**Tech Stack:** Node ES-module. Engin ný dependency.

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`, branch `b2b-topbar`. ⚠ Deildur — `git add <nákvæmar skrár>` + commit promptly. Deploy bíður notanda.
- **Engin breyting á `engine.mjs`, `hermir.astro`, `Layout.astro`, `verify_roads_model.mjs`.**
- Útkomu-röð: `utflutningur`, `losun` AFTAST (→ 12., 13.). Nýtt útkoma→útkoma tengsl `exp_gdp2` (utflutningur→hagvoxtur) lag 1 → verify óbreytt.
- Hvert nýtt tengsl: `{from,to,coef,lag,unit,source,ci_lo,ci_hi}`, `ci_lo ≤ coef ≤ ci_hi`.
- **Engin tvítalning:** útflutningur drifinn AÐEINS af kvóta/orku; EKKI bæta `gengi→utflutningur` (gengi/ferðamenn haldast bein á hagvöxt).

---

## File Structure
- **Modify** `skriptur/build_roads.mjs` — 3 levers, 2 outcomes, 6 tengsl, 3 sviðsmyndir.
- **Regen** `gogn/roads/{baseline,links,scenarios}.json`.
- **Modify** `skriptur/backtest_roads.mjs` — auðlinda-áttir.

---

## Task 1: Auðlinda-módúl (build_roads) + backtest + regen + verify

**Files:** Modify `skriptur/build_roads.mjs`, `skriptur/backtest_roads.mjs`; regen `gogn/roads/*.json`.

- [ ] **Step 1: 3 levers (á eftir utgjold)** — finna:
```js
    utgjold: { base: 0, min: -15, max: 15, step: 1, unit: '%', label: 'Útgjöld ríkis (frávik)' },
  },
```
skipta út fyrir:
```js
    utgjold: { base: 0, min: -15, max: 15, step: 1, unit: '%', label: 'Útgjöld ríkis (frávik)' },
    kvoti: { base: 0, min: -30, max: 20, step: 5, unit: '%', label: 'Aflamark (frávik)' },
    orka: { base: 0, min: -15, max: 30, step: 5, unit: '%', label: 'Orka til stóriðju (frávik)' },
    kolefnisgjald: { base: 0, min: -50, max: 100, step: 10, unit: '%', label: 'Kolefnisgjald (frávik)' },
  },
```

- [ ] **Step 2: 2 outcomes (á eftir skuldir) + clamp** — finna:
```js
    skuldir: { label: 'Skuldir ríkis', unit: '% VLF', path: glide(debtNow, 37) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30], leiga: [-15, 25], greidslubyrdi: [50, 200], mannfjoldi: [-1, 4], vinnuafl: [-2, 5], afkoma: [-8, 6], skuldir: [10, 120] },
```
skipta út fyrir:
```js
    skuldir: { label: 'Skuldir ríkis', unit: '% VLF', path: glide(debtNow, 37) },
    utflutningur: { label: 'Útflutningsvöxtur', unit: '%', path: glide(2, 2.5) },
    losun: { label: 'CO₂-losun (vísit.)', unit: '', path: glide(100, 100) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30], leiga: [-15, 25], greidslubyrdi: [50, 200], mannfjoldi: [-1, 4], vinnuafl: [-2, 5], afkoma: [-8, 6], skuldir: [10, 120], utflutningur: [-15, 20], losun: [40, 200] },
```

- [ ] **Step 3: 6 tengsl (á eftir exp_gdp, fyrir `];`)** — finna:
```js
  { id: 'exp_gdp', from: 'utgjold', to: 'hagvoxtur', coef: 0.05, lag: 1, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.10, source: 'Fjármála-margfaldari' },
];
```
skipta út fyrir:
```js
  { id: 'exp_gdp', from: 'utgjold', to: 'hagvoxtur', coef: 0.05, lag: 1, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.10, source: 'Fjármála-margfaldari' },
  // ── Auðlinda-eining (module 5) ──
  { id: 'kvoti_exp', from: 'kvoti', to: 'utflutningur', coef: 0.20, lag: 2, unit: '%/%', ci_lo: 0.10, ci_hi: 0.32, source: 'Sjávarafurðir ~stór hluti útflutnings (Hagstofa)' },
  { id: 'orka_exp', from: 'orka', to: 'utflutningur', coef: 0.25, lag: 2, unit: '%/%', ci_lo: 0.12, ci_hi: 0.40, source: 'Ál/stóriðja útflutningur (79,9% orku)' },
  { id: 'exp_gdp2', from: 'utflutningur', to: 'hagvoxtur', coef: 0.10, lag: 1, unit: 'pp/%', ci_lo: 0.04, ci_hi: 0.18, source: 'Útflutningur drífur VLF' },
  { id: 'orka_emis', from: 'orka', to: 'losun', coef: 0.30, lag: 1, unit: 'vísit/%', ci_lo: 0.15, ci_hi: 0.50, source: 'Stóriðju-orkunotkun → losun' },
  { id: 'carb_emis', from: 'kolefnisgjald', to: 'losun', coef: -0.15, lag: 2, unit: 'vísit/%', ci_lo: -0.30, ci_hi: -0.05, source: 'Kolefnisgjald → minni losun' },
  { id: 'carb_gdp', from: 'kolefnisgjald', to: 'hagvoxtur', coef: -0.02, lag: 1, unit: 'pp/%', ci_lo: -0.05, ci_hi: -0.005, source: 'Kostnaðar-drag grænna skatta' },
];
```

- [ ] **Step 4: 3 sviðsmyndir (á eftir innspyting)** — finna:
```js
  { id: 'innspyting', label: 'Innspýting (útgjöld +10%)', tldr: 'Aukin ríkisútgjöld', levers: { utgjold: 10 }, shocks: {}, sentence: 'Aukin ríkisútgjöld (+10%) örva hagvöxt en versna afkomu og auka skuldir ríkissjóðs.' },
];
```
skipta út fyrir:
```js
  { id: 'innspyting', label: 'Innspýting (útgjöld +10%)', tldr: 'Aukin ríkisútgjöld', levers: { utgjold: 10 }, shocks: {}, sentence: 'Aukin ríkisútgjöld (+10%) örva hagvöxt en versna afkomu og auka skuldir ríkissjóðs.' },
  { id: 'kvotaskerding', label: 'Kvótaskerðing (−20%)', tldr: 'Minna aflamark', levers: { kvoti: -20 }, shocks: {}, sentence: 'Skerðing aflamarks (−20%) dregur úr sjávarafurða-útflutningi og þar með lítillega úr hagvexti.' },
  { id: 'ny_storidja', label: 'Ný stóriðja (orka +15%)', tldr: 'Aukin stóriðja', levers: { orka: 15 }, shocks: {}, sentence: 'Aukin orka til stóriðju (+15%) eykur útflutning og hagvöxt en hækkar CO₂-losun.' },
  { id: 'graenir_skattar', label: 'Grænir skattar (kolefnisgjald +50%)', tldr: 'Hærra kolefnisgjald', levers: { kolefnisgjald: 50 }, shocks: {}, sentence: 'Hærra kolefnisgjald (+50%) lækkar CO₂-losun með nokkurri töf, með litlu hagvaxtar-dragi.' },
];
```

- [ ] **Step 5: backtest auðlinda-áttir** — í `skriptur/backtest_roads.mjs`, finna `const bad = !(`-línuna og setja fyrir framan hana:
```js
// Auðlinda-eining (module 5)
const kvC = simulate({ baseline, links, levers: { kvoti: 10 }, quarters: 12 });
const orC = simulate({ baseline, links, levers: { orka: 20 }, quarters: 12 });
const caC = simulate({ baseline, links, levers: { kolefnisgjald: 50 }, quarters: 12 });
const okKvExp = kvC.outcomes.utflutningur.mid[q] > baseline.outcomes.utflutningur.path[q];
const okOrExp = orC.outcomes.utflutningur.mid[q] > baseline.outcomes.utflutningur.path[q];
const okOrEmis = orC.outcomes.losun.mid[q] > baseline.outcomes.losun.path[q];
const okCarbEmis = caC.outcomes.losun.mid[q] < baseline.outcomes.losun.path[q];
const okResBand = [kvC, orC, caC].every((r) => ['utflutningur', 'losun'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i])));
console.log('+kvóti→útflutn↑:', okKvExp, '| +orka→útflutn↑:', okOrExp, '| +orka→losun↑:', okOrEmis, '| +kolefnisgj→losun↓:', okCarbEmis, '| auðlinda-bönd:', okResBand);
```
Og bæta `&& okKvExp && okOrExp && okOrEmis && okCarbEmis && okResBand` inn í `bad`-tjáninguna (á undan `);`).

- [ ] **Step 6: regen + verify + heildar-svíta**
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt
node skriptur/build_roads.mjs   # 13 útkomur, 45 tengsl, 17 sviðsmyndir
node skriptur/verify_roads_model.mjs; echo "verify=$?"
node src/lib/roads/engine.test.mjs 2>&1 | tail -1
node skriptur/backtest_roads.mjs; echo "backtest=$?"
```
Expected: build 13/45/17; verify heilbrigt exit 0; engine 11 passed; backtest allar áttir (öll 5 módúl) `true` exit 0.

- [ ] **Step 7: Commit** — `git add skriptur/build_roads.mjs skriptur/backtest_roads.mjs gogn/roads/baseline.json gogn/roads/links.json gogn/roads/scenarios.json && git commit -m "ROADS module 5: auðlindir (kvóti/orka/kolefnisgjald → útflutningur/losun)"`

---

## Task 2: astro build + UI-staðfesting (13 kort) + deploy-hlið

- [ ] **Step 1: astro build** — `cd web && npx astro build 2>&1 | tail -3`. Expected: klárar. `hermir.astro` óbreytt → 13 kort + `kvoti`/`orka`/`kolefnisgjald` sleðar + 3 nýjar sviðsmyndir sjálfkrafa.

- [ ] **Step 2: Headless-staðfesting** — preview + puppeteer: `.card`==13, `.sl input`==14 (9 levers + 5 shocks), `.scn button`==17; smella á „Ný stóriðja" → útflutningur-kort delta jákvætt + losun-kort delta jákvætt; engar ROADS-console-villur. Skjámynd.

- [ ] **Step 3: Deploy-hlið (BÍÐUR notanda)** — STOPP. Segja notanda: m5 tilbúið (13 kort, öll 5 grunn-módúl), skjámynd sýnd. Bíða „deploy".

---

## Self-Review

**Spec coverage:** 3 levers → Task 1 Step 1 ✓ · 2 outcomes (aftast, BAU/clamp) → Step 2 ✓ · 6 tengsl (öll lag≥1, m/source+ci) → Step 3 ✓ · engin tvítalning (ekkert gengi→utflutningur) → Step 3 + Global Constraints ✓ · 3 sviðsmyndir → Step 4 ✓ · backtest auðlinda-áttir → Step 5 ✓ · 0 engine/UI-breyting; 13 kort sjálfkrafa → Task 2 ✓.

**Placeholder scan:** Engin TODO/TBD. Full kóði í hverju skrefi.

**Type consistency:** Útkomu-lyklar `utflutningur,losun` samræmdir baseline↔links↔clamp↔backtest. Lever-lyklar `kvoti,orka,kolefnisgjald` samræmdir levers↔tengslum↔sviðsmyndum. `okKvExp`/`okOrExp`/`okOrEmis`/`okCarbEmis`/`okResBand` skilgreind áður en notuð í `bad`. `exp_gdp2` (nýtt) ≠ `exp_gdp` (til) — engin id-árekstur.
