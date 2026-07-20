# „5 mál vikunnar" (vikan) — Design Spec

**Date:** 2026-07-20
**One line:** A Monday-gated fréttavél roundup item that ranks the week's most important stories and embeds the top 5 as clickable links on its permalink — for journalists.

**Journalist list item #5** (after #1 Fréttavaktir, #2 Gögn&graf, #3 Atburða-tímalína, #4 Söguþræðir — all live).

## Form (locked in brainstorming)

**A weekly fréttavél roundup *item*** (new Monday-gated `vikan` type). One feed item each Monday whose permalink embeds the week's 5 top stories; it rides the existing feed → permalink → RSS → fréttavaktir → archive pipeline. Each Monday's roundup is permanently archived and citable. The only new surface is a render block on the permalink (mirroring the shipped Söguþráður box).

## Architecture

`build_frettavel.js` is CommonJS; `main()` (line 898) is `async` and calls the sync `detect(state)` then `await aiWrite(published)`. The roundup ranks the *archive* (last 7 days) by importance, which needs `weightOf` (defined in the ESM `web/src/lib/frettavel.mjs`). Because `main()` is async, it obtains `weightOf` via a dynamic `await import('../web/src/lib/frettavel.mjs')` — no WEIGHT duplication — and calls the pure detector, pushing the roundup item into the events before publish. The selection logic is an isolated, unit-tested pure module.

## Unit 1 — pure detector `skriptur/vikan_detect.js` (CommonJS, node:test)

```
pickVikan(items, opts) → null | vikanItem
```
- `items`: an array of fréttavél items `{ id, type, date, title, text }` (the archive ∪ this run's published items).
- `opts`: `{ todayISO, weightOf, catOf, days = 7, n = 5, perType = 2, min = 3 }`. `weightOf` is a function `type → number` and `catOf` a function `type → { label, emoji }` — both injected (pure/testable).
- **Candidate filter:** keep items whose `date >= (todayISO - days)` and whose `type` is NOT in the exclude set `EXCLUDE = { vika, thema, vikan, fyrvik, fonix }` (digests/roundups, not single "mál"). Items missing `id`/`date`/`title` are dropped.
- **Rank:** sort by `weightOf(type)` descending, then `date` descending (newest wins ties).
- **Diversity:** walk the ranked list, skipping an item once `perType` (2) items of its `type` are already chosen; stop at `n` (5).
- **Gate:** if fewer than `min` (3) chosen → return `null` (no roundup this week).
- **Return** one item:
  - `id: 'vikan-' + todayISO`
  - `type: 'vikan'`
  - `noai: true` (deterministic — the 5 real headlines must not be AI-rewritten)
  - `url: '/frettavel/'`
  - `title: '5 mál vikunnar'`
  - `text`: deterministic intro, e.g. `` `Fimm mál stóðu upp úr í fréttavél Karp vikuna á undan — raðað eftir vægi. Smelltu til að lesa hvert mál.` ``
  - `facts: { mal: [ { title, slug, cat, emoji, hook, dags } ... ] }` where per chosen item:
    - `slug`: `asciiId(item.id)` (imported from `frettavel-cat.mjs` — worker-safe, fs-free).
    - `cat`: `CAT[item.type].label` (passed via an injected `catOf`/`labelOf` OR looked up — see below), `emoji`: `CAT[item.type].emoji`.
    - `hook`: `String(item.text || '').slice(0, 90)` (trimmed; the "why it matters" line).
    - `dags`: `item.date`.
- To keep the module pure and avoid an ESM import of the whole CAT, `pickVikan` also accepts `opts.catOf` = a function `type → { label, emoji }`. build_frettavel injects it (from the imported `frettavel.mjs` `catOf`); tests pass a stub. (So `opts` is `{ todayISO, weightOf, catOf, days, n, perType, min }`.)

## Unit 2 — category metadata

- `web/src/lib/frettavel-cat.mjs` `CAT`: add
  ```
  vikan: { label: '5 mál vikunnar', emoji: '📰', color: '#f6b13b', img: 'annad', heimild: 'Fréttavél Karp', rule: 'Vikulegt úrval fimm mikilvægustu mála fréttavélarinnar — raðað eftir vægi (birt á mánudögum).' }
  ```
  (reuses the `annad` image, like `vika`/`thema`.)
- `frettavel-cat.mjs` `SECTIONS`: add `'vikan'` to the `efnahagur` section's `types` (next to `vika`), or a sensible existing section — it is a cross-cutting digest, and `vika` already lives in `efnahagur`.
- `frettavel.mjs` `WEIGHT`: `vikan: 9` (high — a curated roundup should surface near the top; but it is Monday-only so it does not crowd daily items).

## Unit 3 — wire into `build_frettavel.js`

- In the async `main()`, after `const events = detect(state);` and before the seen/publish step, on Mondays only, obtain the ranking helpers and build the roundup:
  ```js
  if (new Date(TODAY + 'T00:00:00Z').getUTCDay() === 1) {
    const { weightOf, catOf } = await import('../web/src/lib/frettavel.mjs');
    const arch = (J('frettavel_archive.json') || {}).items || [];
    const pool = [...events, ...arch];
    const vikan = pickVikan(pool, { todayISO: TODAY, weightOf, catOf });
    if (vikan) events.push(vikan);
  }
  ```
  `require('./vikan_detect.js')` at the top with the other requires. (`events` from `detect` are this run's fresh items; combining with the archive covers the whole week. Placing this in `main()` — not `detect()` — is deliberate: `detect` is sync and cannot `await import`, and the roundup ranks the archive, not this run's raw signals.)
- The `vikan` item is `noai: true`, so it bypasses the `aiWrite` batch (which filters `!e.noai`) — the real headlines stay intact.

## Unit 4 — render block in `web/src/pages/frettavel/[id].astro`

- Import nothing new beyond what's there (the item's `facts.mal` is already on the archive item).
- When `it.type === 'vikan'` and `Array.isArray(it.facts?.mal)`, render a numbered "5 mál vikunnar" list `<ol class="fv-vikan">` — each row: rank number, a category chip (`emoji` + `cat`), the `title` as a link to `/frettavel/<slug>/`, the `hook` on a muted second line, and `dags`. Scoped styles in the page `<style>` block (mirrors the `.fv-thread*` pattern). Astro default escaping only (no `set:html`); the slug is our own `asciiId` output.

## Testing

`skriptur/vikan_detect.test.mjs` (node:test; stub `weightOf`/`catOf`):
1. Excludes the meta types (`vika`/`thema`/`vikan`/`fyrvik`/`fonix`) and items outside the 7-day window.
2. Ranks by `weightOf` then date; a higher-weight older item beats a lower-weight newer one.
3. The 2-per-type diversity cap (given 4 items of one high-weight type + 2 others, the result has ≤2 of that type).
4. The `min`=3 gate: fewer than 3 candidates → `null`.
5. Caps at `n`=5; `facts.mal` entries have `{title, slug, cat, emoji, hook, dags}`, `slug === asciiId(id)`, `hook` ≤90 chars; the item is `noai:true`, `type:'vikan'`, `id:'vikan-<todayISO>'`.

No worker tests (no worker touched). Render/integration verified by:
- A live-data simulation forcing a Monday `todayISO` against the real archive — prints the roundup item and its `facts.mal`.
- `astro build` clean; `frettavel-cat.mjs` exports `vikan`; the permalink block compiles.
- Real publish via the CI workflow (`frettavel-now.yml`); note it is Monday-gated, so an off-Monday CI run will not emit the item — verification uses the forced-Monday simulation.

## Scope guard (YAGNI — out of v1)

No new page/route; no email change (rides the existing weekly digest and RSS); no worker change; no AI for the roundup itself; no per-story images (links only); no configurable N (fixed 5, cap 2/type, gate 3).

## Files

- Create: `skriptur/vikan_detect.js`, `skriptur/vikan_detect.test.mjs`
- Modify: `web/src/lib/frettavel-cat.mjs` (CAT.vikan + SECTIONS), `web/src/lib/frettavel.mjs` (WEIGHT.vikan)
- Modify: `skriptur/build_frettavel.js` (require + Monday roundup block in `main()`)
- Modify: `web/src/pages/frettavel/[id].astro` (vikan render block + scoped styles)
