# Fyrirtækjagögn — nav rename + page reorganization — Design Spec

**Date:** 2026-07-20
**One line:** Rename the nav entry for `/lausnir/fyrirtaekjaskyrsla/` to "Fyrirtækjagögn" and reorganize the unified page from a flat 5-card grid into a search-led layout with a clear product hierarchy.

## Motivation

`/lausnir/fyrirtaekjaskyrsla.astro` unified four per-company products (skýrsla · eigendur · fyrirtækjavaktin · áreiðanleikamat) plus cross-company topplistar onto one page ([[karp-fyrirtaekjalausnir]]). The page H1 already reads "🏢 Fyrirtækjagögn", but the nav still says "Fyrirtækjaskýrsla", and the body presents all five products as five visually-equal cards — no hierarchy, and the topplistar (cross-company) sits among the per-company ones. The reorg makes the page **search-led with product hierarchy** (approved direction A+B blend).

## Scope

Two changes, both additive/cosmetic — no data, route, price, or component-logic changes:

1. **Nav + footer rename** in `web/src/layouts/Layout.astro`: the label "Fyrirtækjaskýrsla" → "Fyrirtækjagögn" at line 14 (main nav array) and line 366 (footer link). The `href` (`/lausnir/fyrirtaekjaskyrsla/`) is unchanged.
2. **Page reorganization** in `web/src/pages/lausnir/fyrirtaekjaskyrsla.astro`: the flat `.fg-prods` grid of 5 cards becomes a hierarchy.

## Design — reorganized page structure

Order top→bottom (reusing the existing `Layout`, `VerdTafla`, `lausn.css`, and `VORUR` data):

1. **Hero (`.ls-hero`) — search-led.** Keep the kicker "Karp+" and H1 "🏢 Fyrirtækjagögn". Tighten the `.lead` to emphasize the unified value, e.g. *"Ein leit — öll opinber gögn um íslenskt félag: skýrsla, eigendur, vöktun, áreiðanleikamat og topplistar."* Keep the `.fg-search` form (GET → `/fyrirtaeki/`) as the focal action directly under the lead.

2. **Section heading** `<h2 class="ls-sec-h">Öll gögn um hvert félag</h2>`.

3. **Flagship card** — the `fyrirtaekjaskyrsla` product rendered prominently:
   - A dedicated `.fg-flagship` card (gold-accent border) with a small "Aðalskýrsla" badge.
   - Header: `emoji`, `heiti`, `gildisloford`, price via `verdTxt(v)`.
   - Full `.ls-feats` feature list (its `eiginleikar`).
   - `.ls-cta-row` with the main CTA (`v.tol`) + sample (`v.synishorn`) if present.

4. **Secondary row** — the other three per-company products (`eigendur`, `fyrirtaekjavaktin`, `areidanleikamat`) in a **3-up responsive grid** (`.fg-sec`, `repeat(auto-fit, minmax(200px, 1fr))`), each a compact card: `emoji`, `heiti`, `gildisloford`, `verdTxt(v)`, and a single CTA (`v.tol`). Compact = no full feature list (keeps the flagship dominant).

5. **Cross-company band** — a labeled divider `<div class="fg-div"><span>Þvert á félög</span></div>` followed by the **Topplistar** card (kept as today: emoji 🏆, title, the three `.ls-feat`s, CTA → `/topplistar-fyrirtaeki/`).

6. **Verð & þrep** — `<h2 class="ls-sec-h" id="verd">Verð &amp; þrep</h2>` + `<VerdTafla />` (unchanged).

7. **Footer note** (`.ls-foot`) — unchanged ("Byggt á opinberum gögnum — hvorki lánshæfismat né vanskilaskrá…").

### Data wiring

- `bySlug` map as today. `flagship = bySlug['fyrirtaekjaskyrsla']`; `secondary = ['eigendur','fyrirtaekjavaktin','areidanleikamat'].map((s)=>bySlug[s]).filter(Boolean)`.
- `verdTxt` helper unchanged. If `flagship` is falsy (data missing), the flagship card is skipped (defensive `{flagship && …}`); `secondary` already `.filter(Boolean)`.
- Topplistar stays hardcoded (not in `VORUR`).

### Styling

Scoped `<style>` in the page. Reuse existing `lausn.css` classes (`.ls-feats`, `.ls-feat`, `.ls-cta-row`, `.ls-btn`, `.ls-btn.ghost`, `.ls-sec-h`). Add:
- `.fg-flagship` — like `.fg-prod` but `border: 1.5px solid` gold-accent (`color-mix(in srgb, var(--gold) 50%, transparent)`), `position: relative` for the badge.
- `.fg-flagship-badge` — absolute, gold pill "Aðalskýrsla".
- `.fg-sec` — `display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px`.
- `.fg-sec-card` — compact card (panel bg, line border, radius, padding).
- `.fg-div` — flex row: an uppercase muted label + a `1px` hairline rule filling the rest.
- Keep the existing `.fg-search` / `.fg-prod` styles that remain in use (topplistar still uses `.fg-prod`).

## SEO / metadata

Unchanged: `title`, `description`, `canonical`, `ogTitle`, `jsonLd` (CollectionPage). The `.lead` copy tweak is cosmetic.

## Testing / verification

Astro page — no unit tests (consistent with the repo's `.astro` pages). Verify:
- `astro build` completes clean (the page compiles; VORUR/VerdTafla/lausn.css resolve).
- Browser preview (dev server): the hero + search render; the flagship is visually dominant; the 3 secondary cards sit below; the "Þvert á félög" divider + topplistar render; pricing table intact; search submits to `/fyrirtaeki/`; the four product CTAs and sample links resolve (hrefs come from `VORUR`, unchanged).
- Nav shows "Fyrirtækjagögn" and its link still resolves to the page.

## Scope guard (YAGNI — out of scope)

No changes to `VORUR`/prices, `VerdTafla`, `lausn.css` (only page-scoped styles added), the `/fyrirtaeki/` search target, the canonical URL/route (`fyrirtaekjaskyrsla` slug stays — renaming the file/route would break links + the `lausnir/[slug]` exclusion + canonical), or any product removal. No new page. The three old landing pages' `canonicalTo` redirects (from the earlier unification) are untouched.

## Files

- Modify: `web/src/layouts/Layout.astro` (2 label renames: line 14, line 366)
- Modify: `web/src/pages/lausnir/fyrirtaekjaskyrsla.astro` (reorganize body + scoped styles)
