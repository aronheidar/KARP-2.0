# „Þrotabú gert upp" (throtlok) fréttavél-skynjari — Design Spec

**Date:** 2026-07-20
**One line:** New fréttavél news type `throtlok` that fires when a company's bankruptcy estate is wound up (a recent `skiptalok` in Lögbirtingablaðið), landing on kennitala that carry the full arc so the just-shipped Söguþráður "Ferill málsins" box renders with green "Lokið".

## Goal / motivation

The Söguþráður box ([[karp-soguthraedir]]) renders on gjaldþrota-fréttir whose company has ≥2 Lögbirting notices. Today the fréttavél only emits at the **start** of a bankruptcy (skiptabeiðni), when the arc is usually 1 step → 0 boxes visible. Emitting at the **conclusion** (skiptalok) lands on companies with the full arc (beiðni → innköllun → skiptalok = ≥2), so threads appear immediately — and "Þrotabú X gert upp" is itself a distinct, worthwhile news beat.

Feasibility (verified against live `logbirting.json`, generated 2026-07-19): **71 companies** have a `skiptalok` in the last 30 days (one newest per kt); **62 of them have arc ≥2** → box renders. The three newest (what the detector's `max=3` takes) all qualify: Brands ehf (arc 2), On Air ehf (arc 2), and one arc-3 case.

## Decisions (locked in brainstorming)

- **New type `throtlok`** (not a reuse of `gjaldthrot`). Gives its own `≤3/type/day` balance budget so the arc-bearing conclusion items reliably appear instead of competing with the beiðni items under one cap; distinct category label and journalistic beat.
- **Trigger = `skiptalok` only.** Excludes `felagsslit` from the trigger because félagsslit also covers *voluntary* dissolutions — labeling those as a bankruptcy conclusion would be inaccurate. (The box's "Lokið" status logic, which already treats a `felagsslit` that ends a real arc as terminal, is unchanged.)
- **One item per kennitala** (the newest skiptalok), so a company's winding-up is announced once.

## Architecture

Follows the existing fréttavél pattern: `build_frettavel.js` (CommonJS) runs detectors over baked `gogn/*.json` and pushes events into `ev`; a global seen-dedup (`frettavel_seen.json {id: first-seen-date}`) guarantees no item is ever re-sent; a balance step caps `≤3/type/day` and `≤8` in the live stream. The permalink box is already shipped and needs only for `threadKey` to recognize the new type.

### Unit 1 — pure detector `skriptur/throtlok_detect.js` (CommonJS, node:test)

Extracted as a pure, testable function (unlike the inline detectors) so its selection logic is unit-tested. `build_frettavel.js` `require`s it.

```
pickThrotlok(byKt, typeLabels, opts) → Array<item>
```
- `byKt`: `logbirting.json`'s `byKt` (`byKt[kt] = { name, notices: [{type, date, court?, ref?, when?}] }`).
- `typeLabels`: `logbirting.json`'s `typeLabels` map (for the human label).
- `opts`: `{ todayISO, days = 30, max = 3 }` — `todayISO` is passed in (pure; no `Date.now()` inside).
- Logic: for each kt, find `skiptalok` notices with `date >= (todayISO - days)`; keep the **newest** one per kt; collect across all kt; sort by `date` descending; take the first `max`.
- Each result item:
  - `id`: `` `throtlok-${kt}` `` (kt is the last hyphen segment → `threadKey` extracts it; stable → announced once).
  - `type`: `'throtlok'`.
  - `facts`: `{ felag: name, tegund: heiti, domstoll: court || null, dags: date }` where `heiti = typeLabels['skiptalok'] || 'Skiptalok þrotabús'`.
  - `title`: `` `${heiti}: ${name}` `` (e.g. "Skiptalok þrotabús: Brands ehf").
  - `text`: `` `${heiti} — ${name}. Birt í Lögbirtingablaðinu ${date}${court ? ' (' + court + ')' : ''}. Ferill málsins er rakinn hér að neðan.` ``
  - `samhengi`: `` `Eitt af ${totalRecent} þrotabúum lögaðila sem skiptum lauk á í Lögbirtingablaðinu síðustu ${days} daga.` `` where `totalRecent` = number of companies with a recent skiptalok (before the `max` slice).
  - `url`: `'/logbirting/'`.
- A company with no name (`byKt[kt].name` falsy) is skipped (title/text need it). (All 71 current cases have names, but guard anyway.)

### Unit 2 — `threadKey` extension in `web/src/lib/soguthraedir.mjs`

Change the type guard from `item.type !== 'gjaldthrot'` to accept both:
```js
if (!item || typeof item.id !== 'string' || !['gjaldthrot', 'throtlok'].includes(item.type)) return null;
```
Everything else in `soguthraedir.mjs` is unchanged. `caseThread` on a throtlok item (whose kt has a skiptalok) then returns `status.done === true` with label "Lauk með skiptalokum <birt>", and the current step (nearest the item date = the skiptalok date) is the terminal step.

### Unit 3 — category metadata (`build_frettavel.js` integration + CAT wiring)

- `web/src/lib/frettavel-cat.mjs` `CAT`:
  ```
  throtlok: { label: 'Þrotabú gert upp', emoji: '📕', color: '#7f8a9c', img: 'gjaldthrot', heimild: 'Lögbirtingablaðið', rule: 'Skiptum á þrotabúi lögaðila lokið (skiptalok) skv. Lögbirtingablaðinu.' }
  ```
  (reuses the existing `gjaldthrot` image key — no new asset, exactly like `birgirthrot`/`fonix`.)
- `frettavel-cat.mjs` `SECTIONS`: add `'throtlok'` to the `vidskipti` section's `types` array (next to `'gjaldthrot'`).
- `frettavel.mjs` `WEIGHT`: add `throtlok: 8`.
- `skriptur/build_frettavel.js`: `require('./throtlok_detect.js')` at the top with the other requires (both files live in `skriptur/`); add one new detector block right after the gjaldþrot block that reads `lb`/`typeLabels`, calls `pickThrotlok(lb.byKt, lb.typeLabels, { todayISO: TODAY, days: 30, max: 3 })`, and pushes each returned item into `ev`.

## Testing

**`skriptur/throtlok_detect.test.mjs`** (node:test; imports the CJS module via default import):
1. Picks recent skiptalok, newest-per-kt, sorted desc, capped at `max` — assert count, order, and that a kt with two skiptalok yields the newer date.
2. Excludes non-skiptalok terminal types (a `felagsslit`-only kt produces no item) and stale skiptalok (older than `days`).
3. Item shape: `id === 'throtlok-<kt>'`, `type === 'throtlok'`, `title` includes the company name, `facts.dags` is the notice date, `samhengi` reflects `totalRecent`.
4. A kt with no `name` is skipped.

**`web/src/lib/soguthraedir.test.mjs`** (extend the existing file):
5. `threadKey({ id: 'throtlok-4102160270', type: 'throtlok' }) === '4102160270'` (new type recognized); `gjaldthrot` still works; other types still `null`.
6. `caseThread` on a throtlok item whose kt has a `skiptalok` returns `status.done === true` and the terminal step marked `current`.

All existing soguthraedir tests must still pass. No worker tests (no worker touched).

## Verification (live)

- Unit tests above (the correctness gate).
- **Standalone simulation** (does not touch the live feed): a throwaway node script that `require`s `throtlok_detect.js`, runs `pickThrotlok` against the real `web/public/gogn/logbirting.json`, prints the 3 emitted items, and for each calls `caseThread` to confirm a "Lokið" (`status.done`) box with ≥2 steps.
- `astro build` stays clean (CAT/type additions compile; permalink pages for any throtlok archive items build).
- **The real feed publish happens via CI** (`.github/workflows/frettavel-now.yml`, which carries `ANTHROPIC_API_KEY`) — **not** a local `build_frettavel.js` run, which without the key would rewrite existing AI items as template text. After the CI run, spot-check a `karp.is/frettavel/throtlok-<kt>/` permalink for the "Ferill málsins" box with green "Lokið".

## Scope guard (YAGNI — out of v1)

No new image asset (reuse gjaldþrot image); no `felagsslit` trigger; no box-UI change (already shipped); no worker change; no new page; no changes to the existing gjaldþrot (skiptabeiðni) detector.

## Files

- Create: `skriptur/throtlok_detect.js`, `skriptur/throtlok_detect.test.mjs`
- Modify: `web/src/lib/soguthraedir.mjs` (threadKey type set) + `web/src/lib/soguthraedir.test.mjs` (2 tests)
- Modify: `web/src/lib/frettavel-cat.mjs` (CAT.throtlok + SECTIONS vidskipti), `web/src/lib/frettavel.mjs` (WEIGHT.throtlok)
- Modify: `skriptur/build_frettavel.js` (require + detector block)
