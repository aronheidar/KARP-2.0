# Gögn & graf per frétt (fyrir fréttamenn) — hönnun

**Dagsetning:** 2026-07-20
**Staða:** Samþykkt hönnun, bíður útfærslu-plans.
**Höfundur:** Aron + Claude (brainstorming)

## Markmið

Gera hverja **gagna-drifna** frétt í Fréttavélinni **niðurhalanlega og tilvitnanlega**: fréttamaður (og Google Dataset Search) getur sótt gögnin á bak við söguna (JSON/CSV) og tilbúið, merkt graf (SVG/PNG) og notað í eigin umfjöllun með tilvísun í Karp. Þetta styrkir Karp sem heimild fréttamanna og gefur bakteningar/SEO.

**Árangursviðmið:** á sér-fréttasíðu gagna-drifinnar fréttar (`/frettavel/<id>/`) er (1) hlekkur á stöðuga `.json`- og `.csv`-skrá með gögnum sögunnar, (2) niðurhalanlegt merkt graf (SVG + PNG) þar sem tímaröð er til, (3) skýr notkunar-/tilvísunartexti, og (4) `Dataset` JSON-LD vísar á skrárnar (`distribution`). Textafréttir (án gagna) eru ósnertar.

## Ákvarðanir (úr brainstorming)

| # | Ákvörðun | Val |
|---|---|---|
| Q1 | Graf-afhending | **Statískt niðurhal** (SVG + PNG), ekki lifandi iframe-embed (embed = síðari áfangi). |
| Q2 | Gagna-afhending | **Byggingartíma skrár** (Astro static endpoints) með stöðugum, tilvitnanlegum slóðum + `Dataset` JSON-LD `distribution` → Google Dataset Search. Ekki client-hlið raðgreining. |
| — | Graf-form | **Merkt, sjálfstætt SVG** myndað við byggingu (titill + heimild + gildi), ekki nakið sparkline af síðunni. PNG er client-hlið (canvas). |
| — | Umfang | Aðeins fréttir með `hasExport` (bera `facts` EÐA `spark`-röð ≥4). Textafréttir sleppa (engar tómar skrár). |

**Utan v1 (síðari áfangar):** lifandi iframe-embed (`/frettavel/<id>/embed`); x-ás með dagsetningum (`spark` ber aðeins gildi, engar dagsetningar); byggingartíma PNG-rösun.

## Núverandi innviðir sem eru endurnýttir

- **Sér-fréttasíða `web/src/pages/frettavel/[id].astro`** — `getStaticPaths` yfir `@gogn/frettavel_archive.json` (`ARCH.items`, 500 nýjustu). Hvert `it` ber `{id, date, type, title, text, url, ai, spark?, facts?, samhengi?}`. Slug = `asciiId(it.id)`. Síðan ber nú þegar **`Dataset` JSON-LD** (bætum `distribution` við) + `fv-cite`-tilvitnunarkassa + `fv-chart` (sparkline með `spark(it.spark, 640, 150)`).
- **`web/src/lib/frettavel.mjs`** — `catOf(t)` (label/heimild/rule), `asciiId(id)` (permalink-slug, nú í `frettavel-cat.mjs`), `artHref`, `dIS`, `spark(arr,w,h)` (SVG-hnit úr tímaröð).
- **Astro static endpoints** — `[id].json.ts`/`.csv.ts`/`.svg.ts` með `getStaticPaths` + `export function GET(){ return new Response(body, {headers}) }` mynda `/frettavel/<slug>.json` o.s.frv. við byggingu (ekkert nýtt runtime).

## Hönnun

### 1. Hrein eining `web/src/lib/frettavel-export.mjs` (prófanleg, engar node/Astro-deps)

Tekur eitt archive-`item` (og `catOf` úr `frettavel.mjs`). Fjórar hreinar aðgerðir:

- **`hasExport(item)` → boolean:** `!!(item && (isRealObj(item.facts) && Object.keys(item.facts).length) || (Array.isArray(item.spark) && item.spark.filter(n=>typeof n==='number').length >= 4))`.
- **`exportJson(item)` → object:** samræmt gagnasnið, ENGIN persónugögn (fréttavélar-gögn eru þegar hlutlaus/aggregat):
  ```json
  {
    "id": "<id>", "slod": "https://karp.is/frettavel/<asciiId>/",
    "dagsetning": "2026-07-20", "tegund": "verdbolga", "flokkur": "Verðbólga",
    "titill": "...", "texti": "...",
    "heimild": "Seðlabanki Íslands", "heimild_slod": "https://karp.is/verdlag/",
    "adferd": "<cat.rule>",
    "facts": { ... }|null,
    "rod": { "lysing": "Síðustu N gildi (tímaröð)", "gildi": [..] }|null,
    "leyfi": "Frjáls til notkunar með tilvísun í Karp (karp.is)",
    "hofundur": "Fréttavél Karp", "sott": "<build-dagur>"
  }
  ```
- **`exportCsv(item)` → string:** einfalt, Excel-vænt (`;`-skilið, íslenskt), tveir hlutar ef við á:
  ```
  reitur;gildi
  titill;"..."
  dagsetning;2026-07-20
  ...  (facts sem lykill;gildi)

  nr;gildi   (röð, ef til)
  1;6,3
  2;6,0
  ```
  Escape: umlykja gildi með `"` ef inniheldur `;`/`"`/nýlínu; tvöfalda innri `"`.
- **`chartSvg(item)` → string|null:** sjálfstætt, merkt SVG (t.d. 640×280) — `null` ef engin röð. Inniheldur: titil (klipptur), sparkline-línu + fyllingu (endurnýtir `spark()`-hnit), lokagildi-punkt + merki, lægsta/hæsta-viðmið, og fót „Heimild: Karp · karp.is". Sjálfstætt (inline stílar, engir ytri fontar) svo það líti eins út hvar sem er.

### 2. Astro static endapunktar (myndast við byggingu)

Þrjár nýjar skrár undir `web/src/pages/frettavel/`, allar með `getStaticPaths` síað á `hasExport` og slug `asciiId(it.id)` (svo slóðin stemmi við `[id].astro`):

- **`[id].json.ts`** — `GET` skilar `JSON.stringify(exportJson(it))`, `content-type: application/json; charset=utf-8`.
- **`[id].csv.ts`** — `GET` skilar `exportCsv(it)`, `content-type: text/csv; charset=utf-8`.
- **`[id].svg.ts`** — `getStaticPaths` síað enn frekar á `chartSvg(it) !== null` (aðeins fréttir með röð); `GET` skilar SVG, `content-type: image/svg+xml; charset=utf-8`.

`getStaticPaths` í hverjum endapunkti afritar dedup-mynstur `[id].astro` (sleppir tvíteknum `asciiId`).

### 3. Greinasíða `[id].astro` — „📊 Gögn & graf"-kassi + JSON-LD

- **Nýr kassi** (birtur AÐEINS ef `hasExport(it)`), settur við hlið `fv-cite`:
  - „Sækja gögn": `<a download>` á `/frettavel/<slug>.json` og `.csv`.
  - „Sækja graf" (aðeins ef röð/`chartSvg` til): `<a download>` á `/frettavel/<slug>.svg` + **„Sækja PNG"**-hnappur.
  - Lína: „Frjáls til notkunar með tilvísun í Karp — karp.is".
- **PNG-hnappur (client-hlið):** sækir `.svg`-skrána (eða les inline SVG), teiknar á `<canvas>` (`Image`+`drawImage`), `canvas.toBlob('image/png')` → niðurhal. Ef canvas-rösun bregst → fellur á að opna SVG-ið (`onerror`).
- **`Dataset` JSON-LD:** bæta `distribution: [{'@type':'DataDownload', encodingFormat:'application/json', contentUrl:'…/<slug>.json'}, {…'text/csv'…'.csv'}]` (aðeins ef `hasExport`) + `license: 'https://karp.is/frettavel/'`.
- `fv-cite` og allt annað óbreytt.

### 4. Villumeðferð

- Endapunktar mynda AÐEINS fyrir `hasExport`-fréttir (getStaticPaths-sía) → engar tómar/villandi skrár; `.svg` aðeins þar sem röð er til.
- CSV/JSON escape-a öll gildi.
- `chartSvg` skilar `null` ef röð of stutt → `.svg`-slóð ekki mynduð, PNG-hnappur ekki sýndur.
- Client PNG-rösun í `try` með SVG-fallback.
- Slug-samræmi: endapunktar OG `[id].astro` nota `asciiId(it.id)` → hlekkir stemma alltaf við byggða skrá (sama gildra og var löguð í fréttavaktinni: hrátt id ≠ permalink).

## Einingar (aðgreining)

| Eining | Hvað | Háð |
|---|---|---|
| `frettavel-export.mjs` | Hreinar: hasExport/exportJson/exportCsv/chartSvg | `catOf`,`spark`,`asciiId` úr frettavel.mjs (allt keyrir á BYGGINGARTÍMA í Node → node:fs til staðar, svo full frettavel.mjs er innflytjanleg — ekki eins og worker) |
| `[id].json.ts`/`.csv.ts`/`.svg.ts` | Astro endapunktar → skrár | frettavel-export, ARCH |
| `[id].astro` kassi + JSON-LD | Viðmót + niðurhal + PNG | frettavel-export (hasExport), client-canvas |

## Gagnaflæði

```
byggingartími:
  ARCH.items ──(hasExport-sía)──► [id].json/.csv/.svg endapunktar → /frettavel/<slug>.{json,csv,svg}
  [id].astro (hasExport) → „Gögn & graf"-kassi m/ download-hlekkjum + Dataset JSON-LD distribution
notandi/fréttamaður:
  smellir „Sækja" → static skrá; „Sækja PNG" → client canvas úr .svg
  Google Dataset Search → indexar Dataset+distribution → findanlegt gagnasafn
```

## Prófun

- **Einingapróf** (`web/test/frettavel-export.test.mjs`, node:test) á `frettavel-export.mjs`:
  - `hasExport`: satt fyrir facts-frétt, satt fyrir spark-röð ≥4, ósatt fyrir texta-frétt / röð <4.
  - `exportJson`: rétt lyklar, slóð = asciiId-permalink, facts/röð borin rétt, leyfi til staðar.
  - `exportCsv`: escape á `;`/`"`/nýlínu, facts-hluti + röð-hluti.
  - `chartSvg`: skilar SVG-streng með titli+„Karp" fyrir röð; `null` án raðar.
- **Bygging** (`astro build`) = aðhalds-hlið: staðfestir að endapunktar myndi skrár og síðan þýðist. Handvirk: opna `/frettavel/<slug>.json` + `.svg` á byggðu `dist` og staðfesta innihald + að PNG-hnappur virki í vafra.

## Áhætta / opnar spurningar

- **Röð er gildi-only** (engar dagsetningar á x-ás) — grafið/CSV sýnir þróun síðustu N gildi án nákvæmra tímastimpla. Ásættanlegt v1; dagsetta röð væri úrbót ef `spark` yrði geymt með tímaásum.
- **Fáar fréttir bera gögn núna** (~4 facts / 2 spark af 51) — fítusinn birtist aðeins þar sem við á; vex með tegundum (vextir/verðbólga/fasteignir/vika/þema…) yfir tíma.
- **Skráafjöldi:** aðeins gagna-drifnar fréttir fá skrár (ekki 500× tómar) — byggingar-yfirbót lítil.
