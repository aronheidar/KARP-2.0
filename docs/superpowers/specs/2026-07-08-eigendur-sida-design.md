# Hönnun: Sjálfstæð `/eigendur/`-síða — Endanlegir eigendur (UBO)

Dags. 2026-07-08 · Grein: `claude/upbeat-newton-0017a5` · KARP.is

## 1. Markmið

Búa til sjálfstæða síðu **`/eigendur/`** (`web/src/pages/eigendur.astro`) fyrir
„Endanlegir eigendur“-skýrsluna, undir **Fyrirtækjaskrá (Karp+)**, með eigin
fyrirtækjaleit. Þetta er UMGJÖRÐIN — sjálf UBO-varan (vél, eignarhaldsnet, töflur,
sölugátun) er ÞEGAR BYGGÐ og í loftinu inni á `/fyrirtaeki/` (LOTA 111, deploy
`264e902`). Við **endurnýtum** þá vél; við **endurskrifum hana ekki**.

Síðan gefur okkur (a) markaðshæfan áfangastað + opið sýnishorn til að deila, og
(b) hreina slóð `/eigendur/?q=<kt>` sem `/fyrirtaeki/` getur vísað á.

## 2. Meginregla — ein sameiginleg UBO-eining

DoD krefst „engin tvítekin/rofin UBO-rökvísi“. Þess vegna **færum við UBO-vélina
út í eina sameiginlega einingu** sem BÁÐAR síður kalla í. Ekkert afrit, enginn
annar teiknari sem getur rekið í sundur.

## 3. Skjöl sem breytast / bætast við

| Aðgerð | Skjal | Efni |
|--------|-------|------|
| NÝTT | `web/src/lib/ubo-report.js` | Öll UBO-rökvísi (gögn, net, töflur, sölugátun, poll) sem einingaföll |
| NÝTT | `web/src/styles/ubo.css` | `.eig-*` (+ leitar-`.fs-*` undirmengi) global-stílar, deilt |
| NÝTT | `web/src/pages/eigendur.astro` | Sjálfstæða síðan (haus, leit, skýrsla, sýnishorn) |
| BREYTT | `web/src/pages/fyrirtaeki.astro` | Fjarlægja inline UBO-rökvísi → kalla í eininguna; bæta við „Sjá fulla eigendaskýrslu →“ hlekk |
| BREYTT | `web/src/layouts/Layout.astro` | Nav-tengill „Endanlegir eigendur“ í Karp+ hópinn |
| ÓBREYTT | `web/worker.js` | `/api/eigendur/request`, `kind=eigendur` (990 kr), `hasReport('eigendur:'+kt)` |
| ÓBREYTT | `web/public/gogn/eigendur/*.json`, `skriptur/build_eigendur.mjs`, `lib/ubo.mjs`, `lib/rsk.mjs` | Gagnaveita á-eftirspurn |

## 4. Sameiginleg eining — `web/src/lib/ubo-report.js`

Flytja UBO-föllin úr `fyrirtaeki.astro` (`eigData`, `eigWireNet`, `eigMount`,
`eigTable`, `eigRaunv`, `eigHluthafar`, `eigPie`, `eigLegend`, `eigSources`,
`eigPctFmt` ~l. 676–814, ásamt sölu-/poll-rökvísi ~l. 1162–1177 og sýnishorns­
lestri ~l. 1371–1391). Einingin flytur sjálf inn það sem hún þarf úr
`./auth.js` (`hasReport`, `isAdmin`, `karpCheckout`).

Opinbert API (það sem síðurnar kalla í):

```js
// Heildar-flæði fyrir eitt félag: gátun → (kaup|sótt+poll) → teikna net + töflur.
// Sér um: hasReport('eigendur:'+kt)/isAdmin → ef á: sækja /gogn/eigendur/<kt>.json
//   (+ POST /api/eigendur/request + poll ef 404) → eigMount; annars 990 kr CTA →
//   karpCheckout({kind:'eigendur'}) → poll → eigMount.
export function mountUboReport({ kt, nafn, hostEl, navTo });

// Opið sýnishorn (án innskráningar): les _synishorn.json → teiknar í hostEl.
export function renderUboSample(hostEl, { navTo } = {});
```

- **`navTo(kt)`** er injectað af hverri síðu: smellur á hnút með kt kallar í
  `navTo` svo `/eigendur/` flettir innan `/eigendur/` og `/fyrirtaeki/` innan
  `/fyrirtaeki/`. Innri teiknarar (`eigWireNet` o.fl.) verða einingar-prívöt.
- Hjálparföll sem eru síðu-staðbundin í dag (t.d. `escF`) flytjast með í eininguna
  eða í sameiginlegt util; við aflækjum þau frá `fyrirtaeki.astro` við útdráttinn.

## 5. Sameiginlegt CSS — `web/src/styles/ubo.css`

Færa `.eig-*` skýrslu-stílana (og það `.fs-*` leitarbox/hit undirmengi sem
`/eigendur/` þarf) hingað. Báðar síður gera `import '../styles/ubo.css'` í
frontmatter. Stílarnir eru þegar `is:global` → hegðun óbreytt. Restin af `.fs-*`
(full fyrirtækjaspjald) verður áfram í `fyrirtaeki.astro`.

## 6. Ný síða — `web/src/pages/eigendur.astro`

Notar `Layout.astro`, `import`-ar `ubo-report.js` + `ubo.css`.

**Hlutar:**
1. **Haus/kynning** (íslenska): hvað skýrslan sýnir — endanlega eigendur,
   litakóðað eignarhaldsnet, skráða hluthafa, heimildir (Creditinfo-jafngildi).
   Hlekkur á opið sýnishorn `/eigendur/?syni=1`.
2. **Fyrirtækjaleit + autocomplete** — endurnýtir `/api/fyrirtaeki?q=` mynstrið
   (nafn eða kt), sama og `/fyrirtaeki/`. Val á félagi (kt) →
   `mountUboReport({ kt, nafn, hostEl, navTo })`.
3. **Skýrsluhýsill** (`hostEl`): net + 4 töflur + gátt/kaup/poll birtast hér.

**Slóðabreytur:**
- `?syni=1` → `renderUboSample(hostEl)` — opið sýnishorn, engin innskráning.
- `?q=<kt>` → forhleður og sýnir það félag (áfangi hlekksins frá `/fyrirtaeki/`);
  sama gátun (á → skýrsla, annars 990 kr CTA).

**Ástand:** tómt (leitarhvatning) · hleður · skýrsla (á/keypt) · CTA (ekki keypt)
· „ekki tókst að byggja net“ · „í vinnslu“ (poll). Öll ástönd koma úr einingunni.

## 7. `/fyrirtaeki/` breytingar

- Fjarlægja inline UBO-rökvísina; `fsKort`/host-svæðið kallar nú í
  `mountUboReport({ kt, nafn, hostEl, navTo })` úr einingunni. **Hegðun óbreytt.**
- Bæta við hlekk **„Sjá fulla eigendaskýrslu →“** → `/eigendur/?q=<kt>` við
  UBO-hlutann.
- Sýnishorns-hlekkur CTA vísar á `/eigendur/?syni=1` (nýi kanónski demo-inn);
  gamla slóðin `/fyrirtaeki/?eigendur-syni=1` heldur áfram að virka (kallar í sama
  `renderUboSample`) svo eldri hlekkir brotni ekki.

## 8. Nav — `Layout.astro`

Bæta `{ href: '/eigendur/', label: 'Endanlegir eigendur' }` í Karp+ hópinn
(`NAV`, ~l. 10–19) beint á eftir `/fyrirtaeki/`. Virkt-nav merking virkar
sjálfkrafa (`updateActiveNav`).

## 9. Worker & sölugátun — óbreytt

`/api/eigendur/request` (dispatchar `eigendur.yml` GH Action), `kind=eigendur`
@ 990 kr (`PRICE_EIGENDUR`), `hasReport('eigendur:'+kt)`, `window.print()` PDF.
Ekkert efni lekið óvarið — sama líkan og `/fyrirtaeki/`.

## 10. Lagalegt / persónuvernd — óbreytt frá UBO

Aðeins opinber gögn. Einstaklingar eins og RSK/ársreikn. birta (nafn + fæðingarár;
kt aðeins úr opinberum ársreikninga-hluthafalista). Tengsl merkt „skráð/möguleg“;
kt-takmörkun merkt heiðarlega. Ekkert lánshæfismat/vanskil. Heimildaklausa fylgir.
RSK: á-eftirspurn (worker dispatch), aldrei batch, 24h cache. Klausurnar færast
orðrétt með úr núverandi UBO-hluta.

## 11. Prófun / DoD

- `cd web && npx astro build` grænt → **198 síður** (197 núna + `/eigendur/`).
- `node --check web/worker.js` (óbreytt en staðfest).
- Preview: raunfélag `6407070540` (Marel Iceland ehf. — raunverulegir eigendur)
  + `?syni=1` (Gervifyrirtæki, 3-laga net). Staðfesta: net + töflur teiknast,
  nav-tengill virkur, gátun (CTA fyrir óinnskráðan/ókeyptan, skýrsla fyrir admin).
- `/fyrirtaeki/` óbrotið: UBO-hluti virkar áfram + nýr hlekkur birtist.
- Þekkt umhverfis-takmörkun (minni): headless preview skilar engum resize-atburðum
  og skjámyndir geta fallið á tíma → sannreyni build/uppbyggingu + gátun með
  texta-verkfærum (`snapshot`/`inspect`), reyni skjámynd, en móttækilega
  net-endurteikninguna má e.t.v. ekki skjámynda headless.

## 12. Áhætta & mildun

- **Að brjóta lifandi `/fyrirtaeki/`** við útdrátt → mildun: útdráttur án
  hegðunarbreytingar, `git diff` yfirferð, build + preview á `/fyrirtaeki/`.
- **Síðu-staðbundin hjálparföll flækt inn í UBO-föllin** → flytja/injecta þau
  hreint (`navTo`, `escF`); ekkert `FS_USER`/global-ástand lekur inn í eininguna.
- **Astro bundlar `import` í inline `<script>`** — þegar notað (`auth.js`), svo
  einingar-innflutningur er staðfest mynstur.

## Non-goals (YAGNI)

- Engin ný gagnaveita/scraper (byggð og í loftinu).
- Engin worker-breyting.
- Ekki gera `/eigendur/` að kanónskum og þynna `/fyrirtaeki/` (valið: halda báðum).
