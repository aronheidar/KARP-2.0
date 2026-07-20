# ROADS Ríkisfjármál (m4) + Stjórnborð Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bæta ríkisfjármála-módúli (skattar/útgjöld → afkoma/skuldir) við ROADS OG endurhanna /hermir/ í þétt stjórnborð (nav→Karp+, fela fréttir, stýringar-vinstra/net-hægra, rík kort+mælir+scorecard+tooltips).

**Architecture:** Módúlið = gögn í `build_roads.mjs` (0 vélar-breyting). Stjórnborðið = UI-breyting á `Layout.astro` (nav+wide) og heildar-endurskrif á `hermir.astro` (vélin `engine.mjs` ósnert). Gagna-drifið → 11 kort birtast sjálfkrafa.

**Tech Stack:** Node ES-module, Astro, Canvas 2D. Engin ný dependency.

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`, branch `b2b-topbar`. ⚠ Deildur — `git add <nákvæmar skrár>` + commit promptly. Deploy bíður notanda.
- **Engin breyting á `src/lib/roads/engine.mjs` né `skriptur/verify_roads_model.mjs`.**
- Útkomu-röð: `afkoma`, `skuldir` bætast AFTAST (→ 10., 11.). Öll ný útkoma→útkoma tengsl lag≥1 (þ.m.t. `skuldir→skuldir` sjálf-lykkja lag 1 = uppsöfnun; ekki lag-0 → verify óbreytt).
- Hvert nýtt tengsl: `{from,to,coef,lag,unit,source,ci_lo,ci_hi}`, `ci_lo ≤ coef ≤ ci_hi`.
- Núverandi tölur: afkoma −0,65% / skuldir 38,8% (2026, úr `langtima`).
- Dashboard: vélin ósnert; UI gagna-drifið; tooltips (`title`) á sleða/kort/scorecard.

---

## File Structure
- **Modify** `skriptur/build_roads.mjs` — `skattar`/`utgjold` levers, `afkoma`/`skuldir` outcomes, 8 tengsl, 3 sviðsmyndir, `langtima`-lestur.
- **Regen** `gogn/roads/{baseline,links,scenarios}.json`.
- **Modify** `skriptur/backtest_roads.mjs` — ríkisfjármál-áttir.
- **Modify** `web/src/layouts/Layout.astro` — nav-færsla + `wide`-prop + `.shell-wide` CSS.
- **Modify** `web/src/pages/hermir.astro` — heildar dashboard-endurskrif.

---

## Task 1: Ríkisfjármál-módúl (build_roads) + backtest + regen + verify

**Files:** Modify `skriptur/build_roads.mjs`, `skriptur/backtest_roads.mjs`; regen `gogn/roads/*.json`.

- [ ] **Step 1: langtima-lestur** — finna `const popNow = g('mannfjoldi').POP.yoy; // 1.3 (%/ári)` og skipta út fyrir:
```js
const popNow = g('mannfjoldi').POP.yoy; // 1.3 (%/ári)
const LT = g('langtima'); const ltI = LT.ar.indexOf(2026);
const balNow = LT.afkoma[ltI] ?? -0.65, debtNow = LT.skuldir[ltI] ?? 38.8;
```

- [ ] **Step 2: skattar+utgjold levers** — finna:
```js
    frambod: { base: 0, min: -20, max: 40, step: 5, unit: '%', label: 'Nýbygginga-framboð (frávik)' },
  },
```
skipta út fyrir:
```js
    frambod: { base: 0, min: -20, max: 40, step: 5, unit: '%', label: 'Nýbygginga-framboð (frávik)' },
    skattar: { base: 0, min: -15, max: 15, step: 1, unit: '%', label: 'Skattbreyting (frávik)' },
    utgjold: { base: 0, min: -15, max: 15, step: 1, unit: '%', label: 'Útgjöld ríkis (frávik)' },
  },
```

- [ ] **Step 3: afkoma+skuldir outcomes + clamp** — finna:
```js
    vinnuafl: { label: 'Vinnuaflsvöxtur', unit: '%', path: glide(1.5, 1.2) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30], leiga: [-15, 25], greidslubyrdi: [50, 200], mannfjoldi: [-1, 4], vinnuafl: [-2, 5] },
```
skipta út fyrir:
```js
    vinnuafl: { label: 'Vinnuaflsvöxtur', unit: '%', path: glide(1.5, 1.2) },
    afkoma: { label: 'Afkoma ríkissjóðs', unit: '% VLF', path: glide(balNow, -0.5) },
    skuldir: { label: 'Skuldir ríkis', unit: '% VLF', path: glide(debtNow, 37) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30], leiga: [-15, 25], greidslubyrdi: [50, 200], mannfjoldi: [-1, 4], vinnuafl: [-2, 5], afkoma: [-8, 6], skuldir: [10, 120] },
```

- [ ] **Step 4: 8 tengsl** — finna:
```js
  { id: 'labor_unem', from: 'vinnuafl', to: 'atvinnuleysi', coef: 0.10, lag: 2, unit: 'pp/pp', ci_lo: 0.02, ci_hi: 0.20, source: 'Aukið framboð vinnuafls (skammtíma frásog)' },
];
```
skipta út fyrir:
```js
  { id: 'labor_unem', from: 'vinnuafl', to: 'atvinnuleysi', coef: 0.10, lag: 2, unit: 'pp/pp', ci_lo: 0.02, ci_hi: 0.20, source: 'Aukið framboð vinnuafls (skammtíma frásog)' },
  // ── Ríkisfjármála-eining (module 4) ──
  { id: 'tax_bal', from: 'skattar', to: 'afkoma', coef: 0.08, lag: 1, unit: '%VLF/%', ci_lo: 0.04, ci_hi: 0.12, source: 'Skattbreyting → tekjur ríkissjóðs' },
  { id: 'exp_bal', from: 'utgjold', to: 'afkoma', coef: -0.08, lag: 1, unit: '%VLF/%', ci_lo: -0.12, ci_hi: -0.04, source: 'Útgjöld → gjöld ríkissjóðs' },
  { id: 'gdp_bal', from: 'hagvoxtur', to: 'afkoma', coef: 0.30, lag: 1, unit: '%VLF/pp', ci_lo: 0.15, ci_hi: 0.45, source: 'Sjálfvirkir jöfnarar (hærri VLF → meiri tekjur)' },
  { id: 'unem_bal', from: 'atvinnuleysi', to: 'afkoma', coef: -0.20, lag: 1, unit: '%VLF/pp', ci_lo: -0.35, ci_hi: -0.08, source: 'Atvinnuleysi → bætur + minni tekjur' },
  { id: 'debt_carry', from: 'skuldir', to: 'skuldir', coef: 1.0, lag: 1, unit: '', ci_lo: 1.0, ci_hi: 1.0, source: 'Skulda-uppsöfnun — fyrri staða flyst áfram (STOFN gegnum sjálf-lykkju)' },
  { id: 'bal_debt', from: 'afkoma', to: 'skuldir', coef: -0.25, lag: 1, unit: '%VLF/%VLF', ci_lo: -0.35, ci_hi: -0.15, source: 'Halli eykur skuldir (~afkoma/4 per ársfj.)' },
  { id: 'tax_gdp', from: 'skattar', to: 'hagvoxtur', coef: -0.05, lag: 2, unit: 'pp/%', ci_lo: -0.10, ci_hi: -0.01, source: 'Skatta-drag á eftirspurn' },
  { id: 'exp_gdp', from: 'utgjold', to: 'hagvoxtur', coef: 0.05, lag: 1, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.10, source: 'Fjármála-margfaldari' },
];
```

- [ ] **Step 5: 3 sviðsmyndir** — finna `oldrun`-línuna + `];` og bæta 3 fyrir ofan `];`:
```js
  { id: 'oldrun', label: 'Öldrun (frjósemi −30%)', tldr: 'Lækkandi frjósemi', levers: {}, shocks: { frjosemi: -30 }, sentence: 'Lækkandi frjósemi (−30%) hefur hverfandi áhrif á 3 árum — raunveruleg áhrif á vinnuafl og framfærslubyrði koma áratugum síðar. Sjá mannfjöldaspá til 2074 á /mannfjoldi/.' },
  { id: 'skattalaekkun', label: 'Skattalækkun (−10%)', tldr: 'Lægri skattar', levers: { skattar: -10 }, shocks: {}, sentence: 'Skattalækkun (−10%) örvar hagvöxt lítillega en versnar afkomu ríkissjóðs og eykur skuldir smám saman.' },
  { id: 'adhald', label: 'Aðhald (útgjöld −10%)', tldr: 'Ríkisaðhald', levers: { utgjold: -10 }, shocks: {}, sentence: 'Aðhald í útgjöldum (−10%) bætir afkomu ríkissjóðs og lækkar skuldir, en dregur lítillega úr hagvexti til skamms tíma.' },
  { id: 'innspyting', label: 'Innspýting (útgjöld +10%)', tldr: 'Aukin ríkisútgjöld', levers: { utgjold: 10 }, shocks: {}, sentence: 'Aukin ríkisútgjöld (+10%) örva hagvöxt en versna afkomu og auka skuldir ríkissjóðs.' },
];
```

- [ ] **Step 6: backtest ríkisfjármál** — í `skriptur/backtest_roads.mjs`, finna línuna sem byrjar `const bad = !(` og setja fyrir framan hana:
```js
// Ríkisfjármála-eining (module 4)
const taxC = simulate({ baseline, links, levers: { skattar: -10 }, quarters: 12 });
const expC = simulate({ baseline, links, levers: { utgjold: -10 }, quarters: 12 });
const okTaxBal = taxC.outcomes.afkoma.mid[q] < baseline.outcomes.afkoma.path[q];   // skattalækkun → verri afkoma
const okAdhBal = expC.outcomes.afkoma.mid[q] > baseline.outcomes.afkoma.path[q];   // aðhald → betri afkoma
const okDebtAccum = taxC.outcomes.skuldir.mid[11] > taxC.outcomes.skuldir.mid[3];  // sjálfbær halli → vaxandi skuldir
const okFiscBand = [taxC, expC].every((r) => ['afkoma', 'skuldir'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i])));
console.log('skattalækkun→afkoma↓:', okTaxBal, '| aðhald→afkoma↑:', okAdhBal, '| halli→skuldir vaxandi:', okDebtAccum, '| ríkis-bönd:', okFiscBand);
```
Og bæta `&& okTaxBal && okAdhBal && okDebtAccum && okFiscBand` inn í `bad`-tjáninguna (á undan `);`).

- [ ] **Step 7: regen + verify + heildar-svíta**
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt
node skriptur/build_roads.mjs   # 11 útkomur, 39 tengsl, 14 sviðsmyndir
node skriptur/verify_roads_model.mjs; echo "verify=$?"
node src/lib/roads/engine.test.mjs 2>&1 | tail -1
node skriptur/backtest_roads.mjs; echo "backtest=$?"
```
Expected: build 11/39/14; verify heilbrigt exit 0; engine 11 passed; backtest allar áttir (öll 4 módúl) `true` exit 0.

- [ ] **Step 8: Commit** — `git add skriptur/build_roads.mjs skriptur/backtest_roads.mjs gogn/roads/baseline.json gogn/roads/links.json gogn/roads/scenarios.json && git commit -m "ROADS module 4: ríkisfjármál (skattar/útgjöld → afkoma/skuldir, skuldir-stofn v/sjálf-lykkju)"`

---

## Task 2: Layout.astro — nav→Karp+, wide-prop, hide news

**Files:** Modify `web/src/layouts/Layout.astro`.

- [ ] **Step 1: Færa hermir í Karp+ nav** — finna:
```js
    { href: '/mitt-svaedi/', label: 'Mitt svæði' },
```
skipta út fyrir:
```js
    { href: '/mitt-svaedi/', label: 'Mitt svæði' },
    { href: '/hermir/', label: 'ROADS hermir' },
```

- [ ] **Step 2: Fjarlægja hermir úr Efnahagur** — finna:
```js
    { href: '/hagspar/', label: 'Hagspár' },
    { href: '/hermir/', label: 'Hagkerfis-hermir' },
    { href: '/furduhagfraedi/', label: 'Furðuhagfræði' },
```
skipta út fyrir:
```js
    { href: '/hagspar/', label: 'Hagspár' },
    { href: '/furduhagfraedi/', label: 'Furðuhagfræði' },
```

- [ ] **Step 3: Bæta `wide`-prop** — finna:
```js
const { title, description = '', canonical = '', jsonLd = null, noindex = false, ogTitle = '', ogType = 'website', ogImage = '' } = Astro.props;
```
skipta út fyrir:
```js
const { title, description = '', canonical = '', jsonLd = null, noindex = false, ogTitle = '', ogType = 'website', ogImage = '', wide = false } = Astro.props;
```

- [ ] **Step 4: shell-wide klasi** — finna `    <div class="shell">` og skipta út fyrir:
```astro
    <div class={`shell${wide ? ' shell-wide' : ''}`}>
```

- [ ] **Step 5: `.shell-wide` CSS** — finna:
```css
      .shell { display:grid; grid-template-columns:212px minmax(0,1fr) 300px; min-height:100vh; }
```
skipta út fyrir:
```css
      .shell { display:grid; grid-template-columns:212px minmax(0,1fr) 300px; min-height:100vh; }
      .shell-wide { grid-template-columns:212px minmax(0,1fr); }
      .shell-wide .news { display:none; }
```

- [ ] **Step 6: Byggja + commit**
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt/web && npx astro build 2>&1 | tail -2
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt && git add web/src/layouts/Layout.astro && git commit -m "ROADS dashboard: hermir í Karp+ nav + wide-flag felur fréttir hægra megin"
```
Expected: build klárar.

---

## Task 3: hermir.astro — dashboard-endurskrif (rík kort + mælir + scorecard + tooltips)

**Files:** Modify `web/src/pages/hermir.astro` (heildar-endurskrif).

**Interfaces:** Consumes `@lib/roads/engine.mjs` (`simulate`), `@gogn/roads/*.json`, Layout `wide`-prop (Task 2).

- [ ] **Step 1: Skrifa nýja hermir.astro (heildar-útskipti)**

Replace `web/src/pages/hermir.astro` að fullu:

```astro
---
// ROADS Íslands — hagkerfis-STJÓRNBORÐ. Vél: @lib/roads/engine.mjs (client-hlið, ósnert).
// Módel: @gogn/roads/*.json. Gagna-drifið → öll kort/sleðar/sviðsmyndir sjálfkrafa. Ekki spá.
import Layout from '../layouts/Layout.astro';
import BASELINE from '@gogn/roads/baseline.json';
import LINKS from '@gogn/roads/links.json';
import SCENARIOS from '@gogn/roads/scenarios.json';
const desc = 'ROADS Íslands — gagnsætt stjórnborð fyrir íslenskt hagkerfi: stilltu vexti, laun, skatta, framboð og aðflutning og sjáðu stílfærð áhrif á hagvísa næstu 3 árin, með óvissu og heimildum.';
---
<Layout title="ROADS Íslands — hagkerfis-stjórnborð | Karp" description={desc} canonical="https://karp.is/hermir/" ogTitle="ROADS Íslands — stjórnborð" wide={true}>
  <main data-pg="roads" class="dash">
    <div class="dash-top">
      <div class="dash-head"><h1>ROADS Íslands 🎛️</h1><span class="disc" id="disc"></span></div>
      <div id="score" class="score"></div>
      <div id="scn" class="scn"></div>
      <p id="news" class="news" hidden></p>
    </div>
    <div class="dash-body">
      <div class="controls">
        <div class="ctl-h">🎚️ Ákvarðanir</div><div id="levers"></div>
        <div class="ctl-h">⚡ Ytri sjokk</div><div id="shocks"></div>
        <button id="rs" type="button">↺ Núllstilla</button>
      </div>
      <div id="charts" class="charts"></div>
    </div>
    <details class="transp"><summary>⚙︎ Sjá öll orsakasambönd, stuðla og heimildir</summary><div id="lnks"></div></details>
    <p class="foot">Forþjónað (SSG) {BASELINE.updated}. ROADS-tímaskref-líkan · {LINKS.length} kvörðuð tengsl m/heimildum · {Object.keys(BASELINE.outcomes).length} hagvísar. Stílfærð sambönd — ekki opinber spá.</p>
  </main>

  <style is:global>
    main[data-pg="roads"].dash { max-width: none; margin: 0; padding: 22px 24px 60px; }
    main[data-pg="roads"] .dash-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
    main[data-pg="roads"] .dash-head h1 { font-size: 26px; margin: 0; }
    main[data-pg="roads"] .disc { font-size: 12px; color: var(--faint); }
    main[data-pg="roads"] .score { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 10px; }
    main[data-pg="roads"] .sc { flex: 1 1 130px; min-width: 130px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; display: flex; flex-direction: column; }
    main[data-pg="roads"] .sc-l { font-size: 11px; color: var(--faint); text-transform: uppercase; letter-spacing: .03em; }
    main[data-pg="roads"] .sc-v { font-size: 21px; font-weight: 800; font-variant-numeric: tabular-nums; }
    main[data-pg="roads"] .sc-d { font-size: 11.5px; font-weight: 700; }
    main[data-pg="roads"] .scn { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
    main[data-pg="roads"] .scn button { background: rgba(255,255,255,.05); border: 1px solid var(--line); color: var(--muted); border-radius: 8px; padding: 5px 11px; font-size: 12px; font-weight: 600; cursor: pointer; }
    main[data-pg="roads"] .scn button:hover, main[data-pg="roads"] .scn button.on { color: #f6b13b; border-color: #f6b13b; }
    main[data-pg="roads"] .news { font-size: 14px; color: var(--ink); background: rgba(246,177,59,.08); border: 1px solid rgba(246,177,59,.3); border-radius: 10px; padding: 10px 14px; margin: 0 0 12px; }
    main[data-pg="roads"] .news b { color: #f6b13b; }
    main[data-pg="roads"] .dash-body { display: grid; grid-template-columns: 250px minmax(0,1fr); gap: 16px; align-items: start; }
    @media (max-width: 760px) { main[data-pg="roads"] .dash-body { grid-template-columns: 1fr; } }
    main[data-pg="roads"] .controls { position: sticky; top: 60px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
    main[data-pg="roads"] .ctl-h { font-size: 12px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin: 4px 0 8px; }
    main[data-pg="roads"] .ctl-h:not(:first-child) { margin-top: 14px; }
    main[data-pg="roads"] .sl { margin-bottom: 8px; }
    main[data-pg="roads"] .sl-t { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--ink); }
    main[data-pg="roads"] .sl-t b { color: #f6b13b; font-variant-numeric: tabular-nums; }
    main[data-pg="roads"] .sl input[type=range] { width: 100%; accent-color: #f6b13b; margin: 2px 0 0; }
    main[data-pg="roads"] #rs { margin-top: 12px; width: 100%; background: rgba(255,255,255,.05); border: 1px solid var(--line); color: var(--ink); border-radius: 9px; padding: 7px; font-size: 12.5px; cursor: pointer; }
    main[data-pg="roads"] .charts { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px,1fr)); gap: 12px; }
    main[data-pg="roads"] .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
    main[data-pg="roads"] .c-h { display: flex; justify-content: space-between; align-items: baseline; }
    main[data-pg="roads"] .c-t { font-size: 12.5px; color: var(--muted); font-weight: 600; }
    main[data-pg="roads"] .c-d { font-size: 12px; font-weight: 700; }
    main[data-pg="roads"] .c-v { font-size: 23px; font-weight: 800; font-variant-numeric: tabular-nums; margin: 1px 0 2px; }
    main[data-pg="roads"] .c-cv { width: 100%; height: 96px; display: block; }
    main[data-pg="roads"] .c-g { position: relative; height: 6px; background: rgba(255,255,255,.06); border-radius: 3px; margin-top: 8px; }
    main[data-pg="roads"] .c-gm { position: absolute; top: -2px; width: 3px; height: 10px; border-radius: 2px; transform: translateX(-50%); }
    main[data-pg="roads"] .c-gb { position: absolute; top: -1px; width: 2px; height: 8px; background: rgba(255,255,255,.4); transform: translateX(-50%); }
    main[data-pg="roads"] .lnk-tbl { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    main[data-pg="roads"] .lnk-tbl th, main[data-pg="roads"] .lnk-tbl td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); color: var(--muted); }
    main[data-pg="roads"] details.transp { margin: 18px 0 0; }
    main[data-pg="roads"] details.transp summary { cursor: pointer; color: #f6b13b; font-size: 13px; font-weight: 700; }
    main[data-pg="roads"] .foot { font-size: 12px; color: var(--faint); margin-top: 18px; border-top: 1px solid var(--line); padding-top: 12px; }
  </style>

  <script>
    import { simulate } from '@lib/roads/engine.mjs';
    import BASELINE from '@gogn/roads/baseline.json';
    import LINKS from '@gogn/roads/links.json';
    import SCENARIOS from '@gogn/roads/scenarios.json';

    const state = { levers: {}, shocks: {} };
    const num = (v, d = 1) => (v == null ? '–' : v.toLocaleString('is-IS', { minimumFractionDigits: d, maximumFractionDigits: d }));
    const lbl = (k) => BASELINE.levers[k]?.label || BASELINE.shocks[k]?.label || BASELINE.outcomes[k]?.label || k;
    const driversOf = (k) => [...new Set(LINKS.filter((l) => l.to === k && l.from !== k).map((l) => lbl(l.from)))];

    const OUT_TIP = {
      verdbolga: 'Verðbólga — árshækkun neysluverðs.', hagvoxtur: 'Hagvöxtur — árs-breyting raun-VLF.',
      atvinnuleysi: 'Skráð atvinnuleysi (% af vinnuafli).', kaupmattur: 'Kaupmáttur launa — nafnlaun umfram verðbólgu.',
      husnaedi: 'Húsnæðisverð — 12-mán breyting.', leiga: 'Leiga — 12-mán breyting.',
      greidslubyrdi: 'Greiðslubyrði húsnæðislána — vísitala (100 = núverandi).', mannfjoldi: 'Fólksfjölgun — árs-breyting.',
      vinnuafl: 'Vinnuaflsvöxtur — árs-breyting vinnuafls.', afkoma: 'Afkoma ríkissjóðs (% VLF; mínus = halli).',
      skuldir: 'Skuldir ríkissjóðs (% VLF).',
    };
    const LEV_TIP = {
      vextir: 'Stýrivextir Seðlabankans. Hærri → hægir á verðbólgu/húsnæði (töf), dregur úr hagvexti.',
      laun: 'Launahækkun kjarasamninga. Eykur kaupmátt en ýtir undir verðbólgu/húsnæði.',
      vedhlutfall: 'Hámarks veðsetningarhlutfall (þjóðhagsvarúð). Hærra þak → hærra húsnæðisverð.',
      frambod: 'Framboð nýrra íbúða. Meira → lægra verð/leiga (töf).',
      skattar: 'Skattbreyting ríkisins. Meiri skattar bæta afkomu, draga lítillega úr hagvexti.',
      utgjold: 'Útgjöld ríkisins. Meiri útgjöld örva hagvöxt en versna afkomu.',
      olia: 'Olíuverð. Hærra → meiri verðbólga.', gengi: 'Gengi krónu (+ = styrking). Sterk króna → lægri innflutt verðbólga.',
      ferdamenn: 'Ferðamannafjöldi. Fleiri → meiri hagvöxtur, minna atvinnuleysi.',
      adflutningur: 'Aðflutningur (nettó). Meiri → fjölgun, meira vinnuafl, húsnæðis-þrýstingur.',
      frjosemi: 'Frjósemi. Langtíma — hverfandi á 3 árum (sjá /mannfjoldi/).',
    };
    const SCORE_KEYS = ['verdbolga', 'hagvoxtur', 'atvinnuleysi', 'husnaedi', 'afkoma'];

    function dInfo(o) { const dlt = o.mid[o.mid.length - 1] - o.baseline[o.baseline.length - 1]; return { dlt, c: dlt > 0.05 ? '#e78284' : dlt < -0.05 ? '#54d08a' : 'var(--faint)' }; }

    function run() { const r = simulate({ baseline: BASELINE, links: LINKS, levers: state.levers, shocks: state.shocks, quarters: BASELINE.quarters }); drawScore(r); drawCharts(r); }

    function drawScore(r) {
      const h = document.getElementById('score'); h.innerHTML = '';
      for (const k of SCORE_KEYS) { const o = r.outcomes[k]; if (!o) continue; const { dlt, c } = dInfo(o); const end = o.mid[o.mid.length - 1];
        const t = document.createElement('div'); t.className = 'sc'; t.title = OUT_TIP[k] || o.label;
        t.innerHTML = `<span class="sc-l">${o.label}</span><span class="sc-v">${num(end)}${o.unit === '% VLF' ? '' : o.unit}</span><span class="sc-d" style="color:${c}">${dlt >= 0 ? '▲' : '▼'} ${num(Math.abs(dlt))} vs grunnur</span>`;
        h.appendChild(t);
      }
    }

    function drawCharts(r) {
      const host = document.getElementById('charts'); host.innerHTML = '';
      for (const k of Object.keys(r.outcomes)) { const o = r.outcomes[k]; const { dlt, c } = dInfo(o); const end = o.mid[o.mid.length - 1];
        const card = document.createElement('div'); card.className = 'card';
        card.title = (OUT_TIP[k] || o.label) + (driversOf(k).length ? ' Drifið af: ' + driversOf(k).join(', ') + '.' : '');
        card.innerHTML = `<div class="c-h"><span class="c-t">${o.label}</span><span class="c-d" style="color:${c}">${dlt >= 0 ? '+' : ''}${num(dlt)}</span></div><div class="c-v">${num(end)}${o.unit === '% VLF' ? '%' : o.unit}</div><canvas class="c-cv"></canvas><div class="c-g" title="Staða lokagildis innan mögulegs bils; hvíta strikið = grunnferill"><span class="c-gb"></span><span class="c-gm"></span></div>`;
        host.appendChild(card);
        drawTrace(card.querySelector('canvas'), o);
        const cl = (BASELINE.clamp || {})[k] || [Math.min(...o.lo), Math.max(...o.hi)];
        const pos = (v) => Math.max(0, Math.min(1, (v - cl[0]) / (cl[1] - cl[0] || 1)));
        const gm = card.querySelector('.c-gm'), gb = card.querySelector('.c-gb');
        gm.style.left = (pos(end) * 100) + '%'; gm.style.background = c === 'var(--faint)' ? '#f6b13b' : c;
        gb.style.left = (pos(o.baseline[o.baseline.length - 1]) * 100) + '%';
      }
    }

    function drawTrace(cv, o) {
      const dpr = Math.min(2, window.devicePixelRatio || 1); const w = cv.clientWidth, h = 96; cv.width = w * dpr; cv.height = h * dpr;
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      const all = o.lo.concat(o.hi, o.baseline); let mn = Math.min(...all), mx = Math.max(...all);
      if (mx - mn < 1) { const m = (mx + mn) / 2; mn = m - 0.6; mx = m + 0.6; }
      const pad = 6, n = o.mid.length, X = (i) => pad + (w - 2 * pad) * i / (n - 1), Y = (v) => (h - pad) - (h - 2 * pad) * (v - mn) / (mx - mn);
      ctx.beginPath(); ctx.moveTo(X(0), Y(o.hi[0])); for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(o.hi[i])); for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(o.lo[i])); ctx.closePath(); ctx.fillStyle = 'rgba(246,177,59,.13)'; ctx.fill();
      ctx.beginPath(); o.baseline.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); o.mid.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.strokeStyle = '#f6b13b'; ctx.lineWidth = 2.3; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = 'rgba(159,176,200,.85)'; ctx.font = '10px system-ui'; ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left'; ctx.fillText(num(o.mid[0]), X(0) + 1, Y(o.mid[0]) - 4);
      ctx.textAlign = 'right'; ctx.fillStyle = '#f6b13b'; ctx.fillText(num(o.mid[n - 1]), X(n - 1) - 1, Y(o.mid[n - 1]) - 4);
    }

    function buildControls() {
      const mk = (host, k, cfg, grp) => {
        const el = document.createElement('div'); el.className = 'sl'; el.title = LEV_TIP[k] || cfg.label;
        const val = state[grp][k] ?? cfg.base;
        el.innerHTML = `<div class="sl-t"><span>${cfg.label}</span><b>${num(val, cfg.step < 1 ? 2 : 0)}${cfg.unit}</b></div><input type="range" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${val}">`;
        const inp = el.querySelector('input'), b = el.querySelector('b');
        inp.addEventListener('input', () => { const v = +inp.value; state[grp][k] = v; b.textContent = num(v, cfg.step < 1 ? 2 : 0) + cfg.unit; run(); });
        host.appendChild(el);
      };
      const lh = document.getElementById('levers'), sh = document.getElementById('shocks'); lh.innerHTML = ''; sh.innerHTML = '';
      for (const k in BASELINE.levers) mk(lh, k, BASELINE.levers[k], 'levers');
      for (const k in BASELINE.shocks) mk(sh, k, BASELINE.shocks[k], 'shocks');
    }

    function buildScenarios() {
      const box = document.getElementById('scn'); box.innerHTML = '';
      SCENARIOS.forEach((s) => { const b = document.createElement('button'); b.textContent = s.label; b.title = s.tldr;
        b.addEventListener('click', () => { state.levers = { ...s.levers }; state.shocks = { ...s.shocks }; [...box.children].forEach((c) => c.classList.remove('on')); b.classList.add('on');
          const news = document.getElementById('news'); news.hidden = false; news.innerHTML = '📰 <b>' + s.label + ':</b> ' + s.sentence; buildControls(); run(); });
        box.appendChild(b);
      });
    }

    function buildLinkTable() {
      const host = document.getElementById('lnks'); if (!host) return;
      const rows = LINKS.map((l) => `<tr><td>${lbl(l.from)} → ${lbl(l.to)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${l.coef} ${l.unit}</td><td style="text-align:right">töf ${l.lag}</td><td style="text-align:right">±${(((l.ci_hi - l.ci_lo) / 2)).toFixed(2)}</td><td>${l.source}</td></tr>`).join('');
      host.innerHTML = `<table class="lnk-tbl"><tr><th>Keðja</th><th>Stuðull</th><th>Töf</th><th>Óvissa</th><th>Heimild</th></tr>${rows}</table><p style="font-size:11.5px;color:var(--faint);margin-top:8px">Hver stuðull er metinn úr Karp-gögnum eða úr birtum heimildum (SÍ/Hagstofa/OECD). Stílfærð sambönd — ekki opinber spá.</p>`;
    }

    function reset() { state.levers = {}; state.shocks = {}; [...document.getElementById('scn').children].forEach((c) => c.classList.remove('on')); document.getElementById('news').hidden = true; buildControls(); run(); }

    function init() {
      const main = document.querySelector('main[data-pg="roads"]'); if (!main || main.dataset.done) return; main.dataset.done = '1';
      document.getElementById('disc').textContent = BASELINE.disclaimer + ' Óvissu-bönd = næmni fyrir stuðla-óvissu.';
      buildScenarios(); buildControls(); run(); buildLinkTable();
      document.getElementById('rs').addEventListener('click', reset);
    }
    init();
    document.addEventListener('astro:page-load', init);
  </script>
</Layout>
```

- [ ] **Step 2: Byggja** — `cd web && npx astro build 2>&1 | tail -3`. Expected: klárar.

- [ ] **Step 3: Commit** — `git add web/src/pages/hermir.astro && git commit -m "ROADS dashboard: hermir.astro endurhannað — scorecard + stýringar-vinstra/net-hægra + rík kort m/mæli + tooltips"`

---

## Task 4: Heildar-staðfesting (headless) + deploy-hlið

- [ ] **Step 1: Preview + headless** — ræsa `astro preview` og keyra headless-athugun á `/hermir/`: `.card`==11, `.sl input`==11 (6 levers + 5 shocks), `.scn button`==14, `.score .sc`==5 (scorecard), engar ROADS-console-villur; smella á „Skattalækkun" → afkoma-kort delta neikvætt; staðfesta að `.dash-body` sé 2-dálka (breidd) og `.news` (fréttir) EKKI sýnilegt á /hermir/. Taka skjámynd.

- [ ] **Step 2: Nav + news-endurkoma** — headless: á `/hermir/` er hermir-hlekkur undir Karp+ hóp; fara á `/kort/` (önnur síða) → `.news` (fréttir) birtist aftur (wide-flag víxlast rétt).

- [ ] **Step 3: Deploy-hlið (BÍÐUR notanda)** — STOPP. Segja notanda: m4+dashboard tilbúið (11 kort, stjórnborð, fréttir faldar, nav undir Karp+), skjámynd sýnd. Bíða „deploy".

---

## Self-Review

**Spec coverage:** m4 levers/outcomes/8 tengsl/3 sviðsmyndir → Task 1 ✓ · skuldir-sjálflykkja → Task 1 Step 4 ✓ · backtest ríkis-áttir → Task 1 Step 6 ✓ · nav→Karp+ → Task 2 Step 1-2 ✓ · wide+hide-news → Task 2 Step 3-5 ✓ · dashboard (scorecard/2-dálka/rík kort/mælir/tooltips) → Task 3 ✓ · staðfesting 11 kort+nav+news → Task 4 ✓.

**Placeholder scan:** Engin TODO/TBD. Full kóði í hverju skrefi.

**Type consistency:** Útkomu-lyklar `afkoma,skuldir` samræmdir baseline↔links↔clamp↔backtest. Lever-lyklar `skattar,utgjold` samræmdir levers↔tengslum↔sviðsmyndum↔LEV_TIP. `wide`-prop samræmt Layout(Task2)↔hermir(Task3). Tooltip-maps `OUT_TIP`/`LEV_TIP` þekja allar 11 útkomur / 11 sleða. `driversOf` útilokar sjálf-lykkju (`l.from!==k`) svo skuldir birtist ekki sem eigin drifkraftur.
