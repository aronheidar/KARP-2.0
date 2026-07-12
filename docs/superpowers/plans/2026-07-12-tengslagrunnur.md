# Tengslagrunnur (landsdekkandi D1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a nation-wide graph database (Cloudflare D1) of Icelandic companies, their governance (board/procuration/CEO, with person-kt from the RSK API) and beneficial owners (from the free scrape), filled by a patient nightly snowball crawler, and read by the network-graph (`?kort=1`) to enrich it with each root-connected person's country-wide company memberships.

**Architecture:** Pure, unit-tested Node library modules (`skriptur/lib/*.mjs`) do all parsing, SQL-generation, and sweep logic — testable with `node:test` + `node:sqlite`, no network. A nightly GitHub Action (`crawl_tengsl.mjs`) pulls a budgeted batch from a `crawl_queue`, calls the RSK LegalEntities API + free owner scrape, generates one batched `night.sql`, and applies it via `wrangler d1 execute --remote`. The worker gains a `TENGSL` D1 binding (null-tolerant) and enriches `tengslanetHandler` output — always through the unchanged `maskaKortSvar` privacy mask.

**Tech Stack:** Node ESM (`node:sqlite`, `node:test`), Cloudflare D1 + Wrangler, existing Cloudflare Worker (`web/worker.js`). No new npm dependency for the worker; crawler uses built-ins + existing `wrangler` (already a dev tool).

## Global Constraints

- **Privacy (DPIA leið A, Aron owns legal sign-off):** person-kt lives ONLY in D1 server-side and MUST NEVER leave the worker. All graph output flows through the existing `maskaKortSvar` (`?kort=1`): distant individuals are token-only. No bulk/enumeration endpoint is ever exposed. Only public registry data is collected.
- **Null-tolerant everywhere:** `env.TENGSL` undefined → the worker behaves EXACTLY as today. Missing GH secrets → the workflow exits 0 with an explanation (crawl sleeps until Aron enables it). Nothing new may break an existing path.
- **No deletes — history via `seen_first`/`seen_last`:** on re-crawl, rows present in the new response are upserted (`seen_last=NULL`); rows missing from it get `seen_last=<date>`. Never `DELETE`.
- **person_key parity:** identical keying to `eigOwnerKey` (`web/src/lib/ubo-report.js:12`) and `build_eigendur_reverse.mjs`: kt if known, else `'nm:'+eigNorm(nafn)+'|'+(faeding||'')`.
- **RSK API gotchas (from [[iceland-rsk-fyrirtaekjaskra-api]]):** responses are PascalCase → case-insensitive reader `rg()`; kt of individuals is day 01–31, companies day 41–71 (`rskErFyrirtaeki`); HTTP 404 = not-found (not error); 401/403 = bad key → abort the night immediately (do not burn budget).
- **Worktree/deploy:** work in `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` on branch `b2b-topbar`. Deploy = `git push origin b2b-topbar:main` (rebase on conflicts). Tests: `node --test skriptur/lib/*.test.mjs` (⚠ use the glob — `node --test <dir>` misparses on this Node). Worker: `node --check web/worker.js`; site: `npx astro build` from `web/`.
- **Courtesy to sources:** ~1.5 s delay between free-scrape calls; nightly cap `TENGSL_BUDGET` (repo variable, default 1500) governs API calls per run.

---

## File Structure

- **Create `web/migrations/0001_tengsl.sql`** — D1 schema (5 tables + indexes + `sweep_state`).
- **Modify `web/wrangler.toml`** — add the `TENGSL` D1 binding.
- **Create `skriptur/lib/rsk_parse.mjs`** — pure parsers: `parseLegalEntity(kt, apiJson)` (API → felag meta + folk + hlutverk + discovered company-kt), `parseEigendur(html)` (free scrape → owner rows), plus shared `rg`, `rskErFyrirtaeki`, `eigNorm`, `personKey`, `htmlText`.
- **Create `skriptur/lib/rsk_parse.test.mjs`** — `node:test` for the parsers.
- **Create `skriptur/lib/tengsl_sql.mjs`** — `buildNightSql(records)` → idempotent upsert + `seen_last`-close SQL string.
- **Create `skriptur/lib/tengsl_sql.test.mjs`** — `node:test` using `node:sqlite` (apply twice → idempotent; missing row → seen_last set).
- **Create `skriptur/lib/sweep.mjs`** — `nextPrefixes(prefix, hitCount, cap)` adaptive prefix deepening + `extractKts(html)`.
- **Create `skriptur/lib/sweep.test.mjs`** — `node:test` for the deepen logic.
- **Create `skriptur/seed_tengsl.mjs`** — seed `crawl_queue` from Karp files + logbirting + sweep bootstrap.
- **Create `skriptur/crawl_tengsl.mjs`** — the nightly crawler orchestrator.
- **Create `.github/workflows/tengslagrunnur.yml`** — nightly, secret-gated.
- **Modify `web/worker.js`** — D1-read helper `tengslGrunnurEnrich(...)` + call inside `tengslanetHandler` (before `maskaKortSvar`), null-tolerant.
- **Create `web/test/tengsl-enrich.test.mjs`** — worker enrichment + privacy (masked output) unit test.

---

## Task 0: D1 schema + binding (ships immediately, null-tolerant)

**Files:**
- Create: `web/migrations/0001_tengsl.sql`
- Modify: `web/wrangler.toml`

**Interfaces:**
- Produces: D1 database `tengsl` with tables `felog, folk, hlutverk, eign, crawl_queue, sweep_state` and the binding `TENGSL` in the worker env. Consumed by every later task.

- [ ] **Step 1: Write the migration**

Create `web/migrations/0001_tengsl.sql`:

```sql
-- Tengslagrunnur v1 — landsdekkandi eigenda- & stjórnendagrunnur. Sjá spec 2026-07-12.
CREATE TABLE IF NOT EXISTS felog (
  kt TEXT PRIMARY KEY, nafn TEXT, form TEXT, stada TEXT, skraning TEXT,
  afskrad INTEGER DEFAULT 0, afskrad_dags TEXT,
  gjaldthrot INTEGER DEFAULT 0, gjaldthrot_dags TEXT,
  gjaldthol INTEGER DEFAULT 0, gjaldthol_dags TEXT,
  isat TEXT, hlutafe REAL, mynt TEXT, last_crawled TEXT, last_eigendur TEXT
);
CREATE TABLE IF NOT EXISTS folk (
  person_key TEXT PRIMARY KEY, kt TEXT, nafn TEXT, faeding TEXT
);
CREATE TABLE IF NOT EXISTS hlutverk (
  felag_kt TEXT NOT NULL, person_key TEXT NOT NULL, hlutverk TEXT, tegund TEXT,
  seen_first TEXT NOT NULL, seen_last TEXT,
  PRIMARY KEY (felag_kt, person_key, hlutverk)
);
CREATE TABLE IF NOT EXISTS eign (
  felag_kt TEXT NOT NULL, eigandi_key TEXT NOT NULL, eigandi_tegund TEXT NOT NULL,
  hlutur REAL, tegund TEXT NOT NULL, heimild TEXT, seen_first TEXT NOT NULL, seen_last TEXT,
  PRIMARY KEY (felag_kt, eigandi_key, tegund)
);
CREATE TABLE IF NOT EXISTS crawl_queue (
  kt TEXT PRIMARY KEY, priority INTEGER NOT NULL, discovered_from TEXT,
  added_at TEXT NOT NULL, crawled_at TEXT, attempts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS sweep_state (
  prefix TEXT PRIMARY KEY, done INTEGER DEFAULT 0, hit_count INTEGER, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_hlutverk_person ON hlutverk(person_key);
CREATE INDEX IF NOT EXISTS idx_hlutverk_felag ON hlutverk(felag_kt);
CREATE INDEX IF NOT EXISTS idx_eign_eigandi ON eign(eigandi_key);
CREATE INDEX IF NOT EXISTS idx_eign_felag ON eign(felag_kt);
CREATE INDEX IF NOT EXISTS idx_queue_status ON crawl_queue(status, priority, added_at);
```

- [ ] **Step 2: Verify the schema applies to a local SQLite**

Run (from repo root): `node --input-type=module -e "import('node:sqlite').then(({DatabaseSync})=>{const fs=require('fs');const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('web/migrations/0001_tengsl.sql','utf8'));const t=db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all().map(r=>r.name);console.log(t.join(','));})"`
Expected: `crawl_queue,eign,felog,folk,hlutverk,sweep_state`

- [ ] **Step 3: Add the binding to `wrangler.toml`**

Append to `web/wrangler.toml` (database_id is a placeholder until Aron runs `wrangler d1 create tengsl`):

```toml

# Tengslagrunnur (D1) — landsdekkandi eigenda-/stjórnendagrunnur. Kóðinn er null-þolinn:
# ef bindingin/gögnin vantar hegðar workerinn sér nákvæmlega eins og áður.
[[d1_databases]]
binding = "TENGSL"
database_name = "tengsl"
database_id = "PLACEHOLDER_ARON_RUNS_wrangler_d1_create_tengsl"
```

- [ ] **Step 4: Verify wrangler still parses**

Run (from `web/`): `npx wrangler deploy --dry-run 2>&1 | tail -5`
Expected: dry-run completes (a placeholder database_id is fine for `--dry-run`; it is not contacted). If dry-run rejects the placeholder id format, use a syntactically-valid dummy UUID `00000000-0000-0000-0000-000000000000`.

- [ ] **Step 5: Commit**

```bash
git add web/migrations/0001_tengsl.sql web/wrangler.toml
git commit -m "feat(tengsl): D1 schema + TENGSL binding (null-tolerant)"
```

---

## Task 1: `rsk_parse.mjs` — pure parsers (API + owner scrape)

**Files:**
- Create: `skriptur/lib/rsk_parse.mjs`
- Test: `skriptur/lib/rsk_parse.test.mjs`

**Interfaces:**
- Produces: `eigNorm(s)`, `personKey({kt,nafn,faeding})`, `rg(obj,name)`, `rskErFyrirtaeki(kt)`, `htmlText(s)`.
- Produces: `parseLegalEntity(kt, apiJson)` → `{ felag: {kt,nafn,form,stada,skraning,afskrad,afskrad_dags,gjaldthrot,gjaldthrot_dags,gjaldthol,gjaldthol_dags,isat,hlutafe,mynt}, folk: [{person_key,kt,nafn,faeding:null}], hlutverk: [{felag_kt,person_key,hlutverk,tegund}], discovered: [company-kt strings] }`. Returns `null` if the JSON has no name/nationalId.
- Produces: `parseEigendur(html)` → `[{felag_kt?,nafn,faeding,buseta,rikisfang,hlutur,tegund}]` (owner rows; `felag_kt` filled by the caller).
- Consumes: raw API JSON (PascalCase) and raw detail-page HTML — same shapes the worker already handles in `rskClean`/`rskFelag`.

- [ ] **Step 1: Write the failing test**

Create `skriptur/lib/rsk_parse.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { eigNorm, personKey, rskErFyrirtaeki, parseLegalEntity, parseEigendur } from './rsk_parse.mjs';

test('rskErFyrirtaeki: day 41-71 = company, 01-31 = person', () => {
  assert.equal(rskErFyrirtaeki('5920190799'), true);   // day 59
  assert.equal(rskErFyrirtaeki('1201743509'), false);  // day 12
});

test('personKey: kt when known, else nm:norm|faeding', () => {
  assert.equal(personKey({ kt: '1201743509' }), '1201743509');
  assert.equal(personKey({ nafn: 'Jón Á. Jónsson', faeding: '1970' }), 'nm:jon a jonsson|1970');
});

test('parseLegalEntity: PascalCase API → felag + folk + hlutverk + discovered', () => {
  const api = {
    Name: 'Rót ehf.', NationalId: '5920190799', Status: 'Virk skráning',
    Registered: '2001-04-03T00:00:00', LegalForm: { Name: 'Einkahlutafélag' },
    Deregistration: { Bankrupcy: false, Insolvency: false },
    ArticlesOfAssociation: { ShareCapital: 500000, ShareCapitalCurrency: 'ISK' },
    ActivityCode: [{ Id: '62.01', Name: 'Forritun' }],
    Relationships: [
      { Name: 'Anna Ansdóttir', NationalId: '1201743509', Type: 'Stjórn', Position: 'Stjórnarformaður' },
      { Name: 'Beta ehf.', NationalId: '4808221610', Type: 'Móðurfélag' },
      { Name: 'Endurskoðandi Inc', NationalId: '2201743019', Type: 'Endurskoðandi' },
    ],
  };
  const r = parseLegalEntity('5920190799', api);
  assert.equal(r.felag.nafn, 'Rót ehf.');
  assert.equal(r.felag.form, 'Einkahlutafélag');
  assert.equal(r.felag.hlutafe, 500000);
  // person relationship → folk + hlutverk (person-kt kept internally)
  const anna = r.folk.find((p) => p.nafn === 'Anna Ansdóttir');
  assert.equal(anna.person_key, '1201743509');
  assert.ok(r.hlutverk.some((h) => h.person_key === '1201743509' && h.hlutverk === 'Stjórnarformaður'));
  // company relationship → discovered kt, NOT folk
  assert.deepEqual(r.discovered, ['4808221610']);
  assert.ok(!r.folk.some((p) => p.person_key === '4808221610'));
  // auditor filtered out of hlutverk (noise)
  assert.ok(!r.hlutverk.some((h) => /2201743019/.test(h.person_key)));
});

test('parseLegalEntity: bankruptcy dates captured', () => {
  const api = { Name: 'Þrota ehf.', NationalId: '5920190799', Deregistration: { Bankrupcy: true, BankrupcyDate: '2024-02-01T00:00:00' } };
  const r = parseLegalEntity('5920190799', api);
  assert.equal(r.felag.gjaldthrot, 1);
  assert.equal(r.felag.gjaldthrot_dags, '2024-02-01');
});

test('parseLegalEntity: empty/invalid → null', () => {
  assert.equal(parseLegalEntity('5920190799', {}), null);
});

test('parseEigendur: parses owner blocks from detail HTML', () => {
  const html = `<div>Raunverulegir eigendur</div>
    <h4>Jón Jónsson</h4><table><tbody><tr><td>1970</td><td>Ísland.</td><td>Ísland</td><td>60%</td><td>Beint eignarhald,</td></tr></tbody></table>
    <h4>Guðrún Ó.</h4><table><tbody><tr><td>1965</td><td>Ísland.</td><td>Ísland</td><td>-</td><td>Óbeint</td></tr></tbody></table>
    <h3>Leit í fyrirtækjaskrá</h3>`;
  const rows = parseEigendur(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].nafn, 'Jón Jónsson');
  assert.equal(rows[0].faeding, '1970');
  assert.equal(rows[0].hlutur, '60%');
  assert.equal(rows[1].hlutur, null); // '-' → null
});

test('parseEigendur: no owner section → empty array', () => {
  assert.deepEqual(parseEigendur('<div>ekkert hér</div>'), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run (repo root): `node --test skriptur/lib/rsk_parse.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `rsk_parse.mjs`**

Create `skriptur/lib/rsk_parse.mjs`:

```js
// rsk_parse.mjs — HREINAR þáttunarfallar fyrir tengslagrunn-crawlerinn.
// Speglar rskClean/rskFelag í web/worker.js EN sem sjálfstæð, prófanleg Node-eining.
// Engin DOM, ekkert net. Notað af crawl_tengsl.mjs + unit-prófunum.

// ---- deildir hjálparar (sömu reglur og ubo-report.js / worker.js) ----
export const eigNorm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const personKey = ({ kt, nafn, faeding } = {}) => {
  const k = String(kt || '').replace(/\D/g, '');
  return k.length === 10 ? k : 'nm:' + eigNorm(nafn) + '|' + (faeding || '');
};
export const rskErFyrirtaeki = (kt) => { const dd = parseInt(String(kt).slice(0, 2), 10); return dd >= 41 && dd <= 71; };
// case-óháður lesari (APIð skilar PascalCase þótt skjölin sýni camelCase)
export function rg(o, name) {
  if (!o || typeof o !== 'object') return undefined;
  if (name in o) return o[name];
  const lo = name.toLowerCase();
  for (const k in o) if (k.toLowerCase() === lo) return o[k];
  return undefined;
}
export const htmlText = (s) => String(s == null ? '' : s)
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

const dstr = (v) => (v ? String(v).slice(0, 10) : null);
const SLEPPA = /^(endursko.andi|stofnandi)/i;   // suð/sögulegt — ekki fyrirsvar

// ---- API (LegalEntities v2.1) ----
export function parseLegalEntity(kt, d) {
  const nafn = rg(d, 'name'), natid = rg(d, 'nationalId');
  if (!d || typeof d !== 'object' || !(nafn || natid)) return null;
  const der = rg(d, 'deregistration') || {};
  const aoa = rg(d, 'articlesOfAssociation') || {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const felag = {
    kt, nafn: nafn || null, form: (rg(rg(d, 'legalForm'), 'name')) || null,
    stada: rg(d, 'status') || null, skraning: dstr(rg(d, 'registered')),
    afskrad: rg(der, 'deregistered') ? 1 : 0, afskrad_dags: dstr(rg(der, 'deregistrationDate')),
    gjaldthrot: rg(der, 'bankrupcy') ? 1 : 0, gjaldthrot_dags: dstr(rg(der, 'bankrupcyDate')),
    gjaldthol: rg(der, 'insolvency') ? 1 : 0, gjaldthol_dags: dstr(rg(der, 'insolvencyDate')),
    isat: JSON.stringify(arr(rg(d, 'activityCode')).map((a) => ({ id: rg(a, 'id') || null, nafn: rg(a, 'name') || null })).slice(0, 6)),
    hlutafe: rg(aoa, 'shareCapital') || null, mynt: rg(aoa, 'shareCapitalCurrency') || null,
  };
  const folk = [], hlutverk = [], discovered = [];
  for (const r of arr(rg(d, 'relationships'))) {
    const rk = String(rg(r, 'nationalId') || '').replace(/\D/g, '');
    const rnafn = rg(r, 'name') || null;
    const teg = rg(r, 'type') || null;
    if (rk.length === 10 && rskErFyrirtaeki(rk)) { if (discovered.indexOf(rk) < 0) discovered.push(rk); continue; }
    if (SLEPPA.test(teg || '') || /l.st/i.test(rg(r, 'status') || '')) continue;   // sía endursko./stofn./látna
    if (rk.length !== 10) continue;   // aðeins gild persónu-kt
    const pk = personKey({ kt: rk, nafn: rnafn });
    if (!folk.some((p) => p.person_key === pk)) folk.push({ person_key: pk, kt: rk, nafn: rnafn, faeding: null });
    hlutverk.push({ felag_kt: kt, person_key: pk, hlutverk: rg(r, 'position') || teg || 'fyrirsvar', tegund: teg });
  }
  return { felag, folk, hlutverk, discovered };
}

// ---- Frítt skrap (raunverulegir eigendur af detail-síðu) ----
export function parseEigendur(html) {
  const iE = String(html || '').indexOf('Raunverulegir eigendur');
  if (iE < 0) return [];
  let eseg = html.slice(iE, iE + 9000);
  const end = eseg.slice(40).search(/Leit í fyrirtækjaskrá|<h3/i);
  if (end > 0) eseg = eseg.slice(0, end + 40);
  const out = [];
  for (const p of eseg.split(/<h4>/i).slice(1)) {
    const nafn = htmlText((p.match(/^([\s\S]*?)<\/h4>/) || [])[1] || '');
    if (!nafn) continue;
    const tb = p.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    const c = tb ? [...tb[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => htmlText(x[1])) : [];
    out.push({
      nafn, faeding: c[0] || null, buseta: (c[1] || '').replace(/\.$/, '') || null,
      rikisfang: c[2] || null, hlutur: c[3] && c[3] !== '-' ? c[3] : null,
      tegund: (c[4] || '').replace(/[,\s]+$/, '') || null,
    });
    if (out.length >= 20) break;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run (repo root): `node --test skriptur/lib/rsk_parse.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/rsk_parse.mjs skriptur/lib/rsk_parse.test.mjs
git commit -m "feat(tengsl): pure RSK parsers (API relationships + owner scrape)"
```

---

## Task 2: `tengsl_sql.mjs` — idempotent night-SQL builder

**Files:**
- Create: `skriptur/lib/tengsl_sql.mjs`
- Test: `skriptur/lib/tengsl_sql.test.mjs`

**Interfaces:**
- Consumes (from Task 1): the `{felag, folk, hlutverk, eign, discovered}` per-company record shape (eign rows carry `{felag_kt, eigandi_key, eigandi_tegund, hlutur, tegund, heimild}`).
- Produces: `sqlLit(v)` (SQL literal escaper) and `buildNightSql({ today, felog, folk, hlutverk, eign, queueDone, queueAdd })` → a single SQL string that (a) upserts `felog/folk`, (b) upserts `hlutverk`/`eign` with `seen_first` on insert and `seen_last=NULL` on conflict, (c) marks `crawl_queue` rows done, (d) INSERT OR IGNOREs discovered kt into the queue. `seen_last`-closing of vanished rows happens in the crawler (needs per-company diff) via `buildSeenLastSql(felag_kt, table, keptKeys, today)`.
- Produces: `buildSeenLastSql(felag_kt, keptHlutverkKeys, keptEignKeys, today)` → SQL to set `seen_last=today` for that company's rows NOT in the kept-sets and currently open.

- [ ] **Step 1: Write the failing test**

Create `skriptur/lib/tengsl_sql.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { buildNightSql, buildSeenLastSql, sqlLit } from './tengsl_sql.mjs';

const schema = fs.readFileSync(new URL('../../web/migrations/0001_tengsl.sql', import.meta.url), 'utf8');
const fresh = () => { const db = new DatabaseSync(':memory:'); db.exec(schema); return db; };

test('sqlLit escapes single quotes and nulls', () => {
  assert.equal(sqlLit(null), 'NULL');
  assert.equal(sqlLit("O'Brien"), "'O''Brien'");
  assert.equal(sqlLit(42), '42');
});

test('buildNightSql: inserts felag+hlutverk, idempotent on re-apply', () => {
  const rec = {
    today: '2026-07-12',
    felog: [{ kt: '5920190799', nafn: 'Rót ehf.', form: 'Einkahlutafélag', stada: 'Virk', skraning: '2001-04-03', afskrad: 0, afskrad_dags: null, gjaldthrot: 0, gjaldthrot_dags: null, gjaldthol: 0, gjaldthol_dags: null, isat: '[]', hlutafe: 500000, mynt: 'ISK' }],
    folk: [{ person_key: '1201743509', kt: '1201743509', nafn: 'Anna Ansdóttir', faeding: null }],
    hlutverk: [{ felag_kt: '5920190799', person_key: '1201743509', hlutverk: 'Stjórnarformaður', tegund: 'Stjórn' }],
    eign: [], queueDone: ['5920190799'], queueAdd: [{ kt: '4808221610', from: '5920190799' }],
  };
  const sql = buildNightSql(rec);
  const db = fresh();
  db.exec(sql); db.exec(sql); // apply twice
  assert.equal(db.prepare('SELECT COUNT(*) n FROM felog').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM hlutverk').get().n, 1);
  assert.equal(db.prepare("SELECT seen_first FROM hlutverk").get().seen_first, '2026-07-12');
  assert.equal(db.prepare("SELECT status FROM crawl_queue WHERE kt='4808221610'").get().status, 'pending');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM crawl_queue WHERE kt='5920190799'").get().n, 0); // done rows removed/marked
});

test('buildSeenLastSql: closes vanished rows only', () => {
  const db = fresh();
  db.exec(buildNightSql({
    today: '2026-01-01', felog: [{ kt: '5920190799', nafn: 'Rót', form: null, stada: null, skraning: null, afskrad: 0, afskrad_dags: null, gjaldthrot: 0, gjaldthrot_dags: null, gjaldthol: 0, gjaldthol_dags: null, isat: '[]', hlutafe: null, mynt: null }],
    folk: [{ person_key: 'A', kt: null, nafn: 'A', faeding: null }, { person_key: 'B', kt: null, nafn: 'B', faeding: null }],
    hlutverk: [{ felag_kt: '5920190799', person_key: 'A', hlutverk: 'Stjórn', tegund: null }, { felag_kt: '5920190799', person_key: 'B', hlutverk: 'Stjórn', tegund: null }],
    eign: [], queueDone: [], queueAdd: [],
  }));
  // Re-crawl: only A remains → B must be closed
  db.exec(buildSeenLastSql('5920190799', ['A|Stjórn'], [], '2026-06-01'));
  assert.equal(db.prepare("SELECT seen_last FROM hlutverk WHERE person_key='A'").get().seen_last, null);
  assert.equal(db.prepare("SELECT seen_last FROM hlutverk WHERE person_key='B'").get().seen_last, '2026-06-01');
});
```

- [ ] **Step 2: Run to verify it fails**

Run (repo root): `node --test skriptur/lib/tengsl_sql.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tengsl_sql.mjs`**

Create `skriptur/lib/tengsl_sql.mjs`:

```js
// tengsl_sql.mjs — HREIN SQL-myndun fyrir næturkeyrsluna. Idempotent upserts +
// seen_first/seen_last saga (aldrei DELETE). Skilar einum SQL-streng á D1.

export function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}
const L = sqlLit;

export function buildNightSql({ today, felog = [], folk = [], hlutverk = [], eign = [], queueDone = [], queueAdd = [] }) {
  const s = [];
  const T = L(today);
  for (const f of felog) {
    s.push(`INSERT INTO felog (kt,nafn,form,stada,skraning,afskrad,afskrad_dags,gjaldthrot,gjaldthrot_dags,gjaldthol,gjaldthol_dags,isat,hlutafe,mynt,last_crawled) VALUES (${L(f.kt)},${L(f.nafn)},${L(f.form)},${L(f.stada)},${L(f.skraning)},${L(f.afskrad || 0)},${L(f.afskrad_dags)},${L(f.gjaldthrot || 0)},${L(f.gjaldthrot_dags)},${L(f.gjaldthol || 0)},${L(f.gjaldthol_dags)},${L(f.isat)},${L(f.hlutafe)},${L(f.mynt)},${T}) ON CONFLICT(kt) DO UPDATE SET nafn=excluded.nafn,form=excluded.form,stada=excluded.stada,skraning=excluded.skraning,afskrad=excluded.afskrad,afskrad_dags=excluded.afskrad_dags,gjaldthrot=excluded.gjaldthrot,gjaldthrot_dags=excluded.gjaldthrot_dags,gjaldthol=excluded.gjaldthol,gjaldthol_dags=excluded.gjaldthol_dags,isat=excluded.isat,hlutafe=excluded.hlutafe,mynt=excluded.mynt,last_crawled=${T};`);
  }
  for (const p of folk) {
    s.push(`INSERT INTO folk (person_key,kt,nafn,faeding) VALUES (${L(p.person_key)},${L(p.kt)},${L(p.nafn)},${L(p.faeding)}) ON CONFLICT(person_key) DO UPDATE SET kt=COALESCE(folk.kt,excluded.kt),nafn=COALESCE(excluded.nafn,folk.nafn),faeding=COALESCE(folk.faeding,excluded.faeding);`);
  }
  for (const h of hlutverk) {
    s.push(`INSERT INTO hlutverk (felag_kt,person_key,hlutverk,tegund,seen_first,seen_last) VALUES (${L(h.felag_kt)},${L(h.person_key)},${L(h.hlutverk)},${L(h.tegund)},${T},NULL) ON CONFLICT(felag_kt,person_key,hlutverk) DO UPDATE SET tegund=excluded.tegund,seen_last=NULL;`);
  }
  for (const e of eign) {
    s.push(`INSERT INTO eign (felag_kt,eigandi_key,eigandi_tegund,hlutur,tegund,heimild,seen_first,seen_last) VALUES (${L(e.felag_kt)},${L(e.eigandi_key)},${L(e.eigandi_tegund)},${L(e.hlutur)},${L(e.tegund)},${L(e.heimild)},${T},NULL) ON CONFLICT(felag_kt,eigandi_key,tegund) DO UPDATE SET hlutur=excluded.hlutur,eigandi_tegund=excluded.eigandi_tegund,heimild=excluded.heimild,seen_last=NULL;`);
  }
  for (const kt of queueDone) s.push(`DELETE FROM crawl_queue WHERE kt=${L(kt)};`);
  for (const q of queueAdd) s.push(`INSERT OR IGNORE INTO crawl_queue (kt,priority,discovered_from,added_at,status) VALUES (${L(q.kt)},${L(q.priority || 2)},${L(q.from || null)},${T},'pending');`);
  return s.join('\n');
}

// Loka röðum sem VANTAR í nýtt svar (kept-lyklar = 'person_key|hlutverk' / 'eigandi_key|tegund').
export function buildSeenLastSql(felagKt, keptHlutverkKeys, keptEignKeys, today) {
  const s = [];
  const hk = keptHlutverkKeys.map(L).join(',') || "''";
  const ek = keptEignKeys.map(L).join(',') || "''";
  s.push(`UPDATE hlutverk SET seen_last=${L(today)} WHERE felag_kt=${L(felagKt)} AND seen_last IS NULL AND (person_key||'|'||hlutverk) NOT IN (${hk});`);
  s.push(`UPDATE eign SET seen_last=${L(today)} WHERE felag_kt=${L(felagKt)} AND seen_last IS NULL AND (eigandi_key||'|'||tegund) NOT IN (${ek});`);
  return s.join('\n');
}
```

Note the test's `buildSeenLastSql('5920190799', ['A|Stjórn'], [], ...)` — kept-keys use the `person_key|hlutverk` form matching the SQL's `person_key||'|'||hlutverk`.

- [ ] **Step 4: Run to verify it passes**

Run (repo root): `node --test skriptur/lib/tengsl_sql.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/tengsl_sql.mjs skriptur/lib/tengsl_sql.test.mjs
git commit -m "feat(tengsl): idempotent night-SQL builder with seen_last history"
```

---

## Task 3: `sweep.mjs` — adaptive nafnaleit prefix sweep

**Files:**
- Create: `skriptur/lib/sweep.mjs`
- Test: `skriptur/lib/sweep.test.mjs`

**Interfaces:**
- Produces: `SWEEP_ALPHABET` (a–z + Icelandic áðéíóúýþæö + 0–9 + space), `extractKts(html)` → deduped kt strings from a nafnaleit result page, and `nextPrefixes(prefix, hitCount, cap=100)` → `{ done: bool, children: string[] }`: if `hitCount >= cap` the prefix is saturated → return its children (prefix + each alphabet char) to crawl deeper; else the prefix is exhausted → `done:true`, no children.
- Consumes: raw HTML from `skatturinn.is/fyrirtaekjaskra/leit?nafn=<prefix>` (verified 2026-07-12: ≤100 `kennitala/<kt>` links per page, no reliable total-count).

- [ ] **Step 1: Write the failing test**

Create `skriptur/lib/sweep.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { extractKts, nextPrefixes, SWEEP_ALPHABET } from './sweep.mjs';

test('extractKts: dedupes kennitala links', () => {
  const html = 'x<a href="/fyrirtaekjaskra/leit/kennitala/5920190799">A</a> <a href="/fyrirtaekjaskra/leit/kennitala/5920190799">dup</a> <a href="/fyrirtaekjaskra/leit/kennitala/4808221610">B</a>';
  assert.deepEqual(extractKts(html).sort(), ['4808221610', '5920190799']);
});

test('nextPrefixes: saturated prefix deepens', () => {
  const r = nextPrefixes('a', 100, 100);
  assert.equal(r.done, false);
  assert.equal(r.children.length, SWEEP_ALPHABET.length);
  assert.ok(r.children.every((c) => c.startsWith('a') && c.length === 2));
});

test('nextPrefixes: unsaturated prefix is done', () => {
  const r = nextPrefixes('xq', 12, 100);
  assert.equal(r.done, true);
  assert.deepEqual(r.children, []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run (repo root): `node --test skriptur/lib/sweep.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sweep.mjs`**

Create `skriptur/lib/sweep.mjs`:

```js
// sweep.mjs — adaptív forskeyta-upptalning á nafnaleit fyrirtækjaskrár.
// Staðfest 2026-07-12: ?nafn=<q> skilar ≤100 treffum (þak) og enginn áreiðanlegur
// heildarfjöldi → dýpkum forskeyti þegar 100-þak næst.
export const SWEEP_ALPHABET = 'abcdefghijklmnopqrstuvwxyzáðéíóúýþæö0123456789 '.split('');

export function extractKts(html) {
  return [...new Set([...String(html || '').matchAll(/kennitala\/(\d{10})/g)].map((m) => m[1]))];
}

// hitCount = fjöldi einstakra kt á síðunni. cap = þak APIsins (100).
export function nextPrefixes(prefix, hitCount, cap = 100) {
  if (hitCount >= cap) return { done: false, children: SWEEP_ALPHABET.map((c) => prefix + c) };
  return { done: true, children: [] };
}
```

- [ ] **Step 4: Run to verify it passes**

Run (repo root): `node --test skriptur/lib/sweep.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole lib suite green**

Run (repo root): `node --test skriptur/lib/*.test.mjs`
Expected: PASS (all rsk_parse + tengsl_sql + sweep tests).

- [ ] **Step 6: Commit**

```bash
git add skriptur/lib/sweep.mjs skriptur/lib/sweep.test.mjs
git commit -m "feat(tengsl): adaptive nafnaleit prefix sweep"
```

---

## Task 4: `seed_tengsl.mjs` — seed the crawl queue

**Files:**
- Create: `skriptur/seed_tengsl.mjs`

**Interfaces:**
- Consumes: existing `web/public/gogn/eigendur/*.json` (net node kts), `web/public/gogn/stjorn/*.json` (kt), `web/public/gogn/eigendur_reverse.json` (byOwner company kts), `web/public/gogn/logbirting.json` (`byKt` keys). Uses `buildNightSql`'s queue-insert via a direct SQL emit.
- Produces: prints an `INSERT OR IGNORE INTO crawl_queue` SQL file to stdout (or `--out <file>`) plus a bootstrap `sweep_state` row for each single-letter prefix (priority-3 sweep seeds). Idempotent (INSERT OR IGNORE). Run: `node skriptur/seed_tengsl.mjs --out seed.sql`.

- [ ] **Step 1: Implement `seed_tengsl.mjs`**

Create `skriptur/seed_tengsl.mjs`:

```js
#!/usr/bin/env node
// seed_tengsl.mjs — sáir crawl_queue úr Karp-snertum félögum + Lögbirtingu, og
// bootstrap-ar sweep_state (eins stafs forskeyti). Skrifar SQL á stdout eða --out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqlLit as L } from './lib/tengsl_sql.mjs';
import { SWEEP_ALPHABET, } from './lib/sweep.mjs';
import { rskErFyrirtaeki } from './lib/rsk_parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOGN = path.join(ROOT, 'web/public/gogn');
const today = new Date().toISOString().slice(0, 10);
const outArg = process.argv.indexOf('--out');
const kts = new Set();
const addKt = (k) => { const s = String(k || '').replace(/\D/g, ''); if (s.length === 10 && rskErFyrirtaeki(s)) kts.add(s); };

// 1) eigendur/*.json net-hnútar
try { for (const f of fs.readdirSync(path.join(GOGN, 'eigendur')).filter((f) => /^\d/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join(GOGN, 'eigendur', f), 'utf8'));
  addKt(j.kt); for (const n of ((j.net && j.net.nodes) || [])) addKt(n.kt);
} } catch (e) {}
// 2) stjorn/*.json
try { for (const f of fs.readdirSync(path.join(GOGN, 'stjorn')).filter((f) => /^\d/.test(f))) addKt(f.replace(/\D/g, '')); } catch (e) {}
// 3) eigendur_reverse.json (byOwner → a[].kt)
try { const rev = JSON.parse(fs.readFileSync(path.join(GOGN, 'eigendur_reverse.json'), 'utf8'));
  for (const k in (rev.byOwner || {})) { addKt(k); for (const c of ((rev.byOwner[k].a) || [])) addKt(c.kt); }
} catch (e) {}
// 4) logbirting.json byKt
try { const lb = JSON.parse(fs.readFileSync(path.join(GOGN, 'logbirting.json'), 'utf8')); for (const k in (lb.byKt || {})) addKt(k); } catch (e) {}

const lines = [];
for (const k of kts) lines.push(`INSERT OR IGNORE INTO crawl_queue (kt,priority,discovered_from,added_at,status) VALUES (${L(k)},1,'seed',${L(today)},'pending');`);
// sweep bootstrap: eins stafs forskeyti (priority-3 upptalning)
for (const c of SWEEP_ALPHABET) if (c !== ' ') lines.push(`INSERT OR IGNORE INTO sweep_state (prefix,done,updated_at) VALUES (${L(c)},0,${L(today)});`);

const sql = lines.join('\n') + '\n';
if (outArg >= 0 && process.argv[outArg + 1]) { fs.writeFileSync(process.argv[outArg + 1], sql); console.error(`Sáði ${kts.size} félögum + ${SWEEP_ALPHABET.length - 1} sweep-forskeytum → ${process.argv[outArg + 1]}`); }
else process.stdout.write(sql);
```

- [ ] **Step 2: Verify it emits valid SQL against the schema**

Run (repo root): `node skriptur/seed_tengsl.mjs --out /tmp/seed.sql && node --input-type=module -e "import('node:sqlite').then(({DatabaseSync})=>{const fs=require('fs');const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('web/migrations/0001_tengsl.sql','utf8'));db.exec(fs.readFileSync('/tmp/seed.sql','utf8'));console.log('queue:',db.prepare('SELECT COUNT(*) n FROM crawl_queue').get().n,'sweep:',db.prepare('SELECT COUNT(*) n FROM sweep_state').get().n);})"`
Expected: `queue: <~1000+> sweep: 45` (exact queue count depends on current gogn/ contents; must be > 0 and apply cleanly).

- [ ] **Step 3: Commit**

```bash
git add skriptur/seed_tengsl.mjs
git commit -m "feat(tengsl): seed crawl queue from Karp files + logbirting + sweep bootstrap"
```

---

## Task 5: `crawl_tengsl.mjs` — nightly crawler orchestrator

**Files:**
- Create: `skriptur/crawl_tengsl.mjs`

**Interfaces:**
- Consumes: `RSK_KEY` (env), `TENGSL_BUDGET` (env, default 1500), the lib modules from Tasks 1–3, and `wrangler` (to read the queue and apply SQL). To avoid a live D1 round-trip per row, the crawler: (1) reads the pending batch via `wrangler d1 execute tengsl --remote --json --command "SELECT ..."`, (2) does all network + parsing in Node, (3) writes one `night.sql`, (4) applies it via `wrangler d1 execute tengsl --remote --file night.sql`.
- Produces: side effects only (D1 writes) + an Action-summary log. Flags: `--dry-run` (write night.sql, do NOT call wrangler apply), `--budget N`.

- [ ] **Step 1: Implement `crawl_tengsl.mjs`**

Create `skriptur/crawl_tengsl.mjs`:

```js
#!/usr/bin/env node
// crawl_tengsl.mjs — næturlegur snjóbolta-crawler. Les batch úr crawl_queue,
// kallar RSK-API (stjórn, með persónu-kt) + frítt eigenda-skrap, skrifar EITT
// night.sql og beitir því á D1 um wrangler. Kvóta-þak = TENGSL_BUDGET.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { parseLegalEntity, parseEigendur, personKey, rskErFyrirtaeki } from './lib/rsk_parse.mjs';
import { buildNightSql, buildSeenLastSql } from './lib/tengsl_sql.mjs';

const DRY = process.argv.includes('--dry-run');
const bi = process.argv.indexOf('--budget');
const BUDGET = bi >= 0 ? parseInt(process.argv[bi + 1], 10) : parseInt(process.env.TENGSL_BUDGET || '1500', 10);
const RSK_KEY = process.env.RSK_KEY;
const today = new Date().toISOString().slice(0, 10);
const API = 'https://api.skattur.cloud/legalentities/v2.1/';
const RSK_ROT = 'https://www.skatturinn.is';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!RSK_KEY) { console.error('RSK_KEY vantar — hætti (crawl sefur þar til secret kemur).'); process.exit(0); }

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { cwd: 'web', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
}
function queueBatch(n) {
  const out = wrangler(['d1', 'execute', 'tengsl', '--remote', '--json', '--command',
    `SELECT kt FROM crawl_queue WHERE status='pending' ORDER BY priority, added_at LIMIT ${n}`]);
  try { const j = JSON.parse(out); const rows = (j[0] && j[0].results) || j.results || []; return rows.map((r) => r.kt); }
  catch (e) { console.error('Gat ekki lesið biðröð:', e.message); return []; }
}

async function fetchApi(kt) {
  const r = await fetch(API + kt + '?language=is', { headers: { 'Ocp-Apim-Subscription-Key': RSK_KEY, 'Accept': 'application/json' } });
  if (r.status === 401 || r.status === 403) { throw new Error('AUTH ' + r.status); }   // rangur lykill → stöðva nótt
  if (r.status === 404) return { notfound: true };
  if (!r.ok) return { error: r.status };
  return { json: await r.json().catch(() => null) };
}
async function fetchEigendur(kt) {
  try {
    const r = await fetch(RSK_ROT + '/fyrirtaekjaskra/leit/kennitala/' + kt, { headers: { 'User-Agent': 'karp.is tengslagrunnur (aronheidars@gmail.com)' } });
    if (!r.ok) return [];
    return parseEigendur(await r.text());
  } catch (e) { return []; }
}

const acc = { felog: [], folk: [], hlutverk: [], eign: [], queueDone: [], queueAdd: [] };
const seenLastSql = [];
let used = 0, ok = 0, notfound = 0, errs = 0, discovered = 0;

const batch = queueBatch(BUDGET);
console.error(`Batch: ${batch.length} kt (budget ${BUDGET}).`);

for (const kt of batch) {
  if (used >= BUDGET) break;
  used++;
  let api;
  try { api = await fetchApi(kt); }
  catch (e) { console.error('STÖÐVA nótt:', e.message); break; }   // AUTH → hætta strax
  acc.queueDone.push(kt);
  if (api.notfound) { notfound++; continue; }
  if (api.error || !api.json) { errs++; continue; }
  const rec = parseLegalEntity(kt, api.json);
  if (!rec) { errs++; continue; }
  ok++;
  acc.felog.push(rec.felag);
  acc.folk.push(...rec.folk);
  acc.hlutverk.push(...rec.hlutverk);
  for (const dk of rec.discovered) { acc.queueAdd.push({ kt: dk, from: kt, priority: 2 }); discovered++; }
  // frítt eigenda-skrap (kurteist)
  await sleep(1500);
  const eig = await fetchEigendur(kt);
  const eignRows = [];
  for (const e of eig) {
    const isFelag = false;   // raunverulegir eigendur eru einstaklingar
    const key = personKey({ nafn: e.nafn, faeding: e.faeding });
    acc.folk.push({ person_key: key, kt: null, nafn: e.nafn, faeding: e.faeding });
    const row = { felag_kt: kt, eigandi_key: key, eigandi_tegund: 'einst', hlutur: e.hlutur, tegund: 'raunverulegur', heimild: 'RSK raunverulegir eigendur' };
    acc.eign.push(row); eignRows.push(row);
  }
  // seen_last: loka hlutverkum/eignum sem hurfu úr þessu félagi
  const keptH = rec.hlutverk.map((h) => h.person_key + '|' + h.hlutverk);
  const keptE = eignRows.map((r) => r.eigandi_key + '|' + r.tegund);
  seenLastSql.push(buildSeenLastSql(kt, keptH, keptE, today));
}

const sql = [buildNightSql({ today, ...acc }), ...seenLastSql].join('\n') + '\n';
fs.writeFileSync('web/night.sql', sql);
console.error(`Þáttað: ${ok} ok · ${notfound} ekki-til · ${errs} villur · ${discovered} uppgötvuð · ${used} köll notuð.`);
console.error(`Rita ${(sql.length / 1024).toFixed(0)} KiB í web/night.sql.`);

if (DRY) { console.error('--dry-run: beiti EKKI á D1.'); process.exit(0); }
if (used === 0) { console.error('Ekkert að skrifa.'); process.exit(0); }
wrangler(['d1', 'execute', 'tengsl', '--remote', '--file', 'night.sql']);
fs.unlinkSync('web/night.sql');
console.error('✓ Beitt á D1.');

// GH-summary
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Tengslagrunnur — nótt ${today}\n\n- Köll notuð: **${used}** / ${BUDGET}\n- Þáttað: ${ok} ok · ${notfound} ekki-til · ${errs} villur\n- Uppgötvuð ný félög: ${discovered}\n`);
}
```

- [ ] **Step 2: Verify `--dry-run` writes SQL without touching D1 (mock the queue)**

Since `--dry-run` still needs a queue source, verify the parse+SQL path with a tiny harness that stubs `queueBatch`. Run (repo root):
`node --input-type=module -e "import('./skriptur/lib/rsk_parse.mjs').then(async m=>{const api={Name:'X ehf.',NationalId:'5920190799',Relationships:[{Name:'A',NationalId:'1201743509',Type:'Stjórn',Position:'Formaður'},{Name:'B ehf.',NationalId:'4808221610',Type:'Móðurfélag'}]};const r=m.parseLegalEntity('5920190799',api);const {buildNightSql}=await import('./skriptur/lib/tengsl_sql.mjs');const sql=buildNightSql({today:'2026-07-12',felog:[r.felag],folk:r.folk,hlutverk:r.hlutverk,eign:[],queueDone:['5920190799'],queueAdd:r.discovered.map(k=>({kt:k}))});console.log(sql.includes('INSERT INTO felog')&&sql.includes('4808221610')?'SQL OK':'SQL FAIL');})"`
Expected: `SQL OK`. (A full live `--dry-run` requires `RSK_KEY` + wrangler-readable queue; that runs in the workflow, gated by secrets.)

- [ ] **Step 3: `node --check` the crawler**

Run (repo root): `node --check skriptur/crawl_tengsl.mjs && node --check skriptur/seed_tengsl.mjs`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add skriptur/crawl_tengsl.mjs
git commit -m "feat(tengsl): nightly snowball crawler (API + owner scrape → night.sql → D1)"
```

---

## Task 6: `tengslagrunnur.yml` — nightly, secret-gated workflow

**Files:**
- Create: `.github/workflows/tengslagrunnur.yml`

**Interfaces:**
- Consumes: repo secrets `RSK_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; repo variable `TENGSL_BUDGET`.
- Produces: nightly D1 fill. Gated: if any secret is missing, exits 0 with an explanation (no red run).

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/tengslagrunnur.yml`:

```yaml
name: Tengslagrunnur (næturlegur crawl)

# Sáir einu sinni (workflow_dispatch með seed=true), svo næturlega snjóbolta-crawl.
# Secret-gátt: vantar RSK_KEY/CF-token → hreint exit 0 (crawl sefur þar til Aron kveikir).
on:
  schedule:
    - cron: '30 3 * * *'   # 03:30 UTC — utan refresh-data (06:00)
  workflow_dispatch:
    inputs:
      seed:
        description: 'Sá crawl_queue fyrst (true/false)'
        required: false
        default: 'false'
      budget:
        description: 'Kvóti kalla þessa keyrslu (annars TENGSL_BUDGET)'
        required: false

permissions:
  contents: read

concurrency:
  group: tengslagrunnur
  cancel-in-progress: false

jobs:
  crawl:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    env:
      RSK_KEY: ${{ secrets.RSK_KEY }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      TENGSL_BUDGET: ${{ github.event.inputs.budget || vars.TENGSL_BUDGET || '1500' }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
      - name: Secret-gátt
        run: |
          if [ -z "$RSK_KEY" ] || [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
            echo "⏸️  Vantar secrets (RSK_KEY / CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID) — crawl sefur." >> "$GITHUB_STEP_SUMMARY"
            echo "SKIP=1" >> "$GITHUB_ENV"
          fi
      - name: Deps (wrangler)
        if: env.SKIP != '1'
        run: npm ci
        working-directory: web
      - name: Sá biðröð (valfrjálst)
        if: env.SKIP != '1' && github.event.inputs.seed == 'true'
        run: |
          node skriptur/seed_tengsl.mjs --out web/seed.sql
          npx wrangler d1 execute tengsl --remote --file seed.sql
        working-directory: .
      - name: Migrate schema (idempotent)
        if: env.SKIP != '1'
        run: npx wrangler d1 execute tengsl --remote --file migrations/0001_tengsl.sql
        working-directory: web
      - name: Crawl
        if: env.SKIP != '1'
        run: node skriptur/crawl_tengsl.mjs
        working-directory: .
```

Note: `wrangler d1 execute` is run with `working-directory` set so it finds `web/wrangler.toml`; the crawler itself sets `cwd:'web'` for its own wrangler calls, so it is invoked from repo root.

- [ ] **Step 2: Lint the YAML**

Run (repo root): `node --input-type=module -e "import('node:fs').then(async fs=>{const t=fs.readFileSync('.github/workflows/tengslagrunnur.yml','utf8');console.log(/on:/.test(t)&&/crawl_tengsl/.test(t)&&/SKIP/.test(t)?'yml shape OK':'yml FAIL');})"`
Expected: `yml shape OK`. (Full YAML validation happens when GitHub parses it; the secret-gate means a missing-secret run is green.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tengslagrunnur.yml
git commit -m "feat(tengsl): nightly secret-gated crawl workflow"
```

---

## Task 7: Worker D1-read enrichment (null-tolerant, through the mask)

**Files:**
- Modify: `web/worker.js` (`tengslanetHandler`)
- Test: `web/test/tengsl-enrich.test.mjs`

**Interfaces:**
- Produces: `export async function tengslGrunnurEnrich(env, out, rotKt)` — given the assembled tengslanet `out` (with `stjornendur[]` each `{nafn, hlutverk_rot, onnur:[{kt,nafn,hlutverk}]}`), and if `env.TENGSL` exists, augments each named `stjornandi`'s `onnur[]` with country-wide companies from D1 (via that person's kt, which the handler holds server-side in the `folk` map). Returns the same `out` shape (mutated copy). If `env.TENGSL` is falsy, returns `out` unchanged.
- Consumes (from Task 1): `personKey` semantics — D1 rows are keyed by person_key; the handler already knows each root officer's kt server-side.
- Privacy: enrichment runs BEFORE `maskaKortSvar`; masked (krossar) people never gain a name; person-kt is never placed into `out`.

- [ ] **Step 1: Write the failing test**

Create `web/test/tengsl-enrich.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { tengslGrunnurEnrich, maskaKortSvar } from '../worker.js';

// Fake D1: env.TENGSL.prepare(sql).bind(...).all() → { results: [...] }
function fakeD1(rowsByKt) {
  return {
    prepare(sql) {
      return { bind(...args) { const pk = args[0]; return { async all() { return { results: rowsByKt[pk] || [] }; } }; } };
    },
  };
}

test('tengslGrunnurEnrich: adds country-wide companies to a named officer', async () => {
  const out = { kt: '5920190799', holdur: true, stjornendur: [{ nafn: 'Anna', _kt: '1201743509', hlutverk_rot: ['stjórn'], onnur: [] }], krossar: [] };
  const env = { TENGSL: fakeD1({ '1201743509': [{ felag_kt: '4808221610', nafn: 'Fjarlægt ehf.', hlutverk: 'Stjórn' }] }) };
  const r = await tengslGrunnurEnrich(env, out, '5920190799');
  const anna = r.stjornendur[0];
  assert.ok(anna.onnur.some((o) => o.kt === '4808221610' && o.nafn === 'Fjarlægt ehf.' && o.grunnur));
});

test('tengslGrunnurEnrich: no TENGSL binding → unchanged', async () => {
  const out = { kt: '5920190799', holdur: true, stjornendur: [{ nafn: 'Anna', _kt: '1201743509', onnur: [] }], krossar: [] };
  const r = await tengslGrunnurEnrich({}, out, '5920190799');
  assert.equal(r.stjornendur[0].onnur.length, 0);
});

test('privacy: enriched then masked → krossar carry no names, officer _kt stripped', async () => {
  const out = {
    kt: '5920190799', holdur: true,
    stjornendur: [{ nafn: 'Anna', _kt: '1201743509', hlutverk_rot: ['stjórn'], onnur: [] }],
    krossar: [{ nafn: 'Leyni Persóna', felog: [{ kt: '4808221610', nafn: 'Fjarlægt ehf.' }] }],
  };
  const env = { TENGSL: fakeD1({ '1201743509': [{ felag_kt: '4808221610', nafn: 'Fjarlægt ehf.', hlutverk: 'Stjórn' }] }) };
  const enriched = await tengslGrunnurEnrich(env, out, '5920190799');
  const masked = maskaKortSvar(enriched);
  const s = JSON.stringify(masked);
  assert.ok(!s.includes('Leyni Persóna'));          // distant person name cut
  assert.ok(!s.includes('1201743509'));             // person-kt never leaves
  assert.equal(masked.krossar[0].token, 'E1');
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `web/`): `node --test test/tengsl-enrich.test.mjs`
Expected: FAIL — `tengslGrunnurEnrich` not exported.

- [ ] **Step 3: Add `tengslGrunnurEnrich` + `_kt` threading + call site**

In `web/worker.js`, add the export just after `maskaKortSvar` (which currently ends `return { ...out, krossar, kort: true }; }`):

```js
// 🕸️ Landsdekkandi auðgun úr tengslagrunni (D1). Null-þolið: án env.TENGSL → óbreytt.
// Bætir landsvísu-félögum rót-tengds fólks í onnur[]. Persónu-kt (out.stjornendur[]._kt,
// server-hlið eingöngu) er notað sem D1-lykill og STRIPPAÐ hér áður en svarið fer út.
export async function tengslGrunnurEnrich(env, out, rotKt) {
  if (!env || !env.TENGSL || !out || !out.holdur) { if (out && out.stjornendur) for (const p of out.stjornendur) delete p._kt; return out; }
  const rkt = String(rotKt || '').replace(/\D/g, '');
  for (const p of (out.stjornendur || [])) {
    const pkt = p._kt; delete p._kt;
    if (!pkt) continue;
    try {
      const q = await env.TENGSL.prepare(
        "SELECT h.felag_kt AS kt, f.nafn AS nafn, h.hlutverk AS hlutverk FROM hlutverk h JOIN felog f ON f.kt=h.felag_kt WHERE h.person_key=? AND h.seen_last IS NULL AND h.felag_kt<>? LIMIT 40"
      ).bind(pkt, rkt).all();
      const rows = (q && q.results) || [];
      const have = new Set((p.onnur || []).map((o) => o.kt));
      for (const r of rows) {
        if (have.has(r.kt)) { const ex = p.onnur.find((o) => o.kt === r.kt); if (ex) ex.grunnur = true; continue; }
        (p.onnur = p.onnur || []).push({ kt: r.kt, nafn: r.nafn, hlutverk: r.hlutverk || '', grunnur: true });
        have.add(r.kt);
      }
      p.onnur = (p.onnur || []).slice(0, 30);
    } catch (e) {}
  }
  return out;
}
```

Then thread the officer's kt into `stjornendur` so the enricher has a key. In `tengslanetHandler`, find where `stjornendur.push(...)` is built (the `if (rotRoles.length) { stjornendur.push({ nafn: p.nafn, ... }) }` line) and add `_kt: [...folk map key...]`. The `folk` map is keyed by `t.kt` (individual kt); the loop variable is `p` from `for (const p of folk.values())` — capture the key. Change the `folk` population to store the kt on the value:

Find:
```js
        const p = folk.get(t.kt) || { nafn: t.nafn, roles: [] };
```
Replace with:
```js
        const p = folk.get(t.kt) || { nafn: t.nafn, kt: t.kt, roles: [] };
```
Then find:
```js
        stjornendur.push({ nafn: p.nafn, hlutverk_rot: [...new Set(rotRoles.map((r) => r.label))], onnur });
```
Replace with:
```js
        stjornendur.push({ nafn: p.nafn, _kt: p.kt, hlutverk_rot: [...new Set(rotRoles.map((r) => r.label))], onnur });
```

Finally, call the enricher in `tengslanetHandler` right before serialization. Find:
```js
  const body = kort ? maskaKortSvar(out) : out;   // 🕸️ nafna-felun aðeins í kort-ham
```
Replace with:
```js
  if (out.holdur) out = await tengslGrunnurEnrich(env, out, kt);   // 🕸️ landsvísu-auðgun (null-þolið; strippar _kt)
  const body = kort ? maskaKortSvar(out) : out;   // 🕸️ nafna-felun aðeins í kort-ham
```

⚠ Note: the list-mode path (`!kort`) also calls the enricher, so the non-kort response gains country-wide `onnur` too (desirable — the stjórnendaskýrslu list already shows named officers). `_kt` is always stripped inside `tengslGrunnurEnrich` regardless of the binding, so it never leaks even in list mode.

- [ ] **Step 4: Run the enrichment + privacy test**

Run (from `web/`): `node --test test/tengsl-enrich.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Full worker + site checks**

Run: `cd web && node --check worker.js && node --test test/*.test.mjs && npx astro build 2>&1 | tail -3`
Expected: check OK; all worker tests pass (tier + tengslanet-mask + tengslakort + tengsl-enrich); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/worker.js web/test/tengsl-enrich.test.mjs
git commit -m "feat(tengsl): worker reads D1 to enrich tengslanet (null-tolerant, through mask)"
```

---

## Task 8: Integration verification + deploy

**Files:** none (verification + deploy).

**Interfaces:** exercises the full stack. Note the D1 stays EMPTY until Aron adds secrets + creates the database + the crawler runs; until then the worker path is null-tolerant and the site is unchanged.

- [ ] **Step 1: Full pre-deploy gate**

Run: `cd web && npx astro build && node --check worker.js && node --test test/*.test.mjs && npx wrangler deploy --dry-run 2>&1 | tail -5` and (repo root) `node --test skriptur/lib/*.test.mjs`.
Expected: build OK (277+ pages), worker check OK, all worker tests + all lib tests PASS, dry-run bundles the worker. ⚠ If `wrangler deploy --dry-run` fails on the placeholder `database_id`, replace it with `00000000-0000-0000-0000-000000000000` (a syntactically valid dummy) — the real id comes from Aron.

- [ ] **Step 2: Browser smoke (unchanged behavior with empty D1)**

Start preview (`mitt-svaedi` → serves `web/dist`), open `/eigendur/?syni=1`, click 🕸️ Tengslakort. Since production D1 is empty/absent, the graph is IDENTICAL to today (Task-2/3 feature). Confirm no console errors and the ownership graph still renders — proving the enrichment is truly null-tolerant.

- [ ] **Step 3: Deploy**

```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt"
git fetch origin && git rebase origin/main    # resolve conflicts keeping both sides
cd web && npx astro build && node --check worker.js && node --test test/*.test.mjs && cd ..
git push origin b2b-topbar:main
```

- [ ] **Step 4: Post-deploy verify (worker route unchanged, D1 dormant)**

Confirm `/api/tengslanet?kt=<lögaðili>` (logged out) still returns `{holdur:false,error:'login'}` (route alive, no 500 from the D1 code path). The country-wide enrichment stays dormant (empty/absent D1) until Aron completes the blockers.

- [ ] **Step 5: Hand-off note to Aron (blockers to activate the crawl)**

Report exactly:
1. `npx wrangler d1 create tengsl` (in `web/`) → put the returned `database_id` in `web/wrangler.toml` (or send it to me), then push.
2. Add GH secrets: `RSK_KEY` (same value as the CF worker secret), `CLOUDFLARE_API_TOKEN` (D1-edit scope), `CLOUDFLARE_ACCOUNT_ID`. Optional repo variable `TENGSL_BUDGET`.
3. Run the workflow once with `seed=true` (Actions → Tengslagrunnur → Run workflow) to seed the queue + apply the migration; nightly runs then fill it over ~30–45 nights.
4. DPIA addendum + legal review (leið A → nation-wide scope) before the enriched data is generally shown.

---

## Self-Review

**1. Spec coverage:**
- D1 schema (5 tables + sweep_state) → Task 0. ✅
- Pure parsers (API relationships + owner scrape, PascalCase, person-kt internal) → Task 1. ✅
- Idempotent SQL + seen_first/seen_last history (no deletes) → Task 2. ✅
- Enumeration = nafnaleit sweep (100-cap, adaptive deepen) → Task 3. ✅
- Seeds (Karp files + logbirting + sweep bootstrap) → Task 4. ✅
- Nightly budgeted snowball crawler (API + free owner scrape, discovered→queue, night.sql→wrangler) → Task 5. ✅
- Secret-gated nightly workflow (sleeps without secrets) → Task 6. ✅
- Worker D1-read enrichment through the unchanged `maskaKortSvar`, null-tolerant, person-kt never leaves → Task 7. ✅
- Privacy (mandatory): person-kt internal + masked output test → Task 7 Step 1 + Task 8. ✅
- Blockers (RSK_KEY, CF token/account, d1 create, DPIA) → Task 8 Step 5. ✅
- Out of scope (person pages, shared-directors analysis, paths-between, RSK data subscription) → not implemented. ✅

**2. Placeholder scan:** No TBD/TODO/"add error handling". Every step has literal code/commands. The only intentional placeholder is `database_id` in `wrangler.toml` — explicitly Aron's to fill, flagged in Task 0 Step 3 + Task 8 Step 5.

**3. Type/name consistency:** `personKey` is defined once (Task 1) and used identically in the crawler (Task 5) and matches `eigOwnerKey`. `buildNightSql`'s record shape (`{today, felog, folk, hlutverk, eign, queueDone, queueAdd}`) matches the crawler's `acc` object. `buildSeenLastSql(felagKt, keptHlutverkKeys, keptEignKeys, today)` kept-key form (`person_key|hlutverk`, `eigandi_key|tegund`) matches both the test and the crawler's `keptH`/`keptE`. `tengslGrunnurEnrich(env, out, rotKt)` reads `p._kt` which Task 7 Step 3 threads into `stjornendur`, and strips it unconditionally. D1 SQL column names (`hlutverk.person_key`, `hlutverk.seen_last`, `felog.nafn`) match the schema in Task 0. ✅

**4. Scope:** One coherent subsystem (the grunnur) with phased tasks; each task ends with an independently testable deliverable. Not decomposed further — correct.
