# RÁS-Leikurinn S2 (leikstjóra-greiningarmælaborð) — útfærsluáætlun

> Keyrt INLINE (undirumboðsmenn blokkaðir). Steps nota `- [ ]`.

**Goal:** Leikstjóri fær þver-liða mælaborð (skorkort-tafla + ákvarðanir + ferla-gröf) til að drífa umræðuna.

**Architecture:** Hrein `analytics.mjs` mótar gögn þjóns-megin; `server.mjs` /state (fac-tákn) skilar `analytics`; `client.mjs` `renderFacAnalytics` teiknar. Vél/frett-ras/chain/hermir ósnert.

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`; deploy `git push origin b2b-topbar:main`.
- Vél/`frett-ras`/`render-ras-box`/`chain.mjs`/`hermir.astro` ÓSNERT.
- `analytics.mjs` HREINT (engin env/D1/vél/fetch).
- Analytics AÐEINS til fac-tákns; team-tákn fá ekki `analytics`.
- Prófkeyrsla `node <skrá>`; JSON með readFileSync; sannreyna í vafra (prod eftir deploy).
- Commit-endir: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Skráakort

| Skrá | Ábyrgð | Aðgerð |
|---|---|---|
| `src/lib/leikur/analytics.mjs` | `buildAnalytics` (scorecard/decisions/trajectories) | Búa til |
| `src/lib/leikur/analytics.test.mjs` | Einingapróf | Búa til |
| `src/lib/leikur/server.mjs` | /state fac → `analytics` | Breyta |
| `src/lib/leikur/server.test.mjs` | fac hefur analytics, team ekki | Breyta |
| `src/lib/leikur/client.mjs` | `renderFacAnalytics` + í `renderFacilitator` | Breyta |

---

## Task 1: `analytics.mjs`

**Files:** Create `src/lib/leikur/analytics.mjs`, `src/lib/leikur/analytics.test.mjs`.

**Interfaces:** `buildAnalytics({history, decisions, teams, mandate, decisionsConfig, scenario, currentRound})` → `{scorecard, decisionsTable, trajectories, rounds}`.
- `history` stak: `{round, teamId, roundScore, cumulative, perKpi:[{key,label,value,score}]}`.
- `decisions` stak: `{round, teamId, decisions:{decId:optKey}}`.
- `teams` stak: `{id, name}`.

- [ ] **Step 1: Fallandi próf** — `src/lib/leikur/analytics.test.mjs`:
```js
import { buildAnalytics } from './analytics.mjs';
import { MANDATE, DECISIONS, SCENARIO } from './game-config.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const teams = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
const perKpi = (v) => MANDATE.kpis.map((k) => ({ key: k.key, label: k.label, value: 0, score: v }));
const history = [
  { round: 1, teamId: 1, roundScore: 80, cumulative: 80, perKpi: perKpi(80) },
  { round: 1, teamId: 2, roundScore: 90, cumulative: 90, perKpi: perKpi(90) },
  { round: 2, teamId: 1, roundScore: 85, cumulative: 165, perKpi: perKpi(85) },
  { round: 2, teamId: 2, roundScore: 60, cumulative: 150, perKpi: perKpi(60) },
];
const decisions = [
  { round: 2, teamId: 1, decisions: { peningastefna: 'slaka2', utgjold: 'orvun2', skattar: 'obreytt', fjarfesting: 'innvidir', vidbragd: 'kolefni' } },
  { round: 2, teamId: 2, decisions: { peningastefna: 'herda2', utgjold: 'adhald2', skattar: 'haekka2', fjarfesting: 'engin', vidbragd: 'absorb' } },
];
const a = buildAnalytics({ history, decisions, teams, mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: 2 });

ok('scorecard 2 lið', a.scorecard.length === 2);
ok('scorecard raðað eftir cumulative (A=165 fyrst)', a.scorecard[0].teamId === 1 && a.scorecard[0].cumulative === 165);
ok('scorecard perKpi 4 stig', a.scorecard[0].perKpi.length === 4 && a.scorecard[0].perKpi[0].score === 85);
ok('decisionsTable 2 lið', a.decisionsTable.length === 2);
const t1 = a.decisionsTable.find((r) => r.teamId === 1);
ok('#1 optLabel leyst (Slaka mikið)', t1.choices.find((c) => c.decId === 'peningastefna').optLabel === 'Slaka mikið');
ok('#5 vidbragd leyst úr scenario (Flýta orkuskiptum)', t1.choices.find((c) => c.decId === 'vidbragd').optLabel === 'Flýta orkuskiptum');
ok('trajectories.cumulative 2 línur', a.trajectories.cumulative.length === 2);
ok('cumulative A 2 punktar (r1,r2)', a.trajectories.cumulative.find((s) => s.teamId === 1).points.length === 2);
ok('byKpi hefur 4 KPI', Object.keys(a.trajectories.byKpi).length === 4);
ok('byKpi verdbolga hefur línu per lið', a.trajectories.byKpi.verdbolga.series.length === 2);
// tómt / 1 umferð
const a1 = buildAnalytics({ history: history.filter((h) => h.round === 1), decisions: [], teams, mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: 1 });
ok('1 umferð → cumulative 1 punktur', a1.trajectories.cumulative[0].points.length === 1);
ok('engin ákvörðun → optLabel —', a1.decisionsTable[0].choices[0].optLabel === '—');
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Keyra → fall.** `node src/lib/leikur/analytics.test.mjs` → FAIL.

- [ ] **Step 3: Útfæra `src/lib/leikur/analytics.mjs`:**
```js
// Þver-liða greining fyrir leikstjóra-mælaborð. HREINT (engin env/D1/vél).
function optLabelFor(decId, optKey, decisionsConfig, scenario, round) {
  if (decId === 'vidbragd') { const ev = scenario.events[round - 1]; const o = ev && (ev.responses || []).find((r) => r.key === optKey); return o ? o.label : (optKey || '—'); }
  const d = decisionsConfig.find((x) => x.id === decId); const o = d && (d.options || []).find((x) => x.key === optKey); return o ? o.label : (optKey || '—');
}

export function buildAnalytics({ history, decisions, teams, mandate, decisionsConfig, scenario, currentRound }) {
  const nameOf = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const kpiKeys = mandate.kpis.map((k) => k.key);
  const kpiLabel = Object.fromEntries(mandate.kpis.map((k) => [k.key, k.label]));

  const cur = history.filter((h) => h.round === currentRound);
  const scorecard = cur.map((h) => ({
    teamId: h.teamId, name: nameOf[h.teamId] || ('Lið ' + h.teamId), cumulative: h.cumulative,
    perKpi: kpiKeys.map((k) => { const p = (h.perKpi || []).find((x) => x.key === k); return { key: k, label: kpiLabel[k], score: p ? p.score : null }; }),
  })).sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0));

  const decCur = decisions.filter((d) => d.round === currentRound);
  const decLabelOf = Object.fromEntries(decisionsConfig.map((d) => [d.id, d.label]));
  const decIds = decisionsConfig.map((d) => d.id);
  const decisionsTable = teams.map((t) => {
    const row = decCur.find((d) => d.teamId === t.id), dec = row ? row.decisions : {};
    return { teamId: t.id, name: t.name, choices: decIds.map((id) => ({ decId: id, decLabel: decLabelOf[id], optLabel: (dec && dec[id] != null) ? optLabelFor(id, dec[id], decisionsConfig, scenario, currentRound) : '—' })) };
  });

  const rounds = [...new Set(history.map((h) => h.round))].sort((a, b) => a - b);
  const seriesFor = (valFn) => teams.map((t) => ({ teamId: t.id, name: t.name, points: rounds.map((r) => { const h = history.find((x) => x.round === r && x.teamId === t.id); return { round: r, value: h ? valFn(h) : null }; }).filter((p) => p.value != null) }));
  const trajectories = {
    cumulative: seriesFor((h) => h.cumulative),
    byKpi: Object.fromEntries(kpiKeys.map((k) => [k, { label: kpiLabel[k], series: seriesFor((h) => { const p = (h.perKpi || []).find((x) => x.key === k); return p ? p.score : null; }) }])),
  };
  return { scorecard, decisionsTable, trajectories, rounds };
}
```

- [ ] **Step 4: Keyra → stenst.** `node src/lib/leikur/analytics.test.mjs` → `… pass, 0 fail`.

- [ ] **Step 5: Commit** `git add src/lib/leikur/analytics.mjs src/lib/leikur/analytics.test.mjs && git commit -m "RÁS-Leikur S2: analytics.mjs — þver-liða greining"`

---

## Task 2: Server — `analytics` í fac-`/state`

**Files:** Modify `src/lib/leikur/server.mjs`, `src/lib/leikur/server.test.mjs`.

- [ ] **Step 1: Bæta imporri í `server.mjs`** (með chain-imporinu): `import { buildAnalytics } from './analytics.mjs';`

- [ ] **Step 2: Í `GET /state`-greininni**, á eftir að `out` er byggt og á undan `return sjson(out);`, bæta við:
```js
    // Leikstjóra-greining (aðeins fac-tákn): þver-liða skorkort/ákvarðanir/ferlar úr allri sögu.
    if (you && you.role === 'fac' && you.code === code) {
      const decRaw = (await env.TENGSL.prepare('SELECT round, team_id, decisions FROM leikur_decisions WHERE game_code=?').bind(code).all().catch(() => ({ results: [] }))).results || [];
      const history = resultsRaw.map((r) => { let d = {}; try { d = JSON.parse(r.kpis || '{}'); } catch (e) {} return { round: r.round, teamId: r.team_id, roundScore: r.round_score, cumulative: r.cumulative, perKpi: d.perKpi || [] }; });
      const decisions = decRaw.map((r) => { let dd = {}; try { dd = JSON.parse(r.decisions || '{}'); } catch (e) {} return { round: r.round, teamId: r.team_id, decisions: dd }; });
      out.analytics = history.length ? buildAnalytics({ history, decisions, teams: teamsRaw.map((t) => ({ id: t.id, name: t.name })), mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: game.current_round }) : null;
    }
```
(`resultsRaw`, `teamsRaw`, `you` eru þegar í scope í state-greininni.)

- [ ] **Step 3: Bæta prófum í `server.test.mjs`** (á eftir chain-línunum, notar `st2` = fac-state og `jn.teamToken`):
```js
  ok('fac /state hefur analytics', st2.analytics && Array.isArray(st2.analytics.scorecard) && Array.isArray(st2.analytics.trajectories.cumulative));
  ok('analytics scorecard raðað (hæsta fyrst)', st2.analytics.scorecard.length >= 2 && st2.analytics.scorecard[0].cumulative >= st2.analytics.scorecard[1].cumulative);
  const teamSt = await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + jn.teamToken } }), env));
  ok('team /state hefur EKKI analytics', !teamSt.analytics);
```

- [ ] **Step 4: Keyra.** `node src/lib/leikur/server.test.mjs` → `18 pass, 0 fail` (15 + 3). Worker dry-run:
```bash
cd web && npx wrangler deploy --dry-run --outdir /tmp/s2-build 2>&1 | grep -iE "Total Upload|error"
```
Expected: grænt (analytics.mjs bætt í bundle).

- [ ] **Step 5: Commit** `git add src/lib/leikur/server.mjs src/lib/leikur/server.test.mjs && git commit -m "RÁS-Leikur S2: fac /state skilar analytics"`

---

## Task 3: Client — `renderFacAnalytics`

**Files:** Modify `src/lib/leikur/client.mjs`.

**Interfaces:** Consumes `state.analytics = {scorecard, decisionsTable, trajectories:{cumulative, byKpi}, rounds}`.

- [ ] **Step 1: Bæta hjálpum + `renderFacAnalytics` í `client.mjs`** (module-level, nálægt `renderChain`). Kröfur:
  - **Lita-palet per lið:** `const LK_PAL = ['#6ea8fe','#f6b13b','#54d08a','#e78284','#b98cff','#5ac8e0','#f0a3c8','#a0d468'];` litur = `LK_PAL[teamIndex % 8]` (teamIndex eftir röð í `scorecard`/`teams`).
  - **`lineChart(title, series, {min,max})`** → SVG-strengur: ásar, ein lína per `series[i]` í lit `LK_PAL[i%8]`, punktar `{round,value}`. Lítið (t.d. 300×130). Y-svið úr gögnum eða `[0,100]` fyrir KPI-stig.
  - **`renderFacAnalytics(an)`** → HTML: (1) **skorkort-tafla** (`<table>`: haus = Lið + 4 KPI-heiti + Uppsafnað; röð per `scorecard`-stak; KPI-sella lituð grænt≥80/gult≥40/rautt eftir `score`); (2) **ákvarðana-tafla** (`<table>`: haus = Lið + 5 `decLabel`; röð per `decisionsTable`-stak með `optLabel`); (3) **ferla-gröf**: `lineChart('Uppsafnað stig', an.trajectories.cumulative)` + fyrir hvert KPI `lineChart(label, byKpi[k].series, {min:0,max:100})`. Lita-skýring (lið→litur).
  - Escape öll gildi. `lk-`-forskeyti stétt-nöfn.

- [ ] **Step 2: Víra í `renderFacilitator`.** Í `renderFacilitator`, á eftir `leaderboard(st)` í `root.innerHTML`-samsetningunni, bæta við:
```js
      + (st.analytics ? card('📈 Greining (leikstjóri)', renderFacAnalytics(st.analytics)) : '')
```

- [ ] **Step 3: CSS** í `web/src/pages/leikur/index.astro` `<style>`:
```css
  main[data-pg="leikur"] :global(.lk-tbl) { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0 14px; }
  main[data-pg="leikur"] :global(.lk-tbl th), main[data-pg="leikur"] :global(.lk-tbl td) { border-bottom: 1px solid rgba(255,255,255,.08); padding: 5px 8px; text-align: left; }
  main[data-pg="leikur"] :global(.lk-tbl th) { color: var(--muted, #9fb0c8); font-weight: 600; }
  main[data-pg="leikur"] :global(.lk-charts) { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  main[data-pg="leikur"] :global(.lk-charts svg) { max-width: 100%; height: auto; }
  main[data-pg="leikur"] :global(.lk-swatch) { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
```

- [ ] **Step 4: Byggja.** `cd web && npx astro build` → `Complete!`.

- [ ] **Step 5: Commit** `git add src/lib/leikur/client.mjs web/src/pages/leikur/index.astro && git commit -m "RÁS-Leikur S2: renderFacAnalytics — leikstjóra-mælaborð"`

---

## Task 4: E2E + deploy (controller)

- [ ] **Step 1:** Öll leik-próf græn (`analytics,chain,game-config,resolve,scoring,server` + engine).
- [ ] **Step 2:** Bygging + Worker dry-run græn.
- [ ] **Step 3: Deploy** `git push origin b2b-topbar:main` (samruna origin/main ef þarf). Bíða eftir Worker (poll þar til fac-`/state` skilar `analytics`).
- [ ] **Step 4: Prod-E2E.** Leikur, 2 lið, spila umferð, resolve → leikstjóra-sýn sýnir mælaborð: skorkort-tafla + ákvarðana-tafla + ferla-gröf (línur per lið); team-sýn sýnir EKKI mælaborð; engar console-villur.
- [ ] **Step 5: Minni** — S2 við [[karp-roads-hermir]] + MEMORY.md.

## Self-review

- Fullt mælaborð (scorecard+decisions+trajectories): `analytics.mjs` (T1) + `renderFacAnalytics` (T3) ✓
- Þjóns-vald, aðeins fac: server /state fac-grein (T2) + team-próf ✓
- Engin vél/frett-ras/chain breyting ✓
- Áhætta: `renderFacAnalytics`/`lineChart` er DOM-glue → vafra-staðfest T4; #5 label-leysing háð scenario (prófað T1).
