# Hönnun: ROADS Íslands — Lýðfræði & vinnumarkaðs-eining (module 3)

Dags: 2026-07-20 · Byggir á: [ROADS v0](2026-07-20-roads-islands-v0-design.md) + [module 2 Húsnæði](2026-07-20-roads-husnaedi-eining-design.md) (bæði LIVE á /hermir/)

## Markmið

Bæta lýðfræði- og vinnumarkaðs-vídd við ROADS: aðflutningur + frjósemi → mannfjöldi → vinnuafl →
atvinnuleysi/hagvöxtur. Tengist beint húsnæðis-einingunni (aðflutningur er sameiginlegur drifkraftur).

## Horizon-lausn (kjarna-ákvörðun)

ROADS er 3-ára (12 ársfj.). Lýðfræði spilast yfir áratugi — svo umfangið er **skammtíma-rétt**:
- **Aðalkeðjan er efnisleg á 3 árum:** mannfjölgun er ~70% aðflutningur (2024: +4.044 vs +1.704
  náttúrl.), og vinnualdurs-innflytjendur drífa vinnuaflið strax.
- **Frjósemi = langtíma:** fæðingar verða ekki vinnuafl fyrr en eftir ~20 ár → frjósemi fær
  **lítið nærtíma-tengsl** (fæðingar→höfðatala) EN **ekkert →vinnuafl** (réttilega). Heimild-strengur
  ber skýran „langtíma"-fyrirvara sem bendir á `/mannfjoldi/` (spá til 2074 + myndband) fyrir áratuga-söguna.
- **Aldurssamsetning/framfærslubyrði sleppt í v1** — hreyfist varla á 3 árum; heima á /mannfjoldi/.

## Meginregla staðfest (þriðja sinni): *módel = gögn*

**Engin breyting á `src/lib/roads/engine.mjs` né `web/src/pages/hermir.astro`.** Aðeins útvíkka
`skriptur/build_roads.mjs` + regen `gogn/roads/*.json`. UI teiknar 9 kort + nýjan sleða sjálfkrafa.

## Nýtt sjokk

- **`frjosemi`** — frjósemi (fæðingartíðni), % frávik frá TFR 1,56. Sjokk (ytra/félagslegt).
  `{base:0, min:-40, max:40, step:5, unit:'%', label:'Frjósemi (frávik)'}`.
  *(`adflutningur` er þegar til úr húsnæðis-einingunni.)*

## Nýjar útkomur (bætt AFTAST → 8.–9. kort; röð óröskuð)

- **`mannfjoldi`** — fólksfjölgun, %. BAU úr `mannfjoldi.POP.yoy` (~1,3%) → glide(1,3 → 1,0).
  `unit:'%'`, `clamp:[-1,4]`.
- **`vinnuafl`** — vinnuaflsvöxtur, %. BAU curated glide(1,5 → 1,2) (vinnuafl vex örlítið hraðar en
  mannfjöldi v/vinnualdurs-aðflutnings). `unit:'%'`, `clamp:[-2,5]`.

## Ný tengsl (curated, hvert `source`+`ci`, ÖLL lag≥1)

| id | frá → til | coef | lag | unit | ci | heimild |
|---|---|---|---|---|---|---|
| adf_pop | adflutningur → mannfjoldi | 0.010 | 1 | %/% | [0.006,0.016] | Aðflutningur = meginþáttur mannfjölgunar (Hagstofa) |
| fer_pop | frjosemi → mannfjoldi | 0.004 | 1 | %/% | [0.001,0.008] | Fæðingar → höfðatala; ⚠langtíma, 3-ára hverfandi — sjá /mannfjoldi/ |
| adf_labor | adflutningur → vinnuafl | 0.015 | 1 | %/% | [0.008,0.024] | Vinnualdurs-innflytjendur → vinnuafl (Hagstofa/VMST) |
| labor_gdp | vinnuafl → hagvoxtur | 0.30 | 1 | pp/pp | [0.15,0.50] | Vinnuafl sem framleiðsluþáttur |
| labor_unem | vinnuafl → atvinnuleysi | 0.10 | 2 | pp/pp | [0.02,0.20] | Aukið framboð vinnuafls (skammtíma frásog) |

**Ekkert `mannfjoldi→husnaedi`** — `adflutningur→husnaedi/leiga` er þegar í húsnæðis-einingunni
(forðast tvítalningu á húsnæðis-áhrifum aðflutnings). Nýju útkoma→útkoma tengslin (`labor_gdp`,
`labor_unem`) hafa lag≥1 → standast `verify_roads_model.mjs` óbreytt (þótt vinnuafl komi á eftir
hagvoxtur/atvinnuleysi í röð — lag≥1 gerir röð óháða).

## Nýjar sviðsmyndir

- **„Fólksfjölgun (+aðflutn. +frjós.)"** — `{shocks:{adflutningur:40, frjosemi:20}}` → hærri
  mannfjölgun/vinnuafl, meiri hagvöxtur, húsnæðis-þrýstingur.
- **„Öldrun (frjósemi −30%)"** — `{shocks:{frjosemi:-30}}` → lítil 3-ára áhrif (fyrirvari í
  setningu: raunveruleg áhrif áratugum síðar, sjá /mannfjoldi/).

## Það sem breytist

- **Modify `skriptur/build_roads.mjs`** — `frjosemi` (shocks), `mannfjoldi`+`vinnuafl` (outcomes
  m/BAU+clamp, aftast), `popNow`-lestur úr `mannfjoldi.POP.yoy`, 5 tengsl, 2 sviðsmyndir.
- **Regen `gogn/roads/*.json`**.
- **Modify `skriptur/backtest_roads.mjs`** — lýðfræði-áttir: +aðflutningur→mannfjöldi↑+vinnuafl↑;
  +vinnuafl(v/aðflutn.)→hagvöxtur↑; bönd gild fyrir nýju útkomurnar.
- **Óbreytt:** `engine.mjs`, `verify_roads_model.mjs`, `hermir.astro`.

## Prófun

- `node skriptur/build_roads.mjs` → 9 útkomur, 31 tengsl, 11 sviðsmyndir.
- `verify` heilbrigt (óbreytt). `backtest` lýðfræði-áttir + bönd. `engine.test` 11/11.
- `astro build` + headless: `/hermir/` sýnir **9 kort** + `frjosemi`-sleða + nýjar sviðsmyndir;
  réttar áttir (+aðflutningur → mannfjöldi↑/vinnuafl↑, +frjósemi → mannfjöldi↑ lítið).

## Áhætta / heiðarleiki

- **Frjósemi 3-ára áhrif hverfandi** — lítið nærtíma-tengsl + skýr langtíma-fyrirvari (→/mannfjoldi/).
- **Vinnuafl-BAU curated** (engin hrein vinnuafls-röð) — merkt.
- **Engin tvítalning** — mannfjöldi→húsnæði sleppt (aðflutningur→húsnæði er í module 2).
- Sömu almennu fyrirvarar og v0 (Lucas, kvörðunar-óvissa, „ekki opinber spá").

## Framtíð (utan þessarar einingar)

Aldurssamsetning/framfærslubyrði (langtíma, /mannfjoldi/); tenging vinnuafl↔laun (Phillips);
langtíma-hamur ROADS (lengri sjóndeildarhringur fyrir lýðfræði/lífeyri).
