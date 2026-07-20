# Gögn & graf per frétt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each data-driven fréttavél article's data + chart downloadable and citable (JSON/CSV/SVG/PNG) via build-time static files, with a "Gögn & graf" box on the article page and a `Dataset` JSON-LD `distribution`.

**Architecture:** A pure module `web/src/lib/frettavel-export.mjs` turns an archive item into JSON/CSV/labeled-SVG. Three Astro static endpoints (`frettavel/[id].json.ts` / `.csv.ts` / `.svg.ts`) call it at build time, generating `/frettavel/<slug>.{json,csv,svg}` only for data-rich items. The article page `[id].astro` renders download links + a client-side PNG button + adds `distribution` to the existing Dataset JSON-LD.

**Tech Stack:** Astro SSG (build-time, `node:fs` available; `astro build` transpiles `.ts` via esbuild, no type-checking), `node:test`, ES modules.

## Global Constraints

- **Slug consistency:** every generated file path and every download link uses `asciiId(item.id)` (the permalink slug used by `frettavel/[id].astro` getStaticPaths). Raw `id` must never appear in a URL — mismatched slug = 404 (the exact bug fixed in the fréttavaktir email).
- **Data-rich only:** files/box appear only when `hasExport(item)` is true (`facts` non-empty OR `spark` numeric series length ≥ 4). `.svg` + PNG only when the numeric series length ≥ 4. Text-only articles are untouched.
- **Escape all data:** JSON via `JSON.stringify`; CSV wraps values containing `; " \n` in quotes (doubling inner `"`); SVG escapes `& < >` in text.
- **Icelandic decimals in CSV/SVG labels:** numbers use a comma decimal (`6,3` not `6.3`).
- **License/attribution string (verbatim):** `Frjáls til notkunar með tilvísun í Karp (karp.is)`.
- **Build-time module import:** `frettavel-export.mjs` imports `catOf, spark, dIS, asciiId` from `./frettavel.mjs` (fine at build/test time — `node:fs` exists; `scanVariants` is lazy and never called here).
- **Icelandic** UI copy. Tests + code identifiers in existing style.

---

### Task 1: Pure export module `frettavel-export.mjs`

The core: four pure functions turning an archive item into export payloads.

**Files:**
- Create: `web/src/lib/frettavel-export.mjs`
- Test: `web/src/lib/frettavel-export.test.mjs`

**Interfaces:**
- Consumes: `catOf(type)→{label,heimild,rule,color}`, `spark(arr,w,h)→{pts,area,ex,ey,w,h}|null`, `asciiId(id)→string` from `./frettavel.mjs`.
- Produces: `hasExport(item)→boolean`, `exportJson(item)→object`, `exportCsv(item)→string`, `chartSvg(item)→string|null`.

- [ ] **Step 1: Write the failing test** — create `web/src/lib/frettavel-export.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { hasExport, exportJson, exportCsv, chartSvg } from './frettavel-export.mjs';

const FACTS = { id: 'verdbolga-2026-06-01', date: '2026-06-01', type: 'verdbolga', title: 'Verðbólga eykst: 5,2%', text: 'Ársverðbólga…', url: '/verdlag/', facts: { verdbolga: 5.2, meginvextir: 7.75 }, spark: [6.3, 6, 5.4, 5.1, 4.8, 5.2] };
const TEXTONLY = { id: 'gjaldthrot-x', date: '2026-06-01', type: 'gjaldthrot', title: 'Gjaldþrot Alfa ehf.', text: 'Beiðni', url: '/logbirting/' };
const SERIESONLY = { id: 'mark-1', date: '2026-06-01', type: 'mark', title: 'Marel', text: '', url: '/markadir/', spark: [1, 2, 3, 4, 5] };

test('hasExport: true for facts, true for series≥4, false for text-only', () => {
  assert.equal(hasExport(FACTS), true);
  assert.equal(hasExport(SERIESONLY), true);
  assert.equal(hasExport(TEXTONLY), false);
  assert.equal(hasExport({ spark: [1, 2, 3] }), false);   // <4
  assert.equal(hasExport(null), false);
});

test('exportJson: shape, asciiId permalink slug, facts + series carried, license present', () => {
  const j = exportJson(FACTS);
  assert.equal(j.slod, 'https://karp.is/frettavel/verdbolga-2026-06-01/');
  assert.equal(j.flokkur, 'Verðbólga');            // from catOf(verdbolga).label
  assert.deepEqual(j.facts, { verdbolga: 5.2, meginvextir: 7.75 });
  assert.equal(j.rod.gildi.length, 6);
  assert.equal(j.leyfi, 'Frjáls til notkunar með tilvísun í Karp (karp.is)');
  assert.equal(exportJson(TEXTONLY).facts, null);
  assert.equal(exportJson(TEXTONLY).rod, null);
});

test('exportCsv: escapes ; and ", uses comma decimals, has facts + series sections', () => {
  const csv = exportCsv({ ...FACTS, title: 'A;B "C"' });
  assert.ok(csv.startsWith('reitur;gildi'));
  assert.ok(csv.includes('"A;B ""C"""'));           // title escaped
  assert.ok(csv.includes('verdbolga;5,2'));         // comma decimal
  assert.ok(/\nnr;gildi\n1;6,3/.test(csv));          // series section
});

test('chartSvg: labeled SVG for series, null without series', () => {
  const svg = chartSvg(FACTS);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('Heimild: Karp'));
  assert.ok(svg.includes('Verðbólga'));             // category label
  assert.equal(chartSvg(TEXTONLY), null);
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `node --test web/src/lib/frettavel-export.test.mjs`
Expected: FAIL — module `./frettavel-export.mjs` not found / exports undefined.

- [ ] **Step 3: Write the implementation** — create `web/src/lib/frettavel-export.mjs`:

```javascript
// frettavel-export.mjs — gagna-/graf-útflutningur per frétt (fyrir fréttamenn). Hreint; keyrir á byggingartíma.
import { catOf, spark, asciiId } from './frettavel.mjs';

const SITE = 'https://karp.is';
const LICENSE = 'Frjáls til notkunar með tilvísun í Karp (karp.is)';
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const numSeries = (a) => (Array.isArray(a) ? a.filter((n) => typeof n === 'number') : []);
const isk = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');   // íslenskur aukastafur

export function hasExport(item) {
  if (!item) return false;
  const f = item.facts;
  return (isObj(f) && Object.keys(f).length > 0) || numSeries(item.spark).length >= 4;
}

export function exportJson(item) {
  const cat = catOf(item.type);
  const srcAbs = String(item.url || '').startsWith('http') ? item.url : SITE + (item.url || '/frettavel/');
  const series = numSeries(item.spark);
  const facts = isObj(item.facts) && Object.keys(item.facts).length ? item.facts : null;
  return {
    id: item.id,
    slod: SITE + '/frettavel/' + asciiId(item.id) + '/',
    dagsetning: item.date,
    tegund: item.type,
    flokkur: cat.label,
    titill: item.title,
    texti: item.text || '',
    heimild: cat.heimild,
    heimild_slod: srcAbs,
    adferd: cat.rule,
    facts,
    rod: series.length >= 4 ? { lysing: 'Síðustu ' + series.length + ' gildi (tímaröð)', gildi: series } : null,
    leyfi: LICENSE,
    hofundur: 'Fréttavél Karp',
  };
}

export function exportCsv(item) {
  const j = exportJson(item);
  const esc = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const cell = (v) => (typeof v === 'number' ? isk(v) : esc(v));
  const lines = ['reitur;gildi', 'titill;' + esc(j.titill), 'dagsetning;' + esc(j.dagsetning), 'flokkur;' + esc(j.flokkur), 'heimild;' + esc(j.heimild)];
  if (j.facts) for (const [k, v] of Object.entries(j.facts)) lines.push(esc(k) + ';' + cell(v));
  if (j.rod) { lines.push('', 'nr;gildi'); j.rod.gildi.forEach((v, i) => lines.push((i + 1) + ';' + isk(v))); }
  return lines.join('\n');
}

export function chartSvg(item) {
  const series = numSeries(item.spark);
  if (series.length < 4) return null;
  const cat = catOf(item.type);
  const W = 640, H = 280, padL = 20, padR = 20, padT = 56, padB = 40;
  const sp = spark(series, W - padL - padR, H - padT - padB);
  if (!sp) return null;
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const c = cat.color || '#f6b13b';
  const last = series[series.length - 1], mn = Math.min(...series), mx = Math.max(...series);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui,Arial,sans-serif">
  <rect width="${W}" height="${H}" fill="#fffdf6"/>
  <text x="${padL}" y="26" font-size="17" font-weight="700" fill="#2b2417">${esc(cat.label)}</text>
  <text x="${padL}" y="46" font-size="13" fill="#6b5d43">${esc(clip(String(item.title || ''), 62))}</text>
  <g transform="translate(${padL},${padT})">
    <polyline points="${sp.area}" fill="${c}" opacity="0.14" stroke="none"/>
    <polyline points="${sp.pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${sp.ex}" cy="${sp.ey}" r="4" fill="${c}"/>
  </g>
  <text x="${W - padR}" y="${padT + Number(sp.ey) - 8}" font-size="13" font-weight="700" fill="${c}" text-anchor="end">${isk(last)}</text>
  <text x="${padL}" y="${H - 14}" font-size="11" fill="#9a8c6f">Lægst ${isk(mn)} · hæst ${isk(mx)} · ${series.length} gildi</text>
  <text x="${W - padR}" y="${H - 14}" font-size="11" fill="#9a8c6f" text-anchor="end">Heimild: Karp · karp.is</text>
</svg>`;
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `node --test web/src/lib/frettavel-export.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/frettavel-export.mjs web/src/lib/frettavel-export.test.mjs
git commit -m "feat(export): pure frettavel-export module (hasExport/exportJson/exportCsv/chartSvg) + tests"
```

---

### Task 2: Three Astro static endpoints (JSON / CSV / SVG)

Build-time endpoints that emit `/frettavel/<slug>.json`, `.csv`, `.svg` for data-rich items.

**Files:**
- Create: `web/src/pages/frettavel/[id].json.ts`, `web/src/pages/frettavel/[id].csv.ts`, `web/src/pages/frettavel/[id].svg.ts`

**Interfaces:**
- Consumes: `hasExport`, `exportJson`, `exportCsv`, `chartSvg` (Task 1); `asciiId` (frettavel.mjs); `ARCH` (`@gogn/frettavel_archive.json`).
- Produces: static files at `dist/frettavel/<slug>.{json,csv,svg}`.

- [ ] **Step 1: Create the JSON endpoint** `web/src/pages/frettavel/[id].json.ts`:

```typescript
import ARCH from '@gogn/frettavel_archive.json';
import { asciiId } from '../../lib/frettavel.mjs';
import { hasExport, exportJson } from '../../lib/frettavel-export.mjs';

export function getStaticPaths() {
  const seen = new Set();
  return (ARCH.items || [])
    .filter((it) => { if (!hasExport(it)) return false; const s = asciiId(it.id); if (!s || seen.has(s)) return false; seen.add(s); return true; })
    .map((it) => ({ params: { id: asciiId(it.id) }, props: { it } }));
}

export function GET({ props }) {
  return new Response(JSON.stringify(exportJson(props.it), null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
```

- [ ] **Step 2: Create the CSV endpoint** `web/src/pages/frettavel/[id].csv.ts`:

```typescript
import ARCH from '@gogn/frettavel_archive.json';
import { asciiId } from '../../lib/frettavel.mjs';
import { hasExport, exportCsv } from '../../lib/frettavel-export.mjs';

export function getStaticPaths() {
  const seen = new Set();
  return (ARCH.items || [])
    .filter((it) => { if (!hasExport(it)) return false; const s = asciiId(it.id); if (!s || seen.has(s)) return false; seen.add(s); return true; })
    .map((it) => ({ params: { id: asciiId(it.id) }, props: { it } }));
}

export function GET({ props }) {
  return new Response(exportCsv(props.it), { headers: { 'content-type': 'text/csv; charset=utf-8' } });
}
```

- [ ] **Step 3: Create the SVG endpoint** `web/src/pages/frettavel/[id].svg.ts` (extra filter: only items with a chart):

```typescript
import ARCH from '@gogn/frettavel_archive.json';
import { asciiId } from '../../lib/frettavel.mjs';
import { chartSvg } from '../../lib/frettavel-export.mjs';

export function getStaticPaths() {
  const seen = new Set();
  return (ARCH.items || [])
    .filter((it) => { if (!chartSvg(it)) return false; const s = asciiId(it.id); if (!s || seen.has(s)) return false; seen.add(s); return true; })
    .map((it) => ({ params: { id: asciiId(it.id) }, props: { svg: chartSvg(it) } }));
}

export function GET({ props }) {
  return new Response(props.svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8' } });
}
```

- [ ] **Step 4: Build and verify the files are generated with correct content.**

Run: `cd web && npx astro build 2>&1 | grep -E "page\(s\) built|error|Error"`
Expected: `… page(s) built …`, no errors.

Then verify a known data-rich item produced files (verdbolga has facts + series):

Run: `cd web && ls dist/frettavel/verdbolga-2026-06-01.json dist/frettavel/verdbolga-2026-06-01.csv dist/frettavel/verdbolga-2026-06-01.svg 2>&1; echo '---JSON---'; node -e "const j=require('./dist/frettavel/verdbolga-2026-06-01.json'); console.log(j.slod, '| flokkur:', j.flokkur, '| facts:', !!j.facts, '| rod:', !!j.rod, '| leyfi ok:', j.leyfi.includes('tilvísun'))"`
Expected: the three files exist; JSON prints the karp.is permalink slug, `flokkur: Verðbólga`, `facts: true`, `rod: true`, `leyfi ok: true`. (If `verdbolga-2026-06-01` is no longer in the archive, substitute any id where `dist/frettavel/*.json` exists — list with `ls web/dist/frettavel/*.json | head`.)

- [ ] **Step 5: Verify text-only items did NOT get files.**

Run: `cd web && node -e "const A=require('./public/gogn/frettavel_archive.json').items; const {hasExport}=await import('./src/lib/frettavel-export.mjs'); const txt=A.find(x=>!hasExport(x)); const fs=require('fs'); console.log('text-only id', txt&&txt.id, '→ json exists?', txt?fs.existsSync('dist/frettavel/'+require('./src/lib/frettavel.mjs').then?'':''):''); " 2>/dev/null || echo "(skip node esm mix)"`

Simpler check — run: `cd web && node --input-type=module -e "import {hasExport} from './src/lib/frettavel-export.mjs'; import {asciiId} from './src/lib/frettavel.mjs'; import fs from 'node:fs'; const A=JSON.parse(fs.readFileSync('public/gogn/frettavel_archive.json','utf8')).items; const t=A.find(x=>!hasExport(x)); console.log('text-only',t.id,'json exists?',fs.existsSync('dist/frettavel/'+asciiId(t.id)+'.json'))"`
Expected: `text-only <id> json exists? false`.

- [ ] **Step 6: Commit.**

```bash
git add web/src/pages/frettavel/[id].json.ts web/src/pages/frettavel/[id].csv.ts web/src/pages/frettavel/[id].svg.ts
git commit -m "feat(export): static endpoints emit /frettavel/<slug>.{json,csv,svg} for data-rich items"
```

---

### Task 3: "Gögn & graf" box + client PNG + Dataset `distribution`

The article-page UI: download links, a client-side PNG button, and the JSON-LD `distribution`.

**Files:**
- Modify: `web/src/pages/frettavel/[id].astro` (frontmatter jsonLd ~:23, after fv-cite ~:75, styles, and a script)

**Interfaces:**
- Consumes: `hasExport` (Task 1), the endpoint URLs from Task 2, `asciiId` (already imported in `[id].astro`).

- [ ] **Step 1: Frontmatter — import `hasExport`, compute flags + slug + distribution.** In the `---` block of `web/src/pages/frettavel/[id].astro`, add to the imports:

```javascript
import { hasExport } from '../../lib/frettavel-export.mjs';
```

Then, right after `const sp = spark(it.spark, 640, 150);`, add:

```javascript
const ex = hasExport(it);
const hasSeries = Array.isArray(it.spark) && it.spark.filter((n) => typeof n === 'number').length >= 4;
const slug = asciiId(it.id);
const SITE = 'https://karp.is';
```

- [ ] **Step 2: Add `distribution` + `license` to the Dataset JSON-LD.** In the `jsonLd` array, replace the Dataset object (the second `{ ... '@type': 'Dataset' ... }`) with:

```javascript
  { '@context': 'https://schema.org', '@type': 'Dataset', name: cat.label + ' — ' + it.title, description: cat.rule, creator: { '@type': 'Organization', name: 'Karp', url: 'https://karp.is' }, url: srcAbs, isAccessibleForFree: true, license: 'https://karp.is/frettavel/',
    distribution: ex ? [
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: SITE + '/frettavel/' + slug + '.json' },
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: SITE + '/frettavel/' + slug + '.csv' },
    ] : undefined },
```

- [ ] **Step 3: Add the box markup** — in the template, immediately after the `<div class="fv-cite"> … </div>` block (before `</article>`):

```astro
      {ex && (
        <div class="fv-data">
          <div class="fv-data-h">📊 Gögn & graf</div>
          <p class="fv-data-t">Sæktu gögnin á bak við þessa frétt — eða grafið — og notaðu í eigin umfjöllun. Frjálst með tilvísun í Karp.</p>
          <div class="fv-data-links">
            <a class="fv-dl" href={`/frettavel/${slug}.json`} download>Gögn · JSON</a>
            <a class="fv-dl" href={`/frettavel/${slug}.csv`} download>Gögn · CSV</a>
            {hasSeries && <a class="fv-dl" href={`/frettavel/${slug}.svg`} download>Graf · SVG</a>}
            {hasSeries && <button class="fv-dl" id="fv-png" data-svg={`/frettavel/${slug}.svg`} data-name={slug}>Graf · PNG</button>}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Add styles** — inside the page's `<style>` block, after the `.fv-cite` rules:

```css
    .fv-data { margin: 0 0 22px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 18px; }
    .fv-data-h { font-weight: 700; margin-bottom: 4px; }
    .fv-data-t { font-size: 13.5px; color: var(--muted); margin: 0 0 10px; line-height: 1.5; }
    .fv-data-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .fv-dl { display: inline-block; font-size: 13px; font-weight: 600; color: var(--gold); background: color-mix(in srgb, var(--gold) 10%, transparent); border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent); border-radius: 999px; padding: 5px 13px; cursor: pointer; text-decoration: none; }
    .fv-dl:hover { background: color-mix(in srgb, var(--gold) 18%, transparent); }
```

- [ ] **Step 5: Add the client PNG script** — before `</Layout>` at the end of the page, add:

```astro
<script>
  const btn = document.getElementById('fv-png');
  if (btn) btn.addEventListener('click', async () => {
    const svgUrl = btn.dataset.svg, name = btn.dataset.name || 'graf';
    try {
      const svgText = await (await fetch(svgUrl)).text();
      const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => {
        const s = 2, w = img.width || 640, h = img.height || 280;
        const cv = document.createElement('canvas'); cv.width = w * s; cv.height = h * s;
        const ctx = cv.getContext('2d'); ctx.scale(s, s); ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name + '.png'; a.click(); }, 'image/png');
      };
      img.onerror = () => window.open(svgUrl, '_blank');
      img.src = url;
    } catch (e) { window.open(svgUrl, '_blank'); }
  });
</script>
```

- [ ] **Step 6: Build and verify the box + distribution render for a data-rich article.**

Run: `cd web && npx astro build 2>&1 | grep -E "page\(s\) built|error|Error"`
Expected: `… page(s) built …`, no errors.

Run: `cd web && f=$(ls dist/frettavel/*.json | head -1); slug=$(basename "$f" .json); grep -o 'fv-data-h\|frettavel/'"$slug"'.csv\|DataDownload' "dist/frettavel/$slug/index.html" | sort -u`
Expected: prints `DataDownload`, `fv-data-h`, and the `frettavel/<slug>.csv` link — i.e. the box, the CSV download link, and the JSON-LD distribution are all present on that article's page.

- [ ] **Step 7: Verify a text-only article has NO box.**

Run: `cd web && node --input-type=module -e "import {hasExport} from './src/lib/frettavel-export.mjs'; import {asciiId} from './src/lib/frettavel.mjs'; import fs from 'node:fs'; const A=JSON.parse(fs.readFileSync('public/gogn/frettavel_archive.json','utf8')).items; const t=A.find(x=>!hasExport(x)); const html=fs.readFileSync('dist/frettavel/'+asciiId(t.id)+'/index.html','utf8'); console.log('text-only',t.id,'has fv-data box?', html.includes('fv-data-h'))"`
Expected: `text-only <id> has fv-data box? false`.

- [ ] **Step 8: Commit.**

```bash
git add web/src/pages/frettavel/[id].astro
git commit -m "feat(export): Gögn & graf box + client PNG + Dataset distribution on article page"
```

---

## Deployment note (not a task — for Aron)

All changes are Astro/SSG — they deploy via `git push origin gogn-export:main` → Cloudflare rebuild. No `wrangler deploy` needed (no worker changes). After deploy, spot-check a data-rich article's "Gögn & graf" box and open its `.json`/`.svg`.

## Self-review

- **Spec coverage:** §1 module (hasExport/exportJson/exportCsv/chartSvg) → Task 1. §2 three endpoints → Task 2. §3 box + PNG + JSON-LD distribution → Task 3. §4 error handling → Task 1 (escape, chartSvg null), Task 2 (getStaticPaths filters), Task 3 (PNG try/catch, conditional box). Slug consistency (global constraint) → asciiId used in Tasks 2 & 3. Testing → Task 1 unit tests + build gates in Tasks 2/3. All covered.
- **Placeholder scan:** no TBD/TODO; every code step has full code; commands have expected output.
- **Type consistency:** `hasExport/exportJson/exportCsv/chartSvg` signatures identical across Task 1 (definition), Task 2 (endpoint calls), Task 3 (box condition). `asciiId(it.id)` slug identical in endpoints and page. `props.it` / `props.svg` match between each endpoint's getStaticPaths and its GET.
