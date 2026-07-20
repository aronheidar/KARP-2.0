# Atburða-tímalína félags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This run: executed INLINE — subagent dispatch is blocked.)

**Goal:** Add a chronological "Atburða-tímalína" (event timeline) to `/fyrirtaeki/<kt>/` — company events (Lögbirting, vörumerki, styrkir, fréttavél) merged and ordered newest-first.

**Architecture:** A pure `buildTimalina()` merges/sorts pre-filtered source arrays. A new worker endpoint `/api/firma-timalina` reads the baked JSON files via `augGet`, filters to the company by kt/name, and calls `buildTimalina`. The `/fyrirtaeki/<kt>/` SSR body (`felagMainHtml`) gains a placeholder section, and the `skel-fyrirtaeki.astro` shell gains a client script that fetches + renders it.

**Tech Stack:** Cloudflare Worker (ES module, bundled via wrangler; push deploys it), Astro SSG shell, `node:test`.

## Global Constraints

- **Pure module is worker-safe:** `web/src/lib/firma-timalina.mjs` imports ONLY `asciiId` from `./frettavel-cat.mjs` (fs-free). No `node:fs`, no other frettavel.mjs import.
- **Slug consistency:** fréttavél event links use `'/frettavel/' + asciiId(it.id) + '/'` (the permalink slug). Raw id in a URL = 404.
- **Reliability marking:** kt-keyed sources (Lögbirting, vörumerki) are exact; name-keyed (styrkir via `matchStyrkir`, fréttir via name substring) are fuzzy — the endpoint returns `aggreidanleiki: { kt:[...], nafn:[...] }`.
- **Do NOT touch** `fyrirtaekiHandler`'s data/tier/paywall logic. Only add a display section to `felagMainHtml` + a script to the shell.
- **Endpoint is login-independent** (public registry data, same as `/fyrirtaeki` already shows).
- **Icelandic** UI copy. Event shape: `{dags, flokkur, titill, lysing?, slod, birt, arGrof?, ar?}`.

---

### Task 1: Pure `buildTimalina` module

**Files:**
- Create: `web/src/lib/firma-timalina.mjs`
- Test: `web/src/lib/firma-timalina.test.mjs`

**Interfaces:**
- Consumes: `asciiId(id)` from `./frettavel-cat.mjs`.
- Produces: `buildTimalina(sources, opts?)` → sorted event array. `sources = {logbirting:[{type,date,court?,url?}], vorumerki:[{titill?,id?,tegund?,skrad}], styrkir:[{sjodur?,upphaed?,ar,verkefni?}], frettir:[{id,date,title}]}`; `opts = {max?}`. Each event: `{dags,flokkur,titill,lysing,slod,birt,arGrof?,ar?}`.

- [ ] **Step 1: Write the failing test** — create `web/src/lib/firma-timalina.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { buildTimalina } from './firma-timalina.mjs';

const SRC = {
  logbirting: [{ type: 'gjaldthrot_beidni', date: '2026-05-10', court: 'Héraðsdómur Reykjavíkur', url: '/lbl/x' }],
  vorumerki: [{ titill: 'GO WITH JAN', tegund: 'orðmerki', skrad: '2026-07-06' }],
  styrkir: [{ sjodur: 'Kvikmyndasjóður', upphaed: 130000000, ar: 2027, verkefni: 'Hafið' }],
  frettir: [{ id: 'gjaldthrot-þor', date: '2026-06-01', title: 'Frétt um félagið' }],
};

test('normalizes each source into events with the right flokkur/slod', () => {
  const ev = buildTimalina(SRC);
  const by = Object.fromEntries(ev.map((e) => [e.flokkur, e]));
  assert.equal(by.gjaldthrot.titill, 'Gjaldþrotaskiptabeiðni');
  assert.equal(by.gjaldthrot.slod, '/lbl/x');
  assert.ok(by.vorumerki.titill.includes('GO WITH JAN'));
  assert.ok(by.styrkur.lysing.includes('130.000.000'));      // þúsundapunktar
  assert.equal(by.frett.slod, '/frettavel/gjaldthrot-thor/');  // asciiId permalink (þ→th)
});

test('sorts newest-first across sources', () => {
  const ev = buildTimalina(SRC);
  const dates = ev.map((e) => e.dags);
  assert.deepEqual(dates, [...dates].sort((a, b) => b.localeCompare(a)));
  assert.equal(ev[0].dags, '2027-01-01');                     // styrkur 2027 newest
});

test('arGrof styrkur shows "Árið <ar>"; frett/logbirting show dd.mm.yyyy', () => {
  const ev = buildTimalina(SRC);
  assert.equal(ev.find((e) => e.flokkur === 'styrkur').birt, 'Árið 2027');
  assert.equal(ev.find((e) => e.flokkur === 'gjaldthrot').birt, '10.5.2026');
});

test('drops events without a date; empty sources → []', () => {
  assert.equal(buildTimalina({ logbirting: [{ type: 'x' }] }).length, 0);   // no date
  assert.deepEqual(buildTimalina({}), []);
});

test('respects max cap', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ id: 'g' + i, date: '2026-01-01', title: 't' }));
  assert.equal(buildTimalina({ frettir: many }, { max: 60 }).length, 60);
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `node --test web/src/lib/firma-timalina.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — create `web/src/lib/firma-timalina.mjs`:

```javascript
// firma-timalina.mjs — sameinar dagsetta atburði félags í eina tímaröð (fyrir /fyrirtaeki/<kt>/). Hreint; worker-öruggt.
import { asciiId } from './frettavel-cat.mjs';

const LBL = { gjaldthrot_beidni: 'Gjaldþrotaskiptabeiðni', skiptabeidni: 'Skiptabeiðni', innkollun: 'Innköllun', skiptalok: 'Skiptalok', skiptafundur: 'Skiptafundur', felagsslit: 'Félagsslit' };
const kr = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dmy = (iso) => { const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]}.${+m[2]}.${m[1]}` : String(iso); };

export function buildTimalina(sources = {}, opts = {}) {
  const max = opts.max || 60;
  const ev = [];
  for (const n of sources.logbirting || []) if (n && n.date) ev.push({ dags: n.date, flokkur: 'gjaldthrot', titill: LBL[n.type] || n.type || 'Lögbirting', lysing: n.court || null, slod: n.url || '/logbirting/' });
  for (const v of sources.vorumerki || []) if (v && v.skrad) ev.push({ dags: v.skrad, flokkur: 'vorumerki', titill: 'Vörumerki skráð: ' + (v.titill || v.id || ''), lysing: v.tegund || null, slod: '/atvinnuvegir/hugverk/' });
  for (const s of sources.styrkir || []) if (s && s.ar) ev.push({ dags: s.ar + '-01-01', arGrof: true, ar: s.ar, flokkur: 'styrkur', titill: 'Styrkur úr ' + (s.sjodur || 'sjóði'), lysing: (s.verkefni ? '„' + s.verkefni + '" · ' : '') + (s.upphaed ? kr(s.upphaed) + ' kr.' : '') || null, slod: '/styrkir/' });
  for (const it of sources.frettir || []) if (it && it.date) ev.push({ dags: it.date, flokkur: 'frett', titill: it.title || '', lysing: null, slod: '/frettavel/' + asciiId(it.id) + '/' });
  ev.sort((a, b) => String(b.dags).localeCompare(String(a.dags)));
  return ev.slice(0, max).map((e) => ({ ...e, birt: e.arGrof ? 'Árið ' + e.ar : dmy(e.dags) }));
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `node --test web/src/lib/firma-timalina.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/firma-timalina.mjs web/src/lib/firma-timalina.test.mjs
git commit -m "feat(timalina): pure buildTimalina merge/sort module + tests"
```

---

### Task 2: Worker endpoint `/api/firma-timalina`

**Files:**
- Modify: `web/worker.js` — add import (`:2`/`:3`), the `firmaTimalinaHandler` function (near `fyrirtaekiHandler`, ~`:2170`), and the route (near `/api/fyrirtaeki`, ~`:3936`).

**Interfaces:**
- Consumes: `buildTimalina` (Task 1), `augGet` (`:80`), `matchStyrkir` (`:2295`), `sjson`.
- Produces: `GET /api/firma-timalina?kt=&nafn=` → `{updated,kt,nafn,n,aggreidanleiki,atburdir}`.

- [ ] **Step 1: Add the import** — in `web/worker.js`, after line 2 (`import { CAT, sectionOfType, asciiId } from './src/lib/frettavel-cat.mjs';`):

```javascript
import { buildTimalina } from './src/lib/firma-timalina.mjs';
```

- [ ] **Step 2: Add the handler** — in `web/worker.js`, just before `async function fyrirtaekiSidaHandler(` (~`:2135`):

```javascript
async function firmaTimalinaHandler(request, env, ctx) {
  const u = new URL(request.url);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  const nafn = (u.searchParams.get('nafn') || '').trim().slice(0, 120);
  if (kt.length !== 10 && !nafn) return sjson({ atburdir: [], n: 0 });
  const [lb, vm, st, arch] = await Promise.all([
    augGet(env, 'logbirting.json').catch(() => null),
    augGet(env, 'vorumerki_nyskrad.json').catch(() => null),
    augGet(env, 'styrkir.json').catch(() => null),
    augGet(env, 'frettavel_archive.json').catch(() => null),
  ]);
  const logbirting = (kt.length === 10 && lb && lb.byKt && lb.byKt[kt] && lb.byKt[kt].notices) || [];
  const vorumerki = (kt.length === 10 && vm && vm.byKt && vm.byKt[kt]) || [];
  let styrkir = [];
  if (st && nafn) { const mm = matchStyrkir(nafn, st); styrkir = (mm.idx || []).map((i) => st.styrkir[i]).filter(Boolean); }
  let frettir = [];
  if (arch && arch.items && nafn) {
    const core = nafn.replace(/\s+(ehf|hf|ohf|slhf|sf|ses)\.?$/i, '').toLowerCase();
    if (core.length >= 3) frettir = arch.items.filter((x) => (((x.title || '') + ' ' + (x.text || '')).toLowerCase().indexOf(core) >= 0));
  }
  const atburdir = buildTimalina({ logbirting, vorumerki, styrkir, frettir });
  return sjson({ updated: new Date().toISOString(), kt, nafn, n: atburdir.length, aggreidanleiki: { kt: ['gjaldthrot', 'vorumerki'], nafn: ['styrkur', 'frett'] }, atburdir });
}
```

- [ ] **Step 3: Add the route** — in `web/worker.js`, next to the existing `if (url.pathname === '/api/fyrirtaeki') return fyrirtaekiHandler(request, env, ctx);` (~`:3936`), add before it:

```javascript
    if (url.pathname === '/api/firma-timalina') return firmaTimalinaHandler(request, env, ctx);
```

- [ ] **Step 4: Verify the worker still loads + bundles.**

Run: `node -e "import('./web/worker.js').then(()=>console.log('OK')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `OK`.

Run: `cd web && npx wrangler deploy --dry-run 2>&1 | tail -4`
Expected: bundles with no error (Total Upload line, no import/resolve error).

- [ ] **Step 5: Commit.**

```bash
git add web/worker.js
git commit -m "feat(timalina): /api/firma-timalina endpoint (augGet baked files + kt/name filter)"
```

---

### Task 3: Timeline section on `/fyrirtaeki/<kt>/` + client render

**Files:**
- Modify: `web/worker.js` — `felagMainHtml` (~`:2103`) add the section.
- Modify: `web/src/pages/skel-fyrirtaeki.astro` — add the client script + styles.

**Interfaces:**
- Consumes: `/api/firma-timalina` (Task 2). The section carries `data-kt`/`data-nafn`; the script fetches + renders.

- [ ] **Step 1: Add the timeline section to the SSR body.** In `web/worker.js` `felagMainHtml`, add this const just before the `return` (after the `links` const):

```javascript
  const timalinaSec = `<div class="kf-sec"><h2>🕑 Atburða-tímalína</h2><div id="fb-timalina" class="kf-tl" data-kt="${e(kt)}" data-nafn="${e(f.nafn)}"><div class="kf-note" style="border:0;padding:0;margin:0">Sæki atburði…</div></div></div>`;
```

Then insert `${timalinaSec}` into the returned template, right after `${arsSec}` and before `${eigTeaser}`:

```javascript
    ${isatSec}${fyrirsvarSec}${arsSec}${timalinaSec}${eigTeaser}${cta}${links}
```

- [ ] **Step 2: Add the client script + styles** to `web/src/pages/skel-fyrirtaeki.astro`, immediately before the closing `</Layout>`:

```astro
  <style>
    .kf-tl-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .kf-tl-list li { padding: 8px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 0 10px 10px 0; }
    .kf-tl-d { font-size: 12px; color: var(--faint); font-weight: 600; }
    .kf-tl-b { font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; margin-left: 6px; }
    .kf-tl-t { font-size: 14px; color: var(--ink); margin-top: 2px; } .kf-tl-t a { color: var(--gold); text-decoration: none; }
    .kf-tl-l { color: var(--muted); font-size: 12.5px; }
  </style>
  <script>
    (function () {
      const el = document.getElementById('fb-timalina');
      if (!el) return;
      const kt = el.dataset.kt || '', nafn = el.dataset.nafn || '';
      const COL = { gjaldthrot: '#e0655f', vorumerki: '#3aa0ff', styrkur: '#42d086', frett: '#9a8c6f' };
      const LBL = { gjaldthrot: 'Lögbirting', vorumerki: 'Vörumerki', styrkur: 'Styrkur', frett: 'Frétt' };
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      fetch('/api/firma-timalina?kt=' + encodeURIComponent(kt) + '&nafn=' + encodeURIComponent(nafn))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const box = document.getElementById('fb-timalina'); if (!box) return;
          const a = (d && d.atburdir) || [];
          if (!a.length) { box.innerHTML = '<div class="kf-note" style="border:0;padding:0;margin:0">Engir skráðir atburðir í tímaröð.</div>'; return; }
          box.innerHTML = '<ul class="kf-tl-list">' + a.map((x) => {
            const c = COL[x.flokkur] || '#888';
            const t = x.slod ? '<a href="' + x.slod + '">' + esc(x.titill) + '</a>' : esc(x.titill);
            return '<li style="border-left:3px solid ' + c + '"><span class="kf-tl-d">' + esc(x.birt) + '</span><span class="kf-tl-b" style="color:' + c + '">' + (LBL[x.flokkur] || x.flokkur) + '</span><div class="kf-tl-t">' + t + (x.lysing ? ' <span class="kf-tl-l">· ' + esc(x.lysing) + '</span>' : '') + '</div></li>';
          }).join('') + '</ul>';
        })
        .catch(() => { const box = document.getElementById('fb-timalina'); if (box && box.closest('.kf-sec')) box.closest('.kf-sec').style.display = 'none'; });
    })();
  </script>
```

- [ ] **Step 3: Verify worker loads + shell builds.**

Run: `node -e "import('./web/worker.js').then(()=>console.log('OK')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `OK`.

Run: `cd web && npx astro build 2>&1 | grep -E "page\(s\) built|error|Error"`
Expected: `… page(s) built …`, no errors (skel-fyrirtaeki.astro with the new script/styles compiles).

- [ ] **Step 4: Verify the section is in the built shell + body template.**

Run: `cd web && grep -c "fb-timalina" dist/skel-fyrirtaeki/index.html` (the script references it) and `node -e "const w=require('fs').readFileSync('worker.js','utf8'); console.log('felagMainHtml has section:', w.includes('id=\"fb-timalina\"') && w.includes('timalinaSec'))"`
Expected: shell grep ≥ 1; worker check prints `true`.

- [ ] **Step 5: Commit.**

```bash
git add web/worker.js web/src/pages/skel-fyrirtaeki.astro
git commit -m "feat(timalina): Atburða-tímalína section on /fyrirtaeki + client render"
```

---

## Deployment note (not a task — for Aron)

Push to `main` deploys BOTH the site (Astro shell) AND the worker (endpoint + `felagMainHtml`) — confirmed this session. After deploy, spot-check a company with Lögbirting history: open `/fyrirtaeki/<kt>/` and confirm the timeline renders, and `GET /api/firma-timalina?kt=<kt>&nafn=<nafn>` returns events.

## Self-review

- **Spec coverage:** §1 pure module → Task 1. §2 endpoint (augGet 4 files, kt/name filter, matchStyrkir, aggreidanleiki) → Task 2. §3 client section+render → Task 3. §4 error handling → Task 1 (drop no-date), Task 2 (`.catch` per augGet), Task 3 (fetch-catch hides section). Reliability marking → Task 2 `aggreidanleiki`. Slug consistency (global) → Task 1 asciiId. Testing → Task 1 unit tests + build/load gates in Tasks 2/3. All covered.
- **Placeholder scan:** no TBD/TODO; full code in every step; commands have expected output.
- **Type consistency:** `buildTimalina(sources,opts)` signature + event fields (`dags,flokkur,titill,lysing,slod,birt,arGrof,ar`) identical across Task 1 (def), Task 2 (caller), Task 3 (renderer reads `birt,flokkur,titill,slod,lysing`). `firmaTimalinaHandler` name identical in Task 2 def + route. `data-kt`/`data-nafn` identical between the section (Task 3.1) and the script (Task 3.2).
