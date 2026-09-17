# Verðmatsgluggi fyrir allt.is (plugin 1)

Dags. 17.9.2026 · Staða: samþykkt hönnun, bíður útfærsluáætlunar

## Samhengi

Aron fundaði með Páli Þorbjörnssyni og Elínu hjá Allt fasteignasölu 17.9 og samdi um þrennt.
Frían aðgang starfsfólks Allt að fasteignaskýrslum, þrjú plugin fyrir vef þeirra, og **fast
mánaðargjald** frá Allt til Karps.

Pluginin þrjú eru sjálfstæð verkefni sem deila engu nema uppruna. Þau fá sína eigin spekk hvert.

1. **Verðmatsgluggi** — heimilisfang inn, verðbil út. ⬅ ÞESSI SPEKK
2. Bráðabirgðagreiðslumat (fyrirmynd Íslandsbanki, sjá að neðan)
3. Fasteignafréttir af Reykjanesi

Plugin 1 er fyrst því vélin á bak við það er þegar til og mæld, og það sannar í leiðinni
rammann, þemað, talninguna og lásinn sem hin tvö endurnýta.

## Hvað glugginn er, og hvað hann er ekki

Hann gefur **verðbil** fyrir eina eign, reiknað úr þinglýstum kaupsamningum. Hann er ekki
söluverðmat löggilts fasteignasala og má ekki líta út eins og slíkt.

⚠ Hann sýnir **ekkert punktmat**. Ákvörðun Arons, og rökin eru hans: ein ákveðin tala á vef
fasteignasala festir væntingar seljanda, og svo þarf Páll að rífast við okkar tölu þegar hann
nefnir raunhæft verð. Bil gefur honum svigrúm.

## Mælingarnar sem hönnunin hvílir á

Allar tölur úr `skriptur/maela_verdmat.mjs`, mældar 17.9.2026. ⚠ Ekki afrita þær í kóða-
athugasemdir. Keyrðu skriptuna. Sex ólíkar nákvæmnistölur urðu til í sumar af því þær voru
afritaðar í stað þess að mældar (sjá `[[karp-fasteignavakt]]`).

**Reykjanes (230·232·233·235·240·245·250·260·262), 580 sölur síðustu 12 mán, hver metin
eingöngu úr eldri sölum:** miðgildisskekkja **4,8%**, sem er betra en landstalan 5,8%.

| bil | hittir |
|---|---|
| ±10% | **79,3%** ⬅ valið |
| ±12,5% | 86,0% |
| ±15% | 89,7% |
| ±20% | 94,3% |

⚠⚠ **`lo`/`hi` úr `metaUrSolusogu` MÁ EKKI nota sem verðbil gluggans.** Það er fjórðungsbil
*sambærilegra eigna*, ekki óvissubil um þessa eign. Mælt: 8,2% breitt að miðgildi og raunverð
lendir innan þess í aðeins **35,4%** tilvika. Bil sem er rangt tvisvar af hverjum þremur má ekki
heita „líklegt bil" á vef fasteignasala. Bilið hér er **punktmatið ± 10%**, kvarðað úr mældri
bakprófsskekkju.

**Orðalagið í glugganum verður að vera „rétt í fjórum af hverjum fimm tilvikum".** Ekki „líklegt
bil", ekki „áætlað bil", ekki neitt sem gefur í skyn að það haldi alltaf. ±10% er rangt hjá
fimmta hverjum og glugginn segir það sjálfur. Þetta er skilyrði fyrir ±10%, ekki skraut.

## Gagnaþekjan, og af hverju hún stöðvar okkur ekki

Kaupskráin nær aðeins til eigna sem hafa selst eða verið leigðar síðan 2006. Mælt 17.9 á
Reykjanesi: **7.939 staðföng, 4.197 þekkt, gat 47,1%**.

Nærri annað hvert heimilisfang sem gestur Páls slær inn er hjá okkur bara heimilisfang.

En verðmatsvélin þarf ekki skrána. Hún þarf **tegund, stærð og byggingarár**, og húseigandi veit
fermetrana sína. Hnit höfum við fyrir öll 7.939 staðföngin, svo radíus-sían virkar óháð gatinu.

⚠ HMS-kaupin sem loka gatinu bíða fram yfir áramót (gjaldskrá í endurskoðun, sjá HMS-þráðinn).
Glugginn má ekki bíða eftir þeim.

## Flæði

```
heimilisfang (sjálfvirk uppfylling úr staðfangaskrá)
        │
        ├─ eign ÞEKKT (53%) ──────────────► reikna
        │
        └─ eign ÓÞEKKT (47%) ─► spyrja um tegund, fermetra, byggingarár ─► reikna
                                          │
                                          └─ notandi hættir við ─► „ekki í skrá, hafðu samband við Allt"
```

Þrír reitir í óþekkta tilvikinu. Ekki fleiri.

⚠ Þegar notandinn sló sjálfur inn fermetrana VERÐUR það að standa undir niðurstöðunni, svo enginn
haldi að við höfum flett þeim upp.

## Útfærsla

**Leið:** `karp.is/embed/verdmat/` — rammi sem við hýsum. Þeir líma eina línu inn.

Valið umfram skriptu sem teiknar inn í þeirra síðu: okkar kóði keyrir ekki á þeirra vef og þeirra
vefur getur ekki brotið okkar. Fasteignasala sem missir forsíðuna út af okkar skriptu er dýrari en
ljótari rammi. Ábyrgðarlínan er skýr.

⚠⚠ **`web/public/_headers` ber `X-Frame-Options: SAMEORIGIN` og `frame-ancestors 'self'`.**
Hvort tveggja lokar glugganum úti hjá Allt. `X-Frame-Options` er harðari en CSP og verður að
fjarlægja fyrir ÞESSA leið eina. Undantekningin á aðeins við `/embed/verdmat/`, aldrei víðar.

**Lás:** `frame-ancestors https://www.allt.is https://allt.is` á þeirri leið, svo enginn annar geti
límt gluggann hjá sér og notað hann frítt.

**Þema Allt** (mælt af allt.is 17.9, ekki ágiskun):

| hlutverk | gildi |
|---|---|
| letur | Raleway, 16px |
| bakgrunnur | `#f8fbfc` |
| dökkt / fyrirsagnir | `#0b1f28` |
| áhersla / hnappar | `#226079` |
| brauðtexti | `#67777e` |

Neðst: **Powered by Karp.is**.

**Sjálfvirk uppfylling** endurnýtir mynstrið úr `fasteignavakt.astro` (`hnit/gotur.json` sem
götuvísir, `hnit/<pn>.json` fyrir staðföng). ⚠ Lyklar hnitaskrárinnar eru LÁGSTAFA.

**Vélin** er `web/src/lib/fasteignamat.mjs` óbreytt. Glugginn kallar hana, breytir henni ekki.
⚠ `hnit` VERÐA að fylgja kallinu, annars er radíus-sían óvirk í þögn (sú gildra kostaði okkur
eina mælingu 15.9).

## Trekt og talning

Undir bilinu er hnappur inn á karp.is fyrir fulla skýrslu, með merki í slóðinni svo við sjáum hvað
kom frá Allt. Glugginn gefur töluna, skýrslan gefur rökstuðninginn — bæði mötin, sölusöguna,
sambærilegu eignirnar, leiguna og matssvæðið.

**Talning:** ein notkun telst **hvert skipti sem verðbil er BIRT**. Uppfletting sem skilar engu
telst ekki með, hvorki þegar heimilisfangið finnst ekki né þegar notandi hættir við í
innsláttarskrefinu. Mánaðargjaldið er fast, en talningin verður að vera til og hún verður að telja
það sem Allt fær í raun — annars er ekkert hægt að semja um endurnýjun án þess að rífast um hvað
telur.

**Persónuvernd:** við geymum **ekkert persónugreinanlegt** um þá sem fletta upp. Ekki heimilisfang,
ekki fyrirspurnina. Aðeins teljara.

⚠⚠ Heimilisfang er persónugreinanlegt og manneskja sem flettir upp sínu eigin húsi á
fasteignasöluvef er að gefa sterkt til kynna að hún sé að íhuga sölu. Sá listi fer hvorki til Páls
né í okkar geymslu. Karp selur áreiðanleikakannanir og má ekki vera fyrirtækið sem lekur
uppflettingum. Sjá `[[karp-personuvernd-dpia]]`.

## Prófanir

Rökvísin fer í prófaða einingu, ekki inn í `.astro`-skrána (sama regla og lánshæfismatið).

- bilið er **punktmat ± 10%**, ALDREI `lo`/`hi` úr vélinni — próf sem fellur ef einhver víxlar þessu
- óþekkt eign með notanda-innslegnum fm/ar skilar mati
- óþekkt eign án innsláttar skilar „ekki í skrá", ekki villu
- `hnit` berast alla leið í `metaUrSolusogu` (radíus-sían virk)
- orðalagið „fjögur af hverjum fimm" fylgir bilinu og er ekki hægt að birta bilið án þess

## Utan umfangs

Plugin 2 og 3. HMS-kaupin. Lead-afhending til Páls (trektin fer á karp.is, ekki til hans).
Punktmat. Bæði mötin hlið við hlið (fasteignamats-leiðin krefst `mat` úr kaupskránni og er því
ekki til fyrir 47% — sama upplifun fyrir alla var forsenda).

## Opið, og ekki mitt að ákveða

1. **Mánaðargjaldið.** Engin tala ákveðin.
2. **Sagan gagnvart Páli.** Hann borgar fyrir glugga sem sendir hans eigin gesti inn á karp.is að
   kaupa skýrslu, á meðan söluverðmat frá honum er ókeypis. Hann tekur eftir því á endanum.
   Svarið er sennilega að okkar skýrsla er gagnaskýrsla en ekki söluverðmat og hún endar á
   hvatningu um að tala við fasteignasala. Það þarf að vera ákveðið áður en hann spyr.

## Undirbúningur fyrir plugin 2 (ekki umfang þessarar spekkar)

Aron benti á bráðabirgðagreiðslumat Íslandsbanka sem fyrirmynd. Fimm skref.

1. Tegund láns, fyrstu kaup eða fasteignalán
2. Tekjur og útgjöld á mánuði, fjöldi kaupenda, tekjur, eigið fé, fjöldi barna undir 18 ára
3. Rekstur heimilisins, mánaðarleg útgjöld og fjöldi bifreiða
4. Önnur lán, afborganir
5. Niðurstaða, greiðslugeta og hversu dýra eign má kaupa

⚠ Fimm skref er langt fyrir ramma inni á vef þriðja aðila. Hvort við speglum flæðið eða þjöppum
því er hönnunarspurning fyrir þá spekk.

⚠⚠ Erfiði hlutinn er ekki viðmótið heldur forsendurnar. Íslandsbanki reiknar eftir SÍNUM
útlánareglum og sínum vöxtum. Karp er ekki lánveitandi og verður því að velja hvað reiknað er
eftir, og segja það upphátt í niðurstöðunni.

## Orðalag sem má ekki víkja

- **„Bráðabirgðagreiðslumat"** er RÉTTA heitið á plugin 2. Ég lagði upphaflega til
  „kaupgetureikni" af ótta við að hugtakið væri frátekið fyrir lánveitendur. Það var of varkárt.
  Íslandsbanki kallar sína eigin opnu sjálfsafgreiðslu nákvæmlega þessu nafni, svo hugtakið er í
  almennri notkun um einmitt þetta. Það sem stendur eftir er ekki nafnið heldur að segja hverra
  reglum er reiknað eftir og að niðurstaðan bindi engan.
- **„Rétt í fjórum af hverjum fimm tilvikum"** um bilið í plugin 1.
- Aldrei „verðmat" eitt og sér um niðurstöðu gluggans, alltaf „áætlað verðbil".
