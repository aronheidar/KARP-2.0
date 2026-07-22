# RÁS-afleiðingar í fréttavél og þingmálum — hönnunarskjal

**Dagsetning:** 2026-07-22
**Höfundur:** Claude (brainstorming með Aroni)
**Staða:** Samþykkt hönnun, bíður yfirlestrar fyrir útfærsluáætlun

## Markmið

Tengja RÁS-þjóðhagsherminn (`/hermir/`) við tvær efnisveitur svo lesendur sjái **hvað atburður hefur í för með sér samkvæmt líkaninu**:

1. **Fréttavélin** (`/frettavel/<id>/`) — macro-fréttir (stýrivaxtabreyting, gengi, verðbólga, atvinnuleysi, húsnæði) fá „📊 Samkvæmt RÁS"-kassa.
2. **Þingmál** (`/thingmal/`) — frumvörp sem hafa efnahagsleg áhrif fá sama kassa (spjald + gluggi).

Kassinn sýnir stærstu áhrifin á lykil-hagvísa (átt + tölur), plain-íslenska setningu, fyrirvara, og djúp-hlekk „Prófa í RÁS →" sem opnar herminn með nákvæmlega réttri sviðsmynd.

## Grunn-ákvarðanir (úr brainstorm)

| Ákvörðun | Niðurstaða |
|---|---|
| Umfang frétta | **Bæði** tegundir: (A) drifkraftar sem líkanið tekur inn → full hermun; (B) útkomu-fréttir (verðbólga/atvinnuleysi mælast) → tengsla-lestur (fyrsta-stigs) úr `links`, ekki hermun. |
| Stærð áhrifa þegar hún er óviss (þingmál, útkomu-fréttir) | **Skýringar-stærð með tölum**: curað dæmi-stærð, merkt „dæmi til skýringar" + fyrirvari. Aldrei framsett sem raunspá málsins. |
| Vörpunar-vél | **Blendingur**: fréttavél = regla per skynjara (byggingartími, engin ný AI, skynjarinn þekkir efni+stærð). Þingmál = LLM-flokkun ofan á núverandi `build_summaries.js`-köllun. |
| Keyrsla | **Byggingartími** — vélin er isomorphic; síður eru SSG; bakað í HTML (SEO + ókeypis). |

## Byggingar-yfirlit (Approach 1)

Ein deilt, hrein eining knýr allt; hvor efnisveita útvegar bara „trigger" og teiknar niðurstöðuna.

```
                        gogn/roads/{baseline,links}.json
                                     │
            ┌────────────────────────┴───────────────────────┐
            │           src/lib/roads/frett-ras.mjs           │
            │   projectRas(trigger, {baseline, links})        │
            │   → RasProjection | null                        │
            └───────┬───────────────────────────────┬─────────┘
                    │                                │
   build_frettavel.js (CJS, await import)   build_summaries.js (CJS)
   regla per macro-skynjara                 LLM skilar {key,dir,size}
        │  ev.facts.ras = proj                   │  bill.ras = proj
        ▼                                        ▼
   frettavel_archive.json                   frumvorp.json
        │                                        │
   [id].astro (SSG frontmatter)             thingmal.astro (spjald + bmOpen gluggi)
        └────────── renderRasBox(projection) ────┘   (deilt teiknari)
```

**Ný snerti-fletir (það sem breytist):**
- **Nýtt:** `src/lib/roads/frett-ras.mjs`, `src/lib/roads/render-ras-box.mjs`, einingapróf.
- **Breytt:** `skriptur/build_roads.mjs` (bæta `polarity` í útkomur), `skriptur/build_frettavel.js` (vörpunar-tafla + kall), `skriptur/build_summaries.js` (víkka LLM-skema + kall), `web/src/pages/frettavel/[id].astro` (kassi), `web/src/pages/thingmal.astro` (flís + gluggi).
- **Óbreytt:** `src/lib/roads/engine.mjs` (engin vélar-breyting), `web/src/pages/hermir.astro` (nema valkvæð `polarity`-samstilling).

## Eining 1 — `src/lib/roads/frett-ras.mjs`

Hrein, isomorphic fall-eining. Engar aðrar breytingar á vélinni. Ræðst aðeins á `baseline` + `links` + `engine.simulate`.

### Viðmót

```js
export function projectRas(trigger, { baseline, links }) { /* → RasProjection | null */ }
```

**Trigger:**
```js
{ kind: 'lever',   key: 'vextir', value: 8.5 }        // absolút gildi sleðans (sömu einingar og state.levers)
{ kind: 'shock',   key: 'gengi',  value: -6 }         // frávik (base 0)
{ kind: 'outcome', key: 'verdbolga', bump: 1 }        // Type B: +1 eining (default bump=1)
{ kind: 'preset',  id: 'vaxtalaekkun' }               // flettir upp PRESETS → sleðar+sjokk+setning
```

**RasProjection (skil):**
```js
{
  mode: 'sim' | 'links',
  illustrative: boolean,                 // true → „dæmi til skýringar"-merki
  inputLabel: string,                    // t.d. 'Stýrivextir 9,00% → 8,50%' (teiknarinn má líka setja saman)
  inputKey: string,                      // lykill sem varð fyrir breytingu (fyrir djúp-hlekk)
  horizonQuarters: 12,
  topEffects: [                          // 3–4, raðað eftir |áhrifum| (fallandi)
    { key, label, delta, dir: -1|0|1, unit, valence: -1|0|1 }
  ],
  sentence: string,
  deepLink: string,                      // '/hermir/#s.gengi=-6'  eða  '#l.vextir=8.5'
  source: 'RÁS-hermir'
}
```

### Útreikningur

**sim-hamur** (lever / shock / preset):
1. Byggja `levers` / `shocks` yfirlag úr trigger (preset: úr `PRESETS[id]`).
2. `const r = simulate({ baseline, links, levers, shocks, quarters: 12 })`.
3. Fyrir hverja útkomu `k`: `delta = r.outcomes[k].mid[last] - r.outcomes[k].baseline[last]` (frávik við 3 ár).
4. Sleppa útkomum með `|delta| < EPS[unit]` (sjá Villumeðferð). Raða eftir `|delta|`, taka top 4.
5. `dir = Math.sign(delta)`; `valence = dir * (baseline.outcomes[k].polarity ?? 0)` → 1 gott / −1 slæmt / 0 hlutlaust (fyrir lit).
6. `sentence`: ef trigger==preset eða jafngildir preset → nota `PRESETS[id].sentence`; annars setja saman úr stærsta áhrifi.
7. `illustrative`: fylgir triggernum (fréttavél sim = ósatt fyrir vexti/gengi; þingmál = satt).

**links-hamur** (outcome):
1. Safna beinum niðurstreymis-tengslum: `links.filter(l => l.from === key && l.to !== key && baseline.outcomes[l.to])`.
2. Fyrir hvert: `delta = l.coef * bump` (fyrsta-stigs; hunsar töf en má merkja „tafið" ef `l.lag > 2`). `dir = Math.sign(l.coef)`.
3. Raða eftir `|delta|`, top 4; `valence` eins og að ofan; `illustrative = true` alltaf.
4. `sentence` samsett: „Hærri/lægri {label} tengist skv. RÁS: {stærsta áhrif …}".
5. `deepLink`: `/hermir/#tb=model` (opnar keðju-kortið) — útkomur eru ekki inntök svo engin sviðsmynd.

**Djúp-hlekkur (sim):** `#` + `l.<key>=<value>` (lever) eða `s.<key>=<value>` (shock); preset með báðum: skeyta með `&`. Speglar `serialize()` í `hermir.astro` (`l.`/`s.`/`h`/`tb` í URL-hash).

### Villumeðferð / varnir

- Skilar `null` ef: trigger-lykill finnst ekki í `baseline.levers`/`.shocks`/`.outcomes`; `simulate` skilar ó-endanlegu (`!Number.isFinite`); eða ekkert áhrif ≥ þröskuldi (`EPS`). Þá teiknast **enginn kassi** (aldrei „engin áhrif"-froða).
- `EPS`: einfaldur alger þröskuldur per einingu — `%`/`pp`: 0,05; `% VLF`: 0,05; vísitölur: 0,3. (Fínstillanlegt.)
- Fjöldi `topEffects` klipptur við 4.
- `preset`-uppfletting sem finnst ekki → `null`.

### `polarity` í `baseline` (model=data)

`POLARITY` býr núna inline í `hermir.astro`. Til að hafa **eina heimild** bætir `build_roads.mjs` `polarity: -1|0|1` við hverja útkomu-skilgreiningu (t.d. `verdbolga:-1`, `hagvoxtur:+1`, `mannfjoldi:0`). `frett-ras.mjs` les `baseline.outcomes[k].polarity ?? 0`. `hermir.astro` má síðar skipta yfir í `baseline`-gildið (valkvætt, með prófi sem ber saman við núverandi inline-kort — ekki skylt í þessu verki).

## Eining 2 — Fréttavél

### Vörpunar-tafla (regla)

`skriptur/build_frettavel.js` — lítil tafla `MACRO_RAS` (má vera í eigin `.mjs` eða inline):

| `type` | trigger | tegund |
|---|---|---|
| `vextir` | `{kind:'lever', key:'vextir', value: <nýir vextir úr facts>}` | A · sim |
| `gengi` | `{kind:'shock', key:'gengi', value: <%breyting; met+ = styrking>}` | A · sim |
| `verdbolga` | `{kind:'outcome', key:'verdbolga'}` | B · links |
| `atv` | `{kind:'outcome', key:'atvinnuleysi'}` | B · links |
| `leiga` | `{kind:'outcome', key:'leiga'}` | B · links |
| `fast` / `fastthr` | `{kind:'outcome', key:'husnaedi'}` | B · links |
| `vika`, `thema` | — sleppt í fyrsta kasti | — |

### Flæði

1. Í `main()`/eftir `detect()`: fyrir hvern atburð með `type ∈ MACRO_RAS`, lesa nauðsynleg gildi úr `ev.facts`, kalla `projectRas`, og `ev.facts.ras = projection` (ef ekki `null`).
2. `facts` (og þar með `ras`) er þegar vistað í `frettavel_archive.json` (`build_frettavel.js` ~:949). Engin breyting á feed-skránni þarf.
3. `web/src/pages/frettavel/[id].astro` les `it.facts.ras` í frontmatter og teiknar `renderRasBox(it.facts.ras)` í `<article>`-líkamanum (nálægt `fv-samhengi`-kassanum, ~:60).

### CJS/ESM

`build_frettavel.js` er CommonJS; `frett-ras.mjs` er ESM. Nota `const { projectRas } = await import('../src/lib/roads/frett-ras.mjs')` (virkar í nútíma Node úr CJS). Sömuleiðis fyrir `render-ras-box.mjs` ef notað í byggingu (annars aðeins í Astro).

### Nauðsynleg `facts`-svið (staðfesta í útfærslu)

- `vextir`-skynjari (~:501): þarf nýja meginvexti (absolút). Staðfesta reit-nafn í `ev.facts`.
- `gengi`-skynjari (~:559): þarf %-breytingu og átt (met-hátt = styrking → jákvætt sjokk).

## Eining 3 — Þingmál

### LLM-skema (víkkun á `build_summaries.js`)

Núverandi köllun skilar `sam` (ein setning). Víkka **sömu** Claude-köllun (`claude-opus-4-8`) til að skila líka:

```json
{ "sam": "…",
  "ras": null | { "key": "<gildur lever/shock lykill>", "dir": 1, "size": "meðal", "why": "…" } }
```

- Prompt fær lista yfir **lögleg inntök** (lever/shock lyklar + label). `ras:null` ef frumvarpið er ekki efnahagslega markvert.
- **Stærð er curað, ekki hölluð af LLM.** LLM velur aðeins `key` + `dir` (+1/−1) + `size` (`lítil`/`meðal`/`stór`). Bygging varpar `(key,size) → magnitude` úr töflu `RAS_SIZE`:

| lever | lítil | meðal | stór |
|---|---|---|---|
| skattar / fjarmagnstekjuskattur / tryggingagjald | 3 | 5 | 10 (%) |
| utgjold / innvidir | 5 | 10 | 20 (%) |
| kolefnisgjald | 25 | 50 | 100 (%) |
| kvoti / veidigjald | 10 | 20 | 30 (%) |
| orka / orkuskipti / skograekt | 10 | 15 | 30 (%) |
| frambod / leiguhusnaedi / lodaframbod | 10 | 20 | 30 (%) |
| (annað) | lever.step | 2×step | 4×step |

- `value = dir * magnitude`. Cache `{sam, ras}` í `samantektir.json` (lykill `157_<nr>`).

### Flæði

1. `build_summaries.js` (eða nýtt `build_thingmal_ras.mjs` sem keyrir á eftir): fyrir hvert frumvarp með `ras.relevant`, reikna `magnitude` úr `RAS_SIZE`, kalla `projectRas({kind: 'lever'|'shock', key, value})`, og `bill.ras = { ...projection, illustrative:true }` í `frumvorp.json`.
2. `web/src/pages/thingmal.astro`:
   - **Spjald** (~:135): lítil RÁS-flís ef `bill.ras` — stærsta áhrif + ör (t.d. „RÁS: hagvöxtur ▲").
   - **Gluggi** `bmOpen` (~:339): fullur kassi með `renderRasBox(bill.ras)`.
3. Aðeins frumvörp þar sem `ras != null && projection != null` fá kassa.

### Slóða-varúð

`build_frumvorp.js`/`build_summaries.js` hardkóða OneDrive-slóð (`…/OneDrive/…/hagvisir/gogn/`) en `thingmal.astro` les `@gogn/frumvorp.json` (repo-rót `gogn/`). Útfærslan verður að **skrifa í þá `gogn/` sem `@gogn`-alíasinn les** (repo-rót). Staðfesta og samræma í plani.

## Eining 4 — `renderRasBox(projection)` (deilt teiknari)

`src/lib/roads/render-ras-box.mjs` — isomorphic, skilar HTML-streng. Notað í Astro-frontmatter (fréttavél) og í þingmál-glugganum (bakað eða client-kall).

### Útlit

```
┌ 📊 Samkvæmt RÁS-hermi ────────────────────( ? )┐
│ Stýrivextir 9,00% → 8,50%      [dæmi til skýr.] │
│ ─────────────────────────────────────────────  │
│ Verðbólga        ▲  +0,3 pp   (eftir 3 ár)      │   ← litað: POLARITY·dir
│ Húsnæðisverð     ▲  +1,2 %                       │
│ Hagvöxtur        ▲  +0,4 %                       │
│ ─────────────────────────────────────────────  │
│ „Vaxtalækkun örvar hagvöxt og húsnæðisverð, á   │
│  kostnað hærri verðbólgu tafið."                 │
│ Stílfærð sviðsmynd — ekki spá.   Prófa í RÁS →  │
└─────────────────────────────────────────────────┘
```

- **Litur raða:** grænt `#54d08a` (valence +1), rautt `#e78284` (−1), blátt/hlutlaust `#6ea8fe` (0) — sömu gildi og `hermir.astro`.
- **Merki „dæmi til skýringar"** birtist aðeins ef `illustrative`.
- **Fyrirvari:** „Stílfærð sviðsmynd úr opna RÁS-hermin um — ekki spá." (+ „byggt á dæmi-stærð" ef illustrative).
- **Tölusnið:** `toLocaleString('is-IS')`, eining á eftir; teiknarinn sér um snið (einingin skilar hráum `delta`).
- **Type B (links):** raðir sýna „+1 prósentustig → {label} {ör}" í stað hermdra 3-ára talna.
- **CTA:** `<a href="{deepLink}">Prófa í RÁS →</a>`.

### CSS

Speglar `fv-samhengi` á fréttasíðu. Ný stétt-nöfn með `r-`-forskeyti (Astro `is:global`-lekar almenn nöfn — sjá minnis-varúð). Innbyggt í glugga-streng á þingmálum.

## Gagnaflæði (samantekt)

1. **Bygging:** `build_roads.mjs` → `baseline.json` (nú með `polarity`). `build_frettavel.js` → `ras` í `facts` → archive. `build_summaries.js` → `{sam,ras}` → `frumvorp.json`.
2. **Astro-bygging (SSG):** `[id].astro` og `thingmal.astro` lesa `ras` og teikna kassa/flís í HTML.
3. **Vafri:** kassinn er stöðugt HTML (SEO); „Prófa í RÁS →" opnar `/hermir/#…` með réttri sviðsmynd.

## Villumeðferð (á kerfis-stigi)

- `projectRas` skilar `null` → enginn kassi (ekki tóm skel).
- Þingmál án `ras` eða með ómarkverðu → enginn kassi/flís.
- LLM skilar ógildum lykli → bygging fellir `ras` niður (validera á móti `baseline`-lyklum; logga).
- Fréttavél: ef `facts` vantar reit → sleppa RÁS fyrir það mál (ekki brjóta bygginguna).

## Prófstefna

- **Einingapróf `frett-ras.mjs`** (í stíl við `backtest_roads.mjs`/`engine.test.mjs`):
  - sim-átt: vaxtalækkun → hagvöxtur `dir>0`, verðbólga `dir>0` tafið; olíu-sjokk → verðbólga `dir>0`.
  - links-formerki: `verdbolga` outcome → kaupmáttur `dir<0`, greiðslubyrði `dir>0`.
  - null-tilfelli: óþekktur lykill → `null`; hverfandi áhrif → `null`.
  - determinismi: sama trigger → sama úttak.
  - `valence` réttur (POLARITY·dir).
- **Einingapróf `render-ras-box.mjs`:** skilar streng með væntum reitum; „dæmi"-merki aðeins þegar `illustrative`; djúp-hlekkur rétt sniðinn.
- **Golden-skoðun:** keyra á 3–4 raun-archive-mál + 3–4 raun-frumvörp; handvirkt auga á úttak.
- **Headless-vafra staðfesting:** ein fréttasíða (t.d. vaxta-mál) + þingmála-gluggi sýna kassann; engar console-villur.
- Vélar-prófin fjögur **óbreytt** (vélin snert ekki) — ekki endurkeyrð sem hluti af þessu.

## Umfang fyrsta kasts

- Fréttavél: `vextir`, `gengi`, `verdbolga`, `atv`, `leiga`, `fast`/`fastthr`. (`vika`/`thema` síðar.)
- Þingmál: frumvörp merkt efnahagslega markverð af LLM.
- Ekki í þessu kasti: nýir skynjarar fyrir olíu/ferðamenn/heimshagvöxt í fréttavél (sjokkar eru til í líkani en enginn skynjari les þá); samstilling `hermir.astro` POLARITY við baseline (valkvætt).

## Global Constraints (gilda um öll verk-skref)

- **Worktree:** allar skrár í `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` (EKKI OneDrive). Breyta Í worktree.
- **Deploy:** `git push origin b2b-topbar:main` (síða + worker). Push deployar líka worker.
- **Vél óbreytt:** `src/lib/roads/engine.mjs` er ekki breytt í þessu verki.
- **Byggingartími:** engin ný client-hermun; kassar bakaðir í HTML.
- **Opinber síða — fyrirvari skylda:** hvert kassa með óvissri stærð BER „dæmi til skýringar" + „ekki spá". Aldrei framsett sem raunspá.
- **Ein heimild fyrir POLARITY:** `baseline.outcomes[k].polarity` (bætt í `build_roads.mjs`).
- **CSS:** ný stétt-nöfn með `r-`-forskeyti (Astro `is:global`).
- **Staðfesta gogn-slóð:** skrifa í repo-rót `gogn/` sem `@gogn`-alías les (ekki OneDrive-hagvisir).
- **Sannreyna í vafra, ekki curl|grep** (hashed bundle → falskt neg fyrir JS).
