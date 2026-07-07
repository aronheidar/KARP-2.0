# Sérlyfjaskrá → KARP (`lyf.json` + `/lyf/`) — hönnun & útfærsluáætlun

**Dags:** 2026-07-07 · **Grein:** `serlyfjaskra` · **Staða:** samþykkt (Aron), í smíði

Ný opin gagnaveita: sérlyfjaskrá Lyfjastofnunar (serlyfjaskra.is) → `web/public/gogn/lyf.json`
+ uppflettisíða `/lyf/` (leit, ATC, **lyfjaskortur**, verð) + nav-færsla + flís á `/verdlag/`.

Sameinar „design doc" og „implementation plan" í eitt skjal (ein samhangandi smíð).

---

## 1. Afhjúpuð tækni (staðfest með raun-köllum við hönnun)

### 1a. Algolia — OPINN, search-only lykill (þrep 1: grunngögn, ódýrt/heilt)
- **appId** `CMDR8T9UU3` · **index** `dev_serlyfjaskra` · **search key**
  `a3d4323ff90485057b4ce99f99e01620` (fannst inline í `/leit`-búnti serlyfjaskra.is,
  `algoliasearch("CMDR8T9UU3","a3d4…")`; opinber search-only lykill → óhætt, read-only).
- Endapunktur: `POST https://cmdr8t9uu3-dsn.algolia.net/1/indexes/dev_serlyfjaskra/query`,
  hausar `X-Algolia-Application-Id` + `X-Algolia-API-Key`.
- **nbHits = 3023** lyf (2026-07-07). `browse` er lokað (þarf browse-ACL) → bin-pack.
- **⚠ 1000-þak:** Algolia leyfir ekki síðuflettingu > 1000 (`page*hitsPerPage`). Til að ná öllum:
  **recursive bin-pack yfir ALGILDA facets** (facet þar sem `sum(counts) === nbHits`, þ.e. hver
  færsla hefur nákvæmlega eitt gildi): `attributes.category` (2) → `attributes.legalStatusOfSupply`
  (6) → `attributes.pharmaceuticalForm` (~70, stærsti poki 678). Klýf hvern poka ≥ 1000 með næsta
  algilda facet; þegar < 1000 → sæki alla (`hitsPerPage=1000`). Sameina á `objectID`,
  **staðfesti `unique === nbHits`**. ~40–70 létt köll.
- Færslu-lögun (það sem þrep 1 skilar beint — mun ríkara en áætlað):
  `name`, `additionalName`, `slug` (→ /lyf/<slug>), `medicinalProductId`/`objectID` (GUID),
  `atc{name,category,text}`, `strength{value,unit,text}`, `activeIngredients[]{name,active}`,
  `attributes{marketingAuthorizationHolder, representative(=umboð/heildsali), pharmaceuticalForm,
  shortage(bool=Lyfjaskortur), legalStatusOfSupply, category(Lyf f. menn/dýr), authorizationStatus,
  essentialMedicines, narcotic, redTriangle, marketRestriction, …}`, `baseAttributes[]`,
  `packages[]{nordicProductNumber(NPN), packaging, euAuthorizationNumber, referencePriceCategory}`.
  → **lyfjaskortur + ATC + leit eru HEIL fyrir öll 3023 úr þrepi 1 einu.**

### 1b. Verð — SSR `__NEXT_DATA__` á `/lyf/<slug>` (þrep 2: verð, þyngra)
- `GET https://serlyfjaskra.is/lyf/<slug>` → `<script id="__NEXT_DATA__">` →
  `props.pageProps.results.packages[]` með per-pakkningu:
  `retailPrice` (smásöluverð, kr), `referencePrice` (viðmiðunarverð, kr),
  `reimbursementStatus` (bool, greiðsluþátttaka), `wholesalerName`/`wholesalerId` (heildsali),
  `referencePriceCategory`, `referencePriceLastUpdated` (ISO-dags).
  Join á þrep 1 um `nordicProductNumber` (NPN) eða `slug`/objectID.
- Staðfest lifandi (ABILIFY): retailPrice 21134 · referencePrice 6467 · reimbursement true ·
  wholesaler „Distica hf" · uppfært 2026-07-03.
- Eitt HTTP-kall per lyf (~54 KB HTML). `_next/data/<buildId>/…json` skilaði 404 → nota
  `__NEXT_DATA__` úr HTML (áreiðanlegt).

---

## 2. `skriptur/build_lyf.js` (CommonJS, fyrirmynd `build_styrkir.js`)

- Hausdokka á íslensku með ID-korti (1a/1b að ofan) — eins og `build_styrkir.js`.
- **Kurteisi/robusta:** `UA = 'KARP dashboard build (karp.is; aronheidars@gmail.com)'`;
  ~1,2 s töf milli /lyf-kalla; 1× endurtilraun m/ bakslagi; timeout; hlekkur aldrei batch.
  Algolia-köll mega vera hraðari (þeirra innviðir); hófleg töf samt.
- **Env:** `LYF_PRICE_MAX` (fjöldi verð-sókna; **0 = öll**, sjálfgefið 0) · `LYF_OUT` (prófun).
- **Þrep 1:** recursive bin-pack → `base[]` (dedup á objectID, assert === nbHits).
- **Þrep 2:** fyrir hvert lyf (upp að `LYF_PRICE_MAX`): sæki verð, festu á pakkningar (NPN).
  Forgangur ef takmarkað: fyrst í skorti, svo nauðsynleg, svo dreift á ATC.
- **Úttak `lyf.json`** (dual-write `gogn/lyf.json` + `web/public/gogn/lyf.json`):
  ```
  { updated, count, priced, shortageCount, sources,
    atc: { <A..V>: {label, count} },              // A–V efsta-stigs ATC yfirlit
    lyf: [ { name, slug, atc:{code,name}, strength, form, ingredients:[…],
             holder, agent, shortage:bool, rx:legalStatus, vet:bool, flags:{…},
             packages:[ { npn, size, retail, reference, reimb, wholesaler, refCat, refUpdated } ],
             priceLow, priceHigh } ] }             // lægsta/hæsta smásöluverð (fljót birting)
  ```
- Console-yfirlit: fjöldi · verð-þekja · í skorti · per-ATC · dual-write slóðir.

## 3. `web/src/pages/lyf.astro` (mynstur `birgjar.astro`/`eftirlit.astro`)

- `<Layout>` + dökkt þema; `main[data-pg="lyf"]`; eigin `<style>` (max-width ~1040px).
- **Hero-flísar:** fjöldi lyfja · í skorti núna · verð-þekja (`priced/count`) · uppfært.
- **Sjálfgefin sýn = lyf í skorti** (afmarkað, fréttnæmt) úr `/gogn/lyf.json`.
- **Client-side leit** (module-cache á fetch, esc-XSS eins og birgjar): heiti / virkt efni / ATC;
  síur: í skorti · lyfseðilsskylt · dýralyf. Birti styrk, form, ATC, markaðsleyfishafa,
  skortur-merki, verð (smásölu/viðmiðun · greiðsluþátttaka · heildsali) þar sem til; tengill á
  `serlyfjaskra.is/lyf/<slug>` (rétt uppruni). Engin worker-þörf (skrá ~1–1,5 MB, client fetch).
- Fótur: heimild Lyfjastofnun/serlyfjaskra.is + uppfærslu-dags + „forþjónað (SSG)".

## 4. Uppgötvun (Layout.astro)
- Nav: `{ href:'/lyf/', label:'Lyf & lyfjaverð' }` í **Efnahagur**-hóp (á eftir Verðlagi).
- `PATH_EFNI`: bæta `lyf` við efnahagur-regexið (hægri-fréttastika fylgir samhengi).
- Flís/kort á `/verdlag/` sem tengir á `/lyf/`.

## 5. Skilgreining á „lokið" (DoD)
1. `node --check skriptur/build_lyf.js` (+ allar nýjar .js/.mjs).
2. `node skriptur/build_lyf.js` → gilt `lyf.json`: 3023 lyf, verð fyrir öll/flest, `shortageCount>0`.
3. `cd web && npx astro build` → **197 síður** (196 + `/lyf/`), engin villa.
4. Allt íslenskt, dökkt þema, aðeins opinber gögn/opið API, kurteisi virt.

## 6. Útfærsluröð
1. Spec (þetta) → commit. 2. `build_lyf.js` skrifað → `node --check`. 3. **Full verð-sókn í bakgrunni**
(~60 mín). 4. `lyf.astro` + nav + `/verdlag/`-flís á meðan. 5. Þegar gögn tilbúin: `astro build`,
staðfesta 197 síður + sjónræn skoðun. 6. Commit á grein `serlyfjaskra`. 7. Samantekt fyrir Aron.

## 7. Bíður (skjalfest, ekki blokkerar DoD)
- Sjálfvirk endurnýjun (verð breytist ~vikulega; `referencePriceLastUpdated`) — cron/næturkeyrsla.
- Möguleg fljótari verð-heimild: lyfjaverðskrá SÍ/Lyfjagreiðslunefndar (fjöldaskrá) — kanna síðar.
