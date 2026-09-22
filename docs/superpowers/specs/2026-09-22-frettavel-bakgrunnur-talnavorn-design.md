# Fréttavél: bakgrunnur úr gögnum Karp + talnavörn

**Dagsett:** 22.9.2026 · **Samþykkt af Aroni:** tillögur 1 og 2, „keyrðu þetta svona"

## Vandinn (mælt 22.9)

- 116 fréttir í straumnum, 27 tegundir. **Miðgildi textalengdar 171 stafur** (1–2 setningar); markaðsfréttir ~59.
- Orsökin er efniviðurinn, ekki skrifin. `aiWrite()` sendir Claude AÐEINS `facts` skynjarans og bannar allt annað
  (rétt regla gegn uppspuna). `facts` eru rýr: markaðsfrétt fær `{felag, breyting, verd}`.
- Allar fréttir dagsins í EINU kalli: 16 fréttir, `max_tokens: 5000`, `claude-opus-4-8`.
- Vélin les 38 af 106 gagnaskrám. Fréttasíðan birtir textann sem eina `<p>`.

## Markmið

Lengri og ítarlegri fréttir sem eru jafn traustar og nú: hver tala í birtum texta er rekjanleg til gagna.

## Hönnun

### 1. Bakgrunnur (`skriptur/lib/frettasamhengi.mjs`, hrein eining)

`baetaVidBakgrunni(events, gogn, { idag })` bætir `facts.bakgrunnur` (hlut) á studdar tegundir. Aðeins svið með
gildi eru sett. Allt er reiknað af gögnum; ekkert er giskað.

⚠ Nafnið `samhengi` er þegar notað: `e.samhengi` er útreiknuð LÍNA sem birtist í kassa á síðunni og fer aldrei til
Claude. Nýja samhengið heitir því `bakgrunnur` og býr inni í `facts` svo það fari BÆÐI til Claude og í talnavörnina.

| Hópur | Tegundir | Bakgrunnur |
|---|---|---|
| Útboð | `urslit` | sigurvegari: fyrri útboð unnin (fjöldi, samtals kr, síðast), ríkisgreiðslur 12 mán, ársreikningur (ár, sala, hagnaður) ef til · kaupandi: fjöldi útboða síðustu 12 mán |
| Markaðir | `mark` | viðskiptadagar í röð, hæsta og lægsta gengi í röðinni, breyting frá upphafi raðar (%), stærsta dagshreyfing í röðinni og hvort hreyfing dagsins sé stærri, breyting úrvalsvísitölu sama dag |
| Hagtölur | `verdbolga`, `vextir`, `vika` | verðbólga 12 mán fyrr, 12 mán hámark/lágmark, verðbólgumarkmið 2,5 og frávik, raunstýrivextir, dagsetning síðustu vaxtabreytingar, atvinnuleysi 12 mán fyrr |
| Lyf | `lyf` | önnur lyf á skrá með sama ATC-kóða og þar af í skorti, lyf í skorti alls, dagsetning sem skortur sást fyrst (nýtt state-svið `lyfFyrst`) |
| Fyrirtæki | `styrkur`, `vorumerki` | eins og sigurvegari í útboðum + fyrri styrkir sama þega |
| Gjaldþrot | `gjaldthrot` | eins og sigurvegari í útboðum, á kennitölu úr Lögbirtingablaðinu (síðasti ársreikningur o.fl.) |

**Breyting frá kynningu (22.9, við áætlanagerð):** dómar fá EKKI bakgrunn. `domar_ai.json` geymir aðeins 78 dóma,
brot af dómum ársins, svo „dómar Hæstaréttar á árinu" væri villandi og bryti regluna „ekkert giskað". Dómar njóta
samt nýju ritunarinnar og talnavarnarinnar. Gjaldþrot (vægi 9) kemur í staðinn sem sjötti hópurinn.
**Persónuvernd:** fyrirtækjasamhengi aðeins fyrir lögaðila; gefin kennitala einstaklings (fyrsti stafur 0–3) stöðvar
samhengið alveg, líka nafnaleit.

**Nafn → kennitala:** aðeins ótvíræð samsvörun eftir stöðlun (lágstafir, án „ehf./hf./ohf." og greinarmerkja) í
`felagaskra.json`. Tvíræð eða engin samsvörun → ekkert fyrirtækjasamhengi (frekar en að giska).
**Markaðsgögn** ná aðeins 40 viðskiptadaga aftur (`hist`); „52 vikna bil" er því EKKI til og kemur ekki fram.

### 2. Talnavörn (`skriptur/lib/talnavorn.mjs`, hrein eining)

`athugaTolur(texti, facts) → { ok, rangar: [strengir] }`. Hver tala í titli og texta verður að finnast í `facts`:

- **Tölur** á íslensku sniði (`1.024.188.084`, `7,3`, `17,7`), með `%`/„prósent" og einingum (þúsund, milljón,
  milljarður í öllum föllum). Leyfilegt ef til er gildi v í `facts` þannig að |tala − v| ≤ hálf birt nákvæmni
  (`17,7 milljörðum` ↔ 17.698.591.083). Formerki skipta ekki máli (`lækkaði um 7,3%` ↔ −7,3).
- **Dagsetningar og ártöl:** ISO-dagsetningar í `facts` gefa dag, mánuð og ár sem leyfileg gildi.
- **Númer** með `/` eða `-` (`28/2026`, `649909-2026`, `80/400`) verða að standa sem strengur í `facts`.
- Útreiknaðar tölur sem ekki eru í `facts` falla — það er ætlunin. Gagnleg afleidd gildi reiknar bakgrunnurinn.

### 3. Ritun (`skriptur/lib/frettaskrif.mjs`)

`skrifaFrettir(events, { client, model, hamark })`:
- **Ein frétt í hverju kalli**, sjálfgefið líkan `claude-opus-5` (`KARP_FRETTAVEL_MODEL` yfirskrifar),
  `cache_control` á kerfisfyrirmælum, kostnaðarþak `hamark` (30) á keyrslu; `noai` óbreytt.
- **Snið:** tölufréttir (`mark`, `vextir`, `verdbolga`, `vika`, …) 2–4 setningar í einni málsgrein; efnismál 2–3
  málsgreinar aðskildar með auðri línu (hvað gerðist → samhengi úr bakgrunni → bakgrunnur). Titill ≤ 90, texti ≤ 2200.
- Reglan „aðeins úr facts, engar orsakaskýringar/spádómar, hlutlaus tónn" helst orðrétt að efni.
- **Talnavörn eftir hverja frétt.** Fall → EITT endurskrif með lista yfir tölurnar sem fundust ekki. Fall aftur (eða
  ógilt JSON / API-villa) → sniðmátstexti skynjarans helst, `ai: false`, og `talnavorn: [rangar]` skráð.
- Skilar `{ skrifadar, endurskrifadar, hafnad }` sem prentast í keyrslunni.

### 4. Samþætting og örugg innleiðing (`build_frettavel.js`)

- `baetaVidBakgrunni` keyrir á eftir `detect()` (og RÁS) á öllum atburðum.
- **Rofi:** nýja ritunin keyrir aðeins ef `KARP_FRETTAVEL_NYTT=1` eða `--thurr`. Annars gamla `aiWrite` óbreytt.
  Dagleg keyrsla (`refresh-data.yml`) setur rofann EKKI fyrr en Aron hefur samþykkt sýnishorn.
- **Prufuhamur `--thurr [--endurskrifa N]`:** skrifar EKKERT (hvorki state, seen, straum, safn né RSS). Skrifar
  fréttir dagsins OG N nýlegar fréttir úr safninu af sex hópunum (gamli texti vs nýr), prentar læsilega samantekt
  og skrifar hana í `$GITHUB_STEP_SUMMARY` ef til. Markaðsfréttum eldri en 2 daga er sleppt í endurskrifi
  (verðsagan hefur hreyfst).
- **Vinnuflæði `.github/workflows/frettavel_prufa.yml`** (aðeins `workflow_dispatch`): `npm ci`, keyrir prufuham
  með `ANTHROPIC_API_KEY`. Engin commit.
- Hámarkslengd texta í straumi/safni hækkar úr 900 í 2200.

### 5. Birting

- `malsgreinar(texti)` í `web/src/lib/frettavel.mjs` (skipt á auðum línum).
- `frettavel/[id].astro`: hver málsgrein í `<p class="fv-body">`. `frettavel.astro`: aðalfrétt sýnir tvær fyrstu,
  kort þá fyrstu. RSS: málsgreinar sameinaðar með bili. Eldri textar án auðra lína = ein málsgrein (óbreytt).

## Villumeðhöndlun

- Gagnaskrá vantar eða er skemmd → það svið bakgrunns sleppt, fréttin skrifuð úr því sem til er.
- API-villa, ógilt JSON, talnavarnarfall eftir endurskrif → sniðmát (eins og í dag þegar lykil vantar).
- Prufuhamur getur aldrei snert birt gögn.

## Prófanir

- `talnavorn.test.mjs`: raundæmi úr straumnum 22.9 (Síminn 7,3%, Dagar 1.024.188.084, 17,7 milljörðum, dómsnúmer)
  standast; uppspunnin tala, uppspunnið ártal og rangt námundað gildi falla.
- `frettasamhengi.test.mjs`: hver hópur með gögnum á raunsniði; tvíræð nafnasamsvörun gefur ekkert fyrirtækjasamhengi;
  vantandi skrá fellir ekki.
- `frettaskrif.test.mjs` (gervi-client): stenst → `ai`; fall → endurskrif sem nefnir röngu tölurnar; tvö föll →
  sniðmát + `talnavorn`; ógilt JSON → sniðmát; þak virt; `noai` sleppt; `cache_control` á kerfisfyrirmælum.
- `malsgreinar` próf. Stökkbreytipróf á talnavörninni og endurskrifinu.
- **Raunprófun:** prufuvinnuflæðið í CI; sýnishorn sýnd Aroni áður en rofinn fer í `refresh-data.yml`.

## Utan verks

Nýir skynjarar (tillaga 4), vikuleg fréttaskýring og fjölbreyttara orðalag (tillaga 5) koma síðar.
