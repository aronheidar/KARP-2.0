# Tilkynna villu + Leiðréttingaskrá — Design Spec

**Date:** 2026-07-20
**One line:** A "Tilkynna villu" report form on every fréttavél article (reusing `/api/hjalp`) plus a transparent, editor-curated public corrections log at `/frettavel/leidrettingar/`, with a "Leiðrétt" badge on corrected articles.

**Journalist list item #6** (the last; #1–5 all live).

## Decisions (locked in brainstorming)

- **Submission path = A:** inline form on the permalink → POST the existing `/api/hjalp`. No new `/api` handler.
- Corrections log is **editor-curated** (`gogn/leidrettingar.json`, hand-maintained) — reports do NOT auto-publish. Editorial control is what makes the log credible.

## Architecture

Two halves, both riding existing infrastructure:
- **Report:** the fréttavél permalink is static Astro; the report form is client JS that POSTs `/api/hjalp` (the proven `hjalpHandler` → `sendGmail(hjalp@karp.is)` with honeypot + rate-limit). Only a 1-line worker whitelist addition is needed.
- **Log + badge:** build-time. A new hand-authored `gogn/leidrettingar.json` is read (via the `@gogn` alias → repo-root `gogn/`) by a static log page and by the permalink (to show a badge). A tiny pure module holds the lookup/sort logic (unit-tested).

## Unit 1 — worker whitelist (`web/worker.js`)

Add `'Leiðrétting'` to `HJALP_FLOKKAR` (line 425):
```js
const HJALP_FLOKKAR = ['Greiðslur & áskrift', 'Innskráning & aðgangur', 'Villa í gögnum', 'Leiðrétting', 'Annað'];
```
This makes correction reports arrive as `[Hjálp] Leiðrétting — <nafn>` (a distinct subject/category for an editor Gmail filter). Nothing else in `hjalpHandler` changes. (Deploys automatically on push.)

## Unit 2 — corrections data (`gogn/leidrettingar.json`)

Hand-authored, git-tracked, editor-curated. Shape:
```json
{ "updated": "2026-07-20", "items": [] }
```
Each `items[]` entry (added by the editor when a report is validated):
```json
{ "slug": "gjaldthrot-116-2026-4203210820", "titill": "Skiptabeiðni tekin fyrir vegna …", "dags": "2026-07-21", "hvad": "Dómstóll var ranglega sagður Héraðsdómur Reykjavíkur; réttur er Héraðsdómur Reykjaness." }
```
- `slug` = the corrected frétt's `asciiId(id)` (matches the permalink path and the badge key).
- `dags` = ISO date of the correction.
- `hvad` = a plain-language description of what was corrected.
Seeded with `items: []` (the log starts empty and fills as corrections happen).

## Unit 3 — pure module (`web/src/lib/leidrettingar.mjs`, node:test)

Fs-free; imported by both the log page and the permalink.
```
leidrettFor(slug, data) → entry | null   // the newest item whose slug === slug, else null
sortedLeidrett(data)     → item[]         // items sorted by dags descending (newest first)
```
- `data` is the parsed `leidrettingar.json` (`{items:[…]}`); tolerate missing/empty `items`.
- `leidrettFor`: filter `items` by `slug`, return the one with the max `dags` (string compare on ISO dates), or `null`.
- `sortedLeidrett`: return a copy of `items` sorted by `dags` desc (stable; entries without `dags` sort last).

## Unit 4 — corrections log page (`web/src/pages/frettavel/leidrettingar.astro`)

Static Astro page at `/frettavel/leidrettingar/`:
- Imports `@gogn/leidrettingar.json` and `sortedLeidrett`.
- Header: "🔧 Leiðréttingaskrá" + a short **policy statement**: *"Fréttavél Karp skrifar sjálfvirkt úr opinberum gögnum. Finnist villa leiðréttum við hana og skráum hér — gagnsætt og dagsett."* (always shown).
- If items exist: a list, newest-first, each row = `dags`, the `titill` linking to `/frettavel/<slug>/`, and `hvad`.
- If empty: "Engar leiðréttingar hafa verið skráðar enn." (the policy still shows).
- SEO: `title`, `description`, canonical `https://karp.is/frettavel/leidrettingar/`. Astro default escaping only.
- A back link to `/frettavel/`.

## Unit 5 — permalink additions (`web/src/pages/frettavel/[id].astro`)

Three additions (imports: `@gogn/leidrettingar.json` + `{ leidrettFor }`; `slug` already computed as `asciiId(it.id)`):

1. **"Leiðrétt" badge** — compute `const leidr = leidrettFor(slug, LEIDR)`. If truthy, render near the top (after the meta line) a small note: `🔧 Leiðrétt <dags> — <hvad, one line>`, linking to `/frettavel/leidrettingar/`. Scoped style `.fv-leidr`.

2. **"Tilkynna villu" form** — at the foot of the article (before the related list), a `<details class="fv-villa">` with summary "🚩 Tilkynna villu eða leiðréttingu" that expands a compact form: a `textarea` (name `lysing`, ≥20 chars, "Hvað er rangt?"), `nafn` + `netfang` inputs (both required by the endpoint), a hidden honeypot input, and a submit button. Inline `#fv-villa-msg` for success/error. Data attributes carry the frétt `title` + canonical `url` for the JS.

3. **Footer link** — add `· <a href="/frettavel/leidrettingar/">Leiðréttingaskrá</a>` to the existing `.fv-foot` line.

**Client JS** (a new `<script>` in `[id].astro`, isolated from the existing PNG-download script): on submit, validate (nafn non-empty, netfang matches `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`, lysing ≥20), then `fetch('/api/hjalp', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ nafn, netfang, flokkur:'Leiðrétting', lysing: TEMPLATED, hp: <honeypot value>, fra: <frétt url>, innskraning:false, ua: navigator.userAgent.slice(0,300) })})`. `TEMPLATED` =
```
LEIÐRÉTTING við fréttavélar-frétt.
Frétt: <title>
Slóð: <url>

Hvað er rangt / hvað á að leiðrétta:
<user lysing>
```
On `{ok:true}` → replace the form with "Takk — ábendingin er komin til ritstjórnar." On error → show the message inline (mirrors `hjalp.astro`'s handling of `rate`/`gogn`/`send`).

## Testing / verification

- `leidrettingar.mjs` unit tests (`web/src/lib/leidrettingar.test.mjs`): `leidrettFor` matches by slug / returns null when absent / picks the newest when a slug has two entries; `sortedLeidrett` orders by `dags` desc and tolerates empty/missing `items`.
- Astro pages have no unit tests — verify via `astro build` (clean; the new page + `@gogn` import + permalink additions compile) and a browser check: the empty log page shows the policy + "engar leiðréttingar"; a permalink shows the "🚩 Tilkynna villu" form; submitting a valid report returns `{ok:true}` (live, after deploy — reuses the working `/api/hjalp`); adding a test entry to `leidrettingar.json` makes the badge + a log row appear.
- Worker: the `HJALP_FLOKKAR` addition is a 1-line array change; verified by a correction report arriving as `[Hjálp] Leiðrétting` (live). No new handler to test.

## Scope guard (YAGNI — out of v1)

No new `/api` handler (reuse `/api/hjalp`); no auto-publishing of reports; no moderation UI (editor edits the JSON by hand); no changes to the `villaHandler` JS-error logger; no email to a separate corrections inbox (rides `hjalp@karp.is` + Gmail filter); report form only on fréttavél permalinks (not every page).

## Files

- Modify: `web/worker.js` (1 line: `HJALP_FLOKKAR`)
- Create: `gogn/leidrettingar.json` (seed `{updated, items:[]}`)
- Create: `web/src/lib/leidrettingar.mjs` + `web/src/lib/leidrettingar.test.mjs`
- Create: `web/src/pages/frettavel/leidrettingar.astro`
- Modify: `web/src/pages/frettavel/[id].astro` (badge + report form + footer link + client JS + scoped styles)
