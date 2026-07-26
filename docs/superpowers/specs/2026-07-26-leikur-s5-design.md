# RÁS-Leikurinn S5 — Leynileg hlutverk (secret differentiated mandates)

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt hönnun → áætlun → inline-smíði
**Undanfari:** S1 (kjarni), S3 (orsaka-debrief), S2 (leikstjóra-mælaborð), S4 (sviðsmynda-/umboðs-ritill)

## Markmið

Bæta við valfrjálsum leikjaham þar sem hvert lið fær úthlutað **leynilegu, ólíku umboði** (hlutverki) í stað eins sameiginlegs umboðs. Skapar stefnu-fjölbreytni (lið geta ekki afritað hvert annað), og í leikslok afhjúpast umboðin → sterkt kennslu-debrief („lið A var að hámarka lága verðbólgu hvað sem það kostaði, lið B hagvöxt").

## Ákvarðanir (staðfestar við brainstorm)

1. **Umboðs-fjölbreytni:** vigtir + smá markmiðs-tilbrigði. Öll hlutverk deila sömu 4 KPI; hvert leggur ×3 áherslu (vigt) á einn KPI; 2 hlutverk fá að auki örlítið breytt markmið/band.
2. **Uppruni hlutverka:** innbyggt hlutverka-safn (4 fyrirfram skilgreind í kóða). Enginn ritill í v1.
3. **Afhjúpun:** í leikslok (`phase==='ended'`) sjá ÖLL lið hvaða umboð hvert lið hafði.

## Hönnunar-meginregla

**Composite-stig er alltaf 0–100 óháð umboði** (`scoreRound` normaliserar með vigtum) → sameiginleg stigatafla helst sanngjörn þótt umboð séu ólík; hvert lið er dæmt á eigin kúrfu. `scoreKpi` notar per-KPI spec (target/band/zeroAt) en vigtir hafa aðeins áhrif á composite. Þess vegna:

- Lið sem er skorað með eigin umboði geymir sitt eigið `perKpi` → S2-mælaborðið les vistað `perKpi` og virkar áfram óbreytt.
- Aðeins tvö hlutverk breyta markmiði (target/band) → per-KPI dálkar að mestu samanburðarhæfir; þau tvö eru dæmd á eigin þolmörk (heiðarlegt, leikstjóri sér hlutverks-merki).

## Opt-in leikjahamur

S5 er **valfrjáls**, ekki alltaf-á. Við leikstofnun velur leikstjóri „Leynileg hlutverk" (gátreitur). 

- **Af (sjálfgefið):** nákvæmlega núverandi hegðun — eitt sameiginlegt umboð, S1–S4 óbreytt.
- **Á:** `roles: true` fer í `/create`-body → `config.roles = true`. Við `start` er hlutverkum úthlutað.

## Hlutverka-módel

Hvert hlutverk:
```js
{ id, label, blurb, weights: { <kpiKey>: <weight> }, overrides?: { <kpiKey>: <partial spec> } }
```

Umboð liðs = grunn-MANDATE þar sem hver KPI fær `weight` úr `role.weights` (sjálfgefið 1) og `role.overrides[key]` brætt inn (target/band/max/min o.s.frv.). `crisis` og `crisisFactor` haldast frá grunni.

### Innbyggð hlutverk (4)

Grunn-MANDATE (til viðmiðunar): verðbólga (target 2,5 / band 1 / zeroAt 4), atvinnuleysi (max 4,5 / band 1 / zeroAt 4), skuldir (max 40 / band 5 / zeroAt 30), hagvöxtur (min 2 / band 1 / zeroAt 3), allar vigt 1.

| id | label | blurb | weights | overrides |
|---|---|---|---|---|
| `verdbolgu_haukur` | Verðbólgu-haukur | „Stöðugt verðlag umfram allt. Verðbólga við 2,5% er heilög." | `{verdbolga:3}` | — |
| `vaxtar_stjorn` | Vaxtar-stjórn | „Kraftmikill hagvöxtur skiptir mestu; við þolum örlítið meiri verðbólgu." | `{hagvoxtur:3}` | `{verdbolga:{band:2.0}}` |
| `fjarmala_vardstjori` | Ríkisfjármála-varðstjóri | „Sjálfbær ríkisfjármál. Skuldir mega ekki fara úr böndunum." | `{skuldir:3}` | `{skuldir:{max:35}}` |
| `velferdar_sinni` | Atvinnu-/velferðar-sinni | „Full atvinna og velferð. Enginn skal skilinn eftir." | `{atvinnuleysi:3}` | — |

→ 2 vigt-eingöngu + 2 með markmiðs-tilbrigði. Fleiri lið en hlutverk → round-robin vefst (tvö lið mega deila hlutverki). Færri lið → aðeins sum hlutverk notuð.

## Ný hrein módúl: `src/lib/leikur/roles.mjs`

HREINT (engin env/crypto/D1). API:

- `export const ROLES` — fylkið að ofan.
- `mandateForRole(baseMandate, role)` → nýtt mandate: `kpis` með vigtum úr `role.weights` og `role.overrides` brætt per KPI; `crisis`/`crisisFactor` frá base. Ef `role` er null/undefined → skilar base óbreyttu.
- `assignRoles(teamIdsInOrder, roles=ROLES)` → `{ [teamId]: roleId }` round-robin: `teamIds[i] → roles[i % roles.length].id`.
- `roleById(id, roles=ROLES)` → hlutverk eða null.
- `revealRoles(roleMap, roles=ROLES)` → `[{ teamId, roleId, label, blurb }]` raðað eftir teamId (til birtingar).

## Þjóns-breytingar (`server.mjs`)

Import: `ROLES, mandateForRole, assignRoles, roleById, revealRoles` úr `./roles.mjs`.

**`gameCfg(game)`** útvíkkað: skilar að auki `roles: !!c.roles` og `roleMap: c.roleMap || null` (auk núverandi scenario/mandate/rounds).

**`POST /create`:** ef `cb.roles` (líka þegar custom scenario/mandate) → `config.roles = true`. (Fyrir custom: bæta `roles: true` við geymda config-objektinu; fyrir default: `{ rounds, scenarioId, roles: true }`.)

**`control 'start'`:** ef `config.roles && !config.roleMap` → les öll lið (`SELECT id FROM leikur_teams WHERE game_code=? ORDER BY id`), `roleMap = assignRoles(ids, ROLES)`, vista uppfært config-JSON + phase/round í EINNI UPDATE. Annars óbreytt UPDATE (phase='decide', round=1).

**`resolve`-lykkja:** per lið `const tMandate = cfg.roles && cfg.roleMap ? mandateForRole(cfg.mandate, roleById(cfg.roleMap[tm.id])) : cfg.mandate;` → `scoreRound(kpis, tMandate)`. Allt annað óbreytt (chain, cumulative, geymsla).

**`GET /state` — leynd per áhorfanda:**
- **Lið-tákn í roles-leik:** `out.mandate = mandateForRole(cfg.mandate, roleById(cfg.roleMap[you.teamId]))`; `out.role = { id, label, blurb }` þess hlutverks. Sér EKKI `roleMap`. (Fyrir start / roleMap vantar → fallback base mandate, `role=null`.)
- **Fac-tákn í roles-leik:** `out.mandate = cfg.mandate` (grunnur, dálka-hausar); `out.roleMap = revealRoles(cfg.roleMap, ROLES)`; hlutverks-merki bætt á `out.analytics.scorecard` (annóterað server-megin eftir `buildAnalytics`, `analytics.mjs` ósnert).
- **Leikslok (`phase==='ended'`) í roles-leik:** `out.rolesReveal = revealRoles(cfg.roleMap, ROLES)` fyrir ALLA áhorfendur (lið + fac + nafnlaus).
- **Roles OFF:** engin ný svið, nákvæmlega núverandi svar.

## Client-breytingar (`client.mjs` + CSS í `index.astro`)

- **Gátreitur „Leynileg hlutverk":** á lendingu (fyrir default create) OG í ritli (fyrir custom create). Hvor create-leið les sinn reit og bætir `roles:true` í body.
- **Lið-sýn:** ef `state.role` → borði „🎭 Þitt umboð: ⟨label⟩ — ⟨blurb⟩"; `×N` merki við KPI þar sem vigt ≠ 1 (les úr `state.mandate.kpis[].weight`).
- **Fac-sýn:** tafla „Hlutverk liða" (lið → hlutverks-label) úr `state.roleMap`; hlutverks-dálkur á S2-skorkorti (`row.role`).
- **Lokaskjár (ended):** ef `state.rolesReveal` → hluti „🎭 Umboð afhjúpuð" með lið→hlutverk+blurb, birt öllum.
- **CSS:** `.lk-role-banner`, `.lk-kpi-w` (×N merki), `.lk-reveal` í `index.astro <style>`.

## Skrár

- **Create:** `src/lib/leikur/roles.mjs`, `src/lib/leikur/roles.test.mjs`
- **Modify:** `src/lib/leikur/server.mjs`, `src/lib/leikur/server.test.mjs`, `src/lib/leikur/client.mjs`, `web/src/pages/leikur/index.astro` (aðeins CSS)
- **ÓSNERT:** `game-config.mjs`, `resolve.mjs`, `scoring.mjs`, `chain.mjs`, `analytics.mjs`, `game-validate.mjs`, `engine.mjs`, `web/worker.js` (route þegar til staðar)

## Prófun

- **`roles.test.mjs`:** (1) allir `weights`/`overrides`-lyklar ∈ MANDATE kpi-lyklum; (2) `mandateForRole` setur rétta vigt + bræðir override (t.d. vaxtar_stjorn → verðbólgu band 2,0, hagvöxtur weight 3); (3) `mandateForRole(base, null)` = base; (4) `assignRoles` round-robin + vefst (5 lið, 4 hlutverk → lið 5 fær hlutverk 1); (5) `revealRoles` skilar label/blurb raðað.
- **`server.test.mjs` (viðbætur):** (1) roles-leik: tvö lið með SÖMU ákvarðanir → sömu kpis en **ÓLÍKUR composite** (sannar per-lið-umboð); (2) lið-tákn `/state` hefur `role` + sér EKKI `roleMap`; (3) fac-tákn `/state` hefur `roleMap`; (4) eftir að leik lýkur (`next` yfir síðustu umferð → ended) `/state` hefur `rolesReveal`; (5) klassískur leikur (roles off) → engin `role`/`roleMap`/`rolesReveal` svið (óbreytt).
- **Prod-E2E (controller):** stofna roles-leik af lendingu (gátreitur á), 2 lið, start → hvert lið sér sitt hlutverk; fac sér roleMap; leysa umferð; keyra til enda → rolesReveal birtist báðum megin; 0 console-villur. Klassískur leikur virkar áfram.

## Þekkt fyrirvari

Hlutverk hafa ólíka „erfiðleika" (áhersla á einn KPI getur skorað hærra að jafnaði en að jafna 4 andstæð markmið). Eðlislægt í földum-hlutverkum og hluti af lærdómnum; v1 sættir sig við það, jafnvægi reynt með hönnun vigtanna. Nákvæm erfiðleika-jöfnun = mögulegt fast-follow.

## Vegvísir eftir S5

S6 — áhorfenda-sýn (read-only útsending fyrir skjávarpa/áhorfendur).
