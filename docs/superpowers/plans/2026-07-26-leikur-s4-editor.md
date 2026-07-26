# RÁS-Leikurinn S4 (sviðsmynda-/umboðs-ritill) — útfærsluáætlun

> Keyrt INLINE. Steps nota `- [ ]`.

**Goal:** Leikstjóri semur sérsniðinn leik (atburðir + umboð + umferðafjöldi) sem geymist í leiknum og allur leikurinn notar.

**Architecture:** Ný hrein `game-validate.mjs`; `server.mjs` geymir+staðfestir custom config og notar `gameCfg(game)` í stað fastanna; `client.mjs` ritill forfylltur úr sjálfgefnu. Hreinu módúlarnir (resolve/scoring/analytics/chain) óbreyttir (taka þegar scenario/mandate).

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`; deploy `git push origin b2b-topbar:main`.
- Vél/`frett-ras`/`render-ras-box`/`chain.mjs`/`analytics.mjs`/`resolve.mjs`/`scoring.mjs`/`hermir.astro` ÓSNERT.
- `game-validate.mjs` HREINT (engin env/D1/vél).
- Validering server-hlið er lokaorðið (client-hlið aðeins mjúk).
- Prófkeyrsla `node <skrá>`; JSON readFileSync; sannreyna í vafra (prod eftir deploy).
- Commit-endir: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Skráakort

| Skrá | Aðgerð |
|---|---|
| `src/lib/leikur/game-validate.mjs` (+`.test.mjs`) | Búa til |
| `src/lib/leikur/server.mjs` (+`server.test.mjs`) | Breyta (gameCfg + create + neytendur) |
| `src/lib/leikur/client.mjs` | Breyta (ritill) |
| `web/src/pages/leikur/index.astro` | Breyta (`#leikur-model` blob + CSS) |

---

## Task 1: `game-validate.mjs`

**Files:** Create `src/lib/leikur/game-validate.mjs`, `src/lib/leikur/game-validate.test.mjs`.

- [ ] **Step 1: Fallandi próf** — `src/lib/leikur/game-validate.test.mjs`:
```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateGameConfig } from './game-validate.mjs';
import { SCENARIO, MANDATE, ROUNDS } from './game-config.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const clone = (o) => JSON.parse(JSON.stringify(o));

ok('sjálfgefið er gilt', validateGameConfig({ scenario: SCENARIO, mandate: MANDATE, rounds: ROUNDS }, baseline).ok === true);
// ógilt sjokk
{ const s = clone(SCENARIO); s.events[1].shocks = { ekki_til: 10 }; const v = validateGameConfig({ scenario: s, mandate: MANDATE, rounds: ROUNDS }, baseline); ok('ógilt sjokk → error', !v.ok && v.errors.some((e) => e.includes('ekki_til'))); }
// events.length ≠ rounds
{ const v = validateGameConfig({ scenario: SCENARIO, mandate: MANDATE, rounds: 5 }, baseline); ok('events≠rounds → error', !v.ok && v.errors.some((e) => e.includes('rounds'))); }
// vantar viðbragð
{ const s = clone(SCENARIO); s.events[0].responses = []; ok('0 viðbrögð → error', !validateGameConfig({ scenario: s, mandate: MANDATE, rounds: ROUNDS }, baseline).ok); }
// ógild KPI-útkoma
{ const m = clone(MANDATE); m.kpis[0].key = 'ekki_til'; ok('ógild KPI → error', !validateGameConfig({ scenario: SCENARIO, mandate: m, rounds: ROUNDS }, baseline).ok); }
// rounds út fyrir svið
{ ok('rounds 0 → error', !validateGameConfig({ scenario: SCENARIO, mandate: MANDATE, rounds: 0 }, baseline).ok); }
// ógildur viðbragðs-lever
{ const s = clone(SCENARIO); s.events[0].responses[1] = { key: 'x', label: 'X', effect: { lever: { ekki_til: 3 } } }; ok('ógildur viðbragðs-lever → error', !validateGameConfig({ scenario: s, mandate: MANDATE, rounds: ROUNDS }, baseline).ok); }
// gilt sérsniðið (2 umferðir)
{ const s = { id: 'custom', events: [ { round: 1, title: 'T1', text: '', shocks: {}, responses: [{ key: 'a', label: 'A', effect: {} }] }, { round: 2, title: 'T2', text: '', shocks: { olia: 20 }, responses: [{ key: 'a', label: 'A', effect: { lever: { utgjold: 5 } } }] } ] };
  ok('gilt sérsniðið → ok', validateGameConfig({ scenario: s, mandate: MANDATE, rounds: 2 }, baseline).ok === true); }
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Keyra → fall.** `node src/lib/leikur/game-validate.test.mjs` → FAIL.

- [ ] **Step 3: Útfæra `src/lib/leikur/game-validate.mjs`:**
```js
// Hörð staðfesting á sérsniðnu leik-config. HREINT (engin env/D1/vél).
export function validateGameConfig({ scenario, mandate, rounds }, baseline) {
  const errors = [];
  const LEV = new Set(Object.keys(baseline.levers)), SHK = new Set(Object.keys(baseline.shocks)), OUT = new Set(Object.keys(baseline.outcomes));
  const R = Number(rounds);
  if (!Number.isInteger(R) || R < 1 || R > 20) errors.push('Umferðir verða að vera heiltala 1–20');
  if (!scenario || !Array.isArray(scenario.events)) { errors.push('Sviðsmynd (events) vantar'); }
  else {
    if (scenario.events.length !== R) errors.push('Fjöldi atburða (' + scenario.events.length + ') verður að vera = umferðir (' + R + ')');
    scenario.events.forEach((e, i) => {
      const rn = 'Umferð ' + (i + 1);
      if (typeof e.title !== 'string' || !e.title.trim()) errors.push(rn + ': titil vantar');
      for (const k of Object.keys(e.shocks || {})) { if (!SHK.has(k)) errors.push(rn + ': ógilt sjokk „' + k + '"'); else if (typeof e.shocks[k] !== 'number') errors.push(rn + ': sjokk „' + k + '" verður tala'); }
      if (!Array.isArray(e.responses) || e.responses.length < 1) { errors.push(rn + ': a.m.k. eitt viðbragð'); return; }
      const rkeys = [];
      e.responses.forEach((r, j) => {
        const vn = rn + ' viðbragð ' + (j + 1);
        if (typeof r.label !== 'string' || !r.label.trim()) errors.push(vn + ': heiti vantar');
        if (typeof r.key !== 'string' || !r.key) errors.push(vn + ': lykill vantar'); else rkeys.push(r.key);
        const eff = r.effect || {};
        for (const k of Object.keys(eff.lever || {})) { if (!LEV.has(k)) errors.push(vn + ': ógildur sleði „' + k + '"'); else if (typeof eff.lever[k] !== 'number') errors.push(vn + ': sleða-gildi verður tala'); }
        for (const k of Object.keys(eff.shock || {})) { if (!SHK.has(k)) errors.push(vn + ': ógilt sjokk „' + k + '"'); else if (typeof eff.shock[k] !== 'number') errors.push(vn + ': sjokk-gildi verður tala'); }
      });
      if (new Set(rkeys).size !== rkeys.length) errors.push(rn + ': viðbragðs-lyklar verða einstakir');
    });
  }
  if (!mandate || !Array.isArray(mandate.kpis) || !mandate.kpis.length) errors.push('Umboð (kpis) vantar');
  else mandate.kpis.forEach((k) => {
    if (!OUT.has(k.key)) errors.push('Umboð: ógild útkoma „' + k.key + '"');
    if (!['target', 'max', 'min'].includes(k.dir)) errors.push('Umboð „' + k.key + '": dir verður target/max/min');
    if (typeof k.band !== 'number' || k.band < 0) errors.push('Umboð „' + k.key + '": band ≥ 0');
    if (typeof k.zeroAt !== 'number' || k.zeroAt <= 0) errors.push('Umboð „' + k.key + '": zeroAt > 0');
    const tv = k.dir === 'target' ? k.target : k.dir === 'max' ? k.max : k.min;
    if (typeof tv !== 'number') errors.push('Umboð „' + k.key + '": markmiðs-gildi vantar');
  });
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Keyra → stenst.** `node src/lib/leikur/game-validate.test.mjs` → `… pass, 0 fail`.

- [ ] **Step 5: Commit** `git add src/lib/leikur/game-validate.mjs src/lib/leikur/game-validate.test.mjs && git commit -m "RÁS-Leikur S4: game-validate.mjs — hörð staðfesting á custom config"`

---

## Task 2: Server — `gameCfg` + custom `create`

**Files:** Modify `src/lib/leikur/server.mjs`, `src/lib/leikur/server.test.mjs`.

- [ ] **Step 1: Import** í `server.mjs` (með game-validate): `import { validateGameConfig } from './game-validate.mjs';`

- [ ] **Step 2: `gameCfg`-hjálp.** Á eftir `const now = () => Math.floor(Date.now() / 1000);` bæta:
```js
function gameCfg(game) { let c = {}; try { c = JSON.parse(game.config || '{}'); } catch (e) {} return { scenario: (c.scenario && Array.isArray(c.scenario.events)) ? c.scenario : SCENARIO, mandate: (c.mandate && Array.isArray(c.mandate.kpis)) ? c.mandate : MANDATE, rounds: c.rounds || ROUNDS }; }
```

- [ ] **Step 3: `create` tekur custom config.** Skipta út `const config = { rounds: ROUNDS, scenarioId: SCENARIO.id };` fyrir:
```js
    const cb = await request.json().catch(() => ({}));
    let config = { rounds: ROUNDS, scenarioId: SCENARIO.id };
    if (cb && cb.scenario && cb.mandate) {
      const v = validateGameConfig({ scenario: cb.scenario, mandate: cb.mandate, rounds: cb.rounds }, BASELINE);
      if (!v.ok) return sjson({ error: 'invalid', errors: v.errors }, 400);
      config = { custom: true, rounds: +cb.rounds, scenario: cb.scenario, mandate: cb.mandate };
    }
```

- [ ] **Step 4: Nota `gameCfg` í neytendum.** Á eftir `if (!game) return sjson({ error: 'not-found' }, 404);` bæta `const cfg = gameCfg(game);`. Síðan:
  - state: `const ev = SCENARIO.events[(game.current_round || 1) - 1] || null;` → `const ev = cfg.scenario.events[(game.current_round || 1) - 1] || null;`
  - state out-literal: `mandate: MANDATE,` → `mandate: cfg.mandate,`
  - state analytics: `mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO,` → `mandate: cfg.mandate, decisionsConfig: DECISIONS, scenario: cfg.scenario,`
  - control next: `if (nr > ROUNDS)` → `if (nr > cfg.rounds)`
  - control resolve: `resolveTeam({ baseline: BASELINE, links: LINKS, history, scenario: SCENARIO })` → `scenario: cfg.scenario`; `const sc = scoreRound(kpis);` → `const sc = scoreRound(kpis, cfg.mandate);`; `buildInputs(history, { baseline: BASELINE, scenario: SCENARIO })` → `scenario: cfg.scenario`; `kpiKeys: MANDATE.kpis.map((k) => k.key)` → `kpiKeys: cfg.mandate.kpis.map((k) => k.key)`

- [ ] **Step 5: Próf-viðbót í `server.test.mjs`** (efst, eftir `const env = ...`, búa til gilt custom config; bæta prófum eftir núverandi assertions):
```js
  // Task S4: custom game create
  const custom = { rounds: 2, mandate: JSON.parse(JSON.stringify((await import('./game-config.mjs')).MANDATE)),
    scenario: { id: 'custom', events: [
      { round: 1, title: 'Sérsniðið upphaf', text: '', shocks: {}, responses: [{ key: 'a', label: 'Ekkert', effect: {} }] },
      { round: 2, title: 'Sérsniðin kreppa', text: '', shocks: { olia: 40 }, responses: [{ key: 'a', label: 'Bregðast við', effect: { lever: { utgjold: 6 } } }] } ] } };
  const cc = await J(await leikurHandler(req('/api/leikur/create', custom), env));
  ok('custom create → code', !!cc.code);
  await leikurHandler(req('/api/leikur/' + cc.code + '/join', { name: 'C' }), env);
  await leikurHandler(new Request('https://karp.is/api/leikur/' + cc.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cc.facToken }, body: JSON.stringify({ action: 'start' }) }), env);
  const cst = await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + cc.code + '/state', { headers: { authorization: 'Bearer ' + cc.facToken } }), env));
  ok('custom event birtist í state', cst.event && cst.event.title === 'Sérsniðið upphaf');
  const bad = await leikurHandler(req('/api/leikur/create', { rounds: 2, mandate: custom.mandate, scenario: { id: 'x', events: [{ round: 1, title: 'T', shocks: { ekki_til: 5 }, responses: [{ key: 'a', label: 'A', effect: {} }] }] } }), env);
  ok('ógilt custom → 400', bad.status === 400);
```

- [ ] **Step 6: Keyra.** `node src/lib/leikur/server.test.mjs` → `21 pass, 0 fail` (18 + 3). Worker dry-run grænt.

- [ ] **Step 7: Commit** `git add src/lib/leikur/server.mjs src/lib/leikur/server.test.mjs && git commit -m "RÁS-Leikur S4: server gameCfg + custom create (validað)"`

---

## Task 3: Client-ritill + model-blob

**Files:** Modify `web/src/pages/leikur/index.astro`, `src/lib/leikur/client.mjs`.

- [ ] **Step 1: `#leikur-model`-blob í `index.astro`.** Í frontmatter: `import BASELINE from '@gogn/roads/baseline.json'; import { SCENARIO, MANDATE, ROUNDS } from '@lib/leikur/game-config.mjs';` Byggja `const MODEL = { levers: Object.entries(BASELINE.levers).map(([k,v])=>({key:k,label:v.label})), shocks: Object.entries(BASELINE.shocks).map(([k,v])=>({key:k,label:v.label})), outcomes: Object.entries(BASELINE.outcomes).map(([k,v])=>({key:k,label:v.label})), defaultScenario: SCENARIO, defaultMandate: MANDATE, rounds: ROUNDS };` og bæta í `<main>`: `<script type="application/json" id="leikur-model" set:html={JSON.stringify(MODEL)}></script>`.

- [ ] **Step 2: Ritill í `client.mjs`.** Bæta:
  - Lesa model: `const model = JSON.parse(document.getElementById('leikur-model')?.textContent || '{}');`
  - Á lending: nýr hnappur „Búa til sérsniðinn leik" → `S.view='editor'; render();` (og `renderLanding` sýnir hann). Bæta `editor`-grein í `render()` → `renderEditor()`.
  - **`renderEditor()`**: heldur `S.draft = { rounds, mandate: <djúp-afrit defaultMandate>, scenario: {id:'custom', events:[…djúp-afrit defaultScenario.events]} }` (frumstillt einu sinni). Teiknar:
    - **Umboð:** 4 raðir; hver KPI: heiti (fast) + markmiðs-gildi-reitur (target/max/min eftir `dir`) + band-reitur. Input-listener uppfærir `S.draft.mandate.kpis[i]`.
    - **Umferðir:** fyrir hvern `event` (index r): kort með titil-reit, texta-reit, sjokk-vali (`<select>` „ekkert" + `model.shocks` heiti → setur `event.shocks = key?{[key]:val}:{}`) + sjokk-gildi-reitur, viðbragða-listi (hvert: heiti-reitur + effect-tegund `<select>` [engin/sleði/sjokk] + lykil-`<select>` úr `model.levers`/`model.shocks` + gildi-reitur; „✕" eyðir), „+ viðbragð"-hnappur (bætir `{key:'r'+n,label:'',effect:{}}`), „✕ umferð"-hnappur. „+ Bæta umferð" (klónar tóman atburð, `S.draft.rounds` uppfærist). Uppröðun-breytingar (bæta/eyða) → `render()`; texta-innslag → mutera draft ÁN re-render (halda fókus).
    - **„Búa til leik"** → mjúk client-validering (nöfn til, events.length===rounds); `POST /create` með `{scenario:S.draft.scenario, mandate:S.draft.mandate, rounds:S.draft.rounds}`; ef `400` birta `errors`-lista; annars `localStorage`+redirect eins og `createGame`.
    - „Til baka" → `S.view=null; render()`.
  - Escape öll gildi; `lk-`-stétt.

- [ ] **Step 3: CSS** í `index.astro`: reitir/select fá núverandi `input`-stíl; bæta `main[data-pg="leikur"] :global(.lk-ed-round) { border:1px solid var(--line,#2a2f3a); border-radius:8px; padding:10px; margin:8px 0; } main[data-pg="leikur"] :global(select) { background:#12161f; color:var(--ink,#e8ecf3); border:1px solid var(--line,#2a2f3a); border-radius:8px; padding:6px; } main[data-pg="leikur"] :global(.lk-err) { color:#e78284; font-size:13px; }`

- [ ] **Step 4: Byggja.** `cd web && npx astro build` → `Complete!`.

- [ ] **Step 5: Commit** `git add web/src/pages/leikur/index.astro src/lib/leikur/client.mjs && git commit -m "RÁS-Leikur S4: client sviðsmynda-/umboðs-ritill + model-blob"`

---

## Task 4: E2E + deploy (controller)

- [ ] **Step 1:** Öll leik-próf græn (`game-validate,analytics,chain,game-config,resolve,scoring,server` + engine).
- [ ] **Step 2:** Bygging + Worker dry-run græn.
- [ ] **Step 3: Deploy** (`git push`, samruna ef þarf). Bíða eftir Worker (poll: `create` með custom config skilar code).
- [ ] **Step 4: Prod-E2E.** (a) API: `POST /create` með sérsniðnu config → code; start → `state.event.title` = sérsniðið; ógilt config → 400 errors. (b) Vafra: opna ritil, breyta umboði + atburði, búa til leik → leikstjóra-sýn með sérsniðnu; grunnleikur (sjálfgefinn) virkar áfram; engar console-villur.
- [ ] **Step 5: Minni** — S4 við [[karp-roads-hermir]] + MEMORY.md.

## Self-review

- Fullur ritill (atburðir+umboð+umferðir): `client.mjs` renderEditor (T3) ✓
- Hörð validering: `game-validate.mjs` (T1) + server create (T2) ✓
- Leikur notar sérsniðið alls staðar: `gameCfg` í state/control/analytics (T2) ✓
- Hreinu módúlar/vél ósnert ✓
- Áhætta: ritill er stórt DOM-form → vafra-staðfest T4; model-blob build-time (levers/shocks/outcomes+default) → prófað í byggingu.
