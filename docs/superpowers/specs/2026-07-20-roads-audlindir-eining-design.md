# Hönnun: ROADS Íslands — Auðlinda-eining (module 5, síðasta grunn-módúl)

Dags: 2026-07-20 · Byggir á: ROADS v0 + module 2–4, öll LIVE á /hermir/ (stjórnborð)

## Markmið

Fimmta og síðasta grunn-módúlið: **auðlindir** — kvóti (aflamark) og orka/stóriðja → útflutningur,
hagvöxtur og CO₂-losun, með grænum stefnu-lever (kolefnisgjald). Áfram hrein gögn: 0 breyting á vél/UI.

## Meginregla (fimmta sinni): *módel = gögn*

**Engin breyting á `src/lib/roads/engine.mjs`, `web/src/pages/hermir.astro` né
`skriptur/verify_roads_model.mjs`.** Aðeins útvíkka `skriptur/build_roads.mjs` + regen
`gogn/roads/*.json`. Stjórnborðið teiknar 13 kort + nýja sleða + sviðsmyndir sjálfkrafa.

## Nýjar vogarstangir (3)

- **`kvoti`** — aflamark, % breyting. `{base:0,min:-30,max:20,step:5,unit:'%',label:'Aflamark (frávik)'}`.
- **`orka`** — orkuframboð til stóriðju / ný virkjun, % breyting. `{base:0,min:-15,max:30,step:5,unit:'%',label:'Orka til stóriðju (frávik)'}`.
- **`kolefnisgjald`** — kolefnisgjald, % frávik. `{base:0,min:-50,max:100,step:10,unit:'%',label:'Kolefnisgjald (frávik)'}`.

## Nýjar útkomur (aftast → 12., 13. kort; röð óröskuð)

- **`utflutningur`** — útflutningsvöxtur, %. BAU glide(2, 2.5) (hófstilltur útflutnings-vöxtur, sbr.
  `vidskipti`). `clamp:[-15,20]`.
- **`losun`** — CO₂-losun, **vísitala base 100**. BAU glide(100, 100) (levers=base → engin frávik).
  `clamp:[40,200]`.

## Ný tengsl (6, hvert `source`+`ci`, öll lag≥1)

| id | frá → til | coef | lag | unit | ci | heimild |
|---|---|---|---|---|---|---|
| kvoti_exp | kvoti → utflutningur | 0.20 | 2 | %/% | [0.10,0.32] | Sjávarafurðir ~stór hluti útflutnings (Hagstofa) |
| orka_exp | orka → utflutningur | 0.25 | 2 | %/% | [0.12,0.40] | Ál/stóriðja útflutningur (79,9% orku) |
| exp_gdp2 | utflutningur → hagvoxtur | 0.10 | 1 | pp/% | [0.04,0.18] | Útflutningur drífur VLF |
| orka_emis | orka → losun | 0.30 | 1 | vísit/% | [0.15,0.50] | Stóriðju-orkunotkun → losun |
| carb_emis | kolefnisgjald → losun | -0.15 | 2 | vísit/% | [-0.30,-0.05] | Kolefnisgjald → minni losun |
| carb_gdp | kolefnisgjald → hagvoxtur | -0.02 | 1 | pp/% | [-0.05,-0.005] | Kostnaðar-drag grænna skatta |

**Forðast tvítalningu:** `utflutningur` er drifinn AÐEINS af kvóta/orku (auðlinda-útflutningur).
`gengi→hagvoxtur` (fx_gdp) og `ferdamenn→hagvoxtur` (tour_gdp) haldast BEIN og óbreytt — engin ný
`gengi→utflutningur` keðja (annars tvítalning á gjaldeyris-áhrifum). `utflutningur→hagvoxtur` er
nýi auðlinda-útflutnings-vegurinn, aðgreindur frá ferðaþjónustu og gengi.

## Nýjar sviðsmyndir (3)

- **„Kvótaskerðing (−20%)"** `{kvoti:-20}` → lægri útflutningur, lítið hagvaxtar-drag.
- **„Ný stóriðja (orka +15%)"** `{orka:15}` → hærri útflutningur + hærri losun.
- **„Grænir skattar (kolefnisgjald +50%)"** `{kolefnisgjald:50}` → lægri losun, lítið hagvaxtar-drag.

→ **13 útkomur, 45 tengsl, 17 sviðsmyndir, 14 sleðar (9 levers + 5 shocks).**

## Það sem breytist

- **Modify `skriptur/build_roads.mjs`** — 3 levers, 2 outcomes, 6 tengsl, 3 sviðsmyndir + regen.
- **Modify `skriptur/backtest_roads.mjs`** — auðlinda-áttir.
- **Óbreytt:** `engine.mjs`, `verify_roads_model.mjs`, `hermir.astro`, `Layout.astro`.

## Prófun

- `build_roads` → 13 útkomur, 45 tengsl, 17 sviðsmyndir. `verify` heilbrigt. `backtest` allar áttir
  (öll 5 módúl) + bönd. `engine.test` 11/11.
- `astro build` + headless: `/hermir/` = **13 kort** (…+útflutningur+losun) + `kvoti`/`orka`/`kolefnisgjald`
  sleðar (14 alls) + 3 nýjar sviðsmyndir; réttar áttir (+kvóti→útflutningur↑; +orka→útflutningur↑+losun↑;
  +kolefnisgjald→losun↓). Stjórnborðs-uppröðun óbreytt (gagna-drifin).

## Áhætta / heiðarleiki

- **Útflutningur/losun stílfærð vísi-gildi** — ekki nákvæm útflutnings- eða losunar-bókhald.
- **Engin tvítalning** — útflutningur einangraður frá gengi/ferðamönnum (skjalfest í tengslum).
- Kolefnisgjald-lever er stílfært stefnu-verkfæri, ekki nákvæm losunar-teygni.
- Sömu almennu fyrirvarar (Lucas, kvörðunar-óvissa, „ekki opinber spá").

## Framtíð (utan grunn-módúla)

Langtíma-hamur (lengri sjóndeildarhringur f. lýðfræði/loftslag/lífeyri); deila/vista sviðsmynd í
URL-state; útflutningur sviðsmyndar í frétt/mynd; svæðis-vídd (module-yfir-svæði).
