# Atburða-tímalína félags (fyrir fréttamenn) — hönnun

**Dagsetning:** 2026-07-20
**Staða:** Samþykkt hönnun, bíður útfærslu-plans.
**Höfundur:** Aron + Claude (brainstorming)

## Markmið

Gefa fréttamanni (og notanda) **tímaröð atburða félags** á `/fyrirtaeki/<kt>/` — „ferilblað" sem sýnir hvað gerðist hjá félaginu og hvenær, í einni lóðréttri tímalínu. Endurnýtir bökuð, kt/nafn-lykluð gögn sem Karp á þegar.

**Árangursviðmið:** á félags-síðu birtist tímalína með dagsettum atburðum (gjaldþrot/skiptabeiðnir, vörumerkjaskráningar, styrkir, fréttavél-fréttir sem nefna félagið), nýjast fyrst, hver með dagsetningu + flokk + titli + hlekk. Tómt félag sýnir „engir skráðir atburðir".

## Ákvarðanir (úr brainstorming)

| # | Ákvörðun | Val |
|---|---|---|
| Q1 | Hvar / hvaðan | **Auðga `/fyrirtaeki/<kt>/`** með atburða-tímalínu úr ríku kt/nafn-lykluðu grunngögnunum (ekki fréttavél-eingöngu — hún er of strjál á einingar). |
| Q2 | Arkitektúr | **Einangraður `/api/firma-timalina`-endapunktur + hrein `buildTimalina()`-eining + client-hluti** á síðunni. Snertir EKKI gagna-/paywall-lógík stóra `fyrirtaekiHandler` (aðeins lítil HTML+script-viðbót f. birtingu). |
| — | Uppruni gagna | **Bökuð skjöl beint um `augGet`** (Lögbirting/vörumerki/styrkir/fréttavél-safn) — hraðara + áreiðanlegra en að kalla lifandi sub-handlera. Staðfest: öll bera dagsetningar. |

**Áreiðanleiki:** kt-lyklað (Lögbirting, vörumerki) áreiðanlegt; nafna-lyklað (styrkir, fréttavél) er hlutstrengs-/nafna-tenging (eins og digest/follows) — merkt í svari.

**Utan v1:** byggingarleyfi (heimilisfangs-lyklað); útboð-vinningar (nafna-match, óáreiðanlegra); persónu-/sveitarfélaga-tímalínur (aðeins félög í v1); RSK-stofndagur/ársreikningar (þegar sýnd í grunn-hlutanum).

## Núverandi innviðir sem eru endurnýttir

- **`fyrirtaekiHandler`** (`web/worker.js:2170`) — stór SSR-handler sem myndar `/fyrirtaeki/<kt>/` HTML. Þekkir `kt` + `nafn` félagsins. **Aðeins lítil HTML+script-viðbót** (placeholder-section + client-script) — engin snerting á gagna-/tier-/paywall-lógík.
- **`augGet(env, file)`** (`web/worker.js:80`) — les bakað gogn-skjal (m/cache). Notað t.d. `augGet(env, 'styrkir.json')`.
- **`asciiId`** úr `web/src/lib/frettavel-cat.mjs` (worker importar það þegar — fs-laust, óhætt í worker).
- Bökuð gögn (staðfest snið):
  - **`logbirting.json`** `.byKt[kt].notices = [{type, date, court?, when?, url?, ref?}]`; `.typeLabels{gjaldthrot_beidni,skiptabeidni,innkollun,skiptalok,skiptafundur,felagsslit}`.
  - **`vorumerki_nyskrad.json`** `.byKt[kt] = [{id, titill, tegund, skrad(dags), flokkar[], eigandi}]`.
  - **`styrkir.json`** `.byNafn[nafnNorm] = [idx…]`; `.styrkir[idx] = {nafn, nafnNorm, sjodur, flokkur, upphaed, ar, verkefni?}` (ár-nákvæmni, nafna-lyklað, `kt` oft null).
  - **`frettavel_archive.json`** `.items = [{id, date, type, title, text, url}]`.

## Hönnun

### 1. Hrein eining `web/src/lib/firma-timalina.mjs` (prófanleg; worker-örugg — importar aðeins `asciiId`)

`buildTimalina(sources, opts)` þar sem `sources` eru þegar félags-síuð fylki (endapunkturinn síar), og `opts = { max = 60 }`:

- **`sources.logbirting`** `[{type,date,court?,url?}]` → `{dags:date, flokkur:'gjaldthrot', titill: LBL[type]||type, lysing: court||null, slod: url||'/logbirting/'}` (LBL = fastur type→heiti map í modúlnum).
- **`sources.vorumerki`** `[{titill,tegund,skrad}]` → `{dags:skrad, flokkur:'vorumerki', titill:'Vörumerki skráð: '+titill, lysing:tegund||null, slod:'/atvinnuvegir/hugverk/'}`.
- **`sources.styrkir`** `[{sjodur,flokkur,upphaed,ar,verkefni?}]` → `{dags: ar+'-01-01', arGrof:true, flokkur:'styrkur', titill:'Styrkur úr '+sjodur, lysing:(verkefni?'„'+verkefni+'" · ':'')+kr(upphaed)+' kr.', slod:'/styrkir/'}` (kr = staðbundinn þúsundapunkta-formatter).
- **`sources.frettir`** `[{id,date,title}]` → `{dags:date, flokkur:'frett', titill:title, slod:'/frettavel/'+asciiId(id)+'/'}`.
- **Sameina** öll, henda atburðum án `dags`, **raða nýjast-fyrst** (`dags` DESC), skera í `max`. Hver atburður fær `birt` = birtingar-strengur (`dd.mm.yyyy`, eða `Árið <ar>` ef `arGrof`).
- **Hrein fall** — engin I/O; tekur gögn inn, skilar lista. Prófanleg með fixtures.

### 2. Nýr worker-endapunktur `GET /api/firma-timalina?kt=<kt>&nafn=<nafn>`

- Router: bæta við hjá öðrum `/api/`-leiðum (`web/worker.js` ~:3936), t.d. `if (url.pathname === '/api/firma-timalina') return firmaTimalinaHandler(request, env, ctx);`.
- `firmaTimalinaHandler`:
  1. `kt` = 10 tölur úr query; `nafn` úr query. Ef ekkert kt+nafn → `{ atburdir: [] }`.
  2. `augGet` á `logbirting.json`, `vorumerki_nyskrad.json`, `styrkir.json`, `frettavel_archive.json` (samhliða `Promise.all`, hvert `.catch(()=>null)`).
  3. **Síun per uppruna:**
     - logbirting: `lb.byKt[kt]?.notices` (kt-nákvæmt).
     - vörumerki: `vm.byKt[kt]` (kt-nákvæmt).
     - styrkir: `st.byNafn[nmz(nafn)]?.map(i=>st.styrkir[i])` (nafna-normaliserað, `nmz` = sama og fréttavélin: lágstafir, form-ending burt).
     - fréttir: `arch.items.filter(x => (x.title+' '+(x.text||'')).toLowerCase().includes(nafn.toLowerCase()))` (nafna-substring).
  4. `buildTimalina({logbirting, vorumerki, styrkir, frettir})` → `{ updated, kt, nafn, n, aggreiðanleiki:{kt:['gjaldthrot','vorumerki'], nafn:['styrkur','frett']}, atburdir }`.
  5. `content-type: application/json`. Login-óháð (opinber skráargögn, sömu og /fyrirtaeki sýnir).

### 3. Client-hluti á `/fyrirtaeki/<kt>/`

- `fyrirtaekiHandler` bætir við (nálægt öðrum hlutum) `<section id="fb-timalina" data-kt="<kt>" data-nafn="<nafn-escaped>"><h2>🕑 Atburða-tímalína</h2><div class="tl-body">Sæki…</div></section>` + `<script>` sem: les `kt`/`nafn` af `data-`, sækir `/api/firma-timalina?kt=&nafn=`, teiknar lóðrétta tímalínu (dagur + flokka-merki + titill(hlekkur) + lýsing). Tómt → „Engir skráðir atburðir í tímaröð." Villa → hljóðlát (fjarlægir hlutann).
- Flokka-litir/merki: lítill fastur map í scriptinu (gjaldþrot=rautt, vörumerki=blátt, styrkur=grænt, frétt=grátt).
- Lazy: sækir eftir `DOMContentLoaded`/idle.

### 4. Villumeðferð

- Endapunktur: hvert `augGet` `.catch(()=>null)`; vantar skrá → sá uppruni tómur, hinir standa.
- `buildTimalina`: hendir atburðum án `dags`; tómt `sources` → `[]`.
- Client: fetch-villa → fjarlægir hlutann (engin brotin síða); tómt → „engir atburðir".
- Nafna-substring getur gefið falska jákvæða (nafnar/hlutar) — merkt `aggreiðanleiki` í svari; kt-upprunar áreiðanlegir.

## Einingar (aðgreining)

| Eining | Hvað | Háð |
|---|---|---|
| `firma-timalina.mjs` | Hrein: `buildTimalina(sources,opts)` → raðaðir atburðir | `asciiId` (frettavel-cat.mjs) |
| `firmaTimalinaHandler` (worker) | `augGet` 4 skjöl + kt/nafn-síun → `buildTimalina` → JSON | augGet, buildTimalina |
| `/fyrirtaeki` HTML+script | placeholder-section + client fetch/render | firmaTimalinaHandler (um HTTP) |

## Gagnaflæði

```
/fyrirtaeki/<kt>/ (SSR) → HTML m/ #fb-timalina[data-kt,data-nafn] + script
   client → GET /api/firma-timalina?kt=&nafn=
      handler → augGet(logbirting,vorumerki,styrkir,frettavel_archive) → kt/nafn-síun → buildTimalina → JSON
   client → teiknar lóðrétta tímalínu
```

## Prófun

- **Einingapróf** (`web/src/lib/firma-timalina.test.mjs`, node:test) á `buildTimalina`:
  - Hver uppruni normaliseraður rétt (dags/flokkur/titill/slod); frétt-slod = asciiId-permalink.
  - Röðun nýjast-fyrst þvert á uppruna; `max`-þak.
  - `arGrof` styrkur fær `birt='Árið <ar>'`; atburður án dags fellur út; tómt → `[]`.
- **Bygging** (`astro build`) staðfestir að `firma-timalina.mjs` þýðist; **worker module-load** (`node -e import worker.js`) staðfestir handler+router. Handvirkt: opna `/fyrirtaeki/<kt>/` á félagi með atburði og staðfesta tímalínu (t.d. félag með gjaldþrot í Lögbirtingu).

## Áhætta / opnar spurningar

- **Nafna-substring** (styrkir/fréttir) getur ofmatað (nafnar) — v1 merkir uppruna-áreiðanleika; nákvæm kt-tenging síðar.
- **Styrkir = ár-nákvæmni** (ekki dagur) → raðast innan árs á `<ar>-01-01`, birt „Árið <ar>".
- **Fá félög bera marga atburði** — tímalínan er rík fyrir félög með Lögbirtingar-/vörumerkja-sögu, annars stutt; „engir atburðir" fyrir hrein félög. Ásættanlegt (það er heiðarlegt ferilblað).
