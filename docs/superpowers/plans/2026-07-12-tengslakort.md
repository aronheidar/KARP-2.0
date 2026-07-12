# Tengslakort (eigenda- & stjórnarnet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lazy-loaded, privacy-masked network graph ("🕸️ Tengslakort") inside the Endanlegir eigendur report at `/eigendur/`, showing ownership (UBO tree) and governance (fyrirsvar) relationships across companies in one visual, using cytoscape.js from CDN.

**Architecture:** A new pure element-builder + cytoscape renderer (`web/src/lib/tengslakort.mjs`) mirrors the lazy-CDN pattern of `web/src/lib/choropleth.mjs`. The report (`web/src/lib/ubo-report.js`) gains a "Listi ↔ Kort" tab bar; the Kort panel lazy-loads the renderer on first click, feeding it the already-loaded UBO tree (`eignData`) plus `/api/tengslanet?kort=1`. A new `?kort=1` mode on `tengslanetHandler` (`web/worker.js`) strips names of distant (non-root-connected) individuals **server-side** before they ever reach the browser — the DPIA "leið A" privacy requirement.

**Tech Stack:** Vanilla ES modules (no framework), Astro static build (`astro build`), Cloudflare Worker (`worker.js`), cytoscape@3 from `unpkg` CDN (no new npm dependency), `node:test` for unit tests.

## Global Constraints

- **No new npm dependency.** cytoscape loads lazily from `https://unpkg.com/cytoscape@3/dist/cytoscape.min.js` (same CDN pattern as Leaflet in `choropleth.mjs`). Layout uses built-in `cose` (no fcose extension).
- **Worktree:** all edits happen in `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` on branch `b2b-topbar`. NEVER edit on `main` and copy. Deploy = `git push origin b2b-topbar:main` (rebase on conflicts — multiple sessions target `main`).
- **Privacy (DPIA leið A) is non-negotiable:** in `?kort=1` mode, individuals who are NOT root-connected (i.e. `krossar` — people cross-linked across net companies without a direct role in the root) MUST have their `nafn` (and any kt) cut out of the response entirely; they carry only a token `'E'+n` and `maskad:true`. Root-connected individuals (root `stjornendur`, i.e. entries with `hlutverk_rot`) and all companies keep their names. The client performs NO un-masking.
- **Icelandic UI copy** throughout (matches surrounding code). Karp gold accent `#f6b13b`.
- **Null-tolerant:** the Kort must render an ownership-only graph if `/api/tengslanet` returns `holdur:false`, `error:'login'`, or fails (e.g. the public `?syni=1` sample). Never throw.
- **Verification commands run from `web/`:** `npx astro build`, `node --check worker.js`, `node --test test/`.

---

## File Structure

- **Create `web/src/lib/tengslakort.mjs`** — the graph module. Exports `buildElements({rotKt, eignData, stjornData})` (pure, DOM-free, testable) and `renderTengslakort(hostEl, {rotKt, eignData, stjornData})` (lazy CDN load + cytoscape + injected dark CSS + click side-panel). Mirrors `choropleth.mjs` structure.
- **Create `web/test/tengslakort.test.mjs`** — `node:test` unit tests for `buildElements`.
- **Create `web/test/tengslanet-mask.test.mjs`** — `node:test` unit tests for `maskaKortSvar`.
- **Modify `web/worker.js`** — add named export `maskaKortSvar(out)` (pure) near `tengslanetHandler`; add `?kort=1` branch (separate cache key + masked body) inside `tengslanetHandler`.
- **Modify `web/src/lib/ubo-report.js`** — add "Listi ↔ Kort" tab bar inside `eigReport`; wrap existing report body in `#eig-panel-listi`; add empty `#eig-panel-kort`; add `eigWireTabs` + `eigMountKort` (dynamic `import('./tengslakort.mjs')` on first Kort click); call `eigWireTabs` from `eigMount`.
- **Modify `web/src/styles/ubo.css`** — append tab-bar / panel styles + print rules.

---

## Task 1: Server-side privacy masking (`?kort=1`)

**Files:**
- Modify: `web/worker.js` (add `maskaKortSvar` near line 2440; add `?kort=1` handling in `tengslanetHandler`, lines 2447-2512)
- Test: `web/test/tengslanet-mask.test.mjs` (create)

**Interfaces:**
- Produces: `export function maskaKortSvar(out)` — takes the assembled tengslanet response object `{ kt, holdur, n_felog, felog, stjornendur, krossar, heimild }` and returns a masked copy. `stjornendur` (root-connected, named) unchanged; each `krossar[i]` becomes `{ token: 'E'+(i+1), maskad: true, felog: [...] }` with **no `nafn` key**. Adds `kort: true`. If `!out.holdur`, returns `out` unchanged.
- Produces (HTTP): `GET /api/tengslanet?kort=1&kt=<felagKt>` — same shape as the existing endpoint but with `krossar` names stripped and a distinct edge cache key. Still login-gated and lögaðila-kt-only.
- Consumes: nothing new (reuses existing `tengslanetHandler` assembly of `out`).

- [ ] **Step 1: Write the failing test**

Create `web/test/tengslanet-mask.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { maskaKortSvar } from '../worker.js';

test('maskaKortSvar strips krossar names, adds stable tokens', () => {
  const out = {
    kt: '5555555555', holdur: true, n_felog: 3,
    felog: [{ kt: '5555555555', nafn: 'Rót ehf.' }],
    stjornendur: [{ nafn: 'Anna Ansdóttir', hlutverk_rot: ['stjórn'], onnur: [{ kt: '4444444444', nafn: 'Vala hf.', hlutverk: 'stjórn' }] }],
    krossar: [{ nafn: 'Leyni Persóna', felog: [{ kt: '4444444444', nafn: 'Vala hf.' }, { kt: '3333333333', nafn: 'Beta ehf.' }] }],
    heimild: 'x',
  };
  const m = maskaKortSvar(out);
  // krossar: name CUT, token + maskad added
  assert.equal(m.krossar[0].nafn, undefined);
  assert.equal(m.krossar[0].token, 'E1');
  assert.equal(m.krossar[0].maskad, true);
  // company names inside krossar.felog are KEPT
  assert.equal(m.krossar[0].felog[1].nafn, 'Beta ehf.');
  // root-connected stjornendur keep their names
  assert.equal(m.stjornendur[0].nafn, 'Anna Ansdóttir');
  // ⚠ PRIVACY: no distant individual name anywhere in the whole response
  assert.ok(!JSON.stringify(m).includes('Leyni Persóna'));
  assert.equal(m.kort, true);
});

test('maskaKortSvar leaves the original object untouched (pure)', () => {
  const out = { kt: '5', holdur: true, stjornendur: [], krossar: [{ nafn: 'X', felog: [] }] };
  maskaKortSvar(out);
  assert.equal(out.krossar[0].nafn, 'X'); // original not mutated
});

test('maskaKortSvar passes through holdur:false unchanged', () => {
  const out = { kt: '5555555555', holdur: false };
  assert.deepEqual(maskaKortSvar(out), out);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `node --test test/tengslanet-mask.test.mjs`
Expected: FAIL — `maskaKortSvar` is not exported (`SyntaxError: The requested module '../worker.js' does not provide an export named 'maskaKortSvar'`). If instead it fails while *evaluating* `worker.js` (a top-level ReferenceError to a Cloudflare global), stop and report — worker.js is expected to be import-safe (top level is only the `PROXIES` object literal + function declarations).

- [ ] **Step 3: Add the `maskaKortSvar` export to `worker.js`**

Insert immediately BEFORE the `tengslanetHandler` comment block (currently line 2441, the `// ── 🪑 Tengslanet (F10):` banner):

```js
// ── 🕸️ Kort-hamur: server-hlið nafna-felun (DPIA leið A) ─────────────────────
// Tengslakortið (?kort=1) birtir AÐEINS nöfn rót-tengds fólks. „krossar" = fólk með
// hlutverk í ≥2 net-félögum EN EKKI í rótinni → fjarlægir aðilar. Nöfn þeirra eru
// KLIPPT ÚR svarinu (fara aldrei í vafrann); þeir bera aðeins stöðugt token 'E'+n.
// Félög (lögaðilar) og rót-fyrirsvar (stjornendur) halda nöfnum — sama KYC-gildi og listinn.
export function maskaKortSvar(out) {
  if (!out || !out.holdur) return out;
  const krossar = (out.krossar || []).map((p, i) => ({ token: 'E' + (i + 1), maskad: true, felog: p.felog || [] }));
  return { ...out, krossar, kort: true };
}
```

- [ ] **Step 4: Run the mask test to verify it passes**

Run (from `web/`): `node --test test/tengslanet-mask.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `?kort=1` into `tengslanetHandler`**

In `tengslanetHandler` (line 2447), change the first line from:

```js
async function tengslanetHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
```

to:

```js
async function tengslanetHandler(request, env, ctx) {
  const u = new URL(request.url);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  const kort = u.searchParams.get('kort') === '1';   // 🕸️ kort-hamur: strangari nafna-felun (sjá maskaKortSvar)
```

Then change the cache key (currently line 2456) from:

```js
  const cacheKey = new Request('https://cache.karp.internal/api/tengslanet?kt=' + kt);
```

to (distinct key per mode so list and kort caches never collide):

```js
  const cacheKey = new Request('https://cache.karp.internal/api/tengslanet?kt=' + kt + (kort ? '&kort=1' : ''));
```

Finally, apply the mask right before serialization. Change (currently lines 2508-2510) from:

```js
  const ttl = out.holdur ? (out.n_felog > 1 ? 43200 : 900) : 0;
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': ttl ? 'public, max-age=' + ttl : 'no-store' } });
```

to:

```js
  const ttl = out.holdur ? (out.n_felog > 1 ? 43200 : 900) : 0;
  const body = kort ? maskaKortSvar(out) : out;   // 🕸️ nafna-felun aðeins í kort-ham
  const res = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': ttl ? 'public, max-age=' + ttl : 'no-store' } });
```

- [ ] **Step 6: Verify worker syntax**

Run (from `web/`): `node --check worker.js`
Expected: no output, exit 0.

Run (from `web/`): `node --test test/tengslanet-mask.test.mjs`
Expected: PASS (import still resolves after the handler edits).

- [ ] **Step 7: Commit**

```bash
git add web/worker.js web/test/tengslanet-mask.test.mjs
git commit -m "feat(tengslanet): ?kort=1 server-side name masking for network graph"
```

---

## Task 2: `tengslakort.mjs` — element builder + cytoscape renderer

**Files:**
- Create: `web/src/lib/tengslakort.mjs`
- Test: `web/test/tengslakort.test.mjs` (create)

**Interfaces:**
- Produces: `export function buildElements({ rotKt, eignData, stjornData })` → returns a cytoscape elements array `[{ data: {...} }, ...]`. Node data: `{ id, tegund:'felag'|'einst', kt, nafn, rot?, maskad?, faeding?, label, hlutverk_rot? }`. Edge data: `{ id, source, target, tegund:'eign'|'stjorn', hlutfall?, hlutverk?, label }`. IDs: company `'c:'+kt`, named person `'p:'+kt` or `'p:nm:'+norm(nafn)`, masked person `'p:tok:'+token`. Ownership edges point owner→company (`eign`); governance edges point person→company (`stjorn`). Companies dedupe by kt across both datasets. Edges to/from absent nodes are dropped.
- Produces: `export function renderTengslakort(hostEl, opts)` → `Promise<cy|null>`. Lazy-loads cytoscape from CDN, injects `#tk-styles` once, builds the graph, wires a click side-panel, returns the cytoscape instance (or `null` if the host is already rendered / CDN fails).
- Consumes (from Task 1): `stjornData` is the `/api/tengslanet?kort=1` response — `stjornendur[]` (named), `krossar[]` (each `{ token, maskad, felog }`), `felog[]`, `holdur`.
- Consumes: `eignData` is the `gogn/eigendur/<kt>.json` report object — uses `.kt` and `.net.{nodes,edges}`. Net node shape: `{ id, kt, nafn, tegund:'felag'|'einst', er_rot?, faeding? }`. Net edge shape: `{ fra, til, hlutur, band }` (fra=owner, til=owned).

- [ ] **Step 1: Write the failing test**

Create `web/test/tengslakort.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { buildElements } from '../src/lib/tengslakort.mjs';

const eignData = {
  kt: '5555555555',
  net: {
    nodes: [
      { id: 'root', kt: '5555555555', nafn: 'Rót ehf.', tegund: 'felag', er_rot: true },
      { id: 'valafel', kt: '4444444444', nafn: 'Vala hf.', tegund: 'felag' },
      { id: 'jon', kt: null, nafn: 'Jón Jónsson', tegund: 'einst', faeding: '1970' },
    ],
    edges: [
      { fra: 'valafel', til: 'root', hlutur: 80, band: '51' },
      { fra: 'jon', til: 'valafel', hlutur: 100, band: '51' },
    ],
  },
};
const nodesOf = (els) => els.filter((e) => !e.data.source);
const edgesOf = (els) => els.filter((e) => e.data.source);

test('buildElements: ownership-only graph when stjornData is null', () => {
  const els = buildElements({ rotKt: '5555555555', eignData, stjornData: null });
  assert.equal(nodesOf(els).length, 3);
  assert.equal(edgesOf(els).length, 2);
  const root = nodesOf(els).find((n) => n.data.rot);
  assert.equal(root.data.id, 'c:5555555555');
  assert.equal(root.data.tegund, 'felag');
  assert.ok(edgesOf(els).every((e) => e.data.tegund === 'eign'));
  assert.ok(nodesOf(els).every((n) => !n.data.maskad));
  // ownership edge points owner -> company
  const oe = edgesOf(els).find((e) => e.data.target === 'c:5555555555');
  assert.equal(oe.data.source, 'c:4444444444');
  assert.equal(oe.data.label, '80%');
});

test('buildElements: named stjornandi adds a governance edge to root', () => {
  const stjornData = { holdur: true, felog: [{ kt: '5555555555', nafn: 'Rót ehf.' }], stjornendur: [{ nafn: 'Anna Ansdóttir', hlutverk_rot: ['stjórn'], onnur: [] }], krossar: [] };
  const els = buildElements({ rotKt: '5555555555', eignData, stjornData });
  const anna = nodesOf(els).find((n) => n.data.nafn === 'Anna Ansdóttir');
  assert.ok(anna, 'named stjornandi node present');
  assert.equal(anna.data.maskad, false);
  const gov = edgesOf(els).find((e) => e.data.source === anna.data.id && e.data.tegund === 'stjorn');
  assert.ok(gov, 'governance edge present');
  assert.equal(gov.data.target, 'c:5555555555');
});

test('buildElements: masked krossar person carries a token, never a name', () => {
  const stjornData = { holdur: true, felog: [{ kt: '5555555555', nafn: 'Rót ehf.' }], stjornendur: [], krossar: [{ token: 'E1', maskad: true, felog: [{ kt: '4444444444', nafn: 'Vala hf.' }, { kt: '3333333333', nafn: 'Beta ehf.' }] }] };
  const els = buildElements({ rotKt: '5555555555', eignData, stjornData });
  const masked = nodesOf(els).filter((n) => n.data.maskad);
  assert.equal(masked.length, 1);
  assert.equal(masked[0].data.nafn, null);
  assert.equal(masked[0].data.label, 'E1');
  assert.ok(masked[0].data.id.startsWith('p:tok:'));
  assert.ok(edgesOf(els).some((e) => e.data.source === masked[0].data.id && e.data.target === 'c:3333333333' && e.data.tegund === 'stjorn'));
});

test('buildElements: a company shared by both datasets appears once', () => {
  const stjornData = { holdur: true, felog: [{ kt: '4444444444', nafn: 'Vala hf.' }], stjornendur: [], krossar: [] };
  const els = buildElements({ rotKt: '5555555555', eignData, stjornData });
  assert.equal(nodesOf(els).filter((n) => n.data.id === 'c:4444444444').length, 1);
});

test('buildElements: tolerates empty/missing eignData.net', () => {
  const els = buildElements({ rotKt: '5555555555', eignData: {}, stjornData: null });
  assert.deepEqual(els, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `node --test test/tengslakort.test.mjs`
Expected: FAIL — module not found (`Cannot find module '.../src/lib/tengslakort.mjs'`).

- [ ] **Step 3: Create `tengslakort.mjs` with the pure builder + renderer**

Create `web/src/lib/tengslakort.mjs`:

```js
// tengslakort.mjs — eigenda- & stjórnarnet (cytoscape.js, client-side eyja).
// -------------------------------------------------------------------------
// Sama mynstur og choropleth.mjs: lazy CDN-hleðsla af graf-lib (cytoscape),
// ENGIN ný npm-ávöxun, sprautar eigin dökka CSS einu sinni. Notað í eigenda-
// skýrslunni (ubo-report.js) undir „🕸️ Tengslakort"-flipanum. Byggir TVÆR
// tegundir leggja, aðgreindar sjónrænt:
//   • eignarhald (UBO-tré úr gogn/eigendur/<kt>.json) — heil lína + %,
//   • stjórn/fyrirsvar (úr /api/tengslanet?kort=1) — brotalína + hlutverk.
// PERSÓNUVERND: fjarlægir (grímuklæddir) einstaklingar koma NAFNLAUSIR frá
// server (token 'E'+n). buildElements gerir ENGA af-grímun.
// ─────────────────────────────────────────────────────────────

const GOLD = '#f6b13b', COFELAG = '#3f6ea5', PERSON = '#cfe3ff', MASK = '#5b6b82';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ0-9]+/g, ' ').trim();
const pct = (n) => (n == null ? '' : Number(n).toFixed(0) + '%');
const ktFmt = (kt) => { const s = String(kt || '').replace(/\D/g, ''); return s.length === 10 ? s.slice(0, 6) + '-' + s.slice(6) : s; };

// ---------- id-lyklar (samræming milli eignar- og stjórnar-gagna) ----------
const felagId = (kt) => 'c:' + String(kt || '').replace(/\D/g, '');
const nafnPersonId = (nafn, kt) => (kt ? 'p:' + String(kt).replace(/\D/g, '') : 'p:nm:' + norm(nafn));
const maskPersonId = (token) => 'p:tok:' + token;

/**
 * Byggir cytoscape-element-fylki úr eignarhaldi (eignData) + stjórn (stjornData).
 * HREIN fall (engin DOM) — prófanleg. Skilar [{data:{...}}] (hnútar + leggir).
 */
export function buildElements({ rotKt, eignData, stjornData } = {}) {
  const nodes = new Map();   // id -> data
  const edges = new Map();   // id -> data
  const rkt = String(rotKt || (eignData && eignData.kt) || '').replace(/\D/g, '');
  const put = (d) => {
    const ex = nodes.get(d.id);
    if (!ex) { nodes.set(d.id, d); return; }
    if (d.nafn && !ex.nafn) { ex.nafn = d.nafn; ex.label = d.label || ex.label; }
    if (d.kt && !ex.kt) ex.kt = d.kt;
    if (d.rot) ex.rot = true;
    if (d.maskad) ex.maskad = true;
    if (d.hlutverk_rot && !ex.hlutverk_rot) ex.hlutverk_rot = d.hlutverk_rot;
  };
  const putEdge = (d) => { if (!edges.has(d.id)) edges.set(d.id, d); };

  // ---- 1) eignarhald (UBO-tré) ----
  const local = new Map();   // rep.net staðbundið id -> graf-id
  const net = (eignData && eignData.net) || { nodes: [], edges: [] };
  for (const n of (net.nodes || [])) {
    if (n.tegund === 'felag') {
      const id = felagId(n.kt);
      local.set(n.id, id);
      put({ id, tegund: 'felag', kt: (n.kt ? String(n.kt).replace(/\D/g, '') : null), nafn: n.nafn || null, rot: !!n.er_rot, label: n.nafn || '' });
    } else {
      const id = nafnPersonId(n.nafn, n.kt);
      local.set(n.id, id);
      put({ id, tegund: 'einst', kt: (n.kt ? String(n.kt).replace(/\D/g, '') : null), nafn: n.nafn || null, maskad: false, faeding: n.faeding || null, label: n.nafn || '' });
    }
  }
  for (const e of (net.edges || [])) {
    const s = local.get(e.fra), t = local.get(e.til);
    if (!s || !t) continue;
    putEdge({ id: 'eign:' + s + '>' + t, source: s, target: t, tegund: 'eign', hlutfall: (e.hlutur == null ? 0 : e.hlutur), label: pct(e.hlutur) });
  }

  // ---- 2) stjórn / fyrirsvar ----
  if (stjornData && stjornData.holdur) {
    const rootCid = felagId(rkt);
    if (rkt) { if (!nodes.has(rootCid)) put({ id: rootCid, tegund: 'felag', kt: rkt, nafn: null, rot: true, label: '' }); else nodes.get(rootCid).rot = true; }
    const felagNode = (kt, nafn) => { const k = String(kt || '').replace(/\D/g, ''); if (!k) return null; const id = felagId(k); put({ id, tegund: 'felag', kt: k, nafn: nafn || null, rot: k === rkt, label: nafn || '' }); return id; };
    for (const f of (stjornData.felog || [])) felagNode(f.kt, f.nafn);
    // nafngreindir stjórnendur (rót-tengt fólk) — heil nöfn
    for (const p of (stjornData.stjornendur || [])) {
      const pid = nafnPersonId(p.nafn, null);
      const hr = (p.hlutverk_rot || []).join(' · ');
      put({ id: pid, tegund: 'einst', kt: null, nafn: p.nafn || null, maskad: false, label: p.nafn || '', hlutverk_rot: hr });
      if (rkt) putEdge({ id: 'stjorn:' + pid + '>' + rootCid, source: pid, target: rootCid, tegund: 'stjorn', hlutverk: hr || 'fyrirsvar', label: hr || 'fyrirsvar' });
      for (const o of (p.onnur || [])) {
        const cid = felagNode(o.kt, o.nafn); if (!cid) continue;
        putEdge({ id: 'stjorn:' + pid + '>' + cid, source: pid, target: cid, tegund: 'stjorn', hlutverk: o.hlutverk || '', label: o.hlutverk || '' });
      }
    }
    // grímuklæddir krossatengsl — NAFNLAUSIR (token frá server)
    (stjornData.krossar || []).forEach((p, i) => {
      const token = p.token || ('E' + (i + 1));
      const pid = maskPersonId(token);
      put({ id: pid, tegund: 'einst', kt: null, nafn: null, maskad: true, label: token });
      for (const f of (p.felog || [])) {
        const cid = felagNode(f.kt, f.nafn); if (!cid) continue;
        putEdge({ id: 'stjorn:' + pid + '>' + cid, source: pid, target: cid, tegund: 'stjorn', hlutverk: '', label: '' });
      }
    });
  }

  const out = [];
  for (const d of nodes.values()) out.push({ data: d });
  for (const d of edges.values()) if (nodes.has(d.source) && nodes.has(d.target)) out.push({ data: d });
  return out;
}

// ---------- cytoscape-hleðsla (lazy, af CDN — sama mynstur og withLeaflet) ----------
function withCytoscape(cb) {
  if (window.cytoscape) return cb(window.cytoscape);
  let s = document.getElementById('cytoscape-js');
  if (!s) { s = document.createElement('script'); s.id = 'cytoscape-js'; s.src = 'https://unpkg.com/cytoscape@3/dist/cytoscape.min.js'; document.head.appendChild(s); }
  if (window.cytoscape) return cb(window.cytoscape);
  s.addEventListener('load', () => cb(window.cytoscape), { once: true });
  s.addEventListener('error', () => cb(null), { once: true });
}

// ---------- dökkur CSS (sprautað einu sinni) ----------
function injectCss() {
  if (document.getElementById('tk-styles')) return;
  const st = document.createElement('style');
  st.id = 'tk-styles';
  st.textContent = `
  .tk-wrap{position:relative;height:560px;border-radius:12px;border:1px solid rgba(255,255,255,.08);overflow:hidden;background:#0b0f17}
  @media (max-width:560px){.tk-wrap{height:440px}}
  .tk-cy{position:absolute;inset:0}
  .tk-legend{position:absolute;left:12px;top:12px;z-index:6;background:rgba(9,14,26,.86);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 11px;font-size:11.5px;color:#cdd6e6;max-width:240px;pointer-events:none}
  .tk-legend .tk-lt{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#7e8ca6;font-weight:700;margin-bottom:6px}
  .tk-legend .tk-row{display:flex;align-items:center;gap:7px;margin:3px 0;line-height:1.2}
  .tk-legend .tk-sw{width:14px;height:14px;border-radius:50%;flex:none}
  .tk-legend .tk-ln{width:18px;height:0;flex:none;border-top:2px solid #8fb7e8}
  .tk-legend .tk-ln.dash{border-top-style:dashed;border-top-color:#b48ad6}
  .tk-panel{position:absolute;right:12px;top:12px;z-index:7;width:232px;max-width:calc(100% - 24px);background:rgba(9,14,26,.96);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:11px 13px;font-size:12.5px;color:#eaf1fb;box-shadow:0 8px 28px rgba(0,0,0,.55);display:none}
  .tk-panel.on{display:block}
  .tk-panel h5{margin:0 24px 6px 0;font-size:13.5px;color:#f6b13b}
  .tk-panel .tk-kt{color:#9fb0c8;font-size:11.5px;line-height:1.4}
  .tk-panel ul{margin:7px 0 0;padding-left:16px}
  .tk-panel li{margin:2px 0;line-height:1.35}
  .tk-panel .tk-x{position:absolute;right:8px;top:7px;cursor:pointer;color:#9fb0c8;border:none;background:none;font-size:15px;line-height:1}
  .tk-src{position:absolute;left:12px;bottom:10px;z-index:6;font-size:10.5px;color:#7e8ca6;pointer-events:none}
  .tk-err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9fb0c8;font-size:13px;padding:20px;text-align:center}
  @media (max-width:560px){.tk-panel{width:180px;font-size:11.5px}.tk-legend{font-size:10.5px;max-width:180px}}`;
  document.head.appendChild(st);
}

const CY_STYLE = [
  { selector: 'node', style: { 'label': 'data(label)', 'color': '#dfe8f5', 'font-size': '11px', 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '92px', 'min-zoomed-font-size': 7 } },
  { selector: 'node[tegund = "felag"]', style: { 'shape': 'round-rectangle', 'background-color': COFELAG, 'border-color': 'rgba(255,255,255,.25)', 'border-width': 1, 'width': 'label', 'height': 26, 'padding': '8px', 'color': '#eaf1fb' } },
  { selector: 'node[tegund = "felag"][?rot]', style: { 'background-color': GOLD, 'color': '#1a1205', 'font-weight': 'bold', 'border-color': '#ffd479', 'border-width': 2, 'height': 34, 'font-size': '13px' } },
  { selector: 'node[tegund = "einst"]', style: { 'shape': 'ellipse', 'background-color': PERSON, 'color': '#0b0f17', 'width': 42, 'height': 42, 'text-max-width': '78px' } },
  { selector: 'node[tegund = "einst"][?maskad]', style: { 'background-color': '#0b0f17', 'border-color': MASK, 'border-width': 2, 'border-style': 'dashed', 'color': '#9fb0c8' } },
  { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.9, 'font-size': '10px', 'color': '#cdd6e6', 'text-background-color': '#0b0f17', 'text-background-opacity': 0.75, 'text-background-padding': '2px', 'min-zoomed-font-size': 8 } },
  { selector: 'edge[tegund = "eign"]', style: { 'line-color': '#8fb7e8', 'target-arrow-color': '#8fb7e8', 'width': 'mapData(hlutfall, 0, 100, 1.4, 4.5)', 'label': 'data(label)' } },
  { selector: 'edge[tegund = "stjorn"]', style: { 'line-color': '#b48ad6', 'target-arrow-color': '#b48ad6', 'line-style': 'dashed', 'width': 1.6, 'label': 'data(label)' } },
  { selector: 'node:selected', style: { 'border-color': '#19d3c5', 'border-width': 3 } },
];

/**
 * Teiknar tengslakortið í hostEl. Lazy CDN-hleðsla; skilar Promise<cy|null>.
 * @param {HTMLElement} hostEl
 * @param {object} opts { rotKt, eignData, stjornData }
 */
export function renderTengslakort(hostEl, opts) {
  return new Promise((resolve) => {
    if (!hostEl || hostEl.dataset.tkDone) return resolve(null);
    hostEl.dataset.tkDone = '1';
    injectCss();
    const elements = buildElements(opts || {});
    const wrap = document.createElement('div');
    wrap.className = 'tk-wrap';
    const cyEl = document.createElement('div');
    cyEl.className = 'tk-cy';
    wrap.appendChild(cyEl);
    wrap.insertAdjacentHTML('beforeend',
      '<div class="tk-legend"><div class="tk-lt">Skýring</div>'
      + '<div class="tk-row"><span class="tk-sw" style="background:' + GOLD + '"></span>Rót-félag</div>'
      + '<div class="tk-row"><span class="tk-sw" style="background:' + COFELAG + '"></span>Tengt félag</div>'
      + '<div class="tk-row"><span class="tk-sw" style="background:' + PERSON + '"></span>Nafngreindur einstaklingur</div>'
      + '<div class="tk-row"><span class="tk-sw" style="background:#0b0f17;border:2px dashed ' + MASK + '"></span>Grímuklæddur (fjarlægur)</div>'
      + '<div class="tk-row"><span class="tk-ln"></span>Eignarhald (%)</div>'
      + '<div class="tk-row"><span class="tk-ln dash"></span>Stjórn / fyrirsvar</div></div>');
    wrap.insertAdjacentHTML('beforeend', '<div class="tk-src">heimild: Fyrirtækjaskrá Skattsins (opinbert API)</div>');
    const panel = document.createElement('div');
    panel.className = 'tk-panel';
    wrap.appendChild(panel);
    hostEl.appendChild(wrap);

    if (!elements.length) { cyEl.insertAdjacentHTML('beforeend', '<div class="tk-err">Engin tengsl til að teikna.</div>'); return resolve(null); }

    withCytoscape((cytoscape) => {
      if (!cytoscape) { cyEl.insertAdjacentHTML('beforeend', '<div class="tk-err">Ekki tókst að hlaða kort-einingu (cytoscape).</div>'); return resolve(null); }
      const cy = cytoscape({
        container: cyEl, elements, style: CY_STYLE,
        layout: { name: 'cose', animate: false, padding: 30, nodeRepulsion: 9000, idealEdgeLength: 95, gravity: 0.3, nestingFactor: 0.9 },
        wheelSensitivity: 0.2, minZoom: 0.2, maxZoom: 2.5,
      });
      const showPanel = (n) => {
        const d = n.data();
        const ce = n.connectedEdges();
        let html = '<button type="button" class="tk-x" aria-label="Loka">✕</button>';
        const rows = [];
        if (d.tegund === 'felag') {
          html += '<h5>' + esc(d.nafn || 'Félag') + '</h5>';
          if (d.kt) html += '<div class="tk-kt">kt. ' + esc(ktFmt(d.kt)) + (d.rot ? ' — rót-félag' : '') + '</div>';
          ce.forEach((e) => { if (e.data('tegund') === 'eign' && e.target().id() === d.id) { const s = e.source().data(); rows.push(esc(s.nafn || s.label) + ' á ' + esc(e.data('label'))); } });
          ce.forEach((e) => { if (e.data('tegund') === 'stjorn' && e.target().id() === d.id) { const s = e.source().data(); rows.push((s.maskad ? esc(s.label) : esc(s.nafn || s.label)) + (e.data('hlutverk') ? ' — ' + esc(e.data('hlutverk')) : ' — fyrirsvar')); } });
        } else {
          if (d.maskad) html += '<h5>Grímuklæddur aðili · ' + esc(d.label) + '</h5><div class="tk-kt">Nafn hulið skv. persónuverndarstefnu — aðeins hlutverk sýnt.</div>';
          else { html += '<h5>' + esc(d.nafn || 'Einstaklingur') + '</h5>'; if (d.hlutverk_rot) html += '<div class="tk-kt">' + esc(d.hlutverk_rot) + '</div>'; }
          ce.forEach((e) => { if (e.source().id() !== d.id) return; const t = e.target().data(); const role = e.data('tegund') === 'eign' ? ('á ' + e.data('label')) : (e.data('hlutverk') || 'fyrirsvar'); rows.push(esc(t.nafn || 'félag') + ' — ' + esc(role)); });
        }
        if (rows.length) html += '<ul><li>' + rows.join('</li><li>') + '</li></ul>';
        panel.innerHTML = html;
        panel.classList.add('on');
        panel.querySelector('.tk-x').onclick = () => panel.classList.remove('on');
      };
      cy.on('tap', 'node', (evt) => showPanel(evt.target));
      cy.on('tap', (evt) => { if (evt.target === cy) panel.classList.remove('on'); });
      setTimeout(() => { try { cy.resize(); cy.fit(undefined, 40); } catch (e) {} }, 60);
      resolve(cy);
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `node --test test/tengslakort.test.mjs`
Expected: PASS (5 tests). `buildElements` is pure and touches no DOM, so the tests import cleanly (the `window`/`document` references live only inside `withCytoscape`/`injectCss`/`renderTengslakort`, which the tests never call).

- [ ] **Step 5: Verify the module imports in Node (no top-level DOM access)**

Run (from `web/`): `node --input-type=module -e "import('./src/lib/tengslakort.mjs').then(m => console.log(Object.keys(m).sort().join(',')))"`
Expected: prints `buildElements,renderTengslakort` with no error.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/tengslakort.mjs web/test/tengslakort.test.mjs
git commit -m "feat(tengslakort): cytoscape ownership+governance graph module (lazy CDN)"
```

---

## Task 3: Report integration — "Listi ↔ Kort" tabs in `ubo-report.js` + `ubo.css`

**Files:**
- Modify: `web/src/lib/ubo-report.js` (`eigReport` lines 211-226; add `eigWireTabs`/`eigMountKort`; call from `eigMount` line 259)
- Modify: `web/src/styles/ubo.css` (append after the final `}`)

**Interfaces:**
- Consumes (from Task 2): `renderTengslakort(hostEl, { rotKt, eignData, stjornData })` via dynamic `import('./tengslakort.mjs')`.
- Consumes (from Task 1): `GET /api/tengslanet?kort=1&kt=<rootKt>`.
- Consumes: `rep` (the eigendur report object) is passed straight through as `eignData`; `rootKt` is the root company kt already computed in `eigMount`.
- Produces: no exported API change — `mountUboReport` / `renderUboSample` behave as before, now with a Kort tab. The list view (default) is unchanged.

- [ ] **Step 1: Restructure `eigReport` to add the tab bar + panels**

Replace the entire `eigReport` function (lines 211-226) with:

```js
function eigReport(rep, kt, ctx) {
  return '<div class="eig-report" id="eig-report">'
    + '<div class="eig-h"><h3>Endanlegir eigendur</h3><button type="button" class="eig-print" id="eig-print">🖨️ Prenta / PDF</button></div>'
    + '<div class="eig-tabs" role="tablist">'
    +   '<button type="button" class="eig-tab on" id="eig-tab-listi" role="tab" aria-selected="true" data-tab="listi">📋 Listi</button>'
    +   '<button type="button" class="eig-tab" id="eig-tab-kort" role="tab" aria-selected="false" data-tab="kort">🕸️ Tengslakort</button>'
    + '</div>'
    + '<div class="eig-panel on" id="eig-panel-listi" role="tabpanel" aria-labelledby="eig-tab-listi">'
    +   (kt ? '<div class="eig-related"><a class="eig-fulllink" href="/fyrirtaeki/?q=' + encodeURIComponent(kt) + '">🏢 Fyrirtækjaskýrsla →</a><a class="eig-fulllink" href="/fyrirtaeki/?vidmot=areidanleiki&q=' + encodeURIComponent(kt) + '">🛡️ Áreiðanleikamat →</a></div>' : '')
    +   '<p class="eig-intro">Endanlegir eigendur innihalda upplýsingar um eigendur íslenskra fyrirtækja og vensl þeirra. Upplýsingarnar byggja á gögnum úr hlutafélagaskrá, ársreikningum og skráðum raunverulegum eigendum frá Skattinum. Jafnframt fylgir listi yfir skráða hluthafa.</p>'
    +   '<h4 class="eig-sec">Yfirlit yfir endanlega eigendur</h4>'
    +   '<p class="eig-cap">Myndin sýnir alla endanlega eigendur sem eiga 10% eða meira í félaginu en þó alltaf þrjá stærstu.</p>'
    +   eigNet(rep) + eigLegend(ctx)
    +   eigTable(rep, ctx)
    +   eigReverse(rep, ctx) + eigSubsidiaries(rep, ctx)
    +   '<div id="eig-stjornir"></div>'
    +   '<h4 class="eig-sec">Raunverulegir eigendur samkvæmt fyrirtækjaskrá</h4>' + eigErlent(rep) + eigRaunv(rep, ctx)
    +   '<h4 class="eig-sec">Yfirlit yfir hluthafa</h4>' + eigPie(rep) + eigHluthafar(rep)
    +   eigSources(rep)
    + '</div>'
    + '<div class="eig-panel" id="eig-panel-kort" role="tabpanel" aria-labelledby="eig-tab-kort" hidden>'
    +   '<p class="eig-cap">Myndrænt net eignarhalds (heil lína, %) og stjórnar/fyrirsvars (brotalína) þvert á félög. Fjarlægari einstaklingar eru grímuklæddir skv. persónuverndarstefnu — nöfn þeirra fara ekki í vafrann.</p>'
    +   '<div class="eig-kort-host" id="eig-kort-host"></div>'
    + '</div>';
}
```

- [ ] **Step 2: Add `eigWireTabs` + `eigMountKort`**

Insert these two functions immediately BEFORE `eigMount` (currently line 250, the `// Setur skýrsluna í gám...` comment):

```js
// 🕸️ Flipar: Listi (sjálfgefið) ↔ Tengslakort. Kortið er byggt LAZY við fyrsta smell
// (dynamic import af tengslakort.mjs + cytoscape af CDN → engin þyngd fyrr en beðið er um).
function eigWireTabs(rep, rootKt) {
  const tabs = Array.prototype.slice.call(document.querySelectorAll('.eig-tab'));
  if (!tabs.length) return;
  const panels = { listi: document.getElementById('eig-panel-listi'), kort: document.getElementById('eig-panel-kort') };
  let kortByggt = false;
  tabs.forEach((t) => t.addEventListener('click', () => {
    const which = t.dataset.tab;
    tabs.forEach((x) => { const on = x.dataset.tab === which; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
    for (const k in panels) { if (!panels[k]) continue; const on = k === which; panels[k].classList.toggle('on', on); panels[k].hidden = !on; }
    if (which === 'kort' && !kortByggt) { kortByggt = true; eigMountKort(rep, rootKt); }
  }));
}
async function eigMountKort(rep, rootKt) {
  const host = document.getElementById('eig-kort-host');
  if (!host || host.dataset.done) return;
  host.dataset.done = '1';
  host.innerHTML = '<div class="eig-kort-load">🕸️ Hleð tengslakorti…</div>';
  let stjornData = null;   // null-þolið: án innskráningar / í sýnishorni skilar þetta null → eignarhalds-kort eitt
  if (rootKt) { try { stjornData = await fetch('/api/tengslanet?kort=1&kt=' + encodeURIComponent(rootKt), { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : null)); } catch (e) {} }
  try {
    const { renderTengslakort } = await import('./tengslakort.mjs');
    host.innerHTML = '';
    await renderTengslakort(host, { rotKt: rootKt, eignData: rep, stjornData });
  } catch (e) { host.innerHTML = '<div class="eig-tom">Ekki tókst að hlaða tengslakorti.</div>'; }
}
```

- [ ] **Step 3: Call `eigWireTabs` from `eigMount`**

In `eigMount` (line 259), immediately AFTER the `eigStjornir(rootKt);` line, add:

```js
  eigWireTabs(rep, rootKt);   // 🕸️ Listi/Kort-flipar; kort lazy við fyrsta smell
```

so the block reads:

```js
  eigWireNet(rep, nav, pepSet);
  eigStjornir(rootKt);   // 🪑 F10 fyllist async — brýtur ekkert þótt endapunktur svari ekki
  eigWireTabs(rep, rootKt);   // 🕸️ Listi/Kort-flipar; kort lazy við fyrsta smell
```

- [ ] **Step 4: Append tab + panel CSS to `ubo.css`**

Append at the very end of `web/src/styles/ubo.css` (after the final closing `}` of the `body.fs-printing` block):

```css

/* 🕸️ Listi ↔ Tengslakort flipar (LOTA — tengslakort) */
.eig-tabs { display: flex; gap: 6px; margin: 8px 0 14px; border-bottom: 1px solid rgba(255,255,255,.1); }
.eig-tab { appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; color: #9fb0c8; font: inherit; font-weight: 600; font-size: 14px; padding: 8px 13px; cursor: pointer; margin-bottom: -1px; }
.eig-tab:hover { color: #eaf1fb; }
.eig-tab.on { color: #f6b13b; border-bottom-color: #f6b13b; }
.eig-panel { display: none; }
.eig-panel.on { display: block; }
.eig-kort-host { margin-top: 6px; }
.eig-kort-load { padding: 46px 0; text-align: center; color: #9fb0c8; font-size: 13.5px; }
/* prentun (fs-printing hamur): fela flipa, þvinga Lista fram, sleppa korti */
body.fs-printing .eig-tabs { display: none !important; }
body.fs-printing #eig-panel-listi { display: block !important; }
body.fs-printing #eig-panel-kort { display: none !important; }
```

- [ ] **Step 5: Build to verify Astro compiles the report + dynamic import**

Run (from `web/`): `npx astro build`
Expected: build succeeds (~200+ pages). The dynamic `import('./tengslakort.mjs')` produces a separate Vite chunk — confirm no build error mentioning `tengslakort`.

- [ ] **Step 6: Re-run all unit tests**

Run (from `web/`): `node --test test/`
Expected: PASS (tier + mask + tengslakort suites all green).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/ubo-report.js web/src/styles/ubo.css
git commit -m "feat(eigendur): Listi/Kort tabs — lazy tengslakort in the UBO report"
```

---

## Task 4: Browser verification, mandatory privacy check, deploy

**Files:** none (verification + deploy only)

**Interfaces:** exercises the full stack end-to-end on `/eigendur/`.

- [ ] **Step 1: Start the dev server**

Use preview_start with `{ name: "web" }` (create `.claude/launch.json` if missing: `runtimeExecutable` `npm`, `runtimeArgs` `["run","dev"]`, `port` `4321`, cwd `web`). Astro dev serves `/eigendur/`.

- [ ] **Step 2: Verify the Kort tab renders (public sample — ownership-only)**

Navigate to `/eigendur/?syni=1` (open sample, no login needed). Then:
- read_page → confirm the `.eig-tabs` bar with "📋 Listi" and "🕸️ Tengslakort" is present and the Listi panel shows the existing report.
- computer click the "🕸️ Tengslakort" tab (via its `ref`).
- Wait ~1.5s for the cytoscape CDN to load, then computer screenshot.
- Expected: a force-directed graph — a gold root node, blue company nodes, light circular person nodes, solid `%` ownership edges. (The sample's `/api/tengslanet` returns `holdur:false`/login → ownership-only graph, which is correct.)
- read_console_messages → confirm no uncaught errors; the only network line for cytoscape should be the unpkg script (200).

- [ ] **Step 3: Verify node click side-panel**

computer click a company node in the graph; screenshot. Expected: `.tk-panel` appears top-right with the company name, kt, and its ownership/role list. Click empty canvas → panel closes.

- [ ] **Step 4: ⚠ MANDATORY privacy check (spec §Sannprófun)**

This requires a logged-in session on a real company with a built UBO tree (so `/api/tengslanet` returns `holdur:true` with `krossar`). On the deployed site OR a logged-in dev session:
- Open a purchased/owned `/eigendur/?q=<realKt>` report and click the Kort tab.
- read_network_requests filtered by `tengslanet` → get the `?kort=1` request → fetch its response body.
- **Assert the response body contains NO name or kt of any masked (distant) individual** — every `krossar[]` entry must have only `{ token: 'E'+n, maskad: true, felog: [...] }` and NO `nafn` field. Company names (in `felog`, `onnur`, `krossar[].felog`) and root `stjornendur` names are allowed.
- Cross-check against the plain `/api/tengslanet?kt=<realKt>` (list mode, no `kort=1`): it still returns `krossar` WITH names (unchanged list behavior). This confirms masking is scoped to kort mode only.
- If any distant individual's name/kt appears in the `?kort=1` body, STOP — do not deploy — and fix `maskaKortSvar` / the handler wiring.

- [ ] **Step 5: Final pre-deploy gate**

Run (from `web/`): `npx astro build && node --check worker.js && node --test test/`
Expected: build OK, worker syntax OK, all tests PASS. Optionally `npx wrangler deploy --dry-run` (matches CI) to catch worker bundling issues before pushing.

- [ ] **Step 6: Deploy**

```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt"
git fetch origin
git rebase origin/main            # resolve conflicts — multiple sessions target main
git push origin b2b-topbar:main   # deploys site + worker via CF Worker Routes
```

If the rebase conflicts on `worker.js` / `ubo-report.js` / `ubo.css`, resolve keeping BOTH sides' features, then re-run Step 5 before pushing.

- [ ] **Step 7: Post-deploy smoke test on karp.is**

Navigate to `https://karp.is/eigendur/?syni=1`, click "🕸️ Tengslakort", screenshot to confirm the graph renders in production (cytoscape CDN allowed by CSP — same origin allowance as Leaflet). Then repeat the Step 4 privacy check against a logged-in real report on production and confirm masked individuals carry only tokens.

---

## Self-Review

**1. Spec coverage:**
- Spec §Arkitektúr `tengslakort.mjs` (`withCytoscape` lazy CDN + `renderTengslakort`) → Task 2. ✅
- Spec §Arkitektúr `ubo-report.js` "Kort ↔ Listi" tabs, lazy build on first click, feeds `/api/tengslanet?kort=1` + existing ownership data → Task 3. ✅
- Spec §Persónuvernd server-side `?kort=1` masking (root-connected named; krossar → token `'E'+n`, names cut) with separate cache key → Task 1. ✅
- Spec §Gagnalíkan two node types + two edge types (eign solid+%, stjorn dashed+role) → `buildElements` (Task 2) + `CY_STYLE`. ✅
- Spec §Sjónræn: gold root, dark-blue companies, filled/outlined persons, cose layout, zoom/pan, click side-panel, dark theme, source credit → Task 2 CSS + `CY_STYLE` + `showPanel`. ✅
- Spec §Sannprófun: `astro build` + `node --check worker.js` + `import()` on tengslakort.mjs + browser test + **mandatory privacy test** → Task 4 + import check in Task 2 Step 5. ✅
- Spec §Deploy: worktree `mitt-svaedi-wt`, `git push origin b2b-topbar:main`, rebase on conflicts → Task 4 Step 6. ✅
- Out of scope (PNG/PDF export, national person-keyed reverse net, ownership timeline) → not implemented, correct. ✅

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". Every code step is complete and literal. ✅

**3. Type consistency:** `maskaKortSvar` output shape (`krossar[i] = {token, maskad, felog}`) matches what `buildElements` reads in Task 2 (`p.token`, `p.felog`). Node/edge data keys (`tegund`, `rot`, `maskad`, `hlutfall`, `hlutverk`, `label`) are identical between `buildElements`, `CY_STYLE` selectors, and `showPanel`. IDs (`c:`, `p:nm:`, `p:tok:`) are produced by `felagId`/`nafnPersonId`/`maskPersonId` and consumed only via the graph, never re-parsed. `renderTengslakort(hostEl, {rotKt, eignData, stjornData})` signature matches the `eigMountKort` call in Task 3. ✅
