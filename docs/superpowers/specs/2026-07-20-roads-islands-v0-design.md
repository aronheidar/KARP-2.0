# Hönnun: ROADS Íslands v0 — vél + Peningastefnu-eining

Dags: 2026-07-20 · Verkefni: „ROADS Íslands" (En-ROADS-stíll sviðsmynda- og frétta-hermir)

## Vandamál & markmið

Núverandi `/hermir/` er einfalt kennslu-toy: 6 sleðar → 4 útkomur með föstum, ágiskuðum
teygnistuðlum, ein tala, engar tafir/lykkjur, „ekki opinber spá". Karp á hins vegar óvenju
rík íslensk opin gögn (91 gagnaskrá) sem gera kleift að byggja gagnsæjan, kvarðaðan
sviðsmynda-hermi í anda **En-ROADS** (Climate Interactive/MIT Sloan): tól sem sýnir hvaða
áhrif ákvarðanir (Seðlabanka, Alþingis, vinnumarkaðar, banka) og ytri sjokk hafa á íslenskt
efnahagslíf — á mannamáli, með óvissu, og með hverja orsakakeðju skoðanlega.

**Prímær tilgangur (valinn):** *frétta-/miðlunartól fyrst, en vél byggð nógu vel til að
þroskast í ákvarðanastuðning síðar.* Fyrsti áfangi er miðlunartól; vélin er öguð frá byrjun.

**Ekki-markmið v0:** að slá við QMM/DSGE Seðlabankans sem opinber spá; heimilis-dreifing/
ójöfnuður (þarf ör-hermi); öll svið í einu.

**Hönnunar-meginregla:** *módelið er GÖGN, ekki kóði.* Öll orsakasambönd búa í `links.json`
(stuðull, töf, heimild, óvissa). Að auka rigor síðar = skipta um tölur, ekki endurskrifa vél.
Heiðarleg merking áfram: „stílfærð sambönd, ekki spá."

## Umfang v0

Sameiginleg **vél** + fyrsta **Peningastefnu-eining**. Aðrar einingar (Húsnæði, Lýðfræði &
vinnumarkaður, Ríkisfjármál, Auðlindir) eru hannaðar til að smella ofan á sömu vél SÍÐAR —
utan v0.

## Vélin — létt tímaskref-vél (leið C)

Diskret-tíma (ársfjórðungslegt) endurkvæmt líkan sem stígur fram frá grunn-ferli:

- **Stofnar (stocks):** verðlag (vísitala), húsnæðisverð (vísitala), — (síðar: ríkisskuld,
  mannfjöldi, húsnæðisstofn). Stofnar safnast upp milli ársfjórðunga.
- **Flæði/tengsl:** hver keðja `frá → til` með kvörðuðum stuðli og **töf** (fjöldi ársfj.).
- **Skref:** fyrir ársfjórðung t: reikna hverja útkomu = grunn-ferill(t) + Σ áhrif(vogarstangir,
  sjokk, aðrar útkomur) með töfum; uppfæra stofna. Skilar **ferlum** (t = 0..N, N≈12 ársfj. = 3 ár).
- **Óvissa (v0 = jaðra-samsetning, deterministísk):** hver stuðull ber `ci_lág/ci_há`; vélin
  keyrir þrjú keyrslur — lág/mið/há stuðla-sett — og skilar `lo/mid/hi` ferlum per útkomu.
  Deterministískt, browser-vænt, endurtakanlegt. (Monte-Carlo er möguleg síðari betrumbót.)
- **Lykkjur:** leyfðar (t.d. verðbólga → laun → verðbólga) gegnum töf (fyrri-ársfj. gildi) svo
  ekkert hringrás-lás; convergence ekki krafist (endanlegur N).

### Einingar (isolerað, prófanlegt)

- **Create `src/lib/roads/engine.mjs`** — hrein fall
  `simulate({ baseline, links, levers, shocks, quarters }) → { outcomes: {<key>: {mid[],lo[],hi[]}}, deltas }`.
  Engin UI, engin gagnahleðsla, engar aukaverkanir. Eina staðurinn með reiknilógík.
  **Isomorphic** (hrein JS, engar node-deps) — keyrir BÆÐI í node (próf) og í vafra (gagnvirkir
  sleðar reikna client-hlið, eins og núverandi hermir; `roads/*.json` er hlaðið inn í síðuna).
- **Create `gogn/roads/baseline.json`** — núverandi staða + BAU-ferill per breytu (úr
  gögnunum + fyrirliggjandi spám). Byggt af skripti.
- **Create `gogn/roads/links.json`** — fylki af
  `{ id, fra, til, coef, lag, unit, source, ci_lo, ci_hi, note }`. **Gagnsæis-lagið.**
- **Create `gogn/roads/scenarios.json`** — forstillingar (frétta-atburðir): lever/shock-gildi
  + heiti + mannamáls-lýsing.
- **Create `skriptur/build_roads.mjs`** — kvörðun: byggir `baseline.json` + `links.json` úr
  `gogn/`-röðunum (metur teygni þar sem hreint) + curated birt teygni. Keyrt í CI (daglegt/vikulegt).
- **Modify `web/src/pages/hermir.astro`** — UI-skel neytir `engine.mjs` + `roads/*.json`.

## Peningastefnu-einingin (fyrsta innihald)

- **Vogarstangir (levers — það sem aðili ákveður):** stýrivextir (aðal), launahækkun
  (kjarasamningar), veðsetningarhlutfall (þjóðhagsvarúð).
- **Sviðsmynda-sjokk (exogen):** olíuverð, EUR/USD (gengi), ferðamannafjöldi, alþjóðavextir.
- **Útkomu-ferlar:** verðbólga, VLF-vöxtur, atvinnuleysi, kaupmáttur launa, húsnæðisverð,
  greiðslubyrði (afleidd: vextir × húsnæðisverð / kaupmáttur).

## Kvörðun (calibration) — heimild + óvissa á hverjum stuðli

Tvær uppsprettur, ALLTAF með heimild:
1. **Metið úr Karp-röðunum** þar sem hreint samband er til (OLS/teygni með lag-vali):
   - vextir → húsnæðisverð: `sedlabanki` (meginvextir/vextir_si) × `fasteignir.months` (243 mán).
   - vextir → verðbólga / atvinnuleysi / VLF: `sedlabanki` × `verdlag`/`atvinnuleysi`/`hagvoxtur`.
   - laun/kaupmáttur → verðbólga: `vinnumarkadur.WAGE` × `verdlag`.
   - gengi → verðbólga (gengisyfirfærsla): `sedlabanki.gengi` × `verdlag`.
   - ferðamenn → VLF: `ferdathjonusta.kefL` × `hagvoxtur`.
2. **Curated birt teygni** (SÍ QMM/Peningamál, Hagstofa, OECD) fyrir keðjur sem gögnin meta illa
   (t.d. peningastefnu-yfirfærslu-tafir, olíuverðs-yfirfærsla) — hver með tilvitnun í `source`.

`build_roads.mjs` skrifar hvert `link` með `source` (röð-metið eða rit-tilvitnun), `lag`, og
`ci_lo/ci_hi`. Grunn-ferlar frá: `verdlag.forecast`, `hagvoxtur.forecast`, `mannfjoldi.PROJ`,
`langtima` (ríkisfjármál), o.fl.

## UI (frétta-fyrst)

Uppfærð `/hermir/`:
- **Vogarstangir** sem sleðar + **sviðsmynda-forstillingar** (chips).
- **Útkomu-ferla-gröf** (ekki ein tala) í stíl mannfjölda-myndbandsins, með óvissu-böndum og
  „frávik frá grunni" yfirlagi.
- **Frétta-hamur:** veldu atburð úr `scenarios.json` („Vaxtahækkun 0,25pp", „Loðnubrestur",
  „Kjarasamningar +8%") → sýnir stílfærðan áhrifa-feril + eina mannamáls-setningu, tilbúna í frétt.
- **Gagnsæis-smellur:** smelltu á hverja keðju/útkomu → sérð stuðulinn, heimildina, töfina og
  óvissuna („−0,6% húsnæðisverð per +1pp vextir, metið úr 2010–2025, ±0,2").
- **Heiðarleg merking** áberandi: „stílfærð sambönd byggð á opinberum gögnum — ekki opinber spá."

CSS-gildra (skjalfest í macro-dashboard): runtime-DOM/innerHTML → `is:global` eða inline stílar.

## Prófun

- **Einingapróf á `engine.mjs`** (hrein fall): þekktar sviðsmyndir gefa væntanlega átt/stærð —
  t.d. „+1pp vextir í 8 ársfj. → verðbólga lækkar, húsnæðisverð lækkar, atvinnuleysi hækkar,
  öll innan óvissu-bands"; „engin breyting → ferill = grunnur"; óvissu-band `lo ≤ mid ≤ hi`.
- **Back-test kvörðunar:** keyra vélina á sögulegu upphafi og bera saman við raun — spáir hún
  innan óvissu? (fróðleiks-sannreyning, ekki nákvæmnis-krafa.)
- Ekkert unit-test-framework í repo → próf sem hrein node-skript (`node test_roads.mjs`) sem
  fullyrða á útkomu-áttir/bönd; UI staðfest með `astro build` + fetch/skjámynd.

## Gögn sem fæða v0 (staðfest í úttekt)

`sedlabanki` (vextir/gengi/verðbólga, daglegt/mán.), `verdlag` (+forecast), `hagvoxtur`
(+forecast), `atvinnuleysi` (26 ár/316 mán), `vinnumarkadur.WAGE`, `fasteignir` (243 mán),
`ferdathjonusta`, `mannfjoldi.PROJ`, `langtima`. Olíuverð/alþjóðavextir = exogen sjokk með
rit-yfirfærslu (engin Karp-röð krafist).

## Áhætta / heiðarleiki

- **Lucas-gagnrýnin:** fastir stuðlar bila þegar stefna breytist → v0 er sviðsmynda-tól, EKKI
  spá; merkt sem slíkt; frétta-hamur sýnir „stílfærð áhrif".
- **Kvörðunar-óvissa:** hver stuðull ber óvissu-band og heimild; aldrei ein sannfærandi tala.
- **Ofmat trúverðugleika:** engin ójafnaðar-/heimilis-útkoma í v0 (vantar ör-gögn) — ekki lofað.
- **Endógenítet í teygni-mati:** röð-metnir stuðlar eru fylgni, ekki hrein orsök → merkt, og
  curated birt teygni notuð þar sem betri auðkenning er til (SÍ QMM).
- **Viðhald:** `links.json` er lítið og skjalfest; CI endurkvarðar.

## Framtíð (utan v0, sama vél)

Einingar 2–5 (Húsnæði · Lýðfræði & vinnumarkaður · Ríkisfjármál · Auðlindir) bæta vogarstöngum/
útkomum/keðjum við sömu vél + `links.json`. Þroski í ákvarðanatól = betri auðkenning stuðla +
fleiri stofnar + regluleg back-test-sannreyning — engin vélar-endurskrif.

## Uppröðun (lotur fyrir writing-plans)

1. Vél `engine.mjs` (hrein stepper + óvissa) + einingapróf á tilbúnum litlum `links`/`baseline`.
2. Kvörðun `build_roads.mjs` → raun `baseline.json` + `links.json` (metið + curated, með heimildum).
3. UI-uppfærsla `/hermir/`: sleðar + ferla-gröf + óvissu-bönd + gagnsæis-smellur.
4. Frétta-hamur + `scenarios.json` + mannamáls-setningar.
5. Back-test + heiðarleg merking + `astro build`/staðfesting.
