# „Þrotabú gert upp" (throtlok) Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fréttavél news type `throtlok` that fires on a recent `skiptalok` (bankruptcy estate wound up), landing on kennitala with a full Lögbirting arc so the Söguþráður "Ferill málsins" box renders with green "Lokið".

**Architecture:** A pure CommonJS detector (`skriptur/throtlok_detect.js`) selects the items; `build_frettavel.js` requires it and pushes the results, following the existing inline-detector pattern. `threadKey` in the already-shipped `soguthraedir.mjs` is extended one line to recognize the new type. Category metadata is added to `CAT`/`SECTIONS`/`WEIGHT`.

**Tech Stack:** Node (CommonJS build script + ESM libs), node:test, Astro SSG.

## Global Constraints

- Zero worker changes; no new image asset (reuse the `gjaldthrot` image key); no new page; no box-UI change.
- Trigger on **`skiptalok` only** — never `felagsslit` (avoids mislabeling voluntary dissolutions).
- One item per kennitala: the **newest** recent skiptalok. `id: 'throtlok-<kt>'` (kt is the last hyphen segment).
- `pickThrotlok` is **pure**: no `Date.now()` inside — the caller passes `todayISO`. `skriptur/throtlok_detect.js` is CommonJS (`module.exports`) because `build_frettavel.js` is CommonJS (`require`).
- Category label exactly `'Þrotabú gert upp'`; `emoji: '📕'`, `color: '#7f8a9c'`, `img: 'gjaldthrot'`, `heimild: 'Lögbirtingablaðið'`, `WEIGHT.throtlok = 8`.
- Tests run with an explicit file path: `node --test <file>` (Windows `node --test <directory>` spawns 0 tests — never a bare directory).
- Do NOT run `build_frettavel.js` locally to "verify" — without `ANTHROPIC_API_KEY` it rewrites existing AI items as template text. Verify via `node --check`, the simulation script, and `astro build`. The real publish is the CI workflow.
- Shell commands run from the worktree root `C:/Users/aronh/dev/KARP/frettavaktir-wt` (git bash).

---

### Task 1: Pure detector `skriptur/throtlok_detect.js` + tests

**Files:**
- Create: `skriptur/throtlok_detect.js`
- Test: `skriptur/throtlok_detect.test.mjs`

**Interfaces:**
- Consumes: nothing (self-contained).
- Produces: `pickThrotlok(byKt, typeLabels, opts) → Array<item>`. `byKt` = `logbirting.json`'s `byKt` (`byKt[kt] = { name, notices: [{type,date,court?}] }`). `opts = { todayISO, days = 30, max = 3 }`. Each item: `{ id:'throtlok-<kt>', type:'throtlok', facts:{felag,tegund,domstoll,dags}, url:'/logbirting/', samhengi, title, text }`.

- [ ] **Step 1: Write the failing tests**

Create `skriptur/throtlok_detect.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import mod from './throtlok_detect.js';
const { pickThrotlok } = mod;

const TL = { skiptalok: 'Skiptalok þrotabús', gjaldthrot_beidni: 'Gjaldþrotaskiptabeiðni', felagsslit: 'Félagsslit / afskráning' };
const BYKT = {
  '1000000001': { name: 'Alfa ehf', notices: [
    { type: 'gjaldthrot_beidni', date: '2026-06-20' },
    { type: 'skiptalok', date: '2026-07-10', court: 'Héraðsdómur Reykjavíkur' },
  ] },
  '1000000002': { name: 'Bravó ehf', notices: [
    { type: 'skiptalok', date: '2026-07-05' },
    { type: 'skiptalok', date: '2026-07-12' },
  ] },
  '1000000003': { name: 'Delta ehf', notices: [{ type: 'felagsslit', date: '2026-07-11' }] },
  '1000000004': { name: 'Efla ehf', notices: [{ type: 'skiptalok', date: '2026-05-01' }] },
  '1000000005': { notices: [{ type: 'skiptalok', date: '2026-07-15' }] },
};
const OPTS = { todayISO: '2026-07-20', days: 30, max: 3 };

test('picks recent skiptalok, newest-per-kt, sorted newest-first, capped at max', () => {
  const items = pickThrotlok(BYKT, TL, OPTS);
  assert.deepEqual(items.map((i) => i.id), ['throtlok-1000000002', 'throtlok-1000000001']);
  assert.equal(items[0].facts.dags, '2026-07-12');                 // newest of Bravó's two skiptalok
  assert.equal(pickThrotlok(BYKT, TL, { ...OPTS, max: 1 }).length, 1);
});

test('excludes felagsslit (non-skiptalok terminal) and stale skiptalok', () => {
  const ids = pickThrotlok(BYKT, TL, OPTS).map((i) => i.id);
  assert.ok(!ids.includes('throtlok-1000000003'));                 // felagsslit
  assert.ok(!ids.includes('throtlok-1000000004'));                 // 2026-05-01 is >30d before 2026-07-20
});

test('item shape: id/type/title/facts/samhengi/url', () => {
  const alfa = pickThrotlok(BYKT, TL, OPTS).find((i) => i.id === 'throtlok-1000000001');
  assert.equal(alfa.type, 'throtlok');
  assert.equal(alfa.title, 'Skiptalok þrotabús: Alfa ehf');
  assert.equal(alfa.facts.dags, '2026-07-10');
  assert.equal(alfa.facts.domstoll, 'Héraðsdómur Reykjavíkur');
  assert.equal(alfa.url, '/logbirting/');
  assert.ok(alfa.samhengi.includes('2 þrotabúum'));                // totalRecent = 2 (Alfa + Bravó)
  assert.ok(alfa.samhengi.includes('30 daga'));
});

test('a kennitala with no name is skipped', () => {
  const ids = pickThrotlok(BYKT, TL, OPTS).map((i) => i.id);
  assert.ok(!ids.includes('throtlok-1000000005'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test skriptur/throtlok_detect.test.mjs`
Expected: FAIL — `Cannot find module './throtlok_detect.js'`.

- [ ] **Step 3: Write the detector**

Create `skriptur/throtlok_detect.js`:

```javascript
// throtlok_detect.js — hreinn fréttavél-skynjari: „Þrotabú gert upp" (skiptalok). CommonJS; engin fs/net.
// pickThrotlok(byKt, typeLabels, {todayISO, days=30, max=3}) → fréttastök (nýjasta skiptalok per kt).
'use strict';

function pickThrotlok(byKt, typeLabels, opts) {
  const o = opts || {};
  const days = o.days || 30;
  const max = o.max || 3;
  const cut = new Date(new Date(o.todayISO + 'T00:00:00Z').getTime() - days * 86400000).toISOString().slice(0, 10);
  const heiti = (typeLabels && typeLabels.skiptalok) || 'Skiptalok þrotabús';

  const perKt = {};
  for (const kt of Object.keys(byKt || {})) {
    const entry = byKt[kt] || {};
    if (!entry.name) continue;                                     // þarf nafn í titil/texta
    for (const n of (entry.notices || [])) {
      if (n && n.type === 'skiptalok' && n.date && n.date >= cut) {
        if (!perKt[kt] || n.date > perKt[kt].date) perKt[kt] = { date: n.date, court: n.court || null, name: entry.name };
      }
    }
  }
  const rows = Object.keys(perKt).map((kt) => ({ kt, date: perKt[kt].date, court: perKt[kt].court, name: perKt[kt].name }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalRecent = rows.length;

  return rows.slice(0, max).map((r) => ({
    id: `throtlok-${r.kt}`,
    type: 'throtlok',
    facts: { felag: r.name, tegund: heiti, domstoll: r.court, dags: r.date },
    url: '/logbirting/',
    samhengi: `Eitt af ${totalRecent} þrotabúum lögaðila sem skiptum lauk á í Lögbirtingablaðinu síðustu ${days} daga.`,
    title: `${heiti}: ${r.name}`,
    text: `${heiti} — ${r.name}. Birt í Lögbirtingablaðinu ${r.date}${r.court ? ' (' + r.court + ')' : ''}. Ferill málsins er rakinn hér að neðan.`,
  }));
}

module.exports = { pickThrotlok };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test skriptur/throtlok_detect.test.mjs`
Expected: PASS — 4 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add skriptur/throtlok_detect.js skriptur/throtlok_detect.test.mjs
git commit -m "feat(throtlok): pure skiptalok detector pickThrotlok + tests"
```

---

### Task 2: Extend `threadKey` to recognize `throtlok`

**Files:**
- Modify: `web/src/lib/soguthraedir.mjs:19`
- Test: `web/src/lib/soguthraedir.test.mjs` (append 2 tests)

**Interfaces:**
- Consumes: existing `threadKey`, `caseThread` from `soguthraedir.mjs`; the existing test's `BYKT` (kt `2222222222` has a `skiptalok` on `2026-06-01`).
- Produces: `threadKey` returns the kt for `type === 'throtlok'` ids too.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/lib/soguthraedir.test.mjs` (after the existing tests; reuses the `BYKT` already defined in that file):

```javascript
const tl = (kt, date = '2026-06-02') => ({ id: 'throtlok-' + kt, type: 'throtlok', date });

test('threadKey recognizes the throtlok type', () => {
  assert.equal(threadKey(tl('4102160270')), '4102160270');
  assert.equal(threadKey({ id: 'throtlok-123', type: 'throtlok' }), null);   // short segment
  assert.equal(threadKey(gj('4102160270')), '4102160270');                   // gjaldthrot still works
  assert.equal(threadKey({ id: 'vika-x', type: 'vika' }), null);             // other types still null
});

test('caseThread on a throtlok item → done/Lokið with the skiptalok step current', () => {
  const t = caseThread(tl('2222222222', '2026-06-02'), BYKT);                // kt 2222222222 has a skiptalok 2026-06-01
  assert.equal(t.status.done, true);
  assert.equal(t.status.label, 'Lauk með skiptalokum 1.6.2026');
  assert.equal(t.steps.find((s) => s.current).titill, 'Skiptalok þrotabús');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test web/src/lib/soguthraedir.test.mjs`
Expected: FAIL — the `throtlok` threadKey test fails (returns `null` because the guard rejects the type); `caseThread` throtlok test fails too.

- [ ] **Step 3: Extend the type guard**

In `web/src/lib/soguthraedir.mjs`, change the `threadKey` guard line (line 19):

Old:
```javascript
  if (!item || typeof item.id !== 'string' || item.type !== 'gjaldthrot') return null;
```
New:
```javascript
  if (!item || typeof item.id !== 'string' || !['gjaldthrot', 'throtlok'].includes(item.type)) return null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test web/src/lib/soguthraedir.test.mjs`
Expected: PASS — all tests (the original 5 + 2 new), 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/soguthraedir.mjs web/src/lib/soguthraedir.test.mjs
git commit -m "feat(throtlok): threadKey recognizes throtlok type (Söguþráður renders Lokið)"
```

---

### Task 3: Category metadata + wire the detector into `build_frettavel.js`

**Files:**
- Modify: `web/src/lib/frettavel-cat.mjs` (add `CAT.throtlok`; add `'throtlok'` to `SECTIONS` `vidskipti`)
- Modify: `web/src/lib/frettavel.mjs` (add `throtlok: 8` to `WEIGHT`)
- Modify: `skriptur/build_frettavel.js` (require the detector; push its items)

**Interfaces:**
- Consumes: `pickThrotlok` from Task 1; `threadKey`/`caseThread` (Task 2) via the permalink box at runtime.
- Produces: `throtlok` items in the fréttavél feed; a `throtlok` category available to permalink pages, sections, weighting, and (automatically) Fréttavaktir.

- [ ] **Step 1: Add the CAT entry**

In `web/src/lib/frettavel-cat.mjs`, find the `gjaldthrot` line in `CAT`:
```javascript
  gjaldthrot: { label: 'Gjaldþrot', emoji: '💼', color: '#e0655f', img: 'gjaldthrot', heimild: 'Lögbirtingablaðið', rule: 'Ný gjaldþrotaskiptabeiðni eða skiptabeiðni lögaðila birt í Lögbirtingablaðinu.' },
```
Insert directly after it:
```javascript
  throtlok:   { label: 'Þrotabú gert upp', emoji: '📕', color: '#7f8a9c', img: 'gjaldthrot', heimild: 'Lögbirtingablaðið', rule: 'Skiptum á þrotabúi lögaðila lokið (skiptalok) skv. Lögbirtingablaðinu.' },
```

- [ ] **Step 2: Add throtlok to the `vidskipti` section**

In `web/src/lib/frettavel-cat.mjs`, in `SECTIONS`, find the `vidskipti` entry:
```javascript
  { key: 'vidskipti', label: 'Viðskipti', types: ['mark', 'gjaldthrot', 'spike', 'styrkur', 'vorumerki', 'urslit', 'utbod', 'ivilnun', 'kvoti', 'rikisfe', 'birgirthrot', 'toppar', 'bygging', 'fyrvik', 'fonix'] },
```
Change the `types` array to include `'throtlok'` right after `'gjaldthrot'`:
```javascript
  { key: 'vidskipti', label: 'Viðskipti', types: ['mark', 'gjaldthrot', 'throtlok', 'spike', 'styrkur', 'vorumerki', 'urslit', 'utbod', 'ivilnun', 'kvoti', 'rikisfe', 'birgirthrot', 'toppar', 'bygging', 'fyrvik', 'fonix'] },
```

- [ ] **Step 3: Add the WEIGHT entry**

In `web/src/lib/frettavel.mjs`, in the `WEIGHT` object (line 20), add `throtlok: 8`. Find `gjaldthrot: 9,` inside the `WEIGHT = { ... }` literal and insert `throtlok: 8,` immediately after it:
```javascript
const WEIGHT = { vextir: 10, gjaldthrot: 9, throtlok: 8, stjorntap: 9, verdbolga: 8, radherra: 8, domur: 7, stjorn: 7, spike: 7, atv: 7, lyf: 6, fast: 6, fylgi: 6, styrkur: 6, urslit: 6, glaepir: 6, taep: 6, rebel: 6, einn: 6, utbod: 5, baejarstjori: 5, sendiherra: 5, fjarvist: 5, raedur: 5, ivilnun: 5, vorumerki: 3, mark: 3, sent: 3, gengi: 7, kvoti: 6, ees: 5, vika: 5, birgirthrot: 9, rikisfe: 6, toppar: 6, nefnd: 5, fastthr: 7, leiga: 6, samanburdur: 5, bygging: 5, sveitfe: 6, graent: 5, fyrvik: 6, thema: 8, fonix: 7, eftirlit: 6 };
```

- [ ] **Step 4: Require the detector in `build_frettavel.js`**

In `skriptur/build_frettavel.js`, near the top requires (after `const path = require('path');` on line 21), add:
```javascript
const { pickThrotlok } = require('./throtlok_detect.js');
```

- [ ] **Step 5: Push throtlok items into the feed**

In `skriptur/build_frettavel.js`, find the end of the gjaldþrot detector block (the closing `});` then `}` around line 452-453):
```javascript
    nyleg.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3).forEach((n) => {
      const heiti = (lb.typeLabels || {})[n.type] || n.type;
      ev.push({ id: `gjaldthrot-${n.ref || n.date}-${n.kt}`, type: 'gjaldthrot', facts: { felag: n.nafn, tegund: heiti, domstoll: n.court || null, dags: n.date, fyrirtaka: n.when || null }, url: '/logbirting/',
        samhengi: `Ein af ${nyleg.length} gjaldþrota- og skiptabeiðnum lögaðila sem birst hafa í Lögbirtingablaðinu síðustu 30 daga.`,
        title: `${heiti}: ${n.nafn}`,
        text: `${heiti} vegna ${n.nafn} birtist í Lögbirtingablaðinu ${n.date}${n.court ? ' (' + n.court + ')' : ''}${n.when ? `. Fyrirtaka málsins er ${n.when}` : ''}.` });
    });
  }
```
Insert a new block immediately after that closing `}` (reuses the `lb` already declared just above, which is in function scope):
```javascript

  // ── Þrotabú gert upp (skiptalok, Lögbirtingablaðið) — landar á kt með fullan feril → söguþráður "Lokið" ──
  if (lb && lb.byKt) {
    for (const it of pickThrotlok(lb.byKt, lb.typeLabels, { todayISO: TODAY, days: 30, max: 3 })) ev.push(it);
  }
```

- [ ] **Step 6: Verify — syntax, CAT export, build, and a live-data simulation**

Run each and confirm:

Syntax of the build script (does not execute the build):
```bash
cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --check skriptur/build_frettavel.js && echo "syntax OK"
```
Expected: `syntax OK`.

CAT exports the new type:
```bash
cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node -e 'import("./web/src/lib/frettavel-cat.mjs").then(m=>{console.log("label:",m.CAT.throtlok.label,"| section:",m.sectionOfType("throtlok").key)})'
```
Expected: `label: Þrotabú gert upp | section: vidskipti`.

Live-data simulation — emitted items + the Söguþráður "Lokið" box (does NOT touch the feed):
```bash
cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node -e '
const { pickThrotlok } = require("./skriptur/throtlok_detect.js");
const LOGB = require("./web/public/gogn/logbirting.json");
const items = pickThrotlok(LOGB.byKt, LOGB.typeLabels, { todayISO: new Date().toISOString().slice(0,10), days: 30, max: 3 });
import("./web/src/lib/soguthraedir.mjs").then(({ caseThread }) => {
  for (const it of items) {
    const t = caseThread(it, LOGB.byKt);
    console.log(it.title, "|", t ? (t.n + " skref, status=" + t.status.label) : "(enginn kassi)");
  }
});'
```
Expected: up to 3 lines, each a "Skiptalok þrotabús: <félag>" title with `≥2 skref, status=Lauk með skiptalokum …` (proving the box renders "Lokið").

Astro build stays clean:
```bash
cd /c/Users/aronh/dev/KARP/frettavaktir-wt/web && npx astro build 2>&1 | tail -3
```
Expected: build completes, no error.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/frettavel-cat.mjs web/src/lib/frettavel.mjs skriptur/build_frettavel.js
git commit -m "feat(throtlok): CAT/SECTIONS/WEIGHT + wire skiptalok detector into build_frettavel"
```

---

## Self-Review

**1. Spec coverage:**
- Pure `pickThrotlok` (skiptalok-only, newest-per-kt, max, shape, no-name skip) → Task 1 + tests. ✓
- `threadKey` accepts `throtlok`; `caseThread` throtlok → Lokið → Task 2 + tests. ✓
- `CAT.throtlok` (exact label/emoji/color/img/heimild/rule), `SECTIONS` vidskipti, `WEIGHT.throtlok = 8`, `build_frettavel.js` require + detector block → Task 3. ✓
- Verification (unit tests, node --check, CAT export, simulation with caseThread, astro build; no local full build) → Task 1 Step 4, Task 2 Step 4, Task 3 Step 6. ✓
- Constraints: skiptalok-only, one-per-kt, `id: 'throtlok-<kt>'`, pure (todayISO passed), CJS module, reuse image, zero worker changes → honored across tasks. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**3. Type consistency:** `pickThrotlok(byKt, typeLabels, opts)` identical in module, tests, and the `build_frettavel.js` call. Item shape (`id/type/facts/url/samhengi/title/text`) matches between detector, tests, and what `caseThread`/the feed consume. `id: 'throtlok-<kt>'` → `threadKey` (last hyphen segment, extended to accept `throtlok`) → kt. ✓
