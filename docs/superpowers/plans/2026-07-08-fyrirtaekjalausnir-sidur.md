# Fyrirtækjalausnir — vöru- & verðsíður (Verk A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build open marketing/pricing pages for KARP's Creditinfo-competing products — a rebuilt `/karp-pro/` hub with a 3-tier pricing table, and 7 open landing pages under `/lausnir/` — plus a "Fyrirtækjalausnir" nav group, without touching the working tool pages' functionality.

**Architecture:** Data-driven Astro. One data module (`lausnir.js`) is the single source of truth for the 3 subscription tiers and the 7 products. One reusable component (`Lausn.astro`) renders every landing; one dynamic route (`lausnir/[slug].astro`) generates all 7 pages via `getStaticPaths`. One `VerdTafla.astro` component renders the tier table on the hub. Tool pages keep 100% of their search/report/gate/buy logic — only top-of-page marketing prose is trimmed (final phase).

**Tech Stack:** Astro SSG (static output), Cloudflare Pages/Worker deploy via `git push origin main`. Vanilla JS in `<script>` blocks. No new dependencies.

## Global Constraints

- **Design system (verbatim):** dark background `#0b0f17` / card `#101623`, gold accent `#f6b13b`, body text `#cdd6e6`, heading text `#eaf1fb`, muted `#8fa0b8` / `#7e8ca6`. Match existing pages (`fyrirtaeki.astro`, `eigendur.astro`).
- **Layout props:** `<Layout title description canonical ogTitle ogType ogImage jsonLd noindex>` — from `web/src/layouts/Layout.astro`.
- **Open pages:** all `/lausnir/` pages and `/karp-pro/` are ungated (no `loadUser` gate, no paywall) — they are top-of-funnel marketing. Personal data is NEVER rendered on these pages.
- **Legal line (verbatim, on every landing + hub):** "Byggt á opinberum gögnum — hvorki lánshæfismat né vanskilaskrá."
- **Payments:** one-off reports use existing `karpCheckout({ kind, ref, key })` (Teya, live). Subscription-tier CTAs call `karpSubscribeTier(tier)` — a placeholder that shows a "coming soon / register interest" message (Verk B wires it to Áskell). Build NOTHING that half-charges.
- **Tool functionality is untouched:** never remove or alter search forms, report rendering, `?q=`/`?syni=` handling, gates (`fsGate`/`fv-gate`/`subGate`), or buy CTAs on tool pages. Slimming removes ONLY intro marketing prose.
- **Verification (no pytest in this repo):** each task is verified by `npm run build` succeeding (from `web/`), `node --check` on any changed/new `.js`, and preview render checks. "Test" steps below mean exactly this.
- **Icelandic UI copy** throughout.
- **Commit after each task.** Work happens on a feature branch/worktree (created at execution start), merged by Aron.

---

## File Structure

**Create:**
- `web/src/data/lausnir.js` — single source of truth: `THREP` (3 tiers + feature matrix) + `VORUR` (7 products with all copy).
- `web/src/components/Lausn.astro` — reusable landing layout (takes one product object).
- `web/src/components/VerdTafla.astro` — 3-tier comparison table (reads `THREP`).
- `web/src/pages/lausnir/[slug].astro` — dynamic route; `getStaticPaths` over `VORUR` → 7 landing pages.
- `web/src/styles/lausn.css` — shared classes for landing + hub + table (imported globally).

**Modify:**
- `web/src/pages/karp-pro.astro` — replace redirect stub with the hub.
- `web/src/layouts/Layout.astro:9-20` — add "Fyrirtækjalausnir" nav group; slim "Karp+" group.
- `web/src/lib/auth.js` — add `karpSubscribeTier(tier)` (placeholder).
- `web/src/pages/fyrirtaeki.astro:19`, `eigendur.astro:16`, `fasteignavakt.astro`, `frettir.astro`, `utbod.astro` — trim intro marketing prose (final phase; keep everything functional).

---

## Task 1: Data module — tiers + products (single source of truth)

**Files:**
- Create: `web/src/data/lausnir.js`

**Interfaces:**
- Produces: `export const THREP` (array of 3 tier objects), `export const EIGINDIR` (feature-matrix rows), `export const VORUR` (array of 7 product objects). Consumed by Tasks 2–5.

Product object shape (used by `Lausn.astro`):
```
{ slug, heiti, emoji, gildisloford, inngangur,
  eiginleikar:[{emoji,titill,texti}], skref:[{titill,texti}],
  verd:{tegund:'stak'|'threp', upphaed?, threp?}, synishorn?:{label,href},
  tol:{label,href}, description }
```

- [ ] **Step 1: Create the data module**

```javascript
// web/src/data/lausnir.js — Fyrirtækjalausnir: ein sannleiksuppspretta (þrep + vörur).
export const THREP = [
  { slug: 'grunnur', heiti: 'Grunnur', verd: 2900, adgangar: 2, cta: 'Velja Grunn' },
  { slug: 'fyrirtaeki', heiti: 'Fyrirtæki', verd: 6900, adgangar: 5, cta: 'Velja Fyrirtæki', vinsaelt: true },
  { slug: 'fyrirtaeki_plus', heiti: 'Fyrirtæki+', verd: 12900, adgangar: 15, cta: 'Velja Fyrirtæki+' },
];

// Fylkis-raðir: gildi per þrep [grunnur, fyrirtaeki, fyrirtaeki_plus]. true/false/strengur.
export const EIGINDIR = [
  { titill: 'Fjöldi aðganga', gildi: ['2', '5', '15'] },
  { titill: 'Fyrirtækjaskrá + ársreikningar', gildi: [true, true, true] },
  { titill: 'Endanlegir eigendur (UBO) + eignarhald', gildi: [true, true, true] },
  { titill: 'Áreiðanleikamat (KYC)', gildi: [true, true, true] },
  { titill: 'Verðmat fasteigna', gildi: [true, true, true] },
  { titill: 'Fyrirtækjavaktin (fylgja félögum)', gildi: ['10 félög', '50 félög', 'ótakmarkað'] },
  { titill: 'Viðskiptamannavakt (kt-vöktun)', gildi: [false, '25 kt', '100 kt'] },
  { titill: 'Fjölmiðlavakt', gildi: [false, true, true] },
  { titill: 'Opnar vaktir (útboð, styrkir, Lögbirting, vörumerki, skip…)', gildi: [true, true, true] },
  { titill: 'Stakar skýrslur innifaldar', gildi: ['—', '5/mán', '20/mán'] },
  { titill: 'Lánshæfismat · Vanskilaskrá', gildi: ['Bjóðum ekki', 'Bjóðum ekki', 'Bjóðum ekki'], neikvaett: true },
];

const LEGAL = 'Byggt á opinberum gögnum — hvorki lánshæfismat né vanskilaskrá.';

export const VORUR = [
  {
    slug: 'fyrirtaekjaskyrsla', heiti: 'Fyrirtækjaskýrsla', emoji: '🏢',
    gildisloford: 'Full mynd af hvaða íslensku félagi sem er — á augabragði.',
    inngangur: 'Fyrirtækjaskýrsla Karps safnar öllu sem opinberar skrár segja um félag á einn stað: grunnskrá, ársreikninga, greiðslur frá ríkinu, útboð, umfjöllun og lögbirtingar.',
    eiginleikar: [
      { emoji: '🧾', titill: 'Grunnskrá', texti: 'Kennitala, heimilisfang, rekstrarform, ÍSAT-atvinnugrein, VSK-númer og skil ársreikninga.' },
      { emoji: '📊', titill: 'Ársreikninga-KPI', texti: 'Framlegð, ROE/ROA, eiginfjárhlutfall, tekjuvöxtur — fjölár, beint úr ársreikningaskrá.' },
      { emoji: '💰', titill: 'Greiðslur frá ríkinu', texti: 'Samsvörun við opinberar greiðslur og stærstu birgja ríkisins.' },
      { emoji: '📋', titill: 'Útboð & umfjöllun', texti: 'Opinber innkaup félagsins og öll fjölmiðlaumfjöllun tengd því.' },
      { emoji: '🔔', titill: 'Tilkynningar', texti: 'Lögbirtingablaðið, ný vörumerki og opinberir styrkir — vaktað sjálfvirkt.' },
    ],
    skref: [
      { titill: 'Leitaðu', texti: 'Sláðu inn nafn félags eða kennitölu.' },
      { titill: 'Fáðu skýrsluna', texti: 'Full skýrsla á sekúndum — prentvæn PDF.' },
    ],
    verd: { tegund: 'stak', upphaed: 990 },
    synishorn: { label: 'Sjá sýnishorn', href: '/fyrirtaeki/?q=490522-0500' },
    tol: { label: 'Fletta upp félagi', href: '/fyrirtaeki/' },
    description: 'Fyrirtækjaskýrsla Karps — grunnskrá, ársreikninga-KPI, greiðslur frá ríkinu, útboð og umfjöllun um hvaða íslenskt félag sem er. ' + LEGAL,
  },
  {
    slug: 'eigendur', heiti: 'Endanlegir eigendur', emoji: '🔗',
    gildisloford: 'Sjáðu hverjir raunverulega eiga félagið — gegnum allar keðjur.',
    inngangur: 'Eignarhaldsskýrsla sem rekur eignarhald gegnum allar félagakeðjur og sýnir endanlega eigendur, raunverulega eigendur skv. Skattinum og skráða hluthafa.',
    eiginleikar: [
      { emoji: '🕸️', titill: 'Eignarhaldsnet', texti: 'Litakóðað net sem sýnir alla eigendur og eignatengsl gegnum keðjur.' },
      { emoji: '👤', titill: 'Endanlegir eigendur', texti: 'Reiknað eignarhald hvers aðila gegnum allar félagakeðjur.' },
      { emoji: '🏛️', titill: 'Raunverulegir eigendur', texti: 'Skráðir raunverulegir eigendur (>25%) beint frá Skattinum.' },
      { emoji: '📄', titill: 'Hluthafalisti + PDF', texti: 'Skráðir hluthafar úr ársreikningi og prentvæn skýrsla.' },
    ],
    skref: [
      { titill: 'Leitaðu', texti: 'Sláðu inn félag.' },
      { titill: 'Skoðaðu netið', texti: 'Eignarhaldsnet + töflur + PDF.' },
    ],
    verd: { tegund: 'stak', upphaed: 990 },
    synishorn: { label: 'Sjá sýnishorn', href: '/eigendur/?syni=1' },
    tol: { label: 'Fletta upp félagi', href: '/eigendur/' },
    description: 'Endanlegir eigendur — litakóðað eignarhaldsnet gegnum allar félagakeðjur, raunverulegir eigendur og hluthafar. ' + LEGAL,
  },
  {
    slug: 'fasteignamat', heiti: 'Fasteignamat', emoji: '🏠',
    gildisloford: 'Faglegt verðmat hvaða fasteignar sem er — byggt á sölusögu.',
    inngangur: 'Verðmatsskýrsla sem safnar sölusögu, fasteigna- og brunabótamati, hverfagögnum og verðþróun á einn stað og skilar faglegu mati á augabragði.',
    eiginleikar: [
      { emoji: '📈', titill: 'Sölusaga & verðþróun', texti: 'Öll þinglýst kaup eignarinnar og þróun fermetraverðs yfir tíma.' },
      { emoji: '🏷️', titill: 'Fasteigna- & brunabótamat', texti: 'Opinbert mat borið saman við metið markaðsverð.' },
      { emoji: '🗺️', titill: 'Hverfagögn & kort', texti: 'Staðsetning, hverfi og nágrenni á gagnvirku korti + götumynd.' },
      { emoji: '🏘️', titill: 'Sambærilegar eignir', texti: 'Matið unnið á sambærilegum eignum í nágrenninu.' },
    ],
    skref: [
      { titill: 'Sláðu inn heimilisfang', texti: 'Byrjaðu að skrifa — sjálfvirk uppfletting.' },
      { titill: 'Fáðu matið', texti: 'Verðmat + kort + graf + sambærilegar eignir.' },
    ],
    verd: { tegund: 'stak', upphaed: 990 },
    synishorn: { label: 'Sjá sýnishorn', href: '/fasteignavakt/?syni=1' },
    tol: { label: 'Verðmeta eign', href: '/fasteignavakt/' },
    description: 'Faglegt verðmat fasteigna — sölusaga, fasteigna- og brunabótamat, hverfagögn, kort og sambærilegar eignir. ' + LEGAL,
  },
  {
    slug: 'fyrirtaekjavaktin', heiti: 'Fyrirtækjavaktin', emoji: '📡',
    gildisloford: 'Fylgstu með félögum sem skipta þig máli — sjálfvirkar tilkynningar.',
    inngangur: 'Fylgdu félögum og fáðu tilkynningu um leið og eitthvað breytist: nýr ársreikningur, breytt eignarhald, lögbirting eða umfjöllun.',
    eiginleikar: [
      { emoji: '⭐', titill: 'Fylgja félögum', texti: 'Bættu félögum í vaktina þína og fáðu breytingar beint.' },
      { emoji: '🔔', titill: 'Breytingavakt', texti: 'Ársreikningar, eigendur, lögbirtingar og tilkynningar — sjálfvirkt.' },
      { emoji: '👥', titill: 'Viðskiptamannavakt', texti: 'Vaktaðu heilan lista af kennitölum viðskiptavina í einu.' },
      { emoji: '📬', titill: 'Vikulegt yfirlit', texti: 'Samantekt á tölvupósti yfir allt sem gerðist.' },
    ],
    skref: [
      { titill: 'Veldu félög', texti: 'Fylgdu félögum af prófílsíðu þeirra.' },
      { titill: 'Fáðu tilkynningar', texti: 'Breytingar birtast á Mitt svæði + í pósti.' },
    ],
    verd: { tegund: 'threp', threp: 'Grunnur' },
    tol: { label: 'Opna Mitt svæði', href: '/mitt-svaedi/' },
    description: 'Fyrirtækjavaktin — fylgstu með félögum og fáðu sjálfvirkar tilkynningar um ársreikninga, eigendur og lögbirtingar. ' + LEGAL,
  },
  {
    slug: 'fjolmidlavakt', heiti: 'Fjölmiðlavakt', emoji: '📰',
    gildisloford: 'Öll umfjöllun um fyrirtæki og fólk — á einum straumi.',
    inngangur: 'Fjölmiðlavakt Karps safnar umfjöllun úr tugum íslenskra miðla og lætur þig vita þegar fjallað er um það sem þú vaktar.',
    eiginleikar: [
      { emoji: '📡', titill: '35+ miðlar', texti: 'Samfelldur straumur úr öllum helstu íslensku fréttamiðlum.' },
      { emoji: '🔎', titill: 'Leitarorðavakt', texti: 'Vaktaðu fyrirtæki, fólk eða málefni og fáðu tilkynningar.' },
      { emoji: '📊', titill: 'Greining & þróun', texti: 'Fjölmiðlavog og þróun umfjöllunar yfir tíma.' },
    ],
    skref: [
      { titill: 'Veldu leitarorð', texti: 'Bættu við því sem þú vilt fylgjast með.' },
      { titill: 'Fylgstu með', texti: 'Umfjöllun birtist jafnóðum + tilkynningar.' },
    ],
    verd: { tegund: 'threp', threp: 'Fyrirtæki' },
    synishorn: { label: 'Skoða vöktun', href: '/frettir/' },
    tol: { label: 'Opna Vöktun', href: '/frettir/' },
    description: 'Fjölmiðlavakt — öll umfjöllun um fyrirtæki og fólk úr 35+ íslenskum miðlum, með leitarorðavakt og greiningu. ' + LEGAL,
  },
  {
    slug: 'utbodsvaktin', heiti: 'Útboðsvaktin', emoji: '📋',
    gildisloford: 'Ekki missa af opinberu útboði — leitað og vaktað fyrir þig.',
    inngangur: 'Útboðsvaktin safnar öllum opinberum útboðum á einn stað, með leitarorðavakt og samkeppnisgreiningu.',
    eiginleikar: [
      { emoji: '📋', titill: 'Öll opinber útboð', texti: 'Samfelldur listi yfir opinber innkaup og útboð.' },
      { emoji: '🔔', titill: 'Leitarorðavakt', texti: 'Fáðu tilkynningu þegar útboð passar við þín leitarorð.' },
      { emoji: '🏁', titill: 'Samkeppnisgreining', texti: 'Sjáðu hverjir vinna útboð og hvernig markaðurinn skiptist.' },
    ],
    skref: [
      { titill: 'Veldu vöktun', texti: 'Bættu við leitarorðum fyrir þinn geira.' },
      { titill: 'Fáðu tilkynningar', texti: 'Ný útboð berast beint til þín.' },
    ],
    verd: { tegund: 'threp', threp: 'Fyrirtæki' },
    synishorn: { label: 'Skoða útboð', href: '/utbod/' },
    tol: { label: 'Opna Útboðsvaktina', href: '/utbod/' },
    description: 'Útboðsvaktin — öll opinber útboð á einum stað með leitarorðavakt og samkeppnisgreiningu. ' + LEGAL,
  },
  {
    slug: 'areidanleikamat', heiti: 'Áreiðanleikamat', emoji: '✅',
    gildisloford: 'KYC-áreiðanleikamat félags — PEP, eignarhald og staða á einum stað.',
    inngangur: 'Áreiðanleikamat tekur saman það sem þarf fyrir áreiðanleikakönnun: raunverulega eigendur, PEP-skimun stjórnenda og stöðu félagsins í opinberum skrám.',
    eiginleikar: [
      { emoji: '🏛️', titill: 'PEP-skimun', texti: 'Skimun stjórnenda og eigenda gegn lista yfir áhrifafólk í stjórnmálum.' },
      { emoji: '🔗', titill: 'Endanlegir eigendur', texti: 'Raunverulegt eignarhald gegnum allar keðjur.' },
      { emoji: '📑', titill: 'Staða í skrám', texti: 'Skil ársreikninga, lögbirtingar og opinber staða félagsins.' },
      { emoji: '⚠️', titill: 'Áhættumerki', texti: 'Samantekt sem dregur fram það sem þarf að skoða nánar.' },
    ],
    skref: [
      { titill: 'Leitaðu', texti: 'Sláðu inn félag.' },
      { titill: 'Fáðu matið', texti: 'PEP + eigendur + staða + áhættumerki.' },
    ],
    verd: { tegund: 'threp', threp: 'Grunnur' },
    synishorn: { label: 'Sjá sýnishorn', href: '/fyrirtaeki/?q=490522-0500' },
    tol: { label: 'Fletta upp félagi', href: '/fyrirtaeki/' },
    description: 'Áreiðanleikamat (KYC) — PEP-skimun, endanlegir eigendur og staða félags í opinberum skrám. ' + LEGAL,
  },
];

export const VARA_BY_SLUG = Object.fromEntries(VORUR.map((v) => [v.slug, v]));
```

- [ ] **Step 2: Verify it parses**

Run (from repo root): `node --check web/src/data/lausnir.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/data/lausnir.js
git commit -m "Fyrirtaekjalausnir: gagnaeining (threp + 7 vorur)"
```

---

## Task 2: Shared styles (`lausn.css`)

**Files:**
- Create: `web/src/styles/lausn.css`

**Interfaces:**
- Produces: CSS classes `.ls-*` (landing) and `.vt-*` (verðtafla) + `.hub-*` (hub). Consumed by Tasks 3, 4, 5. Imported globally so runtime-injected markup is safe.

- [ ] **Step 1: Create the stylesheet**

```css
/* web/src/styles/lausn.css — Fyrirtækjalausnir: landing + verðtafla + hub. Deilt, glóbalt. */
.ls-wrap { max-width: 960px; margin: 0 auto; padding: 40px 20px 72px; }
.ls-kicker { color: #f6b13b; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 6px; }
.ls-hero h1 { font-size: 34px; line-height: 1.1; margin: 0 0 10px; color: #eaf1fb; }
.ls-hero .lead { font-size: 16px; color: #cdd6e6; line-height: 1.6; max-width: 640px; }
.ls-cta-row { display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0 8px; }
.ls-btn { background: #f6b13b; color: #101623; border: 0; border-radius: 10px; padding: 12px 22px; font-size: 15px; font-weight: 700; text-decoration: none; display: inline-block; cursor: pointer; }
.ls-btn:hover { filter: brightness(1.08); }
.ls-btn.ghost { background: rgba(255,255,255,.06); color: #eaf1fb; border: 1px solid rgba(246,177,59,.35); }
.ls-sec-h { font-size: 20px; color: #f6b13b; margin: 40px 0 14px; }
.ls-feats { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.ls-feat { background: #101623; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 16px; }
.ls-feat .ic { font-size: 22px; } .ls-feat b { display: block; color: #eaf1fb; font-size: 15px; margin: 6px 0 4px; }
.ls-feat span { color: #9fb0c8; font-size: 13px; line-height: 1.5; }
.ls-steps { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
.ls-step { flex: 1; min-width: 200px; background: #101623; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 14px 16px; }
.ls-step .n { color: #f6b13b; font-weight: 800; font-size: 13px; }
.ls-step b { display: block; color: #eaf1fb; margin: 2px 0 4px; } .ls-step span { color: #9fb0c8; font-size: 13px; }
.ls-verd { background: linear-gradient(120deg, rgba(246,177,59,.10), rgba(246,177,59,.04)); border: 1px solid rgba(246,177,59,.35); border-radius: 14px; padding: 22px; margin: 40px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ls-verd .price { font-size: 28px; font-weight: 800; color: #eaf1fb; } .ls-verd .price small { font-size: 13px; color: #8fa0b8; font-weight: 600; }
.ls-foot { color: #7e8ca6; font-size: 11.5px; line-height: 1.55; margin-top: 24px; border-top: 1px solid rgba(255,255,255,.07); padding-top: 12px; }
.ls-wrap a { color: #f6b13b; }

/* Verðtafla */
.vt { width: 100%; border-collapse: collapse; margin: 8px 0 10px; font-size: 13.5px; }
.vt th, .vt td { padding: 10px 12px; text-align: center; border-bottom: 1px solid rgba(255,255,255,.06); }
.vt th:first-child, .vt td:first-child { text-align: left; color: #cdd6e6; }
.vt thead th { vertical-align: bottom; }
.vt .tier-nm { font-size: 16px; font-weight: 800; color: #eaf1fb; }
.vt .tier-pr { font-size: 22px; font-weight: 800; color: #f6b13b; } .vt .tier-pr small { font-size: 11px; color: #8fa0b8; font-weight: 600; display: block; }
.vt .col-hi { background: rgba(246,177,59,.06); }
.vt .yes { color: #6ee7b7; font-weight: 700; } .vt .no { color: #54607a; } .vt .neg { color: #8fa0b8; font-style: italic; font-size: 12px; }
.vt-cta { background: #f6b13b; color: #101623; border: 0; border-radius: 9px; padding: 9px 14px; font-weight: 700; font-size: 13px; cursor: pointer; margin-top: 8px; }
.vt-wrap { overflow-x: auto; }

/* Hub */
.hub-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin: 8px 0 10px; }
.hub-card { background: #101623; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 18px; text-decoration: none; display: block; transition: border-color .15s; }
.hub-card:hover { border-color: rgba(246,177,59,.5); }
.hub-card .e { font-size: 26px; } .hub-card b { display: block; color: #eaf1fb; font-size: 16px; margin: 8px 0 4px; }
.hub-card span { color: #9fb0c8; font-size: 13px; line-height: 1.5; }
.hub-cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 10px 0; }
.hub-cmp .col { background: #101623; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 18px; }
.hub-cmp .col.karp { border-color: rgba(246,177,59,.4); }
.hub-cmp h4 { margin: 0 0 10px; color: #eaf1fb; } .hub-cmp ul { margin: 0; padding-left: 18px; color: #cdd6e6; font-size: 13.5px; line-height: 1.7; }
@media (max-width: 560px) { .hub-cmp { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Verify** — this is imported and checked by the build in Task 3. No standalone check.

- [ ] **Step 3: Commit**

```bash
git add web/src/styles/lausn.css
git commit -m "Fyrirtaekjalausnir: sameiginlegir stilar (landing + verdtafla + hub)"
```

---

## Task 3: Landing component (`Lausn.astro`)

**Files:**
- Create: `web/src/components/Lausn.astro`

**Interfaces:**
- Consumes: a product object (Task 1 shape) via `Astro.props.vara`.
- Produces: full landing markup. Consumed by Task 4.

- [ ] **Step 1: Create the component**

```astro
---
// web/src/components/Lausn.astro — samræmt landing-snið per vöru. Opið (engin gátt).
import Layout from '../layouts/Layout.astro';
import '../styles/lausn.css';
const { vara } = Astro.props;
const v = vara;
const verdTexti = v.verd.tegund === 'stak'
  ? { stor: v.verd.upphaed.toLocaleString('is-IS') + ' kr', litli: '/ stök skýrsla · engin áskrift' }
  : { stor: 'Innifalið í Karp+', litli: 'frá ' + v.verd.threp + '-þrepi' };
---
<Layout title={`${v.emoji} ${v.heiti} — Fyrirtækjalausnir Karps`} description={v.description}
  canonical={`https://karp.is/lausnir/${v.slug}/`} ogTitle={`${v.heiti} — Karp`}>
  <main class="ls-wrap">
    <section class="ls-hero">
      <p class="ls-kicker">Fyrirtækjalausnir</p>
      <h1>{v.emoji} {v.heiti}</h1>
      <p class="lead">{v.gildisloford}</p>
      <p class="lead" style="margin-top:10px">{v.inngangur}</p>
      <div class="ls-cta-row">
        <a class="ls-btn" href={v.tol.href}>{v.tol.label}</a>
        {v.synishorn && <a class="ls-btn ghost" href={v.synishorn.href}>{v.synishorn.label}</a>}
      </div>
    </section>

    <h2 class="ls-sec-h">Hvað fæst</h2>
    <div class="ls-feats">
      {v.eiginleikar.map((e) => (
        <div class="ls-feat"><span class="ic">{e.emoji}</span><b>{e.titill}</b><span>{e.texti}</span></div>
      ))}
    </div>

    <h2 class="ls-sec-h">Hvernig það virkar</h2>
    <div class="ls-steps">
      {v.skref.map((s, i) => (
        <div class="ls-step"><span class="n">{i + 1}.</span><b>{s.titill}</b><span>{s.texti}</span></div>
      ))}
    </div>

    <div class="ls-verd">
      <div><div class="price">{verdTexti.stor} <small>{verdTexti.litli}</small></div></div>
      <div class="ls-cta-row" style="margin:0">
        <a class="ls-btn" href={v.tol.href}>{v.tol.label}</a>
        <a class="ls-btn ghost" href="/karp-pro/">Sjá öll þrep & verð</a>
      </div>
    </div>

    <p class="ls-foot">Byggt á opinberum gögnum — hvorki lánshæfismat né vanskilaskrá. Hluti af <a href="/karp-pro/">Fyrirtækjalausnum Karps</a>.</p>
  </main>
</Layout>
```

- [ ] **Step 2: Verify by build** (covered by Task 4's build since a component alone renders nothing). Skip standalone.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Lausn.astro
git commit -m "Fyrirtaekjalausnir: endurnytt landing-eining (Lausn.astro)"
```

---

## Task 4: Landing route — generate 7 pages

**Files:**
- Create: `web/src/pages/lausnir/[slug].astro`

**Interfaces:**
- Consumes: `VORUR` (Task 1), `Lausn.astro` (Task 3).
- Produces: 7 static pages `/lausnir/<slug>/`.

- [ ] **Step 1: Create the dynamic route**

```astro
---
// web/src/pages/lausnir/[slug].astro — býr til 7 landing-síður úr VORUR.
import Lausn from '../../components/Lausn.astro';
import { VORUR } from '../../data/lausnir.js';
export function getStaticPaths() {
  return VORUR.map((v) => ({ params: { slug: v.slug }, props: { vara: v } }));
}
const { vara } = Astro.props;
---
<Lausn vara={vara} />
```

- [ ] **Step 2: Build and verify all 7 pages render**

Run (from `web/`): `npm run build`
Expected: build completes; output includes `/lausnir/fyrirtaekjaskyrsla/index.html` … all 7 slugs. Page count rises by 7.

Verify one page's content:
Run (from `web/`): `grep -l "Full mynd af hvaða" dist/lausnir/fyrirtaekjaskyrsla/index.html`
Expected: the file path (hero copy present).

- [ ] **Step 3: Preview-check one landing**

Start dev server (preview_start), open `/lausnir/eigendur/`, confirm hero + feature cards + steps + price band render and CTAs point to `/eigendur/` and `/karp-pro/`. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/lausnir/[slug].astro
git commit -m "Fyrirtaekjalausnir: 7 landing-sidur (dynamic route yfir VORUR)"
```

---

## Task 5: `VerdTafla.astro` — 3-tier comparison table

**Files:**
- Create: `web/src/components/VerdTafla.astro`

**Interfaces:**
- Consumes: `THREP`, `EIGINDIR` (Task 1). Calls `karpSubscribeTier(tier.slug)` (Task 6) on tier CTA click.
- Produces: the pricing table markup + a `<script>` wiring tier buttons. Consumed by Task 7 (hub).

- [ ] **Step 1: Create the component**

```astro
---
// web/src/components/VerdTafla.astro — 3-þrepa samanburðartafla. Les THREP + EIGINDIR.
import { THREP, EIGINDIR } from '../data/lausnir.js';
---
<div class="vt-wrap">
  <table class="vt">
    <thead>
      <tr>
        <th></th>
        {THREP.map((t) => (
          <th class={t.vinsaelt ? 'col-hi' : ''}>
            <div class="tier-nm">{t.heiti}</div>
            <div class="tier-pr">{t.verd.toLocaleString('is-IS')} <small>kr/mán án vsk</small></div>
            <button type="button" class="vt-cta" data-threp={t.slug} data-nafn={t.heiti}>{t.cta}</button>
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {EIGINDIR.map((row) => (
        <tr>
          <td>{row.titill}</td>
          {row.gildi.map((g, i) => (
            <td class={THREP[i].vinsaelt ? 'col-hi' : ''}>
              {g === true ? <span class="yes">✓</span> : g === false ? <span class="no">✗</span>
                : <span class={row.neikvaett ? 'neg' : ''}>{g}</span>}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
</div>
<p style="color:#8fa0b8;font-size:12px;margin:6px 0 0">Verð án vsk. Engin binding. <b style="color:#cdd6e6">Stök skýrsla 990 kr</b> ef þú vilt enga áskrift.</p>
<script>
  import { karpSubscribeTier } from '../lib/auth.js';
  document.querySelectorAll('.vt-cta').forEach((b) => {
    b.addEventListener('click', () => karpSubscribeTier({ slug: b.dataset.threp, nafn: b.dataset.nafn, btn: b }));
  });
</script>
```

- [ ] **Step 2: Verify** — covered by Task 7 build. Skip standalone.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/VerdTafla.astro
git commit -m "Fyrirtaekjalausnir: VerdTafla-eining (3 threp)"
```

---

## Task 6: `karpSubscribeTier` placeholder (auth.js)

**Files:**
- Modify: `web/src/lib/auth.js` (append near `karpAskellSubscribe`, around line 239)

**Interfaces:**
- Produces: `export function karpSubscribeTier({ slug, nafn, btn })`. Consumed by Task 5. Verk B replaces the body with the real Áskell tier flow.

- [ ] **Step 1: Add the placeholder function**

Append to `web/src/lib/auth.js`:
```javascript
// Þrep-áskrift (Grunnur/Fyrirtæki/Fyrirtæki+). PLACEHOLDER — Verk B vírar í Áskel.
// Byggir EKKERT sem hálf-rukkar; sýnir hóflega „opnar á næstunni" skilaboð.
export function karpSubscribeTier({ slug, nafn, btn }) {
  const msg = 'Áskrift að ' + (nafn || 'Karp+') + '-þrepi opnar á næstunni. '
    + 'Sendu okkur línu á hjalp@karp.is svo við látum þig vita um leið og hún fer í loftið.';
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = 'Opnar á næstunni ✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3200);
  }
  try { window.alert(msg); } catch (e) {}
}
```

- [ ] **Step 2: Verify it parses**

Run (from repo root): `node --check web/src/lib/auth.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/auth.js
git commit -m "Fyrirtaekjalausnir: karpSubscribeTier placeholder (threp-tilbuid, Verk B virar)"
```

---

## Task 7: Rebuild `/karp-pro/` as the hub

**Files:**
- Modify (replace entire file): `web/src/pages/karp-pro.astro`

**Interfaces:**
- Consumes: `VORUR` (Task 1), `VerdTafla.astro` (Task 5), `Layout.astro`.

- [ ] **Step 1: Replace the redirect stub with the hub**

Replace the entire contents of `web/src/pages/karp-pro.astro`:
```astro
---
// /karp-pro/ — Fyrirtækjalausnir Karps: yfirlit + verð (endurbyggt úr redirect-stubb).
import Layout from '../layouts/Layout.astro';
import VerdTafla from '../components/VerdTafla.astro';
import { VORUR } from '../data/lausnir.js';
import '../styles/lausn.css';
const desc = 'Fyrirtækjalausnir Karps — öll opinber fyrirtækjagögn á einum stað: fyrirtækjaskýrslur, endanlegir eigendur, verðmat fasteigna, fyrirtækjavakt og fjölmiðlavakt. Frá 2.900 kr/mán eða 990 kr stök skýrsla. Byggt á opinberum gögnum — hvorki lánshæfismat né vanskilaskrá.';
---
<Layout title="⭐ Fyrirtækjalausnir — verð & vörur | Karp" description={desc} canonical="https://karp.is/karp-pro/" ogTitle="Fyrirtækjalausnir Karps — verð & vörur">
  <main class="ls-wrap">
    <section class="ls-hero">
      <p class="ls-kicker">Karp+ · Fyrirtækjalausnir</p>
      <h1>Öll opinber fyrirtækjagögn á einum stað</h1>
      <p class="lead">Fyrirtækjaskýrslur, endanlegir eigendur, verðmat fasteigna, fyrirtækjavakt og fjölmiðlavakt — auk heils flokks opinberra vakta sem enginn annar býður. Á broti af verði samkeppninnar.</p>
      <div class="ls-cta-row">
        <a class="ls-btn" href="#verd">Sjá verð</a>
        <a class="ls-btn ghost" href="/fyrirtaeki/">Prófa fría uppflettingu</a>
      </div>
    </section>

    <h2 class="ls-sec-h">Vörurnar</h2>
    <div class="hub-grid">
      {VORUR.map((v) => (
        <a class="hub-card" href={`/lausnir/${v.slug}/`}>
          <span class="e">{v.emoji}</span><b>{v.heiti}</b><span>{v.gildisloford}</span>
        </a>
      ))}
    </div>

    <h2 class="ls-sec-h" id="verd">Verð & þrep</h2>
    <VerdTafla />

    <h2 class="ls-sec-h">Karp vs. hin gögnin</h2>
    <div class="hub-cmp">
      <div class="col karp">
        <h4>✅ Karp gefur þér</h4>
        <ul>
          <li>Fyrirtækjaskrá, ársreikningar & KPI</li>
          <li>Endanlegir eigendur gegnum allar keðjur</li>
          <li>Verðmat fasteigna byggt á sölusögu</li>
          <li>Fyrirtækja- & fjölmiðlavakt</li>
          <li><b>+ opnar vaktir sem hinir hafa ekki:</b> útboð, styrkir, Lögbirtingablaðið, vörumerki, skip, ökutæki, eftirlit</li>
          <li><b>Frá 2.900 kr/mán</b> — eða 990 kr stök skýrsla, engin binding</li>
        </ul>
      </div>
      <div class="col">
        <h4>Það sem við bjóðum ekki</h4>
        <ul>
          <li>Lánshæfismat og vanskilaskrá eru leyfisskyld (Persónuvernd) — við einbeitum okkur vísvitandi að opnum gögnum.</li>
          <li>Fyrir formlegt lánshæfismat eða vanskilaskrá þarf leyfishafa.</li>
        </ul>
      </div>
    </div>

    <p class="ls-foot">Byggt á opinberum gögnum — hvorki lánshæfismat né vanskilaskrá. Verð án vsk.</p>
  </main>
</Layout>
```

- [ ] **Step 2: Build and verify the hub renders**

Run (from `web/`): `npm run build`
Expected: build completes, no error; `/karp-pro/index.html` no longer contains `meta http-equiv="refresh"` and DOES contain "Öll opinber fyrirtækjagögn".

Run (from `web/`): `grep -c "hub-card" dist/karp-pro/index.html`
Expected: ≥ 7 (one card per product).

- [ ] **Step 3: Preview-check the hub**

Open `/karp-pro/`, confirm: hero, 7 product cards (linking to `/lausnir/<slug>/`), the 3-tier table (tier CTAs present), "Karp vs" block. Click a tier CTA → confirm the "opnar á næstunni" placeholder fires (no navigation/charge). Screenshot.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/karp-pro.astro
git commit -m "Fyrirtaekjalausnir: /karp-pro/ endurbyggt sem hub (yfirlit + verdtafla + samanburdur)"
```

---

## Task 8: Nav reorg — "Fyrirtækjalausnir" group

**Files:**
- Modify: `web/src/layouts/Layout.astro:9-20` (the first two NAV entries)

**Interfaces:**
- Consumes: nothing new. Produces: updated `NAV` array driving the sidebar on every page.

- [ ] **Step 1: Replace the Karp+ group with two groups**

In `web/src/layouts/Layout.astro`, replace the existing first NAV group (lines 10–20, the `{ label: 'Karp+', … }` block ending before `{ href: '/kort/' …`) with:
```javascript
  { label: 'Fyrirtækjalausnir', emoji: '⭐', icon: 'pro', items: [
    { href: '/karp-pro/', label: 'Yfirlit & verð' },
    { href: '/lausnir/fyrirtaekjaskyrsla/', label: 'Fyrirtækjaskýrsla' },
    { href: '/lausnir/eigendur/', label: 'Endanlegir eigendur' },
    { href: '/lausnir/fyrirtaekjavaktin/', label: 'Fyrirtækjavaktin' },
    { href: '/lausnir/areidanleikamat/', label: 'Áreiðanleikamat' },
    { href: '/lausnir/fasteignamat/', label: 'Fasteignamat' },
    { href: '/lausnir/fjolmidlavakt/', label: 'Fjölmiðlavakt' },
    { href: '/lausnir/utbodsvaktin/', label: 'Útboðsvaktin' },
  ] },
  { label: 'Karp+', emoji: '👤', items: [
    { href: '/mitt-svaedi/', label: 'Mitt svæði' },
    { href: '/vaktir/', label: 'Leitarorðavaktin' },
    { href: '/eftirlit/', label: 'Eftirlitsvaktin' },
    { href: '/okutaeki-skip/', label: 'Ökutæki & skip' },
  ] },
```

Note: the tool pages (`/fyrirtaeki/`, `/eigendur/`, `/frettir/`, `/utbod/`, `/fasteignavakt/`) are intentionally reached via their landing pages now, not directly in nav. They remain live by URL.

- [ ] **Step 2: Build and verify nav**

Run (from `web/`): `npm run build`
Expected: build completes. `grep -c "Fyrirtækjalausnir" dist/index.html` ≥ 1; `grep -c "/lausnir/eigendur/" dist/index.html` ≥ 1.

- [ ] **Step 3: Preview-check nav**

Open `/`, confirm the sidebar shows "Fyrirtækjalausnir" group with 8 items and a separate "Karp+" group. Click "Yfirlit & verð" → lands on `/karp-pro/` hub. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add web/src/layouts/Layout.astro
git commit -m "Fyrirtaekjalausnir: nav-endurskipulag (nyr Fyrirtaekjalausnir-hopur + Karp+ adgangur)"
```

---

## Task 9: Slim marketing prose from tool pages (final, minimal, low-risk)

Trim ONLY the top intro marketing paragraph on each tool page and point it at its landing. Keep the `kicker`, `h1`, the data-info line, the search form, all `#…-out` containers, gates, and buy CTAs EXACTLY as they are. Do each page, build, and confirm the tool still renders before moving on.

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro:19`, `web/src/pages/eigendur.astro:16`, `web/src/pages/fasteignavakt.astro`, `web/src/pages/frettir.astro`, `web/src/pages/utbod.astro`

**Interfaces:** none — pure content trim.

- [ ] **Step 1: `fyrirtaeki.astro` — replace the marketing `<p>` (line 19)**

Replace:
```astro
    <p>Flettu upp hvaða íslenska félagi sem er — beint úr opinberri fyrirtækjaskrá Skattsins. Hluti af <a href="/karp-pro/" style="color:#f6b13b">Karp+</a> (ókeypis aðgangur). Kortið tengir svo áfram í það sem Karp veit: umfjöllun fjölmiðla, greiðslur frá ríkinu og opinber útboð.</p>
```
with:
```astro
    <p>Flettu upp hvaða íslenska félagi sem er — beint úr opinberri fyrirtækjaskrá Skattsins. <a href="/lausnir/fyrirtaekjaskyrsla/" style="color:#f6b13b">Um Fyrirtækjaskýrsluna →</a></p>
```

- [ ] **Step 2: `eigendur.astro` — trim the intro `<p>` (line 16)**

Open `web/src/pages/eigendur.astro`. In the static intro (the `<p>` after `<h1>🔗 Endanlegir eigendur</h1>`), replace the long marketing sentence with a lean lead + landing link:
```astro
    <p>Full eignarhaldsskýrsla hvaða íslensks félags sem er. <a href="/lausnir/eigendur/" style="color:#f6b13b">Um Endanlega eigendur →</a></p>
```
Keep the `.note` sample line, the form, `#fs-out`, and all script untouched.

- [ ] **Step 3: `fasteignavakt.astro`, `frettir.astro`, `utbod.astro` — same minimal trim**

For each: read the file's static intro block (the `<p>` directly under the `<h1>`). If it contains multi-sentence marketing prose, replace it with a one-line lead + a link to the matching landing (`/lausnir/fasteignamat/`, `/lausnir/fjolmidlavakt/`, `/lausnir/utbodsvaktin/`). Do NOT touch forms, gates, output containers, or scripts. If a page has no separable marketing `<p>` (only a functional intro), leave it and note "engin markaðs-prósa að fjarlægja" — this is acceptable.

- [ ] **Step 4: Build and verify every tool still works**

Run (from `web/`): `npm run build`
Expected: build completes; each tool page still contains its form id (`grep -c "fs-form" dist/fyrirtaeki/index.html` ≥ 1, `dist/eigendur/index.html` ≥ 1).

Preview-check `/fyrirtaeki/` and `/eigendur/`: search still works, gate/buy still present, `?syni=`/`?q=` sample still renders. Screenshot.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro web/src/pages/eigendur.astro web/src/pages/fasteignavakt.astro web/src/pages/frettir.astro web/src/pages/utbod.astro
git commit -m "Fyrirtaekjalausnir: grenna markads-prosu ur tol-sidum (virkni obreytt, hlekkur a landing)"
```

---

## Task 10: Full verification + deploy

- [ ] **Step 1: Clean full build**

Run (from `web/`): `npm run build`
Expected: completes with no errors; total page count = previous + 8 (7 landings + no net change from hub, which already existed as a stub). Confirm `/karp-pro/` + all 7 `/lausnir/<slug>/` present in `dist/`.

- [ ] **Step 2: Cross-link sanity**

Confirm: hub product cards → `/lausnir/<slug>/`; each landing CTA → its tool + `/karp-pro/`; nav "Fyrirtækjalausnir" → all 8; tool pages → their landing. Responsive check (preview_resize mobile) on hub + one landing.

- [ ] **Step 3: Clean astro churn, commit any final, push**

```bash
git checkout -- web/.astro/content.d.ts web/.astro/types.d.ts 2>/dev/null || true
git push origin HEAD   # or open PR / hand to Aron to merge, per branch workflow
```

- [ ] **Step 4: Verify live** (after Cloudflare Pages build): `https://karp.is/karp-pro/` = 200 with hub content; `https://karp.is/lausnir/eigendur/` = 200. Confirm old CTAs (e.g. from `/fyrirtaeki/` gate) now land on the real hub, not the homepage.

---

## Self-Review (author checklist)

1. **Spec coverage:** hub ✓ (T7), 7 landings ✓ (T1 data + T3 component + T4 route), nav reorg ✓ (T8), full separation / slim tools ✓ (T9), 990kr Teya live ✓ (kept in tools, referenced), tier CTA þrep-tilbúið ✓ (T5+T6), Karp-vs-Creditinfo ✓ (T7), legal line on every page ✓ (data + component + hub), open/ungated ✓ (no loadUser gate in Lausn/hub). Verk B correctly excluded.
2. **Placeholders:** none — all code complete; slimming for the 2 known pages is exact, the other 3 are pattern + explicit "acceptable to leave" escape (not a TODO gap).
3. **Type consistency:** `VORUR` object shape used identically in T1 (definition), T3 (`v.eiginleikar`, `v.tol.href`, `v.verd.tegund`), T4 (`props.vara`), T7 (`v.slug`, `v.emoji`, `v.heiti`, `v.gildisloford`). `karpSubscribeTier({slug,nafn,btn})` defined T6, called T5 with `{slug,nafn,btn}`. `THREP`/`EIGINDIR` shape consistent T1↔T5.
