# Söguþræðir (story threads) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake a "🕑 Ferill málsins" case-arc box into gjaldþrota-fréttir permalinks, showing that company's Lögbirting progression (beiðni → innköllun → skiptalok) oldest→newest with a you-are-here marker and resolution status.

**Architecture:** Pure build-time. A new fs-free module `soguthraedir.mjs` derives the arc from a news item + `logbirting.json`'s `byKt`. The static Astro permalink page `[id].astro` imports the module and the JSON, computes the thread at build, and renders the box as static HTML. Zero worker changes (the permalink is static Astro, not worker-SSR).

**Tech Stack:** Node ESM, node:test, Astro SSG (`@gogn` JSON import alias).

## Global Constraints

- Zero worker changes; no new `/api` route; no new page; no JSON-LD change.
- `soguthraedir.mjs` is pure and fs-free (no `node:fs`, no network) — trivially unit-testable.
- Thread renders only when the company has **≥2** Lögbirting notices (a single notice is not a thread).
- Notice labels verbatim (from `logbirting.json` `typeLabels`): `gjaldthrot_beidni`→"Gjaldþrotaskiptabeiðni", `skiptabeidni`→"Skiptabeiðni (fyrirtaka)", `innkollun`→"Innköllun þrotabús (kröfulýsing)", `skiptafundur`→"Skiptafundur þrotabús", `skiptalok`→"Skiptalok þrotabús", `felagsslit`→"Félagsslit / afskráning".
- Terminal notice types (mark case done): `skiptalok`, `felagsslit`.
- Steps ordered **oldest→newest**; exactly one step marked `current` (nearest the item date; ties → newest).
- Date format `birt` = `d.m.yyyy` (no leading zeros), e.g. `2.3.2026`.
- Astro default expression escaping only — never `set:html` on item/notice strings.
- Tests run with an explicit file path: `node --test web/src/lib/soguthraedir.test.mjs` (Windows `node --test <dir>` spawns 0 tests — never use a bare directory).
- All shell commands run from the worktree root `C:/Users/aronh/dev/KARP/frettavaktir-wt` (git bash: `cd` first).

---

### Task 1: Pure module `soguthraedir.mjs` + tests

**Files:**
- Create: `web/src/lib/soguthraedir.mjs`
- Test: `web/src/lib/soguthraedir.test.mjs`

**Interfaces:**
- Consumes: nothing (self-contained; local `dmy`/`dayNum` helpers).
- Produces:
  - `threadKey(item) → string | null` — the 10-digit kt for a gjaldþrot item, else null.
  - `caseThread(item, byKt, opts?) → null | { kt: string, n: number, steps: Array<{dags, titill, birt, current}>, status: {done: boolean, label: string} }` — `byKt` is `logbirting.json`'s `byKt` object (`byKt[kt].notices` = `[{type, date, ...}]`). `opts.min` defaults to 2.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/soguthraedir.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { threadKey, caseThread } from './soguthraedir.mjs';

const BYKT = {
  '4102160270': { notices: [
    { type: 'innkollun', date: '2026-05-05' },
    { type: 'innkollun', date: '2026-04-28' },
    { type: 'gjaldthrot_beidni', date: '2026-03-02' },
  ] },
  '1111111111': { notices: [{ type: 'gjaldthrot_beidni', date: '2026-03-02' }] },
  '2222222222': { notices: [
    { type: 'gjaldthrot_beidni', date: '2026-01-10' },
    { type: 'innkollun', date: '2026-02-10' },
    { type: 'skiptalok', date: '2026-06-01' },
  ] },
  '3333333333': { notices: [
    { type: 'gjaldthrot_beidni', date: '2026-05-04' },
    { type: 'innkollun', date: '2026-05-06' },
  ] },
  '4444444444': { notices: [
    { type: 'gjaldthrot_beidni', date: '2026-01-01' },
    { type: 'felagsslit', date: '2026-03-01' },
  ] },
};
const gj = (kt, date = '2026-05-06') => ({ id: `gjaldthrot-116-2026-${kt}`, type: 'gjaldthrot', date });

test('threadKey extracts the 10-digit kt from gjaldþrot ids; null otherwise', () => {
  assert.equal(threadKey(gj('4102160270')), '4102160270');
  assert.equal(threadKey({ id: 'domur-lr-545-2026', type: 'domur' }), null);       // wrong type
  assert.equal(threadKey({ id: 'gjaldthrot-116-2026-123', type: 'gjaldthrot' }), null); // short segment
  assert.equal(threadKey({ id: 'vika-2026-07-20', type: 'vika' }), null);
  assert.equal(threadKey(null), null);
});

test('caseThread returns null below the 2-notice gate / no kt / kt absent', () => {
  assert.equal(caseThread(gj('1111111111'), BYKT), null);            // single notice
  assert.equal(caseThread(gj('9999999999'), BYKT), null);            // kt not in byKt
  assert.equal(caseThread({ id: 'vika-x', type: 'vika', date: '2026-01-01' }, BYKT), null); // no kt
});

test('caseThread orders steps oldest→newest with verbatim labels', () => {
  const t = caseThread(gj('4102160270'), BYKT);
  assert.equal(t.kt, '4102160270');
  assert.equal(t.n, 3);
  assert.deepEqual(t.steps.map((s) => s.dags), ['2026-03-02', '2026-04-28', '2026-05-05']);
  assert.equal(t.steps[0].titill, 'Gjaldþrotaskiptabeiðni');
  assert.equal(t.steps[1].titill, 'Innköllun þrotabús (kröfulýsing)');
  assert.equal(t.steps[0].birt, '2.3.2026');
});

test('exactly one step is current — nearest item date, ties → newest', () => {
  const t = caseThread(gj('4102160270', '2026-05-06'), BYKT);         // nearest 2026-05-05 (last)
  assert.equal(t.steps.filter((s) => s.current).length, 1);
  assert.equal(t.steps[2].current, true);
  const tie = caseThread(gj('3333333333', '2026-05-05'), BYKT);       // equidistant 05-04 / 05-06 → newest
  assert.equal(tie.steps.filter((s) => s.current).length, 1);
  assert.equal(tie.steps[1].current, true);
});

test('status: terminal notice → done + label; else Í ferli', () => {
  assert.deepEqual(caseThread(gj('2222222222'), BYKT).status, { done: true, label: 'Lauk með skiptalokum 1.6.2026' });
  assert.deepEqual(caseThread(gj('4444444444'), BYKT).status, { done: true, label: 'Félagsslit 1.3.2026' });
  assert.deepEqual(caseThread(gj('4102160270'), BYKT).status, { done: false, label: 'Í ferli' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test web/src/lib/soguthraedir.test.mjs`
Expected: FAIL — `Cannot find module './soguthraedir.mjs'` (or export not found).

- [ ] **Step 3: Write the module**

Create `web/src/lib/soguthraedir.mjs`:

```javascript
// soguthraedir.mjs — story-thread case arc for a fréttavél item (build-time, static). Pure; fs-free.
// threadKey: kt out of a gjaldþrot id. caseThread: that company's Lögbirting arc, oldest→newest,
// with a you-are-here step and a resolution status. Returns null below the 2-notice gate.

const LBL = {
  gjaldthrot_beidni: 'Gjaldþrotaskiptabeiðni',
  skiptabeidni: 'Skiptabeiðni (fyrirtaka)',
  innkollun: 'Innköllun þrotabús (kröfulýsing)',
  skiptafundur: 'Skiptafundur þrotabús',
  skiptalok: 'Skiptalok þrotabús',
  felagsslit: 'Félagsslit / afskráning',
};
const TERMINAL = new Set(['skiptalok', 'felagsslit']);

const dmy = (iso) => { const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]}.${+m[2]}.${m[1]}` : String(iso); };
const dayNum = (iso) => { const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN; };

export function threadKey(item) {
  if (!item || typeof item.id !== 'string' || item.type !== 'gjaldthrot') return null;
  const last = item.id.split('-').pop();
  return /^\d{10}$/.test(last) ? last : null;
}

export function caseThread(item, byKt, opts = {}) {
  const min = opts.min || 2;
  const kt = threadKey(item);
  if (!kt) return null;
  const entry = byKt && byKt[kt];
  const notices = ((entry && entry.notices) || []).filter((n) => n && n.date);
  if (notices.length < min) return null;

  const sorted = notices.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))); // oldest→newest

  // current = notice nearest the item date; ties → newest (later index wins via <=)
  const idate = dayNum(item && item.date);
  let curIdx = -1, best = Infinity;
  sorted.forEach((n, i) => { const d = Math.abs(dayNum(n.date) - idate); if (d <= best) { best = d; curIdx = i; } });
  if (curIdx < 0) curIdx = sorted.length - 1; // guarantee exactly one current even if item date is unparsable

  const steps = sorted.map((n, i) => ({ dags: n.date, titill: LBL[n.type] || n.type || 'Lögbirting', birt: dmy(n.date), current: i === curIdx }));

  let terminal = null;
  for (const n of sorted) if (TERMINAL.has(n.type)) terminal = n; // ascending → last match = newest terminal
  const status = terminal
    ? { done: true, label: (terminal.type === 'felagsslit' ? 'Félagsslit ' : 'Lauk með skiptalokum ') + dmy(terminal.date) }
    : { done: false, label: 'Í ferli' };

  return { kt, n: steps.length, steps, status };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test web/src/lib/soguthraedir.test.mjs`
Expected: PASS — 5 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/soguthraedir.mjs web/src/lib/soguthraedir.test.mjs
git commit -m "feat(soguthraedir): pure case-arc module threadKey + caseThread"
```

---

### Task 2: Render the case-arc box in `[id].astro`

**Files:**
- Modify: `web/src/pages/frettavel/[id].astro` (imports at lines 5-8; frontmatter const near line 24; box after line 62; styles in the `<style>` block near line 159)

**Interfaces:**
- Consumes: `caseThread(it, LOGB.byKt)` from Task 1; `LOGB` = `@gogn/logbirting.json` (has `.byKt`).
- Produces: static HTML `<section class="fv-thread">` on permalinks whose item yields a ≥2-notice thread.

- [ ] **Step 1: Add the imports**

In the frontmatter, after the existing `import { hasExport } ...` line (line 8), add:

```astro
import LOGB from '@gogn/logbirting.json';
import { caseThread } from '../../lib/soguthraedir.mjs';
```

- [ ] **Step 2: Compute the thread**

After `const slug = asciiId(it.id);` (line 24), add:

```astro
const thread = caseThread(it, LOGB.byKt);
```

- [ ] **Step 3: Render the box**

Immediately after the `{it.samhengi && ( ... )}` block (closes at line 62), insert:

```astro
      {thread && (
        <section class="fv-thread" style={`--c:${cat.color}`}>
          <div class="fv-thread-h">
            <span>🕑 Ferill málsins</span>
            <span class={`fv-thread-pill ${thread.status.done ? 'done' : 'open'}`}>{thread.status.done ? 'Lokið' : 'Í ferli'}</span>
          </div>
          <ol class="fv-thread-steps">
            {thread.steps.map((s) => (
              <li class={s.current ? 'cur' : ''}>
                <span class="fv-thread-d">{s.birt}</span>
                <span class="fv-thread-t">{s.titill}</span>
                {s.current && <span class="fv-thread-here">þessi frétt</span>}
              </li>
            ))}
          </ol>
          <div class="fv-thread-status">{thread.status.label}</div>
          <a class="fv-thread-link" href={`/fyrirtaeki/${thread.kt}/`}>Öll gögn félagsins →</a>
        </section>
      )}
```

- [ ] **Step 4: Add the scoped styles**

In the `<style>` block, after the `.fv-samhengi p { ... }` rule (line 135), add:

```css
    .fv-thread { border: 1px solid var(--line); border-left: 3px solid var(--c); border-radius: 0 12px 12px 0; padding: 14px 18px; margin: 0 0 22px; background: var(--panel); }
    .fv-thread-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--c); margin-bottom: 12px; }
    .fv-thread-pill { font-size: 11px; font-weight: 700; letter-spacing: .02em; text-transform: none; border-radius: 999px; padding: 2px 10px; }
    .fv-thread-pill.open { color: #d9a441; background: color-mix(in srgb, #d9a441 14%, transparent); border: 1px solid color-mix(in srgb, #d9a441 34%, transparent); }
    .fv-thread-pill.done { color: #42d086; background: color-mix(in srgb, #42d086 14%, transparent); border: 1px solid color-mix(in srgb, #42d086 34%, transparent); }
    .fv-thread-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .fv-thread-steps li { position: relative; padding: 0 0 14px 20px; border-left: 2px solid var(--line); }
    .fv-thread-steps li:last-child { padding-bottom: 0; }
    .fv-thread-steps li::before { content: ''; position: absolute; left: -6px; top: 3px; width: 9px; height: 9px; border-radius: 50%; background: var(--line); }
    .fv-thread-steps li.cur { border-left-color: var(--c); }
    .fv-thread-steps li.cur::before { background: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 22%, transparent); }
    .fv-thread-d { display: block; font-size: 11.5px; color: var(--faint); font-variant-numeric: tabular-nums; }
    .fv-thread-t { font-size: 14px; color: var(--ink); }
    .fv-thread-here { display: inline-block; margin-left: 8px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--c); vertical-align: middle; }
    .fv-thread-status { font-size: 12.5px; color: var(--muted); margin: 10px 0 8px; }
    .fv-thread-link { font-size: 13px; color: var(--gold); text-decoration: none; font-weight: 600; }
    .fv-thread-link:hover { text-decoration: underline; }
```

- [ ] **Step 5: Verify the build is clean**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt/web && npx astro build`
Expected: build completes, ~200+ pages, no error. (The `import LOGB from '@gogn/logbirting.json'` and module import resolve; template compiles.)

- [ ] **Step 6: Verify the render logic against real data (sanity)**

Run this throwaway check (proves the data path end-to-end with production `logbirting.json`, independent of whether any current permalink qualifies):

```bash
cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node -e '
const LOGB=require("./web/public/gogn/logbirting.json");
import("./web/src/lib/soguthraedir.mjs").then(({caseThread})=>{
  const t=caseThread({id:"gjaldthrot-116-2026-4102160270",type:"gjaldthrot",date:"2026-07-19"}, LOGB.byKt);
  console.log(JSON.stringify(t,null,1));
});'
```
Expected: a thread object with `n>=2`, ascending `steps`, one `current:true`, and a `status`.

Then honestly count boxes in the built output:

```bash
cd /c/Users/aronh/dev/KARP/frettavaktir-wt && grep -rl "fv-thread" web/dist/frettavel/ 2>/dev/null | wc -l
```
Expected: may be `0` today (all current gjaldþrota-fréttir map to single-notice kts) — this is correct temporal behavior, not a failure. Report the count.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/frettavel/[id].astro
git commit -m "feat(soguthraedir): bake Ferill málsins case-arc box into fréttavél permalinks"
```

---

## Self-Review

**1. Spec coverage:**
- threadKey (kt from gjaldþrot id) → Task 1. ✓
- caseThread (≥2 gate, oldest→newest, current nearest+tie, terminal status, labels) → Task 1 + tests. ✓
- Build-time render in static [id].astro, `@gogn/logbirting.json` import, box + link to /fyrirtaeki/<kt>/ → Task 2. ✓
- Scoped styles, Astro default escaping → Task 2 (no set:html used). ✓
- Zero worker changes → neither task touches worker.js. ✓
- Verification (unit tests, build clean, honest box count) → Task 1 Step 4, Task 2 Steps 5-6. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**3. Type consistency:** `caseThread(item, byKt)` signature identical in module, tests, and [id].astro call. `thread.steps[].{birt,titill,current}` and `thread.status.{done,label}` and `thread.kt` used in the template match the module's return shape. ✓
