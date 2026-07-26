# RÁS-Leikurinn — „Stjórnstöð" (rík þátttakenda-sýn) — Hönnun

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt hönnun → áætlun → inline-smíði
**Undanfari:** S1–S5 (kjarni, debrief, mælaborð, ritill, hlutverk)

## Markmið

Fjórar samtvinnaðar endurbætur, afhentar í einni lotu:
- **A — Læsa-ákvörðun sýnileiki** (villa: „ekkert gerist"). Skýr læst-staða + hver bíður.
- **B — Leikstjóri stöðvar leik + byrjar nýjan.**
- **C — Rík þátttakenda-sýn („Stjórnstöð"):** sleðar + lifandi útkomu-gröf + miklu meiri gögn, eins og upphaflegi hermirinn. Þátttakandi sér STRAX áhrif þess að færa sleða.
- **D — Flipar eftir stefnu-sviði** (6 hópar úr `baseline.levers.group`).

## Meginval (staðfest við brainstorm)

- **Ákvörðunar-yfirborð = fullur hermir innfelldur:** sleða-stilling per umferð er ákvörðunin (ekki 5 kubbar).
- **Flipar eftir áherslu-sviði** (eins og hermir-stjórnklefinn).
- **Allt í einni lotu.**

## Hönnunar-meginregla: opt-in hamur, kjarni varðveittur

Nýtt `mode`-svið á leik: `'studio'` (fullur hermir) vs `'classic'` (5 kubbar, S1–S5). **Þjóns-sjálfgefið `classic`** (bakvarðar-samhæfi → öll S1–S5 próf standa). **UI-sjálfgefið `studio`** (gátreitur pre-hakaður) → nýir leikir gerðir gegnum vef verða studio. Studio samsett við roles (S5, óháð umboð) og sérsniðnar sviðsmyndir (S4, atburðir/sjokk).

## C1 — Studio ákvörðunar-líkan

**Ákvörðun umferðar (studio) = `{ levers: { <leverKey>: <algert gildi>, ... } }`** (geymt sem JSON, eins og áður). Sleðar bera á milli umferða: sjálfgefið gildi hverrar umferðar = síðasta læsta gildi (annars `baseline.base`).

### `resolve.mjs` — studio-grein (viðbót, klassík óbreytt)
`resolveTeam({ baseline, links, history, scenario, mode })` og `buildInputs(...)` fá `mode`-viðfang (sjálfg. `'classic'`). Ný `buildInputsStudio(history, {baseline, scenario})`:
- `running = {}` (sleði → gildi; óskráð = `base`).
- Fyrir hverja umferð `r` (fjórðungar `q0..q1`):
  - Ef `set.levers`: `running[k] = clamp(+v, min, max)` fyrir hvern k.
  - Fyrir hvern `k` í `running`: skrifa `running[k]` í `levers[k].value[q0..q1]` (carry-forward yfir umferðir).
  - Sviðsmynd: `scenario.events[r].shocks` → `shocks[k].value[q0..q1]` (eins og classic).
- Skilar `{ levers, shocks, quarters }` — sama form og classic → `simulate` óbreytt.

Discrete-viðbrögð (#5) FALLA niður í studio (atburður sýnir sjokk+texta; þátttakandi svarar með sleðum).

### `studio.mjs` (ný hrein módúl)
Katalógur + hjálp, tekur `baseline` sem viðfang (engin env/D1):
- `studioCatalog(baseline)` → `{ tabs: [{ group, levers: [{key,label,min,max,base,step,unit}] }], outcomes: [{key,label,unit,polarity}] }` (flokkað eftir `lever.group`, röð varðveitt).
- `defaultDials(baseline)` → `{ [k]: base }`.
- `changedLevers(dials, baseline)` → `[{key,label,from,to}]` (til S2-samantektar/UI).

## C2 — Lifandi forskoðun (client-megin)

Þátttakandi-client keyrir **sömu vél** á EIGIN drög: `import { simulate } from roads/engine`, `resolveTeam`/`buildInputsStudio` úr `resolve.mjs`, `BASELINE`+`LINKS` beint (Vite-bundlar, eins og hermir). 
- Forskoðunar-saga = `[...eigin læstar umferðir 1..r-1, drög umferðar r]`.
- Þarf sjokk fyrri umferða → `/state` sendir `scenarioSoFar` (atburðir 1..núverandi, sem liðið HEFUR SÉÐ; framtíð hulin).
- Keyrir `simulate` → `outcomes[k].mid[]` → teiknar gröf (mandate-KPI áberandi + valens-litir + markmiðs-línur + BAU `outcome.path`), uppfært við hverja sleða-hreyfingu (létt debounce).
- **Blind commit haldið:** forskoðun aðeins á eigin gögnum → ekkert lekur; þjónn endur-reiknar ófölsuð stig.

## C3 / D — Client „Stjórnstöð" (studio decide-sýn)

- **Flipa-röð** (6 úr `studioCatalog`): Peningastefna & varúð · Ríkisfjármál & skattar · Húsnæði · Vinnumarkaður & mannauður · Auðlindir/orka/loftslag · Byggð & ferðaþjónusta.
- **Virkur flipi:** sleðar sviðsins (label, `<input type=range>` min/max/step, gildi+unit, base-merki, „núll" = base).
- **Gagna-spjald (alltaf sýnilegt):** lifandi línurit 4 mandate-KPI (markmiðs-línur + valens) + talna-grind lykil-útkoma (núgildi vs BAU, lokafjórðungur).
- **Atburðar-spjald:** titill/texti/sjokk umferðar.
- **Umboðs-spjald:** mandate (með S5 ×N vigt ef roles).
- Sleða-hreyfing → `S.dials[k]=v` → endurkeyra forskoðun → endurteikna.

## A — Læsa-ákvörðun sýnileiki

- **`/state`:** bætir `you.locked` (þessa liðs, núverandi umferð) + `lockRoster` (fyrir fac: `[{teamId,name,locked}]`). Studio: `you.history` (eigin læstar ákvarðanir 1..r-1) fyrir carry-forward+forskoðun.
- **Client (lið):** eftir læsingu → áberandi „✅ Ákvörðunum læst — bíð eftir öðrum liðum / leikstjóra" + „✏️ Breyta" (opnar stjórnstöð aftur, aflæsir fram að resolve). Læsa-hnappur stór/áberandi.
- **Client (fac):** „N/M lið tilbúin" úr `lockRoster`.
- Leysir „ekkert gerist"-villuna (nú skilar `/state` ekki eigin læsingu → engin sjónræn breyting).

## B — Leikstjóri stöðvar + byrjar nýjan

- **`control 'stop'`** (fac-tákn): setur `phase='ended'` óháð fasa. 
- **Fac-UI:** „⏹️ Stöðva leik" í decide/resolved; eftir ended „🔄 Nýr leikur" → `/leikur/` (stofna nýjan).
- **Lið:** sjá „🏁 Leik lokið" (+ rolesReveal ef S5).

## S2 — ákvarðana-tafla í studio

`analytics.buildAnalytics` fær `mode` + `leverLabels`. Studio-grein: fyrir hvert lið, núverandi-umferðar `decision.levers` → samantekt „breyttir sleðar" (efstu N eftir stærð breytingar frá base: „Vextir 8,5 · Útgjöld 1.400 …"). Classic-grein óbreytt. `analytics.mjs` viðbót additive → S2-próf standa.

## Skrár

- **Create:** `src/lib/leikur/studio.mjs`, `src/lib/leikur/studio.test.mjs`
- **Modify:** `resolve.mjs` (+studio-grein, +próf í `resolve.test.mjs`), `server.mjs` (mode, stop, /state viðbætur, studio resolve, analytics-args) + `server.test.mjs`, `client.mjs` (stjórnstöð+sleðar+gröf+læsa-UI+fac stop/roster; IMPORT BASELINE+LINKS+engine+resolve+studioCatalog), `web/src/pages/leikur/index.astro` (AÐEINS CSS), `analytics.mjs` (+studio-samantekt) + `analytics.test.mjs`
- **ÓSNERT:** `engine.mjs`, `scoring.mjs`, `chain.mjs`, `game-config.mjs`, `roles.mjs`, `game-validate.mjs`

## Model-gögn í client (ekki blob)

`@gogn`/`@lib` eru altækir Vite-alias (hermirinn importar þegar `baseline`+`links` client-megin). Því importar `client.mjs` `BASELINE`+`LINKS` beint og leiðir sleða/flipa-META úr `studioCatalog(BASELINE)` — **engin MODEL-blob-viðbót** (S4-blobbið stendur óbreytt fyrir ritilinn). `index.astro` fær aðeins CSS. Bundle vex um ~engine+baseline(30KB)+links(65KB) (hashed chunk, cached) — í lagi fyrir síðu sem þarf hermun.

## Prófun

- **`studio.test.mjs`:** catalog-tabs ∈ baseline groups; öll lever-meta heil; `defaultDials`=base; `changedLevers` réttur diff.
- **`resolve.test.mjs` (+studio):** studio-saga `[{levers:{vextir:9}}]` → hærri vextir → væntanleg KPI-átt (t.d. verðbólga↓ vs base); carry-forward (umferð 2 án breytinga heldur umferð-1 gildi); clamp út fyrir min/max.
- **`server.test.mjs` (+studio/lock/stop):** studio-leik create (`mode:'studio'`) → decisions `{levers}` → resolve skorar; `you.locked` rétt eftir læsingu; `lockRoster` fyrir fac; `control 'stop'` → ended; classic óbreytt.
- **`analytics.test.mjs` (+studio):** studio decisionsTable sýnir breytta-sleða-samantekt.
- **Prod-E2E:** studio-leik af lendingu (gátreitur á) → stjórnstöð með flipum+sleðum+lifandi gröfum; sleða-hreyfing breytir gröfum; læsa sýnir stöðu + „breyta"; leikstjóri „N/M tilbúin" + stöðva+nýr leikur; 0 console-villur. Classic-leikur virkar áfram.

## Þekkt takmörk / fyrirvarar

- Studio-forskoðun endurspeglar EIGIN feril liðsins; endanleg stig frá þjóni (getur vikið ef önnur lið deila sviðsmynd — en sviðsmynd/sjokk eru sömu fyrir öll, svo eigin-ferill = þjóns-ferill fyrir það lið).
- 32 sleðar × 6 flipar = mikið undir tímapressu; sjálfgefið carry-forward + fáir lykil-sleðar per flipi draga úr álagi. Curated „lykil-sleðar" per flipi = mögulegt fast-follow.
- Studio-decision JSON stærra en 5-kubba (≤32 tölur) — hverfandi fyrir D1.

## Vegvísir eftir

S6 áhorfenda-sýn (frestað). Möguleg fast-follow: curated lykil-sleðar, per-flipi útkomu-val, forskoðunar-debounce fínstilling.
