# Auðgun skýrslnanna þriggja — hönnunarskjal

**Dagsetning:** 2026-07-09
**Staða:** Samþykkt af Aroni (hönnun), bíður spec-yfirferðar → plan.

## Markmið

Auðga þrjár söluskýrslur KARP (Fyrirtækjaskýrsla `/fyrirtaeki/`, Endanlegir eigendur `/eigendur/`, Áreiðanleikamat `/fyrirtaeki/?vidmot=areidanleiki`) með 9 nýjum fítusum sem nýta opinber gögn — til að jafna/yfirstíga Creditinfo án lánshæfismats/vanskilaskrár.

## Arkitektúr

Astro SSG (`web/dist`) + Cloudflare Worker (`web/worker.js`) + WordPress (wp.karp.is) bakendi. Ný gögn myndast á byggingartíma (build-skriptur → `web/public/gogn/*.json`) eða á-eftirspurn gegnum worker. Skýrslurnar eru render-aðar client-hlið: `web/src/pages/fyrirtaeki.astro` (fsKort=full, fsAreidView=KYC) og `web/src/lib/ubo-report.js` (eigReport, deilt af `/eigendur/` + `/fyrirtaeki/`). Fítusar birtast innan þeirra með sama stíl (`ubo.css`, inline-SVG, engin ytri lib → CSP-öruggt).

## Tæknistafli

Node ESM build-skriptur (`skriptur/`), Python pdf-þáttari (`parse_arsreikningur.py`), Cloudflare Worker (fetch API), WordPress REST (WPCode PHP-snippet). Hagstofa PxWeb (json-stat POST). ESB/SÞ refsilistar (XML/CSV). Engin ný npm-dependency.

## Almenn skilyrði (lagaleg — gilda fyrir öll verk)

- **Ekkert lánshæfismat né vanskilaskrá** (Persónuverndar-leyfisskylt). Aðeins opinber gögn.
- Nafnasamsvaranir (PEP, refsilistar, eigendur-í-fréttum, gjaldþrota-tengsl) birtast **alltaf** merktar „nafnasamsvörun — staðfestu auðkenni", **aldrei sem úrskurður**.
- Einstaklingar: aðeins nafn + fæðingarár (úr RSK/ársreikningum). Engin kt einstaklinga nema úr opinberum ársreikninga-hluthafalista.
- Eignarhlutur í krónum = **bókfært eigið fé** skv. ársreikningi, skýrt merkt — EKKI markaðsvirði/verðmat.
- Kennitöluflakk/gjaldþrota-tengsl = **vísbendingar**, ekki staðfesting.
- Refsilistar: **opinberu ESB+SÞ listarnir beint** — EKKI OpenSanctions (atvinnuleyfisskylt fyrir viðskiptanotkun).

---

## Fítusar

### 🏢 Fyrirtækjaskýrsla (fsKort í `fyrirtaeki.astro`)

**F1 — Fjárhagsþróun myndrænt.**
- Uppspretta: `gogn/arsreikningar/<kt>.json` → `ar[<ár>].rekstur.sala`, `.hagnadur`, `.efnahagur.eigid_fe`, `.kpi.framlegd` (öll til).
- Render: inline-SVG smá-súlurit (2–5 ár) fyrir veltu, hagnað, eigið fé + framlegðar-línu. Í `fsFjarhagur`. Litir úr `ubo.css`-breytum. Neikvæður hagnaður = rauð súla.
- Bónus: persista *meðalfjöldi starfsmanna* úr PDF (`parse_arsreikningur.py`) → `ar[<ár>].starfsmenn` → „X starfsmenn" + `laun/starfsmaður`.
- Ásættanlegt: súlurit birtast þegar ≥1 ár er til; enginn ytri lib.

**F2 — Samanburður við atvinnugrein.**
- Uppspretta: Hagstofa `FYR08000` (rekstrarupplýsingar eftir atvinnugreinum, ÍSAT2008) um PxWeb.
- Build: `skriptur/build_sector.mjs` sækir heildartölur per ÍSAT-bálk/2-stafa grein, leiðir út greinar-hlutföll (framlegð, hagnaðarhlutfall, eiginfjárhlutfall) → `gogn/sector_kpi.json` lyklað á ÍSAT-kóða.
- Render: í `fsFjarhagur`, við hlið KPI félagsins: „Framlegð 12% · grein 8%". ÍSAT-kóði félagsins kemur úr RSK-prófílnum sem er þegar sóttur við render (staðfest í spec-vinnu hvar hann liggur).
- Takmörkun: Hagstofa á ~1–2 ára eftirásamt + safntölur → **leiðbeinandi viðmið**, merkt sem slíkt.

**F3 — Opinber fótspor (samantekt).**
- Uppspretta: styrkir/útboð/vörumerki/skip — allt þegar á síðunni sem flísar.
- Render: ein samantektarlína efst í fótspor-hluta: „🏛️ 3 styrkir (12 m.kr.) · 📋 2 útboð · ™️ 4 vörumerki · 🚢 1 skip". Tenglar í flísarnar.
- Ásættanlegt: sleppir tómum liðum; engin ný gagnasókn.

### 🔗 Endanlegir eigendur (eigReport í `ubo-report.js`)

**F4 — Öfugt eignarhaldsnet (verk #25).**
- Uppspretta: öll `gogn/eigendur/*.json` (framað net, til).
- Build: `skriptur/build_eigendur_reverse.mjs` skannar allar skrár, snýr við `net.edges` → lyklað á eiganda (kt fyrir félög, `nafn|fæðing` fyrir einstaklinga) → `gogn/eigendur_reverse.json` `{ownerKey: [{kt, nafn, hlutur}]}`.
- Render/aðgangur: worker `/api/reverse?kt=&nafn=&faeding=` les skrána → „Þessi eigandi á einnig: X (60%), Y (100%)". Í eigReport, undir UBO-töflunni.
- Takmörkun: þekja = aðeins **greind** félög (á-eftirspurn) → vex með tíma. Merkt „byggt á greindum félögum".

**F5 — PEP-merking á netinu.**
- Uppspretta: `gogn/pep.json` (110 færslur, `n` normaliserað nafn, til) + `pepNorm`-samsvörun.
- Render: í `eigNet` SVG — hver `tegund:einst` hnútur með PEP-samsvörun fær rauðan hring + hlutverk í tooltip; lína í legend. `pep.json` hlaðið í eigReport (eins og í KYC).
- Framing: „nafnasamsvörun við PEP-skrá — staðfestu".

**F6 — Eignarhlutur í krónum.**
- Uppspretta: `endanlegir[].hlutur` / `raunverulegir[].hlutur` × `arsreikningar/<kt>.json` `ar[nýjasta].efnahagur.eigid_fe`.
- Render: í UBO-töflu + raunverulegir: „60% ≈ 240 m.kr." Aðeins þegar hlutur þekktur + ársreikningur til.
- Framing: „bókfært eigið fé skv. ársreikningi <ár> — ekki verðmat".

### 🛡️ Áreiðanleikamat (fsAreidView í `fyrirtaeki.astro`)

**F7 — Fjölmiðlaumfjöllun (adverse media).**
- Uppspretta: `wp_karp_news` (WP DB) + sentiment (`build_archive_sentiment.js`, til).
- Nýtt: WP-snippet `karp/v1/newsmentions?q=<hugtök>` (LIKE-leit á titli → `{ts, source, title, url, sentiment}`). Worker `/api/adverse?kt=` sækir félagsnafn (RSK) + eigenda-eftirnöfn (eigendur), kallar newsmentions, dedup, skilar.
- Render: í fsAreidView: „📰 Fjölmiðlaumfjöllun: N greinar (M neikvæðar)" + listi m/ tenglum. Neikvæð sentiment merkt.
- Takmörkun/framing: nafnasamsvörun → **félagsnafn aðal** (sérkennandi), eigenda-nöfn aukaleg og merkt „staðfestu auðkenni". Ferskt (WP DB, live).

**F8 — Gjaldþrota-tengsl & viðvörunarmerki.**
- Uppspretta: `gogn/logbirting.json` (`byKt`, slit/gjaldþrot m/dags., til) + `gogn/stjorn/<kt>.json` (stjórn, til).
- Render: í fsAreidView, þrjú merki: (a) eigin Lögbirting-staða (þegar í #fs-logbirting — vísa í), (b) **svipað nafn nýlega slitið** (fuzzy nafna-samsvörun v. `logbirting.json` slit → „líkist nýlega slitnu félagi: X"), (c) tækifæris: sameiginlegur stjórnarmaður/eigandi við félag í logbirting (þegar stjórn/eigendur þess eru til).
- Takmörkun: **heimilisfangs-samsvörun síðar** (föng ekki geymd staðbundið). Allt merkt „vísbendingar, ekki staðfesting".

**F9 — Þvingunaraðgerða-skimun.**
- Uppspretta: **opinberi ESB samsteypti refsilistinn** (data.europa.eu, XML/CSV, daglega) + **SÞ öryggisráðs-listinn**. EKKI OpenSanctions.
- Build: `skriptur/build_sanctions.mjs` → normaliseruð nöfn + listi + prógram → `gogn/sanctions.json`.
- Render: í fsAreidView, samsvara eigenda- + stjórnar-nöfnum (norm eins og pepNorm). „⚠ Möguleg samsvörun við refsilista (ESB): <nafn> — ekki staðfesting, staðfestu auðkenni". Grænt „engin samsvörun" ella.
- Takmörkun: nafnasamsvörun, há false-positive áhætta á algengum nöfnum → krefjast fulls nafns; alltaf „ekki staðfesting".

---

## Ný innviði

**Build-skriptur (`skriptur/`):**
- `build_sector.mjs` → `gogn/sector_kpi.json` (Hagstofa FYR08000).
- `build_sanctions.mjs` → `gogn/sanctions.json` (ESB+SÞ).
- `build_eigendur_reverse.mjs` → `gogn/eigendur_reverse.json` (skannar eigendur/*.json).
- `parse_arsreikningur.py`: bæta `starfsmenn` (meðalfjöldi) í úttak (F1 bónus).
- Bæta þremur fyrrnefndum við næturkeyrslu (`refresh-data.yml`) + `build_ragcopy.js` afritun ef við á.

**Worker-endapunktar (`web/worker.js`):**
- `/api/adverse?kt=` — assemblar nöfn, kallar WP newsmentions.
- `/api/reverse?kt=&nafn=&faeding=` — les `eigendur_reverse.json`.
- Skimun (F9) les `sanctions.json` client-hlið (eða worker ef skrá stór).

**WordPress (Aron endurlímar, WPCode):**
- `karp/v1/newsmentions` snippet — LIKE-leit á `wp_karp_news.title`, skilar `{ts, source, title, url, sentiment}`. Skjalfest í plani, Aron límir á wp.karp.is.

**Render-breytingar:**
- `web/src/pages/fyrirtaeki.astro`: fsFjarhagur (F1, F2, F6-tengt), fsKort fótspor (F3), fsAreidView (F7, F8, F9).
- `web/src/lib/ubo-report.js`: eigReport/eigNet/eigTable (F4, F5, F6).
- `web/src/styles/ubo.css`: nýir stílar (súlurit, PEP-hringur, merki).

## Prófun / sannreyning

- `npm run build` (astro, 195+ síður) hreint eftir hverja bylgju.
- `node --check` á breyttum `.mjs`/runtime-`<script>` (import→.mjs).
- Build-skriptur: keyra staðbundið, staðfesta úttaks-JSON snið + `node --check`.
- Preview MCP: `?syni=1` (fsKort/F1–F3), `?eigendur-syni=1` eða raun-uppfletting (eigReport/F4–F6), `?vidmot=areidanleiki` (fsAreidView/F7–F9). DOM-lestur staðfestir render.
- Legal-gát: hvert nafnasamsvörunar-merki ber „staðfestu"-texta.

## Byggingarröð (ein grein `skyrslu-audgun-wt`, tekjulínan varin)

1. **Bylgja 1 — Grunngögn:** build-skriptur (sector, sanctions, reverse) + parser-starfsmenn + WP-snippet skjalað. Engin sýnileg UI-breyting; prófanleg ein og sér (úttaks-JSON).
2. **Bylgja 2 — Fyrirtækjaskýrsla:** F1, F2, F3.
3. **Bylgja 3 — Endanlegir eigendur:** F4, F5, F6.
4. **Bylgja 4 — Áreiðanleikamat:** F7, F8, F9.

Hver bylgja: build + preview-sannreynt → deploy (eða merge í lok). Claude byggir í worktree; Aron mergar.

## Utan umfangs (v1.1)

- „Seeding" á öfugu neti + fjölmiðlaskimun fyrir breiðari þekju strax (nú: vex á-eftirspurn).
- Heimilisfangs-samsvörun í kennitöluflakki (þarf að geyma föng).
- Markaðsvirði eignarhlutar (nú: bókfært).
- Samsett „áhættustig" (vísvitandi sleppt — nálgast lánshæfismat).
