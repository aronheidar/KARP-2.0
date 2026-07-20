# Hönnun: ROADS Íslands — Húsnæðis-eining (module 2)

Dags: 2026-07-20 · Byggir á: [ROADS v0](2026-07-20-roads-islands-v0-design.md) (LIVE á /hermir/)

## Markmið

Dýpka húsnæðis-hlið ROADS-hermisins á landsvísu: bæta við vogarstöngum (nýbygginga-framboð),
sjokki (aðflutningur) og útkomum (leiga, greiðslubyrði) svo hermirinn nái „hvernig hafa
framkvæmdir, aðflutningur, vextir og veðþak áhrif á húsnæðisverð, leigu og greiðslubyrði?"

**Umfang (valið): innlend-dýpri.** EKKI per-svæði (byMuni eru skyndimyndir, ekki fullar
raðir → veik kvörðun; krefðist svæðis-víddar í vél). Höfuðborg/landsbyggð-skipting og full
svæðis-vídd eru síðari útvíkkanir.

## Meginregla staðfest: *módel = gögn*

**Engin breyting á `src/lib/roads/engine.mjs` né `web/src/pages/hermir.astro`.** UI er
gagna-drifið (lykkjar yfir `BASELINE.levers/shocks/outcomes` → ný kort/sleðar sjálfkrafa).
Öll einingin = útvíkkun á `skriptur/build_roads.mjs` + regenereruð `gogn/roads/*.json`. Þetta
sannar arkitektúrinn: nýtt módel-svið = ný gögn, ekki nýr kóði.

## Nýjar vogarstangir / sjokk

- **`frambod`** — nýbygginga-framboð, % frávik. *Vogarstöng* (húsnæðisstefna). `{base:0, min:-20,
  max:40, step:5, unit:'%', label:'Nýbygginga-framboð (frávik)'}`. Sviðsmynda-input með birtri
  teygni (engin hrein innlend „nýjar íbúðir"-röð til → ekki röð-metið).
- **`adflutningur`** — aðflutningur, % frávik frá grunni. *Sjokk* (aðallega ytra — heiðarlegra
  en lever). `{base:0, min:-60, max:60, step:10, unit:'%', label:'Aðflutningur (frávik)'}`.
  Grunn-samhengi: `mannfjoldi.COMP.netmig` (~4.000/ár nýlega).

## Nýjar útkomur

- **`leiga`** — leiga, % breyting (12-mán). BAU-glide úr `leiga.quarters` (medM2 vöxtur) →
  hófstillt. ⚠ leigu-gögn ná til **2024F1** (~2 ára gömul) → merkt í heimild/fyrirvara.
  `unit:'%'`, `clamp:[-15,25]`.
- **`greidslubyrdi`** — greiðslubyrði húsnæðislána, **vísitala (base 100)**. Hækkar með vöxtum +
  húsnæðisverði, lækkar með kaupmætti. Vísitala er skýrust fyrir stílfært tól. `unit:''` (birt „vísit"),
  BAU flat 100 (levers=base → engin frávik), `clamp:[50,200]`.

**Útkomu-röð (mikilvægt f. feedback-reglu):** `verdbolga, hagvoxtur, atvinnuleysi, kaupmattur,
husnaedi, leiga, greidslubyrdi`. Þannig koma `leiga`/`greidslubyrdi` á EFTIR `husnaedi`/`kaupmattur`
→ útkoma→útkoma tengsl þeirra eru gild (uppspretta á undan; auk þess lag≥1).

## Ný tengsl (curated, hvert með `source` + `ci_lo`/`ci_hi`)

| id | frá → til | coef | lag | unit | ci | heimild (source) |
|---|---|---|---|---|---|---|
| fr_house | frambod → husnaedi | −0.30 | 4 | %/% | [−0.50,−0.12] | Framboðs-teygni húsnæðis (OECD/HMS) |
| mig_house | adflutningur → husnaedi | 0.06 | 2 | %/% | [0.02,0.10] | Aðflutningur → húsnæðiseftirspurn (HMS/SÍ) |
| mig_rent | adflutningur → leiga | 0.08 | 1 | %/% | [0.03,0.14] | Aðflutningur → leigueftirspurn |
| house_rent | husnaedi → leiga | 0.35 | 2 | %/% | [0.15,0.55] | Verð↔leiga samhreyfing (HMS) |
| fr_rent | frambod → leiga | −0.15 | 4 | %/% | [−0.30,−0.03] | Framboð → lægri leiga |
| r_burden | vextir → greidslubyrdi | 2.5 | 1 | vísit/pp | [1.5,3.5] | Greiðslubyrði-næmni f. vöxtum |
| house_burden | husnaedi → greidslubyrdi | 0.40 | 1 | vísit/% | [0.20,0.60] | Hærra verð → stærra lán |
| kaup_burden | kaupmattur → greidslubyrdi | −0.60 | 1 | vísit/pp | [−1.0,−0.30] | Hærri ráðstöfunartekjur → lægri byrði |
| ltv_burden | vedhlutfall → greidslubyrdi | 0.30 | 2 | vísit/pp | [0.10,0.50] | Hærra veðhlutfall → stærra lán |

Öll ný útkoma→útkoma tengsl (`house_rent`, `house_burden`, `kaup_burden`) hafa lag≥1 → standast
`verify_roads_model.mjs` (hringrás + röð + source/ci) óbreytt.

## Nýjar sviðsmyndir (frétta-hamur)

- **„Aðflutningur +50%"** — `{shocks:{adflutningur:50}}` → hærra verð/leiga.
- **„Byggingarhrina (+30% framboð)"** — `{levers:{frambod:30}}` → lægra verð/leiga.
- **„Aðflutningsstopp (−40%)"** — `{shocks:{adflutningur:-40}}` → lægri eftirspurn.
Hver með `sentence` (mannamáls) í stíl v0.

## Það sem breytist

- **Modify `skriptur/build_roads.mjs`** — bæta `frambod` (levers), `adflutningur` (shocks),
  `leiga`+`greidslubyrdi` (outcomes m/BAU+clamp, röð rétt), 9 ný tengsl, 3 nýjar sviðsmyndir.
  BAU fyrir leigu reiknað úr `leiga.quarters`; greidslubyrdi = flat 100.
- **Regen `gogn/roads/{baseline,links,scenarios}.json`** (afurð skriptsins).
- **Modify `skriptur/backtest_roads.mjs`** — bæta húsnæðis-átta-prófum: +framboð → lægra verð;
  +aðflutningur → hærra verð + hærri leiga; +vextir → hærri greiðslubyrði; bönd gild fyrir nýju útkomurnar.
- **Óbreytt:** `engine.mjs`, `verify_roads_model.mjs` (alhæfa), `hermir.astro` (gagna-drifið →
  7 kort + nýir sleðar sjálfkrafa).

## Prófun

- `node skriptur/build_roads.mjs` → 7 útkomur, ~26 tengsl, ~9 sviðsmyndir.
- `node skriptur/verify_roads_model.mjs` → heilbrigt (óbreyttar reglur ná nýju tengslunum).
- `node skriptur/backtest_roads.mjs` → nýju húsnæðis-áttir standast + bönd gild.
- `node src/lib/roads/engine.test.mjs` → 11/11 (engine óbreytt).
- `astro build` + headless: `/hermir/` sýnir nú **7 kort** (verðbólga…greiðslubyrði), nýja sleða
  (frambod/adflutningur), nýjar sviðsmyndir; réttar áttir (t.d. Byggingarhrina → húsnæði ↓).

## Áhætta / heiðarleiki

- **Framboð röð-ómetið** — sviðsmynda-lever með birtri teygni, merkt í `source`.
- **Leigu-gögn stöðnuð (2024F1)** — BAU-leiga byggð á eldri vexti; fyrirvari í heimild.
- **Greiðslubyrði vísitala, ekki krónur** — stílfærð næmni, ekki raun-greiðsluáætlun.
- Sömu almennu fyrirvarar og v0 (Lucas, kvörðunar-óvissa, „ekki opinber spá").

## Framtíð (utan þessarar einingar)

Höfuðborg/landsbyggð-skipting (nýtir `fasteignir.months.hbsv/land`); full per-svæði vídd (þarf
vélar-útvíkkun + svæðis-tímaraðir); tenging við lýðfræði-einingu (aðflutningur↔vinnuafl↔VLF).
