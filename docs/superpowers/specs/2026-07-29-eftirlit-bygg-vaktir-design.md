# Eftirlits- + byggingavaktir → raun-vaktir — hönnunarskjal

**Dagsetning:** 2026-07-29
**Staða:** samþykkt hönnun (Aron), bíður spec-yfirferðar → útfærsluáætlun.

## 1. Markmið

Gera tvær opnar flettisíður sem heita „vakt" — **/eftirlit/** (heilbrigðiseftirlit RVK) + **/byggingarvakt/** (byggingarleyfi RVK) — að **raunverulegum áskrifanlegum vöktum**, með því að renna gögnunum inn í vaktir sem NOTANDINN Á ÞEGAR (engin ný stök vakt): tveir nýir digest-kaflar + „Vakta"-hnappar á síðunum.

## 2. Val (úr brainstorm) — lyklunin ræður

- **Eftirlit er kt-lyklað** (698/699) → rennur í **Fyrirtækjavaktina** (`firmavakt`, vaktar félög eftir kt). „Vaktaðu félag" → vörumerki **+ heilbrigðiseftirlit**.
- **Bygging er heimilisfangs-/póstnúmers-lyklað** (engin kt/nöfn, GDPR-ritskoðuð) → rennur í **Fasteignavaktina** (`fastvakt`, vaktar svæði eftir póstnr/götu). „Vaktaðu hverfi" → sölur **+ byggingarleyfi**.
- Umfang: **digest-kaflar + Vakta-hnappar** á báðum síðum. Bæði opinber RVK-gögn, engin ný pref/gátt (erfa firmavakt/fastvakt).

## 3. Gögn & lyklun (STAÐFEST í kóða)

- **`/gogn/eftirlit.json`** (`_dget`): `{ …, stadir:[{ name, kt, street, postnr, city, rating(0-5), ratingLabel, lastInspection, lastInspectionISO, uuid, reportUrl, lat, lng }] }`. **Lyklað á `kt`** (kt-þekja 698/699). Snapshot (dagl. build, RVK-only) — engin saga, EN `lastInspectionISO` gefur „ný skoðun".
- **`/gogn/byggingarleyfi_vakt.json`** (`_dget`): `{ …, recent:[{ addr, postnr, hverfi, lat, lng, caseNo, fnr, desc, decisionCode, date, fund, sizeM2, sizeM3 }] }`. **Lyklað á heimilisfang/póstnr/hverfi**, dagsett (`date`, nýjast fyrst). Engin kt/nöfn.
- **firmavakt** = `{ on, felog:[{ kt, nafn }] }` (add-mynstur: `fyrirtaeki.astro:1844`). **fastvakt** = `{ on, vaktir:[{ sv?, q }] }`, cap 6 (add-mynstur: `fasteignavakt.astro:381`; match `fvMatch(r,sv,q)`).
- Digest-vél: `digestShared`→`digestBuild`→`digestRun`, cron mánud. 08:10. `digestShared` reiknar `wkDate` (7 daga mörk, `worker.js:4022`).

## 4. Arkitektúr — 5 hlutar

### 4.1 Hrein rökvél `web/src/lib/vaktir-signals.mjs` (ný, prófuð)

- `export function eftNylegt(iso, wkDate)` → `true` ef `String(iso).slice(0,10) >= wkDate` (streng-ISO, sama og digest kaup7-mynstur). Tómt → false.
- `export function byggMatch(item, q)` → `true` ef: 3ja-stafa `q` → `item.pn===q`; annars `String(item.a).toLowerCase().startsWith(q.toLowerCase())`. Tómt `q` → false. (Sleppir `sv` því byggingar bera hverfi, ekki kaupskrá-svæði — póstnr/gata virkar strax.)

### 4.2 Digest — Eftirlit → firmavakt (worker.js)

- **`digestShared`:** `sh.wkDate = wkDate`; `const eft = await _dget(env,'/gogn/eftirlit.json')`; `sh.eftByKt = {}`; fyrir `s` í `eft.stadir` með `s.kt` → `(sh.eftByKt[s.kt] ||= []).push(s)`.
- **`digestBuild`:** nýr kafli — fyrir `prefs.firmavakt.felog[].kt`, `sh.eftByKt[kt]` síað með `eftNylegt(s.lastInspectionISO, sh.wkDate)` → `li` „[nafn] — heilbrigðiseftirlit: einkunn X (label)" (⚠️-forskeyti ef `rating<=1`), hlekkur `reportUrl`. Header `🍽️`, cap 10, `personal=true`.

### 4.3 Digest — Bygging → fastvakt (worker.js)

- **`digestShared`:** `const bygg = await _dget(env,'/gogn/byggingarleyfi_vakt.json')`; `sh.bygg7 = (bygg.recent||[]).filter((x) => String(x.date).slice(0,10) >= wkDate)`.
- **`digestBuild`:** nýr kafli — fyrir hvert `x` í `sh.bygg7`, ef eitthvert `prefs.fastvakt.vaktir[].q` með `byggMatch(x, w.q)` → `li` „[addr] — [desc]", undirtexti dags+hverfi+decisionCode, hlekkur `/byggingarvakt/`. Dedup á `caseNo`. Header `🏗️`, cap 8 (+„… og N til viðbótar"), `personal=true`.

### 4.4 Vakta-hnappur á /eftirlit/ → firmavakt (client)

Á hverjum stað í leitanlegu skránni (eða per prófíl-flís): hnappur „🔔 Vakta félagið" (login-aware, **speglar `fyrirtaeki.astro:1844`**): `karpGet('/firmavakt')` → toggle `{kt, nafn}` í `felog` → `karpPost('/firmavakt',{on:true,felog})`; texti „✓ Á vaktinni". Óinnskráð → `location.href = loginHref()`. `import { karpGet, karpPost, loginHref } from '../lib/auth.js'`.

### 4.5 Vakta-hnappur á /byggingarvakt/ → fastvakt (client)

Hnappur „🔔 Vakta þetta svæði/póstnúmer" (login-aware, **speglar `fasteignavakt.astro:381`**): bætir `{ q: postnr (eða gata) }` við `fastvakt.vaktir` (cap 6): `karpGet('/fastvakt')` → `vaktir.concat({q})` (ef ekki þegar) → `karpPost('/fastvakt',{on:true,vaktir})`. Óinnskráð → `loginHref()`.

## 5. Gating & persónuvernd

Bæði opinber RVK-gögn. Eftirlit = rekstraraðila-kt + einkunnir (opinbert HER). Bygging = heimilisföng, **GDPR-ritskoðuð** í build (engin kt/nöfn umsækjenda — `PII_RX`). Vaktirnar erfa gátt/product firmavakt/fastvakt (engin ný gátt). Digest = innskráðir með `digest.on`.

## 6. Villumeðferð

`_dget` skilar `null` → `sh.eftByKt={}` / `sh.bygg7=[]` (kaflar sleppast, engin villa). Kt án eftirlits / svæði án byggingar → enginn kafli. Digest óbreytt fyrir notendur án firmavakt/fastvakt. Hnappar: fetch-villa → engin breyting + hljóðlát.

## 7. Prófun (grænt hlið)

- `node --test web/src/lib/vaktir-signals.test.mjs`: `eftNylegt` (nýleg/gömul/tóm), `byggMatch` (póstnr/gata/tómt/rangt).
- `node --check web/worker.js`.
- `cd web && npx astro build`.
- Live: digest-þurrkeyrsla (`/api/…digest` handvirkt) sýnir 🍽️/🏗️ kafla fyrir prófíl með firmavakt/fastvakt. Síður: „Vakta"-hnappur vistar (innskráð) / vísar á innskráningu (óinnskráð).

## 8. Utan v1 (fast-follows)

„Einkunn LÆKKAÐI" (þarf `build_eftirlit`-sögu, prior rating per kt); hverfis↔svæði-orðabók svo `fastvakt.sv`-exact nái byggingum; strax/daglegt í stað vikulegt; non-RVK (Matvælastofnun/aðrir byggingarfulltrúar) þegar gögn opnast.

## 9. Skrár

- **Ný:** `web/src/lib/vaktir-signals.mjs`, `web/src/lib/vaktir-signals.test.mjs`.
- **Breytt:** `web/worker.js` (`digestShared` + 2 `digestBuild`-kaflar; import `eftNylegt`/`byggMatch`), `web/src/pages/eftirlit.astro` (Vakta→firmavakt), `web/src/pages/byggingarvakt.astro` (Vakta→fastvakt).
- ⚠ Samhliða-session breytir `web/worker.js` → **hunk-stöguð git-add** (aldrei `git add web/worker.js`/`-A`); aðrar skrár berur `git add <slóð>`.
