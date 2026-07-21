# Fyrirtækjagögn — nav rename + page reorg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the nav/footer entry for `/lausnir/fyrirtaekjaskyrsla/` to "Fyrirtækjagögn" and reorganize the unified page from a flat 5-card grid into a search-led layout with a flagship report + secondary reports + a cross-company topplistar band.

**Architecture:** Pure Astro/markup change to two existing files. No new data, routes, components, or dependencies — reuses `VORUR` (data), `VerdTafla` (component), and `lausn.css`. Page-scoped `<style>` only.

**Tech Stack:** Astro SSG.

## Global Constraints

- No changes to `VORUR`/prices, `VerdTafla`, `lausn.css` (only page-scoped `<style>` added), the search target (`/fyrirtaeki/`), the canonical URL, the route/slug (`fyrirtaekjaskyrsla` file stays), or `title`/`description`/`jsonLd`.
- Nav `href` stays `/lausnir/fyrirtaekjaskyrsla/`; only the visible **label** changes to `Fyrirtækjagögn`.
- Flagship = the `fyrirtaekjaskyrsla` product; secondary = `eigendur`, `fyrirtaekjavaktin`, `areidanleikamat`; topplistar stays hardcoded.
- Astro pages have no unit tests in this repo — verify via `astro build` (clean) + a browser preview.
- Shell commands run from the worktree root `C:/Users/aronh/dev/KARP/frettavaktir-wt` (git bash); `astro build` runs from `web/`.

---

### Task 1: Rename the nav + footer label in `Layout.astro`

**Files:**
- Modify: `web/src/layouts/Layout.astro:14` (main nav array) and `:366` (footer link)

**Interfaces:**
- Produces: the nav/footer entry pointing at `/lausnir/fyrirtaekjaskyrsla/` now labelled "Fyrirtækjagögn".

- [ ] **Step 1: Rename the main-nav label**

In `web/src/layouts/Layout.astro`, replace this exact line:
```astro
    { href: '/lausnir/fyrirtaekjaskyrsla/', label: 'Fyrirtækjaskýrsla' },
```
with:
```astro
    { href: '/lausnir/fyrirtaekjaskyrsla/', label: 'Fyrirtækjagögn' },
```

- [ ] **Step 2: Rename the footer link**

In `web/src/layouts/Layout.astro`, replace this exact line:
```astro
          <a href="/lausnir/fyrirtaekjaskyrsla/">Fyrirtækjaskýrsla</a>
```
with:
```astro
          <a href="/lausnir/fyrirtaekjaskyrsla/">Fyrirtækjagögn</a>
```

- [ ] **Step 3: Verify no stale label remains**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && grep -rn "Fyrirtækjaskýrsla" web/src/layouts/Layout.astro || echo "clean — no stale nav label"`
Expected: `clean — no stale nav label` (the nav/footer no longer show the old label; other files may still use the word legitimately and are out of scope).

- [ ] **Step 4: Commit**

```bash
git add web/src/layouts/Layout.astro
git commit -m "feat(fyrirtaekjagogn): rename nav + footer label to Fyrirtækjagögn"
```

---

### Task 2: Reorganize `fyrirtaekjaskyrsla.astro` into the search-led hierarchy

**Files:**
- Modify (full body rewrite): `web/src/pages/lausnir/fyrirtaekjaskyrsla.astro`

**Interfaces:**
- Consumes: `VORUR` (each item has `slug, emoji, heiti, gildisloford, eiginleikar:[{emoji,titill,texti}], verd:{tegund,upphaed}, tol:{href,label}, synishorn?:{href,label}`), `VerdTafla`, `lausn.css`.
- Produces: the reorganized page.

- [ ] **Step 1: Replace the whole file**

Overwrite `web/src/pages/lausnir/fyrirtaekjaskyrsla.astro` with exactly:

```astro
---
// web/src/pages/lausnir/fyrirtaekjaskyrsla.astro — SAMEINUÐ fyrirtækja-síða (leitar-fyrst, stigveldi).
// Sameinar 4 fyrirtækja-vörur (skýrsla · eigendur · vaktin · áreiðanleikamat) + fyrirtækja-topplista á
// eina síðu: leit efst, AÐALSKÝRSLA áberandi, 3 sérskýrslur, „þvert á félög" topplistar, verð neðst.
// ⚠ fyrirtaekjaskyrsla er útilokuð frá lausnir/[slug].astro getStaticPaths (annars tvítekin síða).
import Layout from '../../layouts/Layout.astro';
import VerdTafla from '../../components/VerdTafla.astro';
import { VORUR } from '../../data/lausnir.js';
import '../../styles/lausn.css';

const bySlug = Object.fromEntries(VORUR.map((v) => [v.slug, v]));
const flagship = bySlug['fyrirtaekjaskyrsla'];
const secondary = ['eigendur', 'fyrirtaekjavaktin', 'areidanleikamat'].map((s) => bySlug[s]).filter(Boolean);
const verdTxt = (v) => v.verd.tegund === 'stak' ? v.verd.upphaed.toLocaleString('is-IS') + ' kr · stök skýrsla'
  : v.verd.tegund === 'askrift' ? v.verd.upphaed.toLocaleString('is-IS') + ' kr/mán'
  : 'Innifalið í Karp+';
const desc = 'Öll fyrirtækjagögn á einum stað: fyrirtækjaskýrsla, endanlegir eigendur, fyrirtækjavakt, áreiðanleikamat (KYC) og topplistar stærstu félaga — úr opinberum skrám. Frá 990 kr stök skýrsla eða áskrift. Hvorki lánshæfismat né vanskilaskrá.';
const jsonLd = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Fyrirtækjagögn — Karp+', description: desc, url: 'https://karp.is/lausnir/fyrirtaekjaskyrsla/' };
---
<Layout title="Fyrirtækjaskýrsla, eigendur & áreiðanleikamat — Karp+" description={desc}
  canonical="https://karp.is/lausnir/fyrirtaekjaskyrsla/" ogTitle="Fyrirtækjagögn — Karp+" jsonLd={jsonLd}>
  <main class="ls-wrap">
    <section class="ls-hero">
      <p class="ls-kicker">Karp+</p>
      <h1>🏢 Fyrirtækjagögn</h1>
      <p class="lead">Ein leit — öll opinber gögn um íslenskt félag: fyrirtækjaskýrsla, endanlegir eigendur, sjálfvirk vöktun, áreiðanleikamat (KYC) og topplistar stærstu félaga.</p>
      <form class="fg-search" method="get" action="/fyrirtaeki/">
        <input name="q" placeholder="Fletta upp félagi eða kennitölu…" aria-label="Leita að félagi eða kennitölu" autocomplete="off" />
        <button type="submit">🔎 Leita</button>
      </form>
    </section>

    <h2 class="ls-sec-h">Öll gögn um hvert félag</h2>

    {flagship && (
      <section class="fg-flagship">
        <span class="fg-flagship-badge">Aðalskýrsla</span>
        <div class="fg-prod-h">
          <span class="fg-e">{flagship.emoji}</span>
          <div class="fg-prod-t"><h2>{flagship.heiti}</h2><p>{flagship.gildisloford}</p></div>
          <span class="fg-verd">{verdTxt(flagship)}</span>
        </div>
        <div class="ls-feats">
          {flagship.eiginleikar.map((e) => (
            <div class="ls-feat"><span class="ic">{e.emoji}</span><b>{e.titill}</b><span>{e.texti}</span></div>
          ))}
        </div>
        <div class="ls-cta-row">
          <a class="ls-btn" href={flagship.tol.href}>{flagship.tol.label}</a>
          {flagship.synishorn && <a class="ls-btn ghost" href={flagship.synishorn.href}>{flagship.synishorn.label}</a>}
        </div>
      </section>
    )}

    <div class="fg-sec">
      {secondary.map((v) => (
        <section class="fg-sec-card">
          <span class="fg-e">{v.emoji}</span>
          <h3>{v.heiti}</h3>
          <p>{v.gildisloford}</p>
          <span class="fg-verd">{verdTxt(v)}</span>
          <a class="ls-btn" href={v.tol.href}>{v.tol.label}</a>
        </section>
      ))}
    </div>

    <div class="fg-div"><span>Þvert á félög</span></div>

    <section class="fg-prod">
      <div class="fg-prod-h">
        <span class="fg-e">🏆</span>
        <div class="fg-prod-t"><h2>Topplistar fyrirtækja</h2><p>Stærstu félög hverrar atvinnugreinar — raðað úr ársreikningum.</p></div>
        <span class="fg-verd">Innifalið í Karp+</span>
      </div>
      <div class="ls-feats">
        <div class="ls-feat"><span class="ic">📊</span><b>Per atvinnugrein</b><span>Stærstu félög hverrar greinar eftir veltu og eignum.</span></div>
        <div class="ls-feat"><span class="ic">📈</span><b>Úr ársreikningum</b><span>Raðað úr opinberri ársreikningaskrá RSK — uppfært sjálfvirkt.</span></div>
        <div class="ls-feat"><span class="ic">🔗</span><b>Beint í skýrslu</b><span>Smelltu á félag og fáðu fulla fyrirtækjaskýrslu.</span></div>
      </div>
      <div class="ls-cta-row">
        <a class="ls-btn" href="/topplistar-fyrirtaeki/">Skoða topplistana</a>
      </div>
    </section>

    <h2 class="ls-sec-h" id="verd">Verð &amp; þrep</h2>
    <VerdTafla />

    <p class="ls-foot">Byggt á opinberum gögnum — hvorki lánshæfismat né vanskilaskrá. Hluti af <a href="/karp-pro/">Karp+</a>.</p>
  </main>

  <style>
    .fg-search { display:flex; gap:8px; margin-top:16px; max-width:540px; }
    .fg-search input { flex:1; min-width:0; padding:12px 14px; border-radius:10px; border:1px solid var(--line); background:var(--panel); color:var(--ink); font-size:15px; }
    .fg-search button { padding:12px 18px; border-radius:10px; border:0; background:var(--gold); color:#1a1205; font-weight:700; cursor:pointer; white-space:nowrap; }
    .fg-prod { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px 22px; margin:0 0 16px; }
    .fg-prod-h { display:flex; align-items:flex-start; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
    .fg-prod-t { flex:1; min-width:200px; }
    .fg-prod-h h2 { margin:0; font-size:20px; }
    .fg-prod-h p { margin:3px 0 0; color:var(--muted); font-size:14px; line-height:1.45; }
    .fg-e { font-size:30px; line-height:1; }
    .fg-verd { margin-left:auto; color:var(--gold); font-weight:700; font-size:13.5px; white-space:nowrap; padding-top:4px; }
    @media (max-width:560px) { .fg-prod-h .fg-verd { margin-left:44px; width:100%; padding-top:0; } }
    .fg-flagship { position:relative; background:var(--panel); border:1.5px solid color-mix(in srgb, var(--gold) 50%, transparent); border-radius:16px; padding:22px 22px 20px; margin:22px 0 12px; }
    .fg-flagship-badge { position:absolute; top:-10px; left:18px; background:var(--gold); color:#1a1205; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:3px 10px; border-radius:999px; }
    .fg-sec { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin:0 0 8px; }
    .fg-sec-card { display:flex; flex-direction:column; gap:6px; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; }
    .fg-sec-card .fg-e { font-size:26px; }
    .fg-sec-card h3 { margin:2px 0 0; font-size:16px; }
    .fg-sec-card p { margin:0; color:var(--muted); font-size:13px; line-height:1.45; flex:1; }
    .fg-sec-card .fg-verd { margin:0; padding:0; }
    .fg-sec-card .ls-btn { margin-top:4px; text-align:center; }
    .fg-div { display:flex; align-items:center; gap:12px; margin:26px 0 14px; }
    .fg-div span { font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--faint); font-weight:700; white-space:nowrap; }
    .fg-div::after { content:''; flex:1; height:1px; background:var(--line); }
  </style>
</Layout>
```

- [ ] **Step 2: Verify the build is clean**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt/web && npx astro build 2>&1 | tail -3`
Expected: build completes, no error (~3526+ pages). This confirms the page compiles and `VORUR`/`VerdTafla`/`lausn.css` resolve.

- [ ] **Step 3: Verify the rendered structure in the built HTML**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && grep -oE "fg-flagship-badge|fg-sec-card|fg-div|Aðalskýrsla|Öll gögn um hvert félag|Þvert á félög|fg-search" web/dist/lausnir/fyrirtaekjaskyrsla/index.html | sort -u`
Expected: shows `Aðalskýrsla`, `Öll gögn um hvert félag`, `Þvert á félög`, `fg-div`, `fg-flagship-badge`, `fg-search`, `fg-sec-card` — confirming the hero search, flagship badge, secondary cards, and the divider all rendered. (The controller additionally spot-checks the live/dev page in a browser.)

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/lausnir/fyrirtaekjaskyrsla.astro
git commit -m "feat(fyrirtaekjagogn): reorganize page — search-led hero + flagship + secondary + topplistar"
```

---

## Self-Review

**1. Spec coverage:**
- Nav + footer rename → Task 1 (2 edits + grep verify). ✓
- Search-led hero (tightened lead) → Task 2 file (`.ls-hero` + `.fg-search`). ✓
- "Öll gögn um hvert félag" heading + flagship card (gold accent + Aðalskýrsla badge, full feats + CTA + sample) → Task 2. ✓
- Secondary 3-up (eigendur/fyrirtaekjavaktin/areidanleikamat, compact) → Task 2 `.fg-sec`. ✓
- "Þvert á félög" divider + topplistar (unchanged content) → Task 2 `.fg-div` + `.fg-prod`. ✓
- Verð & þrep (VerdTafla unchanged) + footer → Task 2. ✓
- SEO/metadata unchanged (title/desc/canonical/jsonLd copied verbatim) → Task 2. ✓
- Verification (astro build + rendered-HTML grep + browser) → Task 2 Steps 2-3. ✓
- Constraints (no data/price/route/canonical/component changes; page-scoped styles only) → honored. ✓

**2. Placeholder scan:** No TBD/TODO; the full file is provided verbatim. ✓

**3. Type consistency:** `flagship`/`secondary` derived from `bySlug` use the same `VORUR` item fields (`emoji, heiti, gildisloford, eiginleikar, verd, tol, synishorn`) the original page used, via the unchanged `verdTxt`. Class names in the markup (`fg-flagship`, `fg-flagship-badge`, `fg-sec`, `fg-sec-card`, `fg-div`, `fg-prod*`, `fg-verd`, `fg-e`, `fg-search`) all match the `<style>` block. Reused `lausn.css` classes (`ls-wrap`, `ls-hero`, `ls-kicker`, `lead`, `ls-feats`, `ls-feat`, `ic`, `ls-cta-row`, `ls-btn`, `ls-btn.ghost`, `ls-sec-h`, `ls-foot`) are the same ones the original page used. ✓
