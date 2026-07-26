# Áreiðanleikavaktin — KYC-vöktun fyrir stofur (v1) — Hönnun

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt hönnun (brainstorming), tilbúið fyrir útfærsluáætlun (writing-plans).
**Repo:** aronheidar/KARP-2.0 · worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`

## Markmið

Breyta einskiptis-„Áreiðanleikamatinu" (990 kr KYC-skýrsla) í **áframhaldandi KYC-vöktun**: lögmanns-/bókhaldsstofa vaktar viðskiptavina-lista (kt), hvert kt fær sjálf-viðhaldna **compliance-möppu** — upphafskönnun + áhættumat + vöktun yfir 8 merki + tímamerkt atburðaskrá + PDF-export sem stenst eftirlit skv. lögum nr. 140/2018.

## Samhengi

- **Vígigröfin:** landsdekkandi eignar-/stjórnar-tengslagrunnur í D1 (`felog`/`folk`/`eign`/`hlutverk`, populaður nætur um `tengslagrunnur.yml`) + haugur per-kt merkja (ársreikningar, Lögbirting, refsilistar, PEP-index, opnirreikningar, fréttir/sentiment).
- **Til staðar nú þegar:** Áreiðanleikamat-skýrslan (`hasReport('areidanleiki:'+kt)`, PEP/UBO/refsilista-skimun), Fyrirtækjavaktin (fylgja + breytingaviðvaranir), per-notanda `ktwatch` (JSON-blobb í `user_prefs`, kvóti um `_ktwatchCap`), worker `scheduled()` cron (`digestRun`/`newsIngest`/`frettavaktCron`), Gmail-póstur, DPIA leið A (opinber gögn).
- **Lagalegur drifkraftur:** lögmenn, endurskoðendur og bókhaldsþjónusta eru tilkynningarskyldir aðilar skv. peningaþvættislögum → **skylda** til áreiðanleikakönnunar, áhættumats, áframhaldandi vöktunar og **skjölunar** sem eftirlitsaðili (ríkisskattstjóri) getur kallað eftir. Raunverulegi sársaukinn er skjölunar-/vöktunar-byrðin, ekki stök skimun.

## Læstar ákvarðanir (úr brainstorming)

1. **Beachhead:** lögmenn & bókarar (AML-skyldir, litlar/meðalstórar stofur).
2. **Kjarni:** compliance-mappa per viðskiptavin (CDD + áhættumat + vöktun + audit-log + PDF).
3. **Pökkun:** innifalið í Karp+ **Fyrirtæki+** (þrep 3). Gate = `hasTier(3)`. Watchlist-þak = 100 kt (per-notanda kvóti, virkar í dag).
4. **Skimun v1:** innlend PEP-index + **graf-afleiddir RCA** (fjölskylda/nánir samstarfsmenn — sérstaða KARP) + opinberir refsilistar (OFAC/UN/EU). Erlendir PEP-ar + vottuð veita = fast-follow, heiðarlega merkt sem gat.
5. **Arkitektúr:** vöktunarlag ofan á núverandi stakk (endurnýtir graf + bökuð merki + worker `scheduled()`).
6. **Sameign:** **v1 einn-notanda** — `kyc_watch` lyklað á `owner_id` (= `users.id` áskrifandans, eins og `ktwatch`). Org/sæta-módel er **fast-follow** (sjá §11). „10 sæti" deila ekki listanum í v1 — kynnt sem einn compliance-notandi.

## Staðfestar kóða-staðreyndir (úttekt 2026-07-26)

- **Ekkert org/account/team-módel:** notendur eru sjálfstæðir. `users` (`web/migrations/0002_auth.sql`): `id,email,username,pass_hash,name,is_admin,email_verified,kt,tier,tier_until,tier_trial_used,tier_askell,reports_used,reports_month,terms_accepted,created,updated`. `sub_service`: `(user_id,service,until,askell_id,trial_used)`. „Sæti" er bara tala (`_seatsCap` `worker.js:3130`); `/team` geymir email-blobb í `user_prefs`, aldrei tengt við `users`. `effectiveTier` = eigið þrep notandans (`worker.js:2933`).
- **PDF = client-side** `window.print()` + `@media print` CSS (engin lib). Fordæmi: `fyrirtaeki.astro:1779` (`doPrint`), `ubo-report.js:298`, prent-CSS `fyrirtaeki.astro:347` / `ubo.css`.
- **Worker `scheduled()`** til (`worker.js:3955-3958`), greinir á `event.cron`, skrifar D1 beint um `env.TENGSL.prepare/batch` (t.d. `newsIngest` `:3605-3614`). Cron-strengir í `wrangler.toml`.
- **GHA→D1** um `npx wrangler d1 execute tengsl --remote` (`tengslagrunnur.yml`, `crawl_tengsl.mjs:46-50`). Grafið er þegar í D1 → `scheduled()` getur lesið það beint.
- **Spec/plans:** `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`, `docs/superpowers/plans/`.

## Arkitektúr (yfirlit)

```
Notandi (Fyrirtæki+)  ──►  Astro UI (Mitt svæði ▸ Áreiðanleikavaktin, hasTier(3))
                              │  /api/kyc/*  (worker, owner_id úr session)
                              ▼
        Worker  ──────────────┼─────────────────────────────────────────────
          • /api/kyc/watch|file|risk|ack|note|rescreen   (les/skrifar D1)
          • scheduled(): kycDiffCron (dagl.) + kycCriticalCron (1–3 klst)
                              │
                              ▼
        D1 (TENGSL): kyc_watch · kyc_snapshot · kyc_event · kyc_audit · kyc_ack
          + les: felog/folk/eign/hlutverk (graf), users, user_prefs
          + les bökuð: sanctions.json, pep.json, logbirting.json, arsreikningar/<kt>, birgjar, sentiment
                              │
        Gmail  ◄──────────────┘  (kritískar viðvaranir strax + dagl./vikul. digest)
```

Kjarninn: **snapshot-diff.** Næturlega reiknar worker núverandi stöðu hvers merkis fyrir hvert aðgreint vaktað kt, ber við geymda `kyc_snapshot`, og hverja breytingu → `kyc_event` (hnattrænt) + `kyc_audit` (per-eiganda) + `kyc_ack` (opin viðvörun). Kritísk merki (refsilistar, Lögbirting) keyra á tíðari cron.

## Gagnalíkan — ný D1-migration `web/migrations/0008_kyc.sql`

**`kyc_watch`** — listinn (per-eiganda):
| dálkur | tegund | note |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| owner_id | INTEGER NOT NULL | `users.id` áskrifandans |
| kt | TEXT NOT NULL | viðskiptavina-kt |
| nafn | TEXT | cache við skráningu |
| risk | TEXT | `Lág`/`Venjuleg`/`Há` (null → reiknað sjálfgefið) |
| risk_reason | TEXT | rökstuðningur (handvirkt override) |
| status | TEXT DEFAULT 'active' | `active`/`archived` |
| added_at | INTEGER | unix |
| reviewed_at | INTEGER | síðasta handvirka yfirferð |

`UNIQUE(owner_id, kt)`, `INDEX(owner_id)`.

**`kyc_snapshot`** — hnattræn síðasta staða (deilt milli eigenda, reiknað einu sinni per kt):
`kt TEXT, signal TEXT, state_hash TEXT, state_json TEXT, computed_at INTEGER, PRIMARY KEY(kt, signal)`.
`signal ∈ {ubo, board, sanctions, pep, legal, status, tax, media}`.

**`kyc_event`** — hnattrænir breytinga-atburðir:
`id PK, kt TEXT, signal TEXT, kind TEXT, severity TEXT, detail_json TEXT, detected_at INTEGER`, `INDEX(kt, detected_at)`.
`severity ∈ {critical, high, info}`; `kind` t.d. `new_ubo|removed_ubo|board_change|sanctions_hit|pep_change|bankruptcy|innkollun|nauthungarsala|new_annual|status_change|tax_claim|adverse_media`.

**`kyc_audit`** — **append-only** compliance-skrá (per eigandi+kt):
`id PK, owner_id INTEGER, kt TEXT, ts INTEGER, actor TEXT, action TEXT, summary TEXT, detail_json TEXT`, `INDEX(owner_id, kt, ts)`.
`actor` = `'system'` eða notenda-email; `action ∈ {initial_cdd, screening, change_detected, risk_set, note, ack, export}`. **Aldrei uppfært/eytt fyrr en eftir 5 ár** (AML-varðveisla).

**`kyc_ack`** — meðhöndlun viðvarana (per eigandi+atburður):
`id PK, owner_id INTEGER, event_id INTEGER, status TEXT DEFAULT 'open', note TEXT, by TEXT, at INTEGER`, `UNIQUE(owner_id, event_id)`. `status ∈ {open, resolved, dismissed}`.

Hönnunarregla: `snapshot`/`event` eru **hnattræn** per kt (skilvirkt — margar stofur sem vakta sama kt reikna einu sinni); `watch`/`audit`/`ack` eru **per-eiganda** (hörð einangrun).

## Vöktunar-vél

- **`kycDiffCron(env)`** — daglega (nýr cron í `wrangler.toml`, t.d. eftir að grafið er ferskt). Skref:
  1. `SELECT DISTINCT kt FROM kyc_watch WHERE status='active'`.
  2. Fyrir hvert kt (í lotum), reikna núverandi stöðu nætur-merkja (ubo/board/pep/status/tax/media) úr grafi + bökuðum skrám.
  3. Bera við `kyc_snapshot`; við mun → `INSERT kyc_event`, `UPSERT kyc_snapshot`, og fyrir hvern `owner_id` sem vaktar kt → `INSERT kyc_audit('change_detected')` (+ `kyc_ack` opið fyrir `critical`/`high`).
  4. Safna per-eiganda breytingum fyrir digest.
- **`kycCriticalCron(env)`** — á 1–3 klst fresti, AÐEINS `sanctions` + `legal` (Lögbirting) fyrir aðgreind vöktuð kt → sami event/audit/ack-farvegur + **strax email** fyrir `critical`.
- **Skimun server-megin:** vélin þarf server-hlið útgáfu af PEP/refsilista/RCA-skimun (Áreiðanleikamatið er render-að; útdráttur skimunar-rökfræðinnar í worker-hjálparfall sem `kycDiffCron` og `/api/kyc/rescreen` deila).
- **Skala/mörk:** engin ytri köll per kt (allt í D1/ASSETS) → helst innan Worker subrequest/CPU-marka; lota kt og nýta `env.TENGSL.batch`. Sannreyna við raunfjölda; ef of stórt, dreifa yfir cron-keyrslur.

⚠ **Háð (near-live):** `sanctions.json` + `logbirting.json` eru bökuð daglega í CI. Tíðari `kycCriticalCron` yfir *sömu daglega bökuðu* skrá gefur ekki ferskari uppgötvun. Sönn near-live krefst þess að **auka ferskleika heimildanna sjálfra** (worker sæki refsilista/Lögbirting beint, eða tíðari build) — lítið tengt verk, sjá §11/§13. Í v1 er kritíski farvegurinn til staðar en ferskleiki = ferskleiki heimildar.

## Skimun v1 & áhættumat

- Félag + UBO-ar + stjórn + **graf-afleiddir RCA** skimað gegn `pep.json` (innlend) + `sanctions.json` (OFAC/UN/EU). Fyrirvari í UI + PDF: „Innlend PEP + opinberir refsilistar; erlendir PEP-ar takmarkaðir."
- **Áhættumat** 3-þrep skv. AML (`Lág`/`Venjuleg`/`Há`): sjálfgefið reiknað úr fyrirliggjandi áhættumerkjum (`fsLanshaefi`/flögg + PEP/refsilista/gjaldþrota-nálægð í neti); notandi má handvirkt override-a með rökstuðningi (skráð í `kyc_audit`).

## UX (nýr hluti í Mitt svæði, `hasTier(3)`)

- **Portfolio-yfirlit:** tafla/spjöld vaktaðra viðskiptavina — nafn, kt, áhætturating, síðast skimað, fjöldi opinna viðvarana, staða. Sía á áhættu + opnar viðvaranir. „Bæta við" (kt-leit → `kyc_watch`, þak 100). Fjarlægja = archive.
- **Compliance-mappa (drill-in):** upphafs-CDD (Áreiðanleikamat-innihald, „skimað DAGS") + áhætturating (editanlegt) + **tímalína** úr `kyc_audit` (könnun/skimun/breytingar/aðgerðir) + opnir atburðir. Aðgerðir: skima aftur, athugasemd, setja áhætturating, ljúka/vísa frá viðvörun, **export PDF**.
- **PDF** = client-side `window.print()` + nýtt `@media print` block (fela chrome, halda möppu-body) — sama hugmynd og skýrslurnar. Inniheldur CDD-samantekt + áhætturating + fulla tímamerkta atburðaskrá.

**Worker endapunktar** (`/api/kyc/*`, allir `hasTier(3)` + `owner_id` úr session):
- `GET /api/kyc/watch` — listi + staða/áhætta/opnar-viðvaranir.
- `POST /api/kyc/watch {kt}` — bæta við (kvóti 100), keyrir upphafs-CDD + fyrstu skimun (`kyc_audit: initial_cdd`).
- `DELETE /api/kyc/watch {kt}` — archive.
- `GET /api/kyc/file?kt=` — mappa: CDD + áhætta + tímalína + opnir atburðir.
- `POST /api/kyc/risk {kt,risk,reason}` · `POST /api/kyc/ack {event_id,status,note}` · `POST /api/kyc/note {kt,note}` · `POST /api/kyc/rescreen {kt}`.

## Viðvaranir

- **Kritískt (near-live):** refsilista-hit eða gjaldþrot/nauðungarsala á vöktuðu kt → strax email á áskrifandann (endurnýtir Gmail-send) + in-app badge.
- **Digest (dagl./vikul., stillanlegt í `user_prefs`):** allar aðrar breytingar + samantekt („N skimaðir, M breytingar, K opnar viðvaranir") — endurnýtir `digestRun`.

## Réttindi & persónuvernd

- Gate: `hasTier(3)` á öllum `/api/kyc/*` + UI-hluta. Watchlist-þak 100 (per-notanda kvóti). Paywall áfram SLÖKKT → frítt þar til kveikt (eins og allt annað).
- **Vinnsluaðili:** KARP verður vinnsluaðili fyrir stofuna varðandi listann → **vinnslusamningur (DPA)** í skilmála Fyrirtæki+ (Aron/lögfræði).
- **Hörð einangrun:** `owner_id` á HVERRI fyrirspurn í `kyc_watch`/`kyc_audit`/`kyc_ack`.
- **Engin ID-skjala-geymsla í v1** — aðeins kt + opinberar niðurstöður.
- **DPIA-viðbót** (leið A náði KYC á opinberum gögnum) fyrir viðskiptavina-lista + vinnsluaðila-hlutverk.
- **Varðveisla:** `kyc_audit` haldið ≥5 ár (AML). Ekki hard-delete.

## Utan umfangs v1 (fast-follows)

- **Org/sæta-módel** (accounts-tafla + meðlima-tenging + `effectiveTier`-erfð) svo firma-sameign virki alvöru — stærsti fast-follow, eigið undir-verkefni.
- ID-skjala-upphlaðning; færsluvöktun & tilkynningar til skrifstofu fjármálagreininga (utan KARP-gagna); erlend vottuð PEP/sanctions-veita; case-management/úthlutun; stillanlegar áhættureglur; banka-API/SLA.
- **Near-live ferskleiki heimilda** (auka refresh á `sanctions.json`/`logbirting.json`) — lítið tengt verk sem magnar kritíska farveginn.

## Prófun & sannreyning

- Einingapróf á diff-vél með fixtures: „UBO bætt við → `new_ubo`", „refsilista-match → `sanctions_hit`/critical", „engin breyting → enginn atburður".
- **Einangrunarpróf:** eigandi A sér aldrei `kyc_watch`/`kyc_audit`/`kyc_ack` eiganda B.
- Gate-próf: `hasTier(3)` krafist; þak 100 virt.
- `astro build` grænt + `scheduled()` þurrkeyrsla (cron-branch-val).

## Opnar spurningar (leysast í plani)

1. Nákvæm severity-vörpun per `kind` (hvað er critical vs high vs info).
2. Sjálfgefin digest-tíðni (dagl. vs vikul.) + hvar stillt í `user_prefs`.
3. Hversu mikið af Áreiðanleikamats-skimun er þegar server-hlið vs þarf að flytja í worker-hjálparfall.
4. Adverse-media samsvörun (nafna-tvíræðni → falskar jákvæðar); þröskuldur/þöggun.
5. Tíðni `kycCriticalCron` + hvort para eigi við aukinn heimildar-refresh strax eða síðar.
