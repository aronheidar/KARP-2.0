# Tengslakort (eigenda- & stjórnarnet) — hönnunar-spec

**Dagsetning:** 2026-07-12
**Staða:** Samþykkt hönnun (bíður spec-yfirferðar → writing-plans)

## Markmið

Myndrænt tengslakort (network graph) inni í **Endanlegir eigendur** skýrslunni (`/eigendur/`)
sem sýnir tengsl **endanlegra eigenda** og **stjórnarmanna/fyrirsvars** þvert á fyrirtæki —
þ.e. sameinar eignarhald (UBO-tré) og stjórnarsetu í einni sjónrænni mynd.

**Persónuverndar-fyrirvari (úr DPIA, leið A — lögmætir hagsmunir/KYC):** kortið birtir EKKI nöfn
á öllum hnútum. Fyrirtæki (lögaðilar) og einstaklingar sem tengjast rót-félaginu BEINT eru
nafngreindir; fjarlægari einstaklingar eru grímuklæddir og nöfn þeirra fara ekki einu sinni í
svarið til vafrans.

## Ákvarðanir (festar í brainstorming 2026-07-12)

1. **Nafna-felun:** nöfn á lykil-fólki (rót-tengdum), fjarlægari fólk grímuklætt. Fyrirtæki alltaf nafngreind.
2. **Staðsetning:** nýtt „Kort"-flið innan `/eigendur/` skýrslunnar, skiptir við núverandi „Listi"-sýn (stjórnendaskýrslu). Erfir login + kaup (uboOwned).
3. **Tækni:** tilbúið graf-lib — **cytoscape.js**, lazy-hlaðið af unpkg CDN (sama mynstur og Leaflet í `choropleth.mjs`). Enginn nýr build-dependency.
4. **Innihald:** BÆÐI eignarhald (UBO) OG stjórnarseta, aðgreind sjónrænt.

## Gagnalíkan

### Hnútar
- **Fyrirtæki (company):** rót-félagið (auðkennt) + tengd félög úr eignarhaldstré + stjórnarneti. `{ id: 'c:'+kt, tegund:'felag', kt, nafn, rot:bool }`
- **Einstaklingur (person):** eigendur + stjórnarmenn. `{ id: 'p:'+kt|token, tegund:'einst', nafn?|null, maskad:bool, label }`

### Leggir (tvær tegundir)
- **Eignarhald** (úr `web/public/gogn/eigendur/<kt>.json` → `net` / `computeUbo`): `{ source: eigandi, target: felag, tegund:'eign', hlutfall:'%' }`. Heil lína + %-merki, ör eigandi→félag.
- **Stjórn/fyrirsvar** (úr `/api/tengslanet` → `stjornendur[].onnur` + `krossar`): `{ source: einst, target: felag, tegund:'stjorn', hlutverk }`. Brotalína, merkt hlutverki (stjórn/prókúra/framkvæmdastjóri).

### Sameining
Framendinn sameinar tvö gagnasett sem eigenda-skýrslan hefur þegar á síðunni:
`gogn/eigendur/<kt>.json` (eignarhald, þegar sótt fyrir listann/tréð) + `/api/tengslanet?kort=1` (stjórn).
Fyrirtækja-mengið er sniðið við sömu 12-félaga þök og tengslanet notar nú þegar.

## Persónuvernd — server-hlið felun

**Nýtt: `?kort=1` hamur á `tengslanetHandler` (web/worker.js).** Þegar `kort=1`:
- Reikna „rót-tengt" fólk = einstaklingar með hlutverk BEINT í rót-félaginu (`stjornendur` sem hafa `hlutverk_rot`) ELLEGAR eigendur rótarinnar (úr UBO). Þeir halda `nafn`.
- Allir aðrir einstaklingar (`krossar` + `onnur`-only fólk) fá **`nafn: null`, `maskad: true`, `token: 'E'+n`** — nöfn þeirra eru KLIPPT ÚT úr svarinu (fara ekki í vafrann).
- Kt einstaklinga: aðeins fyrir nafngreinda (rót-tengda); grímuklæddir bera ekkert kt heldur stöðugt token per session/kt-fyrirspurn.

**Núverandi hegðun óbreytt:** án `?kort=1` skilar tengslanet sama og nú (listinn/stjórnendaskýrslan sýnir rót-fyrirsvar með nöfnum — keypta KYC-gildið). Kort-masking er STRANGARI en listinn, í samræmi við fyrirvarann.

## Sjónræn kóðun & samspil

- **Rót-félag:** stór hnútur, gulur (#f6b13b Karp-þema).
- **Önnur félög:** minni, dökk-blá.
- **Einstaklingar:** hringir — nafngreindir fylltir/ljósir, grímuklæddir útlínaðir/gráir með tokeni.
- **Leggir:** eignarhald = heil + %; stjórn = brotalína + hlutverk.
- **Layout:** cytoscape `cose` (eða `fcose` ef auðvelt að hlaða) — kraft-drifið, klasast sjálfkrafa. Zoom/pan/draga innbyggt.
- **Smellur á hnút → hliðarspjald:**
  - Félag: kt, rekstrarform (ef til), hlutverk/eignarhalds-listi tengdur.
  - Nafngreindur einstaklingur: hlutverk þvert á félög.
  - Grímuklæddur: AÐEINS hlutverk (ekkert nafn/kt).
- Dökkt þema, `heimild: Fyrirtækjaskrá Skattsins (opinbert API)` neðst.

## Arkitektúr

- **`web/src/lib/tengslakort.mjs`** (NÝ) — eins og `choropleth.mjs`: `withCytoscape(cb)` lazy CDN-hleðsla (`https://unpkg.com/cytoscape@3/dist/cytoscape.min.js`) + `renderTengslakort(hostEl, { rotKt, eignData, stjornData })` sem byggir hnúta/leggi, setur upp cytoscape, stíla, smell-spjald.
- **`web/src/lib/ubo-report.js`** (BREYTT) — bæta „Kort ↔ Listi"-flisum efst í skýrsluna; „Kort" sækir `/api/tengslanet?kort=1` + notar eignarhalds-gögnin sem þegar eru til; kallar `renderTengslakort`. Lazy: kort byggt aðeins við fyrsta smell.
- **`web/worker.js` → `tengslanetHandler`** (BREYTT) — `?kort=1` masking-hamur (sjá persónuvernd). Aðskilinn cache-lykill fyrir kort-haminn.
- Engin ný npm-ávöxun; cytoscape af CDN, lazy.

## Út fyrir umfang (v1.1)

- Útflutningur korts (PNG/PDF).
- Person-keyed öfugt net á landsvísu (þarf RSK-gagnaáskrift — sbr. tengslanet-nótu).
- Tímalína eignarhalds-breytinga.

## Sannprófun

- `npx astro build` + `node --check web/worker.js` + `node -e import(...)` á tengslakort.mjs.
- Vafra-próf (mcp Browser) á `/eigendur/` — opna Kort-flið, staðfesta hnúta/leggi/zoom.
- **Persónuvernd-próf (skylda):** lesa `/api/tengslanet?kort=1&kt=<félag>` og staðfesta að svarið innihaldi ENGIN nöfn né kt fjarlægra (grímuklæddra) einstaklinga — aðeins tokens.

## Deploy

Vinna í worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` (branch `b2b-topbar`). Deploy = `git push origin b2b-topbar:main` (rebase á árekstra). Sannreyna eftir deploy á karp.is.
