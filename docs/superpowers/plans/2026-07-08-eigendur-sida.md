# Sjálfstæð /eigendur/-síða (Endanlegir eigendur / UBO) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standalone `/eigendur/` page that reuses the live UBO engine (extracted into one shared module) with its own company search, open sample, and per-report gating — without breaking `/fyrirtaeki/`.

**Architecture:** Extract the UBO report engine (currently inline in `web/src/pages/fyrirtaeki.astro`) into a single shared module `web/src/lib/ubo-report.js` + shared styles `web/src/styles/ubo.css`. Both `/fyrirtaeki/` and the new `/eigendur/` import and call the same module — no duplicated logic. `/fyrirtaeki/` keeps its embedded report (re-pointed at the module) and gains a link to `/eigendur/`.

**Tech Stack:** Astro 7 (SSG), vanilla client-side ESM (`<script>` with `import`), Cloudflare Worker (`worker.js`, unchanged), auth via `web/src/lib/auth.js`.

## Global Constraints

- **Language:** ALL UI strings in Icelandic.
- **Theme:** dark; accent gold `#f6b13b`; text `#eaf1fb`/`#cdd6e6`; muted `#8fa0b8`. (Already encoded in the moved `.eig-*` CSS — do not restyle.)
- **No new dependencies.** No frontend test framework (none exists). Verification = `cd web && npx astro build` (must be GREEN) + `node --check web/worker.js` + preview.
- **Page count:** build currently emits **197** pages; after adding `/eigendur/` it MUST be **198**.
- **Worker / payment / data pipeline UNCHANGED:** `/api/eigendur/request`, `kind=eigendur` @ 990 kr (`PRICE_EIGENDUR`), `hasReport('eigendur:'+kt)`, `web/public/gogn/eigendur/*.json`, `skriptur/build_eigendur.mjs`.
- **Legal/privacy:** public data only; the sources clause (`eigSources`) is carried verbatim in the moved code — do not weaken it.
- **Branch:** work on `claude/upbeat-newton-0017a5`; commit per task; do NOT push to `main`. Commits flow into draft PR #8.

## Extraction convention (READ FIRST)

Several functions move **verbatim** from `fyrirtaeki.astro` into `ubo-report.js`. For those, this plan gives the **exact source line range** to cut, not a re-typed copy (re-typing risks silent drift). When a step says "move lines A–B verbatim," open `fyrirtaeki.astro`, copy those exact bytes, and paste them unchanged except where the step calls out a specific edit. All **new** glue code (module API, the page, imports, wiring) is written out in full.

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `web/src/lib/ubo-report.js` | UBO engine (data + SVG net + tables) and public API: `mountUboReport`, `renderUboSample`, `uboOwned` |
| Create | `web/src/styles/ubo.css` | Shared `.eig-*` report styles + search-box/hits styles + print rules |
| Create | `web/src/pages/eigendur.astro` | The standalone page: intro + search + host + `?syni=1`/`?q=` handling |
| Modify | `web/src/pages/fyrirtaeki.astro` | Remove inline UBO JS + `.eig-*` CSS; import + call the module; add "Sjá fulla eigendaskýrslu →" link |
| Modify | `web/src/layouts/Layout.astro:17` | Add nav link in Karp+ group |

---

## Task 1: Shared UBO module (`web/src/lib/ubo-report.js`)

**Files:**
- Create: `web/src/lib/ubo-report.js`

**Interfaces:**
- Consumes: `./auth.js` → `isAdmin()`, `hasReport(key)`, `karpCheckout({kind,ref,key})`.
- Produces (used by Tasks 3 & 4):
  - `uboOwned(kt: string) => boolean`
  - `mountUboReport({ kt: string, nafn: string, hostEl: HTMLElement, navTo?: (kt:string)=>void }) => void`
  - `renderUboSample(hostEl: HTMLElement, opts?: { navTo?: (kt:string)=>void }) => Promise<object|void>`

- [ ] **Step 1: Create the module header + private helpers**

Create `web/src/lib/ubo-report.js` starting with:

```js
// ── 🔗 Endanlegir eigendur (UBO) — sameiginleg skýrsluvél ────────────────────
// Dregið út úr fyrirtaeki.astro (LOTA 111) svo /fyrirtaeki/ OG /eigendur/ noti
// sömu vél. Engin tvítekin rökvísi. Public API neðst.
import { isAdmin, hasReport, karpCheckout } from './auth.js';

const escF = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ktFmt = (kt) => (kt && kt.length === 10 ? kt.slice(0, 6) + '-' + kt.slice(6) : kt || '');
const eigPctFmt = (n) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ',') + '%');
```

(These three helpers are copied from `fyrirtaeki.astro:441-442,677` so the module is self-contained. `escF`/`ktFmt` remain in `fyrirtaeki.astro` too — 1-line utilities, not "UBO logic".)

- [ ] **Step 2: Move the engine functions verbatim**

From `fyrirtaeki.astro`, copy **lines 678–814 verbatim** and paste them below the helpers. That block is exactly these functions, in order: `eigTable`, `eigRaunv`, `eigHluthafar`, `eigPie`, `eigLegend`, `eigSources`, `eigNet`, `eigWireNet(rep, nav)`, `eigData(kt, owned)`, `eigReport`, `eigMount(rep, host, nav)`. Do **not** re-type them; they depend only on `escF`, `ktFmt`, `eigPctFmt` (now module-scoped). Do **not** copy line 677 (`eigPctFmt`) again — it is already defined in Step 1.

- [ ] **Step 3: Append the public API**

Add at the end of the file:

```js
// ── Public API ───────────────────────────────────────────────────────────────
export function uboOwned(kt) { return isAdmin() || hasReport('eigendur:' + kt); }

function uboCtaHtml(kt, nafn) {
  return '<div class="eig-cta"><b>🔗 Endanlegir eigendur</b>'
    + '<span>Full, litakóðuð eignarhaldsskýrsla: endanlegir eigendur í gegnum allar félagakeðjur, raunverulegir eigendur, hluthafalisti og prentvæn PDF — sérskýrsla eins og hjá Creditinfo.</span>'
    + '<div class="eig-cta-btns"><button type="button" class="eig-buy" data-kt="' + escF(kt) + '" data-nafn="' + escF(nafn || '') + '">🛒 Kaupa eigenda-skýrslu — 990 kr</button>'
    + '<a class="eig-sample" href="/eigendur/?syni=1">👁️ Sjá sýnishorn</a></div></div>';
}

function wireBuy(hostEl, kt, nafn) {
  const buy = hostEl.querySelector('.eig-buy'); if (!buy) return;
  buy.addEventListener('click', async () => {
    const orig = buy.textContent; buy.disabled = true; buy.textContent = '⏳ Opna greiðslu…';
    const res = await karpCheckout({ kind: 'eigendur', ref: (nafn || '') + ' ' + kt, key: 'eigendur:' + kt });
    if (res === 'redirected') return;
    buy.textContent = res === 'unconfigured' ? 'Greiðslur opna fljótlega' : 'Ekki tókst — reyndu aftur';
    buy.disabled = false; setTimeout(() => { buy.textContent = orig; }, 2800);
  });
}

const defaultNav = (kt) => { try { location.href = '/eigendur/?q=' + encodeURIComponent(kt); } catch (e) {} };

// Heildar-flæði: gátun → (990 kr CTA | sótt+poll → net+töflur). hostEl er tómur gámur.
export function mountUboReport({ kt, nafn, hostEl, navTo }) {
  if (!hostEl) return;
  const nav = navTo || defaultNav;
  if (!uboOwned(kt)) { hostEl.innerHTML = uboCtaHtml(kt, nafn); wireBuy(hostEl, kt, nafn); return; }
  hostEl.innerHTML = '<div class="eig-loading">🔗 Sæki endanlega eigendur…</div>';
  let tries = 0;
  const tick = async () => {
    const d = await eigData(kt, true);
    if (d && !d.pending && !d.engin) { eigMount(d, hostEl, nav); return; }
    if (d && d.engin) { hostEl.innerHTML = '<div class="eig-tom">Ekki tókst að byggja eignarhaldsnet fyrir félagið (hvorki hluthafalisti né raunverulegir eigendur fundust).</div>'; return; }
    if (tries++ < 60) setTimeout(tick, 3000);
    else hostEl.innerHTML = '<div class="eig-tom">Skýrslan er enn í vinnslu — endurhlaðið síðuna eftir smástund.</div>';
  };
  tick();
}

// Opið sýnishorn (Gervifyrirtæki) — engin innskráning/kaup.
export function renderUboSample(hostEl, opts) {
  opts = opts || {};
  const nav = opts.navTo || defaultNav;
  if (!hostEl) return Promise.resolve();
  return fetch('/gogn/eigendur/_synishorn.json').then((r) => r.json()).then((rep) => { eigMount(rep, hostEl, nav); return rep; })
    .catch(() => { hostEl.innerHTML = '<p class="eig-tom">Villa við að sækja sýnishorn.</p>'; });
}
```

- [ ] **Step 4: Syntax-check the module**

Run: `node --check "web/src/lib/ubo-report.js"`
Expected: no output, exit 0. (Node can `--check` ESM syntax; the `import` is fine for a check.)

- [ ] **Step 5: Verify the build still passes (module unused so far)**

Run: `cd web && npx astro build`
Expected: build succeeds, **197 pages** (module not imported yet → no page change).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/ubo-report.js
git commit -m "UBO: sameiginleg skýrsluvél (web/src/lib/ubo-report.js) dregin út"
```

---

## Task 2: Shared UBO styles (`web/src/styles/ubo.css`)

**Files:**
- Create: `web/src/styles/ubo.css`

**Interfaces:**
- Produces: the `.eig-*`, `#fs-form`/`#fs-q`/`#fs-btn`, `.fs-hits`/`.fs-hit`/`.fs-empty`/`.fs-badge`/`.fs-more`, and print CSS that Tasks 3 & 4 rely on.

- [ ] **Step 1: Move the `.eig-*` block verbatim**

Cut `fyrirtaeki.astro` **lines 372–434 verbatim** (the contiguous `.eig-*` region, including the two `@media print{…}` sub-rules at 417 and 434 and the `.eig-samplebar,.fs-samplebar` / `.eig-sample-wrap` rules) and paste into `web/src/styles/ubo.css`. (Removal from `fyrirtaeki.astro` happens in Task 5 — for now, **copy**.)

- [ ] **Step 2: Add the search-box + hits styles**

Append to `ubo.css` (copied from `fyrirtaeki.astro:35-39,46-56` so `/eigendur/` is self-sufficient; these stay in `fyrirtaeki.astro` too — identical rules, harmless):

```css
    #fs-form { display: flex; gap: 8px; margin: 18px 0 14px; }
    #fs-q { flex: 1; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 11px 14px; color: #eaf1fb; font-size: 15px; }
    #fs-q:focus { outline: none; border-color: rgba(246,177,59,.55); }
    #fs-btn { background: #f6b13b; color: #101623; border: 0; border-radius: 10px; padding: 0 18px; font-size: 14px; font-weight: 700; cursor: pointer; }
    #fs-btn:hover { filter: brightness(1.08); }
    .fs-empty { color: #7e8ca6; font-size: 13.5px; padding: 14px 2px; }
    .fs-hits { border: 1px solid rgba(255,255,255,.08); border-radius: 12px; overflow: hidden; }
    .fs-hit { display: flex; gap: 12px; align-items: baseline; padding: 9px 13px; border-bottom: 1px solid rgba(255,255,255,.06); cursor: pointer; font-size: 13.5px; }
    .fs-hit:last-child { border-bottom: 0; }
    .fs-hit:hover, .fs-hit:focus-visible { background: rgba(246,177,59,.07); outline: none; }
    .fs-hit .kt { font-variant-numeric: tabular-nums; color: #7e8ca6; font-size: 12px; white-space: nowrap; }
    .fs-hit .n { color: #eaf1fb; font-weight: 600; flex: 1; }
    .fs-hit .h { color: #9fb0c8; font-size: 12px; text-align: right; }
    .fs-hit.af .n { color: #8fa0b8; font-weight: 400; }
    .fs-badge { font-size: 10.5px; color: #e78284; border: 1px solid rgba(231,130,132,.4); border-radius: 6px; padding: 1px 6px; white-space: nowrap; vertical-align: 2px; }
    .fs-more { color: #7e8ca6; font-size: 12px; padding: 8px 2px; }
```

- [ ] **Step 3: Add the "full report" link style + self-contained print rule**

Append to `ubo.css`:

```css
    .eig-fulllink { display: inline-block; margin: 4px 0 2px; color: #f6b13b; text-decoration: none; font-size: 13px; font-weight: 600; }
    .eig-fulllink:hover { text-decoration: underline; }
    /* Prentun: sýna aðeins skýrsluna (#fs-report umlykur hana á báðum síðum). */
    @media print {
      body.fs-printing * { visibility: hidden; }
      body.fs-printing #fs-report, body.fs-printing #fs-report * { visibility: visible; }
      body.fs-printing #fs-report { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; color: #111; }
      body.fs-printing #fs-report .eig-report, body.fs-printing #fs-report .eig-intro, body.fs-printing #fs-report .eig-cap { color: #222 !important; }
      body.fs-printing #fs-report .eig-tafla th, body.fs-printing #fs-report .eig-tafla td { color: #222 !important; border-color: #ccc !important; }
      body.fs-printing #fs-report .eig-node { color: #111 !important; box-shadow: none; }
      body.fs-printing #fs-report .eig-node-mt, body.fs-printing #fs-report .eig-src, body.fs-printing #fs-report .eig-kt { color: #555 !important; }
    }
```

(The core `body.fs-printing`/`#fs-report` rule is copied from `fyrirtaeki.astro:274-276`; on `/fyrirtaeki/` it is idempotent with the inline copy, on `/eigendur/` it is the only copy. The `eigMount` print button already toggles `body.fs-printing`.)

- [ ] **Step 4: Verify build (css unused so far)**

Run: `cd web && npx astro build`
Expected: succeeds, **197 pages** (nothing imports `ubo.css` yet).

- [ ] **Step 5: Commit**

```bash
git add web/src/styles/ubo.css
git commit -m "UBO: sameiginlegir stílar (web/src/styles/ubo.css)"
```

---

## Task 3: New page `web/src/pages/eigendur.astro`

**Files:**
- Create: `web/src/pages/eigendur.astro`

**Interfaces:**
- Consumes: `../lib/ubo-report.js` (`mountUboReport`, `renderUboSample`), `../lib/auth.js` (`loadUser`, `loginHref`), `../styles/ubo.css`, `../layouts/Layout.astro`.
- Produces: route `/eigendur/` (build page count 197 → 198).

- [ ] **Step 1: Write the page**

Create `web/src/pages/eigendur.astro` with the full content:

```astro
---
// ─────────────────────────────────────────────────────────────
// 🔗 ENDANLEGIR EIGENDUR (UBO) — sjálfstæð söluskýrslu-síða (Karp+)
// Endurnýtir sömu vél og /fyrirtaeki/ um web/src/lib/ubo-report.js.
// Leit → val á félagi (kt) → net + töflur + gátt/kaup. ?syni=1 = opið sýnishorn.
// ─────────────────────────────────────────────────────────────
import Layout from '../layouts/Layout.astro';
import '../styles/ubo.css';
const desc = 'Endanlegir eigendur íslenskra félaga — litakóðað eignarhaldsnet gegnum allar félagakeðjur, raunverulegir eigendur, skráðir hluthafar og heimildir. Sérskýrsla eins og hjá Creditinfo, byggð á opinberum gögnum.';
---

<Layout title="🔗 Endanlegir eigendur — eignarhaldsskýrsla | Karp" description={desc} canonical="https://karp.is/eigendur/" ogTitle="Endanlegir eigendur — eignarhaldsskýrsla félaga">
  <main data-pg="eigendur">
    <p class="kicker">Karp+ · Fyrirtækjaskrá</p>
    <h1>🔗 Endanlegir eigendur</h1>
    <p>Full eignarhaldsskýrsla hvaða íslensks félags sem er: <b>litakóðað eignarhaldsnet</b> gegnum allar félagakeðjur, <b>endanlegir eigendur</b>, <b>raunverulegir eigendur</b> skv. Skattinum, <b>skráðir hluthafar</b> og heimildir — sérskýrsla eins og hjá Creditinfo, byggð eingöngu á opinberum gögnum. Hluti af <a href="/karp-pro/" style="color:#f6b13b">Karp+</a>.</p>
    <p class="note">👁️ Skoðaðu <a href="/eigendur/?syni=1">opið sýnishorn</a> (gervifélag) — eða flettu upp raunfélagi hér að neðan.</p>

    <form id="fs-form" autocomplete="off">
      <input id="fs-q" type="search" placeholder="Nafn félags eða kennitala…" autocomplete="off" aria-label="Leit að félagi fyrir eigendaskýrslu" />
      <button id="fs-btn" type="submit">Fletta upp</button>
    </form>
    <div id="fs-out" aria-live="polite"></div>

    <p class="foot">ⓘ Skýrslan byggir á opinberum gögnum: hlutafélagaskrá og ársreikningaskrá RSK og skráðum raunverulegum eigendum frá Skattinum. Eignatengsl eru skráð eða möguleg; án kennitölu einstaklinga er sömu-manneskju-tenging milli félaga ekki tæmandi. Karp birtir hvorki lánshæfismat né vanskilaskrá. Gögn sótt á-eftirspurn (24 klst skyndiminni).</p>
  </main>
</Layout>

<style>
  main[data-pg="eigendur"] { max-width: 900px; margin: 0 auto; padding: 26px 20px 60px; }
  main[data-pg="eigendur"] .kicker { color: #f6b13b; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 4px; }
  main[data-pg="eigendur"] h1 { font-size: 27px; margin: 0 0 8px; color: #eaf1fb; }
  main[data-pg="eigendur"] > p { color: #cdd6e6; font-size: 14.5px; line-height: 1.6; }
  main[data-pg="eigendur"] .note { color: #9fb0c8; font-size: 13px; }
  main[data-pg="eigendur"] .foot { color: #7e8ca6; font-size: 11.5px; line-height: 1.55; margin-top: 22px; border-top: 1px solid rgba(255,255,255,.07); padding-top: 12px; }
  main[data-pg="eigendur"] a { color: #f6b13b; }
</style>

<script>
  import { mountUboReport, renderUboSample } from '../lib/ubo-report.js';
  import { loadUser, loginHref } from '../lib/auth.js';

  function initEig() {
    const form = document.getElementById('fs-form');
    const inp = document.getElementById('fs-q');
    const out = document.getElementById('fs-out');
    const main = document.querySelector('main[data-pg="eigendur"]');
    if (!form || form.dataset.done) return;
    form.dataset.done = '1';
    const escF = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const ktFmt = (kt) => (kt && kt.length === 10 ? kt.slice(0, 6) + '-' + kt.slice(6) : kt || '');
    const skila = (html) => { out.innerHTML = html; };

    // Val á félagi → sýna eigendaskýrslu (net + töflur + gátt/kaup) fyrir kt.
    function veljaFelag(kt, nafn) {
      try { history.replaceState(null, '', '/eigendur/?q=' + encodeURIComponent(kt)); } catch (e) {}
      skila('<button type="button" class="fs-back" style="background:none;border:0;color:#f6b13b;font-size:12.5px;cursor:pointer;padding:0;margin:0 0 10px">← Ný leit</button>'
        + '<h2 style="font-size:20px;color:#eaf1fb;margin:0 0 12px">' + escF(nafn || '') + ' <span style="color:#8fa0b8;font-size:13px;font-weight:400">kt. ' + escF(ktFmt(kt)) + '</span></h2>'
        + '<div id="fs-report"><div class="fs-ph2" id="eig-host"></div></div>');
      const bk = out.querySelector('.fs-back'); if (bk) bk.onclick = () => { skila(''); inp.value = ''; inp.focus(); try { history.replaceState(null, '', '/eigendur/'); } catch (e) {} };
      mountUboReport({ kt: kt, nafn: nafn, hostEl: document.getElementById('eig-host'), navTo: (k) => veljaFelag(k, '') });
    }

    function leita(q) {
      q = String(q || '').trim();
      if (q.length < 2) { skila('<div class="fs-empty">Sláðu inn a.m.k. 2 stafi — nafn félags eða kennitölu.</div>'); return; }
      try { history.replaceState(null, '', '/eigendur/?q=' + encodeURIComponent(q)); } catch (e) {}
      skila('<div class="fs-empty">Fletti upp í fyrirtækjaskrá…</div>');
      fetch('/api/fyrirtaeki?q=' + encodeURIComponent(q))
        .then((r) => (r.ok ? r.json() : null))
        .then(async (d) => {
          if (!d || d.error) { skila('<div class="fs-empty">Ekki náðist í fyrirtækjaskrána í augnablikinu — reyndu aftur eftir andartak.</div>'); return; }
          if (d.felag) { await loadUser().catch(() => null); veljaFelag(d.felag.kt, d.felag.nafn); return; }
          if (d.hits && d.hits.length) {
            skila('<div class="fs-hits">' + d.hits.map((h) => `<div class="fs-hit${h.afskrad ? ' af' : ''}" role="button" tabindex="0" data-kt="${escF(h.kt)}" data-nafn="${escF(h.nafn)}"><span class="kt">${escF(ktFmt(h.kt))}</span><span class="n">${escF(h.nafn)}${h.afskrad ? ' <span class="fs-badge">afskráð</span>' : ''}</span><span class="h">${escF(h.heimili || '')}</span></div>`).join('') + '</div>'
              + (d.alls ? `<div class="fs-more">Sýni fyrstu ${d.hits.length} af ${d.alls} — þrengdu leitina til að finna félagið beint.</div>` : ''));
            out.querySelectorAll('.fs-hit').forEach((el) => {
              const go = async () => { await loadUser().catch(() => null); veljaFelag(el.dataset.kt, el.dataset.nafn); };
              el.onclick = go; el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
            });
            return;
          }
          skila(`<div class="fs-empty">Leit að „${escF(q)}“ skilaði engri niðurstöðu úr fyrirtækjaskrá.</div>`);
        })
        .catch(() => skila('<div class="fs-empty">Villa við uppflettingu — reyndu aftur.</div>'));
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); leita(inp.value); });

    // ?syni=1 → opið sýnishorn (Gervifyrirtæki), engin innskráning.
    if (new URLSearchParams(location.search).get('syni') === '1') {
      form.style.display = 'none';
      const host = document.createElement('div');
      host.className = 'eig-sample-wrap';
      host.innerHTML = '<div class="fs-samplebar">👁️ Sýnishorn — gervifélag. Í raunskýrslu eru gögnin sótt lifandi úr opinberum skrám. <a href="/eigendur/">← Fletta upp raunfélagi</a></div><div id="fs-report"><div id="eig-host"></div></div>';
      (main || document.body).appendChild(host);
      renderUboSample(host.querySelector('#eig-host'), { navTo: (k) => { location.href = '/eigendur/?q=' + encodeURIComponent(k); } });
      return;
    }

    // Innskráningargátt (eins og /fyrirtaeki/): leit er fyrir Karp+ (ókeypis). Sýnishorn er opið.
    loadUser().then((u) => {
      if (!u || !u.loggedIn) {
        form.style.display = 'none';
        skila('<div class="fs-empty">⭐ Eigendaskýrslur eru hluti af <a href="/karp-pro/">Karp+</a> — ókeypis aðgangur sem tekur mínútu. <a href="' + loginHref() + '">Skráðu þig inn</a> til að fletta upp félagi, eða skoðaðu <a href="/eigendur/?syni=1">opna sýnishornið</a>.</div>');
        return;
      }
      const q0 = new URLSearchParams(location.search).get('q');
      if (q0) { inp.value = q0; leita(q0); }
    }).catch(() => {});
  }
  document.addEventListener('astro:page-load', () => { if (document.querySelector('main[data-pg="eigendur"]')) initEig(); });
</script>
```

- [ ] **Step 2: Build and verify page count**

Run: `cd web && npx astro build`
Expected: succeeds; page count **198** (was 197). Grep the build output for `/eigendur/` or confirm `web/dist/eigendur/index.html` exists.

- [ ] **Step 3: Preview the open sample**

Start preview (`preview_start`), navigate to `/eigendur/?syni=1`.
- `preview_snapshot`: expect `.fs-samplebar`, `.eig-report`, the network `#eig-net`, and the four section headings (`Yfirlit yfir endanlega eigendur`, `Raunverulegir eigendur…`, `Yfirlit yfir hluthafa`).
- `preview_console_logs` (level error): expect none.
- (Per project memory, headless resize/screenshot may be unreliable — rely on snapshot/inspect.)

- [ ] **Step 4: Preview a real company as admin**

With an admin/owned session (or temporarily via `?q=6407070540`), confirm search resolves and `mountUboReport` renders the report or the CTA (for a non-owned session, expect the `.eig-cta` buy button "🛒 Kaupa eigenda-skýrslu — 990 kr"). Confirm the logged-out state shows the Karp+ login prompt.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/eigendur.astro
git commit -m "UBO: sjálfstæð /eigendur/-síða (leit + skýrsla + sýnishorn)"
```

---

## Task 4: Nav link in Karp+ group

**Files:**
- Modify: `web/src/layouts/Layout.astro:17`

- [ ] **Step 1: Add the nav item**

Edit `web/src/layouts/Layout.astro`. Find (line 17):

```js
    { href: '/fyrirtaeki/', label: 'Fyrirtækjaskrá' },
```

Replace with:

```js
    { href: '/fyrirtaeki/', label: 'Fyrirtækjaskrá' },
    { href: '/eigendur/', label: 'Endanlegir eigendur' },
```

- [ ] **Step 2: Build**

Run: `cd web && npx astro build`
Expected: succeeds, 198 pages.

- [ ] **Step 3: Preview nav**

Load `/eigendur/`; `preview_snapshot` → the left nav Karp+ group shows "Endanlegir eigendur", and it renders with the active (`.on`) state on this page (via `updateActiveNav`).

- [ ] **Step 4: Commit**

```bash
git add web/src/layouts/Layout.astro
git commit -m "Nav: 'Endanlegir eigendur' tengill í Karp+ hóp"
```

---

## Task 5: Refactor `/fyrirtaeki/` onto the module (remove duplication) + add link

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro` (CSS ~372-434; import ~438; helper `eigPctFmt` 677; engine 676-814; `fsKort` host 866-868; `eigWire` IIFE 1154-1174; sample handler 1376-1379)

**Interfaces:**
- Consumes: `../lib/ubo-report.js` (`mountUboReport`, `renderUboSample`), `../styles/ubo.css`.

- [ ] **Step 1: Import the module + css**

In `fyrirtaeki.astro`, add the CSS import to the **frontmatter** (after line 10 `import Layout…`):

```js
import '../styles/ubo.css';
```

And in the `<script>`, after line 438 (`import { … } from '../lib/auth.js';`), add:

```js
    import { mountUboReport, renderUboSample } from '../lib/ubo-report.js';
```

- [ ] **Step 2: Remove the now-shared `.eig-*` CSS**

Delete `fyrirtaeki.astro` **lines 372–434** (the `.eig-*` block already copied to `ubo.css` in Task 2). Leave the `.fs-*` search styles (35-39, 46-56) in place — they are duplicated by `ubo.css` but identical (harmless; keeps this edit minimal).

- [ ] **Step 3: Remove the inline engine functions**

Delete `fyrirtaeki.astro` **lines 676–814** (the `// ── 🔗 Endanlegir eigendur (UBO)` comment through the end of `eigMount`) — these now live in `ubo-report.js`. Keep `escF`/`ktFmt` (441-442).

- [ ] **Step 4: Confirm no dangling references**

Run: `cd web && grep -nE "eigTable|eigRaunv|eigHluthafar|eigPie|eigLegend|eigSources|eigNet|eigWireNet|eigData|eigReport|eigMount|eigPctFmt" src/pages/fyrirtaeki.astro`
Expected: **no matches** (all UBO engine references are gone; the IIFE that used `eigData`/`eigMount` is replaced in Step 6). If any remain outside the IIFE at 1154-1174, investigate before proceeding.

- [ ] **Step 5: Replace the `fsKort` UBO host block + add the full-report link**

In `fsKort` find (lines 866-868):

```js
          ${(isAdmin() || hasReport('eigendur:' + f.kt))
            ? '<div class="fs-ph2" id="eig-host"><div class="eig-loading">🔗 Sæki endanlega eigendur…</div></div>'
            : `<div class="fs-ph2" id="eig-host"><div class="eig-cta"><b>🔗 Endanlegir eigendur</b><span>Full, litakóðuð eignarhaldsskýrsla: endanlegir eigendur í gegnum allar félagakeðjur, raunverulegir eigendur, hluthafalisti og prentvæn PDF — sérskýrsla eins og hjá Creditinfo.</span><div class="eig-cta-btns"><button type="button" class="eig-buy" data-kt="${escF(f.kt)}" data-nafn="${escF(f.nafn || '')}">🛒 Kaupa eigenda-skýrslu — 990 kr</button><a class="eig-sample" href="/fyrirtaeki/?eigendur-syni=1">👁️ Sjá sýnishorn</a></div></div></div>`}
```

Replace with:

```js
          <div class="fs-ph2" id="eig-host"></div>
          <a class="eig-fulllink" href="/eigendur/?q=${escF(f.kt)}">🔗 Sjá fulla eigendaskýrslu →</a>
```

(The CTA/loading markup is now produced by `mountUboReport`; the new link points to the dedicated page.)

- [ ] **Step 6: Replace the `eigWire` IIFE with the module call**

Find the whole block (lines 1153-1174), from the comment through the IIFE's `})();`:

```js
              // 🔗 Endanlegir eigendur: kaup + poll + mount
              (function eigWire() {
```
…down to…
```js
                tick();
              })();
```

Replace the entire IIFE (and its leading comment) with:

```js
              // 🔗 Endanlegir eigendur: sameiginleg vél (web/src/lib/ubo-report.js)
              mountUboReport({ kt: f.kt, nafn: f.nafn, hostEl: document.getElementById('eig-host'), navTo: (q) => leita(q, true) });
```

- [ ] **Step 7: Re-point the `?eigendur-syni=1` sample handler to the module**

Find (lines 1376-1379) inside the `?eigendur-syni=1` branch:

```js
        fetch('/gogn/eigendur/_synishorn.json').then((r) => r.json()).then((rep) => {
          host.innerHTML = '<div class="fs-samplebar">👁️ Sýnishorn — gervifélag. Í raunskýrslu eru gögnin sótt lifandi úr opinberum skrám. <a href="/fyrirtaeki/">← Fletta upp raunfélagi</a></div><div id="eig-host"></div>';
          eigMount(rep, host.querySelector('#eig-host'), (q) => { location.href = '/fyrirtaeki/?q=' + encodeURIComponent(q); });
        }).catch(() => { host.innerHTML = '<p class="eig-tom">Villa við að sækja sýnishorn.</p>'; });
```

Replace with:

```js
        host.innerHTML = '<div class="fs-samplebar">👁️ Sýnishorn — gervifélag. Í raunskýrslu eru gögnin sótt lifandi úr opinberum skrám. <a href="/fyrirtaeki/">← Fletta upp raunfélagi</a></div><div id="fs-report"><div id="eig-host"></div></div>';
        renderUboSample(host.querySelector('#eig-host'), { navTo: (q) => { location.href = '/fyrirtaeki/?q=' + encodeURIComponent(q); } });
```

(Keeps the legacy `/fyrirtaeki/?eigendur-syni=1` route working via the shared sample renderer.)

- [ ] **Step 8: Build + syntax-check**

Run: `cd web && npx astro build` → expect success, **198 pages**.
Run: `node --check web/worker.js` → exit 0 (worker untouched; sanity gate).

- [ ] **Step 9: Preview `/fyrirtaeki/` — behavior unchanged**

- `/fyrirtaeki/?eigendur-syni=1` → sample network + tables render (via module).
- `/fyrirtaeki/?syni=1` → demo company card still renders (unaffected).
- A real company (admin/owned) → `#eig-host` fills with report; the "🔗 Sjá fulla eigendaskýrslu →" link appears and points to `/eigendur/?q=<kt>`.
- `preview_console_logs` (error): none.

- [ ] **Step 10: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro
git commit -m "UBO: /fyrirtaeki/ notar sameiginlegu vélina + hlekkur á /eigendur/"
```

---

## Task 6: Final verification + PR ready

- [ ] **Step 1: Full build + worker check**

Run: `cd web && npx astro build` → GREEN, **198 pages**.
Run: `node --check web/worker.js` → exit 0.

- [ ] **Step 2: Cross-page preview matrix**

| URL | Expect |
|-----|--------|
| `/eigendur/?syni=1` | sample: net + 4 tables, samplebar, no login |
| `/eigendur/` logged-out | Karp+ login prompt + sample link |
| `/eigendur/?q=6407070540` (owned/admin) | Marel report renders; (non-owned) → 990 kr CTA |
| `/fyrirtaeki/?eigendur-syni=1` | sample renders (module) |
| `/fyrirtaeki/` real co. | report + "Sjá fulla eigendaskýrslu →" link |
| nav | "Endanlegir eigendur" in Karp+ group, active state on `/eigendur/` |

- [ ] **Step 3: Diff review**

Run: `git diff main --stat` and skim `git diff main -- web/src/pages/fyrirtaeki.astro` to confirm the fyrirtaeki change is a clean extraction (no behavioral edits beyond the host block, IIFE, sample, imports, CSS removal).

- [ ] **Step 4: Push + flip PR #8 to ready**

```bash
git push
```
Then mark PR #8 ready for review (via API with the cached credential, as in session), and update its body DoD checkboxes.

- [ ] **Step 5: Update project memory**

Append to `MEMORY.md` a one-line pointer noting `/eigendur/` + the shared `ubo-report.js`/`ubo.css` module and the 197→198 page count, so future sessions know the UBO engine is shared.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-08-eigendur-sida-design.md`):
- §4 shared module → Task 1. §5 shared css → Task 2. §6 new page (intro/search/`?syni=1`/`?q=`) → Task 3. §7 `/fyrirtaeki/` keep + link + module → Task 5. §8 nav → Task 4. §9 worker/gating unchanged → verified Tasks 5-6 (no worker edits). §10 legal → carried in moved `eigSources` + page `.foot`. §11 verification → Tasks 3-6. ✅ all sections mapped.
- DoD: `/eigendur/` search→report ✔ (T3), sample ✔ (T3), nav ✔ (T4), gating 990 kr ✔ (module `wireBuy`/`mountUboReport`), build 198 ✔ (T3/T6), Icelandic ✔, no duplicated/broken UBO logic ✔ (engine single-sourced; `/fyrirtaeki/` re-pointed, T5).

**Placeholder scan:** none — all new code written in full; moved code referenced by exact line range per the stated convention.

**Type/name consistency:** `mountUboReport({kt,nafn,hostEl,navTo})`, `renderUboSample(hostEl,{navTo})`, `uboOwned(kt)` used identically in Tasks 1, 3, 5. `#fs-report`/`#eig-host` ids consistent across page, module (`eig-print`/`eig-net` internal), and print CSS. `navTo` receives a `kt` (from `eigWireNet`'s `nav(b.dataset.kt)`), and every `navTo` provided treats its arg as a query/kt — consistent.

**Known limitation (noted in tasks):** headless preview can't verify responsive resize / print visually (project memory) — those rely on the CSS being a verbatim carry of the proven `/fyrirtaeki/` approach; structure/gating verified via snapshot/inspect.
