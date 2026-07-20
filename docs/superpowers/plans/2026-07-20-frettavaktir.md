# Fréttavaktir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in karp.is users subscribe to Karp-fréttir by category and/or keyword and receive an email (strax/daglegt/vikulegt) when matching news breaks.

**Architecture:** Subscriptions live in D1 `user_prefs` under a new key `frettavakt`. A pure matcher + email builder + cadence/merge helpers are added as **named exports in `web/worker.js`** (following the existing `export function tengslGrunnurEnrich` pattern that `web/test/*.test.mjs` import). The worker `scheduled()` 3-hour cron runs the matcher after `newsIngest` and emails via the existing `sendGmail`. A "Fréttavaktir" section in Mitt svæði writes the blob through a dedicated `/api/u/frettavakt` handler. `CAT`/`SECTIONS` are extracted to a pure module so the worker (which cannot import the `node:fs`-using `frettavel.mjs`) can group/validate.

**Tech Stack:** Cloudflare Worker (ES modules, bundled by `wrangler deploy`), D1 (`TENGSL`), Astro, `node:test`, Gmail REST (`sendGmail`).

## Global Constraints

- **Worker is `web/worker.js`** (`name = "karp21"`), deployed via `wrangler deploy` from `web/` (NOT on git push). It is one monolithic ES module with `export default { scheduled, fetch }` plus named `export function`s used by tests.
- **The worker must NOT import `web/src/lib/frettavel.mjs`** — that file imports `node:fs`/`node:path`/`node:url` (for `scanVariants`), which crash in the Workers runtime. Import the new pure `frettavel-cat.mjs` instead.
- **Tests** are `*.test.mjs` using `node:test` + `node:assert`, run with `node --test <path>`. Worker-logic tests import named exports from `../worker.js` (see `web/test/tengsl-enrich.test.mjs`).
- **All `/api/u/*` POSTs require login** — `userDataHandler` returns `{error:'login'}` when `uid===0` (`web/worker.js:3039`). Do not weaken this.
- **`sendGmail` soft-fails** when `GMAIL_*` secrets are absent (returns `{ok:false, unconfigured:true}`) — callers must not throw.
- **Icelandic** UI copy and email content. Code identifiers in English/existing style.
- **Constants:** `MAX_PER_EMAIL = 30`, `SEEN_CAP = 300`, cadence gates `daglegt = 20h`, `vikulegt = 6.5d`, default cadence `'daglegt'`.

---

### Task 1: Extract `CAT` + `SECTIONS` to a pure module

Splits the fs-free category data out of `frettavel.mjs` so the worker and the matcher/UI can import it without pulling in `node:fs`. All existing importers of `frettavel.mjs` keep working via re-export.

**Files:**
- Create: `web/src/lib/frettavel-cat.mjs`
- Modify: `web/src/lib/frettavel.mjs:10` (CAT), `:72` (SECTIONS)

**Interfaces:**
- Produces: `export const CAT` (object, ~40 keys `{label,emoji,color,img,imgFb?,heimild,rule}`), `export const SECTIONS` (array of `{key,label,types:string[]}`), `export const sectionOfType = (t) => SECTIONS entry containing t, else SECTIONS[0]`.

- [ ] **Step 1: Create the pure module by moving the two literals.**

Cut the entire `export const CAT = { … };` block (frettavel.mjs:10 through its closing `};`) and the `export const SECTIONS = [ … ];` block (:72 through its closing `];`) out of `frettavel.mjs` and paste them into a new file `web/src/lib/frettavel-cat.mjs`. Add the pure helper. Result:

```javascript
// frettavel-cat.mjs — hrein flokka-gögn (engin node:fs). Deilt af frettavel.mjs, worker.js og Mitt svæði.
export const CAT = {
  // …(óbreytt innihald flutt óbreytt úr frettavel.mjs)…
};
export const SECTIONS = [
  // …(óbreytt innihald flutt óbreytt úr frettavel.mjs)…
];
const _SEC_OF = {}; SECTIONS.forEach((s) => s.types.forEach((t) => { _SEC_OF[t] = s; }));
export const sectionOfType = (t) => _SEC_OF[t] || SECTIONS[0];
```

- [ ] **Step 2: Re-export from `frettavel.mjs` so existing importers are unaffected.**

At the top of `web/src/lib/frettavel.mjs` (after the existing `import fs …` lines), add an import + re-export where the two literals used to be:

```javascript
import { CAT, SECTIONS } from './frettavel-cat.mjs';
export { CAT, SECTIONS };
```

Leave everything else in `frettavel.mjs` (`SEC_OF`, `sectionOf`, `catOf`, `WEIGHT`, `imgFor`, …) unchanged — those still reference the now-imported `CAT`/`SECTIONS`.

- [ ] **Step 3: Verify nothing broke — the site still builds.**

Run: `cd web && npx astro build 2>&1 | grep -E "page\(s\) built|error|Error"`
Expected: `… page(s) built …` with no `error`/`Error` lines (frettavel.astro + frettavel/[id].astro still resolve `CAT`, `SECTIONS`, `sectionOf`, `catOf`, `weightOf`).

- [ ] **Step 4: Verify the pure module has no node deps.**

Run: `node -e "import('./web/src/lib/frettavel-cat.mjs').then(m=>console.log('CAT keys', Object.keys(m.CAT).length, '| SECTIONS', m.SECTIONS.length, '| sectionOfType(\"gjaldthrot\")', m.sectionOfType('gjaldthrot').key))"`
Expected: prints `CAT keys 40ish | SECTIONS 5 | sectionOfType("gjaldthrot") vidskipti` with no `node:fs` error.

- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/frettavel-cat.mjs web/src/lib/frettavel.mjs
git commit -m "refactor(frettavel): extract CAT+SECTIONS to fs-free frettavel-cat.mjs"
```

---

### Task 2: `frettavaktMatch` pure matcher

The core matching logic: given feed items + RSS news rows + a subscription context, return the new, deduped, matching items.

**Files:**
- Modify: `web/worker.js` (add named export + import CAT set is NOT needed here; matcher is data-only)
- Test: `web/test/frettavakt.test.mjs`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `export function frettavaktMatch(feedItems, newsRows, ctx)` where `feedItems` = array of `{id,date,type,title,text,url}`, `newsRows` = array of `{url,title,body,source,ts}`, `ctx = {flokkar:string[], ord:string[], seenIds:string[]}`. Returns array of `{id,date,type,title,text,url,source?}` newest-first, deduped against `seenIds`, length ≤ `MAX_PER_EMAIL` (30).

- [ ] **Step 1: Write the failing test.**

Create `web/test/frettavakt.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { frettavaktMatch } from '../worker.js';

const FEED = [
  { id: 'gjaldthrot-1', date: '2026-07-20', type: 'gjaldthrot', title: 'Gjaldþrot Alfa ehf.', text: 'Beiðni birt', url: '/logbirting/' },
  { id: 'utbod-1', date: '2026-07-20', type: 'utbod', title: 'Nýtt útboð', text: 'Vegagerðin', url: '/utbod/' },
  { id: 'mark-1', date: '2026-07-19', type: 'mark', title: 'Marel hækkar', text: 'Kauphöll', url: '/markadir/' },
];
const NEWS = [
  { url: 'https://mbl.is/a', title: 'Marel kynnir uppgjör', body: 'gott ár', source: 'mbl.is', ts: 1 },
];

test('flokkar: matches feed items whose type is subscribed', () => {
  const r = frettavaktMatch(FEED, NEWS, { flokkar: ['gjaldthrot', 'utbod'], ord: [], seenIds: [] });
  assert.deepEqual(r.map((x) => x.id).sort(), ['gjaldthrot-1', 'utbod-1']);
});

test('ord: matches title+text of feed AND news (case-insensitive)', () => {
  const r = frettavaktMatch(FEED, NEWS, { flokkar: [], ord: ['marel'], seenIds: [] });
  assert.deepEqual(r.map((x) => x.id).sort(), ['https://mbl.is/a', 'mark-1']);
});

test('dedup: excludes ids already in seenIds', () => {
  const r = frettavaktMatch(FEED, NEWS, { flokkar: ['gjaldthrot'], ord: [], seenIds: ['gjaldthrot-1'] });
  assert.equal(r.length, 0);
});

test('union: an item matched by BOTH flokkar and ord appears once', () => {
  const r = frettavaktMatch(FEED, NEWS, { flokkar: ['mark'], ord: ['marel'], seenIds: [] });
  assert.equal(r.filter((x) => x.id === 'mark-1').length, 1);
});

test('cap: never returns more than 30', () => {
  const big = Array.from({ length: 50 }, (_, i) => ({ id: 'g' + i, date: '2026-07-20', type: 'gjaldthrot', title: 't', text: '', url: '/x/' }));
  const r = frettavaktMatch(big, [], { flokkar: ['gjaldthrot'], ord: [], seenIds: [] });
  assert.equal(r.length, 30);
});

test('empty: no subscription → no matches', () => {
  assert.equal(frettavaktMatch(FEED, NEWS, { flokkar: [], ord: [], seenIds: [] }).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `node --test web/test/frettavakt.test.mjs`
Expected: FAIL — `frettavaktMatch` is not exported from `../worker.js` (import error / undefined).

- [ ] **Step 3: Implement the matcher as a named export in `web/worker.js`.**

Add near the other fréttavél/digest helpers (e.g. just above `digestShared`, around `web/worker.js:3263`). Place `MAX_PER_EMAIL` here so all frettavakt code shares it:

```javascript
// ── Fréttavaktir (news alerts) ────────────────────────────────────────────────
export const MAX_PER_EMAIL = 30;
export function frettavaktMatch(feedItems, newsRows, ctx) {
  const flokkar = new Set(ctx.flokkar || []);
  const ord = (ctx.ord || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  const seen = new Set(ctx.seenIds || []);
  const hitsOrd = (hay) => { const h = String(hay || '').toLowerCase(); return ord.some((w) => h.indexOf(w) >= 0); };
  const out = new Map();                                        // id → item (dedup + union)
  for (const it of feedItems || []) {
    if (!it || !it.id || seen.has(it.id)) continue;
    if (flokkar.has(it.type) || (ord.length && hitsOrd((it.title || '') + ' ' + (it.text || '')))) out.set(it.id, it);
  }
  if (ord.length) for (const n of newsRows || []) {
    if (!n || !n.url || seen.has(n.url) || out.has(n.url)) continue;
    if (hitsOrd((n.title || '') + ' ' + (n.body || ''))) out.set(n.url, { id: n.url, date: (n.ts ? new Date(n.ts * 1000).toISOString().slice(0, 10) : ''), type: 'frett', title: n.title, text: '', url: n.url, source: n.source });
  }
  return [...out.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, MAX_PER_EMAIL);
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `node --test web/test/frettavakt.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit.**

```bash
git add web/worker.js web/test/frettavakt.test.mjs
git commit -m "feat(frettavakt): pure frettavaktMatch matcher + tests"
```

---

### Task 3: `frettavaktDue` cadence gate

Decides, per user, whether an email is due this cron run based on their cadence and last-sent time.

**Files:**
- Modify: `web/worker.js`
- Test: `web/test/frettavakt.test.mjs` (append)

**Interfaces:**
- Produces: `export function frettavaktDue(cadence, lastSent, now)` → boolean. `now`/`lastSent` are epoch seconds.

- [ ] **Step 1: Write the failing test (append to `web/test/frettavakt.test.mjs`).**

```javascript
import { frettavaktDue } from '../worker.js';
const NOW = 1_000_000; const H = 3600; const D = 86400;

test('strax: always due', () => {
  assert.equal(frettavaktDue('strax', NOW - 1, NOW), true);
  assert.equal(frettavaktDue('strax', NOW, NOW), true);
});
test('daglegt: due only after ~20h', () => {
  assert.equal(frettavaktDue('daglegt', NOW - 19 * H, NOW), false);
  assert.equal(frettavaktDue('daglegt', NOW - 21 * H, NOW), true);
});
test('vikulegt: due only after ~6.5d', () => {
  assert.equal(frettavaktDue('vikulegt', NOW - 6 * D, NOW), false);
  assert.equal(frettavaktDue('vikulegt', NOW - 7 * D, NOW), true);
});
test('never sent (falsy lastSent): due', () => {
  assert.equal(frettavaktDue('daglegt', 0, NOW), true);
  assert.equal(frettavaktDue('vikulegt', undefined, NOW), true);
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `node --test web/test/frettavakt.test.mjs`
Expected: FAIL — `frettavaktDue` not exported.

- [ ] **Step 3: Implement (in `web/worker.js`, next to `frettavaktMatch`).**

```javascript
export function frettavaktDue(cadence, lastSent, now) {
  if (!lastSent) return true;
  const dt = now - lastSent;
  if (cadence === 'strax') return true;
  if (cadence === 'vikulegt') return dt >= 6.5 * 86400;
  return dt >= 20 * 3600;                                       // daglegt (default)
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `node --test web/test/frettavakt.test.mjs`
Expected: PASS (all tests incl. the 4 new).

- [ ] **Step 5: Commit.**

```bash
git add web/worker.js web/test/frettavakt.test.mjs
git commit -m "feat(frettavakt): frettavaktDue cadence gate + tests"
```

---

### Task 4: `frettavaktMerge` — security-safe blob merge

The endpoint must never let the frontend overwrite server-controlled `seenIds`/`lastSent`, and must validate `flokkar`/`cadence`.

**Files:**
- Modify: `web/worker.js`
- Test: `web/test/frettavakt.test.mjs` (append)

**Interfaces:**
- Produces: `export function frettavaktMerge(existing, body, validTypes)` → `{on,flokkar,cadence,lastSent,seenIds}`. `validTypes` is a `Set` of allowed category keys.

- [ ] **Step 1: Write the failing test (append).**

```javascript
import { frettavaktMerge } from '../worker.js';
const VALID = new Set(['gjaldthrot', 'utbod', 'mark']);

test('merge: takes on/flokkar/cadence from body, filters invalid types', () => {
  const m = frettavaktMerge({}, { on: true, flokkar: ['gjaldthrot', 'bogus', 'utbod'], cadence: 'strax' }, VALID);
  assert.equal(m.on, true);
  assert.deepEqual(m.flokkar, ['gjaldthrot', 'utbod']);
  assert.equal(m.cadence, 'strax');
});
test('merge: PRESERVES server-controlled seenIds/lastSent even if body sends them', () => {
  const existing = { on: true, flokkar: [], cadence: 'daglegt', lastSent: 999, seenIds: ['a', 'b'] };
  const m = frettavaktMerge(existing, { on: false, flokkar: [], cadence: 'daglegt', lastSent: 0, seenIds: [] }, VALID);
  assert.equal(m.lastSent, 999);
  assert.deepEqual(m.seenIds, ['a', 'b']);
});
test('merge: invalid cadence falls back to existing (or daglegt)', () => {
  assert.equal(frettavaktMerge({ cadence: 'vikulegt' }, { cadence: 'hourly' }, VALID).cadence, 'vikulegt');
  assert.equal(frettavaktMerge({}, { cadence: 'hourly' }, VALID).cadence, 'daglegt');
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `node --test web/test/frettavakt.test.mjs`
Expected: FAIL — `frettavaktMerge` not exported.

- [ ] **Step 3: Implement (in `web/worker.js`).**

```javascript
export function frettavaktMerge(existing, body, validTypes) {
  const e = existing || {}; const b = body || {};
  const flokkar = (Array.isArray(b.flokkar) ? b.flokkar : []).filter((t) => validTypes.has(t)).slice(0, 60);
  const cadence = ['strax', 'daglegt', 'vikulegt'].indexOf(b.cadence) >= 0 ? b.cadence : (e.cadence || 'daglegt');
  return { on: !!b.on, flokkar, cadence, lastSent: e.lastSent || 0, seenIds: Array.isArray(e.seenIds) ? e.seenIds : [] };
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `node --test web/test/frettavakt.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/worker.js web/test/frettavakt.test.mjs
git commit -m "feat(frettavakt): frettavaktMerge (preserves seenIds/lastSent) + tests"
```

---

### Task 5: `frettavaktEmail` HTML builder

Builds the alert email body, grouped by section, with links to article pages.

**Files:**
- Modify: `web/worker.js` (add `import { CAT, SECTIONS, sectionOfType } from './src/lib/frettavel-cat.mjs';` at top — the worker's first import; safe under wrangler/esbuild and node)
- Test: `web/test/frettavakt.test.mjs` (append)

**Interfaces:**
- Consumes: `CAT`, `sectionOfType` (Task 1).
- Produces: `export function frettavaktEmail(matches)` → HTML `string`.

- [ ] **Step 1: Write the failing test (append).**

```javascript
import { frettavaktEmail } from '../worker.js';

test('email: contains a link to each match article + its title', () => {
  const html = frettavaktEmail([
    { id: 'gjaldthrot-1', type: 'gjaldthrot', title: 'Gjaldþrot Alfa ehf.', url: '/logbirting/' },
    { id: 'frett:x', type: 'frett', title: 'Marel uppgjör', url: 'https://mbl.is/a', source: 'mbl.is' },
  ]);
  assert.ok(html.includes('Gjaldþrot Alfa ehf.'));
  assert.ok(html.includes('karp.is/frettavel/gjaldthrot-1/'));   // fréttavél item → article page
  assert.ok(html.includes('mbl.is/a'));                          // external news → its own url
  assert.ok(/Stilla vaktir/.test(html));                         // footer settings link
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `node --test web/test/frettavakt.test.mjs`
Expected: FAIL — `frettavaktEmail` not exported.

- [ ] **Step 3: Add the import at the top of `web/worker.js`** (before `const PROXIES`):

```javascript
import { CAT, SECTIONS, sectionOfType } from './src/lib/frettavel-cat.mjs';
```

- [ ] **Step 4: Implement `frettavaktEmail` (in `web/worker.js`).**

```javascript
export function frettavaktEmail(matches) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bySec = new Map();
  for (const m of matches) { const sec = m.type === 'frett' ? { key: 'frett', label: 'Fjölmiðlar' } : sectionOfType(m.type); const a = bySec.get(sec.label) || []; a.push(m); bySec.set(sec.label, a); }
  const rows = [...bySec.entries()].map(([label, items]) => {
    const li = items.map((m) => {
      const href = m.type === 'frett' ? esc(m.url) : ('https://karp.is/frettavel/' + esc(m.id) + '/');
      const badge = m.type === 'frett' ? esc(m.source || 'frétt') : ((CAT[m.type] || {}).label || m.type);
      return `<li style="margin:0 0 8px"><a href="${href}" style="color:#8a5e00;text-decoration:none;font-weight:600">${esc(m.title)}</a> <span style="color:#888;font-size:12px">· ${esc(badge)}</span></li>`;
    }).join('');
    return `<h3 style="font-size:14px;margin:16px 0 6px;color:#4a3a1e">${esc(label)}</h3><ul style="padding-left:18px;margin:0">${li}</ul>`;
  }).join('');
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;color:#222">
    <p style="font-size:15px">Ný mál á vöktunum þínum hjá Karp:</p>
    ${rows}
    <p style="margin-top:22px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px">
      <a href="https://karp.is/mitt-svaedi/#p-still" style="color:#8a5e00">Stilla vaktir</a> · Fréttavél Karp — sjálfvirkt fundið úr opinberum gögnum.
    </p></div>`;
}
```

- [ ] **Step 5: Run test to verify it passes.**

Run: `node --test web/test/frettavakt.test.mjs`
Expected: PASS.

- [ ] **Step 6: Verify the worker still bundles (import didn't break it).**

Run: `cd web && npx wrangler deploy --dry-run --outdir /tmp/wkr 2>&1 | tail -5`
Expected: bundles with no import/resolve error (a dry-run does not deploy). If `wrangler` is unavailable in the environment, instead run `node -e "import('./web/worker.js').then(()=>console.log('worker module loads OK'))"` and expect `worker module loads OK`.

- [ ] **Step 7: Commit.**

```bash
git add web/worker.js web/test/frettavakt.test.mjs
git commit -m "feat(frettavakt): frettavaktEmail HTML builder + worker imports frettavel-cat"
```

---

### Task 6: `/api/u/frettavakt` endpoint

Read/write the subscription blob, using `frettavaktMerge` so the frontend cannot corrupt `seenIds`/`lastSent`.

**Files:**
- Modify: `web/worker.js` — inside `userDataHandler` (`:3031`), add a dedicated branch next to `/follows` (`:3049`) / `/ktwatch` (`:3124`). Also add the `FRETTA_TYPES` set once near the frettavakt helpers.

**Interfaces:**
- Consumes: `frettavaktMerge` (Task 4), `_prefGet`/`_prefSet` (`:3010`), `CAT` (Task 1).
- Produces: `GET /api/u/frettavakt` → `{on,flokkar,cadence}`; `POST` (login required) → `{ok:true,on,flokkar,cadence}`.

- [ ] **Step 1: Add the `FRETTA_TYPES` set** near the frettavakt helpers in `web/worker.js`:

```javascript
const FRETTA_TYPES = new Set(Object.keys(CAT));
```

- [ ] **Step 2: Add the endpoint branch inside `userDataHandler`** (place it just before the generic `_U_BLOBS` handling at `web/worker.js:3042`, so the dedicated handler wins). `uid`, `method`, `path`, `body` are already in scope in that function; POSTs already require `uid` (`:3039`):

```javascript
if (path === '/frettavakt') {
  const cur = await _prefGet(env, uid, 'frettavakt', { on: false, flokkar: [], cadence: 'daglegt', lastSent: 0, seenIds: [] });
  if (method === 'POST') {
    const merged = frettavaktMerge(cur, body, FRETTA_TYPES);
    await _prefSet(env, uid, 'frettavakt', merged);
    return _ajson({ ok: true, on: merged.on, flokkar: merged.flokkar, cadence: merged.cadence });
  }
  return _ajson({ on: cur.on, flokkar: cur.flokkar, cadence: cur.cadence });   // never echo seenIds/lastSent
}
```

- [ ] **Step 3: Verify the worker still loads (module + branch syntax).**

Run: `node -e "import('./web/worker.js').then(()=>console.log('OK')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `OK`.

- [ ] **Step 4: Manual integration check (after Aron deploys, or note for deploy).**

Add a note to the commit body: after `wrangler deploy`, logged-in POST to `/api/u/frettavakt` with `{on:true,flokkar:['gjaldthrot'],cadence:'strax'}` returns `{ok:true,...}`, and a second POST with `flokkar` changed but `seenIds:['x']` in body does NOT change the stored `seenIds` (verify via a follow-up GET reflecting only on/flokkar/cadence). This is covered structurally by the Task 4 unit test; runtime verification is manual.

- [ ] **Step 5: Commit.**

```bash
git add web/worker.js
git commit -m "feat(frettavakt): dedicated /api/u/frettavakt endpoint (merge-safe)"
```

---

### Task 7: `frettavaktCron` + wire into `scheduled()`

The orchestration that runs every 3h: load feed + news, iterate subscribers, gate by cadence, match, email, update state.

**Files:**
- Modify: `web/worker.js` — add `frettavaktCron`; change `scheduled()` (`:3748`).

**Interfaces:**
- Consumes: `frettavaktMatch`, `frettavaktDue`, `frettavaktEmail`, `_dget` (`:3226`), `newsSince` (`:3407`), `_prefGet`/`_prefSet`, `sendGmail` (`:2946`), `SEEN_CAP`.
- Produces: `export async function frettavaktCron(env)` (no return value; sends emails as side effect).

- [ ] **Step 1: Add `SEEN_CAP` + implement `frettavaktCron` (in `web/worker.js`).**

```javascript
export const SEEN_CAP = 300;
export async function frettavaktCron(env) {
  if (!env || !env.TENGSL) return;
  const now = Math.floor(Date.now() / 1000);
  const feed = await _dget(env, '/gogn/frettavel.json').catch(() => null);
  const items = (feed && feed.items) || [];
  const news = await newsSince(env, 2, 500).catch(() => []);
  const subs = await env.TENGSL.prepare("SELECT user_id, v FROM user_prefs WHERE k='frettavakt' AND v LIKE '%\"on\":true%'").all().catch(() => null);
  for (const row of (subs && subs.results) || []) {
    try {
      const sub = JSON.parse(row.v);
      if (!sub.on || !frettavaktDue(sub.cadence, sub.lastSent, now)) continue;
      // Byggja leitarorð úr núverandi vöktum: leitvakt.ord + nöfn úr follows ("co:<nafn>").
      const lv = await _prefGet(env, row.user_id, 'leitvakt', {});
      const fl = await _prefGet(env, row.user_id, 'follows', []);
      const ord = [].concat(Array.isArray(lv.ord) ? lv.ord : [], (Array.isArray(fl) ? fl : []).filter((x) => String(x).indexOf('co:') === 0).map((x) => String(x).slice(3))).filter(Boolean);
      const matches = frettavaktMatch(items, news, { flokkar: sub.flokkar || [], ord, seenIds: sub.seenIds || [] });
      if (!matches.length) continue;
      const u = await env.TENGSL.prepare('SELECT email, name FROM users WHERE id=?').bind(row.user_id).first().catch(() => null);
      if (!u || !u.email) continue;
      const r = await sendGmail(env, { to: u.email, subject: `🔔 Fréttavakt: ${matches.length === 1 ? '1 nýtt mál' : matches.length + ' ný mál'}`, html: frettavaktEmail(matches) });
      if (!r.ok) continue;                                       // óstillt/villa → reyna aftur næst (ekki uppfæra stöðu)
      const seen = [...matches.map((m) => m.id), ...(sub.seenIds || [])].slice(0, SEEN_CAP);
      await _prefSet(env, row.user_id, 'frettavakt', Object.assign({}, sub, { seenIds: seen, lastSent: now }));
    } catch (e) { /* eins notanda villa fellir ekki hina */ }
  }
}
```

- [ ] **Step 2: Wire it into `scheduled()`** (`web/worker.js:3748`). Run it AFTER `newsIngest` (so fresh news is in D1). Change the `else` branch:

```javascript
  async scheduled(event, env, ctx) {
    if (event.cron === '10 8 * * 1') ctx.waitUntil(digestRun(env));
    else ctx.waitUntil(newsIngest(env).then(() => frettavaktCron(env)));   // F7 ingest → vakt-alerts
  },
```

- [ ] **Step 3: Verify the worker still loads.**

Run: `node -e "import('./web/worker.js').then(m=>console.log('exports', ['frettavaktCron','frettavaktMatch','frettavaktEmail','frettavaktDue','frettavaktMerge'].filter(k=>typeof m[k]==='function').join(','))).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `exports frettavaktCron,frettavaktMatch,frettavaktEmail,frettavaktDue,frettavaktMerge`.

- [ ] **Step 4: Commit.**

```bash
git add web/worker.js
git commit -m "feat(frettavakt): frettavaktCron in scheduled() 3h branch (ingest→alert)"
```

---

### Task 8: Mitt svæði "Fréttavaktir" UI section

Lets a logged-in user pick categories (grouped by section), choose cadence, toggle on/off, saved via `/api/u/frettavakt`.

**Files:**
- Modify: `web/src/pages/mitt-svaedi.astro` — add a section + client wiring near the existing vakt code (`paintVaktYfirlit` ~:557, `wireDigest` ~:568). Import CAT/SECTIONS in the frontmatter.

**Interfaces:**
- Consumes: `CAT`, `SECTIONS` (Task 1); client helpers `karpGet('/frettavakt')`, `karpPost('/frettavakt', body)` (already defined in the page); `window.KARP_USER.loggedIn`.

- [ ] **Step 1: Import category data in the Astro frontmatter** (top `---` block of `mitt-svaedi.astro`):

```javascript
import { CAT, SECTIONS } from '../lib/frettavel-cat.mjs';
```

- [ ] **Step 2: Render the section markup** (server-rendered checkboxes grouped by SECTIONS). Add inside the settings section `#p-still` (`:151-207`), after the existing vakt overview:

```astro
<div id="fv-vakt" class="card" style="margin-top:14px">
  <h3>🔔 Fréttavaktir</h3>
  <p class="dim" style="font-size:13px">Veldu fréttaflokka og fáðu tölvupóst þegar nýtt mál kviknar. Flokkarnir bera innbyggða fréttnæmis-þröskulda.</p>
  <div id="fv-login" hidden class="dim">Skráðu þig inn til að setja upp fréttavaktir.</div>
  <div id="fv-body" hidden>
    {SECTIONS.map((sec) => (
      <fieldset style="border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:8px 0">
        <legend style="font-size:12px;color:var(--muted)">{sec.label}</legend>
        {sec.types.map((t) => CAT[t] && (
          <label style="display:inline-flex;align-items:center;gap:5px;margin:3px 10px 3px 0;font-size:13px">
            <input type="checkbox" class="fv-cb" value={t} /> {CAT[t].emoji} {CAT[t].label}
          </label>
        ))}
      </fieldset>
    ))}
    <div style="margin-top:10px">
      <label style="font-size:13px">Tíðni:
        <select id="fv-cadence">
          <option value="strax">Strax (allt að 3 klst)</option>
          <option value="daglegt" selected>Daglegt yfirlit</option>
          <option value="vikulegt">Vikulegt</option>
        </select>
      </label>
      <label style="margin-left:14px;font-size:13px"><input type="checkbox" id="fv-on" /> Kveikt</label>
      <button id="fv-save" class="btn" style="margin-left:14px">Vista</button>
      <span id="fv-status" class="dim" style="margin-left:10px;font-size:12px"></span>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Wire the client logic** — add to the page's inline `<script>` (near `paintVaktYfirlit`/`wireDigest`), and call `wireFrettavakt(loggedIn)` wherever those are called:

```javascript
async function wireFrettavakt(loggedIn) {
  const body = document.getElementById('fv-body'), login = document.getElementById('fv-login');
  if (!body) return;
  if (!loggedIn) { body.hidden = true; if (login) login.hidden = false; return; }
  login.hidden = true; body.hidden = false;
  const cur = await karpGet('/frettavakt').catch(() => null) || { on: false, flokkar: [], cadence: 'daglegt' };
  const set = new Set(cur.flokkar || []);
  document.querySelectorAll('.fv-cb').forEach((cb) => { cb.checked = set.has(cb.value); });
  document.getElementById('fv-cadence').value = cur.cadence || 'daglegt';
  document.getElementById('fv-on').checked = !!cur.on;
  document.getElementById('fv-save').onclick = async (e) => {
    e.target.disabled = true;
    const flokkar = [...document.querySelectorAll('.fv-cb')].filter((c) => c.checked).map((c) => c.value);
    const on = document.getElementById('fv-on').checked;
    const cadence = document.getElementById('fv-cadence').value;
    const r = await karpPost('/frettavakt', { on, flokkar, cadence }).catch(() => null);
    document.getElementById('fv-status').textContent = (r && r.ok) ? 'Vistað ✓' : 'Villa — reyndu aftur';
    e.target.disabled = false;
  };
}
```

- [ ] **Step 4: Verify the site builds with the new section.**

Run: `cd web && npx astro build 2>&1 | grep -E "page\(s\) built|error|Error"`
Expected: `… page(s) built …`, no errors. (`mitt-svaedi.astro` imports `../lib/frettavel-cat.mjs` and renders the grouped checkboxes.)

- [ ] **Step 5: Commit.**

```bash
git add web/src/pages/mitt-svaedi.astro
git commit -m "feat(frettavakt): Mitt svæði Fréttavaktir section (category picker + cadence)"
```

---

## Deployment note (not a task — for Aron)

The worker changes go live only via `cd web && npx wrangler deploy` (not on git push). After deploy, the 3-hourly cron begins matching; test end-to-end by setting up a vakt as a logged-in user with `cadence:'strax'` and confirming one alert email on the next cron run. Astro/page changes (Mitt svæði) deploy via the normal git push → Cloudflare rebuild.

## Self-review

- **Spec coverage:** §1 Geymsla → Task 6 (endpoint) + Task 4 (merge preserves seenIds/lastSent). §2 Mátari → Task 2. §3 Cron → Task 7 (+ Task 3 cadence). §4 Tölvupóstur → Task 5. §5 Viðmót → Task 8. §6 Villumeðferð/spam → Task 2 (cap), Task 7 (soft-fail, per-user try/catch, seenIds cap). CAT/SECTIONS worker-import constraint → Task 1. All covered.
- **Placeholder scan:** no TBD/TODO; every code step has full code; commands have expected output.
- **Type consistency:** `frettavaktMatch(feedItems,newsRows,ctx)`, `frettavaktDue(cadence,lastSent,now)`, `frettavaktMerge(existing,body,validTypes)`, `frettavaktEmail(matches)`, `frettavaktCron(env)` — signatures identical across tasks and call sites. `MAX_PER_EMAIL`/`SEEN_CAP`/`FRETTA_TYPES` defined once, referenced consistently.
