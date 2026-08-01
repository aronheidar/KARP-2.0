# Refsilista-skimun: samræmis-próf á sterka laginu

Framhald af `2026-07-31-refsilistar-eins-ords-skimun-design.md`. Þar var **veika** lagið
mælt og einangrað. Hér er **sterka** lagið mælt — og það reyndist bera falsjákvæður sem
drífa krítískar viðvaranir til borgandi viðskiptavina.

## 1. Vandamálið

Sterka vísitalan er lykluð á `fyrsta-tóken|síðasta-tóken` og hunsar **allt þar á milli**
og **tóken-fjöldann**:

```js
const key = t[0] + '|' + t[t.length - 1];
if (!sterk.has(key)) sterk.set(key, gildi);
```

Þetta er **ekki afturför** — hegðunin er bitrétt sú sama og fyrir tveggja-laga vinnuna
31.7.2026. En hún skiptir meira máli en veika lagið, því sterk samsvörun lendir í
`sanctions.hits`, og `.hits` drífur:

- `kind:'sanctions_hit', severity:'critical'` í `signalEvents` (`web/src/lib/kyc.mjs`)
- `deriveRisk` → `'Há'`
- tafarlausan póst um `kycCriticalCron` (`web/src/worker/cron.mjs`)
- lánshæfis-þak í einkunn E (`web/src/pages/fyrirtaeki.astro`)

## 2. Mælingin

Shippaði kóðinn (`byggjaVisitolu`/`skima` úr `origin/main`, 0c1c54a) var fluttur inn
óbreyttur og keyrður á óbreyttum `web/public/gogn/sanctions.json` (62.301 færsla).

### 2.1 Vísitölu-hliðin

| mæling | gildi |
|---|---|
| sterk-gjaldgengar færslur (≥2 tóken) | 58.852 |
| aðgreindir sterkir lyklar | 49.124 |
| lyklar með fleiri en eina færslu | 5.800 |
| **færslur sem falla í skuggann** | **9.728 (16,5%)** |
| færslur sem deila lykli með AÐGREINDU nafni | 15.528 (26,4%) |

Allir 5.800 árekstra-lyklarnir bera **aðgreind** nöfn — ekki samheiti sama aðila.
Verstu dæmin: `joint|plant` = 77 ólík félög, `al|company` = 65, `korea|corporation` = 54.
Algengustu jaðar-tóken: `company` (1.772), `ltd` (1.514), `limited` (1.263).

Afleiðing: af því `byggjaVisitolu` heldur aðeins FYRSTU færslu per lykli getur worker
**birt nafn annars aðila** sem „samsvörunina". Það á við um 26,4% færslna.

### 2.2 Fyrirspurnar-hliðin

6.803 aðgreind raun-íslensk nöfn úr sex skrám (ferðaleyfi 1.826 · skip_owners 1.672 ·
styrkir 1.474 · lögbirting 1.103 · eftirlit 620 · birgjar 200). 6.535 höfðu ≥2 tóken.

> **3 sterkar samsvaranir. Allar 3 falskar. Nákvæmni 0%.**

```
[styrkir]    The Basic Cookbook Company        -> The Niru Battery Company   [ESB,OFAC]
[styrkir]    Alejandra Gabriela Soto Hernandez -> Alejandra SALAZAR HERNANDEZ [OFAC]
[ferdaleyfi] The Iceland Tour Co. / Tour Co.   -> THE EARTH EYE CO           [OFAC]
```

(`rekstrarleyfi.json` ber engin nafna-svið — aðeins kt-lyklun — og lagði ekkert til.)

### 2.3 Endurheimtar-prófið

Sjálfs-skimun (færsla skimuð gegn sjálfri sér) er **tátólógísk** og mælir ekkert.
Í staðinn voru smíðuð raunhæf nafna-afbrigði af hverri færslu listans og spurt hvort
reglan finni enn **réttan aðila**:

| regla | sleppt millinafn | aukið millinafn | víxluð millinöfn | 1 stafur | 2 stafir | fellir 3 falsjákv. |
|---|---|---|---|---|---|---|
| **T0 núverandi** | 100% | 100% | 100% | 100% | 100% | ❌ 0/3 |
| T1 tóken-fjöldi | **0%** | **0%** | 100% | — | — | 2/3 |
| T2 öll fyrirspurnar-tóken í færslu | 100% | **0,2%** | 100% | — | — | 3/3 |
| T3 röð-held innihald | 100% | 100% | **0,2%** | — | — | 3/3 |
| T4 nákvæm tóken-runa | **0%** | **0%** | **0,2%** | — | — | 3/3 |
| T5 mengja-innihald | 100% | 100% | 100% | **1,0%** | **0,7%** | 3/3 |
| **T6 = T5 eða jöfnuð lev≤2** | **100%** | **100%** | **100%** | **100%** | **100%** | ✅ **3/3** |

Lykil-niðurstaða: **tóken-fjöldi er RANGI hnappurinn.** T1 lagar ekki einu sinni dæmi 1
(bæði nöfnin eru 4 tóken) og eyðileggur endurheimt. Hver einföld þrenging fellur á
ÖÐRU raunhæfu afbrigði — þess vegna er engin þeirra nothæf ein og sér.

T5 lítur fullkomlega út þar til umritun er prófuð, þar sem hún tapar ~99%. Umburðarlyndi
gagnvart reki í mið-tókeni er einmitt það sem `fyrsta|síðasta` kaupir — og ástæðan fyrir
því að núverandi hönnun er eins og hún er.

**T6 fellir allar þrjár falsjákvæðurnar án nokkurs mælds endurheimtar-taps.**

Tveir fyrirvarar, sagðir berum orðum:

1. Afbrigðin eru **tilbúin** umbreyting á raunfærslum listans, ekki mældar
   viðskiptavina-fyrirspurnir.
2. Eftirstandandi áhætta T6 er mið-tóken sem er **raunverulega annað** en ekki umritað:
   listi „Mohammad **Ali** Hassan" gegn viðskiptavini „Mohammad **Reza** Hassan". T0 nær
   því; T6 lækkar það. Oftast sinn hvor maðurinn — en ekki alltaf.

## 3. Ákvörðunin

Endurheimtar-tap á refsilista er sjálfstætt regluvörslu-brot. Þess vegna er **engu hent**.
Ákvörðun Arons 1.8.2026: **lækka í veika lagið og gefa því sýnilegan flöt.**

Samsvörunin hverfur ekki — aðeins alvarleikinn breytist.

## 4. Hönnun

### 4.1 `samraemi(qTokens, eTokens)` — ný hrein regla í `refsilistar.mjs`

Skilar samræmis-þrepi eða `null`:

| þrep | próf | nær |
|---|---|---|
| `'nakvaemt'` | eins tóken-runa | nákvæmt |
| `'innihald'` | mengja-innihald í hvora átt | sleppt/aukið/víxlað millinafn |
| `'namunda'` | sami tóken-fjöldi, hvert sæti jafnt eða Levenshtein ≤2 | umritun |
| `null` | ekkert ofangreint | → lækkun |

Levenshtein er stytt út með lengdar-vörn (`|a.length-b.length| > 2` → hafnað strax).

### 4.2 Fjölgild vísitala

`sterk: Map<key, Array<{ nafn, listar, n }>>` í stað þess að halda aðeins fyrstu færslu.
Þetta eitt og sér endurheimtir 9.728 földu færslurnar.

Geymt er normaliseraði strengurinn `n`; tóken eru klofin við samanburð. Fyrirspurnir eru
fáar (handfylli nafna per KYC-skimun) og færslur per lykli fáar (meðaltal ~1,2, hámark 77),
svo letiklofnun heldur minnisnotkun nálægt því sem nú er.

Lögunar-breytingin er **algjörlega innilokuð** í `refsilistar.mjs`: worker snertir
`sterk` aðeins um `flokkaNofn`/`skimunarNidurstada` auk `.size` (veitur.mjs:60-61, 135-137).

### 4.3 `skima` velur besta frambjóðanda — og lagar eignunina

Meðal allra færslna undir lyklinum er valið eftir þrepa-forgangi
(`nakvaemt` > `innihald` > `namunda`), og **nafn þeirrar færslu** birt:

- samræmanlegur frambjóðandi → `{ flokkur:'sterk', tegund:'fjolords', listi: <besta samsvörun> }`
- enginn samræmanlegur → `{ flokkur:'veik', tegund:'jadar' }` ← **lækkunin**
- eitt tóken → `{ flokkur:'veik', tegund:'einsords' }` ← **óbreytt**

Í dag er birt hvaða færsla sem lenti fyrst í vísitölunni — rangt fyrir 26,4% færslna.

### 4.4 Tveir fletir, svo lækkuð samsvörun sé aldrei þögul

**F9 (`fyrirtaeki.astro`).** Veika línan greinist á `tegund`. Núverandi
„eins-orðs samsvörun"-texti heldur sér fyrir `einsords`; `jadar` fær sitt eigið orðalag
(„samsvörun aðeins á fyrsta og síðasta orði — millinöfn stangast á"). Litur flísarinnar
er áfram eingöngu drifinn af `hits`.

**KYC (`kyc.mjs`).** Nýr atburður `{ kind:'sanctions_weak', severity:'info' }` — **aðeins**
fyrir `jadar`. Hann ratar í `kyc_event` og audit-slóðina og birtist í opnum viðvörunum, en
af því `_kycAfterEvents` síar á `severity === 'critical'` (veitur.mjs:339) fer **enginn
póstur**. `deriveRisk` er ósnert (les aðeins `.hits`).

### 4.5 Grunnlínu-vörnin

Að diffa `veikar` gegn eldra snapshot þar sem `prev.veikar` er `undefined` myndi hleypa af
atburða-skriðu fyrir hverja fyrirliggjandi veika samsvörun. Sama vandamál og `beneficial`
leysti (kyc.mjs:35) — sama vörn notuð:

```js
if (prev.veikar !== undefined) { /* diff */ }
```

Fyrsta keyrsla eftir útgáfu er því þögul grunnlína fyrir þetta undirmerki.

## 5. Prófanir

`refsilistar.test.mjs`
- hvert þrep `samraemi` (nakvaemt/innihald/namunda/null)
- allar 3 raun-falsjákvæðurnar lækka í `jadar`
- hvert afbrigðis-form helst `sterk`
- fjöl-færslu lykill skilar RÉTTU nafni (eignunar-vörn)
- **vörn:** `jadar` má ALDREI lenda í `sterkar`/`hits`

`kyc.test.mjs`
- `sanctions_weak` er `info`, ekki `critical`
- `deriveRisk` óbreytt af `veikar`
- grunnlínu-vörnin: `prev.veikar === undefined` → engir atburðir

Keyrt með `cd web && npm test`.

## 6. Það sem er vísvitandi EKKI gert

- **Eins-orðs lagið er óbreytt.** Engir nýir atburðir fyrir `einsords`. Það var hannað og
  mælt sérstaklega 31.7 og fellur utan þessarar ákvörðunar.
- **Engu hent.** Engin færsla og engin samsvörun fjarlægð — aðeins leið breytt.
- **Engin hljóðfræðileg samsvörun** (Soundex/Metaphone). Það er sérstakt verk með sína
  eigin mælingu.
- **Ekki útgefið.** Þessi grein er ekki ýtt og ekki sett í loftið.

## 7. Nettó-áhrif á mældu gögnin

- allar 3 fölsku krítísku viðvaranirnar hætta að kvikna
- engri samsvörun fækkar í niðurstöðunni
- 9.728 áður-óaðgengilegar færslur verða birtanlegar
- birt nafn samsvörunar verður rétt

## 8. Hvernig mælingin var gerð

Shippaði kóðinn fluttur inn óbreyttur úr hreinum detached worktree á `origin/main`
(0c1c54a); engin regla endurrituð. Bæði dæmin úr erindi Arons endurgerð stafrétt áður en
nokkuð var mælt. Mælingaskriftur: `maeling-sterk.mjs`, `maeling-endurheimt.mjs`,
`maeling-t5.mjs`, `maeling-t6.mjs` (scratchpad, ekki hluti af greininni).
