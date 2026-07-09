# Auðgun skýrslnanna þriggja — útfærsluplan

> **For agentic workers:** Byggt inline (executing-plans) í worktree `skyrslu-audgun-wt`. Bylgja fyrir bylgju með preview-sannreyningu. Aron mergar.

**Goal:** 9 fítusar yfir 3 söluskýrslur (sjá spec `docs/superpowers/specs/2026-07-09-skyrslu-audgun-design.md`).

**Architecture:** Astro SSG + Cloudflare Worker + WP. Ný gögn: build-skriptur → `web/public/gogn/*.json` eða worker á-eftirspurn. Render client-hlið í `fyrirtaeki.astro` + `ubo-report.js`.

**Tech Stack:** Node ESM, Python pdf-þáttari, Cloudflare Worker, WP REST, Hagstofa PxWeb, ESB/SÞ refsilistar. Engin ný npm-dep.

## Global Constraints (úr spec — gilda fyrir öll verk)

- Ekkert lánshæfismat/vanskilaskrá. Aðeins opinber gögn.
- Nafnasamsvaranir ALLTAF merktar „nafnasamsvörun — staðfestu auðkenni", aldrei úrskurður.
- Eignarhlutur í kr = bókfært eigið fé, merkt (ekki verðmat).
- Kennitöluflakk = vísbendingar, ekki staðfesting.
- Refsilistar = opinberu ESB+SÞ (EKKI OpenSanctions).
- Render-hlutur `f` (=`d.felag`) hefur: `f.isat` (array „KK.KK.K lýsing"), `f.logheimili`, `f.postfang`, `f.svf`, `f.nafn`, `f.kt`, `f.form`, `f.skrad`.

---

## Bylgja 1 — Grunngögn (engin UI-breyting; prófanleg ein og sér)

### Task 1.1: `build_sector.mjs` — greinar-viðmið (F2)

**Files:** Create `skriptur/build_sector.mjs`; Output `web/public/gogn/sector_kpi.json`.

**Interfaces — Produces:** `sector_kpi.json` = `{ updated, source, byIsat: { "<2-stafa>": { label, n, framlegd, hagnadarhlutfall, eiginfjarhlutfall, eignavelta } } }`.

- Sækja Hagstofa `FYR08000` um PxWeb json-stat POST (sjá mynstur í öðrum Hagstofu-skriptum, t.d. `build_atvinnuleysi.js`/econ-skriptur; CORS-trikk óþarft build-time). Query: nýjasta ár, allar atvinnugreinar, breytur = velta/rekstrartekjur, kostnaðarverð/rekstrargjöld, hagnaður, eigið fé, eignir.
- Fyrir hverja grein: `framlegd = (tekjur - kostnaðarverð)/tekjur`, `hagnadarhlutfall = hagnaður/tekjur`, `eiginfjarhlutfall = eigið fé/eignir`, `eignavelta = tekjur/eignir`. Lykla á 2-stafa ÍSAT-kóða (bálkur/deild).
- Verja núll-deilingu (skila `null` fyrir hlutfall ef nefnari 0/vantar).

**Steps:**
- [ ] Skoða núverandi Hagstofu-skriptu til að endurnýta PxWeb-fetch mynstur.
- [ ] Skrifa `build_sector.mjs`; keyra `node skriptur/build_sector.mjs`.
- [ ] Staðfesta `sector_kpi.json` snið + `node --check`. Sanngæfa: framleiðslugrein (t.d. „10") hefur jákvæða framlegð.

### Task 1.2: `build_sanctions.mjs` — refsilistar (F9)

**Files:** Create `skriptur/build_sanctions.mjs`; Output `web/public/gogn/sanctions.json`.

**Interfaces — Produces:** `sanctions.json` = `{ updated, sources:[...], names: [ { n, nafn, listi, prog } ] }` þar sem `n` = normaliserað nafn (sama norm og `pepNorm`: lowercase, NFD, fjarlægja diakritík, `[^a-zðþæ\s]`→bil, trim).

- ESB: sækja samsteypta refsilistann af data.europa.eu (XML eða CSV 1.1). Draga út `wholeName`/`nameAlias` fyrir bæði persónur og lögaðila.
- SÞ: sækja UN Security Council consolidated list (XML). Draga út nöfn + alias.
- Sameina, dedup á `n`. Merkja `listi` (ESB/SÞ) + `prog` (regime, ef til).
- Ef sókn mistekst (netvilla): skrifa EKKI tóma skrá yfir góða (skila villu, halda eldri).

**Steps:**
- [ ] Staðfesta niðurhals-URL fyrir ESB-XML + SÞ-XML (WebFetch í execution).
- [ ] Skrifa `build_sanctions.mjs`; keyra; staðfesta `names[]` > 0 + snið + `node --check`.

### Task 1.3: `build_eigendur_reverse.mjs` — öfugt net (F4)

**Files:** Create `skriptur/build_eigendur_reverse.mjs`; Output `web/public/gogn/eigendur_reverse.json`.

**Interfaces — Consumes:** allar `web/public/gogn/eigendur/<kt>.json` (`net.nodes` m/ `id,kt,nafn,tegund,faeding`; `net.edges` m/ `fra,til,hlutur`). **Produces:** `eigendur_reverse.json` = `{ updated, n, byOwner: { "<ownerKey>": { nafn, a: [ { kt, nafn, hlutur } ] } } }`.

- `ownerKey`: fyrir félag (`tegund:felag`, hefur kt) → `kt`; fyrir einstakling → `norm(nafn)+'|'+(faeding||'')`.
- Fyrir hverja eigendur-skrá: rótin (`er_rot`) = félagið sem er í eigu. Fyrir hverja brún `fra→til`: eigandinn (`fra`-hnútur) „á" `til`-félagið (rótina þegar `til` er rót). Skrá `byOwner[ownerKey].a.push({ kt: rót.kt, nafn: rót.nafn, hlutur: edge.hlutur })`.
- Dedup per (ownerKey, kt).

**Steps:**
- [ ] Skrifa skriptuna; keyra; staðfesta `byOwner` hefur a.m.k. einn eiganda með >1 félag (ef til) + `node --check`.

### Task 1.4: `parse_arsreikningur.py` — persista starfsmenn (F1 bónus)

**Files:** Modify `parse_arsreikningur.py` (leitar þegar að „meðalfjöldi starfsmanna" en skrifar ekki út).

**Interfaces — Produces:** `ar[<ár>].starfsmenn` (int|null) í `arsreikningar/<kt>.json`.

**Steps:**
- [ ] Finna „meðalfjöldi starfsmanna"-þáttun; bæta gildinu í ársins-dict.
- [ ] Endurbyggja eitt dæmi (`build_arsreikningar.mjs` fyrir eina kt); staðfesta `starfsmenn` í JSON. Fallback: `null` ef ekki finnst (engin regression).

### Task 1.5: WP-snippet `newsmentions` (skjalað fyrir Aron) + næturkeyrsla

**Files:** Modify `wordpress/karp-user.php` (eða nýtt snippet-skjal); Modify `.github/workflows/refresh-data.yml`.

**Interfaces — Produces (WP):** `GET /wp-json/karp/v1/newsmentions?q=<term>&limit=25` → `[{ ts, source, title, url, sentiment }]`. LIKE `%term%` á `wp_karp_news.title`, raðað `ts DESC`, cap 25.

```php
register_rest_route('karp/v1','/newsmentions',[ 'methods'=>'GET','permission_callback'=>'__return_true',
 'callback'=>function($r){ global $wpdb; $q=trim((string)$r->get_param('q')); if(mb_strlen($q)<3) return [];
   $lim=min(25,max(1,(int)$r->get_param('limit')?:25)); $like='%'.$wpdb->esc_like($q).'%';
   $rows=$wpdb->get_results($wpdb->prepare("SELECT ts,source,title,url,sentiment FROM {$wpdb->prefix}karp_news WHERE title LIKE %s ORDER BY ts DESC LIMIT %d",$like,$lim),ARRAY_A);
   return array_map(fn($x)=>['ts'=>$x['ts'],'source'=>$x['source'],'title'=>$x['title'],'url'=>$x['url'],'sentiment'=>isset($x['sentiment'])?(int)$x['sentiment']:0],$rows?:[]); } ]);
```
(Staðfesta dálkanöfn `wp_karp_news` í execution; laga ef `sentiment` heitir annað.)

**Steps:**
- [ ] Skrifa PHP í `wordpress/karp-user.php`, skjalað „⏳ BÍÐUR ARONS: endurlíma".
- [ ] Bæta `build_sector.mjs`, `build_sanctions.mjs`, `build_eigendur_reverse.mjs` við `refresh-data.yml`; `build_ragcopy.js` ef sector/sanctions eiga að vera í RAG (sennilega ekki).
- [ ] **CHECKPOINT:** commit bylgju 1; sýna Aroni úttaks-JSON sýnishorn.

---

## Bylgja 2 — Fyrirtækjaskýrsla

### Task 2.1: F1 fjárhagsþróun myndrænt

**Files:** Modify `web/src/pages/fyrirtaeki.astro` (`fsFjarhagur`); `web/src/styles/ubo.css` (súlurit-stílar).

**Interfaces — Consumes:** `arsreikningar/<kt>.json` `ar` (Map ár→{rekstur.sala,.hagnadur, efnahagur.eigid_fe, kpi.framlegd, starfsmenn}). Þegar-til í `fsFjarhagur` (byYear).

- Inline-SVG helper `barSeries(years, vals, {neg})` → smá-súlurit (~4 súlur), hæð úr max|val|, neikvæð súla rauð. Fjórar smá-myndir: Velta, Hagnaður/tap, Eigið fé, Framlegð%. Röð fyrir „X starfsmenn (ár)" ef `starfsmenn`.
- Engin ytri lib. `escF` á texta. Snyrtileg tölusnið (`m.kr.`) — endurnýta núverandi format-fall.

**Steps:**
- [ ] Lesa `fsFjarhagur` heild; bæta `barSeries` + fjórum myndum + starfsmenn-línu.
- [ ] Stílar í `ubo.css`. Build + `?syni=1` DOM-lestur staðfestir súlur.

### Task 2.2: F2 samanburður við atvinnugrein

**Files:** Modify `web/src/pages/fyrirtaeki.astro` (`fsFjarhagur` + gagnasókn `sector_kpi.json`).

**Interfaces — Consumes:** `f.isat[0]` → 2-stafa kóði (`String(f.isat[0]).trim().slice(0,2)` — sniðið „03.11.0 …"); `gogn/sector_kpi.json` `byIsat[<kóði>]`.

- Sækja `sector_kpi.json` (fetch, cache). Fyrir hvern af 3–4 lyklum (framlegð, hagnaðarhlutfall, eiginfjárhlutfall) sýna „félag X% · grein Y%" með smá-vísi (yfir/undir grein). Merkt „leiðbeinandi viðmið, Hagstofa".
- Fela ef ÍSAT vantar eða grein ófundin.

**Steps:**
- [ ] Bæta sector-sókn + samanburðar-röð við KPI. Build + `?syni=1` (demo-`f.isat` = „03.11.0 …" → sjávar-grein).

### Task 2.3: F3 opinber fótspor (samantekt)

**Files:** Modify `web/src/pages/fyrirtaeki.astro` (fsKort — nálægt flísunum).

**Interfaces — Consumes:** niðurstöður úr þegar-til flísum (styrkir/útboð/vörumerki/skip svör). Byggja samantekt eftir að þær hlaðast.

- Ein lína: „🏛️ N styrkir (kr) · 📋 N útboð · ™️ N vörumerki · 🚢 N skip". Sleppa 0-liðum. Tenglar/scroll í flísarnar.

**Steps:**
- [ ] Safna talningum þegar flísar svara; render samantektarlínu. Build + `?syni=1`.
- [ ] **CHECKPOINT:** deploy bylgju 2; Aron skoðar.

---

## Bylgja 3 — Endanlegir eigendur

### Task 3.1: F4 öfugt eignarhaldsnet

**Files:** Modify `web/worker.js` (`/api/reverse`); `web/src/lib/ubo-report.js` (eigReport render + fetch).

**Interfaces — Worker:** `GET /api/reverse?kt=&nafn=&faeding=` → `{ a: [ { kt, nafn, hlutur } ] }` úr `eigendur_reverse.json` (les asset). Nafn-lykill: `norm(nafn)+'|'+faeding`. **Client:** í `eigReport`/`eigMount`, fyrir rót-eiganda(-a) sækja `/api/reverse`, render „Þessi eigandi á einnig: …" undir UBO-töflu. Merkt „byggt á greindum félögum".

**Steps:**
- [ ] Worker-endapunktur les `eigendur_reverse.json`; skila `a[]`.
- [ ] eigReport: sækja + render „á einnig"-blokk. `node --check`, build, raun-uppfletting í execution (eða `?eigendur-syni=1`).

### Task 3.2: F5 PEP-merking á netinu

**Files:** Modify `web/src/lib/ubo-report.js` (`eigNet` render + `pep.json` fetch + `eigLegend`).

**Interfaces — Consumes:** `gogn/pep.json` (`folk[].n`). Matcher `pepNorm(nafn)` (afrita úr KYC-hlið í `fyrirtaeki.astro`). Í `eigNet`: hver `tegund:einst` hnútur með `pep.json`-samsvörun → rauður hringur/klasi + `hlutverk` í titli. Legend-lína.

**Steps:**
- [ ] Hlaða `pep.json` í eigReport; merkja PEP-hnúta. Build + raun-uppfletting (þekkt PEP-eigandi ef til) eða `?eigendur-syni=1`.

### Task 3.3: F6 eignarhlutur í krónum

**Files:** Modify `web/src/lib/ubo-report.js` (`eigTable` + `eigRaunv`).

**Interfaces — Consumes:** `hlutur` (%) úr `endanlegir[]`/`raunverulegir[]`; `arsreikningar/<kt>.json` `ar[nýjasta].efnahagur.eigid_fe` (rót-kt). Sækja ársreikning rótar (fetch, cache); ef til + hlutur þekktur → „≈ hlutur×eigið fé m.kr." dálkur/viðbót. Merkt „bókfært eigið fé skv. ársreikn. <ár>".

**Steps:**
- [ ] Sækja rót-ársreikning; reikna + render kr-gildi. Fela ef vantar. Build + uppfletting.
- [ ] **CHECKPOINT:** deploy bylgju 3; uppfæra verk #25 (öfugt net) sem klárað.

---

## Bylgja 4 — Áreiðanleikamat

### Task 4.1: F7 fjölmiðlaumfjöllun

**Files:** Modify `web/worker.js` (`/api/adverse`); `web/src/pages/fyrirtaeki.astro` (`fsAreidView` + `fsWireKyc`).

**Interfaces — Worker:** `GET /api/adverse?kt=` → sækir félagsnafn (RSK-prófíll/þegar-til), eigenda-eftirnöfn (`eigendur/<kt>.json` raunverulegir/endanlegir), kallar WP `newsmentions?q=` per hugtak (félagsnafn aðal), dedup á `url`, skila `{ hits: [ { ts, source, title, url, sentiment, via } ], n, neg }`. **Client:** í fsAreidView „📰 Fjölmiðlaumfjöllun: N (M neikvæðar)" + listi m/ tenglum; eigenda-treff merkt „nafnasamsvörun".

**Steps:**
- [ ] Worker `/api/adverse` (nafna-assembly + newsmentions-köll + dedup).
- [ ] fsAreidView render + wire í `fsWireKyc`. `node --check`, build, `?vidmot=areidanleiki` (mock/tómt á local — staðfesta ekki-hrun; raun í execution ef WP-snippet komið).

### Task 4.2: F8 gjaldþrota-tengsl & viðvörunarmerki

**Files:** Modify `web/src/pages/fyrirtaeki.astro` (`fsAreidView`); gagnasókn `logbirting.json` + `stjorn/<kt>.json`.

**Interfaces — Consumes:** `f.nafn`, `f.kt`; `gogn/logbirting.json` (`byKt`, slit/gjaldþrot m/dags); `gogn/stjorn/<kt>.json` (`stjorn[].nafn`).

- (a) Eigin Lögbirting: vísa í #fs-logbirting (þegar til).
- (b) Svipað nafn nýlega slitið: fuzzy nafna-samsvörun `f.nafn` v. slitin félög í `logbirting.json` (nafn-stofn, útiloka nákvæmlega sömu kt) → „líkist nýlega slitnu félagi: X (dags)". Vísbending.
- (c) Tækifæris: fyrir stjórnarmann/eiganda félagsins, ef nafn finnst í stjórn/eigendum félags sem er í `logbirting.json` (aðeins ef þau gögn til) → merkja. Best-effort.
- Allt undir „⚠ Viðvörunarmerki — vísbendingar, ekki staðfesting".

**Steps:**
- [ ] Bæta (a)+(b) (áreiðanleg); (c) ef ódýrt. Build + `?vidmot=areidanleiki`.

### Task 4.3: F9 þvingunaraðgerða-skimun

**Files:** Modify `web/src/pages/fyrirtaeki.astro` (`fsAreidView`); gagnasókn `sanctions.json`.

**Interfaces — Consumes:** `sanctions.json` (`names[].n`); eigenda- + stjórnar-nöfn. Matcher = `pepNorm` (fullt nafn, ekki bara stofn → lægri false-positive). Treff → „⚠ Möguleg samsvörun við refsilista (ESB/SÞ): <nafn> — ekki staðfesting, staðfestu auðkenni". Ella grænt „engin samsvörun".

**Steps:**
- [ ] Hlaða `sanctions.json`, samsvara nöfn, render. Build + `?vidmot=areidanleiki`.
- [ ] **CHECKPOINT:** full verify + deploy bylgju 4.

---

## Lokafrágangur

- Fullt `npm run build` hreint. `node --check` á öllum breyttum skriptum/`<script>`.
- Uppfæra minni: `karp-virdisvegvisir.md` / ný nóta um auðganirnar; verk #25 klárað.
- WP-snippet (`newsmentions`) → „⏳ BÍÐUR ARONS: endurlíma á wp.karp.is" (F7 óvirkt þar til).
- Aron mergar `skyrslu-audgun-wt` → main (deploy site+worker).
