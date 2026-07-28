# Atvinnugreina-skýrslur v1 — hönnunarskjal (design spec)

**Dagsetning:** 2026-07-27
**Staða:** samþykkt hönnun (Aron), bíður spec-yfirferðar → útfærsluáætlun.

## 1. Markmið

Per **ÍSAT-deild** (2-stafa, ~82): **frí SEO-grein-yfirlitssíða** (fjárhags-form greinarinnar vs hagkerfið) + **gátuð Fyrirtæki+ djúp-skýrsla** (röðuð stærstu félög greinarinnar + samþjöppun + PDF). Nýtt tekjufæri (markaðsrannsókn per grein) úr gögnum sem Karp á þegar. Sérstaða: sameinar Hagstofu-greina-viðmið + raun-félaga-fjárhag úr ársreikningum á einum stað, per ÍSAT-deild.

## 2. Val (úr brainstorm)

- **Positioning:** blanda — frítt grein-yfirlit (SEO/uppgötvun, opið) DRÍFUR sölu á gátaðri djúp-skýrslu.
- **Upplausn:** ÍSAT-deildir (~82; þar sem gögnin liggja beint, mesta SEO, sjálfvirkt sniðið).
- **Djúp-skýrsla:** heildarmynd (öll 8 viðmið vs hagkerfi + túlkun) + röðuð félaga-tafla m/fjárhag + samþjöppun (HHI + topp-N hlutdeild) + **vörumerkt PDF** (report-nav.js).

## 3. Gögn (STAÐFEST í kóða)

- **Viðmið (bökuð):** `web/public/gogn/sector_kpi.json` — `map["<2-stafa ÍSAT>"]` = `{ label, ar, framlegd, hagnadarhlutfall, ebit_hlutfall, eiginfjarhlutfall, skuldahlutfall_DE, eignavelta, launahlutfall, tekjur_pr_starfsm_mkr }` fyrir **82 deildir** + `heild` (hagkerfið, sömu reitir). Hagstofa FYR08010 (2024). Uppfært af `build_sector.mjs`.
- **Félaga-fjárhagur (LIFANDI, D1):** sama og `topplistarHandler` notar — `SELECT f.kt, f.nafn, fj.sala, fj.hagnadur, fj.eignir, fj.eigid_fe, fj.ar FROM felog f JOIN fjarhagur fj ON fj.kt=f.kt WHERE substr(f.isat_primary,1,2)='<deild>' AND fj.sala IS NOT NULL ORDER BY fj.sala DESC LIMIT 100`. `felog.isat_primary` er ÍSAT-kóði (2 fyrstu stafir = deild). `fj.sala` = velta (fyrir röðun + samþjöppun).

## 4. Arkitektúr — 3 lög

### 4.1 Frí grein-yfirlit (SSG, opið → SEO)

- `web/src/pages/atvinnugreinar/[slug].astro` + `web/src/pages/atvinnugreinar/index.astro` (hub).
- `getStaticPaths`: `import SK from '../../public/gogn/sector_kpi.json'` → ein síða per deild í `SK.map` (`params.slug = slugify(label)`, `props = { isat, kpi, heild }`). ENGIN D1 → hreint SSG (byggir úr bakaðri `sector_kpi.json` einni).
- Rendrar: grein-heiti + lýsing, **8 viðmið vs hagkerfið** (súlur/tölur + `vsHeild`-túlkun „X% yfir/undir meðaltali greina"), stutt SEO-inngangur, Dataset JSON-LD, `title`/`description` per deild, **CTA á djúp-skýrsluna** („Sjá stærstu félög greinarinnar + samþjöppun — Fyrirtæki+").
- **Hub** `/atvinnugreinar/`: listi allra deilda (nafn + 1 lykil-viðmið) → SEO-nafla.

### 4.2 Gátuð djúp-skýrsla (Fyrirtæki+)

- Worker `atvinnugreinHandler` → `GET /api/atvinnugrein?isat=<2-stafa>`: `readSession`→uid; `owner=accountOwner`; **`_atvinnuGate(owner,now)` speglar `_kycGate`** (admin/free_access || virkt `fyrirtaeki_plus`); `!gate` → `_ajson({ok:false,error:'tier'})`. D1-fyrirspurn (§3, filter á STÖKU deild), les `sector_kpi.json` (augGet) → skilar `{ ok:true, isat, label, vidmid, heild, topFelog:[{kt,nafn,sala,hagnadur,eignir,eigid_fe}], samthjoppun:{ toppN_hlutdeild, HHI }, staerd_heild:Σsala, n, coverage }`. Cache 5 mín (`caches.default`, lykill per isat+entitled, `private, max-age=300`). D1 óvirkt/tómt → `{ok:true, topFelog:[], coverage:0, ...}` (aldrei 500).
- Client (á `[slug].astro`, EF `hasTier('fyrirtaeki_plus')`): `fetch('/api/atvinnugrein?isat='+isat)` → rendrar djúp-kaflann (öll 8 viðmið+túlkun, **röðuð félaga-tafla** m/veltu/hagnaði/eignum, samþjöppun-mælar HHI+topp-N, þekju-fyrirvari) → **report-nav.js PDF**.
- **Raunveruleg paywall:** félaga-röðunin/samþjöppunin er EKKI í opna SSG-HTML-inu — aðeins úr gátaða endapunktinum. (Gögnin sjálf opinber — engin PII.)

### 4.3 Hrein rökvél `web/src/lib/atvinnugrein.mjs` (einingaprófuð)

Engin I/O; deilt SSG + worker.
- `export function slugify(label)` → hreinn slug úr label (strípa „(ÍSAT nr. …)" + íslenska-örugg slug-un; einkvæmur).
- `export function vsHeild(val, heildVal)` → `{ pct, dir:'yfir'|'undir'|'jafnt' }` (hlutfallslegt frávik frá hagkerfis-viðmiði).
- `export function herfindahl(salaArr)` → HHI (0–10000) úr veltu-hlutdeildum.
- `export function toppNShare(felog, n)` → samanlögð %-hlutdeild topp-N eftir sölu.
- `export function fmtRatio(x)` / `fmtKr(x)` → íslensk snið.
- `export const RATIO_META` → { key → {heiti, format, betra:'haerra'|'laegra'} } fyrir 8 viðmiðin (röðun túlkunar).

## 5. Gating & persónuvernd

Frí opið (SEO). Djúp AÐEINS úr gátuðum endapunkti. Öll gögn OPINBER (Hagstofu-aggregöt + opinber félaga-nöfn/veltur úr ársreikningaskrá) — **engin PII, engin leyfisskylda** (ekki lánshæfismat/vanskilaskrá). Áberandi fyrirvari á báðum lögum: „Leiðbeinandi yfirlit úr opinberum ársreikningum og Hagstofu; þekja = X% félaga greinarinnar með skráða veltu; ekki fjárfestingar- eða lánshæfisráðgjöf."

## 6. Villumeðferð

- SSG: deild vantar viðmið → sleppa síðu (`getStaticPaths` síar). `sector_kpi.json` er alltaf til (build_sector).
- Worker: `!env.TENGSL` → `{ok:false,error:'unconfigured'}`; gate-höfnun HTTP 200 + `{ok:false,error:'tier'}`; D1 með `.catch(()=>({results:[]}))`; tóm röðun → `coverage:0` + skýr skilaboð, ekki villa.
- Client: fetch-villa → sýnir „djúp-skýrsla ófáanleg núna", frí-yfirlitið stendur.

## 7. Prófun (grænt hlið)

- `node --test web/src/lib/atvinnugrein.test.mjs`: `herfindahl` (þekkt dæmi), `toppNShare`, `vsHeild` (yfir/undir/jafnt), `slugify` (einkvæmni + ÍSAT-strípun), `RATIO_META`-röðun.
- `node --check web/worker.js`.
- `cd web && npx astro build` (~3582 + ~82 nýjar síður).
- Live: `/atvinnugreinar/<slug>/` opið + rendrar viðmið; `/api/atvinnugrein?isat=` gátað (Fyrirtæki+/admin session → röðun; óinnskráð → `{ok:false,error:'login/tier'}`).

## 8. Utan v1 (fast-follows)

Þitt-félag-vs-grein (kt → þín viðmið vs sector); vöxtur/þróun milli ára (`fj.ar` fjöl-ára); 3-stafa undirdeildir; greina-viðvörun/vöktun; standalone-verð (v1 = innifalið í Fyrirtæki+); export .csv/.json af yfirlitinu.

## 9. Skrár

- **Ný:** `web/src/lib/atvinnugrein.mjs`, `web/src/lib/atvinnugrein.test.mjs`, `web/src/pages/atvinnugreinar/index.astro`, `web/src/pages/atvinnugreinar/[slug].astro`.
- **Breytt:** `web/worker.js` (`atvinnugreinHandler` + `_atvinnuGate` + `/api/atvinnugrein` route), sitemap-viðbót, nav/`karp-pro`-skráning.
- ⚠ Samhliða-session breytir `web/worker.js` → **hunk-stöguð git-add** (aldrei `git add web/worker.js`/`-A`); aðrar skrár berur `git add <slóð>`.
