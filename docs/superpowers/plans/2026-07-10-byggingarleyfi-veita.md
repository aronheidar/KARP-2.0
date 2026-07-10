# Byggingarleyfa-veita — útfærslu-plan

> **For agentic workers:** verifun þessa kóðabáss er `--audit`-hamur + `npm run build` +
> dev-server 200 + `node --check` (ENGIN pytest-svíta til). Fylgið því, ekki pytest-TDD.
> Fyrirmynd: `skriptur/build_logbirting.py` (PDF→regex→incremental) og `web/src/pages/eftirlit.astro`
> (SSR + Leaflet + client-leit).

**Goal:** Opin byggingarleyfa-veita (RVK byggingarfulltrúi) → „byggingarsaga heimilisfangs" í
verðmatsskýrslu + ný `/byggingarvakt/` síða.

**Architecture:** Python-gagnapípa skrapar 273 fundargerða-PDF, þáttar færslur (heimilisfang +
USK-mál + ákvörðun), auðgar með Staðfangaskrá (postnr/hnit/hverfi), skrifar kanónískt JSON +
per-póstnúmer skrár + vakt-feed. Tveir Astro-neytendur lesa kyrrstæðu skrárnar. Enginn worker.

**Tech Stack:** Python 3.9 + pypdf 6.14 (til staðar) · urllib · Astro (static) · Leaflet (on-demand).

## Global Constraints

- Vinna BEINT í worktree `C:\Users\aronh\dev\KARP\byggingarvakt-wt` (off `origin/main`). Eitt push á endanum.
- Dual-write gagna: `gogn/<x>` OG `web/public/gogn/<x>` (framenda-neytendur lesa úr `web/public/gogn`).
- Heimilisfang-lyklun, ENGIN kt. Birta aðeins það sem opinberi PDF birtir. Fyrirvari í gögnum.
- Íslenska í UI + úttökum. Windows-konsóll: `sys.stdout.reconfigure(encoding='utf-8')`.
- Slóðir PDF-a EKKI deterministic → skrapa vísi-síðuna.
- Astro `<script>` sem notar `import` → externalað í dev; verifun = `node --check` á `.mjs`-útdrátt.

---

### Task 1: PDF-þáttunar-kjarni + `--audit`

**Files:**
- Create: `skriptur/build_byggingarleyfi.py`

**Interfaces (Produces):**
- `fetch_pdf_links() -> list[str]` — skrapar vísi, skilar PDF-URL-um (afgreiðslufundir byggingarfulltrúa).
- `parse_meeting(url, txt) -> {fund:int|None, date:'YYYY-MM-DD'|None, entries:[entry]}`
- `entry = {addr, caseNo, desc, type, decision, decisionCode, date, fund, sizeM2, sizeM3, url}`
- `--audit N` → þáttar N nýjustu fundi, prentar færslur + talningu, skrifar EKKERT.

**Lyklar (staðfest á fundi 1262):**
- Vísir: `https://reykjavik.is/byggingarmal/fundargerdir-byggingarfulltrua`; taka `href` sem inniheldur
  `.pdf` OG (`byggingarfulltru`|`afgrei`|`BYGG`) → sía burt skipulagsfulltrúa/óskyld.
- Færslu-split: `re.split(r'(?=^\s*\d{1,3}\.\s+.+?\s*[-–]\s*USK\d)', txt, flags=M)` — hver blokk =
  ein færsla. Haus-regex fyrir addr+USK: `^\s*(\d{1,3})\.\s+(.+?)\s*[-–]\s*(USK\d[\w./-]*)`.
  ⚠ Klippa síðunúmer-mengun („2. Álftamýri 79" fékk „026" forskeyti) → anchor á línu-byrjun (`^`, `re.M`)
  og hreinsa `addr` af leiðandi tölum.
- Dags + fund úr haus: `Árið (\d{4}),.*?(\d{1,2})\.\s*([a-záðéíóúýþæö]+).*?(\d{1,3})\.\s*fund` (mán-nafn→númer).
- Lýsing: eftir `Sótt (?:er )?um (?:leyfi til að |byggingarleyfi til að |heimild til að )?(.+?)(?=\n(?:Stækkun|Stærð|Erindi|Samþykkt|Synjað|Frestað|Vísað)|$)` — fletja línubil, klippa.
- Stærð: `(?:Stækkun|Stærð):\s*([\d.,]+)\s*ferm.*?([\d.,]+)\s*rúmm` → sizeM2, sizeM3 (float, komma→punktur).
- Ákvörðun: leita í blokk að fyrsta línu-byrjunar-lykilorði:
  `samthykkt`←`^Samþykk`, `synjad`←`^Synja`, `frestad`←`^Fresta`, `visad_fra`←`^Vísað frá`,
  `afturkallad`←`^Afturkalla`, annars `annad`. `decision` = mannvænt label.
- `type`: `byggingarleyfi` sjálfgefið; ef lýsing/heiti nefnir „stöðuleyfi"/„niðurrif" → merkja.
- PII: `re.sub(r'\bkt\.?\s*\d{6}[-\s]?\d{4}\b','',desc)` öryggis-hreinsun.

- [ ] **Step 1:** Skrifa `build_byggingarleyfi.py` með ofangreindum föllum + `--audit` (spegla
  `run_audit` í build_logbirting.py). Haus-comment með heimild + keyrslu-leiðbeiningum.
- [ ] **Step 2:** Keyra `python skriptur/build_byggingarleyfi.py --audit 4`
  Expected: ~48 færslur/fundur; Austurgerði 1 → Synjað (2026-06-23); Álftamýri 79 → Frestað;
  Bragagata 26A → Samþykkt; talning `{samthykkt, synjad, frestad, …}` birt; 0 MISS á nýjum fundum.
- [ ] **Step 3:** Ef MISS/rangar færslur → laga regex, endurkeyra þar til hreint á 4 fundum.
- [ ] **Step 4:** Commit: `git add skriptur/build_byggingarleyfi.py && git commit -m "build_byggingarleyfi: PDF-þáttunar-kjarni + audit-hamur"`

---

### Task 2: Staðfangaskrá-auðgun (postnr + hnit + hverfi)

**Files:**
- Modify: `skriptur/build_byggingarleyfi.py`

**Interfaces:**
- Consumes: `entry.addr` (nefnifall, „Austurgerði 1", „Bragagata 26A").
- Produces: `load_stadfong() -> dict[str, (postnr:int, lat:float, lng:float, hverfi:str|None)]`
  lyklað á `norm_addr(addr)`; `norm_addr(s)` = lágstafa, `.strip()`, sameina bil, götuheiti+húsnr(+bókst).

**Detaljur:**
- Sækja `https://raw.githubusercontent.com/rvkdata/stadfangaskra_extra/master/stadfangaskra_extra.csv`
  (UTF-8, RFC4180 — sumir reitir gæsalappaðir m/kommu → nota `csv.reader`, EKKI split). Cache í
  `gogn/_cache/stadfangaskra_extra.csv` (sækja aðeins ef vantar/eldra en 7 daga).
- Dálkar: `HEITI_NF`+`HUSNR`+`BOKST` → lykill; `POSTNR`, `N_HNIT_WGS84`(lat), `E_HNIT_WGS84`(lng),
  `LUKR_HVERFAHEITI`(hverfi). Byggja bæði `HEITI_NF` og `HEITI_TGF` lykla (þágufall) fyrir hittni.
- Í `parse` → `enrich(entry)`: `norm_addr(addr)` → uppfletting → setja postnr/lat/lng/hverfi (eða None).

- [ ] **Step 1:** Bæta `load_stadfong()` + `norm_addr()` + auðgun í parse-flæðið.
- [ ] **Step 2:** Keyra `--audit 4` með `--geo` fána (eða alltaf) → prenta postnr/hverfi per færslu.
  Expected: Austurgerði 1 → postnr 108, hverfi sett; Borgartún 28 → 105; ≥90% færsla fá postnr.
- [ ] **Step 3:** Commit: `git commit -am "build_byggingarleyfi: Staðfangaskrá-auðgun (postnr/hnit/hverfi)"`

---

### Task 3: Output-writers + full bakfylling + incremental

**Files:**
- Modify: `skriptur/build_byggingarleyfi.py`

**Interfaces (Produces skrár):**
- `gogn/byggingarleyfi.json` = `{source, sourceUrl, disclaimer, generated, decisionLabels,
  counts:{addresses, permits, meetings}, byAddr:{normAddr:{addr,postnr,hverfi,lat,lng,permits:[…]}}}`
- `web/public/gogn/byggingarleyfi/<pn>.json` + `gogn/…` = `{addr:[permit,…]}` per postnr (skýrslu-neytandi).
- `web/public/gogn/byggingarleyfi_vakt.json` + `gogn/…` = `{generated, counts, byDecision, byHverfi,
  latestFund, recent:[permit+addr+hverfi+lat+lng …up to 400]}` (vaktin).
- `gogn/byggingarleyfi_seen.json` (þáttaðar fund-URL-slóðir) + `_meta.json`.

**Detaljur:**
- `main()`: lesa seen-set → `todo = [url fyrir url in fetch_pdf_links() if url not in seen]` →
  þátta hverja → uppfæra `byAddr` (append í permits, dedup á `caseNo`) → skrifa allar skrár.
- Bakfylling = tómur seen-set (allir 273). Incremental = aðeins nýir. `--limit N` fyrir prófun.
- Óþekkt postnr → bucket `byggingarleyfi/onnur.json`; `recent` raðað á `date` fallandi.
- Grisjun ekki þörf (heimilisfangs-saga geymist öll); vakt-`recent` þakað 400.

- [ ] **Step 1:** Bæta writers + `main()` + seen/incremental. `--limit` fyrir prófun.
- [ ] **Step 2:** Prófkeyra `python skriptur/build_byggingarleyfi.py --limit 6` → skoða úttaks-skrár
  (counts, eitt `byggingarleyfi/<pn>.json`, vakt-feed). Staðfesta byAddr-uppfletting þekkts fangs.
- [ ] **Step 3:** Full bakfylling `python skriptur/build_byggingarleyfi.py` → þekju-skýrsla
  (X/273 fundir þáttaðir, Y færslur, Z heimilisföng, hlutfall m/postnr). Expected: >200 fundir, þúsundir færsla.
- [ ] **Step 4:** Commit kóða + gögn: `git add skriptur/build_byggingarleyfi.py gogn/ web/public/gogn/byggingarleyfi* && git commit -m "build_byggingarleyfi: writers + full bakfylling (RVK)"`
  (⚠ athuga `.gitignore` — `gogn/_cache/` og stór CSV EKKI committað; JSON-úttök committuð eins og logbirting/eftirlit).

---

### Task 4: `/byggingarvakt/` síða

**Files:**
- Create: `web/src/pages/byggingarvakt.astro`
- Reference: `web/src/pages/eftirlit.astro` (afrita uppbyggingu: Layout, SSR-import gagna, KPI, Leaflet, client-leit)

**Detaljur:**
- SSR: `import vakt from '../../public/gogn/byggingarleyfi_vakt.json'` (eða fetch í build) → KPI-flísar
  (fjöldi eftir ákvörðun, nýjasti fundur, top-hverfi).
- Leaflet `withLeaflet` (on-demand, circleMarker litað eftir `decisionCode`) — aðeins færslur m/lat/lng.
- Client-leit: input (heimilisfang/hverfi) + ákvörðunar-síu-hnappar → filtra `recent` → listi m/tenglum
  á fundargerð + kross á `/fasteignavakt/`.
- Litastef samræmt spec (grænt/rautt/gult/grátt). CSS `<style is:global>` ef klasar eru í runtime-innerHTML.
- Nav: bæta hlekk undir „Karp Pro" (sama og eftirlit/eigendur — finna nav-listann í Layout/haus).

- [ ] **Step 1:** Skrifa `byggingarvakt.astro` (spegla eftirlit.astro).
- [ ] **Step 2:** Bæta nav-hlekk „Byggingarvakt" undir Karp Pro (leita `eftirlit` í nav-skrá, bæta við hlið).
- [ ] **Step 3:** `node --check` á síðu-skriptu (útdráttur → `.mjs`). Expected: engin syntax-villa.
- [ ] **Step 4:** Commit: `git add web/src/pages/byggingarvakt.astro <nav-file> && git commit -m "Byggingarvakt-síða (kort + leit + hverfi)"`

---

### Task 5: „Byggingarsaga heimilisfangs" í `fasteignavakt.astro`

**Files:**
- Modify: `web/src/pages/fasteignavakt.astro`

**Detaljur:**
- Finna hvar `solPn(pn)` er skilgreint + hvar heimilisfang/póstnr eignar er þekkt í render-flæði.
- Bæta `bygFetch(pn)` (hliðstætt solPn) → `fetch('/gogn/byggingarleyfi/'+pn+'.json')` (catch→{}).
- `renderByggingarsaga(container, addrStr, pn)`: hleður, `norm`-síar á heimilisfang eignar → tímalína
  (nýjast efst): litað ákvörðunar-merki + lýsing + stærð + dags + tengill. Tómt → fela kaflann.
- Setja kaflann í skýrsluna nálægt sölugrafi/eignaspjaldi. Endurnýta thouIS/norm-hjálparföll ef til.

- [ ] **Step 1:** Lesa viðeigandi hluta fasteignavakt.astro (solPn, render-flæði, heimilisfangs-þáttun).
- [ ] **Step 2:** Bæta bygFetch + renderByggingarsaga + kalla í render + HTML-hólf + CSS.
- [ ] **Step 3:** `node --check` á skriptu. Expected: engin villa.
- [ ] **Step 4:** Commit: `git commit -am "Byggingarsaga heimilisfangs í verðmatsskýrslu"`

---

### Task 6: Vikuleg keyrsla + loka-verifun + deploy

**Files:**
- Modify: `refresh-data.yml` (rót eða `.github/workflows/`)

**Detaljur:**
- Finna `build_logbirting.py` skref í `refresh-data.yml` → bæta `python skriptur/build_byggingarleyfi.py`
  við hlið (incremental; commit-ar úttaks-JSON eins og hin skref). Passa dual-write í `web/public/gogn`.

- [ ] **Step 1:** Bæta skrefi í refresh-data.yml (spegla logbirting-skref). Staðfesta YAML (`node -e`/`python -c yaml`).
- [ ] **Step 2:** Junction node_modules: `cmd //c mklink //J "byggingarvakt-wt\web\node_modules" "GIT repository - hagvisir\web\node_modules"` (eða `npm ci` í worktree ef junction bregst).
- [ ] **Step 3:** `cd web && npm run build`. Expected: ~209 síður, engin villa, `/byggingarvakt/` byggð.
- [ ] **Step 4:** Dev-verifun: `npm run dev` (daemon) → curl `/byggingarvakt/` = 200 → `astro dev stop`.
- [ ] **Step 5:** Commit workflow: `git commit -am "refresh-data: vikuleg byggingarleyfi-keyrsla"`
- [ ] **Step 6:** Deploy: `git push origin HEAD:main` → skrá deploy-hash.
- [ ] **Step 7:** Uppfæra minni (`memory/iceland-byggingarleyfi-api.md` + MEMORY.md færsla).

---

## Self-Review (spec-þekja)

- Heimild/PDF-þáttun → Task 1. ✅
- Hnit/postnr/hverfi (Staðfangaskrá) → Task 2. ✅
- 3 úttaks-skrár + incremental + full bakfylling → Task 3. ✅
- Neytandi A (byggingarsaga í fasteignavakt) → Task 5. ✅
- Neytandi B (/byggingarvakt/) → Task 4. ✅
- PII/fyrirvari → Task 1 (hreinsun) + gögn-disclaimer í Task 3. ✅
- Vikuleg keyrsla → Task 6. ✅
- Verifun (audit/build/dev/node--check) → dreift á öll tasks. ✅
- Landsþekja-fyrirvari (RVK only) → skjalfest í spec + minni (Task 7). ✅
- Type-samræmi: `decisionCode` enum + `norm_addr` + skráaskema samræmt milli Task 1/2/3/4/5. ✅
