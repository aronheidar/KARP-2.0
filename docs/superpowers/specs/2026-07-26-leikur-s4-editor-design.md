# RÁS-Leikurinn S4 — sviðsmynda-/umboðs-ritill — hönnunarskjal

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt hönnun, útfærist inline.
**Umfang:** Sub-project S4 (S1+S2+S3 LIVE). Stærsta S4-útgáfan (fullur atburða-ritill).

## Markmið

Leikstjóri getur samið SÉRSNIÐINN leik við stofnun: hverja umferð (titill/texti/sjokk/viðbrögð) + umboð (4 KPI-markmið) + umferðafjölda. Sérsniðið geymist í leiknum og allur leikurinn (resolve/state/analytics/debrief) notar það. Sjálfgefinn leikur helst óbreyttur valkostur.

## Ákvörðun úr brainstorm

Umfang = **fullur sviðsmynda-ritill** (semja hvern atburð). Umboð = sömu 4 líkans-KPI (`verdbolga/atvinnuleysi/skuldir/hagvoxtur`) með ritanleg markmið/bönd (ekki frjálst KPI-val í þessari útgáfu). Ákvarðanirnar 5 (sleða-vörpun) haldast fastar — aðeins scenario+mandate eru ritanleg.

## Arkitektúr (grunnur þegar til — hreinu módúlarnir taka scenario/mandate)

1. **`src/lib/leikur/game-validate.mjs` (nýtt, hreint):** `validateGameConfig({scenario, mandate, rounds}, baseline)` → `{ok, errors[]}`. Staðfestir: `rounds` 1–20; `events.length===rounds`; hver atburður titill + ≥1 viðbragð; öll sjokk-lyklar ∈ baseline.shocks; viðbragðs-`effect.lever`/`.shock` lyklar ∈ baseline; öll gildi tölur; viðbragðs-lyklar einstakir í atburði; mandate.kpis lyklar ∈ baseline.outcomes, `dir∈{target,max,min}`, `band≥0`, `zeroAt>0`, markmiðs-gildi tala.
2. **`server.mjs` (nota config leiksins):** `gameCfg(game)` → `{scenario: c.scenario||SCENARIO, mandate: c.mandate||MANDATE, rounds: c.rounds||ROUNDS}`. `create` tekur valkvæðan `{scenario,mandate,rounds}`-body → `validateGameConfig` (hafna 400+errors ef ógilt) → geymir í `config`. `state`/`control(resolve,next)`/`analytics` nota `gameCfg(game)` í stað fastanna `SCENARIO/MANDATE/ROUNDS`. `state` skilar `mandate` (og event úr) leiksins.
3. **`client.mjs`-ritill (create-flæði):** „Búa til sérsniðinn leik" → ritils-sýn forfyllt úr sjálfgefnu (djúp-afrit), ritanleg: **Umboð** (4 KPI: markmiðs-gildi + band) + **Umferðir** (bæta/eyða; hver: titill, texti, EITT sjokk [fellilisti gildra sjokk-lykla „ekkert"+ gildi], viðbrögð-listi [heiti + effect: EINN lever/shock fellilisti + gildi, bæta/eyða]). Fellilistar úr build-time `#leikur-model`-blobbi (levers/shocks/outcomes {key,label} bökuð í `index.astro`). Submit → safna `config` → `POST /create` → við villu birta `errors`; við árangur redirect á leikstjóra-sýn.

## Gagnalíkan

Leikur-`config` (sérsniðið): `{ custom:true, rounds:N, scenario:{id:'custom', events:[{round,title,text,shocks:{shockKey:val},responses:[{key,label,effect:{lever?:{k:v}}|{shock?:{k:v}}}]}]}, mandate:{kpis:[{key,label,dir,target?|max?|min?,band,zeroAt,weight}], crisis, crisisFactor} }`. Sjálfgefinn: `{rounds:ROUNDS, scenarioId:SCENARIO.id}` (óbreytt).

## Endurnýting

`resolve`/`scoring`/`analytics`/`chain` taka nú þegar scenario/mandate/kpiKeys → engin breyting á þeim. `DECISIONS` (5 ákvarðanir) fast. Vél/`frett-ras`/`render-ras-box`/`hermir.astro` ósnert. Ritills-form notar `lk-`-stíl.

## Villumeðferð

- Ógilt config við create → 400 `{error:'invalid', errors:[…]}`; client birtir lista.
- Eldri leikir án `custom` → `gameCfg` fellur á sjálfgefið (afturvirkt).
- Ritill forfylltur úr sjálfgefnu svo alltaf gilt upphaf; validering bæði client-hlið (mjúk) og server-hlið (hörð).

## Prófstefna

- **`game-validate.mjs`**: sjálfgefið (SCENARIO+MANDATE+ROUNDS) → `ok:true`; ógilt sjokk-lykill → error; `events.length≠rounds` → error; vantar viðbragð → error; ógild KPI-útkoma → error; `rounds` út fyrir 1–20 → error; gilt sérsniðið dæmi → ok.
- **`server.test.mjs` viðbót:** `create` með gildu custom-config → 200 + code; resolve/state nota custom scenario (t.d. custom event-titill birtist í `state.event.title`) + custom mandate; `create` með ógildu → 400 `errors`.
- **Vafra-staðfesting (prod eftir deploy):** opna ritil, breyta umboði + atburði, búa til leik → leikur notar sérsniðið (event-titill/mandate); grunnleikur virkar áfram; engar console-villur.
- Vél + öll fyrri leik-próf óbreytt-græn.

## Umfang (og utan)

**Inni:** `game-validate.mjs`+próf; `server.mjs` create+gameCfg+neytendur; `client.mjs` ritill + `#leikur-model` blob í `index.astro`.
**Utan (vegvísir):** frjálst KPI-val; margar sjokk per umferð; vista/deila sviðsmynda-sniðmát; S5 leynileg umboð; S6 áhorfenda-sýn.

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`; deploy `git push origin b2b-topbar:main`.
- Vél/`frett-ras`/`render-ras-box`/`chain.mjs`/`analytics.mjs`/`hermir.astro` ósnert; `resolve`/`scoring` ósnert (taka scenario/mandate).
- `game-validate.mjs` hreint (engin env/D1/vél).
- Validering BÆÐI client (mjúk) OG server (hörð) — server er lokaorðið.
- Prófkeyrsla `node <skrá>`; JSON með readFileSync; sannreyna í vafra (prod eftir deploy).
- Commit-endir: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
