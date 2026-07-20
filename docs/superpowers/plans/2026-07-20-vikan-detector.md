# „5 mál vikunnar" (vikan) Roundup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Monday-gated fréttavél roundup item that ranks the week's stories by importance and embeds the top 5 as clickable links on its permalink, for journalists.

**Architecture:** A pure CommonJS selector (`skriptur/vikan_detect.js`) with all dependencies injected (`weightOf`/`catOf`/`asciiId`). `build_frettavel.js`'s async `main()` obtains those from the ESM `frettavel.mjs` via `await import`, ranks the archive on Mondays, and pushes one `noai` `vikan` item. The permalink renders `facts.mal` in a numbered block (mirroring the Söguþráður box). Category metadata added to `CAT`/`SECTIONS`/`WEIGHT`.

**Tech Stack:** Node (CJS build script + ESM libs), node:test, Astro SSG.

## Global Constraints

- Zero worker changes; no new page/route; no email/RSS change; no AI on the roundup itself; no per-story images.
- `vikan_detect.js` is **pure CommonJS with zero imports** — `weightOf`, `catOf`, `asciiId` are all injected via `opts` (a CJS module cannot import the ESM `frettavel-cat.mjs`).
- Exclude digest/meta types from candidates: `EXCLUDE = { vika, thema, vikan, fyrvik, fonix }`.
- Rank by `weightOf(type)` desc, then `date` desc; **≤2 per type**; top **5**; publish only if **≥3** candidates.
- Item: `id: 'vikan-'+todayISO`, `type: 'vikan'`, `noai: true`, `title: '5 mál vikunnar'`, `facts.mal = [{title, slug, cat, emoji, hook, dags}]`; `hook` ≤90 chars; `slug = asciiId(id)`.
- Category exactly: `CAT.vikan = { label: '5 mál vikunnar', emoji: '📰', color: '#f6b13b', img: 'annad', heimild: 'Fréttavél Karp', rule: '…' }`; `WEIGHT.vikan = 9`.
- Tests run with an explicit file path: `node --test <file>` (Windows `node --test <directory>` spawns 0 tests).
- Do NOT run `node skriptur/build_frettavel.js` locally (without `ANTHROPIC_API_KEY` it rewrites AI items to templates). Verify via `node --check`, CAT export, forced-Monday simulation, `astro build`.
- The `vikan` block is Monday-gated (`getUTCDay() === 1`) — a live CI run only emits it on Mondays; verification forces a Monday `todayISO`.
- Shell commands run from the worktree root `C:/Users/aronh/dev/KARP/frettavaktir-wt` (git bash).

---

### Task 1: Pure detector `skriptur/vikan_detect.js` + tests

**Files:**
- Create: `skriptur/vikan_detect.js`
- Test: `skriptur/vikan_detect.test.mjs`

**Interfaces:**
- Consumes: nothing (all deps injected).
- Produces: `pickVikan(items, opts) → null | vikanItem`. `items` = `[{id,type,date,title,text}]`. `opts = { todayISO, weightOf, catOf, asciiId, days=7, n=5, perType=2, min=3 }`. `weightOf: type→number`, `catOf: type→{label,emoji}`, `asciiId: id→string`.

- [ ] **Step 1: Write the failing tests**

Create `skriptur/vikan_detect.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import mod from './vikan_detect.js';
const { pickVikan } = mod;

const W = { vextir: 10, gjaldthrot: 9, verdbolga: 8, domur: 7, styrkur: 6, mark: 3, vika: 5, thema: 8 };
const weightOf = (t) => W[t] || 4;
const catOf = (t) => ({ label: 'L-' + t, emoji: 'E' });
const asciiId = (s) => 'slug-' + String(s);
const BASE = { todayISO: '2026-07-20', weightOf, catOf, asciiId };
const mk = (id, type, date, title = 't', text = 'x') => ({ id, type, date, title, text });

test('excludes digest/meta types and items outside the 7-day window', () => {
  const items = [
    mk('a', 'gjaldthrot', '2026-07-19'), mk('b', 'vextir', '2026-07-18'), mk('c', 'domur', '2026-07-17'),
    mk('m1', 'vika', '2026-07-19'), mk('m2', 'thema', '2026-07-19'), mk('old', 'mark', '2026-07-01'),
  ];
  const slugs = pickVikan(items, BASE).facts.mal.map((m) => m.slug);
  assert.deepEqual(slugs.sort(), ['slug-a', 'slug-b', 'slug-c']);   // meta + old excluded
});

test('ranks by weightOf desc, then date desc', () => {
  const items = [
    mk('low-new', 'mark', '2026-07-19'), mk('high-old', 'vextir', '2026-07-15'), mk('mid', 'domur', '2026-07-18'),
  ];
  const v = pickVikan(items, { ...BASE, min: 1 });
  assert.deepEqual(v.facts.mal.map((m) => m.slug), ['slug-high-old', 'slug-mid', 'slug-low-new']);
});

test('caps at 2 items per type', () => {
  const items = [
    mk('g1', 'gjaldthrot', '2026-07-19'), mk('g2', 'gjaldthrot', '2026-07-18'), mk('g3', 'gjaldthrot', '2026-07-17'),
    mk('d1', 'domur', '2026-07-16'), mk('s1', 'styrkur', '2026-07-15'),
  ];
  const slugs = pickVikan(items, BASE).facts.mal.map((m) => m.slug);
  assert.equal(slugs.filter((s) => s === 'slug-g1' || s === 'slug-g2' || s === 'slug-g3').length, 2);
  assert.ok(!slugs.includes('slug-g3'));   // 3rd gjaldthrot dropped by the cap
  assert.ok(slugs.includes('slug-d1') && slugs.includes('slug-s1'));
});

test('returns null when fewer than min candidates', () => {
  const items = [mk('a', 'gjaldthrot', '2026-07-19'), mk('b', 'domur', '2026-07-18')];
  assert.equal(pickVikan(items, BASE), null);
});

test('caps at n=5 and produces the vikan item shape', () => {
  const longText = 'Þetta er langur texti sem ætti að styttast töluvert í níutíu stafi eða svo, halló halló halló halló meira meira';
  const items = [
    mk('a', 'vextir', '2026-07-19', 'Vaxtafrétt', longText), mk('b', 'gjaldthrot', '2026-07-18'),
    mk('c', 'domur', '2026-07-17'), mk('d', 'styrkur', '2026-07-16'),
    mk('e', 'verdbolga', '2026-07-15'), mk('f', 'mark', '2026-07-14'),
  ];
  const v = pickVikan(items, BASE);
  assert.equal(v.id, 'vikan-2026-07-20');
  assert.equal(v.type, 'vikan');
  assert.equal(v.noai, true);
  assert.equal(v.title, '5 mál vikunnar');
  assert.equal(v.facts.mal.length, 5);
  const first = v.facts.mal[0];
  assert.equal(first.slug, 'slug-a');
  assert.equal(first.cat, 'L-vextir');
  assert.equal(first.emoji, 'E');
  assert.equal(first.dags, '2026-07-19');
  assert.equal(first.title, 'Vaxtafrétt');
  assert.ok(first.hook.length <= 90);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test skriptur/vikan_detect.test.mjs`
Expected: FAIL — `Cannot find module './vikan_detect.js'`.

- [ ] **Step 3: Write the detector**

Create `skriptur/vikan_detect.js`:

```javascript
// vikan_detect.js — hreinn fréttavél-skynjari: „5 mál vikunnar" (vikuleg samantekt). CommonJS; engin import (deps injectuð).
// pickVikan(items, {todayISO, weightOf, catOf, asciiId, days=7, n=5, perType=2, min=3}) → null | vikan-stak.
'use strict';

const EXCLUDE = new Set(['vika', 'thema', 'vikan', 'fyrvik', 'fonix']);

function pickVikan(items, opts) {
  const o = opts || {};
  const days = o.days || 7;
  const n = o.n || 5;
  const perType = o.perType || 2;
  const min = o.min || 3;
  const weightOf = o.weightOf || (() => 0);
  const catOf = o.catOf || (() => ({ label: '', emoji: '' }));
  const asciiId = o.asciiId || ((s) => String(s));
  const cut = new Date(new Date(o.todayISO + 'T00:00:00Z').getTime() - days * 86400000).toISOString().slice(0, 10);

  const seen = new Set();
  const cand = (items || []).filter((it) => {
    if (!it || !it.id || !it.date || !it.title || EXCLUDE.has(it.type) || it.date < cut) return false;
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  cand.sort((a, b) => (weightOf(b.type) - weightOf(a.type)) || String(b.date).localeCompare(String(a.date)));

  const chosen = [];
  const perCount = {};
  for (const it of cand) {
    if (chosen.length >= n) break;
    if ((perCount[it.type] || 0) >= perType) continue;
    perCount[it.type] = (perCount[it.type] || 0) + 1;
    chosen.push(it);
  }
  if (chosen.length < min) return null;

  const mal = chosen.map((it) => {
    const c = catOf(it.type) || {};
    return { title: it.title, slug: asciiId(it.id), cat: c.label || '', emoji: c.emoji || '', hook: String(it.text || '').slice(0, 90).trim(), dags: it.date };
  });

  return {
    id: 'vikan-' + o.todayISO,
    type: 'vikan',
    noai: true,
    url: '/frettavel/',
    title: '5 mál vikunnar',
    text: 'Fimm mál stóðu upp úr í fréttavél Karp vikuna á undan — raðað eftir vægi. Smelltu til að lesa hvert mál.',
    facts: { mal },
  };
}

module.exports = { pickVikan };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test skriptur/vikan_detect.test.mjs`
Expected: PASS — 5 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add skriptur/vikan_detect.js skriptur/vikan_detect.test.mjs
git commit -m "feat(vikan): pure weekly-roundup selector pickVikan + tests"
```

---

### Task 2: Category metadata (CAT / SECTIONS / WEIGHT)

**Files:**
- Modify: `web/src/lib/frettavel-cat.mjs` (add `CAT.vikan`; add `'vikan'` to `SECTIONS` efnahagur)
- Modify: `web/src/lib/frettavel.mjs` (add `vikan: 9` to `WEIGHT`)

**Interfaces:**
- Produces: a `vikan` category available to `catOf`/`weightOf`/permalink/sections/fréttavaktir.

- [ ] **Step 1: Add the CAT entry**

In `web/src/lib/frettavel-cat.mjs`, find the `vika` line in `CAT`:
```javascript
  vika:       { label: 'Vika í tölum', emoji: '📅', color: '#f6b13b', img: 'annad', heimild: 'Samantekt Karp', rule: 'Vikulegur útdráttur lykil-hagtalna (birt á mánudögum).' },
```
Insert directly after it:
```javascript
  vikan:      { label: '5 mál vikunnar', emoji: '📰', color: '#f6b13b', img: 'annad', heimild: 'Fréttavél Karp', rule: 'Vikulegt úrval fimm mikilvægustu mála fréttavélarinnar — raðað eftir vægi (birt á mánudögum).' },
```

- [ ] **Step 2: Add vikan to the efnahagur section**

In `web/src/lib/frettavel-cat.mjs`, find the `efnahagur` section:
```javascript
  { key: 'efnahagur', label: 'Efnahagur', types: ['vextir', 'verdbolga', 'fast', 'atv', 'gengi', 'vika', 'fastthr', 'leiga', 'samanburdur', 'thema'] },
```
Change it to add `'vikan'` right after `'vika'`:
```javascript
  { key: 'efnahagur', label: 'Efnahagur', types: ['vextir', 'verdbolga', 'fast', 'atv', 'gengi', 'vika', 'vikan', 'fastthr', 'leiga', 'samanburdur', 'thema'] },
```

- [ ] **Step 3: Add the WEIGHT entry**

In `web/src/lib/frettavel.mjs`, in the `const WEIGHT = { ... }` object (line 20), find `vika: 5,` and insert `vikan: 9,` immediately after it. Replace the fragment `ees: 5, vika: 5, birgirthrot: 9,` with `ees: 5, vika: 5, vikan: 9, birgirthrot: 9,`.

- [ ] **Step 4: Verify the CAT export**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node -e 'import("./web/src/lib/frettavel-cat.mjs").then(m=>console.log("label:",m.CAT.vikan.label,"| section:",m.sectionOfType("vikan").key))'`
Expected: `label: 5 mál vikunnar | section: efnahagur`.

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node -e 'import("./web/src/lib/frettavel.mjs").then(m=>console.log("weight:",m.weightOf("vikan")))'`
Expected: `weight: 9`.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/frettavel-cat.mjs web/src/lib/frettavel.mjs
git commit -m "feat(vikan): CAT/SECTIONS/WEIGHT category metadata"
```

---

### Task 3: Wire the Monday roundup into `build_frettavel.js`

**Files:**
- Modify: `skriptur/build_frettavel.js` (require `pickVikan`; add the Monday block in `main()`)

**Interfaces:**
- Consumes: `pickVikan` (Task 1); `weightOf`/`catOf`/`asciiId` from `frettavel.mjs` (Task 2 for `vikan`'s own weight/cat); the on-disk `frettavel_archive.json`.
- Produces: a `vikan` item in `events` on Mondays, which flows through publish → archive (with `facts.mal`).

- [ ] **Step 1: Require the detector**

In `skriptur/build_frettavel.js`, after the existing `const { pickThrotlok } = require('./throtlok_detect.js');` line near the top, add:
```javascript
const { pickVikan } = require('./vikan_detect.js');
```

- [ ] **Step 2: Add the Monday roundup block in `main()`**

In `skriptur/build_frettavel.js`, find this exact line in `main()`:
```javascript
  const events = detect(state);
```
Replace it with that line followed by the Monday block:
```javascript
  const events = detect(state);
  // „5 mál vikunnar" — vikuleg samantekt (mánudaga). Raðar safninu (síðustu 7 daga) eftir vægi; noai (fastur listi).
  if (new Date(TODAY + 'T00:00:00Z').getUTCDay() === 1) {
    const { weightOf, catOf, asciiId } = await import('../web/src/lib/frettavel.mjs');
    const arch = (J('frettavel_archive.json') || {}).items || [];
    const vikan = pickVikan([...events, ...arch], { todayISO: TODAY, weightOf, catOf, asciiId });
    if (vikan) events.push(vikan);
  }
```

- [ ] **Step 3: Verify — syntax + forced-Monday simulation**

Syntax (does NOT run the build):
```bash
cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --check skriptur/build_frettavel.js && echo "syntax OK"
```
Expected: `syntax OK`.

Forced-Monday simulation against the real archive (does NOT touch the feed):
```bash
cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node -e '
const { pickVikan } = require("./skriptur/vikan_detect.js");
const A = (require("./web/public/gogn/frettavel_archive.json").items) || [];
import("./web/src/lib/frettavel.mjs").then(({ weightOf, catOf, asciiId }) => {
  const v = pickVikan(A, { todayISO: "2026-07-20", weightOf, catOf, asciiId });
  if (!v) { console.log("(færri en 3 mál — enginn listi)"); return; }
  console.log(v.title, "·", v.id, "· noai:", v.noai);
  v.facts.mal.forEach((m, i) => console.log(" ", (i+1)+".", "[" + m.cat + "]", m.title.slice(0,40), "→ /frettavel/" + m.slug + "/"));
});'
```
Expected: `5 mál vikunnar · vikan-2026-07-20 · noai: true` then up to 5 numbered lines, each a real headline with a `/frettavel/<slug>/` link, spanning ≥2 categories.

- [ ] **Step 4: Commit**

```bash
git add skriptur/build_frettavel.js
git commit -m "feat(vikan): Monday roundup block in main() (await-import weight helpers)"
```

---

### Task 4: Render block in `web/src/pages/frettavel/[id].astro`

**Files:**
- Modify: `web/src/pages/frettavel/[id].astro` (add the vikan render block after the Söguþráður `{thread && …}` block; add scoped styles)

**Interfaces:**
- Consumes: `it.facts.mal` (from Task 1/3, carried into the archive by build_frettavel line 941).
- Produces: a numbered "5 mál vikunnar" list on the vikan permalink.

- [ ] **Step 1: Add the render block**

In `web/src/pages/frettavel/[id].astro`, find these exact closing lines of the Söguþráður block:
```astro
          <div class="fv-thread-status">{thread.status.label}</div>
          <a class="fv-thread-link" href={`/fyrirtaeki/${thread.kt}/`}>Öll gögn félagsins →</a>
        </section>
      )}
```
Replace them with those same four lines followed by the new vikan block (keep the thread block unchanged, append after its `)}`):
```astro
          <div class="fv-thread-status">{thread.status.label}</div>
          <a class="fv-thread-link" href={`/fyrirtaeki/${thread.kt}/`}>Öll gögn félagsins →</a>
        </section>
      )}

      {it.type === 'vikan' && Array.isArray(it.facts?.mal) && (
        <section class="fv-vikan">
          <div class="fv-vikan-h">📰 5 mál vikunnar</div>
          <ol class="fv-vikan-list">
            {it.facts.mal.map((m, i) => (
              <li>
                <span class="fv-vikan-n">{i + 1}</span>
                <div class="fv-vikan-b">
                  <span class="fv-vikan-cat">{m.emoji} {m.cat}</span>
                  <a class="fv-vikan-t" href={`/frettavel/${m.slug}/`}>{m.title}</a>
                  {m.hook && <span class="fv-vikan-hook">{m.hook}</span>}
                  <span class="fv-vikan-d">{m.dags}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
```

- [ ] **Step 2: Add the scoped styles**

In the `<style>` block of `[id].astro`, after the `.fv-thread-link:hover { text-decoration: underline; }` rule (end of the Söguþráður styles), add:
```css
    .fv-vikan { border: 1px solid var(--line); border-left: 3px solid var(--gold); border-radius: 0 12px 12px 0; padding: 14px 18px; margin: 0 0 22px; background: var(--panel); }
    .fv-vikan-h { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--gold); margin-bottom: 12px; }
    .fv-vikan-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; counter-reset: none; }
    .fv-vikan-list li { display: flex; gap: 12px; align-items: flex-start; }
    .fv-vikan-n { flex: none; width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--gold); font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .fv-vikan-b { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .fv-vikan-cat { font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--faint); }
    .fv-vikan-t { font-size: 15px; color: var(--ink); text-decoration: none; line-height: 1.3; }
    .fv-vikan-t:hover { color: var(--gold); }
    .fv-vikan-hook { font-size: 12.5px; color: var(--muted); line-height: 1.4; }
    .fv-vikan-d { font-size: 11px; color: var(--faint); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Verify the build**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt/web && npx astro build 2>&1 | tail -3`
Expected: build completes, no error (~3521+ pages). (No vikan permalink exists in the archive yet — that's fine; the block compiles and renders only when a vikan item is present.)

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/frettavel/[id].astro
git commit -m "feat(vikan): 5 mál vikunnar render block on the permalink"
```

---

## Self-Review

**1. Spec coverage:**
- Pure `pickVikan` (exclude meta, 7-day window, weight+recency rank, 2/type cap, ≥3 gate, top 5, item/facts shape, injected deps) → Task 1 + 5 tests. ✓
- `CAT.vikan` (exact label/emoji/color/img/heimild/rule), `SECTIONS` efnahagur, `WEIGHT.vikan = 9` → Task 2. ✓
- Monday block in async `main()` using `await import` for `weightOf`/`catOf`/`asciiId`, ranks `[...events, ...arch]`, pushes `noai` item → Task 3. ✓
- Permalink render block (numbered list, links, hook, scoped styles) → Task 4. ✓
- Verification (unit tests, node --check, CAT/weight export, forced-Monday simulation, astro build; no local full build) → Task 1 Step 4, Task 2 Step 4, Task 3 Step 3, Task 4 Step 3. ✓
- Constraints: pure/zero-import CJS + injected deps, exclude set, ranking, diversity, gate, item shape, Monday-gate, noai → honored. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**3. Type consistency:** `pickVikan(items, {todayISO,weightOf,catOf,asciiId,days,n,perType,min})` identical in module, tests, and the `build_frettavel.js` call. `facts.mal[].{title,slug,cat,emoji,hook,dags}` produced by Task 1 == consumed by Task 4's render block. `id:'vikan-'+todayISO`, `type:'vikan'`, `noai:true` consistent across module, tests, and the archive-carry (build_frettavel line 941 preserves `facts`). ✓
