# Creditinfo-jafngildi: stjórn + ársreikningur-PDF + veðbókarvottorð — HÖNNUN

_Dags. 2026-07-08 · grein `claude/dreamy-kowalevski-60978d` · samþykkt af Aroni (sjálfstætt stjórn-rör)_

Þrjú afmörkuð verk sem efla Creditinfo-jafngildi karp.is-skýrslnanna. **Aðeins opinber
gögn.** Engin gögn frá lánshæfismati/vanskilaskrá. RSK: á-eftirspurn, aldrei fjöldakall.

---

## Rannsóknarniðurstöður (staðfest á raunverulegum gögnum 2026-07-08)

- **Opna RSK-detail-síðan** (`skatturinn.is/fyrirtaekjaskra/leit/kennitala/<kt>`) hefur
  **enga skipulagða stjórnartöflu** — ólíkt „Raunverulegum eigendum". Það eina inline er
  „Forráðamaður": **einn** skráður forráðamaður + hlutverk (t.d. Brim hf.: „Kristján
  Þórarinn Davíðsson – stjórnarformaður"). Vörðurinn sækir þetta þegar (`f.radamenn`,
  [worker.js:666](../../../web/worker.js), birt í [fyrirtaeki.astro:864](../../../web/src/pages/fyrirtaeki.astro)).
- **Full stjórn er frí** en aðeins í niðurhalanlega skjalinu **„Gjaldfrjálst yfirlit"
  (typeid=9)** — hnappur `class="tocart" data-typeid="9"` við hlið gjaldskylda „Staðfests
  vottorðs" (typeid=8). Sótt um sömu puppeteer/vefverslun-leið og ársreikningarnir.
- **Staðfest niðurhal** (Brim hf. 5411850389): 156KB PDF, 2 síður, **hreinir íslenskir
  stafir** (0 brengluð `�` — ToUnicode-galli ársreikninga-PDF á EKKI við hér).
  `pdftotext -raw -enc UTF-8` skilar föstu sniði, einn aðili per línu:
  ```
  Stjórn félagsins skipa samkvæmt fundi þann: 19.03.2026
  161160-2889 Kristján Þórarinn Davíðsson, Kirkjusandi 1, 105 Reykjavík, Stjórnarformaður
  290750-6879 Anna G Sverrisdóttir, Grjótaseli 13, 109 Reykjavík, Meðstjórnandi
  ... (fleiri meðstjórnendur) ...
  Endurskoðandi/skoðunarmaður:
  521098-2449 Deloitte ehf., Dalvegi 30, 201 Kópavogur, Endurskoðandi
  Framkvæmdastjóri:
  220860-4429 Guðmundur Kristjánsson, Nesvegi 107, 170 Seltjarnarnes, Framkvæmdastjórn
  Prókúruhafar:
  220860-4429 Guðmundur Kristjánsson, Nesvegi 107, 170 Seltjarnarnes, Prókúruhafi
  290864-7719 Inga Jóna Friðgeirsdóttir, Gnitakór 14, 203 Kópavogur, Prókúruhafi
  ```
  Snið línu: `<kt> <nafn m/bilum>, <heimilisfang>, <póstnr borg>, <hlutverk>`.
  Aukalega: `Firmað rita: <regla>`, `Hlutafé`, dagsetning stjórnarfundar.

---

## Verk 1 — Full stjórn (sjálfstætt á-eftirspurnar-rör)

Speglar núverandi `arsreikningur`/`eigendur`-rörin (sjá minnisnótu `rsk-ondemand-pipeline`).
Cloudflare-vörður keyrir ekki vafra → PDF-þáttun verður í GitHub-Action.

### Gagnaflæði
1. **`fyrirtaeki.astro`** (`fsStjorn(kt, owned)`): `fetch('/gogn/stjorn/<kt>.json')`.
   Til → fyllir „🪑 Stjórn & prókúra"-hólfið. `{engin:true}` → loka-ástand. 404 + `owned`
   → `POST /api/stjorn/request?kt=` + poll (speglar `fsPollArsreikningur`).
2. **`worker.js`** (`stjornRequestHandler`): afrit af `arsreikningurRequestHandler` —
   krefst `GITHUB_DISPATCH_TOKEN` + innskráðs notanda, `repository_dispatch
   { event_type:'stjorn', client_payload:{kt} }`. Ný leið `/api/stjorn/request`.
3. **`.github/workflows/stjorn.yml`**: afrit af `arsreikningur.yml`, `types:[stjorn]`,
   `+ sudo apt-get install -y poppler-utils` (fyrir `pdftotext`), keyrir
   `node skriptur/build_stjorn.mjs $KTS`, committar `web/public/gogn/stjorn/`.
4. **`skriptur/lib/rsk.mjs`** — `fetchStjorn(kt)`:
   `addToCart(kt, kt, 9)` → `downloadPdf(kid)` → skrifa temp-PDF →
   `pdftotext -raw -enc UTF-8 temp.pdf -` (child_process) → regla þáttar.
5. **`skriptur/build_stjorn.mjs`** — CLI, kt → `web/public/gogn/stjorn/<kt>.json`
   (speglar build_arsreikningar). Skrifar `{engin:true, astaeda}` ef ekkert þáttast.

### Þáttari (í Node, engin ný Python-skrá)
- Anker: lína sem inniheldur `Stjórn félagsins skipa`.
- Fyrir HVERJA línu sem passar `^(\d{6}-\d{4})\s+(.+?),\s*(.+?),\s*(.+?),\s*([^,]+?)\s*$`:
  hlutverk = síðasti komma-reitur; nafn = fyrsti reitur (án kt-forskeytis).
- Kaflahausar (`Endurskoðandi/…:`, `Framkvæmdastjóri:`, `Prókúruhafar:`) fylgt eftir svo
  hver aðili fái réttan flokk; normalísa `Framkvæmdastjórn`→`Framkvæmdastjóri`.
- Röðun til birtingar: stjórnarformaður → meðstjórnendur → varamenn → framkvæmdastjóri
  → prókúruhafar → endurskoðandi.

### 🔒 Persónuvernd (fastmótað í hönnun)
JSON-inn er **committaður í opinbert repo + þjónað opinberlega**. Yfirlitið inniheldur
kennitölur og heimilisföng einstaklinga → **kt OG heimilisfang eru ALDREI geymd né birt**.
Geymt/birt: **aðeins `{ nafn, hlutverk }`** — sama disclosure og raunverulegir eigendur
(nafn án kt). Félagsupplýsingar `firmaritun` ("Meirihluti stjórnar") og `dags` (stjórnar-
fundur) mega fylgja. Örfélög/einyrkjar geta haft 1 aðila — það er í lagi (rétt = rétt).

### JSON-snið `web/public/gogn/stjorn/<kt>.json`
```json
{ "kt":"5411850389", "nafn":"Brim hf.", "sott":"2026-07-08",
  "heimild":"RSK fyrirtækjaskrá — Gjaldfrjálst yfirlit (typeid 9), gjaldfrjálst",
  "firmaritun":"Meirihluti stjórnar", "dags":"19.03.2026",
  "stjorn":[ {"nafn":"Kristján Þórarinn Davíðsson","hlutverk":"Stjórnarformaður"},
             {"nafn":"Deloitte ehf.","hlutverk":"Endurskoðandi"} ] }
```
Merki-JSON þegar ekkert þáttast: `{ kt, nafn, sott, engin:true, astaeda }`.

### Birting í „🪑 Stjórn & prókúra"-hólfinu ([fyrirtaeki.astro:864](../../../web/src/pages/fyrirtaeki.astro))
- Byggð stjórn til → hólf `filled`, listi „Nafn — hlutverk" flokkað, `firmaritun` neðst,
  heimild „RSK fyrirtækjaskrá (gjaldfrjálst yfirlit)".
- Annars: núverandi frí-teaser (skráður forráðamaður + hlutverk úr `f.radamenn`) — fægt svo
  það líti klárað út; fjarlægi „bíða API-aðgangs"-textann.

### Aðgangsstýring
Dispatch aðeins fyrir innskráða/eigendur (eins og hin rörin, gegn misnotkun). Nafnlaus
uppfletting sér frí-teaser-inn.

---

## Verk 2 — Ársreikningur-PDF niðurhal

`build_arsreikningar.mjs` sækir PDF og **eyðir** því ([lína 91](../../../skriptur/build_arsreikningar.mjs)).
- Vista **nýjasta árs** PDF (fyrsta í `nyjust`, i===0) → `web/public/gogn/arsreikningar/pdf/<kt>.pdf`.
- Skrá í `<kt>.json`: `pdf:"pdf/<kt>.pdf"`, `pdfAr:<ár>`.
- `fyrirtaeki.astro`: **„📄 Sækja ársreikning (PDF)"**-tengill hjá KPI-hólfinu þegar
  `pdf`-reitur er til (`<a href="/gogn/arsreikningar/pdf/<kt>.pdf" download>`).
- Opinbert skjal (lög nr. 3/2006) → endurhýsing í lagi, aðeins á-eftirspurn.
- **⚠ Git-vöxtur:** margar PDF í repo þenja sögu → flagga R2-flutning í samantekt (V1 í
  web/public/gogn í lagi).

---

## Verk 3 — Veðbókarvottorðs-tengill á fasteignaskýrslu

`fasteignavakt.astro`, hjá skýrslu-aðgerðum/kaupa-svæði:
- Tengill/hnappur **„🔗 Sækja veðbókarvottorð"** → `https://island.is/vedbokarvottord`
  (`target="_blank" rel="noopener"`) + skýring „(opinbert vottorð, 3.100 kr, greitt á
  island.is)".
- Athuga djúptengil f. forfyllingu fastanúmers/heimilisfangs; styðji island.is það ekki,
  beinn tengill. **Ekki fullyrða að við eigum gögnin** — veðbönd eru leyfisskyld, aðeins
  tengt í opinberu þjónustuna.

---

## Staðfesting (build verður að vera grænn)
- `cd web && npx astro build` — verður að heppnast (~197 síður).
- `node --check web/worker.js`; `node --check` á `skriptur/build_stjorn.mjs`
  + breyttri `skriptur/lib/rsk.mjs` + `skriptur/build_arsreikningar.mjs`.
- `stjorn.yml`/`arsreikningur.yml`: YAML-gilt.
- Handvirk sönnun: `node skriptur/build_stjorn.mjs 5411850389` → skoða
  `gogn/stjorn/5411850389.json` (nafn+hlutverk, ENGIN kt/heimilisfang).

## Skrár snertar
| Skrá | Breyting |
|---|---|
| `skriptur/lib/rsk.mjs` | + `fetchStjorn(kt)` |
| `skriptur/build_stjorn.mjs` | **ný** |
| `skriptur/build_arsreikningar.mjs` | vista PDF + `pdf`-reit (verk 2) |
| `.github/workflows/stjorn.yml` | **ný** |
| `web/worker.js` | + `stjornRequestHandler` + leið |
| `web/src/pages/fyrirtaeki.astro` | fylla stjórn-hólf (v1) + PDF-tengill (v2) |
| `web/src/pages/fasteignavakt.astro` | veðbókarvottorðs-tengill (v3) |

## Áhætta / afmörkun
- **Samhliða `/eigendur/`-grein** snertir worker.js, fyrirtaeki.astro, rsk.mjs → held
  breytingum þröngum; Aron leysir árekstra við merge.
- **RSK hraðatakmörk:** aðeins á-eftirspurn, aldrei fjöldakall (workflow tekur við einni kt).
- **Yfirlits-snið:** staðfest á 1 stóru hf; þáttari verður varkár (sleppir línum sem passa
  ekki reglu) svo óvænt snið brjóti ekki bygginguna — skrifar `engin:true` frekar en að falla.
