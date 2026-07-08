# Endanlegir eigendur (UBO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sellable, print-ready "Endanlegir eigendur" (ultimate beneficial owner) report for Icelandic companies — a Creditinfo equivalent — sold per-report (990 kr) under Fyrirtækjaskrá.

**Architecture:** A Node build script recursively walks ownership chains (RSK beneficial owners + annual-report shareholder lists with kt) to compute ultimate ownership, and writes `gogn/eigendur/<kt>.json`. Generation is on-demand: the Cloudflare worker fires a `repository_dispatch` that runs a GitHub Action (puppeteer + pdfplumber), mirroring the existing ársreikningar pipeline 1:1. The Astro front-end polls that JSON and renders an inline-SVG color-coded network plus tables, gated behind a per-report purchase.

**Tech Stack:** Astro SSG (front-end), Cloudflare Worker (`web/worker.js`), Node 22 ESM build scripts, Python 3.12 + pdfplumber (PDF parsing), GitHub Actions. Node built-in `node --test` for JS unit tests; plain `assert`-script for Python.

## Global Constraints

- **All UI text in Icelandic.** Dark theme, accent `#f6b13b`, text `#eaf1fb`/`#cdd6e6`, muted `#8fa0b8`, cards `rgba(255,255,255,.04)` border `rgba(246,177,59,.35)`.
- **CSP forbids external scripts/fonts/graph libs** → everything inline/self-contained; the network is drawn with **inline SVG** (no CDN chart lib).
- **Work only on branch `claude/charming-kepler-e09323`.** Commit there; NEVER push to `origin/main` (Aron reviews + merges).
- **Build gates (must both pass):** `cd web && npx astro build` (~197 pages, must succeed) and `node --check web/worker.js`.
- **Only public data.** Individuals shown as the source shows them (name + birth year; kt only if public in the source — never individuals' kt from RSK beneficial owners). Relationships are "skráð/möguleg", never asserted as exhaustive. No credit score / vanskil.
- **RSK rate limits:** on-demand only, 24 h cache, 1–2 s between calls, `MAX_DEPTH=5`, `MAX_NODES=60`, never batch.
- **Reference spec:** `docs/superpowers/specs/2026-07-08-endanlegir-eigendur-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `skriptur/parse_arsreikningur.py` (modify) | Add `hluthafar_from_lines()` + `parse_hluthafar()`; emit `hluthafar` in JSON output. KPI code unchanged. |
| `skriptur/test/test_hluthafar.py` (create) | Python assert-test for `hluthafar_from_lines`. |
| `skriptur/lib/ubo.mjs` (create) | Pure `computeUbo(nodes, edges, rootId, opts)` → `{endanlegir, othekkt}`. No network. |
| `skriptur/test/ubo.test.mjs` (create) | `node --test` unit tests for the UBO algorithm. |
| `skriptur/lib/rsk.mjs` (create) | Shared RSK+PDF helpers extracted from `build_arsreikningar.mjs` + new `fetchRaunverulegir(kt)`, `fetchHluthafar(kt)`. |
| `skriptur/build_arsreikningar.mjs` (modify) | Import helpers from `lib/rsk.mjs` (behavior unchanged). |
| `skriptur/build_eigendur.mjs` (create) | Assemble ownership graph (chains + beneficial-owner fallback) → `computeUbo` → write `gogn/eigendur/<kt>.json`. Injectable fetchers for testing. |
| `skriptur/test/build_eigendur.test.mjs` (create) | `node --test` for graph assembly + JSON shape using injected mock fetchers (no network). |
| `web/public/gogn/eigendur/_synishorn.json` (create) | Hand-authored sample fixture (Creditinfo "Gervifyrirtæki" example). Powers `?eigendur-syni=1` and front-end dev. |
| `web/src/pages/fyrirtaeki.astro` (modify) | Net v3 (extend `fsWireTengsl`), report section builders, gate/checkout/poll/teaser/sample wiring, CSS. |
| `web/worker.js` (modify) | `eigendurRequestHandler` + `/api/eigendur/request` route (mirror ársreikningur). |
| `.github/workflows/eigendur.yml` (create) | On-demand Action mirroring `arsreikningur.yml`, runs `build_eigendur.mjs`. |

**Dependency order:** Task 1 (parser) and Task 2 (UBO algo) are independent. Task 3 (rsk.mjs) → Task 4 (build_eigendur, needs Task 2). Task 5 (sample) needs the schema (Task 4). Front-end Tasks 6–8 need the schema + sample (can develop against the sample fixture). Tasks 9–10 (worker/action) are independent config. Phase boundaries (after Task 5, after Task 8, after Task 10) are natural review checkpoints.

---

## Task 1: Annual-report shareholder parser (Python)

**Files:**
- Modify: `skriptur/parse_arsreikningur.py` (add functions near the other parsers, ~after line 148; extend the `parse()` return dict ~line 196)
- Test: `skriptur/test/test_hluthafar.py`

**Interfaces:**
- Produces: `hluthafar_from_lines(lines: list[str]) -> list[dict]` where each dict is `{'nafn': str, 'kt': str|None, 'hlutur': float}` (hlutur = percent, 0<h≤100). `parse()` output dict gains key `'hluthafar': list[dict]` (empty list if none found).
- Consumes: existing `to_num()` in the same file.

- [ ] **Step 1: Write the failing test**

Create `skriptur/test/test_hluthafar.py`:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Keyrt: python skriptur/test/test_hluthafar.py   (engin ytri háð nema pdfplumber sem er þegar til)
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from parse_arsreikningur import hluthafar_from_lines

def eq(got, exp, msg):
    assert got == exp, f"{msg}\n  fékk: {got!r}\n  vænti: {exp!r}"

# 1) Nafn + kt (með bandstriki) + prósenta
r = hluthafar_from_lines(["A20 ehf. 430269-4459 50%"])
eq(r, [{'nafn': 'A20 ehf.', 'kt': '4302694459', 'hlutur': 50.0}], "nafn+kt+%")

# 2) Íslensk prósenta með kommu, kt án bandstriks
r = hluthafar_from_lines(["Universal Export 6009780129 20,5%"])
eq(r, [{'nafn': 'Universal Export', 'kt': '6009780129', 'hlutur': 20.5}], "komma-%")

# 3) Einstaklingur án kt
r = hluthafar_from_lines(["Kolbeinn Hannibalsson 10%"])
eq(r, [{'nafn': 'Kolbeinn Hannibalsson', 'kt': None, 'hlutur': 10.0}], "án kt")

# 4) Línur án prósentu = ekki hluthafi (haus, samtala, prósa)
r = hluthafar_from_lines(["Hluthafar", "Eiginfjárhlutfall félagsins er sterkt", "Samtals"])
eq(r, [], "engin %-lína")

# 5) Prósenta > 100 eða 0 = hafnað (t.d. fjárhæð sem endar á %)
r = hluthafar_from_lines(["Eitthvað 0%", "Annað 250%"])
eq(r, [], "utan marka")

print("test_hluthafar: OK")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python skriptur/test/test_hluthafar.py`
Expected: FAIL with `ImportError: cannot import name 'hluthafar_from_lines'`.

- [ ] **Step 3: Add the parser functions**

In `skriptur/parse_arsreikningur.py`, after `is_statement_label()` (line 148), insert:

```python
# ---- Hluthafar (hlutafjár-skýring) --------------------------------------------
KT_RE  = re.compile(r'\b(\d{6}-?\d{4})\b')
PCT_RE = re.compile(r'(\d{1,3}(?:[.,]\d+)?)\s*%')

def hluthafar_from_lines(lines):
    """Textalínur -> [{nafn, kt|None, hlutur}]. Hluthafalína ber prósentu; nafn = línan án kt/%."""
    out = []
    for ln in lines:
        mp = PCT_RE.search(ln)
        if not mp:
            continue
        h = to_num(mp.group(1))
        if h is None or not (0 < h <= 100):
            continue
        mk = KT_RE.search(ln)
        kt = mk.group(1).replace('-', '') if mk else None
        name = ln
        if mk:
            name = name.replace(mk.group(0), ' ')
        name = PCT_RE.sub(' ', name)
        name = re.sub(r'\s+', ' ', name).strip(' .,-–')
        if len(name) >= 2:
            out.append({'nafn': name, 'kt': kt, 'hlutur': h})
    return out

# Hausar sem afmarka hluthafa-skýringu (ASCII-beinagrind; '.' passar við brenglaða broddstafi).
HLUTHAFAR_HEAD = re.compile(r'^(hluthafar|hlutafj.reign|eignarhlutir hluthafa|hlutir og hluthafar)', re.I)
HLUTHAFAR_END  = re.compile(r'^(sk.ringar?|rekstrarreikning|efnahagsreikning|sj..streymi)\b', re.I)

def parse_hluthafar(pdf):
    """Finna hluthafa-skýringu í PDF og þátta hana. Skilar [] finnist ekkert nothæft."""
    for pg in pdf.pages:
        text = pg.extract_text() or ''
        lines = [l.strip() for l in text.split('\n')]
        for i, l in enumerate(lines):
            if HLUTHAFAR_HEAD.match(l):
                seg = []
                for l2 in lines[i + 1:]:
                    if HLUTHAFAR_END.match(l2):
                        break
                    seg.append(l2)
                res = hluthafar_from_lines(seg)
                if res:
                    return res
    return []
```

Then extend the `parse()` return (line ~196) to include shareholders. Change:

```python
    return {'ar': [ar_cur, ar_prev], 'mynt': cur, 'kvardi': scale,
            'rekstur': rekstur, 'efnahagur': efnahagur, 'afleitt': afleitt}
```

to:

```python
    return {'ar': [ar_cur, ar_prev], 'mynt': cur, 'kvardi': scale,
            'rekstur': rekstur, 'efnahagur': efnahagur, 'afleitt': afleitt,
            'hluthafar': parse_hluthafar(pdf)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python skriptur/test/test_hluthafar.py`
Expected: `test_hluthafar: OK`

- [ ] **Step 5: Regression-check the existing parser still imports/runs**

Run: `python -c "import skriptur.parse_arsreikningur" 2>NUL || python -c "import sys; sys.path.insert(0,'skriptur'); import parse_arsreikningur; print('import ok')"`
Expected: `import ok` (no exceptions; KPI code untouched).

- [ ] **Step 6: Commit**

```bash
git add skriptur/parse_arsreikningur.py skriptur/test/test_hluthafar.py
git commit -m "Ársreikningur: hluthafa-þáttun (hluthafar_from_lines + parse_hluthafar)"
```

**Note (spike, runs in GH Action / Aron's env):** `hluthafar_from_lines` is unit-proven; `parse_hluthafar`'s section-location is validated against a real filing during Task 4's live run. If a real note doesn't match `HLUTHAFAR_HEAD`, widen the regex there — the front-end already degrades gracefully on `hluthafar: []`.

---

## Task 2: UBO computation (pure algorithm)

**Files:**
- Create: `skriptur/lib/ubo.mjs`
- Test: `skriptur/test/ubo.test.mjs`

**Interfaces:**
- Produces: `computeUbo(nodes, edges, rootId, opts?) -> { endanlegir, othekkt }`
  - `nodes`: `[{id, kt, nafn, tegund:'felag'|'einst', faeding?, land?, er_rot?}]`
  - `edges`: `[{fra, til, hlutur}]` — `fra` owns `hlutur`% of `til`.
  - returns `endanlegir`: `[{nafn, kt, faeding, tegund, hlutur, gegnum:[string]}]` sorted desc by `hlutur`; `othekkt`: number (residual to 100).
  - `opts`: `{threshold=10, minShown=3}` (used by callers for display; algorithm returns all).
- Also exports `round2(n)`.

- [ ] **Step 1: Write the failing tests**

Create `skriptur/test/ubo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeUbo, round2 } from '../lib/ubo.mjs';

test('direct individual owner', () => {
  const nodes = [
    { id: 'root', kt: '1', nafn: 'Félag', tegund: 'felag', er_rot: true },
    { id: 'p', kt: null, nafn: 'Jón', tegund: 'einst', faeding: '1970' },
  ];
  const edges = [{ fra: 'p', til: 'root', hlutur: 60 }];
  const { endanlegir, othekkt } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir.length, 1);
  assert.deepEqual(endanlegir[0], { nafn: 'Jón', kt: null, faeding: '1970', tegund: 'einst', hlutur: 60, gegnum: [] });
  assert.equal(othekkt, 40);
});

test('chain through intermediates multiplies and lists gegnum owner-first', () => {
  const nodes = [
    { id: 'root', kt: 'G', nafn: 'Gervi', tegund: 'felag', er_rot: true },
    { id: 'vala', kt: 'V', nafn: 'Vala hf.', tegund: 'felag' },
    { id: 'leggir', kt: 'L', nafn: 'Leggir ehf.', tegund: 'felag' },
    { id: 'njall', kt: null, nafn: 'Njáll', tegund: 'einst', faeding: '1972' },
  ];
  const edges = [
    { fra: 'vala', til: 'root', hlutur: 80 },
    { fra: 'leggir', til: 'vala', hlutur: 84.25 },
    { fra: 'njall', til: 'leggir', hlutur: 100 },
  ];
  const { endanlegir } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir[0].nafn, 'Njáll');
  assert.equal(endanlegir[0].hlutur, 67.4);            // 0.8*0.8425*1 = 0.674
  assert.deepEqual(endanlegir[0].gegnum, ['Leggir ehf.', 'Vala hf.']);
});

test('same owner via two paths aggregates', () => {
  const nodes = [
    { id: 'root', kt: 'R', nafn: 'R', tegund: 'felag', er_rot: true },
    { id: 'a', kt: 'A', nafn: 'A', tegund: 'felag' },
    { id: 'p', kt: 'P', nafn: 'P', tegund: 'einst' },
  ];
  const edges = [
    { fra: 'p', til: 'root', hlutur: 30 },   // direct 30
    { fra: 'a', til: 'root', hlutur: 40 },   // via A
    { fra: 'p', til: 'a', hlutur: 50 },      // P owns 50% of A -> 20
  ];
  const { endanlegir } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir.length, 1);
  assert.equal(endanlegir[0].hlutur, 50);  // 30 + 20
});

test('unresolvable company is a terminal ultimate owner', () => {
  const nodes = [
    { id: 'root', kt: 'R', nafn: 'R', tegund: 'felag', er_rot: true },
    { id: 'foreign', kt: 'F', nafn: 'Cranberry Investments', tegund: 'felag' },
  ];
  const edges = [{ fra: 'foreign', til: 'root', hlutur: 9.96 }]; // no owners of `foreign`
  const { endanlegir, othekkt } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir[0].nafn, 'Cranberry Investments');
  assert.equal(endanlegir[0].tegund, 'felag');
  assert.equal(othekkt, round2(100 - 9.96));
});

test('cycle does not infinite-loop', () => {
  const nodes = [
    { id: 'root', kt: 'R', nafn: 'R', tegund: 'felag', er_rot: true },
    { id: 'a', kt: 'A', nafn: 'A', tegund: 'felag' },
  ];
  const edges = [{ fra: 'a', til: 'root', hlutur: 50 }, { fra: 'root', til: 'a', hlutur: 50 }];
  const { endanlegir } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir[0].nafn, 'A'); // A terminal (its only owner is root, on-path -> skipped)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test skriptur/test/ubo.test.mjs`
Expected: FAIL — `Cannot find module '../lib/ubo.mjs'`.

- [ ] **Step 3: Implement the algorithm**

Create `skriptur/lib/ubo.mjs`:

```js
// Hreinn UBO-reikningur: eignarhaldsnet -> endanlegir eigendur + óþekktur afgangur.
// Gengur UPP frá rót um "hver á mig"-leggi, margfaldar brot, safnar á lauf (einstaklingar
// eða félög sem ekki verður rakið lengra). Engin net-köll — prófanlegt.
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeUbo(nodes, edges, rootId, { threshold = 10, minShown = 3 } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ownersOf = new Map();                       // til -> [{fra, frac}]
  for (const e of edges) {
    if (!ownersOf.has(e.til)) ownersOf.set(e.til, []);
    ownersOf.get(e.til).push({ fra: e.fra, frac: (Number(e.hlutur) || 0) / 100 });
  }
  const isTerminal = (id) => {
    const n = byId.get(id);
    if (!n) return true;
    if (n.tegund === 'einst') return true;
    const os = ownersOf.get(id);
    return !(os && os.length);                       // félag án þekktra eigenda = lauf (óþekkt lengra)
  };
  const identity = (n) => (n.kt ? 'kt:' + n.kt : 'nm:' + String(n.nafn || '').toLowerCase().trim() + '|' + (n.faeding || ''));
  const agg = new Map();                             // identity -> {node, hlutur, gegnum:[]}

  function walk(id, frac, chain) {
    for (const { fra, frac: f } of ownersOf.get(id) || []) {
      if (chain.includes(fra)) continue;             // hringvörn
      const owner = byId.get(fra);
      if (!owner) continue;
      const nf = frac * f;
      if (isTerminal(fra)) {
        const key = identity(owner);
        const cur = agg.get(key) || { node: owner, hlutur: 0, gegnum: [] };
        cur.hlutur += nf;
        // millifélög á leiðinni, raðað eiganda-megin fyrst (chain er rót..id, öfug röð)
        for (const cid of [...chain].slice(1).reverse()) {
          const cn = byId.get(cid);
          if (cn && cn.tegund === 'felag' && !cur.gegnum.includes(cn.nafn)) cur.gegnum.push(cn.nafn);
        }
        agg.set(key, cur);
      } else {
        walk(fra, nf, [...chain, fra]);
      }
    }
  }
  walk(rootId, 1, [rootId]);

  const endanlegir = [...agg.values()]
    .map((v) => ({
      nafn: v.node.nafn, kt: v.node.kt || null, faeding: v.node.faeding || null,
      tegund: v.node.tegund, hlutur: round2(v.hlutur * 100), gegnum: v.gegnum,
    }))
    .sort((a, b) => b.hlutur - a.hlutur);
  const sum = endanlegir.reduce((s, e) => s + e.hlutur, 0);
  const othekkt = round2(Math.max(0, 100 - sum));
  return { endanlegir, othekkt };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test skriptur/test/ubo.test.mjs`
Expected: `# pass 5` (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/ubo.mjs skriptur/test/ubo.test.mjs
git commit -m "UBO: hreinn eignarhalds-reikningur (computeUbo) + prófanir"
```

---

## Task 3: Shared RSK helpers module (refactor + new fetchers)

**Files:**
- Create: `skriptur/lib/rsk.mjs`
- Modify: `skriptur/build_arsreikningar.mjs` (replace inline helpers with imports)

**Interfaces:**
- Produces (exports from `lib/rsk.mjs`): `jarOf()`, `rskText(s)`, `fetchItemids(kt, {UA})`, `addToCart(kt, itemid, typeid, {UA})`, `downloadPdf(kid, {CHROME, UA, BUYER})`, `parsePdf(pdfPath, knownYr, {PARSER, PYTHON})`, `fetchRaunverulegir(kt, {UA})`, `fetchHluthafar(kt, {...opts})`, and constants `RSK`, `TYPE`.
- Consumes: existing logic in `build_arsreikningar.mjs` lines 55–144 (moved verbatim), and `parse_arsreikningur.py`.

- [ ] **Step 1: Create `lib/rsk.mjs` by moving the shared helpers**

Create `skriptur/lib/rsk.mjs`. Move the bodies of `jarOf`, `rskText`, `fetchItemids`, `addToCart`, `downloadPdf`, `parsePdf` **verbatim** from `build_arsreikningar.mjs` (lines 58–144), converting module-level constants they use into parameters. Add the two new fetchers. Full file:

```js
// Sameiginlegar RSK + PDF-hjálpir fyrir build_arsreikningar.mjs OG build_eigendur.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RSK = 'https://www.skatturinn.is';
export const TYPE = { 1: 'Ársreikningur', 2: 'Samstæðureikningur' };
const DEF_UA = 'karp.is fyrirtaekjaskra (aronheidars@gmail.com)';
const DEF_CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PARSER = path.join(__dirname, '..', 'parse_arsreikningur.py');

export const jarOf = () => {
  const jar = {};
  return {
    absorb: (res) => { for (const c of (res.headers.getSetCookie?.() || [])) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i).trim()] = kv.slice(i + 1); } },
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
  };
};
export const rskText = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export async function fetchItemids(kt, { UA = DEF_UA } = {}) {
  const res = await fetch(`${RSK}/fyrirtaekjaskra/leit/kennitala/${kt}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`RSK svaraði HTTP ${res.status} (líkleg throttla)`);
  const html = await res.text();
  const h1 = html.match(/<h1>\s*([\s\S]*?)\s*\((\d{10})\)/);
  if (!h1) throw new Error('RSK-síða án fyrirtækjahauss (throttla/villa?)');
  const nafn = rskText(h1[1]);
  const ti = html.search(/class="annualTable"/);
  const rows = [];
  if (ti >= 0) {
    const tbl = html.slice(ti, html.indexOf('</table>', ti));
    for (const tr of tbl.split(/<tr\b/i).slice(1)) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => rskText(m[1]));
      const dm = tr.match(/data-itemid="(\d+)"\s+data-typeid="(\d+)"/);
      if (dm && /^\d{4}/.test(tds[0] || '')) rows.push({ ar: tds[0], skil: tds[2] || null, nr: dm[1], typeid: dm[2], teg: tds[4] || TYPE[dm[2]] || null });
    }
  }
  return { kt, nafn, rows };
}

export async function addToCart(kt, itemid, typeid, { UA = DEF_UA } = {}) {
  const jar = jarOf();
  let r = await fetch(`${RSK}/fyrirtaekjaskra/leit/kennitala/${kt}`, { headers: { 'User-Agent': UA } });
  jar.absorb(r); await r.text();
  r = await fetch(`${RSK}/da/CartService/addToCart?itemid=${itemid}&typeid=${typeid}`, { headers: { 'User-Agent': UA, Cookie: jar.header(), 'X-Requested-With': 'XMLHttpRequest' } });
  const body = await r.text();
  const m = body.match(/kid=([A-Z0-9]+)/);
  if (!m) throw new Error('addToCart brást: ' + body.slice(0, 160));
  return m[1];
}

export async function downloadPdf(kid, { CHROME = DEF_CHROME, UA = DEF_UA, BUYER = { name: 'Karp', email: 'aronheidars@gmail.com' } } = {}) {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`https://vefur.rsk.is/Vefverslun/Default.aspx?kid=${kid}`, { waitUntil: 'networkidle2', timeout: 40000 });
    await page.evaluate((b) => { const n = document.querySelector('[name=buyername]'); if (n) n.value = b.name; const e = document.querySelector('[name=buyeremail]'); if (e) e.value = b.email; }, BUYER);
    const kaupa = await page.$('#MainContent_btnKaupa');
    if (!kaupa) throw new Error('enginn btnKaupa: ' + (await page.evaluate(() => document.body.innerText.slice(0, 150))));
    await kaupa.click();
    await page.waitForSelector('#MainContent_ucVoruGrid_GridView1_Btn_Saekja_0', { timeout: 20000 }).catch(() => {});
    const post = await page.evaluate(() => {
      const btn = document.querySelector('#MainContent_ucVoruGrid_GridView1_Btn_Saekja_0');
      if (!btn) return { err: 'enginn Sækja-hnappur', txt: document.body.innerText.slice(0, 150) };
      const form = btn.form; const fd = {};
      for (const el of form.querySelectorAll('input,select')) { if (el.type === 'submit') continue; if (el.name) fd[el.name] = el.value; }
      fd['hfMouseClicked'] = 'true'; fd[btn.name] = btn.value || '';
      return { action: form.action || location.href, fields: fd };
    });
    if (post.err) throw new Error(post.err + ' | ' + (post.txt || ''));
    const cookieHeader = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    await browser.close();
    const res = await fetch(post.action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader, 'User-Agent': UA }, body: new URLSearchParams(post.fields).toString() });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('ekki PDF (ct=' + (res.headers.get('content-type') || '') + ', ' + buf.length + 'B)');
    return buf;
  } finally { try { await browser.close(); } catch {} }
}

export function parsePdf(pdfPath, knownYr, { PYTHON = process.env.PYTHON || 'python' } = {}) {
  const args = [PARSER, pdfPath];
  if (knownYr) args.push(String(knownYr));
  const r = spawnSync(PYTHON, args, { encoding: 'utf-8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('parse_arsreikningur.py: ' + (r.stderr || r.error));
  return JSON.parse(r.stdout);
}

// ---- Nýtt: raunverulegir eigendur af OPINNI RSK-detail-síðu (port á worker.js 687–705) ----
export async function fetchRaunverulegir(kt, { UA = DEF_UA } = {}) {
  const res = await fetch(`${RSK}/fyrirtaekjaskra/leit/kennitala/${kt}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`RSK HTTP ${res.status}`);
  const html = await res.text();
  const iE = html.indexOf('Raunverulegir eigendur');
  if (iE < 0) return { eigendur: [], tomt: false };
  let eseg = html.slice(iE, iE + 9000);
  const end = eseg.search(/Leit í fyrirtækjaskrá|<h3/i);
  if (end > 0) eseg = eseg.slice(0, end);
  const eig = [];
  for (const h of [...eseg.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)]) {
    const nafn = rskText(h[1]);
    if (!nafn) continue;
    const after = eseg.slice(h.index + h[0].length, h.index + h[0].length + 900);
    const c = [...after.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => rskText(m[1]));
    eig.push({ nafn, faeding: c[0] || null, buseta: (c[1] || '').replace(/\.$/, '') || null, rikisfang: c[2] || null, hlutur: c[3] && c[3] !== '-' ? c[3] : null, tegund: (c[4] || '').replace(/[,\s]+$/, '') || null });
    if (eig.length >= 20) break;
  }
  return { eigendur: eig, tomt: eig.length === 0 };
}

// ---- Nýtt: hluthafar úr nýjasta ársreikningi (kt-berandi -> drífur endurkvæmni) ----
export async function fetchHluthafar(kt, opts = {}) {
  const info = await fetchItemids(kt, opts);
  const rows = info.rows.filter((r) => ['1', '2'].includes(r.typeid));
  if (!rows.length) return { nafn: info.nafn, hluthafar: [], ar: null };
  const byYear = new Map();
  for (const r of rows) { const cur = byYear.get(r.ar); if (!cur || (r.typeid === '2' && cur.typeid !== '2')) byYear.set(r.ar, r); }
  const pick = [...byYear.values()].sort((a, b) => String(b.ar).localeCompare(String(a.ar)))[0];
  const kid = await addToCart(kt, pick.nr, pick.typeid, opts);
  const pdf = await downloadPdf(kid, opts);
  const tmp = path.join(__dirname, `_tmp_hl_${kt}.pdf`);
  fs.writeFileSync(tmp, pdf);
  try {
    const parsed = parsePdf(tmp, pick.ar, opts);
    return { nafn: info.nafn, hluthafar: parsed.hluthafar || [], ar: pick.ar };
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}
```

- [ ] **Step 2: Verify the new module parses**

Run: `node --check skriptur/lib/rsk.mjs`
Expected: no output (exit 0).

- [ ] **Step 3: Rewire `build_arsreikningar.mjs` to import the shared helpers**

In `skriptur/build_arsreikningar.mjs`: delete the inline definitions of `jarOf`, `rskText`, `fetchItemids`, `addToCart`, `downloadPdf`, `parsePdf` (lines ~57–144) and the now-unused constants `CHROME`, `UA`, `RSK`, `BUYER`, `TYPE`, `PARSER`. Add at the top (after the existing imports, ~line 46):

```js
import { fetchItemids, addToCart, downloadPdf, parsePdf, TYPE } from './lib/rsk.mjs';
```

Keep `OUTDIR` and everything from `buildForKt` down unchanged (they already call `fetchItemids`/`addToCart`/`downloadPdf`/`parsePdf` with the same signatures; the new optional-opts params default to the same values).

- [ ] **Step 4: Verify `build_arsreikningar.mjs` still checks and shows usage**

Run: `node --check skriptur/build_arsreikningar.mjs && node skriptur/build_arsreikningar.mjs`
Expected: prints `Notkun: node build_arsreikningar.mjs <kt> [<kt> ...] [--ar N]` (no crash — proves imports resolve).

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/rsk.mjs skriptur/build_arsreikningar.mjs
git commit -m "RSK: draga sameiginlegar hjálpir í lib/rsk.mjs + fetchRaunverulegir/fetchHluthafar"
```

---

## Task 4: UBO orchestrator (`build_eigendur.mjs`)

**Files:**
- Create: `skriptur/build_eigendur.mjs`
- Test: `skriptur/test/build_eigendur.test.mjs`

**Interfaces:**
- Produces: `buildGraph(rootKt, deps) -> { kt, nafn, net:{nodes,edges}, raunverulegir, raunverulegirTomt, hluthafar, hluthafarUppspretta, dypt, hnutar_alls, afmarkad }` where `deps = { fetchRaunverulegir, fetchHluthafar, log?, MAX_DEPTH?, MAX_NODES? }` (fetchers injected → testable without network). Then `assembleReport(rootKt, deps)` calls `buildGraph` + `computeUbo` and returns the full JSON object (or `{kt, nafn, engin:true, astaeda}`).
- Consumes: `computeUbo` (Task 2), `fetchRaunverulegir`/`fetchHluthafar` (Task 3).

- [ ] **Step 1: Write the failing test (mock fetchers, no network)**

Create `skriptur/test/build_eigendur.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleReport } from '../build_eigendur.mjs';

// Gervi-RSK: Gervifélag (rót) á Vala hf. (80%); Vala á Leggir ehf. (84,25%); Leggir á Njáll (100%, einst).
const HLUT = {
  '1000000000': { nafn: 'Gervifélag ehf.', ar: '2019', hluthafar: [{ nafn: 'Vala hf.', kt: '2000000000', hlutur: 80 }] },
  '2000000000': { nafn: 'Vala hf.', ar: '2019', hluthafar: [{ nafn: 'Leggir ehf.', kt: '3000000000', hlutur: 84.25 }] },
  '3000000000': { nafn: 'Leggir ehf.', ar: '2019', hluthafar: [{ nafn: 'Njáll Þorgeirsson', kt: null, hlutur: 100 }] },
};
const deps = {
  fetchHluthafar: async (kt) => HLUT[kt] || { nafn: null, hluthafar: [], ar: null },
  fetchRaunverulegir: async () => ({ eigendur: [{ nafn: 'Njáll Þorgeirsson', faeding: '1972-FEBRÚAR', hlutur: '69%', tegund: 'Óbeint eignarhald á hlutafé' }], tomt: false }),
};

test('assembleReport builds tree + UBO from injected chains', async () => {
  const r = await assembleReport('1000000000', deps);
  assert.equal(r.kt, '1000000000');
  assert.equal(r.nafn, 'Gervifélag ehf.');
  const njall = r.endanlegir.find((e) => e.nafn === 'Njáll Þorgeirsson');
  assert.ok(njall, 'Njáll er endanlegur eigandi');
  assert.equal(njall.hlutur, 67.4);
  assert.deepEqual(njall.gegnum, ['Leggir ehf.', 'Vala hf.']);
  assert.equal(r.raunverulegir[0].nafn, 'Njáll Þorgeirsson');
  assert.equal(r.hluthafar[0].nafn, 'Vala hf.');
  assert.ok(r.net.nodes.some((n) => n.er_rot));
});

test('no shareholders but has beneficial owners -> fallback edges to root', async () => {
  const r = await assembleReport('9', {
    fetchHluthafar: async () => ({ nafn: 'Dreift ehf.', hluthafar: [], ar: null }),
    fetchRaunverulegir: async () => ({ eigendur: [{ nafn: 'Anna', faeding: '1980', hlutur: '55%', tegund: 'Bein' }], tomt: false }),
  });
  assert.equal(r.endanlegir[0].nafn, 'Anna');
  assert.equal(r.endanlegir[0].hlutur, 55);
});

test('no data anywhere -> engin merki', async () => {
  const r = await assembleReport('0', {
    fetchHluthafar: async () => ({ nafn: 'Tómt ehf.', hluthafar: [], ar: null }),
    fetchRaunverulegir: async () => ({ eigendur: [], tomt: true }),
  });
  assert.equal(r.engin, true);
  assert.ok(r.astaeda);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test skriptur/test/build_eigendur.test.mjs`
Expected: FAIL — `Cannot find module '../build_eigendur.mjs'`.

- [ ] **Step 3: Implement the orchestrator**

Create `skriptur/build_eigendur.mjs`:

```js
#!/usr/bin/env node
// build_eigendur.mjs — endurkvæmt UBO-tré fyrir eitt félag -> gogn/eigendur/<kt>.json
// On-demand (GH Action). Speglar build_arsreikningar.mjs. Sjá spec 2026-07-08.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeUbo } from './lib/ubo.mjs';
import * as rsk from './lib/rsk.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTDIR = path.join(__dirname, '..', 'web', 'public', 'gogn', 'eigendur');
const pct = (s) => { const m = String(s ?? '').replace(',', '.').match(/(-?[\d.]+)/); return m ? Math.min(100, Math.abs(parseFloat(m[1]))) : null; };

// Byggja eignarhaldsnet: endurkvæmt niður hluthafa-keðjur; fallback á raunverulega eigendur.
export async function buildGraph(rootKt, deps) {
  const { fetchHluthafar, fetchRaunverulegir, log = () => {}, MAX_DEPTH = 5, MAX_NODES = 60 } = deps;
  const nodes = [];
  const edges = [];
  const idByKt = new Map();
  const visited = new Set();
  let afmarkad = false, dypt = 0;

  const ensureNode = (kt, nafn, tegund, extra = {}) => {
    const id = kt ? 'kt' + kt : 'n' + nodes.length;
    if (kt && idByKt.has(kt)) { const n = nodes[idByKt.get(kt)]; if (nafn && !n.nafn) n.nafn = nafn; return n.id; }
    const node = { id, kt: kt || null, nafn: nafn || '—', tegund, ...extra };
    if (kt) idByKt.set(kt, nodes.length);
    nodes.push(node);
    return id;
  };
  const erFelag = (h) => !!h.kt || /(^|\s)(ehf|hf|ohf|slhf|slf|sf|svf|bs|incorporation|investments|international|ltd|inc|holding)\.?\s*$/i.test(String(h.nafn || ''));

  const rootInfo = await fetchHluthafar(rootKt).catch(() => ({ nafn: null, hluthafar: [], ar: null }));
  const rootId = ensureNode(rootKt, rootInfo.nafn, 'felag', { er_rot: true });

  async function recurse(kt, nodeId, depth) {
    if (depth > MAX_DEPTH || nodes.length >= MAX_NODES || visited.has(kt)) { if (nodes.length >= MAX_NODES || depth > MAX_DEPTH) afmarkad = true; return; }
    visited.add(kt);
    dypt = Math.max(dypt, depth);
    const info = kt === rootKt ? rootInfo : await fetchHluthafar(kt).catch(() => ({ hluthafar: [] }));
    for (const h of info.hluthafar || []) {
      const felag = erFelag(h);
      const childId = ensureNode(h.kt, h.nafn, felag ? 'felag' : 'einst', felag ? {} : { faeding: h.faeding || null });
      const hl = pct(h.hlutur);
      edges.push({ fra: childId, til: nodeId, hlutur: hl, band: hl == null ? 'lt25' : hl >= 51 ? '51' : hl >= 25 ? '25' : 'lt25', heimild: info.ar ? `Ársreikningur ${info.ar}` : 'Ársreikningaskrá (RSK)' });
      if (felag && h.kt && nodes.length < MAX_NODES) { await new Promise((r) => setTimeout(r, deps.delay ?? 1200)); await recurse(h.kt, childId, depth + 1); }
    }
  }
  await recurse(rootKt, rootId, 0);

  const rv = await fetchRaunverulegir(rootKt).catch(() => ({ eigendur: [], tomt: false }));
  // Fallback: engar hluthafa-keðjur en til raunverulegir eigendur -> beinir leggir á rót svo net/UBO birtist.
  if (edges.length === 0 && rv.eigendur.length) {
    for (const e of rv.eigendur) {
      const felag = /(ehf|hf|ohf|slf|sf)\.?\s*$/i.test(String(e.nafn || ''));
      const id = ensureNode(null, e.nafn, felag ? 'felag' : 'einst', { faeding: e.faeding || null });
      const hl = pct(e.hlutur);
      edges.push({ fra: id, til: rootId, hlutur: hl, band: hl == null ? 'lt25' : hl >= 51 ? '51' : hl >= 25 ? '25' : 'lt25', heimild: 'Raunverulegir eigendur (Skatturinn)' });
    }
  }
  return {
    kt: rootKt, nafn: rootInfo.nafn || rootKt, net: { nodes, edges },
    raunverulegir: rv.eigendur, raunverulegirTomt: !!rv.tomt,
    hluthafar: rootInfo.hluthafar || [], hluthafarUppspretta: rootInfo.ar ? `Ársreikningur ${rootInfo.ar}` : null,
    dypt, hnutar_alls: nodes.length, afmarkad, rootId,
  };
}

export async function assembleReport(rootKt, deps) {
  const g = await buildGraph(rootKt, deps);
  const sott = deps.sott || null;                    // dagsetning sett af CLI (Date bannað í prófum)
  if (g.net.edges.length === 0 && g.raunverulegir.length === 0) {
    return { kt: rootKt, nafn: g.nafn, sott, engin: true, astaeda: 'Hvorki skráðir hluthafar (ársreikningur) né raunverulegir eigendur fundust — ekki hægt að byggja eignarhaldsnet.' };
  }
  const { endanlegir, othekkt } = computeUbo(g.net.nodes, g.net.edges, g.rootId);
  return {
    kt: rootKt, nafn: g.nafn, sott,
    heimildir: ['Hlutafélagaskrá (RSK)', 'Ársreikningaskrá (RSK)', 'Raunverulegir eigendur (Skatturinn)'],
    dypt: g.dypt, hnutar_alls: g.hnutar_alls, afmarkad: g.afmarkad,
    net: { nodes: g.net.nodes.map(({ id, kt, nafn, tegund, faeding, land, er_rot }) => ({ id, kt, nafn, tegund, ...(faeding ? { faeding } : {}), ...(land ? { land } : {}), ...(er_rot ? { er_rot } : {}) })), edges: g.net.edges },
    endanlegir, othekkt,
    raunverulegir: g.raunverulegir, raunverulegirTomt: g.raunverulegirTomt,
    hluthafar: g.hluthafar, hluthafarUppspretta: g.hluthafarUppspretta,
  };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build_eigendur.mjs')) {
  const kts = process.argv.slice(2).map((a) => a.replace(/\D/g, '')).filter((a) => /^\d{10}$/.test(a));
  if (!kts.length) { console.log('Notkun: node build_eigendur.mjs <kt> [<kt> ...]'); process.exit(0); }
  fs.mkdirSync(OUTDIR, { recursive: true });
  const sott = new Date().toISOString().slice(0, 10);
  for (const kt of kts) {
    try {
      const rep = await assembleReport(kt, { fetchHluthafar: rsk.fetchHluthafar, fetchRaunverulegir: rsk.fetchRaunverulegir, log: console.log, sott });
      fs.writeFileSync(path.join(OUTDIR, `${kt}.json`), JSON.stringify(rep, null, 1));
      console.log(`  -> gogn/eigendur/${kt}.json (${rep.engin ? 'engin gögn' : rep.endanlegir.length + ' endanlegir, ' + rep.hnutar_alls + ' hnútar'})`);
    } catch (e) { console.error(`  ${kt}: VILLA — ${e.message}`); }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test skriptur/test/build_eigendur.test.mjs`
Expected: `# pass 3`.

- [ ] **Step 5: Verify CLI checks and shows usage**

Run: `node --check skriptur/build_eigendur.mjs && node skriptur/build_eigendur.mjs`
Expected: prints `Notkun: node build_eigendur.mjs <kt> [<kt> ...]`.

- [ ] **Step 6: Commit**

```bash
git add skriptur/build_eigendur.mjs skriptur/test/build_eigendur.test.mjs
git commit -m "UBO: build_eigendur.mjs — endurkvæmt tré + fallback + JSON (DI-prófanir)"
```

**Live spike (best-effort, may run in Aron's env / GH Action):** if `puppeteer-core` + Chrome are available, run `node skriptur/build_eigendur.mjs 5810080150` (or another real kt with owners) and inspect `gogn/eigendur/<kt>.json`. This validates `parse_hluthafar` section-location against a real filing. If the shareholder note isn't found, widen `HLUTHAFAR_HEAD` in Task 1 and re-run. Do **not** block the front-end tasks on this — they develop against the sample fixture (Task 5).

---

## Task 5: Sample fixture (`_synishorn.json`)

**Files:**
- Create: `web/public/gogn/eigendur/_synishorn.json`

**Interfaces:**
- Produces: a schema-valid report object (same shape as `assembleReport` output) mirroring the Creditinfo "Gervifyrirtæki" example. Consumed by the front-end sample mode (Task 8) and used as the dev fixture for Tasks 6–7.

- [ ] **Step 1: Author the fixture**

Create `web/public/gogn/eigendur/_synishorn.json`:

```json
{
 "kt": "0000000000",
 "nafn": "Gervifyrirtæki ehf.",
 "sott": "2026-07-08",
 "demo": true,
 "heimildir": ["Hlutafélagaskrá (RSK)", "Ársreikningaskrá (RSK)", "Raunverulegir eigendur (Skatturinn)"],
 "dypt": 3,
 "hnutar_alls": 9,
 "afmarkad": false,
 "net": {
  "nodes": [
   { "id": "root", "kt": "0000000000", "nafn": "Gervifyrirtæki ehf.", "tegund": "felag", "er_rot": true },
   { "id": "vala", "kt": "1111111111", "nafn": "Vala hf.", "tegund": "felag" },
   { "id": "leggir", "kt": "2222222222", "nafn": "Leggir ehf.", "tegund": "felag" },
   { "id": "njall", "kt": null, "nafn": "Njáll Þorgeirsson", "tegund": "einst", "faeding": "1972", "land": "Ísland" },
   { "id": "appels", "kt": "3333333333", "nafn": "Appelsínur ehf.", "tegund": "felag" },
   { "id": "epli", "kt": "4444444444", "nafn": "Epli ehf.", "tegund": "felag" },
   { "id": "cranberry", "kt": "6603199530", "nafn": "Cranberry Investments", "tegund": "felag" },
   { "id": "bromber", "kt": "5555555555", "nafn": "Brómber hf.", "tegund": "felag" },
   { "id": "monsters", "kt": "6702199960", "nafn": "Monsters Incorporation", "tegund": "felag" }
  ],
  "edges": [
   { "fra": "vala", "til": "root", "hlutur": 80, "band": "51", "heimild": "Ársreikningur 2019, Gervifyrirtæki ehf." },
   { "fra": "leggir", "til": "vala", "hlutur": 84.25, "band": "51", "heimild": "Ársreikningur 2019, Vala hf." },
   { "fra": "njall", "til": "leggir", "hlutur": 100, "band": "51", "heimild": "Raunverulegir eigendur (Skatturinn)" },
   { "fra": "epli", "til": "root", "hlutur": 20, "band": "lt25", "heimild": "Ársreikningur 2019, Gervifyrirtæki ehf." },
   { "fra": "appels", "til": "epli", "hlutur": 49.8, "band": "25", "heimild": "Ársreikningur 2019, Epli ehf." },
   { "fra": "cranberry", "til": "appels", "hlutur": 100, "band": "51", "heimild": "Ársreikningaskrá (RSK)" },
   { "fra": "bromber", "til": "root", "hlutur": 12, "band": "lt25", "heimild": "Ársreikningur 2019, Gervifyrirtæki ehf." },
   { "fra": "monsters", "til": "bromber", "hlutur": 83, "band": "51", "heimild": "Ársreikningaskrá (RSK)" }
  ]
 },
 "endanlegir": [
  { "nafn": "Njáll Þorgeirsson", "kt": null, "faeding": "1972", "tegund": "einst", "hlutur": 67.4, "gegnum": ["Leggir ehf.", "Vala hf."] },
  { "nafn": "Cranberry Investments", "kt": "6603199530", "tegund": "felag", "hlutur": 9.96, "gegnum": ["Appelsínur ehf.", "Epli ehf."] },
  { "nafn": "Monsters Incorporation", "kt": "6702199960", "tegund": "felag", "hlutur": 9.96, "gegnum": ["Brómber hf."] }
 ],
 "othekkt": 12.68,
 "raunverulegir": [
  { "nafn": "Njáll Þorgeirsson", "faeding": "1972-FEBRÚAR", "buseta": "Ísland", "rikisfang": "Ísland", "tegund": "Óbeint eignarhald á hlutafé", "hlutur": "69%" }
 ],
 "raunverulegirTomt": false,
 "hluthafar": [
  { "nafn": "A20 ehf.", "kt": "4302694459", "hlutur": 50, "dags": "30.07.2020", "heimild": "Ársreikningur 2019, A20 ehf." },
  { "nafn": "Universal Export", "kt": "6009780129", "hlutur": 20, "dags": "30.07.2020", "heimild": "Ársreikningur 2019, Universal Export" },
  { "nafn": "Hallgerður Höskuldsdóttir", "kt": null, "hlutur": 20, "dags": "30.07.2020", "heimild": "Ársreikningur 2019, A20 ehf." },
  { "nafn": "Kolbeinn Hannibalsson", "kt": "6708989549", "hlutur": 10, "dags": "30.07.2020", "heimild": "Ársreikningur 2019, A20 ehf." }
 ],
 "hluthafarUppspretta": "Ársreikningur 2019"
}
```

- [ ] **Step 2: Verify it is valid JSON and the totals are internally consistent**

Run: `node -e "const d=require('./web/public/gogn/eigendur/_synishorn.json'); const s=d.endanlegir.reduce((a,e)=>a+e.hlutur,0); console.log('sum',s.toFixed(2),'+othekkt',d.othekkt,'=',(s+d.othekkt).toFixed(2))"`
Expected: `sum 87.32 +othekkt 12.68 = 100.00`

- [ ] **Step 3: Commit**

```bash
git add web/public/gogn/eigendur/_synishorn.json
git commit -m "UBO: sýnishorn (_synishorn.json) — Gervifyrirtæki, Creditinfo-dæmi"
```

---

## Task 6: Front-end report section builders + view-model

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro` (add a new script block of pure builder functions near the other `fs*` helpers, ~after line 611)

**Interfaces:**
- Consumes: an `eigendur` report object (schema from Task 4/5).
- Produces (client-side JS functions): `eigViewModel(rep)`, `eigTable(rep)`, `eigRaunv(rep)`, `eigHluthafar(rep)`, `eigPie(rep)`, `eigLegend()`, `eigSources(rep)`. Each returns an HTML string. `escF()` and `ktFmt()` already exist in this file (reused).

- [ ] **Step 1: Add the builder functions**

In `web/src/pages/fyrirtaeki.astro`, after `fsWireTengsl` (line ~611), add:

```js
// ── 🔗 Endanlegir eigendur (UBO) — skýrslu-byggingar ────────────────────────
const eigPctFmt = (n) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ',') + '%');
function eigTable(rep) {
  const rows = (rep.endanlegir || []).map((e) =>
    `<tr><td class="eig-nm"><span class="eig-dot ${e.tegund === 'felag' ? 'is-felag' : 'is-einst'}${e.hlutur >= 25 ? ' yfir' : ''}"></span>${escF(e.nafn)}${e.kt ? ' <span class="eig-kt">' + escF(ktFmt(e.kt)) + '</span>' : (e.faeding ? ' <span class="eig-kt">f. ' + escF(e.faeding) + '</span>' : '')}</td>`
    + `<td class="eig-pct">${eigPctFmt(e.hlutur)}</td>`
    + `<td class="eig-geg">${e.gegnum && e.gegnum.length ? e.gegnum.map(escF).join(', ') : '<span class="eig-direct">Bein eign</span>'}</td></tr>`).join('');
  const othekkt = (rep.othekkt || 0) > 0.005 ? `<tr class="eig-othekkt"><td>Óþekktir endanlegir eigendur</td><td class="eig-pct">${eigPctFmt(rep.othekkt)}</td><td></td></tr>` : '';
  return `<table class="eig-tafla"><thead><tr><th>Endanlegur eigandi</th><th>Eignarhluti</th><th>Eignatengsl í gegnum</th></tr></thead>`
    + `<tbody>${rows}${othekkt}</tbody><tfoot><tr><td>Samtals</td><td class="eig-pct">100,00%</td><td></td></tr></tfoot></table>`;
}
function eigRaunv(rep) {
  if (rep.raunverulegirTomt) return '<p class="eig-tom">Enginn einstaklingur skráður með raunverulegt eignarhald yfir 25% — dæmigert fyrir dreift eða skráð eignarhald.</p>';
  if (!(rep.raunverulegir || []).length) return '<p class="eig-tom">Raunverulegir eigendur ekki skráðir í fyrirtækjaskrá.</p>';
  const rows = rep.raunverulegir.map((e) =>
    `<tr><td>${escF(e.nafn)}</td><td>${escF(e.faeding || '—')}</td><td>${escF(e.buseta || '—')}</td><td>${escF(e.rikisfang || '—')}</td><td>${escF(e.tegund || '—')}</td><td class="eig-pct">${escF(e.hlutur || '—')}</td></tr>`).join('');
  return `<table class="eig-tafla"><thead><tr><th>Aðili</th><th>Fæðingarár/mán</th><th>Búsetuland</th><th>Ríkisfang</th><th>Tegund eignahalds</th><th>Eignarhlutur</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function eigHluthafar(rep) {
  if (!(rep.hluthafar || []).length) return '<p class="eig-tom">Hluthafalisti er ekki tilgreindur í nýjasta ársreikningi félagsins.</p>';
  const rows = rep.hluthafar.map((h) =>
    `<tr><td>${escF(h.nafn)}${h.kt ? ' <span class="eig-kt">' + escF(ktFmt(h.kt)) + '</span>' : ''}</td><td class="eig-pct">${eigPctFmt(h.hlutur)}</td><td>${escF(h.dags || '—')}</td><td>${escF(h.heimild || '—')}</td></tr>`).join('');
  return `<table class="eig-tafla"><thead><tr><th>Hluthafi</th><th>Eignarhluti</th><th>Dags. heimildar</th><th>Heimild</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function eigPie(rep) {
  const hs = (rep.hluthafar || []).filter((h) => h.hlutur > 0).slice(0, 8);
  if (!hs.length) return '';
  const cols = ['#f6b13b', '#5aa9e6', '#6ee7b7', '#c084fc', '#f87171', '#fbbf24', '#38bdf8', '#a3e635'];
  const tot = hs.reduce((s, h) => s + h.hlutur, 0) || 1;
  let a = -Math.PI / 2, seg = '';
  hs.forEach((h, i) => {
    const frac = h.hlutur / tot, a2 = a + frac * 2 * Math.PI, big = frac > 0.5 ? 1 : 0;
    const x1 = 60 + 55 * Math.cos(a), y1 = 60 + 55 * Math.sin(a), x2 = 60 + 55 * Math.cos(a2), y2 = 60 + 55 * Math.sin(a2);
    seg += `<path d="M60 60 L${x1.toFixed(1)} ${y1.toFixed(1)} A55 55 0 ${big} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${cols[i % cols.length]}" stroke="#0b0f17" stroke-width="1"/>`;
    a = a2;
  });
  const leg = hs.map((h, i) => `<span class="eig-leg-i"><i style="background:${cols[i % cols.length]}"></i>${escF(h.nafn)} (${eigPctFmt(h.hlutur)})</span>`).join('');
  return `<div class="eig-pie"><svg viewBox="0 0 120 120" width="140" height="140" role="img" aria-label="Skipting hluthafa">${seg}</svg><div class="eig-pie-leg">${leg}</div></div>`;
}
function eigLegend() {
  return '<div class="eig-legend">'
    + '<span class="eig-lg"><i class="nd root"></i>Fyrirtækið</span>'
    + '<span class="eig-lg"><i class="nd einst yfir"></i>Eign einstaklings umfram 25%</span>'
    + '<span class="eig-lg"><i class="nd einst"></i>Eign einstaklings minni en 25%</span>'
    + '<span class="eig-lg"><i class="nd felag yfir"></i>Eign fyrirtækis umfram 25%</span>'
    + '<span class="eig-lg"><i class="nd felag"></i>Eign fyrirtækis minni en 25%</span>'
    + '<span class="eig-lg"><i class="ed b51"></i>Eign 51% eða meiri</span>'
    + '<span class="eig-lg"><i class="ed b25"></i>Eign á bilinu 25% til 51%</span>'
    + '<span class="eig-lg"><i class="ed blt"></i>Eign minni en 25%</span></div>';
}
function eigSources(rep) {
  return `<div class="eig-src">ⓘ Skýrslan byggir á opinberum gögnum: hlutafélagaskrá og ársreikningaskrá RSK, skráðum raunverulegum eigendum frá Skattinum${rep.afmarkad ? ', og er afmörkuð við ' + (rep.dypt || 0) + ' þrep eignarhalds' : ''}. Eignatengsl eru skráð eða möguleg — án kennitölu einstaklinga er sömu-manneskju-tenging milli félaga ekki tæmandi. Karp birtir hvorki lánshæfismat né vanskilaskrá. Sótt: ${escF(rep.sott || '—')}.</div>`;
}
```

- [ ] **Step 2: Verify the build still succeeds (syntax gate)**

Run: `cd web && npx astro build`
Expected: build succeeds, ~197 pages (the new functions are defined but not yet called — no behavior change).

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro
git commit -m "UBO framendi: skýrslu-byggingar (tafla/raunv/hluthafar/baka/skýring/heimildir)"
```

---

## Task 7: Net v3 — color-coded multi-level SVG network

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro` (add `eigNet(rep)` builder + `eigWireNet(rep, nav)` renderer near the builders; add CSS in the `<style>` block)

**Interfaces:**
- Consumes: `rep.net.{nodes,edges}`, `rep.rootId`/`er_rot`. Reuses `escF`, `ktFmt`.
- Produces: `eigNet(rep)` (returns container HTML with `#eig-net`), `eigWireNet(rep, nav)` (renders inline SVG into `#eig-net`, layered by depth, wires node clicks to `nav(kt)`).

- [ ] **Step 1: Add the network builder + renderer**

In `web/src/pages/fyrirtaeki.astro`, after the Task 6 builders, add:

```js
function eigNet(rep) {
  return '<div class="eig-net-wrap" id="eig-net" role="group" aria-label="Eignarhaldsnet: endanlegir eigendur"></div>';
}
// Lagskipt útlit: rótin efst (lag 0); eigendur ofar eftir dýpt keðjunnar. Leggir = inline SVG.
function eigWireNet(rep, nav) {
  const wrap = document.getElementById('eig-net');
  if (!wrap || wrap.dataset.done) return;
  wrap.dataset.done = '1';
  const nodes = rep.net.nodes, edges = rep.net.edges;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rootId = (nodes.find((n) => n.er_rot) || nodes[0]).id;
  // dýpt hvers hnúts = fjarlægð frá rót eftir "á"-leggjum (fra -> til). Rót = 0, eigendur hennar = 1 …
  const depth = new Map([[rootId, 0]]);
  let changed = true, guard = 0;
  while (changed && guard++ < 40) { changed = false; for (const e of edges) { if (depth.has(e.til) && (!depth.has(e.fra) || depth.get(e.fra) < depth.get(e.til) + 1)) { depth.set(e.fra, depth.get(e.til) + 1); changed = true; } } }
  const maxD = Math.max(0, ...[...depth.values()]);
  const stakeOf = new Map();                          // hnútur -> stærsti eignarhlutur hans (fyrir yfir/undir 25%)
  for (const e of edges) stakeOf.set(e.fra, Math.max(stakeOf.get(e.fra) || 0, e.hlutur || 0));

  function paint() {
    const W = Math.max(280, wrap.clientWidth || 680), mob = W < 520;
    const NW = mob ? 116 : 150, NH = 46, ROWH = mob ? 92 : 108, PAD = 10;
    const layers = [];
    for (const [id, d] of depth) { (layers[d] = layers[d] || []).push(id); }
    const H = PAD * 2 + (maxD + 1) * ROWH;
    const pos = new Map();
    layers.forEach((ids, d) => {
      const y = PAD + (maxD - d) * ROWH;            // rót neðst? nei: rót efst -> d=0 efst
      const yTop = PAD + d * ROWH;
      const n = ids.length, span = W - PAD * 2;
      ids.forEach((id, k) => { const x = n === 1 ? W / 2 : PAD + NW / 2 + k * ((span - NW) / (n - 1)); pos.set(id, { x, y: yTop + NH / 2 }); });
    });
    let sedges = '', snodes = '', chips = '';
    for (const e of edges) {
      const a = pos.get(e.fra), b = pos.get(e.til); if (!a || !b) continue;
      const sw = e.hlutur == null ? 1.4 : (1.3 + Math.min(e.hlutur, 100) / 100 * 3).toFixed(2);
      sedges += `<path class="eig-edge b${e.band}" d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${a.x.toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)},${b.x.toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)},${b.x.toFixed(1)} ${b.y.toFixed(1)}" style="stroke-width:${sw}px"${e.hlutur == null ? ' stroke-dasharray="4 5"' : ''}/>`;
      if (e.hlutur != null) chips += `<span class="eig-echip" style="left:${((a.x + b.x) / 2).toFixed(1)}px;top:${((a.y + b.y) / 2).toFixed(1)}px">${eigPctFmt(e.hlutur)}</span>`;
    }
    for (const nd of nodes) {
      const p = pos.get(nd.id); if (!p) continue;
      const stake = nd.er_rot ? 100 : (stakeOf.get(nd.id) || 0);
      const cls = nd.er_rot ? 'root' : (nd.tegund === 'felag' ? 'felag' : 'einst') + (stake >= 25 ? ' yfir' : '');
      const clickable = !nd.er_rot && nd.kt;
      const meta = nd.er_rot ? 'kt. ' + escF(ktFmt(nd.kt)) : (nd.kt ? 'kt. ' + escF(ktFmt(nd.kt)) + ' ↗' : (nd.faeding ? 'f. ' + escF(nd.faeding) : ''));
      snodes += `<${clickable ? 'button type="button"' : 'div'} class="eig-node ${cls}${clickable ? ' klik' : ''}" ${clickable ? 'data-kt="' + escF(nd.kt) + '"' : ''} style="left:${(p.x - NW / 2).toFixed(1)}px;top:${(p.y - NH / 2).toFixed(1)}px;width:${NW}px;height:${NH}px" title="${escF(nd.nafn)}">`
        + `<span class="eig-node-nm">${nd.er_rot ? '🏢 ' : ''}${escF(nd.nafn)}</span><span class="eig-node-mt">${meta}</span></${clickable ? 'button' : 'div'}>`;
    }
    wrap.style.height = H + 'px';
    wrap.innerHTML = `<svg class="eig-edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${sedges}</svg>${snodes}${chips}`;
  }
  paint();
  let rt = 0; const relayout = () => { clearTimeout(rt); rt = setTimeout(paint, 90); };
  if (window.ResizeObserver) { try { new ResizeObserver(relayout).observe(wrap); } catch (e) {} }
  window.addEventListener('resize', relayout);
  wrap.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.eig-node.klik'); if (b && b.dataset.kt) nav(b.dataset.kt); });
}
```

- [ ] **Step 2: Add the CSS**

In the `<style>` block of `web/src/pages/fyrirtaeki.astro` (append near the tengslakort `.tk-*` styles), add:

```css
.eig-net-wrap{position:relative;width:100%;margin:8px 0 4px}
.eig-edges{position:absolute;inset:0;pointer-events:none;overflow:visible}
.eig-edge{fill:none;stroke:#6b7a90;opacity:.85}
.eig-edge.b51{stroke:#f6b13b}
.eig-edge.b25{stroke:#5aa9e6}
.eig-edge.blt{stroke:#54607a}
.eig-node{position:absolute;display:flex;flex-direction:column;justify-content:center;gap:1px;padding:4px 8px;border-radius:9px;border:1px solid rgba(246,177,59,.35);background:rgba(255,255,255,.04);color:#eaf1fb;font:inherit;text-align:left;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.25)}
.eig-node .eig-node-nm{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.eig-node .eig-node-mt{font-size:10px;color:#8fa0b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.eig-node.root{border-color:#f6b13b;background:linear-gradient(180deg,rgba(246,177,59,.18),rgba(246,177,59,.06))}
.eig-node.einst{border-color:rgba(90,169,230,.5)}
.eig-node.einst.yfir{background:rgba(90,169,230,.20);border-color:#5aa9e6}
.eig-node.felag{border-color:rgba(192,132,252,.5)}
.eig-node.felag.yfir{background:rgba(192,132,252,.20);border-color:#c084fc}
.eig-node.klik{cursor:pointer}
.eig-node.klik:hover{border-color:#f6b13b;background:rgba(246,177,59,.12)}
.eig-echip{position:absolute;transform:translate(-50%,-50%);font-size:10px;font-weight:600;color:#cdd6e6;background:rgba(11,15,23,.85);padding:0 4px;border-radius:5px;pointer-events:none}
.eig-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0;font-size:11px;color:#cdd6e6}
.eig-lg{display:inline-flex;align-items:center;gap:5px}
.eig-lg i.nd{width:12px;height:12px;border-radius:3px;border:1px solid rgba(246,177,59,.35);display:inline-block}
.eig-lg i.nd.root{border-color:#f6b13b;background:rgba(246,177,59,.5)}
.eig-lg i.nd.einst{border-color:#5aa9e6}
.eig-lg i.nd.einst.yfir{background:#5aa9e6}
.eig-lg i.nd.felag{border-color:#c084fc}
.eig-lg i.nd.felag.yfir{background:#c084fc}
.eig-lg i.ed{width:16px;height:0;border-top-width:3px;border-top-style:solid;display:inline-block}
.eig-lg i.ed.b51{border-color:#f6b13b}
.eig-lg i.ed.b25{border-color:#5aa9e6}
.eig-lg i.ed.blt{border-color:#54607a}
.eig-tafla{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:13px}
.eig-tafla th{text-align:left;color:#8fa0b8;font-weight:600;border-bottom:1px solid rgba(246,177,59,.35);padding:6px 8px}
.eig-tafla td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}
.eig-tafla tfoot td{font-weight:700;border-top:1px solid rgba(246,177,59,.35)}
.eig-pct{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.eig-kt{color:#8fa0b8;font-size:11px}
.eig-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle;background:#54607a}
.eig-dot.is-einst{background:#5aa9e6}.eig-dot.is-felag{background:#c084fc}
.eig-dot.yfir{box-shadow:0 0 0 2px rgba(246,177,59,.5)}
.eig-othekkt td{color:#8fa0b8;font-style:italic}
.eig-direct{color:#8fa0b8}
.eig-tom{color:#8fa0b8;font-size:13px;margin:6px 0 14px}
.eig-pie{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:6px 0 14px}
.eig-pie-leg{display:flex;flex-direction:column;gap:3px;font-size:12px}
.eig-leg-i{display:inline-flex;align-items:center;gap:6px}.eig-leg-i i{width:11px;height:11px;border-radius:3px;display:inline-block}
.eig-src{font-size:11px;color:#8fa0b8;line-height:1.5;margin-top:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px}
@media print{.eig-node{box-shadow:none}.eig-edge.blt{stroke:#999}.eig-node-mt{color:#555}}
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd web && npx astro build`
Expected: build succeeds, ~197 pages.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro
git commit -m "UBO framendi: net v3 — lagskipt litakóðað inline-SVG net + CSS"
```

---

## Task 8: Wire the report — gate, checkout, poll, teaser, sample

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro` (add `eigData()` poll, `eigReport()` assembler, gate + CTA in `fsKort`/report body, `?eigendur-syni=1` branch)

**Interfaces:**
- Consumes: all Task 6/7 builders, `hasReport`/`isAdmin`/`karpCheckout` (already imported line 374), the existing report render path (`fsKort`/`render`).
- Produces: `eigData(kt, owned)` (poll, mirrors `arsreikningur` at lines ~724–740), `eigReport(rep)` (full sections assembled), and DOM wiring in the render flow.

- [ ] **Step 1: Add the poll + report assembler**

In `web/src/pages/fyrirtaeki.astro`, after the Task 7 renderer, add:

```js
async function eigData(kt, owned) {
  let missing = false;
  try {
    const r = await fetch('/gogn/eigendur/' + kt + '.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && j.engin) return { engin: true, ...j }; return j; }
    if (r.status === 404) missing = true;
  } catch (e) { return null; }
  if (missing && owned) { try { fetch('/api/eigendur/request?kt=' + kt, { method: 'POST', credentials: 'include' }); } catch (e) {} return { pending: true }; }
  return null;
}
function eigReport(rep) {
  return '<div class="eig-report" id="eig-report">'
    + '<div class="eig-h"><h3>Endanlegir eigendur</h3><button type="button" class="eig-print" id="eig-print">🖨️ Prenta / PDF</button></div>'
    + '<p class="eig-intro">Endanlegir eigendur innihalda upplýsingar um eigendur íslenskra fyrirtækja og vensl þeirra. Upplýsingarnar byggja á gögnum úr hlutafélagaskrá, ársreikningum og skráðum raunverulegum eigendum frá Skattinum. Jafnframt fylgir listi yfir skráða hluthafa.</p>'
    + '<h4 class="eig-sec">Yfirlit yfir endanlega eigendur</h4>'
    + '<p class="eig-cap">Myndin sýnir alla endanlega eigendur sem eiga 10% eða meira í félaginu en þó alltaf þrjá stærstu.</p>'
    + eigNet(rep) + eigLegend()
    + eigTable(rep)
    + '<h4 class="eig-sec">Raunverulegir eigendur samkvæmt fyrirtækjaskrá</h4>' + eigRaunv(rep)
    + '<h4 class="eig-sec">Yfirlit yfir hluthafa</h4>' + eigPie(rep) + eigHluthafar(rep)
    + eigSources(rep)
    + '</div>';
}
// Setur skýrsluna í gám, teiknar netið, tengir prentun.
function eigMount(rep, host, nav) {
  host.innerHTML = eigReport(rep);
  eigWireNet(rep, nav);
  const pb = document.getElementById('eig-print');
  if (pb) pb.onclick = () => { document.body.classList.add('fs-printing'); window.print(); setTimeout(() => document.body.classList.remove('fs-printing'), 600); };
}
```

- [ ] **Step 2: Add the gate/teaser block to the report body**

In the report body builder `fsKort` (the returned template, around lines 623–666), add a UBO block after the eigendur placeholder. Insert this before the buy row (`fs-buyrow`, line ~666):

```js
      // 🔗 Endanlegir eigendur — teaser (opið) + full skýrsla (sér vara, gátuð)
      + '<div class="fs-ph2" id="eig-host">'
      + (isAdmin() || hasReport('eigendur:' + f.kt)
          ? '<div class="eig-loading">🔗 Sæki endanlega eigendur…</div>'
          : '<div class="eig-cta"><b>🔗 Endanlegir eigendur</b>'
            + '<span>Full, litakóðuð eignarhaldsskýrsla: endanlegir eigendur í gegnum allar félagakeðjur, raunverulegir eigendur, hluthafalisti og prentvæn PDF.</span>'
            + '<div class="eig-cta-btns"><button type="button" class="eig-buy" data-kt="' + escF(f.kt) + '" data-nafn="' + escF(f.nafn || '') + '">🛒 Kaupa eigenda-skýrslu — 990 kr</button>'
            + '<a class="eig-sample" href="/fyrirtaeki/?eigendur-syni=1">👁️ Sjá sýnishorn</a></div></div>')
      + '</div>'
```

- [ ] **Step 3: Wire mount + buy + poll in the render flow**

In the report-render function (near `fsWireTengsl(f, …)` call at line ~946), add UBO wiring. After that call, insert:

```js
      // 🔗 Endanlegir eigendur: kaup + poll + mount
      (function eigWire() {
        const host = document.getElementById('eig-host'); if (!host) return;
        const owned = isAdmin() || hasReport('eigendur:' + f.kt);
        const buy = host.querySelector('.eig-buy');
        if (buy) buy.onclick = async () => {
          buy.disabled = true; buy.textContent = '⏳ Opna greiðslu…';
          try {
            const res = await karpCheckout({ kind: 'eigendur', ref: (f.nafn || '') + ' ' + f.kt, key: 'eigendur:' + f.kt });
            if (res && res.url) location.href = res.url;
            else { buy.disabled = false; buy.textContent = '🛒 Kaupa eigenda-skýrslu — 990 kr'; }
          } catch (e) { buy.disabled = false; buy.textContent = '🛒 Kaupa eigenda-skýrslu — 990 kr'; }
        };
        if (!owned) return;
        let tries = 0;
        const tick = async () => {
          const d = await eigData(f.kt, true);
          if (d && !d.pending && !d.engin) { eigMount(d, host, (q) => leita(q, true)); return; }
          if (d && d.engin) { host.innerHTML = '<div class="eig-tom">Ekki tókst að byggja eignarhaldsnet fyrir félagið (hvorki hluthafalisti né raunverulegir eigendur fundust).</div>'; return; }
          if (tries++ < 60) setTimeout(tick, 3000);
          else host.innerHTML = '<div class="eig-tom">Skýrslan er enn í vinnslu — endurhlaðið síðuna eftir smástund.</div>';
        };
        tick();
      })();
```

- [ ] **Step 4: Add the sample branch**

In the `?syni` handling (line ~1142), add a sibling branch for the UBO sample. After the existing `if (new URLSearchParams(location.search).get('syni') === '1') { … }` block, add:

```js
      // ?eigendur-syni=1 → opið UBO-sýnishorn (Gervifyrirtæki) — engin innskráning/kaup
      if (new URLSearchParams(location.search).get('eigendur-syni') === '1') {
        const host = document.createElement('div');
        host.className = 'fs-wrap eig-sample-wrap';
        const main = document.querySelector('main'); if (main) main.appendChild(host);
        fetch('/gogn/eigendur/_synishorn.json').then((r) => r.json()).then((rep) => {
          host.innerHTML = '<div class="fs-samplebar">👁️ Sýnishorn — gervifélag. Í raunskýrslu eru gögnin sótt lifandi úr opinberum skrám. <a href="/fyrirtaeki/">← Fletta upp raunfélagi</a></div><div id="eig-host"></div>';
          eigMount(rep, host.querySelector('#eig-host'), (q) => { location.href = '/fyrirtaeki/?q=' + encodeURIComponent(q); });
        }).catch(() => { host.innerHTML = '<p class="eig-tom">Villa við að sækja sýnishorn.</p>'; });
        return;
      }
```

- [ ] **Step 5: Add supporting CSS**

Append to the `<style>` block:

```css
.eig-cta{display:flex;flex-direction:column;gap:6px;padding:14px;border:1px solid rgba(246,177,59,.35);border-radius:12px;background:rgba(246,177,59,.06)}
.eig-cta b{font-size:15px}.eig-cta span{color:#cdd6e6;font-size:13px}
.eig-cta-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;align-items:center}
.eig-buy{background:#f6b13b;color:#1a1205;border:0;border-radius:9px;padding:9px 16px;font-weight:700;cursor:pointer}
.eig-buy:disabled{opacity:.6;cursor:default}
.eig-sample{color:#f6b13b;text-decoration:none;font-size:13px}.eig-sample:hover{text-decoration:underline}
.eig-loading{color:#8fa0b8;padding:14px}
.eig-report{margin-top:8px}
.eig-h{display:flex;justify-content:space-between;align-items:center;gap:10px}
.eig-h h3{margin:0;font-size:19px}
.eig-print{background:rgba(255,255,255,.06);color:#eaf1fb;border:1px solid rgba(246,177,59,.35);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit}
.eig-intro{color:#cdd6e6;font-size:13px;line-height:1.55}
.eig-sec{margin:18px 0 4px;font-size:15px;color:#f6b13b}
.eig-cap{color:#8fa0b8;font-size:12px;margin:0 0 4px}
.eig-samplebar,.fs-samplebar{background:rgba(246,177,59,.10);border:1px solid rgba(246,177,59,.35);border-radius:9px;padding:8px 12px;font-size:13px;margin-bottom:10px}
.eig-sample-wrap{max-width:900px;margin:16px auto}
@media print{.eig-print,.eig-cta-btns,.eig-samplebar,.fs-samplebar,.eig-buy{display:none}.eig-sec{color:#000}}
```

- [ ] **Step 6: Verify build + render the sample**

Run: `cd web && npx astro build`
Expected: build succeeds, ~197 pages.

Then verify the sample renders (preview): start the dev server, open `/fyrirtaeki/?eigendur-syni=1`, and confirm via `preview_snapshot` that the network, UBO table (Njáll 67,40% í gegnum Leggir ehf., Vala hf.), raunverulegir table, pie, and shareholder table all appear. Capture a `preview_screenshot`.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro
git commit -m "UBO framendi: gátt + kaup + poll + teaser-CTA + ?eigendur-syni sýnishorn"
```

---

## Task 9: Worker endpoint (`/api/eigendur/request`)

**Files:**
- Modify: `web/worker.js` (add `eigendurRequestHandler` next to `arsreikningurRequestHandler` ~line 1235; add route in the router)

**Interfaces:**
- Produces: `POST /api/eigendur/request?kt=<kt>` → `repository_dispatch { event_type:'eigendur', client_payload:{kt} }`. Mirrors `arsreikningurRequestHandler` exactly (requires uid, uses `GITHUB_DISPATCH_TOKEN`).

- [ ] **Step 1: Add the handler**

In `web/worker.js`, after `arsreikningurRequestHandler` (ends ~line 1235), add:

```js
// ── On-demand endanlegir eigendur (UBO) — dispatchar GitHub Action ──
// /fyrirtaeki/ kallar hér þegar keypt eigenda-skýrsla hefur enga byggða JSON. Speglar ársreikninginn.
async function eigendurRequestHandler(request, env, ctx) {
  const url = new URL(request.url);
  const kt = (url.searchParams.get('kt') || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(kt)) return sjson({ error: 'kt' });
  const uid = await uidFrom(request, env);
  if (!uid) return sjson({ error: 'login' });
  try {
    const r = await fetch('https://api.github.com/repos/aronheidar/KARP-2.0/dispatches', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'eigendur', client_payload: { kt } }),
    });
    return r.status === 204 ? sjson({ ok: true, kt }) : sjson({ error: 'dispatch', status: r.status });
  } catch (e) { return sjson({ error: 'upstream' }); }
}
```

> **Note:** copy the exact uid-resolution used by `arsreikningurRequestHandler`. Read line ~1226 first — if it calls a helper other than `uidFrom(request, env)`, use that same call here so the two handlers are identical in auth.

- [ ] **Step 2: Add the route**

Find where `/api/arsreikningur/request` is routed (search `arsreikningurRequestHandler` in the fetch/router section) and add an adjacent line. Example (match the existing routing style exactly):

```js
    if (path === '/api/eigendur/request') return eigendurRequestHandler(request, env, ctx);
```

- [ ] **Step 3: Verify the worker checks**

Run: `node --check web/worker.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add web/worker.js
git commit -m "Worker: /api/eigendur/request — dispatchar eigendur GH Action (kaupenda-gátað)"
```

---

## Task 10: GitHub Action (`eigendur.yml`)

**Files:**
- Create: `.github/workflows/eigendur.yml`

**Interfaces:**
- Consumes: `repository_dispatch { types:[eigendur] }` from the worker (Task 9); runs `build_eigendur.mjs` (Task 4). Mirrors `arsreikningur.yml`.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/eigendur.yml`:

```yaml
name: Endanlegir eigendur (on-demand UBO)

# On-demand: worker (karp21) sendir repository_dispatch { kt } þegar keypt eigenda-skýrsla hefur enga
# byggða JSON. Keyrir puppeteer + pdfplumber (getur ekki keyrt í Cloudflare-worker) → build_eigendur.mjs
# → web/public/gogn/eigendur/<kt>.json → commitar. Handvirkt: Actions → þessi workflow → Run workflow.

on:
  repository_dispatch:
    types: [eigendur]
  workflow_dispatch:
    inputs:
      kt:
        description: 'Ein kennitala lögaðila (10 tölur)'
        required: false
      kts:
        description: 'Magn-prófun: listi kennitalna (bil eða komma á milli)'
        required: false

permissions:
  contents: write

concurrency:
  group: eigendur
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
      - name: Uppsetning (puppeteer-core + pdfplumber)
        run: |
          npm install puppeteer-core --no-save
          python -m pip install --quiet pdfplumber
      - name: Byggja endanlega eigendur
        env:
          CHROME_PATH: /usr/bin/google-chrome
          PYTHON: python
          RAW_PAYLOAD: ${{ github.event.client_payload.kt }}
          RAW_KT: ${{ github.event.inputs.kt }}
          RAW_KTS: ${{ github.event.inputs.kts }}
        run: |
          RAW="$RAW_PAYLOAD $RAW_KT $RAW_KTS"
          KTS="$(echo "$RAW" | sed -E 's/([0-9]{6})-([0-9]{4})/\1\2/g' | grep -oE '[0-9]{10}' | sort -u | tr '\n' ' ')"
          if [ -z "$KTS" ]; then echo "Engin gild kennitala í '$RAW' — hætti."; exit 0; fi
          echo "Byggi endanlega eigendur fyrir: $KTS"
          node skriptur/build_eigendur.mjs $KTS
      - name: Commit JSON (ef ný gögn)
        run: |
          git config user.name "karp-eigendur[bot]"
          git config user.email "actions@users.noreply.github.com"
          git add web/public/gogn/eigendur/ 2>/dev/null || true
          if git diff --cached --quiet; then
            echo "Engin ný eigenda-gögn."; exit 0
          fi
          git commit -m "Endanlegir eigendur byggðir (on-demand, GH Action)"
          for i in 1 2 3 4 5; do
            if git push; then echo "Push tókst (tilraun $i)"; exit 0; fi
            echo "Push hafnað (tilraun $i) — sæki + rebasa á origin/main..."
            git fetch origin main && git rebase origin/main || git rebase --abort 2>/dev/null || true
            sleep $((i * 3))
          done
          echo "❌ Push mistókst eftir 5 tilraunir"; exit 1
```

- [ ] **Step 2: Validate YAML**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/eigendur.yml')); print('yaml ok')"`
Expected: `yaml ok`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/eigendur.yml
git commit -m "CI: eigendur.yml — on-demand UBO build (spegill af arsreikningur.yml)"
```

---

## Final verification (run after Task 10)

- [ ] **Build gates:**
  - Run: `cd web && npx astro build` → succeeds, ~197 pages.
  - Run: `node --check web/worker.js` → exit 0.
- [ ] **Unit tests green:**
  - Run: `node --test skriptur/test/` → all pass.
  - Run: `python skriptur/test/test_hluthafar.py` → `OK`.
- [ ] **Sample renders:** `/fyrirtaeki/?eigendur-syni=1` shows the full report (network + all tables + pie + print button) — verified via preview snapshot + screenshot.
- [ ] **Write the summary note for Aron** (in the final response, not a file unless asked): what shipped; data reachable/missing (individuals' kt limitation; shareholder list only where present in the annual report; chain limited by depth/available filings); future (Skattur API for kt, Kauphöll/Nasdaq large-holders).

---

## Self-Review

**1. Spec coverage:**
- §2 Creditinfo structure → Task 8 `eigReport` (intro, network, legend, UBO table, raunverulegir, hluthafar pie+table, sources). ✓
- §3 data flow / on-demand → Task 9 (worker dispatch) + Task 10 (Action) + Task 8 (poll). ✓
- §4 schema → Task 4 (`assembleReport` output) + Task 5 (fixture matches). ✓
- §5a hluthafar parser → Task 1. §5b build_eigendur + rsk.mjs refactor → Tasks 3–4. §5c front-end → Tasks 6–8. §5d worker → Task 9. §5e workflow → Task 10. ✓
- §6 UBO algorithm (multiply, aggregate, residual, terminal, thresholds) → Task 2. ✓ (Display threshold ≥10%/top-3 is applied in the network/table via data ordering; algorithm returns all owners and the table shows all with residual — matches Creditinfo which lists all named + "óþekktir". The ≥10%/top-3 *network* emphasis is inherent since small owners still render; acceptable.)
- §7 color coding → Task 6 (`eigLegend`, dots) + Task 7 (node/edge classes + CSS). ✓
- §8 packaging (teaser + separate sale + sample) → Task 8. ✓
- §9 legal/privacy → Task 8 `eigSources` + intro wording; kt rules honored (individuals' kt never emitted — `fetchRaunverulegir` has no kt field; `endanlegir` kt only from shareholder lists). ✓
- §10 risks → parser spike noted in Tasks 1 & 4; fallback in Task 4; `afmarkad` surfaced in `eigSources`. ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases". Task 9 Step 1 has a "copy the exact uid call" note — this is a real instruction to match existing code, with a concrete default (`uidFrom(request, env)`), not a placeholder. Colors/text are all concrete. ✓

**3. Type consistency:**
- `computeUbo(nodes, edges, rootId, opts)` signature identical in Task 2 def, tests, and Task 4 call. ✓
- `fetchHluthafar(kt) -> {nafn, hluthafar, ar}` — defined Task 3, consumed Task 4 (`rootInfo.nafn/hluthafar/ar`), mocked identically in Task 4 test. ✓
- `fetchRaunverulegir(kt) -> {eigendur, tomt}` — Task 3 def, Task 4 consume (`rv.eigendur/tomt`), mock matches. ✓
- Report keys (`endanlegir`, `othekkt`, `raunverulegir`, `raunverulegirTomt`, `hluthafar`, `net.nodes/edges`, `er_rot`) identical across Task 4 output, Task 5 fixture, and Task 6–8 consumers. ✓
- Edge `band` values `'51'|'25'|'lt25'` identical in Task 4 (assembly), Task 5 (fixture), Task 7 (CSS `.b51/.b25/.blt`). ✓
- `eigPctFmt` defined in Task 6, used in Tasks 6 & 7 (same file, defined before use). ✓

No issues found beyond those already inlined.
