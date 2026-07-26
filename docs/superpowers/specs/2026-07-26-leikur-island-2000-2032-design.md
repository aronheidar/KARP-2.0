# RÁS-Leikurinn — „Ísland 2000–2032" endurhönnun

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt hönnun → áætlun → inline-smíði
**Undanfari:** Stjórnstöð (studio-hamur)

## Markmið (staðfest við brainstorm)

- **Yfirtöku-skjár á /leikur/** (fjarlægja nav vinstri + fréttir hægri, fullt pláss). Aðeins leikurinn.
- **Sjónræn endurhönnun:** mission-control fílingur, mörg gröf/rit sem sýna áhrif sleða, mjög skipulagt og stílhreint, nýta allt plássið.
- **Tímalíkan 2000–2032:** hver umferð = 4-ára kjörtímabil, 8 umferðir, endar 2032.
- **Söguleg sviðsmynd = sjálfgefin** (Ísland 2000–2032: útrás, 2008-hrun, COVID, verðbólga).
- **Markmið sýnileg, leið FALIN** (engin besta-stefna birt).

## W1 — Yfirtöku-skel

Nýtt `bare`-prop á `Layout.astro`: `.shell-bare { grid-template-columns: 1fr; }` + `.shell-bare .nav, .shell-bare .news { display: none; }`. Topbar helst (leið til baka). `/leikur/index.astro` → `bare={true}`; `main[data-pg="leikur"]` max-width 980→~1440px. Aðrar síður óbreyttar.

## W2 — Tímalíkan 2000–2032

Leikurinn hermir ÞEGAR 32 skref yfir 8 umferðir (`ROUNDS=8`, `QUARTERS_PER_ROUND=4`). **Endur-merkja hvert skref sem ÁR** (`YEAR_START=2000` → skref i = ár 2000+i), hverja umferð sem **4-ára kjörtímabil**. **0 breyting á hermunar-dýpt/kvörðun** (BAU 40 ≥ 32). Umferð r → ár [2000+4(r-1), 2000+4r]. Umferð 3 = 2008–2012 (hrun). Gröf: ár-ás. Umferða-haus: kjörtímabil.

`game-config.mjs`: bæta `export const YEAR_START = 2000;`. Client-hjálp: `termYears(round)` → [y0,y1].

## W3 — Söguleg sviðsmynd (sjálfgefin)

Endurskrifa `SCENARIO.events` (8, raun-sjokk úr `baseline.shocks`: olia/gengi/ferdamenn/adflutningur/frjosemi/heimshagvoxtur/hravaruverd). Hvert: `{round, title, text, shocks, responses[≥2 m/gild effect]}` (viðbrögð f. classic-samhæfi; studio hunsar). Prófunar-krafa (game-config.test): 8 atburðir, gild sjokk-lyklar, ≥2 viðbrögð með gildum effect-lyklum — rewrite stenst.

| r | Kjörtímabil | Titill | Sjokk (u.þ.b.) |
|---|---|---|---|
| 1 | 2000–2004 | Ný öld — netbóla springur | heimshagvoxtur −1 |
| 2 | 2004–2008 | Útrásin — ofþensla | adflutningur +15, gengi +8 |
| 3 | 2008–2012 | 🏦 Bankahrunið | gengi −35, heimshagvoxtur −4, hravaruverd −10 |
| 4 | 2012–2016 | Endurreisn í höftum | heimshagvoxtur +1, ferdamenn +12 |
| 5 | 2016–2020 | Ferðamannasprengjan | ferdamenn +30, gengi +6 |
| 6 | 2020–2024 | 🦠 Heimsfaraldur | ferdamenn −40, heimshagvoxtur −3 |
| 7 | 2024–2028 | Verðbólgu-bylgjan | olia +30, hravaruverd +15 |
| 8 | 2028–2032 | Framtíðin — óviss (kosningaár) | heimshagvoxtur −1, olia +5 |

## W4 — Sjónræn endurhönnun stjórnstöðvar

Fullbreiddar-rist. Íhlutir (client `renderStudio` endurskrifað):
- **Tímalínu-borði:** 8 kjörtímabil 2000▬2032, núverandi gyllt, past dimmt/✓, framtíð faint; atburða-tákn (🏦/🦠). Flexbox-hlutar.
- **Kjörtímabils-haus:** „Kjörtímabil {r} · {y0}–{y1} · {icon} {title}" + atburðar-texti + hvaða sjokk lenti.
- **Aðal-rist** (`grid-template-columns: 1fr 380px` breitt; staflað mjótt):
  - **Vinstri (gröf):** (a) **„Þjóðarhagur" heildar-mælir** — SVG hálfhringur, lifandi composite 0–100 (`scoreRound(previewKpis, mandate)`), valens-litur; (b) **4 mandate-KPI ár-ás línurit** (markmiðs-band + BAU + valens); (c) **4 markmiðs-mælar** (lárétt: núgildi vs markmið, band-litað, stig/100 per KPI); (d) **útkomu-hitakort** (36 flísar, bakgrunns-litur eftir valens vs BAU).
  - **Hægri (sticky stýringar):** flipar (6 svið) + sleðar + umboðs-spjald + stór læsa-borði.
- **stChart:** ár-ás (x-merki = ár, kjörtímabil-skil).

## W5 — Falin leið

Markmið + mælar + lifandi „Þjóðarhagur" sýna STÖÐU (áhrif vals) EN engin besta-stefna/„rétt svar"/sjálfbestun. Togstreitur líkansins gera hámörkun ólétta.

## Skrár

- **Breytt:** `web/src/layouts/Layout.astro` (bare), `web/src/pages/leikur/index.astro` (bare + breidd + ný rist-CSS), `src/lib/leikur/game-config.mjs` (YEAR_START + söguleg SCENARIO), `src/lib/leikur/client.mjs` (renderStudio endurhönnun: ribbon/haus/gauges/heildar-mælir/hitakort/ár-ás; import `scoreRound`+`YEAR_START`).
- **Próf:** `game-config.test.mjs` stenst óbreytt (validation-based) — keyra til að staðfesta.
- **ÓSNERT:** `engine/resolve/scoring/chain/roles/studio/server/analytics/game-validate` (nema SCENARIO-innihald í game-config).

## Prófun

- Öll leikur-próf græn (sérstaklega game-config eftir SCENARIO-rewrite).
- Prod-E2E: /leikur/ = yfirtöku-skjár (ekkert nav/fréttir); studio-leikur → tímalínu-borði 2000–2032, kjörtímabil-haus, hrun-atburður á umferð 3 (2008–2012); heildar-mælir + KPI-gröf (ár-ás) + markmiðs-mælar + hitakort lifandi við sleða-hreyfingu; læsa/leikstjóri/stop óbreytt; 0 console-villur.

## Þekkt takmörk

- 4 skref/kjörtímabil (1 ár/skref) er gróft en nægt f. stílfærðan kennsluleik.
- Söguleg sjokk eru stílfærð (u.þ.b. stærðir), ekki nákvæm hagsaga.
