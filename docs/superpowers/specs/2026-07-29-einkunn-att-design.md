# Einkunn-átt (lækkaði vs hækkaði) í heilbrigðiseftirlits-vaktinni — hönnunarskjal

**Dagsetning:** 2026-07-29
**Staða:** samþykkt hönnun (Aron). Fast-follow á eftirlits-vöktun (`e526431`).

## 1. Markmið

🍽️-digest-kaflinn sýnir í dag „ný skoðun: einkunn X" (kveikja = ný skoðun). Gera hann **áttavísan**: „**↓ féll úr 4 í 2**" / „**↑ hækkaði úr 2 í 4**". Kveikjan færist úr *nýrri skoðun* í **einkunn-BREYTINGU** — sleppir hávaða af endur-skoðunum með sömu einkunn.

(Röð-hreyfing var þegar áttavís — `rankMovement` skilar ↑/↓. Þetta jafnar einkunnina við hana.)

## 2. Vandinn: `eftirlit.json` er snapshot

Dagleg build yfirskrifar → engin saga, engin fyrri einkunn. Því þarf **eigin sögu-geymslu** (sama lausn og `grein_rank_last` fyrir röð).

## 3. Gögn (STAÐFEST í kóða)

- `sh.eftByKt[kt] = [stadir]` (byggt í `digestShared`); hver `s` = `{ name, kt, street, rating(0-5), ratingLabel, lastInspectionISO, uuid, reportUrl, … }`. **`uuid` = starfsstöð** (rétti lykillinn — eitt kt getur átt fleiri staði).
- Núverandi 🍽️-kafli í `digestBuild` kveikir á `eftNylegt(s.lastInspectionISO, sh.wkDate)`.
- Fordæmi: `grein_rank_last` + `rankMovement` (`3513ed9`) — sama mynstur.

## 4. Arkitektúr — 3 hlutar

### 4.1 Hrein `ratingMovement(prev, cur)` í `web/src/lib/vaktir-signals.mjs` (viðbót, prófuð)

`prev`/`cur` = tölur (0-5) eða null. Skilar `{ dir:'up'|'down', from, to, badge }` eða `null` (óbreytt / vantar sögu / ógilt). badge: `dir==='down'` → „↓ féll úr {from} í {to}"; `up` → „↑ hækkaði úr {from} í {to}".

### 4.2 Worker — `eftirlit_last` snapshot + átt (digestShared)

- Lazy `CREATE TABLE IF NOT EXISTS eftirlit_last (uuid TEXT PRIMARY KEY, kt TEXT, rating INTEGER, ts INTEGER)`.
- Fyrir hvern stað **vöktaðra kt-a** (`_watchKts` er þegar reiknað fyrir greina-vöktun — endurnýtt): lesa `prev` úr `eftirlit_last` per `uuid`, `ratingMovement(prev.rating, s.rating)` → ef marktækt skrá í `sh.eftMoves[uuid] = { ...mv, kt, name, street, ratingLabel, reportUrl }`; **UPSERT** núverandi einkunn (grunnlína færist fram). Fyrsta keyrsla sáir (engin viðvörun).

### 4.3 Worker — 🍽️-kaflinn verður áttavís (digestBuild)

Kveikja færist úr `eftNylegt` í `sh.eftMoves`: fyrir `firmavakt.felog[].kt` → staðir þess kt í `sh.eftMoves` → `li((bad?'⚠️ ':'') + name + ' — ' + badge, nafn+street+ratingLabel, reportUrl)`. `bad` = ný einkunn ≤1. Header/cap óbreytt (🍽️, 10).

**Afleiðing:** endur-skoðun með ÓBREYTTA einkunn → engin lína (áður: lína). Það er ætlað (minni hávaði, meiri merking).

## 5. Gating & persónuvernd

Opinber HER-gögn (einkunnir), erfir `firmavakt`-gátt. `eftirlit_last` geymir aðeins uuid+kt+einkunn vöktaðra félaga (opinbert). Engin ný PII.

## 6. Villumeðferð

D1 `.catch` → tóm `sh.eftMoves` (kafli sleppst). `rating` null/ógilt → sleppt. Notandi án firmavakt → enginn kafli.

## 7. Prófun (grænt hlið)

- `node --test web/src/lib/vaktir-signals.test.mjs`: `ratingMovement` — fall (4→2), hækkun (2→4), óbreytt (3→3→null), engin saga (null→3→null), 0-gilt (1→0 telst fall), ógilt (null-varnir).
- `node --check web/worker.js` · `cd web && npx astro build`.
- Live: `/api/*` óbreytt (digest-only). 🍽️-kafli = Aron staðfestir (fyrsta keyrsla sáir, önnur sýnir átt).

## 8. Utan v1

Þröskuldur (t.d. aðeins fall ≥2 stig); saga á prófíl („einkunn síðustu 12 mán"); strax-tilkynning við fall í 0-1.

## 9. Skrár

- **Breytt:** `web/src/lib/vaktir-signals.mjs` (+`ratingMovement`), `.test.mjs` (+próf), `web/worker.js` (`eftirlit_last` + `sh.eftMoves` í `digestShared`; áttavís 🍽️-kafli í `digestBuild`; import).
- ⚠ Samhliða-session á `worker.js` → hunk-stöguð git-add.
