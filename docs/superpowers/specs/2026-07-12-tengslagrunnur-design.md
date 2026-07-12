# Tengslagrunnur — landsdekkandi eigenda- & stjórnendagrunnur (D1) — hönnunar-spec

**Dagsetning:** 2026-07-12
**Staða:** Samþykkt hönnun (bíður spec-yfirferðar → writing-plans)

## Markmið

Landsdekkandi grafgrunnur í **Cloudflare D1** yfir íslensk félög, fyrirsvar þeirra (stjórn/
prókúra/framkvæmdastjórn, með persónu-kt úr RSK-API) og raunverulega eigendur (úr fría
skrapinu). Byggður með **þolinmóðum snjóbolta-crawl** (næturlegt GH-Action með kvóta-þaki).

**Fyrsti neytandi:** tengslakortið (`/eigendur/` → `?kort=1`) — rót-tengt fólk sýnir þá öll
sín félög Á LANDSVÍSU, ekki bara 12-félaga netið. Auðgunin kviknar sjálfkrafa og vex nótt
fyrir nótt eftir því sem grunnurinn fyllist.

**Lögmæti:** Aron sér um DPIA-viðbót og lögfræði-yfirferð (staðfest í brainstorming).
Kóðinn heldur tæknilegu vörnunum (sjá Persónuvernd) og crawl byrjar ekki fyrr en Aron
setur secrets.

## Ákvarðanir (festar í brainstorming 2026-07-12)

1. **Umfang = B:** landsdekkandi grunnur („sækjum allt"), ekki á-eftirspurn dýpkun ein.
2. **Geymsla = Leið 2: D1** (SQL-graf, fyrsta stateful-binding KARP) — valið yfir KV vegna
   framtíðar-fyrirspurna (sameiginlegir stjórnarmenn, leiðir milli félaga, tímalínur).
3. **Veitur:** stjórn/fyrirsvar úr **mælda LegalEntities-API-inu** (eina uppsprettn með
   persónu-kt í `relationships[]`); raunverulegir eigendur úr **fría rskFelag-HTML-skrapinu**
   (nafn+fæðingarár, ekkert kt — lyklað eins og `eigOwnerKey`).
4. **Upptalning = snjóbolti + nafnaleitar-sweep:** APIð er uppfletti-eingöngu (staðfest í
   OpenAPI: aðeins `GET /{kt}` + `GET /{kt}/overview`); island.is `companyRegistryCompanies`
   er LÆST (Unauthorized, prófað 2026-07-12); engin opin VSK-/fyrirtækjaskrá til niðurhals.
   **Sannreynt 2026-07-12:** `skatturinn.is/fyrirtaekjaskra/leit?nafn=<q>` skilar ≤100
   treffum (þak) — **adaptív forskeyta-dýpkun** (2 stafir → 3 stafir þegar 100-þak næst,
   staða geymd í `sweep_state`-töflu) telur upp ALLA skrána á ~1–2 vikum samhliða crawli.
   Önnur fræ: Karp-snert félög (eigendur/stjorn/reverse/logbirting.byKt ~1.100 kt +
   vörumerkja-/skipa-/loftfara-eigendur) + Lögbirtingablaðs-nýskráningar daglega;
   síðan uppgötvun úr crawl-svörunum sjálfum. (Leiðrétting úr rannsókn: Eplica-árs-paging
   ársreikningaskrár er EKKI til sem upptalningarleið — nafnaleitar-sweep kemur í staðinn.)
5. **Taktur:** „tökum okkur tíma" — kvóta-þak `TENGSL_BUDGET` (repo variable, sjálfgefið
   1.500 köll/nótt), full-pass ≈ 30–45 nætur, svo ~90-daga endurnýjunarhringur.
6. **Saga í stað eyðinga:** `seen_first`/`seen_last` á leggjum — grunnurinn verður söguleg
   tímalína stjórna og eignarhalds (verðmætin sem Keldan selur).

## Gagnalíkan (D1 schema)

Gagnagrunnur `tengsl`, binding `TENGSL` í `web/wrangler.toml`.

```sql
CREATE TABLE IF NOT EXISTS felog (
  kt TEXT PRIMARY KEY,              -- 10 stafa lögaðila-kt (dagur 41–71)
  nafn TEXT,
  form TEXT,                        -- rekstrarform (Einkahlutafélag …)
  stada TEXT,                       -- "Virk skráning" o.s.frv.
  skraning TEXT,                    -- YYYY-MM-DD
  afskrad INTEGER DEFAULT 0,
  afskrad_dags TEXT,
  gjaldthrot INTEGER DEFAULT 0,
  gjaldthrot_dags TEXT,
  gjaldthol INTEGER DEFAULT 0,
  gjaldthol_dags TEXT,
  isat TEXT,                        -- JSON-fylki [{id,nafn}] (≤6)
  hlutafe REAL,
  mynt TEXT,
  last_crawled TEXT,                -- ISO dags síðasta API-kalls
  last_eigendur TEXT                -- ISO dags síðasta eigenda-skraps
);
CREATE TABLE IF NOT EXISTS folk (
  person_key TEXT PRIMARY KEY,      -- kt EF þekkt; annars 'nm:'+eigNorm(nafn)+'|'+faeding
  kt TEXT,                          -- persónu-kt (aðeins úr API relationships) — FER ALDREI ÚT
  nafn TEXT,
  faeding TEXT                      -- fæðingarár/mán (úr eigenda-skrapi) ef til
);
CREATE TABLE IF NOT EXISTS hlutverk (
  felag_kt TEXT NOT NULL,
  person_key TEXT NOT NULL,
  hlutverk TEXT,                    -- "Stjórnarformaður"/"Prókúruhafi"/…
  tegund TEXT,                      -- relationships[].type
  seen_first TEXT NOT NULL,         -- ISO dags fyrst séð
  seen_last TEXT,                   -- NULL = virkt; dags = horfið úr svari við endurkröl
  PRIMARY KEY (felag_kt, person_key, hlutverk)
);
CREATE TABLE IF NOT EXISTS eign (
  felag_kt TEXT NOT NULL,           -- félagið sem er átt Í
  eigandi_key TEXT NOT NULL,        -- person_key EÐA félags-kt
  eigandi_tegund TEXT NOT NULL,     -- 'einst' | 'felag'
  hlutur REAL,                      -- % ef þekkt
  tegund TEXT NOT NULL,             -- 'raunverulegur' (rskFelag-skrap) | 'hluthafi' (ársreikn.)
  heimild TEXT,
  seen_first TEXT NOT NULL,
  seen_last TEXT,
  PRIMARY KEY (felag_kt, eigandi_key, tegund)
);
CREATE TABLE IF NOT EXISTS crawl_queue (
  kt TEXT PRIMARY KEY,
  priority INTEGER NOT NULL,        -- 1=fræ ókrölað, 2=uppgötvað í crawli, 3=stale-endurnýjun
  discovered_from TEXT,             -- kt/heimild sem afhjúpaði félagið
  added_at TEXT NOT NULL,
  crawled_at TEXT,
  attempts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending'     -- pending | done | notfound | error
);
CREATE INDEX IF NOT EXISTS idx_hlutverk_person ON hlutverk(person_key);
CREATE INDEX IF NOT EXISTS idx_hlutverk_felag ON hlutverk(felag_kt);
CREATE INDEX IF NOT EXISTS idx_eign_eigandi ON eign(eigandi_key);
CREATE INDEX IF NOT EXISTS idx_eign_felag ON eign(felag_kt);
CREATE INDEX IF NOT EXISTS idx_queue_status ON crawl_queue(status, priority, added_at);
```

**`seen_last`-merkingar:** við endurkröl félags eru hlutverk/eignir í nýja svarinu upsert-uð
(`seen_last=NULL`); raðir sem VANTAR í nýja svarið fá `seen_last=<dags>`. Aldrei DELETE.

**person_key-samræmi:** sama lyklun og `eigOwnerKey` í `build_eigendur_reverse.mjs` /
`ubo-report.js`: kt ef til, annars normað nafn + fæðing — svo API-fólk (kt) og
eigenda-skraps-fólk (nafn+fæðing) sameinist þegar bæði sjást.

## Söfnunarvélin

### `skriptur/crawl_tengsl.mjs` (nýtt)
1. Les `TENGSL_BUDGET` (env, sjálfgefið 1500) og sækir næsta skammt úr `crawl_queue`
   (ORDER BY priority, added_at; status='pending').
2. Per kt: `GET api.skattur.cloud/legalentities/v2.1/{kt}?language=is` með `RSK_KEY`.
   **Gildrur (úr [[iceland-rsk-fyrirtaekjaskra-api]]):** PascalCase-svör → case-óháður
   `rg()`-lesari; 404 = ekki-til (status→'notfound', EKKI villa); 401/403 = lykilvilla →
   stöðva nóttina strax (ekki brenna kvóta á biluðum lykli).
3. Þáttar: félags-meta → `felog`; `relationships[]` (einstaklingar með kt) → `folk` +
   `hlutverk`; félaga-kt í relationships (dagur 41–71) → `crawl_queue` (priority 2,
   INSERT OR IGNORE).
4. **Eigenda-skrap** (frítt, kurteist): fyrir félög þar sem API-kall tókst, sækja
   raunverulega eigendur með sömu HTML-leið og `rskFelag` í worker.js → `eign`
   (tegund 'raunverulegur') + eigandi-félög í biðröð. ~1,5s bið milli kalla; sami
   nætur-skammtur og API-ið.
5. Skrifar **batched SQL-skrá** (`night.sql`: INSERT OR REPLACE / upserts + seen_last-
   uppfærslur) og keyrir `npx wrangler d1 execute tengsl --remote --file night.sql`.
6. Skrifar þekju-yfirlit í Action-summary: félög/fólk/leggir alls, biðraðar-dýpt,
   köll notuð, villur.

### `skriptur/seed_tengsl.mjs` (nýtt, keyrt einu sinni + mánaðarlega)
- **Ársreikningaskrár-skilendur:** Eplica-leitin (sama kerfi og ársreikninga-pípan,
  [[iceland-arsreikningar-api]]) — paging per ár aftur til ~2015 → ~35þ virk félög í
  biðröð (priority 1).
- **Karp-snert félög:** allar kt úr `web/public/gogn/eigendur/*.json` (net-hnútar),
  `gogn/stjorn/*.json`, `eigendur_reverse.json`.
- **Lögbirtingablað:** nýskráningar félaga úr daglega logbirting-gagnasettinu → biðröð
  (priority 2) — dagleg delta-viðbót inni í crawl-nóttinni sjálfri.

### `.github/workflows/tengslagrunnur.yml` (nýtt)
- `schedule` (næturlega, t.d. 03:30 UTC — utan refresh-data 06:00) + `workflow_dispatch`
  (handvirk keyrsla með valfrjálsu budget-input).
- **Secrets-gátt:** ef `RSK_KEY` eða `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` vantar
  → hreint exit 0 með skýringu (crawl byrjar ekki fyrr en Aron kveikir). Engin rauð
  keyrsla að ástæðulausu.
- `concurrency: tengslagrunnur` (aldrei tvær nætur í einu).

## Worker-samruni (lestur)

- `web/wrangler.toml`: `[[d1_databases]]` binding `TENGSL` (database_id kemur þegar Aron
  býr til grunninn — sjá Aðgerðir). **Kóðinn þolir vöntun:** `env.TENGSL` undefined →
  nákvæmlega núverandi hegðun (null-þolið eins og allt annað).
- **`tengslanetHandler` auðgun:** eftir núverandi 12-félaga net-byggingu, EF `env.TENGSL`:
  - Per rót-tengdan einstakling með kt (þegar í minni server-hlið úr `rskFetchRaw`):
    `SELECT ... FROM hlutverk JOIN felog ... WHERE person_key=? AND seen_last IS NULL`
    → landsvísu-félög bætast í `onnur` (merkt `grunnur:true`), þak 24 per persónu +
    `n_alls`-teljari.
  - Krossar dýpka eins: fólk sem tengir net-félögin við önnur félög á landsvísu.
  - `eign`-leggir grunns fyrir net-félögin → auðga eignarleggi kortsins.
- **Persónuvernd óbreytt:** auðguðu gögnin renna gegnum SÖMU `maskaKortSvar`-grímu
  (`?kort=1`): fjarlægir einstaklingar token-only; persónu-kt fer ALDREI út (hvorki í
  lista- né kort-ham). Cache-lyklar tengslanets óbreyttir (auðgunin er inni í svarinu).

## Persónuvernd — tæknilegar varnir (lögmæti = borð Arons)

- Persónu-kt lifir AÐEINS í D1 server-hlið; engin API-leið skilar því.
- Engin bulk-niðurhals-/upptalningarleið út á við; öll birting um login-gátaða endapunkta
  með óbreyttri kort-grímu.
- Aðeins opinber skráargögn (fyrirtækjaskrá, raunverulegir eigendur, ársreikningar) —
  engin ný söfnunarsvið.
- `seen_last`-saga skjalfest sem vinnslutilgangur (söguleg KYC-rekjanleiki) í DPIA-viðbót.
- ⚠ Aron: DPIA-viðbót + lögfræði-yfirferð ([[karp-personuvernd-dpia]] leið A →
  landsdekkandi umfang) ÁÐUR en auðgunin fer í almenna birtingu.

## Aðgerðir Arons (blockers — kóðinn shippar en crawl sefur þar til)

1. `RSK_KEY` → GitHub Secrets (sama gildi og CF-secretið).
2. Cloudflare API-token með D1-edit scope + account-id → GH Secrets
   (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
3. Búa til D1-grunninn: `npx wrangler d1 create tengsl` (í `web/`, eða í CF-dashboard)
   og láta database_id í `wrangler.toml` (eða senda mér id-ið).
4. DPIA/lögfræði (ekki tæknilegur blocker á smíðina, en gátt fyrir almenna birtingu).

## Áfangar

- **0:** D1-grunnur + schema-migration + `TENGSL`-binding (þolir vöntun) — shippar strax.
- **1:** `seed_tengsl.mjs` + `crawl_tengsl.mjs` (API-stjórn) + `tengslagrunnur.yml` —
  sefur þar til secrets koma; svo fyllist grunnurinn á ~30–45 nóttum.
- **2:** eigenda-skrapið inn í crawl-nóttina (sama skript, þrep 4).
- **3:** worker-lesturinn + kort-auðgun — má shippa með 0/1 (null-þolið, kviknar sjálft).
- **v1.1 (ÚT FYRIR UMFANG):** persónusíður, sameiginlegir-stjórnarmenn-greining,
  leiðir-milli-félaga, lánshæfis-merki úr grunninum, gagnaáskrift RSK (fyllir götin).

## Sannprófun

- **Unit (node:test):** SQL-myndun crawl-skriptsins (fixtures úr raun-API-svörum, PascalCase),
  upsert-idempotens (tvíkeyrsla = engin tvítekning), seen_last-logík (horfið hlutverk merkt,
  ekki eytt), person_key-samræmi við eigOwnerKey.
- **Privacy-próf (SKYLDA):** kort-svar MEÐ D1-auðgun virka → fjarlægir áfram token-only,
  engin persónu-kt/nöfn fjarlægra í svari (útvíkkun á núverandi mask-prófi).
- **CI dry-run:** crawl 3 þekkt kt með `--dry-run` (skrifar night.sql, keyrir EKKI wrangler)
  — skip-if-no-secret mynstur.
- **Ops:** þekju-yfirlit í hverri Action-summary; `npx astro build` + `node --check worker.js`
  + `wrangler deploy --dry-run` fyrir deploy.

## Deploy

Vinna í worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` (branch `b2b-topbar`).
Deploy = `git push origin b2b-topbar:main` (rebase á árekstra). Crawl-workflowið sefur
þar til GH Secrets koma; worker-auðgunin sefur þar til D1 hefur gögn.
