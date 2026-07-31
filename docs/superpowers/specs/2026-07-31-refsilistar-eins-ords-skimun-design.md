# Refsilista-skimun: eins-orðs nöfn í aðskildu veiku lagi

**Dags:** 2026-07-31
**Staða:** Hönnun samþykkt, bíður útfærslu
**Snertir:** `web/src/worker/veitur.mjs`, `web/src/lib/refsilistar.mjs` (ný), `web/src/pages/fyrirtaeki.astro` (F9-flís)

---

## 1. Vandamálið

Refsilista-skimunin (F9) sleppir öllum eins-orðs nöfnum, í báðar áttir.

Í `web/src/worker/veitur.mjs` er vísitalan lykluð á `fyrsta-tóken|síðasta-tóken` og bæði bygging og uppfletting henda öllu sem hefur færri en 2 tóken:

```js
const t = (x.n || '').split(' ').filter(Boolean);
if (t.length < 2) continue;                       // ← eins-orðs færslur hverfa
const key = t[0] + '|' + t[t.length - 1];
```

Þetta gerist á **þremur** stöðum, ekki tveimur:

| Staður | Lína | Hlutverk |
|---|---|---|
| `sanctionsIndex()` | 54 | byggir vísitöluna |
| `sanctionsHandler()` | 68 | opinberi endapunkturinn `/api/sanctions` |
| `kycScreenKt()` | 139 | **Áreiðanleikavaktin** — seld KYC-vöktun |

Þriðji staðurinn var ekki í upphaflegu erindinu og er sá alvarlegasti: það er söluvaran.

### Umfang gatsins

Á `web/public/gogn/sanctions.json` (62.310 færslur): **3.419 eins-orðs færslur (5,5%)** komast aldrei í vísitöluna.

Þar á meðal eru raunverulegir aðilar sem worker sér **alls ekki** í dag:

```
ROSNEFT [OFAC]    Sberbank [ESB]    LUKOIL [OFAC]    Taliban [ESB,OFAC]
Hamas [ESB,OFAC]  ISIL [OFAC]       DAESH [OFAC]     ETA [OFAC]
PKK, PIJ, FPLP, KADEK, ANO, JIP, PILF, PATF  [ESB/OFAC]
```

Ef íslenskt félag skráði Rosneft sem eiganda myndi F9 segja „Engin samsvörun".

Hin áttin er jafn slæm: félagsnafn er strípað af félagsformi (`fsStutt`) áður en það er skimað, svo `Marel hf` → `Marel`, `Origo hf` → `Origo` — öll eins-orðs og því aldrei skimuð.

---

## 2. Af hverju einföld eins-orðs samsvörun er óskipanleg

Mæling á raungögnum, 2026-07-31. Reglurnar keyrðar á **8.240 raunverulegum íslenskum nöfnum** úr `gogn/birgjar.json`, `logbirting.json`, `styrkir.json`, `rekstrarleyfi.json`, `ferdaleyfi.json`, `skip_owners.json`, `eftirlit.json`, `utbod_urslit.json`, `utbod.json`, `sjavarutvegur.json`, `ivilnanir.json`, `lyf.json`.

**3.621 þeirra (44%) falla í eitt tóken** eftir `fsStutt` + `sancNorm`.

Nákvæm eins-orðs samsvörun gefur **17 samsvaranir — allar 17 falskar, engin sönn:**

```
"Lyra ehf."    → LYRA [OFAC]         "Fox ehf."    → Fox [OFAC]
"Oceanic ehf"  → OCEANIC [OFAC]      "Versa ehf"   → VERSA [OFAC]
"Neptune ehf"  → NEPTUNE [OFAC]      "TSA ehf"     → TSA [ESB]
"Infinity ehf" → INFINITY [OFAC]     "Tak ehf."    → TAK [ESB,OFAC]
"Issa ehf"     → Issa [OFAC]         "Navis ehf."  → "NAVIS 6" [OFAC]
"Kani ehf."    → "бригада Kani"      "SSL25 slf."  → SSL [ESB]
```

Verra: **19 af 40 venjulegum vörumerkja-orðum eru á eins-orðs listanum** — `saga`, `nova`, `orion`, `titan`, `omega`, `aqua`, `luna`, `fox`, `zenith`, `versa`. **Nova er eitt stærsta fjarskiptafélag Íslands.**

### Þrengri afbrigði duga ekki

| Regla | Falskar | Heldur PKK/PIJ/FPLP/ANO? |
|---|---|---|
| R0 nákvæmt tóken | 17 | ✅ |
| R1 + birtingarnafn eitt orð | 13 | ✅ |
| R2 + fyrirspurn hreinir bókstafir | 11 | ✅ |
| R3 + tóken ≥ 5 stafir | 4 | ❌ **fellir þau öll** |

Aðgreiningin er ekki til í nafninu. „Tak ehf." og refsilistans „TAK" eru sami strengur. Munurinn er auðkenni — lögsaga, skráning, heimilisfang — ekki stafsetning.

### Normaliserunar-gervifærslur

**217 af 3.419** eru ekki raunveruleg eins-orðs nöfn heldur afurð þess að `sancNorm` hendir öllu utan `[a-zðþæ\s]`:

```
"полковник Omega"                → omega
"Department 140/16"              → department
"Организация ... Ulema, Пакистан" → ulema
"NAVIS 6"                        → navis
"Στρατηγός Mudacumura"           → mudacumura
```

Kýrillískt, grískt og tölur falla burt. Þetta eru verstu falsjákvæðurnar — `omega` og `department` myndu samsvara ógrynni félaga.

---

## 3. Áhrifasvæði falskrar samsvörunar

Refsilista-samsvörun er ekki upplýsandi merki. Í `web/src/lib/kyc.mjs`:

```js
if (signal === 'sanctions') {
  for (const h of _added(prev.hits, cur.hits, (x) => x.name))
    ev.push({ kind: 'sanctions_hit', severity: 'critical', detail: h });
}
...
if ((L('sanctions').hits || []).length || ...) return 'Há';
```

Ein falsk samsvörun gefur því:

1. `severity: 'critical'` atburð í varanlega audit-slóð,
2. `deriveRisk → 'Há'` áhættueinkunn á mótaðila,
3. **tafarlausan póst** frá `kycCriticalCron`, sem keyrir einmitt `['sanctions', 'legal']`,
4. `⚠️ Möguleg samsvörun við refsilista` á `/fyrirtaeki/⟨kt⟩/`.

Til viðskiptavinar sem borgar fyrir regluvörslu.

**Athugið:** `/refsilistar/`-leitarsíðan sækir `sanctions.json` beint client-megin og notar **ekki** `/api/sanctions`. Eins-orðs leit virkar þar nú þegar. Gatið er eingöngu í sjálfvirku skimuninni — og þar er líka öll áhættan.

---

## 4. Hönnun

Meginhugmyndin: **eins-orðs samsvörun er veikari sönnunargagn og á að vera aðgreind sem slík — byggingarlega, ekki með varúð.**

### 4.1 Ný hrein eining: `web/src/lib/refsilistar.mjs`

`sanctionsIndex` er memo-að í modúl-breytunni `SANCTIONS_IDX`, svo prófin komast ekki að því. Leyst eins og `fyrirtaeki-lanshaefi.mjs` og `ordspor.mjs` gerðu: rökin fara í hreina einingu, worker heldur aðeins env/cache-umbúðunum.

```js
export const sancNorm = (s) => ...            // flutt óbreytt úr veitur.mjs

export function byggjaVisitolu(names)         // → { sterk: Map, veik: Map }
export function skima(visitala, rawNafn)      // → null | { flokkur, listi, listar }
```

`skima` skilar `flokkur: 'sterk' | 'veik'`, `listi` = birtingarnafn færslunnar á listanum
(sama og `m.nafn` í núverandi `sanctionsHandler`), `listar` = listarnir sjálfir („ESB,SÞ,OFAC").

**Flokkunin sjálf er líka í einingunni**, ekki afrituð í hvorn kallstað:

```js
export function flokkaNofn(visitala, nofn, { dedup } = {})   // → { sterkar, veikar }
```

Ástæðan er prófanleiki, ekki snyrtimennska. Ákvörðunin „í hvorn lista fer þessi samsvörun" er nákvæmlega sá staður þar sem veik samsvörun gæti lekið í `hits` og framkallað falska krítíska viðvörun. Sé hún afrituð inni í `kycScreenKt` — sem er hvorki flutt út né prófanlegt án D1-mokks — er hún varin af engu: stökkbreytingarpróf staðfesti að hægt væri að sameina lögin þar án þess að nokkurt próf félli. Í einingunni er hún prófuð beint.

Kallstaðirnir móta sínar eigin færslu-lagnir úr niðurstöðunni (`{ name }` í `kycScreenKt`, `{ nafn, listi, listar }` í `sanctionsHandler`) og ráða sjálfir hvort dedup er beitt.

Engin `env`-tenging, engin `fetch`, engin memo-un. Að fullu prófanleg.

### 4.2 Tvær aðskildar vísitölur

| Vísitala | Lykill | Inntak |
|---|---|---|
| `sterk` | `fyrsta\|síðasta` | færslur með **≥2** normaliseruð tóken — **algjörlega óbreytt hegðun** |
| `veik` | fullt normaliserað tóken | eins-orðs færslur **þar sem birtingarnafnið (`nafn`) er líka eitt orð** |

Seinna skilyrðið hendir 217 gervifærslunum: `полковник Omega`, `Department 140/16`, `NAVIS 6` komast aldrei í `veik`.

Fyrsta færsla vinnur við árekstur (`if (!idx.has(key))`), eins og núverandi kóði gerir.

### 4.3 Fyrirspurnar-hliðin

```
fjöl-orða nafn  → aðeins  sterk    (nákvæmlega eins og í dag)
eins-orðs nafn  → aðeins  veik     (nákvæmt jafnræði, ekki forskeyti)
```

Krossuppfletting er aldrei leyfð — eins-orðs fyrirspurn nær ekki í `sterk` og öfugt.

**Vörn á fyrirspurnar-hlið:** eftir uppflettingu verður fyrirspurnin að vera **stafrétt sama nafn og birtingarnafn færslunnar, tölustafir meðtaldir**:

```js
alnum(fyrirspurn) === alnum(faersla.nafn)      // alnum heldur a-z, 0-9, ð, þ, æ
```

Greinarmerki og broddstafir eru hunsuð, svo `"Hamas."` samsvarar `"Hamas"`.

Þetta fellir tvennt sem lyklun ein og sér hleypir í gegn:

| Fyrirspurn | Vísitölufærsla | Niðurstaða |
|---|---|---|
| `SSL25` | `SSL` | hafnað — `ssl25` ≠ `ssl` |
| `Maia` | `MAIA-1` | hafnað — `maia` ≠ `maia1` |
| `MAIA-1` | `MAIA-1` | samsvarar |
| `Hamas.` | `Hamas` | samsvarar |

> **Hvers vegna ekki einfaldari regla.** Fyrri drög notuðu vörn á fyrirspurninni einni (`/^\p{L}+$/u`, eða samanburð á stafafjölda við hennar eigin tóken). Rýni á raungögnum felldi hvort tveggja: sú regla gerði **35 af 3.230** færslum ófinnanlegar með sínu eigin nafni (`NETEX24`, `ARZAMAS-16`, `CHELYABINSK-70`) á meðan stytt mynd sama nafns samsvaraði — öfugsnúið. Hún hleypti líka bandstriks-færslum í gegn (`Maia` → `MAIA-1`). Samanburður við birtingarnafnið lagar bæði: sjálfs-samsvörun fer í 3.230/3.230 og fjöldi falskra á íslenskum nöfnum helst **óbreyttur**.

### 4.4 Vírun — kjarninn í öryggi hönnunarinnar

`signalEvents` og `deriveRisk` lesa **eingöngu** `.hits`. Þess vegna fer veika lagið í **systur-svið**, aldrei í `hits`:

```js
sanctions: { hits: sHits, veikar: sVeikar }
```

Ekkert sem les `.hits` er snert. Þar með er `severity:'critical'`, `deriveRisk → 'Há'` og `kycCriticalCron`-pósturinn varinn af **byggingu kóðans**, ekki af aðgát. Nova hf. getur ekki framkallað krítíska viðvörun því kóðaleiðin er ekki til.

Sama gildir um endapunktinn:

```js
{ hits, veikar, updated, n, nVeik }
```

`hits` heldur nákvæmlega sinni merkingu, svo núverandi neytendur breytast ekki. `n` helst = `sterk.size` (óbreytt tala); `nVeik` = `veik.size` bætist við.

**Hreinskilni um það sem eftir stendur:** hönnunin fjarlægir ekki falsjákvæðurnar — hún endurflokkar þær. Af 17 mældum samsvörunum falla 4 út (gervifærslur + `SSL25`) og **11 verða eftir sem veikar** (`Nova`-flokkurinn). Það er ásættanlegt einmitt af því að veikt lag er merkt sem óstaðfest og keyrir hvorki áhættueinkunn né póst. Ef veikar samsvaranir yrðu síðar gerðar að vöktuðum atburði fellur sú forsenda — sjá §6.

### 4.5 Þriðji kallstaðurinn

`kycScreenKt` notar sömu `skima`-einingu og hinir tveir. `t.length < 2`-sían hverfur alls staðar í einu og lyklunar-rökin eru til á **einum** stað í stað þriggja.

### 4.6 Birting í F9

Ein aðskilin lína í `fsWireSanction` (`web/src/pages/fyrirtaeki.astro`):

> ℹ️ **N eins-orðs samsvörun** — nafnið er eitt orð og samsvörun er því veik. Krefst auðkennis-staðfestingar.

Hlutlaus litur. **Ræður aldrei lit flísarinnar** — `fs-ar b` (rautt) er áfram eingöngu drifið af `hits`. Flís með veikar samsvaranir en engar sterkar er ekki rauð.

Hegðun eftir samsetningu:

| `hits` | `veikar` | Flís | Texti |
|---|---|---|---|
| 0 | 0 | `fs-ar g` grænt | „Engin samsvörun" (óbreytt) |
| 0 | >0 | `fs-ar g` grænt | „Engin staðfest samsvörun" + veika línan |
| >0 | hvað sem er | `fs-ar b` rautt | núverandi texti + veika línan fyrir neðan |

Veika línan birtist alltaf þegar `veikar` er ekki tóm — líka samhliða sterkum samsvörunum, sem sérstök lína, ekki samtvinnuð.

---

## 5. Prófanir

Ný skrá `web/src/lib/refsilistar.test.mjs` (sama venja og `kyc.test.mjs`, `lobbyvakt.test.mjs`). Keyrt með `cd web && npm test`.

**Afturhvarf — sterka lagið óbreytt**
- fjöl-orða nafn samsvarar eins og áður; `fyrsta|síðasta`-lyklun óbreytt
- fjöl-orða nafn sem áður samsvaraði gerir það enn

**Nýja geta**
- `Hamas`, `PKK`, `PIJ`, `FPLP`, `KADEK`, `ANO` finnast — með `flokkur: 'veik'`
- `Rosneft`, `LUKOIL`, `Taliban` finnast sem `veik`

**Falsjákvæðu-vörnin (kjarninn)**
- `Nova`, `Saga`, `Fox`, `Tak`, `Orion`, `Titan` → `veik`, **aldrei** `sterk`
- gervifærslur útilokaðar úr `veik`: `"полковник Omega"`, `"Department 140/16"`, `"NAVIS 6"`, `"бригада Kani"`
- `"SSL25"` samsvarar ekki `"SSL"`
- eins-orðs fyrirspurn nær ekki í `sterk`-vísitöluna
- fjöl-orða fyrirspurn nær ekki í `veik`-vísitöluna

**Varnarpróf gegn `kyc.mjs`** — það sem ver söluvöruna:
- payload með `sanctions.veikar` fullum og `hits: []` framkallar **engan** `sanctions_hit`-atburð í `signalEvents`
- sama payload gefur **ekki** `'Há'` í `deriveRisk`

**Jaðartilvik**
- tómt/rusl-inntak, nafn sem normaliserast í tóman streng
- `sanctions.json` vantar eða er gallað → tóm vísitala, engin undantekning

---

## 6. Það sem er vísvitandi EKKI gert

- **Engin lækkun á þröskuldi sterka lagsins.** Fjöl-orða hegðun er bitfyrir-bit óbreytt.
- **Enginn atburður fyrir veikar samsvaranir í v1.** `signalEvents` fær ekki nýja tegund. Veika lagið er sýnilegt í payload og á síðunni; að breyta því í vaktaðan atburð er sjálfstæð ákvörðun með eigin FP-mati.
- **Engin árekstravörn gegn íslenskri félagaskrá.** Sterkasta lausnin væri að merkja við byggingu hvaða eins-orðs tóken rekast á skráð íslensk félagsnöfn (`rosneft` → sterkt, `nova` → veikt). Það krefst landsdekkandi nafnalista og er stærra verk. Skráð sem framhald.
- **`sancNorm` er ekki lagað.** Að hún hendi kýrillísku og tölum er raunverulegur galli, en að breyta henni hreyfir sterka lagið líka og krefst eigin afturhvarfs-mats.

---

## 7. Framhald

1. Árekstravörn gegn félagaskrá í `build_sanctions.mjs` — myndi leyfa `rosneft`/`lukoil` í sterka lagið og halda `nova`/`saga` veikum.
2. `sancNorm` sem varðveitir umritun í stað þess að henda henni (kýrillískt → latneskt).
3. Meta hvort veikar samsvaranir eigi að verða `severity: 'low'` atburður í vöktuninni.

---

## 8. Mælingin — hvernig hún var gerð

Reglurnar voru endurgerðar utan worker og keyrðar á óbreyttum `web/public/gogn/sanctions.json` gegn nöfnum úr 12 raungagna-skrám. Talningin sem vísað er til (62.310 færslur / 3.419 eins-orðs / 5,5%) stemmir við mælingu Arons frá sama degi.
