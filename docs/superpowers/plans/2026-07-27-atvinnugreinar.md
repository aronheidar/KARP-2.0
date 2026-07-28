# Atvinnugreina-skýrslur v1 — útfærsluáætlun

> **Fyrir agentic-verkamenn:** NAUÐSYNLEG UNDIR-SKILL: superpowers:subagent-driven-development. Ferskur subagent per verk + rýni. Skref nota `- [ ]`.

**Markmið:** Per ÍSAT-deild (~82): frí SEO-grein-yfirlitssíða (fjárhags-viðmið vs hagkerfið) + gátuð Fyrirtæki+ djúp-skýrsla (röðuð stærstu félög + samþjöppun + PDF).

**Arkitektúr:** Frí SSG úr bakaðri `sector_kpi.json`; gátuð djúp úr worker-endapunkti sem les D1 (`felog`+`fjarhagur`) LIFANDI. Hrein `atvinnugrein.mjs` deilt. Spec: `docs/superpowers/specs/2026-07-27-atvinnugreinar-design.md`.

**Tæknistafli:** Astro SSG + Cloudflare Worker (D1 `env.TENGSL`) + node:test.

## Global Constraints (öll verk)

- **Sameiginlegur worktree — samhliða session breytir `web/worker.js`:** verk sem snertir worker.js STAGE-ar AÐEINS sína hunka (`git apply --cached` af eigin diff, staðfest ENGIN `nemandi`/`gameUser`/óskyld lína), ALDREI `git add web/worker.js`/`-A`. Önnur skrár: berur `git add <slóð>`. Committa STRAX, EKKI pusha (orchestrator pushar).
- **KARP-venjur:** worker-villur = HTTP 200 + `{ok:false,error}` (`_ajson`); D1 með `.catch(()=>({results:[]}))`; gátt speglar `_kycGate`/`_freeAll`.
- **Data (staðfest):** `sector_kpi.json` `map["<2-stafa>"]` = {label,+8 viðmið}, `heild`. D1: `SELECT f.kt,f.nafn,fj.sala,fj.hagnadur,fj.eignir,fj.eigid_fe FROM felog f JOIN fjarhagur fj ON fj.kt=f.kt WHERE substr(f.isat_primary,1,2)=? AND fj.sala IS NOT NULL ORDER BY fj.sala DESC LIMIT 100`.
- **Grænt hlið (per verk):** `node --test <test>` · `node --check web/worker.js` (á COMMITTUÐU blob-inu ef hunk-stagað) · `cd web && npx astro build`.
- **Fyrirvari (báðum lögum):** „Leiðbeinandi úr opinberum ársreikningum + Hagstofu; þekja X%; ekki fjárfestingar-/lánshæfisráðgjöf."

---

### Task 1: Hrein rökvél `atvinnugrein.mjs` + próf

**Files:** Create `web/src/lib/atvinnugrein.mjs`, `web/src/lib/atvinnugrein.test.mjs`.

**Produces (samningur):**
- `export function slugify(label)` → slug: lágstafa, strípa „(ÍSAT nr. …)"-svigann, íslenska→ascii (þ→th,æ→ae,ö→o,á→a…), bil→'-', einkvæmt. T.d. „Matvælaframleiðsla, án fiskvinnslu (ÍSAT nr. 10, án 102)" → `matvaelaframleidsla-an-fiskvinnslu`.
- `export function vsHeild(val, heildVal)` → `{ pct: Math.round((val/heildVal-1)*100), dir: pct>2?'yfir':pct<-2?'undir':'jafnt' }` (verja 0/NaN).
- `export function herfindahl(salaArr)` → HHI 0–10000: Σ(hlutdeild%²) úr veltu-fylki (sleppa ≤0; [] → 0).
- `export function toppNShare(felog, n)` → % (0–100) samanlagðrar veltu topp-N / heildarveltu (raðar eftir sala fyrst; verja tómt).
- `export function fmtKr(x)` (t.d. „4.850 m.kr" / „1,2 ma.kr"), `export function fmtRatio(x)` (% eða margfeldi).
- `export const RATIO_META` = `{ framlegd:{heiti:'Framlegð',fmt:'pct',betra:'haerra'}, hagnadarhlutfall:{...}, ebit_hlutfall:{...}, eiginfjarhlutfall:{...}, skuldahlutfall_DE:{heiti:'Skuldir/eigið fé',fmt:'num',betra:'laegra'}, eignavelta:{...,fmt:'num'}, launahlutfall:{...,betra:'laegra'}, tekjur_pr_starfsm_mkr:{heiti:'Tekjur/starfsm.',fmt:'kr',betra:'haerra'} }` (öll 8 viðmiðin, röð).

- [ ] Skref 1 — próf fyrst (node:test): `herfindahl([50,50])`≈5000, `[100]`=10000, `[]`=0; `toppNShare` (topp-3 af þekktu); `vsHeild` (yfir/undir/jafnt + 0-vörn); `slugify` (ÍSAT-strípun + ascii + einkvæmni tveggja svipaðra); `RATIO_META` hefur 8 lykla.
- [ ] Skref 2 — keyra → FAIL. Skref 3 — útfæra. Skref 4 — `cd web && node --test src/lib/atvinnugrein.test.mjs` → grænt.
- [ ] Skref 5 — commit: `git add web/src/lib/atvinnugrein.mjs web/src/lib/atvinnugrein.test.mjs && git commit -m "Atvinnugreinar: hrein rokvel atvinnugrein.mjs + prof"`

---

### Task 2: Worker — `/api/atvinnugrein` (gátuð djúp-gögn) — HUNK-STAGE worker.js

**Files:** Modify `web/worker.js`. Read-first: `topplistarHandler` (~L3037, D1-fyrirspurnin + cache + coverage), `_kycGate`/`_freeAll`/`accountOwner`, `augGet`, route-blokk (~L4532).

**Consumes:** `import { herfindahl, toppNShare, RATIO_META } from './src/lib/atvinnugrein.mjs'`; `sector_kpi.json` (augGet); D1 `felog`+`fjarhagur`. **Produces:** `GET /api/atvinnugrein?isat=<2-stafa>`.

- [ ] Skref 1 — `_atvinnuGate(u,now)` = `!!(u && (_freeAll(u) || (u.tier==='fyrirtaeki_plus' && u.tier_until>now)))`.
- [ ] Skref 2 — `atvinnugreinHandler(request,env,ctx)`: `isat` (2 stafir, validera `/^\d{2}$/`); session→uid→u (SELECT tier/is_admin/free_access/tier_until/parent_account_id); `owner=accountOwner`; `!_atvinnuGate(owner,now)` → `{ok:false,error:'tier'}` (eða `'login'` ef !uid). D1: `substr(f.isat_primary,1,2)=?` bind(isat), ORDER BY fj.sala DESC LIMIT 100 (topplistar-fyrirspurn). Lesa `sector_kpi.json` (augGet) `.map[isat]`+`.heild`. Reikna `samthjoppun={ HHI: herfindahl(sala[]), toppN_hlutdeild: toppNShare(rows,5) }`, `staerd_heild=Σsala`, `topFelog=rows.slice(0,25)`. Skila `{ok:true, isat, label, vidmid, heild, topFelog, samthjoppun, staerd_heild, n:rows.length, coverage}`. Cache 5 mín (`caches.default`, lykill per isat+entitled). D1 tómt → `topFelog:[],coverage:0` (ekki villa).
- [ ] Skref 3 — route: `if (url.pathname==='/api/atvinnugrein') return atvinnugreinHandler(request,env,ctx);` hjá hinum `/api/*`.
- [ ] Skref 4 — verify: `node --check` á COMMITTUÐU worker.js-blob (`git show <sha>:web/worker.js > /tmp/w.js && node --check /tmp/w.js`). **HUNK-STAGE** (aðeins þínir hunkar) + commit: „Atvinnugreinar: /api/atvinnugrein (gatuð djup-gogn ur D1)".

---

### Task 3: Síður — hub + `[slug].astro` (frí SSG + client djúp)

**Files:** Create `web/src/pages/atvinnugreinar/index.astro`, `web/src/pages/atvinnugreinar/[slug].astro`. Read-first: `leyfi.astro` (SSG úr JSON-import + `is:global`-CSS + client-fetch-mynstur), `areidanleikavaktin.astro` (Fyrirtæki+ `hasTier`-hegðun + `esc`), `report-nav.js` (PDF-stika).

**Consumes:** `import SK from '../../public/gogn/sector_kpi.json'` (SSG); `import { slugify, vsHeild, RATIO_META, fmtKr, fmtRatio, herfindahl, toppNShare } from '../../lib/atvinnugrein.mjs'`; `GET /api/atvinnugrein?isat=`.

- [ ] Skref 1 — `[slug].astro` `getStaticPaths`: úr `SK.map` → ein síða per deild `{ params:{slug:slugify(label)}, props:{ isat, kpi, heild } }`.
- [ ] Skref 2 — **frí SSG-yfirlit** (opið): grein-heiti/lýsing, 8 viðmið vs `heild` (súlur + `vsHeild`-túlkun úr `RATIO_META`), SEO-inngangur, `<Layout title/description>` per deild, Dataset JSON-LD, **CTA** á djúp („Sjá stærstu félög + samþjöppun — Fyrirtæki+"). Fyrirvari.
- [ ] Skref 3 — **client djúp** (ef `hasTier('fyrirtaeki_plus')` úr auth.js): `fetch('/api/atvinnugrein?isat='+isat)` → rendra röðaða félaga-töflu (nafn→/fyrirtaeki/?q=kt, sala/hagnaður/eignir), samþjöppun (HHI+topp-N), full viðmið+túlkun. `esc()` á öllu. Setja report-nav.js PDF-stiku.
- [ ] Skref 4 — `index.astro` hub: listi allra deilda (nafn + 1 viðmið + hlekkur).
- [ ] Skref 5 — verify `cd web && npx astro build` (~3582 + 82). Commit: `git add web/src/pages/atvinnugreinar/index.astro web/src/pages/atvinnugreinar/[slug].astro && git commit -m "Atvinnugreinar: hub + [slug] (fri SSG + gatuð djup-skyrsla)"`

---

### Task 4: SEO + nav + loka-verify + deploy

**Files:** Modify sitemap-gen (finna sitemap-fyrirtaeki-mynstrið), nav/`karp-pro`-skráning (ef vörur eru listaðar).

- [ ] Skref 1 — bæta `/atvinnugreinar/`+per-deild í sitemap. Nav/karp-pro tengill (spegla áreiðanleikavaktin/Lobbývakt ef listað).
- [ ] Skref 2 — full grænt hlið: `node --test atvinnugrein.test.mjs` · `node --check web/worker.js` · `astro build`.
- [ ] Skref 3 — handoff: deploy (push), live-verify `/atvinnugreinar/<slug>/` opið + `/api/atvinnugrein?isat=` gátað.

## Self-review

Spec-þekja: rökvél(T1)·gátuð djúp(T2)·frí SSG+client djúp(T3)·SEO/nav(T4)·prófun(T1,T4)·gating(T2)·fyrirvari(T2,T3) — allt dekkað. Viðmót samræmd (`herfindahl`/`toppNShare`/`RATIO_META`/`vsHeild` skilgreind T1, notuð T2+T3). Engir placeholders. T2 einn á worker.js (hunk-stage). D1-fyrirspurn = staðfest topplistar-mynstur.
