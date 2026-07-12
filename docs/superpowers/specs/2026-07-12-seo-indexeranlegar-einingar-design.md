# Hönnun: Indexeranlegar einingar á karp.is (forgangs-SEO)

Dags: 2026-07-12 · Branch: `b2b-topbar` → `main` · Höfundur: Claude + Aron

## Vandamál

Karp á djúp gögn um íslensk félög, lyf og útboð, en Google getur ekkert raðað
fyrir langa-hala-leit („[félag] ársreikningur / kennitala / eigendur", „[lyf]
verð", „[verk] útboð") því **per-eining slóðir eru ekki til sem indexeranlegar
síður**:

- `https://karp.is/fyrirtaeki/4905220500/` → **404** (aðeins `/fyrirtaeki/?q=…`
  leitin er til, sem getur ekki raðað per félag).
- Lyf eru ein síða `/lyf.astro` (3023 lyf, engin per-lyf slóð).
- Útboð eru ein síða `/utbod.astro` (engin per-útboð slóð).
- Sitemap er aðeins ~277 slóðir.

GSC staðfestir tilgátuna: `gogn/leitarvel.json` sýnir að fólk leitar að félögum
og lendir á `https://karp.is/fyrirtaeki/?q=Sagafilm` — slóð sem getur ekki raðað
sem stök félagssíða.

Fyrirmyndin sem virkar nú þegar: þingmanna-síðurnar `/althingi/<slug>/` eru
statískar + indexeranlegar (getStaticPaths).

## Markmið

Opna langa-hala-leitina með því að gera einingar Karps indexeranlegar, án þess að
búa til hundruð þúsunda tómra doorway-síðna. Sölutrekt: leit → ókeypis
grunn-eining → 990 skýrsla / áskrift.

Ekki-markmið: höfuð-orða-leit („skattar", „alþingi") — óvinnanleg, sleppt.

## Arkitektúr — rétt verkfæri per gagnasett

`web/worker.js` (karp21) er server-worker: `export default { fetch }` sendir
`/api/*` í handlera og fellur annars í `env.ASSETS.fetch(request)` (byggða Astro
`dist/`, línu ~2605). Astro er `output:'static'` SSG, `build.format:'directory'`.

| Eining | Gögn | Umfang | Render | Rök |
|---|---|---|---|---|
| Fyrirtæki `/fyrirtaeki/<kt>/` | live RSK + CI-gögn | ~400k, óafmarkað | **Worker-SSR + 24 klst edge-cache** | Ekki hægt að pre-builda 400k |
| Lyf `/lyf/<slug>/` | `gogn/lyf.json` | 3023, static | **Pre-build (getStaticPaths)** | Afmarkað static → static réttara |
| Útboð `/utbod/<id>/` | `gogn/utbod.json` (+`utbod_urslit.json`) | dags-snapshot, afmarkað | **Pre-build (getStaticPaths)** | Sama; fer sjálfkrafa í Astro-sitemap |

SSR-valið (úr brainstorm) á sértaklega við fyrirtæki-vandann (400k, live). Lyf og
útboð eru afmörkuð static gagnasett — pre-build er einfaldara, hraðara per-request
og fer sjálfkrafa í Astro-sitemap.

## Eining 1 — Fyrirtæki (worker-SSR, skeleton-injection)

### Skel-síða
Ný Astro-síða (t.d. `web/src/pages/_skel-fyrirtaeki.astro`) rendrar venjulega
`Layout` með placeholder-tókum sem props og í slot:

- `title="%%KARP_TITLE%%"`, `description="%%KARP_DESC%%"`,
  `canonical="%%KARP_CANON%%"`
- `jsonLd={"%%KARP_JSONLD%%"}` — Layout gerir `JSON.stringify(jsonLd)` →
  `"%%KARP_JSONLD%%"` (með gæsalöppum) í `<script type="application/ld+json">`.
  Worker replace-ar `"%%KARP_JSONLD%%"` (með gæsalöppum) fyrir raun JSON-objekt.
- Slot-efni = `%%KARP_MAIN%%` (fer í `<div class="content">`).

Þannig fæst **nákvæmlega sami haus/nav/footer/global-CSS** og restin af síðunni —
engin tvíritun á 618-línu `Layout.astro`. Layout-hausinn (línur 110–131) rendrar
title/description/canonical/noindex/jsonLd nú þegar úr props, auk site-wide
WebSite+Organization+SearchAction JSON-LD (línu 131) sem helst óbreytt.

Skel-síðan sjálf: `noindex` (sér-tókinn kemur ekki í veg fyrir það — skel er
aldrei borin fram beint), útilokuð úr Astro-sitemap (bæta reglu í `sitemap({
filter })` í `astro.config.mjs`), og aldrei hlekkt innan frá.

### Worker-route
Bæta **fyrir** `env.ASSETS.fetch` fallback (línu ~2605) í `web/worker.js`:

```
if (/^\/fyrirtaeki\/\d{10}\/?$/.test(url.pathname)) return fyrirtaekiSidaHandler(request, env, ctx);
```

`fyrirtaekiSidaHandler(request, env, ctx)`:
1. Draga `kt` úr slóð; ef ekki 10 tölur → fall-through í ASSETS (Astro 404).
2. Slóð án enda-slash → 301 redirect á `/fyrirtaeki/<kt>/` (canonical, ein slóð).
3. Edge-cache: `caches.default`, key `https://cache.karp.internal/pg/fyrirtaeki/<kt>`,
   `max-age=86400` (sama mynstur og `fyrirtaekiHandler`).
4. Sækja gögn:
   - `fyrirtaekiHandler(new Request('https://k.internal/api/fyrirtaeki?q=' + kt), env, ctx)`
     → `felag {kt, nafn, heimilisfang, form, tilgangur, stada, afskraning, hlutafe,
     mynt, fyrirsvar, …}`.
   - `env.ASSETS.fetch('https://karp.internal/gogn/arsreikningar/<kt>.json')` → KPI ef til.
   - `env.ASSETS.fetch('https://karp.internal/gogn/eigendur/<kt>.json')` → UBO/tengsl ef til.
   - Ef `felag` finnst ekki (RSK skilar engu raun-félagi) → skila 404 (Astro not-found
     skel úr ASSETS eða einfalt 404), **ekki** tóm 200-síða.
5. Byggja:
   - **title**: `<Nafn> (kt. <formatað kt>) — ársreikningur, eigendur, kennitala | Karp`
   - **description**: nafn, rekstrarform, ÍSAT, heimilisfang, staða + „ársreikningar,
     endanlegir eigendur, tengsl" (≤ ~160 stafir).
   - **canonical**: `https://karp.is/fyrirtaeki/<kt>/`
   - **JSON-LD**: `Organization` (`name`, `identifier`=kt, `address` PostalAddress,
     `url`, `naics`/ISAT ef hægt, `foundingDate`/`legalName` eftir gögnum).
   - **main**: h1 (nafn), grunnborð (kt/form/ÍSAT/heimilisfang/staða/hlutafé/fyrirsvar),
     ársreikninga-KPI-kort (ef til), UBO/tengsl-teasari (ef til), sölutrekt-CTA,
     innri hlekkir. HTML-escape allt notenda-/RSK-gildi.
6. String-replace 5 tókana í skel-HTML → skila `text/html; charset=utf-8`.

### Sölutrekt (CTA á ókeypis síðunni)
Áberandi hnappar sem forfylla kt í núverandi checkout-flæði:
- 990 kr **Fyrirtækjaskýrsla** → `/lausnir/fyrirtaekjaskyrsla/` + kaup (`kind=fyrirtaeki`).
- 990 kr **Endanlegir eigendur** → `/eigendur/?kt=<kt>` (`kind=eigendur`).
- **Fyrirtækjavaktin** áskrift → `/lausnir/fyrirtaekjavaktin/`.
Grunnsíðan gefur raun-virði ókeypis (nafn/kt/heimilisfang/ÍSAT/staða) svo hún er
ekki doorway; skýrslurnar eru upsala.

### Innri tenging (crawl + trekt)
- `/fyrirtaeki/` leitin: hver niðurstaða hlekkjar í `/fyrirtaeki/<kt>/` (canonical)
  í stað `?q=` — breytir GSC-mældri `?q=` traffík í indexeranlegar síður.
- Þar sem kt birtast annars staðar (birgjar, eigendur, útboðs-úrslit) → hlekkja í
  `/fyrirtaeki/<kt>/` þar sem það er létt.

## Eining 2 — Lyf (pre-build `/lyf/<slug>/`)

`web/src/pages/lyf/[slug].astro` með `getStaticPaths` úr `@gogn/lyf.json` (`lyf[]`,
hvert með `slug`, `name`, `atc{code,name}`, `strength`, `form`, `ingredients[]`,
`holder`, `agent`, `shortage`, `rx`, `essential`, `narcotic`, verð-reitir).

- 3023 static síður, í Astro-sitemap sjálfkrafa.
- **JSON-LD `Drug`**: `name`, `activeIngredient` (ingredients), `code` (ATC),
  `dosageForm` (form), `manufacturer`/`marketingAuthorizationHolder` (holder),
  `prescriptionStatus` (rx), `availableStrength` (strength).
- Efni: heiti, virk efni, ATC, styrkur, form, MAH/umboð, verð, lyfjaskorts-merki,
  R-merking. `/lyf.astro` verður leitin; hver niðurstaða hlekkjar í `/lyf/<slug>/`.

## Eining 3 — Útboð (pre-build `/utbod/<id>/`)

`web/src/pages/utbod/[id].astro` með `getStaticPaths` úr `@gogn/utbod.json`
(`tenders[]`) + úrslit úr `@gogn/utbod_urslit.json` ef stök `id` samsvara.

- Static síður (afmarkað snapshot), í Astro-sitemap.
- Efni: titill, kaupandi, gátt, flokkur, frestur, upphæð (ef til), lýsing,
  ICS-hlekkur, hlekkur í upprunagátt, úrslit/vinningshafi ef lokað.
- Schema.org hefur ekki hreina útboðs-tegund → nota **minimal `GovernmentService`**
  (eða sleppa JSON-LD ef reitir passa illa; ákveðið í smíði út frá raun-gögnum).
- Sögulegt/lokað útboð verður varanleg langa-hala-síða („[verk] útboð úrslit").
- `id`-uppspretta: nota stöðugan lykil úr `tenders[]` (staðfest í smíði — verður að
  vera stöðugur milli builda og URL-öruggur; slugify ef þarf).

## Schema — samantekt
- **Organization** á fyrirtæki (worker), **Drug** á lyfjum (static),
  **GovernmentService**/minimal á útboðum (static).
- **Person** á þingmönnum: kanna `/althingi/<slug>/` — bæta Person-JSON-LD ef vantar
  (létt viðbót, sami Layout `jsonLd` prop). Staðfest í smíði.

## Sitemap / crawl-budget (breið þekja valin)
- Lyf + útboð → sjálfkrafa í Astro-sitemap (`sitemap-index.xml` → `sitemap-0.xml`).
- Fyrirtæki (worker-rendered, ekki í Astro-build) → **build-skript**
  (`skriptur/build_sitemap_fyrirtaeki.mjs`) býr til `web/public/sitemap-fyrirtaeki.xml`
  úr **sammengi allra kt-lyklaðra Karp-gagna**: `birgjar.json` (vendors `t`,
  zero-pad í 10 stafi), `gogn/arsreikningar/*.json`, `gogn/eigendur/*.json`,
  `logbirting.json`, og önnur kt-berandi gögn sem eru til (hugverk, skip-eigendur,
  vanskil, GSC-leituð félög úr `leitarvel.json`). Skrá dedup-uð á kt.
  - „Öll raunfélög" = í reynd „öll félög í einhverju Karp-gagnasetti"; við eigum
    ekki 400k-registry-dump. Langi halinn (kt sem er ekki í neinu setti) skilar samt
    200 þegar smellt/deilt — bara ekki auglýstur í sitemap.
- **Vísun**: `robots.txt` fær auka `Sitemap:` línu fyrir `sitemap-fyrirtaeki.xml`;
  sitemap-index uppfært ef auðvelt (annars sjálfstæð `Sitemap:` lína dugar Google).
- Vörn: hver síða hefur einstakt raun-efni. Ef GSC sýnir thin-content síðar →
  þrengja settið (fjarlægja félög án nokkurrar auðgunar).

## Laga í leiðinni
- `web/public/robots.txt`: `Sitemap: https://app.karp.is/sitemap-index.xml` →
  `https://karp.is/sitemap-index.xml` (app.karp.is = fyrir-flutnings lén).

## Áhætta / gildrur
- **Astro View Transitions / ClientRouter**: worker-borin HTML er full-síða; fyrsta
  hleðsla (það sem Google sér) er server-HTML. Client-hydration progressive → engin
  SEO-áhrif. `transition:persist` á header helst.
- **Scoped CSS tree-shaking**: worker-injectað `%%KARP_MAIN%%` má aðeins nota
  `is:global` klasa eða inline-stíla (Astro scoped-CSS tré-hristist í runtime-innerHTML,
  sama gildra og skjalfest í `karp-macro-dashboard`).
- **Placeholder-árekstur**: tókar verða að vera einstakir strengir sem birtast hvergi
  annars staðar í skel-HTML (nota `%%KARP_*%%`).
- **404 vs tóm 200**: kt sem RSK á ekkert raun-félag fyrir → 404, ekki tóm síða.
- **Edge-cache lykill**: aðskilinn frá `/api/fyrirtaeki` cache (annar path-prefix).
- **kt zero-pad**: `birgjar.json` geymir kt sem tölu (`t`) → leiðandi núll tapast →
  `String(t).padStart(10,'0')`.
- **Persónuvernd**: einstaklinga-kt (fyrstu 2 stafir 01–31) eru EKKI félög → aðeins
  lögaðila-kt (41–71) fá síðu (sama regla og `skipErFyrirtaeki`). Fyrirsvar/eigendur
  sem eru einstaklingar → fylgja gildandi DPIA-nafnafelun (`?kort=1`/maska ef við á).

## Staðfesting
- `npx astro build` klárar (~208+ síður + nýjar lyf/útboð).
- `fetch` á nýrri `/fyrirtaeki/<kt>/` (raunfélag) → 200 + nafn/kt í HTML +
  `Organization` JSON-LD í `<head>`.
- `/lyf/<slug>/` → 200 + `Drug` JSON-LD. `/utbod/<id>/` → 200.
- Google Rich Results Test snið á öllum þremur.
- `sitemap-fyrirtaeki.xml` gilt XML; `robots.txt` bendir á karp.is.

## Uppröðun (lotur)
1. Fyrirtæki: skel-síða + worker-route + Organization-JSON-LD + CTA + innri hlekkir.
2. Lyf: `[slug].astro` + Drug-JSON-LD + leitar-hlekkir.
3. Útboð: `[id].astro` + (minimal) JSON-LD.
4. Sitemap-skript + robots-fix + Person-JSON-LD á þingmönnum (ef vantar).
5. Build + staðfesting + deploy (`git push origin b2b-topbar:main`, rebase).
