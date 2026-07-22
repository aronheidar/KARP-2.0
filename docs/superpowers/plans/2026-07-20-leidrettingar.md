# Tilkynna villu + Leiðréttingaskrá Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Tilkynna villu" report form on every fréttavél article (reusing `/api/hjalp`) plus an editor-curated public corrections log at `/frettavel/leidrettingar/` with a "Leiðrétt" badge on corrected articles.

**Architecture:** Report = client JS on the static permalink POSTing the existing `/api/hjalp` (one whitelist string added to the worker). Log + badge = build-time from a hand-authored `gogn/leidrettingar.json` (via `@gogn` → repo-root `gogn/`), with a tiny pure lookup module and a new static page.

**Tech Stack:** Astro SSG, Cloudflare Worker (ESM), node:test.

## Global Constraints

- No new `/api` handler — reuse `/api/hjalp` (`hjalpHandler`); the only worker change is adding `'Leiðrétting'` to `HJALP_FLOKKAR`.
- Corrections log is editor-curated: `gogn/leidrettingar.json` seeded `{updated, items:[]}`; reports never auto-publish.
- `leidrettingar.mjs` is pure/fs-free. `@gogn` alias → repo-root `gogn/` (so the data file is `gogn/leidrettingar.json`, git-tracked).
- Report POST body to `/api/hjalp`: `{ nafn, netfang, flokkur:'Leiðrétting', lysing:<templated>, hp:<honeypot>, fra:<url>, innskraning:false, ua }` — matches `hjalpHandler` (requires `nafn`, valid `netfang`, `lysing` 20–4000, honeypot key `hp`).
- Astro pages have no unit tests — verify via `astro build` + rendered-HTML grep + browser; report submission verified live (reuses the working endpoint). Tests run with explicit file paths (`node --test <file>`).
- Astro default expression escaping only (no `set:html`). Shell from worktree root `C:/Users/aronh/dev/KARP/frettavaktir-wt` (git bash); `astro build` from `web/`.

---

### Task 1: Pure module `leidrettingar.mjs` + tests

**Files:**
- Create: `web/src/lib/leidrettingar.mjs`
- Test: `web/src/lib/leidrettingar.test.mjs`

**Interfaces:**
- Produces: `sortedLeidrett(data) → item[]` (items newest-first by `dags`), `leidrettFor(slug, data) → item | null` (newest item whose `slug` matches, else null). `data` = parsed `leidrettingar.json` (`{items:[…]}`).

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/leidrettingar.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { leidrettFor, sortedLeidrett } from './leidrettingar.mjs';

const DATA = { items: [
  { slug: 'a', titill: 'A', dags: '2026-07-10', hvad: 'x' },
  { slug: 'b', titill: 'B', dags: '2026-07-15', hvad: 'y' },
  { slug: 'a', titill: 'A', dags: '2026-07-20', hvad: 'newer' },
] };

test('leidrettFor returns the entry for a slug; newest when multiple; null when absent', () => {
  assert.equal(leidrettFor('b', DATA).titill, 'B');
  assert.equal(leidrettFor('a', DATA).hvad, 'newer');
  assert.equal(leidrettFor('zzz', DATA), null);
  assert.equal(leidrettFor('', DATA), null);
});

test('sortedLeidrett orders by dags desc and tolerates empty/missing items', () => {
  assert.deepEqual(sortedLeidrett(DATA).map((c) => c.dags), ['2026-07-20', '2026-07-15', '2026-07-10']);
  assert.deepEqual(sortedLeidrett({}), []);
  assert.deepEqual(sortedLeidrett({ items: [] }), []);
  assert.deepEqual(sortedLeidrett(null), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test web/src/lib/leidrettingar.test.mjs`
Expected: FAIL — `Cannot find module './leidrettingar.mjs'`.

- [ ] **Step 3: Write the module**

Create `web/src/lib/leidrettingar.mjs`:

```javascript
// leidrettingar.mjs — hrein uppfletting/röðun leiðréttingaskrár. fs-frítt. Deilt af leidrettingar-síðu + [id].astro.
export function sortedLeidrett(data) {
  const items = (data && Array.isArray(data.items)) ? data.items.slice() : [];
  return items.sort((a, b) => String((b && b.dags) || '').localeCompare(String((a && a.dags) || '')));
}

export function leidrettFor(slug, data) {
  if (!slug) return null;
  const items = (data && Array.isArray(data.items)) ? data.items : [];
  let best = null;
  for (const it of items) {
    if (it && it.slug === slug && (!best || String(it.dags || '') > String(best.dags || ''))) best = it;
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --test web/src/lib/leidrettingar.test.mjs`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/leidrettingar.mjs web/src/lib/leidrettingar.test.mjs
git commit -m "feat(leidrettingar): pure corrections lookup/sort module + tests"
```

---

### Task 2: Seed data file + worker whitelist

**Files:**
- Create: `gogn/leidrettingar.json`
- Modify: `web/worker.js` (`HJALP_FLOKKAR`, line 425)

**Interfaces:**
- Produces: the `@gogn/leidrettingar.json` build-time data source (empty log); `'Leiðrétting'` accepted as a `/api/hjalp` category.

- [ ] **Step 1: Create the seed data file**

Create `gogn/leidrettingar.json` with exactly:
```json
{ "updated": "2026-07-20", "items": [] }
```

- [ ] **Step 2: Add 'Leiðrétting' to the worker whitelist**

In `web/worker.js`, replace this exact line:
```javascript
const HJALP_FLOKKAR = ['Greiðslur & áskrift', 'Innskráning & aðgangur', 'Villa í gögnum', 'Annað'];
```
with:
```javascript
const HJALP_FLOKKAR = ['Greiðslur & áskrift', 'Innskráning & aðgangur', 'Villa í gögnum', 'Leiðrétting', 'Annað'];
```

- [ ] **Step 3: Verify**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && node --check web/worker.js && echo "worker syntax OK" && node -e 'const j=require("./gogn/leidrettingar.json"); console.log("json ok, items:", j.items.length)' && grep -c "'Leiðrétting'" web/worker.js`
Expected: `worker syntax OK`, `json ok, items: 0`, and a grep count `1`.

- [ ] **Step 4: Commit**

```bash
git add gogn/leidrettingar.json web/worker.js
git commit -m "feat(leidrettingar): seed corrections data + add Leiðrétting to hjalp whitelist"
```

---

### Task 3: Corrections log page `/frettavel/leidrettingar/`

**Files:**
- Create: `web/src/pages/frettavel/leidrettingar.astro`

**Interfaces:**
- Consumes: `@gogn/leidrettingar.json` (Task 2), `sortedLeidrett` (Task 1).
- Produces: the static page at `/frettavel/leidrettingar/`.

- [ ] **Step 1: Create the page**

Create `web/src/pages/frettavel/leidrettingar.astro`:

```astro
---
// /frettavel/leidrettingar/ — gagnsæ leiðréttingaskrá fréttavélar (ritstjórn-viðhaldið gogn/leidrettingar.json).
import Layout from '../../layouts/Layout.astro';
import LEIDR from '@gogn/leidrettingar.json';
import { sortedLeidrett } from '../../lib/leidrettingar.mjs';
const items = sortedLeidrett(LEIDR);
const desc = 'Leiðréttingaskrá fréttavélar Karp — allar skráðar leiðréttingar á sjálfvirkum gagnafréttum, dagsettar og gagnsæjar.';
const url = 'https://karp.is/frettavel/leidrettingar/';
---
<Layout title="Leiðréttingaskrá — Fréttavél Karp" description={desc} canonical={url}>
  <main data-pg="fv-leidr-page">
    <a class="fv-back" href="/frettavel/">← Fréttavélin</a>
    <h1>🔧 Leiðréttingaskrá</h1>
    <p class="fvl-policy">Fréttavél Karp skrifar sjálfvirkt úr opinberum gögnum. Finnist villa leiðréttum við hana og skráum hér — gagnsætt og dagsett. Sástu villu? Notaðu „🚩 Tilkynna villu" neðst í hverri frétt.</p>
    {items.length === 0 ? (
      <p class="fvl-empty">Engar leiðréttingar hafa verið skráðar enn.</p>
    ) : (
      <ol class="fvl-list">
        {items.map((c) => (
          <li>
            <span class="fvl-d">{c.dags}</span>
            <div class="fvl-b">
              <a class="fvl-t" href={`/frettavel/${c.slug}/`}>{c.titill}</a>
              <span class="fvl-h">{c.hvad}</span>
            </div>
          </li>
        ))}
      </ol>
    )}
  </main>
  <style>
    main[data-pg="fv-leidr-page"] { max-width: 720px; margin: 0 auto; padding: 30px 20px 72px; }
    .fv-back { display: inline-block; font-size: 13px; color: var(--muted); text-decoration: none; margin-bottom: 14px; }
    .fv-back:hover { color: var(--gold); }
    main[data-pg="fv-leidr-page"] h1 { font-size: clamp(24px, 5vw, 32px); margin: 4px 0 12px; color: var(--ink); }
    .fvl-policy { font-size: 14.5px; line-height: 1.6; color: var(--muted); margin: 0 0 24px; }
    .fvl-empty { font-size: 14px; color: var(--faint); border: 1px dashed var(--line); border-radius: 12px; padding: 20px; text-align: center; }
    .fvl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .fvl-list li { display: flex; gap: 14px; align-items: flex-start; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 13px 16px; }
    .fvl-d { flex: none; font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; padding-top: 2px; min-width: 76px; }
    .fvl-b { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .fvl-t { font-size: 15px; color: var(--ink); text-decoration: none; line-height: 1.3; }
    .fvl-t:hover { color: var(--gold); }
    .fvl-h { font-size: 13.5px; color: var(--muted); line-height: 1.5; }
  </style>
</Layout>
```

- [ ] **Step 2: Verify the build + rendered page**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt/web && npx astro build 2>&1 | tail -3`
Expected: build completes, no error.

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && grep -oE "Leiðréttingaskrá|Engar leiðréttingar|fvl-policy" web/dist/frettavel/leidrettingar/index.html | sort -u`
Expected: shows `Engar leiðréttingar`, `Leiðréttingaskrá`, `fvl-policy` (empty-state page renders with the policy).

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/frettavel/leidrettingar.astro
git commit -m "feat(leidrettingar): public corrections log page /frettavel/leidrettingar/"
```

---

### Task 4: Permalink additions in `[id].astro` (badge + report form + footer + JS + styles)

**Files:**
- Modify: `web/src/pages/frettavel/[id].astro`

**Interfaces:**
- Consumes: `@gogn/leidrettingar.json` + `leidrettFor` (Task 1/2); `slug` (already `asciiId(it.id)`); `url` (already the canonical article URL); `/api/hjalp` (Task 2 whitelist).

- [ ] **Step 1: Add imports**

In `web/src/pages/frettavel/[id].astro`, after this line:
```astro
import { caseThread } from '../../lib/soguthraedir.mjs';
```
add:
```astro
import LEIDR from '@gogn/leidrettingar.json';
import { leidrettFor } from '../../lib/leidrettingar.mjs';
```

- [ ] **Step 2: Compute the correction lookup**

After this line:
```astro
const thread = caseThread(it, LOGB.byKt);
```
add:
```astro
const leidr = leidrettFor(slug, LEIDR);
```

- [ ] **Step 3: Add the "Leiðrétt" badge under the headline**

Find this exact block:
```astro
      <h1>{it.title}</h1>
      <p class="fv-body">{it.text}</p>
```
Replace it with:
```astro
      <h1>{it.title}</h1>
      {leidr && (
        <a class="fv-leidr" href="/frettavel/leidrettingar/">🔧 Leiðrétt {leidr.dags}{leidr.hvad ? ' — ' + leidr.hvad : ''}</a>
      )}
      <p class="fv-body">{it.text}</p>
```

- [ ] **Step 4: Add the "Tilkynna villu" form at the foot of the article**

Find this exact block (the end of the data section and the article close):
```astro
        </div>
      )}
    </article>
```
Replace it with (keeps that block, appends the report form before `</article>`):
```astro
        </div>
      )}

      <details class="fv-villa" data-title={it.title} data-url={url}>
        <summary>🚩 Tilkynna villu eða leiðréttingu</summary>
        <form class="fv-villa-form">
          <label>Hvað er rangt?<textarea name="lysing" rows="4" minlength="20" maxlength="4000" required placeholder="Lýstu villunni — og réttu upplýsingunum ef þú veist þær."></textarea></label>
          <div class="fv-villa-row">
            <label>Nafn<input type="text" name="nafn" maxlength="120" required autocomplete="name" /></label>
            <label>Netfang<input type="email" name="netfang" maxlength="160" required autocomplete="email" inputmode="email" /></label>
          </div>
          <input type="text" name="hp" class="fv-villa-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
          <button type="submit">Senda ábendingu</button>
          <p class="fv-villa-msg" hidden></p>
        </form>
      </details>
    </article>
```

- [ ] **Step 5: Add the footer link to the corrections log**

Find this exact fragment inside the `.fv-foot` paragraph:
```astro
<a href="/frettavel.xml">RSS</a>. Engin mannleg ritstjórn
```
Replace it with:
```astro
<a href="/frettavel.xml">RSS</a> · <a href="/frettavel/leidrettingar/">Leiðréttingaskrá</a>. Engin mannleg ritstjórn
```

- [ ] **Step 6: Add scoped styles**

In the `<style>` block, after this line:
```css
    .fv-foot a { color: var(--muted); }
```
add:
```css
    .fv-leidr { display: block; font-size: 13px; color: #d9a441; background: color-mix(in srgb, #d9a441 10%, transparent); border: 1px solid color-mix(in srgb, #d9a441 30%, transparent); border-radius: 10px; padding: 8px 13px; margin: 0 0 16px; text-decoration: none; line-height: 1.45; }
    .fv-leidr:hover { background: color-mix(in srgb, #d9a441 16%, transparent); }
    .fv-villa { margin: 20px 0 6px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
    .fv-villa > summary { cursor: pointer; padding: 12px 16px; font-size: 13.5px; font-weight: 600; color: var(--muted); list-style: none; }
    .fv-villa > summary::-webkit-details-marker { display: none; }
    .fv-villa[open] > summary { border-bottom: 1px solid var(--line); color: var(--ink); }
    .fv-villa-form { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
    .fv-villa-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--faint); }
    .fv-villa-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 480px) { .fv-villa-row { grid-template-columns: 1fr; } }
    .fv-villa-form textarea, .fv-villa-form input { width: 100%; box-sizing: border-box; padding: 9px 11px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 14px; font-family: inherit; }
    .fv-villa-hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
    .fv-villa-form button { align-self: flex-start; background: var(--gold); color: #101623; border: 0; border-radius: 9px; padding: 9px 16px; font-weight: 700; font-size: 13.5px; cursor: pointer; }
    .fv-villa-form button:disabled { opacity: .6; cursor: default; }
    .fv-villa-msg { font-size: 13px; margin: 2px 0 0; }
    .fv-villa-msg.ok { color: #42d086; }
    .fv-villa-msg.err { color: #e0655f; }
```

- [ ] **Step 7: Add the report-form client script**

Find the closing of the existing PNG script and the layout close:
```astro
      } catch (e) { window.open(svgUrl, '_blank'); }
    });
  </script>
</Layout>
```
Replace it with (keeps the PNG script, adds a second isolated script before `</Layout>`):
```astro
      } catch (e) { window.open(svgUrl, '_blank'); }
    });
  </script>

  <script>
    (function () {
      const box = document.querySelector('.fv-villa');
      const form = box && box.querySelector('.fv-villa-form');
      if (!form) return;
      const msg = form.querySelector('.fv-villa-msg');
      const show = (t, ok) => { msg.hidden = false; msg.textContent = t; msg.className = 'fv-villa-msg ' + (ok ? 'ok' : 'err'); };
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nafn = form.nafn.value.trim(), netfang = form.netfang.value.trim(), lysing = form.lysing.value.trim();
        if (!nafn) return show('Sláðu inn nafnið þitt.', false);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(netfang)) return show('Sláðu inn gilt netfang.', false);
        if (lysing.length < 20) return show('Lýstu villunni aðeins nánar (a.m.k. 20 stafir).', false);
        const btn = form.querySelector('button');
        btn.disabled = true; btn.textContent = 'Sendi…';
        const body = 'LEIÐRÉTTING við fréttavélar-frétt.\nFrétt: ' + (box.dataset.title || '') + '\nSlóð: ' + (box.dataset.url || '') + '\n\nHvað er rangt / hvað á að leiðrétta:\n' + lysing;
        let d = null;
        try {
          const r = await fetch('/api/hjalp', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ nafn, netfang, flokkur: 'Leiðrétting', lysing: body, hp: form.hp.value, fra: box.dataset.url || '', innskraning: false, ua: navigator.userAgent.slice(0, 300) }) });
          d = await r.json().catch(() => null);
        } catch (e) {}
        btn.disabled = false; btn.textContent = 'Senda ábendingu';
        if (d && d.ok) { form.innerHTML = '<p class="fv-villa-msg ok">Takk — ábendingin er komin til ritstjórnar.</p>'; }
        else if (d && d.error === 'rate') show('Of margar sendingar — reyndu aftur eftir smá stund.', false);
        else show('Eitthvað fór úrskeiðis. Sendu beint á hjalp@karp.is ef þetta heldur áfram.', false);
      });
    })();
  </script>
</Layout>
```

- [ ] **Step 8: Verify the build + rendered permalink**

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt/web && npx astro build 2>&1 | tail -3`
Expected: build completes, no error.

Run: `cd /c/Users/aronh/dev/KARP/frettavaktir-wt && f=$(ls web/dist/frettavel/*/index.html | grep -v leidrettingar | head -1); grep -oE "fv-villa|Tilkynna villu|Leiðréttingaskrá" "$f" | sort -u`
Expected: shows `Leiðréttingaskrá` (footer link), `Tilkynna villu`, `fv-villa` — the report form + footer link rendered on a normal article. (The "Leiðrétt" badge does not render while `items` is empty — correct; it appears once an entry is added. The controller additionally submits a test report live after deploy.)

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/frettavel/[id].astro
git commit -m "feat(leidrettingar): Tilkynna villu form + Leiðrétt badge + footer link on permalink"
```

---

## Self-Review

**1. Spec coverage:**
- Pure `leidrettFor`/`sortedLeidrett` + tests → Task 1. ✓
- Seed `gogn/leidrettingar.json` + `HJALP_FLOKKAR` +'Leiðrétting' → Task 2. ✓
- Corrections log page (policy + empty-state + list, SEO) → Task 3. ✓
- Permalink: badge (build-time via `leidrettFor`), report form → `/api/hjalp` with templated `lysing`+`flokkur:'Leiðrétting'`+honeypot, footer link, isolated client JS, scoped styles → Task 4. ✓
- Verification (unit tests, worker `node --check`, astro build + rendered-HTML greps, live report submission) → Tasks 1/2/3/4 verify steps. ✓
- Constraints (reuse `/api/hjalp`, editor-curated, no auto-publish, Astro escaping, pure module) → honored. ✓

**2. Placeholder scan:** No TBD/TODO; complete code in every step. ✓

**3. Type consistency:** `leidrettFor(slug, data)`/`sortedLeidrett(data)` identical across module, tests, page, and permalink. Entry fields `{slug, titill, dags, hvad}` produced by the seed schema == consumed by the log page rows and the badge. The POST body keys match `hjalpHandler`'s reads (`nafn`, `netfang`, `flokkur`, `lysing`, `hp`, `fra`, `innskraning`, `ua`). Class names in Task 4 markup (`fv-leidr`, `fv-villa`, `fv-villa-form`, `fv-villa-row`, `fv-villa-hp`, `fv-villa-msg`) match the added styles and the client JS selectors. ✓
