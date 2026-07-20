# Söguþræðir (story threads) — Design Spec

**Date:** 2026-07-20
**Feature:** #4 on the "fyrir fréttamenn" list (after Fréttavaktir, Gögn & graf, Atburða-tímalína).
**One line:** On a fréttavél permalink for an entity-bearing news item, bake in a "🕑 Ferill málsins" box that shows the company's unfolding Lögbirting case arc (beiðni → innköllun → skiptalok), so a journalist reading one headline can follow the whole story.

## Goal

Turn a lone gjaldþrota-headline into a followable story. The example arc —
gjaldþrotaskiptabeiðni → innköllun → skiptalok — is not three separate news
items; the fréttavél emits **one** item per detection. The full arc lives in
`logbirting.json` (`byKt[kt].notices[]`). This feature joins the news item to
that arc and renders it inline on the permalink.

## Decisions (locked in brainstorming)

- **Linking key = kennitala (company).** Extract kt from the news item; join to
  that kt's Lögbirting notices. (Option A. Fuzzy-name and court-case-number
  threads are explicit follow-ups, not v1.)
- **Thread scope = tight case arc.** Only the same-matter events (that kt's
  Lögbirting notices), ordered **oldest→newest**, this item marked "þú ert hér",
  with a resolution status line. Excludes styrkir/vörumerki/other-news noise.
  (Option A. Full entity arc would duplicate firma-timalina.)

## Architecture

**Pure build-time, zero worker changes.** The `/frettavel/<slug>/` permalink
pages are **static Astro** (`[id].astro`, `getStaticPaths` over
`frettavel_archive.json`). So the arc is baked into the page HTML at build
time — SEO-visible, no client fetch, no `/api` route, no worker edit. The site
rebuilds daily via refresh-data, so the arc stays current.

(Contrast: firma-timalina needed a worker endpoint because `/fyrirtaeki/<kt>/`
is worker-SSR. This feature does not, because its host page is static.)

### Data flow

1. `[id].astro` frontmatter already does `import ARCH from '@gogn/frettavel_archive.json'`.
   Add `import LOGB from '@gogn/logbirting.json'`.
2. Per item at build: `threadKey(item)` → kt string | null.
3. `caseThread(item, LOGB.byKt)` → thread object | null.
4. If non-null, render the static "Ferill málsins" box; else render nothing.

## Unit: `web/src/lib/soguthraedir.mjs` (pure, node:test)

Isolated pure module, same pattern as `firma-timalina.mjs`. No fs, no network.

### `threadKey(item) → string | null`

Extracts the kennitala from a news item. v1 recognises the gjaldþrot id
pattern; written as an extensible map so other kt-carrying types slot in later.

- gjaldþrot ids are `gjaldthrot-<section>-<year>-<kt>` (e.g.
  `gjaldthrot-116-2026-4102160270`). The kt is the **last** hyphen segment.
- Return it only if it is a 10-digit string (`/^\d{10}$/`); else `null`.
- Non-gjaldþrot types → `null` in v1.

### `caseThread(item, byKt, opts?) → null | Thread`

- `kt = threadKey(item)`. If `null` → return `null`.
- `notices = (byKt[kt] && byKt[kt].notices) || []`. If fewer than **2**
  notices → return `null` (a single notice is not a thread).
- `steps`: notices sorted by `date` **ascending** (oldest→newest), each mapped to
  `{ dags, titill, birt, current }`:
  - `titill` = `LBL[type] || type` where `LBL` is the label map baked into the
    module (values from `logbirting.json` `typeLabels`):
    - `gjaldthrot_beidni` → "Gjaldþrotaskiptabeiðni"
    - `skiptabeidni` → "Skiptabeiðni (fyrirtaka)"
    - `innkollun` → "Innköllun þrotabús (kröfulýsing)"
    - `skiptafundur` → "Skiptafundur þrotabús"
    - `skiptalok` → "Skiptalok þrotabús"
    - `felagsslit` → "Félagsslit / afskráning"
  - `birt` = `dd.m.yyyy` (reuse the `dmy` formatting logic from firma-timalina).
  - `current`: exactly one step is marked `true` — the notice whose `date` is
    nearest (min absolute day difference) to the item's `date`. Ties → the later
    (newest) of the tied notices. This is the beat the headline corresponds to.
- `status = { done, label }`:
  - Terminal notice = the **newest** notice whose `type ∈ {skiptalok,
    felagsslit}` (by date; if both types are present the single newest of them
    wins). If one exists → `done = true`; label from its type + `birt`:
    `skiptalok` → "Lauk með skiptalokum <birt>", `felagsslit` → "Félagsslit <birt>".
  - else `done = false`, `label = "Í ferli"`.
- Return `{ kt, n: steps.length, steps, status }`.

### Exports

`export { threadKey, caseThread }`. Imports only what it needs (a local `dmy`
helper; no import from frettavel-cat is required — threadKey does its own
parsing). Keep the module fs-free so it stays trivially testable.

## Unit: `web/src/pages/frettavel/[id].astro` (modify)

- Add `import LOGB from '@gogn/logbirting.json'` and
  `import { threadKey, caseThread } from '../../lib/soguthraedir.mjs'`.
- In the per-page frontmatter (the page renders one item `it`), compute
  `const thread = caseThread(it, LOGB.byKt)`.
- Render the box **only if `thread`** — a vertical stepper inside a
  `<section class="fv-thread">`:
  - Heading: `🕑 Ferill málsins` + a status pill (`Í ferli` amber / `Lokið`
    green) from `thread.status`.
  - One row per `thread.steps` entry: `birt` (date) + `titill`; the `current`
    step gets a highlight class and a "þessi frétt" tag.
  - Footer link: `Öll gögn félagsins →` → `/fyrirtaeki/<kt>/` (ties into
    firma-timalina / the company page).
- Styles: a scoped `<style>` block on the page (the permalink already has
  page-level styling). Escape any interpolated text via Astro's default
  expression escaping (no `set:html` on user/data strings).

## Testing

Unit tests `web/src/lib/soguthraedir.test.mjs` (node:test) — the correctness gate:

1. `threadKey` extracts the 10-digit kt from a gjaldþrot id; returns `null` for a
   non-gjaldþrot id and for a malformed/short last segment.
2. `caseThread` returns `null` when kt has 0 or 1 notices (the ≥2 gate).
3. `caseThread` orders steps oldest→newest and maps labels correctly.
4. `current` marks the single step nearest the item date (incl. a tie → newest).
5. `status.done` + terminal label when a `skiptalok`/`felagsslit` notice exists;
   `Í ferli` otherwise.

No worker tests (no worker touched). `astro build` must stay clean.

## Verification (live)

Correctness is proven by the unit tests. **Live visibility is temporal:** all
three gjaldþrota-fréttir currently in the archive map to kennitala with only 1
Lögbirting notice, so with the ≥2 gate **none render a box today** — this is
correct behavior, not a bug. The box appears as a company's arc grows (innköllun
/ skiptalok land on later daily rebuilds) or for future gjaldþrota-fréttir whose
kt already has multiple notices (such kts exist, e.g. 4102160270 with 4).

Verification steps:
- Run the unit tests (all pass).
- `astro build` clean; grep built `dist/frettavel/*/index.html` for
  `fv-thread` — report how many permalinks got a box (may be 0 today; that is
  expected and will be stated honestly).
- Optional sanity: a throwaway node check calling `caseThread` with a real
  multi-notice kt (e.g. 4102160270) confirms the rendered shape end-to-end
  against production data.

## Scope guard (YAGNI — explicitly out of v1)

No new page, no `/api` route, no worker change, no JSON-LD change, no feed-level
thread badges, no fuzzy-name or court-case-number linking, no non-bankruptcy
threads. Just the case-arc box on gjaldþrot-kt-bearing permalinks.

## Files

- Create: `web/src/lib/soguthraedir.mjs`
- Create: `web/src/lib/soguthraedir.test.mjs`
- Modify: `web/src/pages/frettavel/[id].astro` (import + compute + render box + scoped styles)
