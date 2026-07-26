# RÁS-Leikurinn S3 (orsaka-keðju debrief) — útfærsluáætlun

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development eða executing-plans. Steps nota `- [ ]` checkbox. (ATH: í þessari lotu er keyrt INLINE — undirumboðsmenn blokkaðir af sjálfvirka-ham flokkara.)

**Goal:** Eftir hverja umferð sér hvert lið sjónræna orsaka-keðju frá SÍNUM ákvörðunum → milliliði → 4 markmiðs-KPI, á niðurstöðu-skjánum.

**Architecture:** Nýtt hreint módúl `src/lib/leikur/chain.mjs` dregur út hlutnet úr `links` (input→KPI leiðir). `server.mjs` reiknar `chain` þjóns-megin í resolve og geymir í `results.detail`. `client.mjs` fær nýjan `renderChain` sem teiknar SVG. Vél + frett-ras + S1-endapunktar óbreyttir.

**Tech Stack:** ESM (node+worker+vafri), links-grafa, SVG. Engin ný D1/endapunkta-vinna.

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`; deploy `git push origin b2b-topbar:main`.
- **Vél `engine.mjs`, `frett-ras.mjs`, `render-ras-box.mjs`, `hermir.astro` ÓSNERT.**
- `chain.mjs` HREINT: engin `env`/`crypto`/`D1`/`fetch`/vél-innflutningur.
- Chain reiknað ÞJÓNS-MEGIN (resolve); client teiknar aðeins úr `chain`-gögnum.
- Valens-litir samræmdir hermi: grænt `#54d08a` (sign +1), rautt `#e78284` (−1), inntak blátt `#6ea8fe`, KPI gult `#f6b13b`.
- Prófkeyrsla `node <skrá>` (ekkert npm test); `ok(name,cond)`-stíll; JSON með `readFileSync`.
- Sannreyna í vafra (prod eftir deploy), EKKI curl|grep.
- Commit-endir: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Skráakort

| Skrá | Ábyrgð | Aðgerð |
|---|---|---|
| `src/lib/leikur/chain.mjs` | `activeInputsFromInputs` + `buildChain` (hlutnet input→KPI) | Búa til |
| `src/lib/leikur/chain.test.mjs` | Einingapróf gegn raun-links/baseline | Búa til |
| `src/lib/leikur/server.mjs` | resolve: reikna `chain` → `results.detail.chain` | Breyta |
| `src/lib/leikur/server.test.mjs` | staðfesta `detail.chain` eftir resolve | Breyta |
| `src/lib/leikur/client.mjs` | `renderChain(chain)` SVG + í `renderTeamResults` | Breyta |

---

## Task 1: `chain.mjs` — hlutnets-útdráttur

**Files:** Create `src/lib/leikur/chain.mjs`, `src/lib/leikur/chain.test.mjs`.

**Interfaces:**
- `activeInputsFromInputs({levers,shocks,quarters}, baseline)` → `[{key,kind:'lever'|'shock',dev}]` (ekki-núll frávik við lokafjórðung; `levers`/`shocks` eru `{value:number[],base}` úr `buildInputs`).
- `buildChain({baseline, links, activeInputs, kpiKeys, maxHops=3, maxEdges=14})` → `{nodes:[{key,label,kind:'input'|'mid'|'kpi',depth}], edges:[{from,to,sign,strength}], clipped:bool}`.

- [ ] **Step 1: Skrifa fallandi próf** — `src/lib/leikur/chain.test.mjs`:
```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildChain, activeInputsFromInputs } from './chain.mjs';
import { buildInputs } from './resolve.mjs';
import { SCENARIO } from './game-config.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const rj = (f) => JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/' + f), 'utf8'));
const baseline = rj('baseline.json'), links = rj('links.json');
const KPI = ['verdbolga', 'atvinnuleysi', 'skuldir', 'hagvoxtur'];
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// 1) buildChain: vextir active → net að KPI
{
  const c = buildChain({ baseline, links, activeInputs: [{ key: 'vextir', kind: 'lever', dev: 1 }], kpiKeys: KPI });
  ok('vextir er input-hnútur', c.nodes.some((n) => n.key === 'vextir' && n.kind === 'input'));
  ok('a.m.k. eitt KPI í neti', c.nodes.some((n) => n.kind === 'kpi'));
  ok('leggir til og formerktir', c.edges.length > 0 && c.edges.every((e) => e.sign === 1 || e.sign === -1));
  ok('≤ maxEdges (14)', c.edges.length <= 14);
  ok('input depth 0', c.nodes.find((n) => n.key === 'vextir').depth === 0);
  ok('eitthvert KPI depth > 0', c.nodes.filter((n) => n.kind === 'kpi').some((n) => n.depth > 0));
}
// 2) tómt activeInputs → aðeins KPI, engir leggir
{
  const c = buildChain({ baseline, links, activeInputs: [], kpiKeys: KPI });
  ok('tómt → 4 KPI hnútar', c.nodes.length === 4 && c.nodes.every((n) => n.kind === 'kpi'));
  ok('tómt → engir leggir', c.edges.length === 0);
}
// 3) activeInputsFromInputs úr buildInputs
{
  const set = { peningastefna: 'slaka2', utgjold: 'orvun2', skattar: 'obreytt', fjarfesting: 'innvidir', vidbragd: '' };
  const act = activeInputsFromInputs(buildInputs([set], { baseline, scenario: SCENARIO }), baseline);
  ok('virk inntök innihalda vextir+utgjold+innvidir', ['vextir', 'utgjold', 'innvidir'].every((k) => act.some((a) => a.key === k)));
  ok('skattar (obreytt) EKKI virkt', !act.some((a) => a.key === 'skattar'));
  ok('vextir dev < 0 (slaka)', act.find((a) => a.key === 'vextir').dev < 0);
}
// 4) determinismi
{
  const mk = () => JSON.stringify(buildChain({ baseline, links, activeInputs: [{ key: 'vextir', kind: 'lever', dev: 1 }], kpiKeys: KPI }));
  ok('determinismi', mk() === mk());
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Keyra próf → fall.** `node src/lib/leikur/chain.test.mjs` → FAIL (module vantar).

- [ ] **Step 3: Útfæra `src/lib/leikur/chain.mjs`:**
```js
// Orsaka-hlutnet fyrir S3-debrief. HREINT: links-grafa, engin vél/env/D1.
// Dregur út net frá VIRKUM inntökum liðs → markmiðs-KPI: hnútar/leggir á leið input→KPI, klippt.
const MAX_HOPS = 3, MAX_EDGES = 14;
const labelOf = (b, k) => (b.levers[k] && b.levers[k].label) || (b.shocks[k] && b.shocks[k].label) || (b.outcomes[k] && b.outcomes[k].label) || k;

export function activeInputsFromInputs({ levers, shocks, quarters }, baseline) {
  const last = quarters - 1, out = [];
  for (const k in levers) { const dev = levers[k].value[last] - levers[k].base; if (Math.abs(dev) > 1e-9) out.push({ key: k, kind: 'lever', dev: +dev.toFixed(4) }); }
  for (const k in shocks) { const dev = shocks[k].value[last]; if (Math.abs(dev) > 1e-9) out.push({ key: k, kind: 'shock', dev: +dev.toFixed(4) }); }
  return out;
}

export function buildChain({ baseline, links, activeInputs, kpiKeys, maxHops = MAX_HOPS, maxEdges = MAX_EDGES }) {
  const inputKeys = new Set(activeInputs.map((a) => a.key));
  const kpiSet = new Set(kpiKeys);
  const fwd = {}, bwd = {};
  for (const l of links) { if (!baseline.outcomes[l.to]) continue; (fwd[l.from] ||= []).push(l.to); (bwd[l.to] ||= []).push(l.from); }
  const reach = (starts, adj) => { const S = new Set(starts); let fr = [...starts]; for (let h = 0; h < maxHops && fr.length; h++) { const nx = []; for (const n of fr) for (const m of (adj[n] || [])) if (!S.has(m)) { S.add(m); nx.push(m); } fr = nx; } return S; };
  const F = reach([...inputKeys], fwd), B = reach([...kpiSet], bwd);
  const onPath = new Set(); for (const k of F) if (B.has(k)) onPath.add(k);
  for (const k of kpiKeys) onPath.add(k);
  // leggir á leið, klippt eftir styrk (stöðug röðun)
  let edges = [];
  for (const l of links) { if (!baseline.outcomes[l.to] || l.from === l.to || !onPath.has(l.from) || !onPath.has(l.to)) continue; edges.push({ from: l.from, to: l.to, sign: l.coef >= 0 ? 1 : -1, strength: +Math.abs(l.coef).toFixed(3) }); }
  edges.sort((a, b) => b.strength - a.strength || (a.from + '>' + a.to).localeCompare(b.from + '>' + b.to));
  const clipped = edges.length > maxEdges; edges = edges.slice(0, maxEdges);
  // hnútar sem leggir snerta (+ virk inntök á leið + KPI)
  const used = new Set(); for (const e of edges) { used.add(e.from); used.add(e.to); }
  for (const a of activeInputs) if (onPath.has(a.key)) used.add(a.key);
  for (const k of kpiKeys) used.add(k);
  edges = edges.filter((e) => used.has(e.from) && used.has(e.to));
  // dýpt: BFS frá inntökum yfir notaða leggi
  const depth = {}; for (const k of used) depth[k] = 99;
  const uf = {}; for (const e of edges) (uf[e.from] ||= []).push(e.to);
  let fr = [...inputKeys].filter((k) => used.has(k)); fr.forEach((k) => (depth[k] = 0)); let d = 0;
  while (fr.length && d < maxHops + 2) { d++; const nx = []; for (const n of fr) for (const t of (uf[n] || [])) if (depth[t] > d) { depth[t] = d; nx.push(t); } fr = nx; }
  const maxD = Math.max(1, ...[...used].map((k) => (depth[k] < 99 ? depth[k] : 0)));
  for (const k of used) if (depth[k] === 99) depth[k] = kpiSet.has(k) ? maxD + 1 : 1;
  const kindOf = (k) => inputKeys.has(k) ? 'input' : (kpiSet.has(k) ? 'kpi' : 'mid');
  const nodes = [...used].map((k) => ({ key: k, label: labelOf(baseline, k), kind: kindOf(k), depth: depth[k] }));
  return { nodes, edges, clipped };
}
```

- [ ] **Step 4: Keyra próf → stenst.** `node src/lib/leikur/chain.test.mjs` → `… pass, 0 fail`. (Ef atriði „leggir til" fellur, staðfesta að `vextir` nái einhverju KPI í ≤3 hoppum í raun-`links.json`; ef ekki, hækka `maxHops` eða velja annað þekkt-tengt inntak í prófinu — EKKI veikja án ástæðu.)

- [ ] **Step 5: Commit**
```bash
git add src/lib/leikur/chain.mjs src/lib/leikur/chain.test.mjs
git commit -m "RÁS-Leikur S3: chain.mjs — orsaka-hlutnet (input→KPI)"
```

---

## Task 2: Server — `chain` í `results.detail`

**Files:** Modify `src/lib/leikur/server.mjs` (imports + resolve-lykkja), `src/lib/leikur/server.test.mjs` (viðbót).

**Interfaces:** Consumes `buildInputs` (resolve.mjs), `activeInputsFromInputs`/`buildChain` (chain.mjs). Produces `results.detail.chain = {nodes,edges,clipped}`.

- [ ] **Step 1: Bæta imporum í `server.mjs`** (með hinum leikur-imporunum efst):
```js
import { resolveTeam, buildInputs } from './resolve.mjs';
import { buildChain, activeInputsFromInputs } from './chain.mjs';
```
(`resolveTeam` er þegar importað — sameina í eina línu með `buildInputs`.)

- [ ] **Step 2: Reikna chain í resolve-lykkjunni.** Í `control`/`resolve` greininni, þar sem stendur:
```js
        const { kpis } = resolveTeam({ baseline: BASELINE, links: LINKS, history, scenario: SCENARIO });
        const sc = scoreRound(kpis);
```
bæta við á eftir (og nota `chain` í geymslu):
```js
        const inp = buildInputs(history, { baseline: BASELINE, scenario: SCENARIO });
        const chain = buildChain({ baseline: BASELINE, links: LINKS, activeInputs: activeInputsFromInputs(inp, BASELINE), kpiKeys: MANDATE.kpis.map((k) => k.key) });
```
og breyta geymslu-línunni úr `JSON.stringify({ kpis, perKpi: sc.perKpi, crisis: sc.crisis })` í:
```js
        ...JSON.stringify({ kpis, perKpi: sc.perKpi, crisis: sc.crisis, chain })...
```
(Öll `.bind(...)`-línan óbreytt að öðru leyti.)

- [ ] **Step 3: Bæta prófi í `server.test.mjs`** (á eftir „liðin fá ÓLÍK stig"-línunni, notar `st2`):
```js
  ok('detail hefur chain (nodes+edges)', (st2.results || []).some((r) => r.detail && r.detail.chain && Array.isArray(r.detail.chain.nodes) && Array.isArray(r.detail.chain.edges)));
  ok('a.m.k. eitt lið með ekki-tóma keðju', (st2.results || []).some((r) => r.detail && r.detail.chain && r.detail.chain.edges.length > 0));
```

- [ ] **Step 4: Keyra próf → stenst.** `node src/lib/leikur/server.test.mjs` → `15 pass, 0 fail` (13 áður + 2 ný).
Auk þess: `node src/lib/leikur/resolve.test.mjs` (óbreytt grænt) + Worker dry-run:
```bash
cd web && npx wrangler deploy --dry-run --outdir /tmp/s3-build 2>&1 | tail -6
```
Expected: grænt (chain.mjs bætist í worker-bundle án villu).

- [ ] **Step 5: Commit**
```bash
git add src/lib/leikur/server.mjs src/lib/leikur/server.test.mjs
git commit -m "RÁS-Leikur S3: server reiknar chain í results.detail"
```

---

## Task 3: Client — `renderChain` SVG á niðurstöðu-skjá

**Files:** Modify `src/lib/leikur/client.mjs`.

**Interfaces:** Consumes `chain = {nodes:[{key,label,kind,depth}], edges:[{from,to,sign,strength}], clipped}` úr `state.results[].detail.chain`.

- [ ] **Step 1: Bæta `renderChain(chain)` í `client.mjs`** — hrein fall sem skilar SVG-streng (eða `''` ef engir hnútar). Kröfur:
  - **Uppröðun:** dálkar eftir `node.depth` (0 = vinstra, hærra = hægra); hnútar innan dálks jafndreift lóðrétt. Reikna `x` af `depth` (t.d. `col*COLW`), `y` af index innan dálks.
  - **Leggir:** lína frá `from`-hnút til `to`-hnút, litur `sign>0 ? '#54d08a' : '#e78284'`, `stroke-width` skalað af `strength` (t.d. `1 + min(4, strength*3)`), ör-haus.
  - **Hnútar:** rétthyrningur + label (stytt), litur eftir `kind`: `input`→`#6ea8fe`, `mid`→grátt, `kpi`→`#f6b13b`. Escape label.
  - **Klippt:** ef `chain.clipped`, sýna „+ fleiri tengsl" texta neðst.
  - Nota `lk-`-forskeyti stétt-nöfn. SVG `viewBox` skalað að stærð.
  - Ef `!chain || !chain.edges.length`: skila `'<p class="lk-muted">Engin virk áhrif þessa umferð.</p>'`.

- [ ] **Step 2: Kalla `renderChain` í `renderTeamResults`.** Í `client.mjs`, í `renderTeamResults`, á eftir `scorecard`-kassanum, bæta nýjum kassa:
```js
    const chainHtml = (mine && mine.detail && mine.detail.chain) ? renderChain(mine.detail.chain) : '';
```
og bæta `+ card('🔗 Orsaka-keðja ákvarðana', chainHtml)` við `root.innerHTML`-samsetninguna (á milli skorkorts og stigatöflu).

- [ ] **Step 3: CSS** — bæta í `web/src/pages/leikur/index.astro` `<style>`:
```css
  main[data-pg="leikur"] :global(.lk-chain) { width: 100%; overflow-x: auto; }
  main[data-pg="leikur"] :global(.lk-chain svg) { display: block; max-width: 100%; height: auto; }
  main[data-pg="leikur"] :global(.lk-muted) { color: var(--muted, #9fb0c8); }
```

- [ ] **Step 4: Byggja.** `cd web && npx astro build` → `Complete!`, engin villa (staðfestir að client þýðist með `renderChain`).

- [ ] **Step 5: Commit**
```bash
git add src/lib/leikur/client.mjs web/src/pages/leikur/index.astro
git commit -m "RÁS-Leikur S3: renderChain SVG á niðurstöðu-skjá liðs"
```

---

## Task 4: E2E vafra-staðfesting + deploy (controller)

**Files:** engin.

- [ ] **Step 1: Öll leik-próf græn.** `node src/lib/leikur/{chain,resolve,scoring,server,game-config}.test.mjs` → öll `0 fail`. `node src/lib/roads/engine.test.mjs` óbreytt grænt.
- [ ] **Step 2: Bygging + Worker dry-run** græn.
- [ ] **Step 3: Deploy.** `git push origin b2b-topbar:main` (samruna origin/main ef á undan). Bíða eftir Worker-build (poll `/api/leikur/create`).
- [ ] **Step 4: Prod-E2E.** Búa til leik, 2 lið, spila umferð með ólíkum ákvörðunum, resolve → opna niðurstöðu-skjá liðs (`?g=<code>` + team-tákn í localStorage) → staðfesta SVG-keðju með grænum/rauðum leggjum frá ákvörðunum að KPI; engar console-villur.
- [ ] **Step 5: Uppfæra minni.** Bæta S3 við [[karp-roads-hermir]] RÁS-Leikur-hlutann + MEMORY.md línu.

---

## Self-review (spec-þekja)

- Orsaka-keðju mynd (valið form): `chain.mjs` (Task 1) + `renderChain` (Task 3) ✓
- Þjóns-vald (chain reiknað í resolve): Task 2 ✓
- Liðs-eigin á niðurstöðu-skjá: Task 3 (`renderTeamResults`) ✓
- Endurnýting valens-lita, engin vél/frett-ras breyting: allar tasks ✓
- Klipping fyrir læsileika + tómt-tilfelli: `buildChain` `maxEdges`/`clipped` (Task 1) + `renderChain` tómt-fallback (Task 3) ✓
- **Áhætta:** `vextir`→KPI innan 3 hoppa í raun-links (Task 1 Step 4 nóta); SVG-teiknari er DOM-glue → vafra-staðfest í Task 4 (ekki línu-fyrir-línu).
