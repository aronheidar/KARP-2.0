# RÁS-Leikurinn S2 — leikstjóra-greiningarmælaborð — hönnunarskjal

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt hönnun, útfærist inline.
**Umfang:** Sub-project S2 af RÁS-Leiknum (S1+S3 LIVE).

## Markmið

Leikstjóri fær **greiningarmælaborð** (þver-liða) til að drífa umræðuna milli umferða: skorkort-tafla (hver stendur hvar núna), ákvarðana-tafla (hvað hvert lið valdi þessa umferð), og ferla-gröf (uppsafnað stig + hvert KPI yfir umferðir, ein lína per lið). Aðeins leikstjóri sér það; liðs-upplifun óbreytt.

## Ákvörðun úr brainstorm

Form = **fullt mælaborð**: skorkort-tafla + ákvarðanir þessarar umferðar + ferla-gröf yfir umferðir.

## Arkitektúr (þjóns-vald, þunn client — sami og S1/S3)

1. **`src/lib/leikur/analytics.mjs` (nýtt, hreint):** `buildAnalytics({history, decisions, teams, mandate, decisionsConfig, scenario, currentRound})` → `{scorecard, decisionsTable, trajectories}`.
   - `scorecard`: fyrir `currentRound`, `[{teamId,name,cumulative,perKpi:[{key,label,score}]}]`, raðað eftir `cumulative` fallandi.
   - `decisionsTable`: fyrir `currentRound`, `[{teamId,name,choices:[{decId,decLabel,optLabel}]}]` (optLabel leyst úr `decisionsConfig`; #5 `vidbragd` úr `scenario.events[round-1].responses`).
   - `trajectories`: `{ cumulative:[{teamId,name,points:[{round,value}]}], byKpi:{ <kpiKey>:{label,series:[{teamId,name,points:[{round,value:score}]}]} } }`.
2. **`server.mjs` (/state, fac-grein):** þegar `you.role==='fac'`, sækja ALLA `leikur_results` + `leikur_decisions`, byggja hrein `history`/`decisions` fylki, kalla `buildAnalytics` → `out.analytics`. Lið-tákn fá EKKI `analytics`.
3. **`client.mjs`:** `renderFacAnalytics(analytics)` → skorkort-tafla + ákvarðana-matrix + þétt SVG-línurit (lítill line-chart teiknari; lit per lið). Vírað í `renderFacilitator` þegar `analytics` er til.

## Gagnalag

`history`-stak (þjónn byggir úr `leikur_results`): `{round, teamId, roundScore, cumulative, perKpi:<detail.perKpi>}`. `decisions`-stak (úr `leikur_decisions`): `{round, teamId, decisions:{decId:optKey}}`. Payload lítill (lið × umferðir × 4 KPI).

## Endurnýting & stíll

Valens-litir stiga í skorkorti (grænt ≥80 / gult ≥40 / rautt) eins og liðs-skorkort. Ferla-gröf: lit-lína per lið úr fastri paletti (`#6ea8fe,#f6b13b,#54d08a,#e78284,#b98cff,#5ac8e0,...`). `chain.mjs`/`frett-ras`/vél/hermir ósnert.

## Villumeðferð

- Engin leyst umferð → `analytics` er `null`/tómt → client sýnir ekki mælaborð (aðeins grunn leikstjóra-stýring).
- Lið sem sendi ekki ákvörðun umferðar → `decisionsTable` sýnir „—" fyrir þau.
- 1 umferð leyst → ferla-gröf sýna einn punkt per lið (enn gilt).

## Prófstefna

- **Einingapróf `analytics.mjs`** (node, `ok()`): fixture history/decisions/teams → `scorecard` raðað eftir cumulative; `decisionsTable` optLabel leyst rétt (#1-4 úr config, #5 úr scenario); `trajectories.cumulative` hefur punkt per umferð per lið; `byKpi` hefur línu per KPI; tómt/1-umferð tilfelli.
- **`server.test.mjs` viðbót:** fac-`/state` eftir resolve hefur `analytics` með `scorecard`+`trajectories`; team-`/state` hefur EKKI `analytics`.
- **Vafra-staðfesting (prod eftir deploy):** leikstjóri sér mælaborð eftir resolve — tafla + ákvarðanir + línurit; engar console-villur.
- Vél + öll fyrri leik-próf óbreytt-græn.

## Umfang (og utan)

**Inni:** `analytics.mjs`+próf, `server.mjs` /state fac-analytics, `client.mjs` `renderFacAnalytics`.
**Utan (vegvísir):** S4 sviðsmynda-ritill, S5 leynileg umboð, S6 áhorfenda-sýn.

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`; deploy `git push origin b2b-topbar:main`.
- Vél/`frett-ras`/`render-ras-box`/`chain.mjs`/`hermir.astro` ósnert.
- `analytics.mjs` hreint (engin env/D1/vél/fetch).
- Analytics reiknað ÞJÓNS-MEGIN (aðeins fac-tákn); client teiknar.
- Prófkeyrsla `node <skrá>`; JSON með readFileSync; sannreyna í vafra.
- Commit-endir: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
