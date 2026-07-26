# RÁS-Leikurinn — Tooltips, raunveruleiki & flavor — Hönnun

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt → áætlun → inline-smíði
**Undanfari:** Ísland 2000–2032 endurhönnun

## Markmið (samþykkt)

Öll ný stök eru DERIVED úr þeim KPI/stigum sem þegar eru í `/state` (þjóns-ófölsuð) → client reiknar til BIRTINGAR, **enginn server-breyting**.

**A · Tooltips á öllu:** `title`-hover á KPI/mælum/útkomum (merking+eining), flipum, tímalínu. Sleðar: lýsing + „→ hefur áhrif á: verðbólga↓ · húsnæði↓" úr `links.json`.

**B · 2000-stilling + raunveruleiki:** `YEAR2000_DIALS` = curated 2000-stefna sem sjálfgefin studio-staða. `REALITY` = curated árleg 2000–2032 gildi (verðbólga/atvinnuleysi/skuldir/hagvöxtur) → „Raunveruleikinn"-lína á KPI-gröfum. ⚠ Stílfært (leikmanns-braut BAU-akkeruð 2026, raun-lína söguleg → viðmiðun, ekki eftirlíking).

**C · Meiri texti:** lengri ástandslýsing per kjörtímabil + `watch` = „⚠ Hvað þarf að huga að".

**Fítusar:**
- **„Svona fór það":** niðurstöðu-skjár ber saman þín round-KPI við `REALITY` á loka-ári kjörtímabils → „þú N stigum betri/verri en raunveruleikinn" (bæði skoruð með sama umboði).
- **Fréttafyrirsagnir:** reglu-drifnar úr round-KPI (`newsHeadlines`), á niðurstöðu-skjá.
- **Fylgi + endurkjör:** `popularity(kpis)` 0–100 mælir (studio lifandi + results); við kjörtímabils-lok „Endurkjörin ✅ / Féll ❌".
- **Titlar + kort:** leikslok — `endTitle(avgComposite)` + afritanlegt niðurstöðu-kort.

## Ný hrein módúl `flavor.mjs` (baseline/links/kpis-viðföng, engin env/D1)

- `leverEffects(leverKey, baseline, links)` → `[{key,label,dir}]` (niðurstreymis-útkomur levers, dir úr net-coef; dedupe per útkoma, topp ~5 |coef|).
- `newsHeadlines(kpis)` → `string[]` (≤3, þröskuldar á verðbólgu/hagvexti/atvinnuleysi/skuldum; default „rólegt").
- `popularity(kpis)` → 0–100 heiltala (verðbólgu-frávik − / atvinnuleysi − / hagvöxtur +; clamp).
- `endTitle(avgComposite)` → `{title, blurb}` (5 þrep: ≥85 „🏆 Efnahags-undrið" … <40 „💥 Hrun-stjórnin").

## `game-config.mjs` viðbætur

- `export const YEAR2000_DIALS` = curated map (~10 lyklar; t.d. `vextir:11`, `veidigjald:0`, `kolefnisgjald:0`, `ferdamannagjald:0`, `orkuskipti:0`, `vedhlutfall:~65`). Aðrir → base.
- `export const REALITY = { verdbolga:[33], atvinnuleysi:[33], skuldir:[33], hagvoxtur:[33] }` (2000–2032, best-effort söguleg).
- Ríkari `text` á SCENARIO-atburðum + nýtt `watch`-svið per atburði.

## `client.mjs`

- Import `leverEffects, newsHeadlines, popularity, endTitle` úr `flavor.mjs`; `REALITY, YEAR2000_DIALS` úr game-config.
- **initDials** (studio): `{ ...defaultDials, ...YEAR2000_DIALS }` (klippt í min/max).
- **stChart**: nýtt `reality`-viðfang → þriðja línan (fjólublá) yfir ár-ásinn.
- **drawStudioPreview**: raun-lína á 4 KPI-gröf (`REALITY[k].slice(0, n)`); **fylgis-mælir** (`popularity(kpiVals)`); tooltips (`title`) á mælum/útkomum.
- **renderStudio**: sleða `title` = lýsing + `leverEffects`; flipa/term `title`; `watch`-borði í term-haus.
- **renderTeamResults**: fréttafyrirsagnir (úr `mine.detail.kpis`), „Svona fór það"-samanburður (round-KPI vs `REALITY` á loka-ári, bæði `scoreRound`), fylgi + endurkjörs-staða.
- **renderTeam ended:** `endTitle(cumulative/rounds)` + niðurstöðu-kort með „📋 Afrita"-hnappi (clipboard).
- **index.astro**: CSS f. tooltip-hint, fylgis-mæli, frétta-lista, titil-kort.

## ÓSNERT

`server/engine/resolve/scoring/chain/roles/studio/game-validate` (nema game-config gagna-viðbætur + SCENARIO-texti).

## Prófun

- `flavor.test.mjs`: leverEffects (vextir → verðbólga o.fl., dir rétt), newsHeadlines (þröskuldar), popularity (svið+clamp), endTitle (þrep).
- `game-config.test.mjs` stenst (validation-based; ný svið `watch`/gögn brjóta ekki).
- Prod-E2E: sleða-tooltip sýnir áhrif; raun-lína á gröfum; 2000-vextir sjálfgefið háir; fylgis-mælir; niðurstöðu-skjár fréttir+„svona fór það"; leikslok titill+kort; 0 console-villur.

## Fyrirvarar

- REALITY + YEAR2000_DIALS eru best-effort nálganir (stílfært), ekki nákvæm hagsaga.
- Raun-lína er viðmiðun; leikmanns-braut er BAU-akkeruð svo alger gildi geta vikið.
