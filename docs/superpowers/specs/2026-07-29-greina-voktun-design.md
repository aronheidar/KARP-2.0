# Greina-vöktun (röð-hreyfing) í Fyrirtækjavaktina — hönnunarskjal

**Dagsetning:** 2026-07-29
**Staða:** samþykkt hönnun (Aron valdi næmni „áfangar + stór stökk"; „byggja í Fyrirtækjavaktina"). Bíður spec-yfirferðar → plan.

## 1. Markmið

Vaktað félag (`firmavakt`) fær vikulega viðvörun þegar það **færist í röð innan atvinnugreinar sinnar** — nýtt merki ofan á vörumerki + heilbrigðiseftirlit. Digest-only (engin síðu-breyting). Engin ný stök vakt.

## 2. Næmni (úr brainstorm) — „áfangar + stór stökk"

Viðvörun aðeins þegar félagið: (a) fer **inn/út úr topp-1/3/5/10** (þrep `[1,3,5,10]`), EÐA (b) hreyfist **≥3 sæti**. Smá-rek (±1-2, vegna nýrra félaga í grunni) → engin viðvörun.

## 3. Gögn (STAÐFEST í kóða)

- Röð reiknast eins og `greinRankHandler` (worker.js:3142): `computeGreinRank(env,kt)` → `{slug,label,rank,total,sala}` (isat→`sectorForIsat`→D1 talning, nýjasta-ár-per-kt dedup). Verður **dregið út** svo digest deili því.
- `firmavakt` = `{on, felog:[{kt,nafn}]}` (vöktuð félög). Digest-vél `digestShared`→`digestBuild`→`digestRun`, cron mánud. 08:10; `digestShared` hefur `now` (unix-sek).
- Röð breytist hægt (bara þegar ársreikningar bætast) → viku-snapshot nægir.

## 4. Arkitektúr — 3 hlutar

### 4.1 Hrein `rankMovement(prev, cur)` í `web/src/lib/vaktir-signals.mjs` (viðbót, prófuð)

`prev`/`cur` = `{rank}` (eða null). Skilar `{ dir:'up'|'down', kind:'milestone'|'jump', badge, fromRank, toRank }` eða `null`. Regla: `tier(r)` = minnsta þrep í `[1,3,5,10]` með `r<=t` (annars `Infinity`); **milestone** ef `tier(prev)!=tier(cur)`; **jump** ef `|Δ|>=3`; ekkert → `null`. badge: `cur===1&&prev>1` → „🥇 nýtt #1"; milestone↑ → „↑ í topp <tc>"; milestone↓ → „↓ úr topp <tp>"; annars „↑/↓ <Δ> sæti".

### 4.2 Worker — `computeGreinRank` útdráttur + `grein_rank_last` + digest (worker.js)

- **Útdráttur:** `async function computeGreinRank(env, kt)` = kjarni `greinRankHandler` (L3151-3174) → `{slug,label,rank,total,sala}` (null-reiti ef engin grein/velta). `greinRankHandler` verður þunnur: validera→cache→`computeGreinRank`→svar+cache (óbreytt hegðun `/api/grein-rank`).
- **D1 snapshot:** lazy `CREATE TABLE IF NOT EXISTS grein_rank_last (kt TEXT PRIMARY KEY, slug TEXT, label TEXT, rank INTEGER, total INTEGER, sala INTEGER, ts INTEGER)` í `digestShared` (engin migration-hindrun).
- **`digestShared`:** `sh.rankMoves={}`; safna vöktuðum kt-um (union `firmavakt.felog` allra: `SELECT v FROM user_prefs WHERE k='firmavakt'`); fyrir hvert unikt kt → `computeGreinRank` (sleppa ef `rank==null`), lesa `prev` úr `grein_rank_last`, `rankMovement(prev,cur)` → ef marktækt `sh.rankMoves[kt]={...mv, slug,label,total}`; **UPSERT** `grein_rank_last` með `cur` (grunnlína færist fram). Fyrsta keyrsla: ekkert prev → engin viðvörun (bara sáning).
- **`digestBuild`:** nýr kafli — fyrir `prefs.firmavakt.felog[].kt` í `sh.rankMoves` → `li('🏭 '+nafn+' — '+badge, 'færðist úr #from í #to af total í label', '/atvinnugreinar/<slug>/')`. Header `🏭`, `personal=true`.

## 5. Gating & persónuvernd

Röð + fjöldi = opinber (ársreikningar), sama og `/api/grein-rank` (opinn). Erfir `firmavakt`-gátt (engin ný). `grein_rank_last` geymir aðeins röð/veltu vöktaðra félaga (opinbert). Engin ný PII.

## 6. Villumeðferð

`!env.TENGSL` / D1-villa `.catch` → tóm `sh.rankMoves` (kafli sleppst). `computeGreinRank` `rank==null` → sleppt (engin uppfærsla). Notandi án firmavakt → enginn kafli.

## 7. Prófun (grænt hlið)

- `node --test web/src/lib/vaktir-signals.test.mjs`: `rankMovement` — inn í topp-3 (5→2), nýtt #1 (2→1), út úr topp-5 (4→7), stökk (40→36), smá-rek (40→41→null), null-varnir.
- `node --check web/worker.js` (COMMITTAÐ blob ef hunk-stagað).
- `cd web && npx astro build`.
- Live: `/api/grein-rank?kt=` óbreytt (útdráttur breytir ekki svari). Digest 🏭-kafli = Aron staðfestir í mánudags-keyrslu / handvirkt (fyrsta keyrsla sáir, önnur sýnir hreyfingar).

## 8. Utan v1 (fast-follows)

Prófíl-merki „röð breyttist"; strax/daglegt; röðun eftir hagnaði/eignum; percentile.

## 9. Skrár

- **Breytt:** `web/src/lib/vaktir-signals.mjs` (+`rankMovement`), `web/src/lib/vaktir-signals.test.mjs` (+próf), `web/worker.js` (`computeGreinRank` útdráttur + `grein_rank_last` + `digestShared`/`digestBuild`; import `rankMovement`).
- ⚠ Samhliða-session breytir `web/worker.js` → **hunk-stöguð git-add**; aðrar skrár berur `git add <slóð>`.
