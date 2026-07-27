# Lobbývakt v1 — útfærsluáætlun

> **Fyrir agentic-verkamenn:** NAUÐSYNLEG UNDIR-SKILL: superpowers:subagent-driven-development. Ferskur subagent per verk + tveggja-þrepa rýni. Skref nota `- [ ]`.

**Markmið:** Fyrirtæki+ áskrifandi velur atvinnugrein(ar) og fær persónulegan straum + email-digest af þingmálum (Alþingi) og samráðsmálum (samráðsgátt) í pípunni sem snerta hans grein, hvert með AI-áhrifa-brief, relevans-stigi og fresti/stöðu.

**Arkitektúr:** 3 lög — (1) nætur-Claude-flokkun í CI (`build_lobbyvakt.mjs`→`lobbyvakt.json`), (2) worker þjónar síuðum straumi + email-digest, (3) `/lobbyvakt/` Astro-síða. Hrein rökvél `lobbyvakt.mjs` deilt af öllum.

**Tæknistafli:** Astro SSG + Cloudflare Worker (D1 `env.TENGSL`) + Claude haiku (CI). node:test. Spec: `docs/superpowers/specs/2026-07-27-lobbyvakt-design.md`.

## Global Constraints (gilda um ÖLL verk)

- **Sameiginlegur worktree — samhliða Claude-session:** stagea AÐEINS eigin skrár berum orðum (`git add <skrá1> <skrá2>`), **ALDREI `git add -A`**. Committa STRAX eftir grænt hlið (automation `git reset --hard origin/main` þurrkar óskuldbundið). EKKI pusha — orchestrator pushar.
- **KARP-venjur:** worker-villur = HTTP 200 + `{ok:false,error}` (aldrei `{status:4xx}`); allar D1/fetch með `.catch()`; `_ajson(obj)` fyrir JSON-svör; tier-gátt speglar `_kycGate`.
- **Taxonomy = ein uppspretta:** `SECTORS` í `web/src/lib/lobbyvakt.mjs`. Ekkert harðkóða greina annars staðar.
- **Grænt hlið (viðeigandi undirmengi per verk):** `node --test <testskrá>` · `node --check web/worker.js` · `cd web && npx astro build` (~3581 síður).
- **Fyrirvari (reglu-vara):** hvert brief/síða merkt „⚠ sjálfvirk túlkun (gervigreind), ekki lögfræðiráðgjöf".

---

### Task 1: Hrein rökvél `lobbyvakt.mjs` + próf

**Files:**
- Create: `web/src/lib/lobbyvakt.mjs`
- Create: `web/src/lib/lobbyvakt.test.mjs`

**Interfaces — Produces (önnur verk reiða sig á ÞESSAR undirskriftir):**
- `export const SECTORS` — `{ sjavarutvegur:'Sjávarútvegur', landbunadur:'Landbúnaður & matvæli', ferdathjonusta:'Ferðaþjónusta', bygging:'Bygging & mannvirki', fasteignir:'Fasteignir & leiga', verslun:'Verslun & þjónusta', idnadur:'Framleiðsla & iðnaður', orka:'Orka & veitur', fjarmal:'Fjármál & tryggingar', ut:'UT & fjarskipti', heilbrigdi:'Heilbrigði & lyf', menntun:'Menntun & rannsóknir', flutningar:'Flutningar & samgöngur', fjolmidlar:'Fjölmiðlar & skapandi', umhverfi:'Umhverfi & úrgangur', almennt:'Þvert á greinar' }`
- `export const ALL_SECTORS` = `Object.keys(SECTORS)`
- `export const SECTOR_HINTS` — `{ <sector>: [leitarorð...] }` (t.d. `sjavarutvegur:['fiskveiði','aflamark','veiðigjald','fiskeldi','kvóti'], almennt:['skattur','virðisaukaskatt','vinnuréttur','félagaréttur','persónuvernd','tekjuskatt'] }`)
- `export function matchItem(item, userSectors)` → `bool`: `true` ef `item.greinar` skarast við `userSectors` EÐA `item.greinar.includes('almennt')`.
- `export function filterFeed(items, userSectors)` → nýr fylki, síaður (`matchItem`) + raðaður: mál með virkan `frestur` fyrst (næsti frestur efst), svo eftir `dags` lækkandi. Muta ekki inntak.
- `export function newSince(items, sinceTs, seenIds)` → mál með `dags`-ts > `sinceTs` OG `id` EKKI í `seenIds` (Set/array).
- `export function classifyHeuristic(titill, lysing)` → `[sector-kóðar]` úr `SECTOR_HINTS` (case-insensitive substring; tómt → `['almennt']`).
- `export function stigRank(stig)` → `{ 'Mikil':3, 'Miðlungs':2, 'Lítil':1 }[stig] || 2`.
- `export function isatToSector(isat)` → sector-kóði eða `null` (map úr ÍSAT-bálki/2-stafa: `A`→landbunadur/sjavarutvegur, `F`→bygging, `I`→ferdathjonusta/verslun, `K`→fjarmal, `J`→ut, o.s.frv.; nota grófa ÍSAT-bókstafs-vörpun).
- `item`-form: `{ id, kind:'thingmal'|'samrad', titill, hlekkur, greinar:[], brief, stig, efni:[], frestur:ISO|null, stada, dags:ISO }`.

- [ ] **Skref 1 — próf fyrst** (`lobbyvakt.test.mjs`, node:test): `matchItem` (skörun=true; `almennt`-mál=true óháð vali; engin skörun=false), `filterFeed` (frestur-mál raðast á undan frestlausum; réttur fjöldi eftir síun), `newSince` (síar seen + eldri en sinceTs), `classifyHeuristic` ('veiðigjald'→sjavarutvegur; ekkert→almennt), `stigRank` (Mikil>Miðlungs>Lítil), `isatToSector` ('F...'→bygging).
- [ ] **Skref 2 — keyra, staðfesta FALL:** `cd web && node --test src/lib/lobbyvakt.test.mjs` → FAIL (module vantar).
- [ ] **Skref 3 — útfæra `lobbyvakt.mjs`** (hreint, engin I/O) skv. undirskriftum að ofan.
- [ ] **Skref 4 — keyra, staðfesta PASS:** `node --test src/lib/lobbyvakt.test.mjs` → allt grænt.
- [ ] **Skref 5 — commit:** `git add web/src/lib/lobbyvakt.mjs web/src/lib/lobbyvakt.test.mjs && git commit -m "Lobbyvakt: hrein rokvel lobbyvakt.mjs + prof"`

---

### Task 2: Nætur-flokkun `build_lobbyvakt.mjs`

**Files:**
- Create: `skriptur/build_lobbyvakt.mjs`
- Output: `web/public/gogn/lobbyvakt.json` + `web/public/gogn/lobbyvakt_cache.json`
- Read-first (mynstur): `skriptur/build_ferdaleyfi.mjs` (fetch→JSON), `skriptur/build_thingmal_ras.mjs` (Claude-haiku-flokkun í CI, seen-cache, `ANTHROPIC_API_KEY`-gátt).

**Interfaces — Consumes:** `import { ALL_SECTORS, SECTORS, classifyHeuristic } from '../web/src/lib/lobbyvakt.mjs'`. **Produces:** `lobbyvakt.json` (form úr spec §4.1).

- [ ] **Skref 1 — heimildir:** finna hvernig þingmál eru sótt (sama og `/thingmal/` / `build_thingmal_ras.mjs` → `frumvorp.json` eða Alþingis-XML) og samráðsmál (samráðsgátt-veita sem „Samráðsvaktin" á /vaktir/ notar — finna `samradHandler`/build í kóða). Draga út `{ id, kind, titill, lysing, hlekkur, frestur, stada, dags }` per mál.
- [ ] **Skref 2 — dedup + cache:** lesa `lobbyvakt_cache.json` (id→AI-reitir). Aðeins mál sem VANTAR í cache fara í flokkun.
- [ ] **Skref 3 — Claude haiku flokkun** (ef `ANTHROPIC_API_KEY`): per nýtt mál, system-prompt með `ALL_SECTORS` + beiðni um STRANGT JSON `{greinar:[],brief,stig,efni:[]}`; validera (`greinar`⊆ALL_SECTORS, `stig`∈{Lítil,Miðlungs,Mikil}, tómt greinar→['almennt']); malformað→heuristík-reitir. **Án lykils:** `classifyHeuristic` + enginn brief + stig='Miðlungs'.
- [ ] **Skref 4 — skrifa úttak:** sameina cache+ný, halda 90-daga glugga, byggja `bySector`-index, `{updated,items,bySector}`→`lobbyvakt.json`; uppfæra cache. Sanity-guard: 0 items → henda.
- [ ] **Skref 5 — keyra + verify:** `node skriptur/build_lobbyvakt.mjs` → skrifar `lobbyvakt.json` með skynsaman fjölda (prenta items+bySector-lykla). Prófa BÆÐI með lykli og `ANTHROPIC_API_KEY=` tómt (fallback).
- [ ] **Skref 6 — commit:** `git add skriptur/build_lobbyvakt.mjs web/public/gogn/lobbyvakt.json web/public/gogn/lobbyvakt_cache.json && git commit -m "Lobbyvakt: naetur-flokkun build_lobbyvakt.mjs (Claude haiku + fallback)"`

---

### Task 3: Worker — `/api/lobbyvakt` + greina-pref (ATH: sami subagent og Task 4 — bæði worker.js)

**Files:** Modify `web/worker.js`. Read-first: `kycHandler`/`_kycGate`/`_kycWatchCap` (tier-gátt+accountOwner), `userDataHandler` `/ktwatch` (pref-mynstur), `leyfiHandler` (augGet+cache).

**Interfaces — Consumes:** `import { matchItem, filterFeed, ALL_SECTORS } from './src/lib/lobbyvakt.mjs'` (bæta við efst hjá öðrum lib-import); `augGet(env,'lobbyvakt.json')`; `accountId`/`accountOwner`; `user_prefs`. **Produces:** `GET /api/lobbyvakt`, `POST /api/u/lobbyvakt`.

- [ ] **Skref 1** — `_lobbyGate(u,now)` (spegla `_kycGate`: admin/free_access || virkt fyrirtaeki_plus).
- [ ] **Skref 2** — `lobbyvaktHandler(request,env,ctx)`: session→uid→u (SELECT m/ tier,tier_until,is_admin,free_access,parent_account_id); `owner=accountOwner`; ef `!_lobbyGate(owner,now)`→`{ok:false,error:'tier'}`; lesa `lobbyvakt_greinar` úr `user_prefs` (account-scoped `accountId(u)`); `filterFeed(augGet.items, greinar)`; ef engar greinar→`{ok:true,greinar:[],items:[],needsSetup:true}`; annars `{ok:true,greinar,items,updated}`. augGet null→`{ok:true,items:[]}`.
- [ ] **Skref 3** — í `userDataHandler`: `POST /lobbyvakt` → validera `body.greinar⊆ALL_SECTORS`, vista í `user_prefs` (account-scoped), `{ok:true}`.
- [ ] **Skref 4** — skrá route: `if (url.pathname==='/api/lobbyvakt') return lobbyvaktHandler(request,env,ctx);`. (`/api/u/lobbyvakt` fer gegnum `userDataHandler`-dispatch eins og aðrar `/api/u/*`.)
- [ ] **Skref 5 — verify:** `node --check web/worker.js`. **Commit** (ásamt Task 4): `git add web/worker.js && git commit -m "Lobbyvakt: /api/lobbyvakt + greina-pref + digest-kafli"` (eða sér-commit ef Task 4 síðar).

---

### Task 4: Email-digest kafli (sami subagent og Task 3)

**Files:** Modify `web/worker.js` (digest-cron/-byggir). Read-first: finna digest-byggjarann (vikulegur mánud. 08:10 + frettavaktir-cron; leita að `digest`/`frettavakt`-köflum í `scheduled()`), sjá hvernig aðrir vakt-kaflar (frettavakt/leitvakt) raðast í póstinn.

**Interfaces — Consumes:** `newSince` frá `lobbyvakt.mjs`; `lobbyvakt_greinar`-pref; per-notanda seen (t.d. `user_prefs lobbyvakt_seen` eða síðasti-digest-ts).

- [ ] **Skref 1** — fyrir hvern notanda með `lobbyvakt_greinar`: `newSince(items, lastTs, seen)` ∩ greinar (`matchItem`) → ný mál.
- [ ] **Skref 2** — bæta „🏛️ Reglur í pípunni"-kafla í digest-HTML (titill+stig+brief+frestur+hlekkur), virða cadence-stillingu; uppfæra seen/ts svo ekki tvítilkynnt.
- [ ] **Skref 3 — verify:** `node --check web/worker.js` + (ef digest hefur prófanlegan kjarna) einingapróf. Commit (sjá Task 3 skref 5).

---

### Task 5: UI — `/lobbyvakt/` síða

**Files:** Create `web/src/pages/lobbyvakt.astro`; Modify nav-skrá + `/karp-pro/`-skráning (finna hvar KYC/aðrar Fyrirtæki+ vörur eru skráðar). Read-first: `web/src/pages/areidanleikavaktin.astro` (gátt `#kv-gate`, `fetch`+render, tier-hegðun, `esc()`).

**Interfaces — Consumes:** `GET /api/lobbyvakt`, `POST /api/u/lobbyvakt`, `SECTORS` (afrita í client eða flytja inn á build-tíma).

- [ ] **Skref 1** — Layout + `#lv-gate` (óáskrifandi→/karp-pro/#verd) + mælaborð.
- [ ] **Skref 2** — greina-vals-pillur (`SECTORS`), forfyllt úr account-ÍSAT (`isatToSector`), vista um `POST /api/u/lobbyvakt`.
- [ ] **Skref 3** — straumur: kort per mál (📜/💬 merki, titill+hlekkur, greina-tögg, brief, stig-merki litakóðað, frestur/staða). `esc()` á öllum dýnamískum texta. Áberandi „ekki-lögfræðiráðgjöf"-fyrirvari.
- [ ] **Skref 4** — nav-hlekkur + karp-pro-skráning.
- [ ] **Skref 5 — verify:** `cd web && npx astro build` (~3581 síður). **Commit:** `git add web/src/pages/lobbyvakt.astro <nav-skrá> <karp-pro-skrá> && git commit -m "Lobbyvakt: /lobbyvakt/ sida (Fyrirtaeki+ gated) + nav"`

---

### Task 6: CI-vírun + loka-verify + deploy-handoff

**Files:** Modify `.github/workflows/refresh-data.yml`.

- [ ] **Skref 1** — bæta `node skriptur/build_lobbyvakt.mjs || true` þrepi (á eftir þingmála-/frettavél-þrepum svo `frumvorp.json` sé ferskt), auto-commit `lobbyvakt.json`+cache eins og önnur gagna-þrep.
- [ ] **Skref 2 — full grænt hlið:** `node --test web/src/lib/lobbyvakt.test.mjs` · `node --check web/worker.js` · `cd web && npx astro build`. **Commit:** `git add .github/workflows/refresh-data.yml && git commit -m "Lobbyvakt: refresh-data CI-threp"`
- [ ] **Skref 3 — handoff til orchestrator:** deploy (push→worker+asset), live-verify `/api/lobbyvakt` (Fyrirtæki+/admin session) + `/lobbyvakt/` browser.

## Self-review (áætlun vs spec)

Spec-þekja: taxonomy(T1)·flokkun+heimildir(T2)·API+pref+gátt(T3)·digest(T4)·UI(T5)·CI(T6)·fyrirvari(T5)·prófun(T1,T6) — allt dekkað. Viðmót samræmd (`matchItem`/`filterFeed`/`newSince`/`ALL_SECTORS`/`SECTORS` skilgreind í T1, notuð í T2/T3/T4/T5). Engir placeholders. T3+T4 = SAMI subagent (bæði worker.js → forðast árekstur).
