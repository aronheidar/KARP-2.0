# Topplistar fyrirtækja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid Karp+-gated "top companies by sector" product (Creditinfo-style) — sector top-lists ranked by revenue/profit/assets from annual accounts, served from D1 through a gated worker endpoint, rendered on a new page with a top-3 teaser for non-subscribers.

**Architecture:** Financial summaries live in a new D1 `fjarhagur` table, populated by a local (residential-IP) ársreikninga trickle that reuses the existing `build_arsreikningar` puppeteer flow. Companies are filtered by sector via a new `felog.isat_primary` column. A gated worker endpoint (`/api/topplistar`) queries D1 and returns the full 100 to entitled users or a 3-row teaser otherwise. A new Astro page renders sortable sector tabs + PDF.

**Tech Stack:** Cloudflare D1 + Worker (`web/worker.js`), Astro (`web/src/pages`), `node:test` + `node:sqlite`, local puppeteer-core + `skriptur/lib/rsk.mjs` (already used by `build_arsreikningar.mjs`), wrangler (local OAuth).

## Global Constraints

- **Paid product, server-side gating:** the full list must be gated in the WORKER (`entitled = is_admin OR (users.tier AND users.tier_until > now)`), never client-side only. Non-entitled → top-3 teaser + `{locked:true}`. Client `hasTier(1)` only controls UI.
- **Only lögaðilar (kt day 41–71) with `mynt='ISK'`** appear in rankings (foreign-currency accounts would skew; exclude). Financial figures are public (lög nr. 3/2006) → no DPIA, no person PII on lists.
- **Shared D1 `tengsl` (id 6b1672e6)** already holds auth tables (`users`, …) AND tengslagrunnur tables (`felog`, …). New tables/columns coexist — use `IF NOT EXISTS` / `ADD COLUMN`, never DROP.
- **Worktree/deploy:** work in `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` on branch `b2b-topbar`. Deploy = `git push origin b2b-topbar:main` (rebase on conflicts; NEVER `git stash` here — pre-existing stashes). Tests: `node --test <files>` (glob form). Worker: `node --check web/worker.js`; site: `npx astro build` from `web/`. D1: `cd web && npx wrangler d1 execute tengsl --remote ...` (Aron's local OAuth).
- **ársreikningur JSON shape** (`web/public/gogn/arsreikningar/<kt>.json`): `{ kt, nafn, ar: { '<year>': { mynt, kvardi, rekstur:{sala,hagnadur,...}, efnahagur:{eignir,eigid_fe,...} } } }`. Values are raw krónur × `kvardi` (kvardi=1 typical).
- **Local scrape rate-limit:** `www.skatturinn.is` (ársreikninga step-1) throttles at volume → the local trickle is gentle (small batch, ~7–9s spacing, back-off), like `scrape_local.mjs`.

---

## File Structure

- **Create `web/migrations/0002_topplistar.sql`** — `fjarhagur` table + `felog.isat_primary` column + populate.
- **Create `web/src/lib/greinar.mjs`** — sector list (slug→ÍSAT prefixes) + `greinaSql(slug)` SQL-filter builder. Shared by worker + frontend.
- **Create `web/src/lib/greinar.test.mjs`** — node:test.
- **Create `skriptur/lib/fjarhagur.mjs`** — `arsreikningurSummary(json)` → `{kt,ar,sala,hagnadur,eignir,eigid_fe}|null` (pure).
- **Create `skriptur/lib/fjarhagur.test.mjs`** — node:test.
- **Create `skriptur/arsreikningar_local.mjs`** — local ársreikninga trickle (reads D1, fetches via rsk.mjs, writes fjarhagur + JSON).
- **Modify `web/worker.js`** — add `export function topplistaBody(rows, entitled, total)` (pure teaser/gating) + `topplistarHandler` + route.
- **Create `web/test/topplistar.test.mjs`** — node:test for `topplistaBody` + `greinaSql`.
- **Create `web/src/pages/topplistar-fyrirtaeki.astro`** — gated page + island script.
- **Modify `web/src/styles/ubo.css`** (or a new `topplistar.css`) — table/teaser styles. (Plan uses `ubo.css` append to reuse the shared report look.)
- **Modify `web/src/pages/karp-pro.astro`** — nav link to the new page (1 line).

---

## Task 0: D1 migration (fjarhagur + isat_primary)

**Files:**
- Create: `web/migrations/0002_topplistar.sql`

**Interfaces:**
- Produces: D1 table `fjarhagur(kt PK, ar, sala, hagnadur, eignir, eigid_fe, sott)` and column `felog.isat_primary` (populated from existing `felog.isat` JSON). Consumed by every later task.

- [ ] **Step 1: Write the migration**

Create `web/migrations/0002_topplistar.sql`:

```sql
-- Topplistar fyrirtækja v1 — fjárhags-samantekt (röðun) + primary ÍSAT (greina-sía). Sjá spec 2026-07-20.
CREATE TABLE IF NOT EXISTS fjarhagur (
  kt TEXT PRIMARY KEY,
  ar TEXT,
  sala REAL,
  hagnadur REAL,
  eignir REAL,
  eigid_fe REAL,
  sott TEXT
);
CREATE INDEX IF NOT EXISTS idx_fjarhagur_sala ON fjarhagur(sala);
```

Note: `ALTER TABLE ... ADD COLUMN` is a separate statement applied by the crawler-side migration below (D1 rejects `ADD COLUMN IF NOT EXISTS`; guard by ignoring the "duplicate column" error on re-run — see Step 3).

- [ ] **Step 2: Verify the table SQL applies to local sqlite**

Run (repo root): `node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; import {readFileSync} from 'node:fs'; const db=new DatabaseSync(':memory:'); db.exec('CREATE TABLE felog(kt TEXT, isat TEXT)'); db.exec(readFileSync('web/migrations/0002_topplistar.sql','utf8')); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='fjarhagur'\").get().name);"`
Expected: `fjarhagur`

- [ ] **Step 3: Apply to remote D1 (table + column + populate)**

Run (from `web/`), each command separately (the ADD COLUMN may already exist on re-run — that error is safe to ignore):

```bash
cd web
npx wrangler d1 execute tengsl --remote --file migrations/0002_topplistar.sql
npx wrangler d1 execute tengsl --remote --command "ALTER TABLE felog ADD COLUMN isat_primary TEXT"
npx wrangler d1 execute tengsl --remote --command "UPDATE felog SET isat_primary = json_extract(isat, '$[0].id') WHERE isat IS NOT NULL AND isat <> '[]' AND isat_primary IS NULL"
```
Expected: first two succeed (or ADD COLUMN says "duplicate column name: isat_primary" on re-run → ignore). The UPDATE reports rows written (~6320).

- [ ] **Step 4: Verify isat_primary populated**

Run (from `web/`): `npx wrangler d1 execute tengsl --remote --command "SELECT COUNT(*) n FROM felog WHERE isat_primary LIKE '61%'"`
Expected: a non-zero count (telecom/tech companies).

- [ ] **Step 5: Commit**

```bash
git add web/migrations/0002_topplistar.sql
git commit -m "feat(topplistar): D1 fjarhagur table + felog.isat_primary migration"
```

---

## Task 1: Pure libs — sector mapping + summary extraction

**Files:**
- Create: `web/src/lib/greinar.mjs`
- Create: `web/src/lib/greinar.test.mjs`
- Create: `skriptur/lib/fjarhagur.mjs`
- Create: `skriptur/lib/fjarhagur.test.mjs`

**Interfaces:**
- Produces: `GREINAR` (array of `{slug, nafn, isat: string[]|null}`), `greinaBySlug(slug)`, and `greinaSql(slug)` → a SQL WHERE-fragment string on `f.isat_primary` (empty string for `island` = no filter).
- Produces: `arsreikningurSummary(json)` → `{ kt, ar, sala, hagnadur, eignir, eigid_fe } | null` — the latest ISK year with a non-null `sala`, values × `kvardi`. Returns `null` if no ISK year / no revenue.

- [ ] **Step 1: Write the failing test for greinar.mjs**

Create `web/src/lib/greinar.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { GREINAR, greinaBySlug, greinaSql } from './greinar.mjs';

test('GREINAR includes island (no filter) and sjavarutvegur', () => {
  assert.ok(GREINAR.find((g) => g.slug === 'island' && g.isat === null));
  assert.deepEqual(greinaBySlug('sjavarutvegur').isat, ['03']);
});

test('greinaSql: island → no filter (empty)', () => {
  assert.equal(greinaSql('island'), '');
});

test('greinaSql: sector → substr(isat_primary,1,2) IN (...)', () => {
  assert.equal(greinaSql('sjavarutvegur'), "substr(f.isat_primary,1,2) IN ('03')");
  assert.equal(greinaSql('verslun'), "substr(f.isat_primary,1,2) IN ('45','46','47')");
});

test('greinaSql: unknown slug → null', () => {
  assert.equal(greinaSql('bogus'), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `web/`): `node --test src/lib/greinar.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement greinar.mjs**

Create `web/src/lib/greinar.mjs`:

```js
// greinar.mjs — atvinnugreinar fyrir topplista (nafn + ÍSAT-2-stafa forskeyti). Deilt worker + framenda.
export const GREINAR = [
  { slug: 'island', nafn: 'Ísland allt (stærstu)', isat: null },
  { slug: 'sjavarutvegur', nafn: 'Sjávarútvegur', isat: ['03'] },
  { slug: 'verslun', nafn: 'Verslun', isat: ['45', '46', '47'] },
  { slug: 'byggingar', nafn: 'Byggingarstarfsemi', isat: ['41', '42', '43'] },
  { slug: 'fjarskipti', nafn: 'Fjarskipti & tækni', isat: ['61', '62', '63'] },
  { slug: 'ferdathjonusta', nafn: 'Ferðaþjónusta', isat: ['55', '56', '79'] },
  { slug: 'idnadur', nafn: 'Iðnaður & framleiðsla', isat: ['10', '11', '13', '16', '17', '20', '22', '23', '25', '28', '32', '33'] },
  { slug: 'fjarmal', nafn: 'Fjármál & trygging', isat: ['64', '65', '66'] },
];
export const greinaBySlug = (slug) => GREINAR.find((g) => g.slug === slug) || null;

// SQL WHERE-brot á f.isat_primary. '' = engin sía (island). null = óþekkt grein.
export function greinaSql(slug) {
  const g = greinaBySlug(slug);
  if (!g) return null;
  if (!g.isat) return '';
  return "substr(f.isat_primary,1,2) IN (" + g.isat.map((p) => "'" + p + "'").join(',') + ")";
}
```

- [ ] **Step 4: Run to verify it passes**

Run (from `web/`): `node --test src/lib/greinar.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for fjarhagur.mjs**

Create `skriptur/lib/fjarhagur.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { arsreikningurSummary } from './fjarhagur.mjs';

test('arsreikningurSummary: picks latest ISK year with revenue, applies kvardi', () => {
  const json = {
    kt: '4101692079',
    ar: {
      '2024': { mynt: 'ISK', kvardi: 1, rekstur: { sala: 400000000, hagnadur: 20000000 }, efnahagur: { eignir: 200000000, eigid_fe: 100000000 } },
      '2025': { mynt: 'ISK', kvardi: 1, rekstur: { sala: 535278416, hagnadur: 31675787 }, efnahagur: { eignir: 241090900, eigid_fe: 118156526 } },
    },
  };
  const s = arsreikningurSummary(json);
  assert.equal(s.kt, '4101692079');
  assert.equal(s.ar, '2025');
  assert.equal(s.sala, 535278416);
  assert.equal(s.eigid_fe, 118156526);
});

test('arsreikningurSummary: applies kvardi (thousands)', () => {
  const json = { kt: '5', ar: { '2024': { mynt: 'ISK', kvardi: 1000, rekstur: { sala: 5000 }, efnahagur: {} } } };
  assert.equal(arsreikningurSummary(json).sala, 5000000);
});

test('arsreikningurSummary: skips non-ISK and no-revenue years → null', () => {
  assert.equal(arsreikningurSummary({ kt: '5', ar: { '2024': { mynt: 'EUR', rekstur: { sala: 100 }, efnahagur: {} } } }), null);
  assert.equal(arsreikningurSummary({ kt: '5', ar: { '2024': { mynt: 'ISK', rekstur: {}, efnahagur: {} } } }), null);
  assert.equal(arsreikningurSummary({ kt: '5', ar: {} }), null);
});
```

- [ ] **Step 6: Run to verify it fails**

Run (repo root): `node --test skriptur/lib/fjarhagur.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement fjarhagur.mjs**

Create `skriptur/lib/fjarhagur.mjs`:

```js
// fjarhagur.mjs — HREIN: dregur röðunar-samantekt úr ársreikningi-JSON. Nýjasta ISK-ár með veltu.
export function arsreikningurSummary(json) {
  if (!json || !json.ar) return null;
  const years = Object.keys(json.ar).sort().reverse();   // nýjast fyrst
  for (const y of years) {
    const a = json.ar[y] || {};
    if ((a.mynt || 'ISK') !== 'ISK') continue;            // aðeins ISK í röðun
    const r = a.rekstur || {}, e = a.efnahagur || {}, k = a.kvardi || 1;
    if (r.sala == null) continue;                         // þarf veltu til röðunar
    const sc = (v) => (v == null ? null : v * k);
    return { kt: json.kt, ar: y, sala: sc(r.sala), hagnadur: sc(r.hagnadur), eignir: sc(e.eignir), eigid_fe: sc(e.eigid_fe) };
  }
  return null;
}
```

- [ ] **Step 8: Run to verify it passes**

Run (repo root): `node --test skriptur/lib/fjarhagur.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/greinar.mjs web/src/lib/greinar.test.mjs skriptur/lib/fjarhagur.mjs skriptur/lib/fjarhagur.test.mjs
git commit -m "feat(topplistar): sector mapping + arsreikningur summary extraction (tested)"
```

---

## Task 2: Local ársreikninga trickle

**Files:**
- Create: `skriptur/arsreikningar_local.mjs`

**Interfaces:**
- Consumes (from Task 1): `arsreikningurSummary(json)`; and `sqlLit` from `skriptur/lib/tengsl_sql.mjs`.
- Consumes: `build_arsreikningar.mjs` writes `web/public/gogn/arsreikningar/<kt>.json`. This script INVOKES that builder per kt (child process), then reads the JSON and writes a `fjarhagur` row to D1.
- Produces: side effects — `fjarhagur` rows in D1 (+ the JSON files build_arsreikningar writes). Env: `AR_N` (default 8), `SCRAPE_DELAY_MS` (default 8000), targets companies in mapped sectors lacking `fjarhagur`, ordered by `hlutafe DESC`.

- [ ] **Step 1: Implement arsreikningar_local.mjs**

Create `skriptur/arsreikningar_local.mjs`:

```js
#!/usr/bin/env node
// arsreikningar_local.mjs — LOCAL ársreikninga-trickle (vél Arons, íbúða-IP). Sækir ársreikninga
// fyrir stærstu félög í markgreinum sem vantar `fjarhagur`, þáttar veltu/hagnað/eignir og skrifar
// í D1 `fjarhagur` (röðun) gegnum wrangler. Fullur ársreikningur fer í gogn/arsreikningar/<kt>.json.
// KEYRSLA (PowerShell, svo fetch/puppeteer fari um raun-IP): node skriptur/arsreikningar_local.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arsreikningurSummary } from './lib/fjarhagur.mjs';
import { sqlLit as L } from './lib/tengsl_sql.mjs';
import { GREINAR } from '../web/src/lib/greinar.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const AR_N = parseInt(process.env.AR_N || '8', 10);
const DELAY = parseInt(process.env.SCRAPE_DELAY_MS || '8000', 10);
const MAXFAIL = 4;
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// öll 2-stafa ÍSAT-forskeyti markgreina (island = allt → tökum bara þau sem eru í greinunum)
const prefixes = [...new Set(GREINAR.flatMap((g) => g.isat || []))];
const inClause = prefixes.map((p) => "'" + p + "'").join(',');

function d1read(sql) {
  const out = execSync(`npx wrangler d1 execute tengsl --remote --json --command "${sql}"`, { cwd: WEB, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = out.match(/\[[\s\S]*\]/);
  return m ? (JSON.parse(m[0])[0].results || []) : [];
}

// félög í markgreinum sem vantar fjarhagur, stærst (hlutafe) fyrst
const rows = d1read(`SELECT f.kt FROM felog f LEFT JOIN fjarhagur fj ON fj.kt=f.kt WHERE fj.kt IS NULL AND f.afskrad=0 AND substr(f.isat_primary,1,2) IN (${inClause}) ORDER BY f.hlutafe DESC NULLS LAST LIMIT ${AR_N}`);
console.log(`Ársreikningar: ${rows.length} félög (markgreinar, vantar fjarhagur)`);

const upserts = [];
let ok = 0, fails = 0;
for (const { kt } of rows) {
  if (fails >= MAXFAIL) { console.log(`${MAXFAIL} bilanir — hætti`); break; }
  await sleep(DELAY);
  try {
    execSync(`node skriptur/build_arsreikningar.mjs ${kt}`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { fails++; process.stdout.write('·'); continue; }
  const jf = path.join(WEB, 'public/gogn/arsreikningar', kt + '.json');
  if (!fs.existsSync(jf)) { fails++; process.stdout.write('·'); continue; }
  const s = arsreikningurSummary(JSON.parse(fs.readFileSync(jf, 'utf8')));
  fails = 0; ok++;
  if (s) upserts.push(`INSERT INTO fjarhagur (kt,ar,sala,hagnadur,eignir,eigid_fe,sott) VALUES (${L(kt)},${L(s.ar)},${L(s.sala)},${L(s.hagnadur)},${L(s.eignir)},${L(s.eigid_fe)},${L(today)}) ON CONFLICT(kt) DO UPDATE SET ar=excluded.ar,sala=excluded.sala,hagnadur=excluded.hagnadur,eignir=excluded.eignir,eigid_fe=excluded.eigid_fe,sott=excluded.sott;`);
  else upserts.push(`INSERT OR IGNORE INTO fjarhagur (kt,ar,sott) VALUES (${L(kt)},NULL,${L(today)});`);   // merkja reynt (engin ISK-velta)
  process.stdout.write('+');
}
console.log(`\nÞáttað: ${ok} ársreikningar · ${upserts.length} fjarhagur-raðir`);

if (upserts.length) {
  const sqlFile = path.join(WEB, 'ar_local.sql');
  fs.writeFileSync(sqlFile, upserts.join('\n') + '\n');
  execSync('npx wrangler d1 execute tengsl --remote --file ar_local.sql', { cwd: WEB, encoding: 'utf8', stdio: 'inherit', maxBuffer: 64 * 1024 * 1024 });
  fs.unlinkSync(sqlFile);
  console.log('✓ Beitt á D1.');
}
try { fs.appendFileSync(path.join(os.tmpdir(), 'karp-arsreikn.log'), `${new Date().toISOString()}  ok=${ok} radir=${upserts.length}\n`); } catch (e) {}
```

- [ ] **Step 2: Syntax check**

Run (repo root): `node --check skriptur/arsreikningar_local.mjs`
Expected: no output, exit 0.

- [ ] **Step 3: Live test (run on 3 companies, via PowerShell for real IP)**

Run in PowerShell (NOT the hooked Bash — puppeteer/fetch must use the real residential IP):
```powershell
cd "C:\Users\aronh\dev\KARP\mitt-svaedi-wt"; $env:AR_N=3; node skriptur/arsreikningar_local.mjs
```
Expected: `Ársreikningar: 3 félög`, `+`/`·` progress, `Þáttað: N ársreikningar`, `✓ Beitt á D1`. Then verify: `cd web && npx wrangler d1 execute tengsl --remote --command "SELECT COUNT(*) n FROM fjarhagur WHERE sala IS NOT NULL"` → non-zero.

- [ ] **Step 4: Commit**

```bash
git add skriptur/arsreikningar_local.mjs
git commit -m "feat(topplistar): local arsreikningar trickle → D1 fjarhagur"
```

---

## Task 3: Worker endpoint (gated) — `/api/topplistar`

**Files:**
- Modify: `web/worker.js` (add `topplistaBody` + `topplistarHandler` + route near `/api/tengslanet`)
- Test: `web/test/topplistar.test.mjs`

**Interfaces:**
- Consumes (from Task 1): `greinaSql(slug)` (import into worker.js from `./src/lib/greinar.mjs`). NOTE: worker.js has no imports today but wrangler bundles (esbuild) — importing a local ESM module is safe (verified by the deploy pipeline).
- Produces: `export function topplistaBody(rows, entitled, total)` — if `entitled`, returns `{ radir: rows, total, locked: false }`; else `{ radir: rows.slice(0, 3), total, locked: true }`.
- Produces (HTTP): `GET /api/topplistar?grein=<slug>&radad=<sala|hagnadur|eignir|efe>` → `{ grein, radad, radir:[{kt,nafn,sala,hagnadur,eignir,eigid_fe,ar}], total, locked, coverage:{greind,alls} }`. 400 on unknown grein/radad.

- [ ] **Step 1: Write the failing test**

Create `web/test/topplistar.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { topplistaBody } from '../worker.js';
import { greinaSql } from '../src/lib/greinar.mjs';

const rows = Array.from({ length: 10 }, (_, i) => ({ kt: '49' + i, nafn: 'Félag ' + i, sala: 1000 - i }));

test('topplistaBody: entitled → full rows', () => {
  const b = topplistaBody(rows, true, 42);
  assert.equal(b.radir.length, 10);
  assert.equal(b.locked, false);
  assert.equal(b.total, 42);
});

test('topplistaBody: not entitled → top-3 teaser', () => {
  const b = topplistaBody(rows, false, 42);
  assert.equal(b.radir.length, 3);
  assert.equal(b.locked, true);
  assert.equal(b.radir[0].nafn, 'Félag 0');
});

test('greinaSql wiring: verslun filter', () => {
  assert.equal(greinaSql('verslun'), "substr(f.isat_primary,1,2) IN ('45','46','47')");
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `web/`): `node --test test/topplistar.test.mjs`
Expected: FAIL — `topplistaBody` not exported.

- [ ] **Step 3: Add import, `topplistaBody`, handler, and route to worker.js**

At the TOP of `web/worker.js` (worker.js currently has no imports; add this as the first line — wrangler esbuild bundles it):

```js
import { greinaSql } from './src/lib/greinar.mjs';
```

Add the pure helper + handler immediately before the `// ── 🪑 Tengslanet` banner (near `maskaKortSvar`):

```js
// 📊 Topplistar fyrirtækja (Karp+-læst). Pure gátun: entitled → fullt; annars topp-3 agn.
export function topplistaBody(rows, entitled, total) {
  return entitled ? { radir: rows, total, locked: false } : { radir: rows.slice(0, 3), total, locked: true };
}
const TOPP_RADAD = { sala: 'sala', hagnadur: 'hagnadur', eignir: 'eignir', efe: 'eigid_fe' };
async function topplistarHandler(request, env, ctx) {
  const u = new URL(request.url);
  const grein = u.searchParams.get('grein') || 'island';
  const radadKey = u.searchParams.get('radad') || 'sala';
  const filter = greinaSql(grein), col = TOPP_RADAD[radadKey];
  if (filter === null || !col) return sjson({ error: 'bad-params' }, 400);
  if (!env.TENGSL) return sjson({ error: 'unconfigured' });
  // entitlement: admin EÐA virk Karp+-áskrift (sama og userPayload.tierActive)
  const uid = await karpUserId(request, env);
  let entitled = false;
  if (uid) {
    const urow = await env.TENGSL.prepare('SELECT tier, tier_until, is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
    const now = Math.floor(Date.now() / 1000);
    entitled = !!(urow && (urow.is_admin || (urow.tier && urow.tier_until > now)));
  }
  const cacheKey = new Request('https://cache.karp.internal/api/topplistar?g=' + grein + '&r=' + radadKey + '&e=' + (entitled ? 1 : 0));
  const cache = caches.default;
  const hit = await cache.match(cacheKey); if (hit) return hit;
  const whereFilter = filter ? (filter + ' AND ') : '';
  const rows = (await env.TENGSL.prepare(
    `SELECT f.kt, f.nafn, fj.sala, fj.hagnadur, fj.eignir, fj.eigid_fe, fj.ar
     FROM felog f JOIN fjarhagur fj ON fj.kt=f.kt
     WHERE ${whereFilter}fj.sala IS NOT NULL
     ORDER BY fj.${col} DESC LIMIT 100`
  ).all().catch(() => ({ results: [] }))).results;
  // coverage: greind (fjarhagur með veltu) af öllum í greininni
  const covWhere = filter ? ('WHERE ' + filter) : '';
  const alls = (await env.TENGSL.prepare(`SELECT COUNT(*) n FROM felog f ${covWhere}`).first().catch(() => ({ n: 0 }))).n;
  const greind = (await env.TENGSL.prepare(`SELECT COUNT(*) n FROM felog f JOIN fjarhagur fj ON fj.kt=f.kt WHERE ${whereFilter}fj.sala IS NOT NULL`).first().catch(() => ({ n: 0 }))).n;
  const body = { grein, radad: radadKey, ...topplistaBody(rows, entitled, rows.length), coverage: { greind, alls } };
  const res = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=21600' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
```

Add the route (next to the tengslanet route):

```js
    if (url.pathname === '/api/topplistar') return topplistarHandler(request, env, ctx);
```

- [ ] **Step 4: Run the test + node --check**

Run (from `web/`): `node --test test/topplistar.test.mjs` → PASS (3). Then `node --check worker.js` → OK.

- [ ] **Step 5: Verify wrangler still bundles (import added)**

Run (from `web/`): `npx wrangler deploy --dry-run 2>&1 | tail -4`
Expected: dry-run completes (esbuild bundles the `greinar.mjs` import). If it errors on the import path, confirm `./src/lib/greinar.mjs` is correct relative to `web/worker.js`.

- [ ] **Step 6: Commit**

```bash
git add web/worker.js web/test/topplistar.test.mjs
git commit -m "feat(topplistar): gated /api/topplistar worker endpoint (Karp+ server-side)"
```

---

## Task 4: Frontend page + PDF

**Files:**
- Create: `web/src/pages/topplistar-fyrirtaeki.astro`
- Modify: `web/src/styles/ubo.css` (append table/teaser styles)
- Modify: `web/src/pages/karp-pro.astro` (nav link — 1 line)

**Interfaces:**
- Consumes (from Task 3): `GET /api/topplistar?grein=&radad=` response shape.
- Consumes: `GREINAR` from `../lib/greinar.mjs` (for the tabs), and `hasTier`, `loginHref`, `karpCheckout` from `../lib/auth.js` (CTA), matching `ubo-report.js` usage.

- [ ] **Step 1: Create the page**

Create `web/src/pages/topplistar-fyrirtaeki.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
import '../styles/ubo.css';
import { GREINAR } from '../lib/greinar.mjs';
const desc = 'Stærstu fyrirtæki Íslands eftir atvinnugrein — raðað eftir veltu, hagnaði og eignum úr ársreikningum. Karp+ vara.';
---
<Layout title="Topplistar fyrirtækja | Karp" description={desc} canonical="https://karp.is/topplistar-fyrirtaeki/">
  <main data-pg="topp-fyr">
    <h1>Stærstu fyrirtæki eftir atvinnugrein</h1>
    <p class="tf-intro">Raðað eftir veltu úr ársreikningum (Karp+). Smelltu á félag fyrir fulla skýrslu.</p>
    <div class="tf-tabs" role="tablist">
      {GREINAR.map((g, i) => (
        <button type="button" class={"tf-tab" + (i === 0 ? " on" : "")} data-grein={g.slug}>{g.nafn}</button>
      ))}
    </div>
    <div class="tf-controls">
      <label>Raða eftir:
        <select class="tf-radad">
          <option value="sala">Veltu</option>
          <option value="hagnadur">Hagnaði</option>
          <option value="eignir">Eignum</option>
          <option value="efe">Eigin fé</option>
        </select>
      </label>
      <button type="button" class="tf-pdf">🖨️ Sækja PDF</button>
    </div>
    <div class="tf-cov" id="tf-cov"></div>
    <div class="tf-host" id="tf-host"><div class="eig-loading">Hleð…</div></div>
  </main>
  <script>
    import { hasTier, loginHref, karpCheckout } from '../lib/auth.js';
    const kr = (n) => (n == null ? '—' : Math.round(n / 1e6).toLocaleString('is-IS') + ' m.kr');
    const ktF = (k) => (k && k.length === 10 ? k.slice(0, 6) + '-' + k.slice(6) : k || '');
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let grein = 'island', radad = 'sala';
    async function load() {
      const host = document.getElementById('tf-host');
      host.innerHTML = '<div class="eig-loading">Hleð…</div>';
      let d = null;
      try { d = await fetch('/api/topplistar?grein=' + grein + '&radad=' + radad, { credentials: 'include' }).then((r) => r.json()); } catch (e) {}
      if (!d || !d.radir) { host.innerHTML = '<div class="eig-tom">Ekki tókst að hlaða lista.</div>'; return; }
      document.getElementById('tf-cov').textContent = d.coverage ? ('Byggt á ' + d.coverage.greind + ' greindum félögum af ' + d.coverage.alls + ' í greininni — vex daglega.') : '';
      const rows = d.radir.map((r, i) => `<tr><td class="tf-rank">${i + 1}</td><td class="tf-nm"><a href="/fyrirtaeki/?q=${encodeURIComponent(r.kt)}">${esc(r.nafn)}</a> <span class="eig-kt">${ktF(r.kt)}</span></td><td class="tf-num">${kr(r.sala)}</td><td class="tf-num">${kr(r.hagnadur)}</td><td class="tf-yr">${esc(r.ar || '')}</td></tr>`).join('');
      let html = `<table class="eig-tafla tf-tafla"><thead><tr><th>#</th><th>Fyrirtæki</th><th>Velta</th><th>Hagnaður</th><th>Ár</th></tr></thead><tbody>${rows}</tbody></table>`;
      if (d.locked) {
        html += `<div class="eig-cta tf-lock"><b>🔒 Fullur listi — Karp+</b><span>Sjáðu alla ${d.total >= 100 ? '100' : d.total} + veltu/hagnað/eignir og PDF-niðurhal með Karp+ áskrift.</span><div class="eig-cta-btns"><button type="button" class="eig-buy tf-buy">⭐ Fá Karp+</button></div></div>`;
      }
      host.innerHTML = html;
      const buy = host.querySelector('.tf-buy');
      if (buy) buy.addEventListener('click', () => { if (!hasTier(1)) location.href = '/karp-pro/#verd'; });
    }
    function init() {
      document.querySelectorAll('.tf-tab').forEach((t) => t.addEventListener('click', () => {
        document.querySelectorAll('.tf-tab').forEach((x) => x.classList.toggle('on', x === t));
        grein = t.dataset.grein; load();
      }));
      document.querySelector('.tf-radad').addEventListener('change', (e) => { radad = e.target.value; load(); });
      document.querySelector('.tf-pdf').addEventListener('click', () => { document.body.classList.add('fs-printing'); window.print(); setTimeout(() => document.body.classList.remove('fs-printing'), 600); });
      load();
    }
    document.addEventListener('astro:page-load', () => { if (document.querySelector('main[data-pg="topp-fyr"]')) init(); });
  </script>
</Layout>
```

- [ ] **Step 2: Append styles to ubo.css**

Append to the end of `web/src/styles/ubo.css`:

```css

/* 📊 Topplistar fyrirtækja */
.tf-intro { color: var(--muted); font-size: 13.5px; margin: 4px 0 12px; }
.tf-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; border-bottom: 1px solid rgba(255,255,255,.1); }
.tf-tab { appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; color: #9fb0c8; font: inherit; font-weight: 600; font-size: 13.5px; padding: 7px 11px; cursor: pointer; margin-bottom: -1px; }
.tf-tab:hover { color: #eaf1fb; } .tf-tab.on { color: #f6b13b; border-bottom-color: #f6b13b; }
.tf-controls { display: flex; gap: 14px; align-items: center; margin: 10px 0; flex-wrap: wrap; }
.tf-controls select { background: rgba(255,255,255,.06); color: var(--ink); border: 1px solid rgba(246,177,59,.35); border-radius: 8px; padding: 5px 8px; font: inherit; }
.tf-pdf { background: rgba(255,255,255,.06); color: var(--ink); border: 1px solid rgba(246,177,59,.35); border-radius: 8px; padding: 6px 12px; cursor: pointer; font: inherit; }
.tf-cov { color: var(--muted); font-size: 12px; margin: 4px 0 10px; }
.tf-tafla .tf-rank { color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; width: 32px; }
.tf-tafla .tf-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tf-tafla .tf-nm a { color: #f6b13b; text-decoration: none; font-weight: 600; } .tf-tafla .tf-nm a:hover { text-decoration: underline; }
.tf-lock { margin-top: 14px; }
@media print { .tf-tabs, .tf-controls, .tf-lock { display: none !important; } }
```

- [ ] **Step 3: Add nav link in karp-pro.astro**

Find the nav/links area of `web/src/pages/karp-pro.astro` and add a link to the new page. Locate an existing `/lausnir/` or product link and add adjacent:

```astro
<a href="/topplistar-fyrirtaeki/">📊 Topplistar fyrirtækja</a>
```
(Place it wherever product links live; exact insertion point is the existing links list. If unsure, add it inside the first `<nav>` or product-grid block near other `/…/` anchors.)

- [ ] **Step 4: Build**

Run (from `web/`): `npx astro build 2>&1 | tail -4`
Expected: build succeeds; a `topplistar-fyrirtaeki/index.html` page is emitted.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/topplistar-fyrirtaeki.astro web/src/styles/ubo.css web/src/pages/karp-pro.astro
git commit -m "feat(topplistar): /topplistar-fyrirtaeki page (tabs, sort, teaser, PDF)"
```

---

## Task 5: Scheduled trickle + integration verify + deploy

**Files:** none (setup + verification).

- [ ] **Step 1: Register the ársreikninga Scheduled Task (PowerShell)**

Run in PowerShell (registers a background trickle like `KARP-tengsl-scrape`):
```powershell
$node = (Get-Command node).Source
$repo = "C:\Users\aronh\dev\KARP\mitt-svaedi-wt"
$action = New-ScheduledTaskAction -Execute $node -Argument "skriptur\arsreikningar_local.mjs" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName "KARP-arsreikningar-scrape" -Action $action -Trigger $trigger -Settings $settings -Description "Haegur arsreikninga-trickle fyrir topplista (fjarhagur)." -Force
```
Expected: task registered (State: Ready).

- [ ] **Step 2: Full pre-deploy gate**

Run: `cd web && npx astro build && node --check worker.js && node --test test/*.test.mjs` and (repo root) `node --test skriptur/lib/*.test.mjs && node --test web/src/lib/*.test.mjs`.
Expected: build OK, worker check OK, all test suites PASS.

- [ ] **Step 3: Deploy**

```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt"
git fetch origin && git rebase origin/main   # resolve conflicts keeping both sides; NO git stash
cd web && npx astro build && node --check worker.js && cd ..
git push origin b2b-topbar:main
```

- [ ] **Step 4: Post-deploy verification (mandatory gating check)**

After the deploy lands (poll the entry chunk hash or wait ~3 min):
- `GET https://karp.is/api/topplistar?grein=sjavarutvegur&radad=sala` **logged out** → confirm `locked:true` and `radir.length <= 3` (teaser only — the full list must NOT reach an unauthenticated client).
- Confirm `grein=bogus` → HTTP 400 `{error:'bad-params'}`.
- Browser: open `/topplistar-fyrirtaeki/`, click sector tabs, change sort, confirm the table renders and (logged out) shows the teaser + Karp+ CTA. Screenshot.
- As data accumulates (after the trickle runs), confirm rows appear for sectors with `fjarhagur` coverage.

---

## Self-Review

**1. Spec coverage:**
- Paid Karp+ gating, server-side, top-3 teaser → Task 3 (`topplistaBody` + `entitled`), Task 4 (CTA), Task 5 Step 4 (mandatory check). ✅
- Metrics velta/hagnaður/eignir/eigið fé → Task 1 (`arsreikningurSummary`), Task 3 (`TOPP_RADAD` incl. `efe`→`eigid_fe`), Task 4 (sort select). ✅
- Sectors via ÍSAT prefixes → Task 1 (`GREINAR`/`greinaSql`), Task 0 (`isat_primary`). ✅
- Data via local trickle prioritized by size → Task 2 (`arsreikningar_local.mjs`, `hlutafe DESC`), Task 5 (scheduled). ✅
- D1 `fjarhagur` + `isat_primary` → Task 0. ✅
- `/api/topplistar?grein=&radad=` live D1, cached → Task 3. ✅
- New page + tabs + sort + company links + PDF + coverage banner → Task 4. ✅
- ISK-only, lögaðilar-only, public data (no DPIA) → Task 1 (`mynt==='ISK'`), Global Constraints. ✅
- Out of scope (CSV/Excel, history, per-list purchase) → not implemented. ✅

**2. Placeholder scan:** No TBD/TODO. The one soft spot is Task 4 Step 3 (karp-pro nav insertion point "wherever product links live") — acceptable because the exact list markup is existing code the implementer will see; the link text/href is fully specified.

**3. Type/name consistency:** `arsreikningurSummary` returns `{kt,ar,sala,hagnadur,eignir,eigid_fe}` — consumed by Task 2's INSERT (same columns) and matches `fjarhagur` schema (Task 0). `greinaSql` filters on `f.isat_primary` (alias `f` used consistently in Task 3 queries). `TOPP_RADAD` maps `efe→eigid_fe` (column name) — the query uses `fj.${col}`. `topplistaBody(rows, entitled, total)` signature matches Task 3 call site and Task 3 test. Response keys (`radir`, `locked`, `total`, `coverage.greind/alls`) match the frontend consumer (Task 4). ✅
