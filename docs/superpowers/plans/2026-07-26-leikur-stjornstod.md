# RÁS-Leikurinn „Stjórnstöð" — Útfærsluáætlun

> **For agentic workers:** Inline-keyrsla. Checkbox-skref. Stór lota (5 verk).

**Goal:** Studio-hamur (fullur hermir sem þátttakenda-ákvörðunar-yfirborð: sleðar+gröf+flipar+lifandi áhrif) + læsa-sýnileiki + leikstjóri stöðva/nýr leikur. S1–S5 varðveitt (classic).

**Architecture:** Ný `studio.mjs` (katalógur/hjálp úr baseline). `resolve.mjs` studio-grein (sleða-stilling per umferð). `server.mjs`: mode, stop, /state (you.locked/lockRoster/you.history/scenarioSoFar), studio resolve. `client.mjs`: stjórnstöð (import BASELINE+LINKS+engine, sleðar+flipar+lifandi sim-gröf), læsa-UI, fac stop/roster. Debrief (S2/S3/S5) lifir af.

## Global Constraints
- Þjóns-sjálfgefið `mode='classic'` (S1–S5 próf STANDA). UI-sjálfgefið studio.
- Blind commit: client-forskoðun aðeins eigin gögn; þjónn ófölsuð stig.
- ÓSNERT: `engine.mjs`, `scoring.mjs`, `chain.mjs`, `game-config.mjs`, `roles.mjs`, `game-validate.mjs`.
- Studio decision = `{levers:{k:v}}`; classic = 5 kubba-lyklar. resolve/analytics greina á `mode`.

---

### Task 1: `studio.mjs` + `resolve.mjs` studio-grein + próf

**Files:** Create `src/lib/leikur/studio.mjs`, `src/lib/leikur/studio.test.mjs`; Modify `src/lib/leikur/resolve.mjs`, `src/lib/leikur/resolve.test.mjs`

**Produces:** `studioCatalog(baseline)`, `defaultDials(baseline)`, `changedLevers(dials,baseline)`; `buildInputs(history,{baseline,scenario,mode})`, `resolveTeam({...,mode})`.

`studio.mjs`:
```js
// Studio-hamur RÁS-Leiksins: lever-katalógur + hjálp úr baseline. HREINT (baseline-viðfang).
export function studioCatalog(baseline) {
  const byGroup = new Map();
  for (const [key, v] of Object.entries(baseline.levers)) {
    const g = v.group || 'Annað';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push({ key, label: v.label, min: v.min, max: v.max, base: v.base, step: v.step || 0.1, unit: v.unit || '' });
  }
  const tabs = [...byGroup.entries()].map(([group, levers]) => ({ group, levers }));
  const outcomes = Object.entries(baseline.outcomes).map(([key, v]) => ({ key, label: v.label, unit: v.unit || '', polarity: v.polarity || 0 }));
  return { tabs, outcomes };
}
export function defaultDials(baseline) { const d = {}; for (const [k, v] of Object.entries(baseline.levers)) d[k] = v.base; return d; }
export function changedLevers(dials, baseline) {
  const out = [];
  for (const [k, v] of Object.entries(dials || {})) { const cfg = baseline.levers[k]; if (cfg && +v !== cfg.base) out.push({ key: k, label: cfg.label, from: cfg.base, to: +v, unit: cfg.unit || '' }); }
  return out.sort((a, b) => Math.abs((b.to - b.from) / ((baseline.levers[b.key].max - baseline.levers[b.key].min) || 1)) - Math.abs((a.to - a.from) / ((baseline.levers[a.key].max - baseline.levers[a.key].min) || 1)));
}
```

`resolve.mjs` — bæta `mode` + studio buildInputs (klassík óbreytt):
```js
export function buildInputs(history, { baseline, scenario = DEFAULT_SCENARIO, mode = 'classic' }) {
  if (mode === 'studio') return buildInputsStudio(history, { baseline, scenario });
  /* ...núverandi classic-líkami óbreyttur... */
}
function buildInputsStudio(history, { baseline, scenario = DEFAULT_SCENARIO }) {
  const Q = history.length * QUARTERS_PER_ROUND, levers = {}, shocks = {}, running = {};
  const clampL = (k, v) => { const c = baseline.levers[k]; return Math.max(c.min, Math.min(c.max, +v)); };
  history.forEach((set, r) => {
    const q0 = r * QUARTERS_PER_ROUND, q1 = q0 + QUARTERS_PER_ROUND;
    if (set && set.levers) for (const [k, v] of Object.entries(set.levers)) { if (baseline.levers[k]) running[k] = clampL(k, v); }
    for (const [k, val] of Object.entries(running)) { const c = baseline.levers[k]; const lev = levers[k] || (levers[k] = { value: new Array(Q).fill(c.base), base: c.base }); for (let q = q0; q < q1; q++) lev.value[q] = val; }
    const ev = scenario.events[r]; if (ev) for (const [k, v] of Object.entries(ev.shocks || {})) { const s = shocks[k] || (shocks[k] = { value: new Array(Q).fill(0), base: 0 }); for (let q = q0; q < q1; q++) s.value[q] = v; }
  });
  return { levers, shocks, quarters: Q };
}
export function resolveTeam({ baseline, links, history, scenario = DEFAULT_SCENARIO, mode = 'classic' }) {
  const { levers, shocks, quarters } = buildInputs(history, { baseline, scenario, mode });
  /* ...óbreytt simulate+extract... */
}
```

`studio.test.mjs` (≥6): tabs ∈ baseline groups (6); heildar-lever-fjöldi=32; hver lever-meta {min,max,base,step,unit,label}; defaultDials=base f. alla; changedLevers diff (vextir 7.75→9 → 1 færsla, from/to rétt); tóm dials → [].
`resolve.test.mjs` (+studio ≥3): studio `[{levers:{vextir:9.5}}]` skilar kpis (verðbólga lægri en base-run); carry-forward (2 umferðir, 2. án levers → heldur vextir 9.5 → sömu/áfram áhrif); clamp (levers:{vextir:99}→klippt í max, ekki NaN). Classic-próf óbreytt.

Run: `node src/lib/leikur/studio.test.mjs && node src/lib/leikur/resolve.test.mjs`.

---

### Task 2: `server.mjs` — mode, stop, /state, studio resolve, analytics + próf

**Files:** Modify `src/lib/leikur/server.mjs`, `src/lib/leikur/server.test.mjs`, `src/lib/leikur/analytics.mjs`, `src/lib/leikur/analytics.test.mjs`

**Consumes:** Task 1.

Breytingar `server.mjs`:
1. `gameCfg`: `mode: c.mode === 'studio' ? 'studio' : 'classic'`.
2. `create`: `if (cb && cb.mode === 'studio') config.mode = 'studio';`
3. `control 'stop'` (fac): `UPDATE ... SET phase='ended'` → `sjson({ok:true,phase:'ended'})`.
4. `resolve`-lykkja: `resolveTeam({..., mode: cfg.mode})`.
5. `/state`:
   - Sækja núverandi-umferðar læsingar: `SELECT team_id, locked FROM leikur_decisions WHERE game_code=? AND round=?`.
   - `you.locked` = læsing þessa liðs (ef team); bæta í `out.you`.
   - fac: `out.lockRoster = teams.map(t => ({teamId,name,locked}))`.
   - studio + team: `out.mode='studio'`, `out.history` = eigin læstar `{levers}` 1..round-1 (úr leikur_decisions team_id), `out.scenarioSoFar` = `cfg.scenario.events.slice(0, round)` (sjokk+titill; framtíð hulin).
   - `out.mode = cfg.mode` alltaf.
6. Analytics-kall: `buildAnalytics({..., mode: cfg.mode, leverLabels})` þar sem `leverLabels = Object.fromEntries(Object.entries(BASELINE.levers).map(([k,v])=>[k,v.label]))`.

`analytics.mjs` — decisionsTable studio-grein:
```js
export function buildAnalytics({ history, decisions, teams, mandate, decisionsConfig, scenario, currentRound, mode = 'classic', leverLabels = {} }) {
  /* ...classic óbreytt... */
  const decisionsTable = teams.map((t) => {
    const row = decCur.find((d) => d.teamId === t.id), dec = row ? row.decisions : {};
    if (mode === 'studio') {
      const lv = (dec && dec.levers) || {};
      const items = Object.entries(lv).map(([k, v]) => (leverLabels[k] || k) + ' ' + v).slice(0, 6);
      return { teamId: t.id, name: t.name, studio: true, summary: items.length ? items.join(' · ') : '—' };
    }
    return { teamId: t.id, name: t.name, choices: decIds.map((id) => ({...})) };
  });
}
```
(client renderFacAnalytics: ef `row.studio` → sýna `row.summary` í einum dálki.)

`server.test.mjs` (+studio/lock/stop ≥6): studio create `{mode:'studio'}` → decisions `{round,locked:true,decisions:{levers:{vextir:9}}}` → resolve skorar (cumulative tala); `/state` team `you.locked===true` eftir læsingu; fac `lockRoster` lengd=lið; `control 'stop'` → `phase==='ended'`; studio team `/state` hefur `mode==='studio'`+`history`+`scenarioSoFar`; classic óbreytt (mode='classic', engin history/scenarioSoFar-krafa). Mock: bæta `locked` skil í decisions-first ef þarf.
`analytics.test.mjs` (+studio ≥1): studio decisionsTable[0].studio && .summary.

Run: `node src/lib/leikur/server.test.mjs && node src/lib/leikur/analytics.test.mjs`.

---

### Task 3: `client.mjs` studio-stjórnstöð (flipar+sleðar+lifandi gröf) + CSS

**Files:** Modify `src/lib/leikur/client.mjs`, `web/src/pages/leikur/index.astro` (CSS)

**Consumes:** Task 1–2. Import efst í client.mjs:
```js
import { simulate } from '../roads/engine.mjs';
import { resolveTeam } from './resolve.mjs';
import { studioCatalog } from './studio.mjs';
import BASELINE from '../../../gogn/roads/baseline.json' with { type: 'json' };
import LINKS from '../../../gogn/roads/links.json' with { type: 'json' };
```
(⚠ í client-bundli virkar `with {type:'json'}`? Ef ekki → nota `@gogn`-alias `import BASELINE from '@gogn/roads/baseline.json'` án attribute, eins og hermir. Prófa í build.)

Ný S-svið: `studioTab: 0, dials: null`.
`renderStudio(st)` (kallað úr `renderTeam` decide þegar `st.mode==='studio'`):
- Ef `!S.dials`: frumstilla úr `st.history` síðasta læsta (annars `defaultDials`).
- Flipa-bar (catalog.tabs), virkur `S.studioTab`.
- Sleðar virka flipans: `<input type=range min max step value>` + label + gildi+unit + base-merki.
- Gagna-spjald: `<div id="lk-studio-chart">` (fyllt af `drawStudioPreview`).
- Atburðar-spjald (st.event) + mandate-spjald (roleBanner+mandateCard) + læsa-hnappur.
- `attachStudio`: range `oninput` → `S.dials[k]=+v; drawStudioPreview(st); uppfæra gildis-merki` (debounce ~60ms); flipa-smellur → `S.studioTab=i; renderStudio(st)`.
`drawStudioPreview(st)`:
- `history = [...(st.history||[]), { levers: S.dials }]`.
- `scenario = { events: st.scenarioSoFar || [] }`.
- `const r = simulate({ baseline: BASELINE, links: LINKS, ...buildInputsStudio... })` — EINFALDAST: nota `resolveTeam` en það skilar aðeins loka-KPI; f. gröf þarf FULL paths → kalla `simulate` beint með `buildInputs(history,{baseline,scenario,mode:'studio'})`. Flytja `buildInputs` út (export) og nota hér.
- Teikna 4 mandate-KPI (línurit m/markmiðs-línu+valens) + talna-grind lykil-útkoma (loka-fjórðungur vs BAU `outcome.path`).
`submitStudio()`: `api('/'+code+'/decisions', {round, locked:true, decisions:{levers:S.dials}})` → refresh.

CSS (index.astro): `.lk-tabs`, `.lk-tab`, `.lk-tab.sel`, `.lk-slider-row`, `input[type=range]`, `.lk-studio-grid`, `.lk-val`.

⚠ `buildInputs` þarf `export` (Task 1) svo client geti kallað f. full-paths sim.

Run: `node --check src/lib/leikur/client.mjs`; astro build.

---

### Task 4: Læsa-sýnileiki (A) + leikstjóri stöðva/nýr (B) + roster + toggle

**Files:** Modify `src/lib/leikur/client.mjs`, `web/src/pages/leikur/index.astro` (CSS)

1. **Landing/ritill toggle** „🎛️ Stjórnstöð (sleðar+gröf)" (sjálfgefið CHECKED); `createGame`/`submitEditor` senda `mode:'studio'` ef hakað (annars sleppa → classic).
2. **Læsa-UI (lið):** í `renderTeam`/`renderStudio`, ef `st.you && st.you.locked` → sýna „✅ Ákvörðunum læst — bíð…" + „✏️ Breyta" (setur `S.unlocked=true` → sýnir stjórnstöð/kubba aftur; læsa-hnappur endur-sendir). Annars venjuleg ákvörðunar-sýn. Læsa-hnappur stærri/áberandi.
3. **Fac roster:** í `renderFacilitator` decide → „Tilbúin: N/M lið" úr `st.lockRoster`; listi með ✓/… per lið.
4. **Fac stop/nýr:** „⏹️ Stöðva leik" (decide/resolved) → `control('stop')`; ended → „🔄 Nýr leikur" → `location.href='/leikur/'`.

Run: `node --check src/lib/leikur/client.mjs`.

---

### Task 5: Bygging + prod E2E + deploy + minni

1. Öll leikur+engine próf græn.
2. `astro build` (leikur importar BASELINE+LINKS+engine — staðfesta bundlast; ef `with{type:json}` bilar í client → skipta í `@gogn`-alias án attribute).
3. `wrangler dry-run` (worker óbreyttur f. studio nema mode/stop/state — staðfesta bundlast).
4. Commit + push `HEAD:main`. Bíða rebuild.
5. Prod-E2E: studio-leik af lendingu → stjórnstöð (flipar+sleðar), sleða-hreyfing breytir gröfum lifandi, læsa→„læst"+breyta, fac „N/M tilbúin"+stöðva→nýr; classic-leik óbreyttur; 0 console-villur.
6. Minni: kafli í [[karp-roads-hermir]] + MEMORY.md.
