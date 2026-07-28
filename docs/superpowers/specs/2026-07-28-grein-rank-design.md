# Þitt-félag-vs-grein (grein-rank) v1 — hönnunarskjal

**Dagsetning:** 2026-07-28
**Staða:** samþykkt hönnun (Aron), bíður spec-yfirferðar → útfærsluáætlun.
**Fast-follow á:** `2026-07-27-atvinnugreinar-design.md` §8 (þitt-félag-vs-grein).

## 1. Markmið

Tengja fyrirtækjaprófílinn við nýju atvinnugreina-síðurnar og bæta röðun félagsins í grein sinni. Auðgar **F2-kassann sem er þegar til** („🏭 Samanburður við atvinnugrein", `fsWireSector` í `web/src/pages/fyrirtaeki.astro`) — byggir EKKI nýjan.

## 2. Nústaða (staðfest í kóða)

`fsWireSector(f)` (fyrirtaeki.astro ~L1406, kveikt L1658 í raun-skýrslu + L1897 sýnishorni) ber nú þegar saman **6 kennitölur** félagsins (framlegð, hagnaðarhlutfall, eiginfjárhlutfall, eignavelta, tekjur/starfsm., D/E) við greinar-viðmið úr `sector_kpi.json` (lengsta-forskeyti-match á `f.isat[0]`), með súlum + greinar-tikk + grænt/rautt + tooltip + fyrirvara; fæðir líka lánshæfismatið (`fsLhSectorFactor`). Kennitölur félagsins koma úr `f.fjarhagur[0]._kpi` (`fsMapArs` úr scrapuðum ársreikningi; hefur framlegd, ebit_hlutfall=rekstrarhlutf, hagnadarhlutfall, eiginfjarhlutfall, eignavelta, skuldahlutfall_DE).

**Vantar:** (a) enginn hlekkur á `/atvinnugreinar/<slug>/`; (b) engin röðun félagsins í grein; (c) EBIT-hlutfall og hagkerfis-grunnlína ekki sýnd (gögn samt til fyrir EBIT).

## 3. Arkitektúr — 3 lög

### 3.1 Hrein rökvél — `web/src/lib/atvinnugrein.mjs` (viðbót, prófuð)

`export function sectorForIsat(sectors, isatKóði)` → greinin sem á ÍSAT-kóða félagsins, eða `null`.
- `sectors` = úttak `sectorsFromMap(map)` (`[{slug,label,kpi,isats,excl}]`).
- `digits = String(isatKóði).replace(/\D/g,'')`. Finn lengsta `c ∈ s.isats` þannig að `digits.startsWith(c)`; **virði útilokun**: ef eitthvað `e ∈ s.excl` með `digits.startsWith(e)` → sú grein á EKKI félagið (sleppt). Lengsta-forskeyti vinnur; `null` ef ekkert.
- Dæmi: `10.20.0`→sjávarútvegur (um `'102'`), `10.11.0`→matvælaframl. (um `'10'`, ekki útilokað), `99.99`→`null`.

### 3.2 Worker — `greinRankHandler` → `GET /api/grein-rank?kt=` (OPINN, engin gátt)

Speglar publicness Topplistanna (raðaðir listar þegar opnir). Skref:
1. `kt` validerað (`/^\d{6,10}$/` eða hreinsað í tölustafi). `!env.TENGSL` → `{ok:false,error:'unconfigured'}`.
2. `SELECT isat_primary FROM felog WHERE kt=?` → `sectorForIsat(sectorsFromMap(sector_kpi.map), isat_primary)` (`augGet('sector_kpi.json')`). Engin grein → `{ok:true, kt, slug:null, label:null, rank:null, total:null}`.
3. Sía greinarinnar byggð **eins og `atvinnugreinHandler`** (isatClause úr `sec.isats`, `AND NOT` úr `sec.excl`, kóðar bundnir `?`, aðeins `c.length` heiltala í streng).
4. **Dedup nýjasta ár per kt** (eins og `roadsSectorsHandler`, ANNARS tvítelur fjölár): undirfyrirspurn `(SELECT kt, sala, MAX(ar) ar FROM fjarhagur WHERE sala IS NOT NULL GROUP BY kt) fj`.
5. Efnis-félagsins velta: `SELECT sala FROM fjarhagur WHERE kt=? AND sala IS NOT NULL ORDER BY ar DESC LIMIT 1` → `sala` (getur verið `null`).
6. Talning: `total = COUNT(*)` félaga í grein (dedup); ef `sala != null`: `higher = COUNT(*) WHERE fj.sala > ?` → `rank = higher + 1`, annars `rank=null`.
7. Skila `{ok:true, kt, slug, label, rank, total, sala}`. D1-villa `.catch` → tóm/`null` (aldrei 500). Cache 5 mín (`caches.default`, lykill per kt, `public, max-age=300` — opið).

### 3.3 Client — auðga `fsWireSector(f)` (fyrirtaeki.astro)

- **Röð-lína** efst í kassanum: „Þitt félag: **#{rank} stærst af {total}** í greininni (velta)" úr `fetch('/api/grein-rank?kt='+f.kt)`. Sleppt ef `rank==null`.
- **Hlekkur:** „→ Sjá alla greinina (félög + samþjöppun)" á `/atvinnugreinar/{slug}/` (slug úr svarinu). Fallback: ef svar bregst/`slug==null` → `import { slugify } from '../lib/atvinnugrein.mjs'` á `S.label`; ef enn ekkert → hub `/atvinnugreinar/`.
- **EBIT-hlutfall** bætt í `defs`: `['EBIT-hlutfall', k.rekstrarhlutf, S.ebit_hlutfall, fsPct1, true]` (hærra=betra). → 7 kennitölur.
- **Hagkerfis-grunnlína** (létt): muted „hagkerfi {fmt(H[key])}" per röð úr `sec.heild` (aukasamhengi, ekki súla).
- Allt niðurbrjótanlegt: bregðist rank-fetch → súlur + kennitölur + (fallback) hlekkur standa. `escF()` á öllu.

## 4. Gögn & villumeðferð

- `felog.isat_primary` = ÍSAT-kóði; `fjarhagur(kt, ar, sala, …)` fjölær. `sector_kpi.json` = `map`+`heild` (til, `build_sector.mjs`).
- Félag án ÍSAT/greinar → engin röð/hlekkur (kassinn stendur). Félag án `fjarhagur.sala` → `rank:null` (F2-kassinn birtist ekki hvort eð er, `!f.fjarhagur.length` guard).
- Endapunktur alltaf HTTP 200 + `{ok:…}` (`_ajson`); D1 `.catch`.

## 5. Gating & persónuvernd

Opinn endapunktur. Skilar aðeins **stöðu + fjölda + eigin veltu efnis-félagsins** (öll úr opinberum ársreikningum) — engar fjárhæðir annarra félaga, samræmt Topplistunum sem eru þegar í loft. Djúp-taflan (nágranna-röðun + HHI + PDF) er áfram Fyrirtæki+ á `/atvinnugreinar/<slug>/` (upsölu-markmið hlekksins). Engin ný PII, engin leyfisskylda. Fyrirvari F2-kassans stendur.

## 6. Prófun (grænt hlið)

- `node --test web/src/lib/atvinnugrein.test.mjs`: `sectorForIsat` (lengsta-forskeyti, „án X"-útilokun, `null` fyrir óþekkt) — bætt við 39-próf settið.
- `node --check web/worker.js` (á committuðu blob-i ef hunk-stagað).
- `cd web && npx astro build` (~3647, engar nýjar síður).
- Live: `/api/grein-rank?kt=<þekkt>` → `{ok:true, rank, total, slug}` óinnskráð (opinn); prófíll með ársreikning sýnir röð-línu + hlekk.

## 7. Utan v1 (fast-follows)

Launahlutfall (8. kennitalan — laun fólgin í `rekstrargjold` þáttarans; þarf `parse_arsreikningur`-breytingu). Röðun eftir hagnaði/eignum. Percentile í stað raðar. Refactor: deila SQL-síunni (`greinSqlFilter`) milli `atvinnugreinHandler` + `greinRankHandler`.

## 8. Skrár

- **Breytt:** `web/src/lib/atvinnugrein.mjs` (+`sectorForIsat`), `web/src/lib/atvinnugrein.test.mjs` (+próf), `web/worker.js` (`greinRankHandler` + route `/api/grein-rank`), `web/src/pages/fyrirtaeki.astro` (`fsWireSector` auðgun).
- ⚠ Samhliða-session breytir `web/worker.js` → **hunk-stöguð git-add** (aldrei `git add web/worker.js`/`-A`); aðrar skrár berur `git add <slóð>`.
