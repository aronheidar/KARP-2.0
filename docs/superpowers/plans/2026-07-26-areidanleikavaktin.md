# Áreiðanleikavaktin (KYC-vöktun v1) — Útfærsluáætlun

> **Fyrir agentíska verkamenn:** NAUÐSYNLEG UNDIR-SKILL: notaðu superpowers:subagent-driven-development (mælt með) eða superpowers:executing-plans til að útfæra þetta plan verk-fyrir-verk. Skref nota gátreiti (`- [ ]`).

**Markmið:** Breyta einskiptis-„Áreiðanleikamatinu" í áframhaldandi KYC-vöktun: Fyrirtæki+ áskrifandi vaktar allt að 100 viðskiptavina-kt; hvert fær sjálf-viðhaldna compliance-möppu (CDD + áhættumat + vöktun 8 merkja + tímamerkt audit-log + PDF).

**Arkitektúr:** Vöktunarlag ofan á núverandi stakk. Hrein, prófanleg diff-vél (`web/src/lib/kyc.mjs`) reiknar breytinga-atburði úr snapshot-samanburði; worker les merki úr D1-grafi (`felog`/`eign`/`hlutverk`) + bökuðum skrám (`sanctions.json`/`pep.json`/`logbirting.json`), keyrir næturlega + tíðari kritíska cron í `scheduled()`, og geymir í 5 nýjum D1-töflum. UI er ný `/areidanleikavaktin`-síða (client-gated `hasTier(3)`).

**Tæknistakkur:** Node 22, `node:test`+`node:assert` (hrein módúl-próf), Cloudflare Worker (`web/worker.js`), D1 (binding `TENGSL`, db `tengsl`), Astro static (client fetch með `credentials:'include'`), PDF um `window.print()`+prent-CSS.

## Global Constraints

- **D1:** binding `env.TENGSL`, database_name `tengsl`. Migration-skipun: `npx wrangler d1 execute tengsl --remote --file web/migrations/0008_kyc.sql` (staðbundið próf: `--local`). ENGIN `wrangler d1 migrations apply` í þessu repo-i.
- **Próf:** `node:test`. Keyrsla: `node --test <skrá.test.mjs>`. Ekkert `test` npm-script; engin D1-mock til → aðeins **hrein módúl** eru einingaprófuð (`web/src/lib/kyc.mjs`). Worker/UI = `node --check web/worker.js` + `npx astro build` + lifandi reyk-próf.
- **Græna hliðið** (keyrt í lok hvers verks sem snertir viðeigandi lag): `npx astro build` (úr `web/`) **+** `node --check web/worker.js` **+** `node --test web/src/lib/kyc.test.mjs`.
- **Réttindi:** allt gate-að server-megin með `_uTier(u,now)==='fyrirtaeki_plus' || u.is_admin` (mirror `topplistaEntitled` `worker.js:2724`); client-megin `hasTier(3)` (`auth.js:190`). Paywall er SLÖKKT → frítt þar til kveikt, ekki breyta því.
- **Einn-notandi (v1):** allar `kyc_watch`/`kyc_audit`/`kyc_ack` fyrirspurnir lykla á `owner_id = readSession(env,request)`. Org/sæta-sameign er fast-follow.
- **Watchlist-þak 100:** mirror `_ktwatchCap` → `{ fyrirtaeki_plus: 100 }`, admin = ótakmarkað (-1). kt normaliserað `String(x).replace(/\D/g,'')`, lengd 10.
- **Engin ytri köll per-kt í cron:** vélin les AÐEINS D1 + bökuð assets (innan Worker subrequest/CPU-marka). Skrif í lotum af 40 (`env.TENGSL.batch`).
- **Varðveisla:** `kyc_audit` er append-only; ALDREI hard-delete (AML 5 ára krafa). „Fjarlægja viðskiptavin" = `kyc_watch.status='archived'`.
- **PEP-fyrirvari:** UI + PDF sýna „Innlend PEP + opinberir refsilistar (OFAC/UN/EU); erlendir PEP-ar takmarkaðir." Aldrei fullyrða fulla alþjóðlega þekju.
- **JSON-svar:** authed endapunktar nota `_ajson(obj)` (`worker.js:2923`). Session um `readSession(env,request)` (skilar `uid` eða `0`, fail-closed).

---

### Task 1: D1 migration — 5 KYC-töflur

**Files:**
- Create: `web/migrations/0008_kyc.sql`

**Interfaces:**
- Produces: töflurnar `kyc_watch`, `kyc_snapshot`, `kyc_event`, `kyc_audit`, `kyc_ack` sem öll síðari verk skrifa/lesa.

- [ ] **Step 1: Skrifa migration**

`web/migrations/0008_kyc.sql`:
```sql
-- 0008_kyc.sql — Áreiðanleikavaktin (KYC-vöktun v1). Sjá spec 2026-07-26.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0008_kyc.sql
-- kyc_watch/kyc_audit/kyc_ack eru PER-EIGANDA (owner_id = users.id). kyc_snapshot/kyc_event eru HNATTRÆN per kt.
CREATE TABLE IF NOT EXISTS kyc_watch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL, kt TEXT NOT NULL, nafn TEXT,
  risk TEXT, risk_reason TEXT, status TEXT DEFAULT 'active',
  added_at INTEGER, reviewed_at INTEGER,
  UNIQUE(owner_id, kt)
);
CREATE INDEX IF NOT EXISTS idx_kycwatch_owner ON kyc_watch(owner_id);
CREATE TABLE IF NOT EXISTS kyc_snapshot (
  kt TEXT NOT NULL, signal TEXT NOT NULL,
  state_hash TEXT, state_json TEXT, computed_at INTEGER,
  PRIMARY KEY (kt, signal)
);
CREATE TABLE IF NOT EXISTS kyc_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kt TEXT NOT NULL, signal TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL,
  detail_json TEXT, detected_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_kycevent_kt ON kyc_event(kt, detected_at);
CREATE TABLE IF NOT EXISTS kyc_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL, kt TEXT NOT NULL, ts INTEGER NOT NULL,
  actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT, detail_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_kycaudit_owner ON kyc_audit(owner_id, kt, ts);
CREATE TABLE IF NOT EXISTS kyc_ack (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL, event_id INTEGER NOT NULL,
  status TEXT DEFAULT 'open', note TEXT, by TEXT, at INTEGER,
  UNIQUE(owner_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_kycack_owner ON kyc_ack(owner_id, status);
```

- [ ] **Step 2: Staðfesta staðbundið að SQL sé gilt og töflur verði til**

Run:
```bash
npx wrangler d1 execute tengsl --local --file web/migrations/0008_kyc.sql
npx wrangler d1 execute tengsl --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kyc_%' ORDER BY name"
```
Expected: engin villa; seinni skipun listar `kyc_ack, kyc_audit, kyc_event, kyc_snapshot, kyc_watch`.

- [ ] **Step 3: Commit**

```bash
git add web/migrations/0008_kyc.sql
git commit -m "KYC v1: D1 migration 0008 (kyc_watch/snapshot/event/audit/ack)"
```

> **Nóta til Arons (handoff):** remote-migration keyrist með OAuth Arons: `npx wrangler d1 execute tengsl --remote --file web/migrations/0008_kyc.sql`.

---

### Task 2: `kyc.mjs` — hrein diff-vél (canon + hash + signalEvents)

**Files:**
- Create: `web/src/lib/kyc.mjs`
- Test: `web/src/lib/kyc.test.mjs`

**Interfaces:**
- Produces:
  - `canon(v) -> string` — stöðug JSON-framsetning (raðaðir lyklar; fylki raðað → mengja-merking, óháð röð).
  - `hash(str) -> string` — FNV-1a 32-bita hex.
  - `signalEvents(signal, prev, cur) -> Array<{kind,severity,detail}>` — `prev`/`cur` eru state-hlutir (eða `null` fyrir `prev` í fyrstu keyrslu → skilar `[]`).
  - `SEVERITY_RANK = {critical:3, high:2, info:1}`.
- Consumes (state-form sem `kycScreenKt` (Task 4) framleiðir):
  - `sanctions {hits:[{name}]}` · `legal {notices:[{ref,type,dags}]}` (`type ∈ bankruptcy|innkollun|nauthungarsala`) · `pep {matches:[{name,nafn?}]}` · `ubo {owners:[{key,nafn,hlutur}]}` · `board {members:[{key,nafn,hlutverk}]}` · `status {stada,gjaldthrot,afskrad,gjaldthol}` · `tax {claims:[{ref}]}` · `media {titles:[{h,title}]}`.

- [ ] **Step 1: Skrifa fallandi próf**

`web/src/lib/kyc.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert';
import { canon, hash, signalEvents, SEVERITY_RANK } from './kyc.mjs';

test('canon er óháð lykla-röð og fylkja-röð', () => {
  assert.equal(canon({ b: 1, a: [2, 1] }), canon({ a: [1, 2], b: 1 }));
});
test('hash er deterministic og breytist við breytingu', () => {
  assert.equal(hash('abc'), hash('abc'));
  assert.notEqual(hash('abc'), hash('abd'));
});
test('signalEvents: prev=null (grunnlína) skilar engum atburðum', () => {
  assert.deepEqual(signalEvents('sanctions', null, { hits: [{ name: 'X' }] }), []);
});
test('signalEvents: nýtt refsilista-hit = critical', () => {
  const ev = signalEvents('sanctions', { hits: [] }, { hits: [{ name: 'Acme' }] });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'sanctions_hit');
  assert.equal(ev[0].severity, 'critical');
  assert.equal(ev[0].detail.name, 'Acme');
});
test('signalEvents: ný gjaldþrota-innköllun = critical', () => {
  const ev = signalEvents('legal', { notices: [] }, { notices: [{ ref: 'L1', type: 'bankruptcy', dags: '2026-07-20' }] });
  assert.equal(ev[0].kind, 'bankruptcy');
  assert.equal(ev[0].severity, 'critical');
});
test('signalEvents: nýr/horfinn UBO = high', () => {
  const add = signalEvents('ubo', { owners: [] }, { owners: [{ key: 'p1', nafn: 'Jón', hlutur: 0.3 }] });
  assert.equal(add[0].kind, 'new_ubo'); assert.equal(add[0].severity, 'high');
  const rem = signalEvents('ubo', { owners: [{ key: 'p1', nafn: 'Jón', hlutur: 0.3 }] }, { owners: [] });
  assert.equal(rem[0].kind, 'removed_ubo');
});
test('signalEvents: status → gjaldþrot = critical bankruptcy', () => {
  const ev = signalEvents('status', { gjaldthrot: 0, afskrad: 0, stada: 'Virkt' }, { gjaldthrot: 1, afskrad: 0, stada: 'Virkt' });
  assert.equal(ev[0].kind, 'bankruptcy'); assert.equal(ev[0].severity, 'critical');
});
test('signalEvents: nýtt PEP-match = high', () => {
  const ev = signalEvents('pep', { matches: [] }, { matches: [{ name: 'Ráðherra' }] });
  assert.equal(ev[0].kind, 'pep_change'); assert.equal(ev[0].severity, 'high');
});
test('SEVERITY_RANK raðar', () => {
  assert.ok(SEVERITY_RANK.critical > SEVERITY_RANK.high && SEVERITY_RANK.high > SEVERITY_RANK.info);
});
```

- [ ] **Step 2: Keyra prófið og staðfesta að það falli**

Run: `node --test web/src/lib/kyc.test.mjs`
Expected: FAIL (`Cannot find module './kyc.mjs'` / export vantar).

- [ ] **Step 3: Skrifa lágmarks-útfærslu**

`web/src/lib/kyc.mjs`:
```js
// kyc.mjs — hrein diff-vél Áreiðanleikavaktarinnar (engin I/O; einingaprófuð). Sjá spec 2026-07-26.
export const SEVERITY_RANK = { critical: 3, high: 2, info: 1 };

export function canon(v) {
  if (Array.isArray(v)) { const a = v.map(canon); a.sort(); return '[' + a.join(',') + ']'; }
  if (v && typeof v === 'object') { return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'; }
  return JSON.stringify(v === undefined ? null : v);
}
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const _key = (list, kf) => new Map((list || []).map((it) => [kf(it), it]));
const _added = (prev, cur, kf) => { const p = _key(prev, kf); return (cur || []).filter((it) => !p.has(kf(it))); };
const _removed = (prev, cur, kf) => { const c = _key(cur, kf); return (prev || []).filter((it) => !c.has(kf(it))); };

// prev===null => grunnlína, engin breyting.
export function signalEvents(signal, prev, cur) {
  if (prev == null) return [];
  cur = cur || {};
  const ev = [];
  if (signal === 'sanctions') {
    for (const h of _added(prev.hits, cur.hits, (x) => x.name)) ev.push({ kind: 'sanctions_hit', severity: 'critical', detail: h });
  } else if (signal === 'legal') {
    for (const n of _added(prev.notices, cur.notices, (x) => x.ref)) ev.push({ kind: (n.type || 'legal'), severity: 'critical', detail: n });
  } else if (signal === 'pep') {
    for (const m of _added(prev.matches, cur.matches, (x) => x.name)) ev.push({ kind: 'pep_change', severity: 'high', detail: m });
  } else if (signal === 'ubo') {
    for (const o of _added(prev.owners, cur.owners, (x) => x.key)) ev.push({ kind: 'new_ubo', severity: 'high', detail: o });
    for (const o of _removed(prev.owners, cur.owners, (x) => x.key)) ev.push({ kind: 'removed_ubo', severity: 'high', detail: o });
  } else if (signal === 'board') {
    for (const b of _added(prev.members, cur.members, (x) => x.key + '|' + x.hlutverk)) ev.push({ kind: 'board_change', severity: 'info', detail: { ...b, breyting: 'baett_vid' } });
    for (const b of _removed(prev.members, cur.members, (x) => x.key + '|' + x.hlutverk)) ev.push({ kind: 'board_change', severity: 'info', detail: { ...b, breyting: 'horfid' } });
  } else if (signal === 'status') {
    if (cur.gjaldthrot && !prev.gjaldthrot) ev.push({ kind: 'bankruptcy', severity: 'critical', detail: { stada: cur.stada } });
    if (cur.afskrad && !prev.afskrad) ev.push({ kind: 'status_change', severity: 'high', detail: { afskrad: 1, stada: cur.stada } });
    else if (cur.stada !== prev.stada) ev.push({ kind: 'status_change', severity: 'high', detail: { stada: cur.stada, adur: prev.stada } });
  } else if (signal === 'tax') {
    for (const c of _added(prev.claims, cur.claims, (x) => x.ref)) ev.push({ kind: 'tax_claim', severity: 'high', detail: c });
  } else if (signal === 'media') {
    for (const t of _added(prev.titles, cur.titles, (x) => x.h)) ev.push({ kind: 'adverse_media', severity: 'info', detail: t });
  }
  return ev;
}
```

- [ ] **Step 4: Keyra prófið og staðfesta grænt**

Run: `node --test web/src/lib/kyc.test.mjs`
Expected: PASS (öll próf græn).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/kyc.mjs web/src/lib/kyc.test.mjs
git commit -m "KYC v1: hrein diff-vel (canon/hash/signalEvents) + prof"
```

---

### Task 3: `kyc.mjs` — `deriveRisk` (áhættumat)

**Files:**
- Modify: `web/src/lib/kyc.mjs`
- Test: `web/src/lib/kyc.test.mjs`

**Interfaces:**
- Produces: `deriveRisk(states) -> 'Lág'|'Venjuleg'|'Há'` þar sem `states = { sanctions, legal, pep, status, tax, media, ... }` (state-hlutir eins og í Task 2).

- [ ] **Step 1: Bæta við fallandi prófum**

Bæta neðst í `web/src/lib/kyc.test.mjs`:
```js
import { deriveRisk } from './kyc.mjs';
test('deriveRisk: refsilisti eða gjaldþrot = Há', () => {
  assert.equal(deriveRisk({ sanctions: { hits: [{ name: 'X' }] } }), 'Há');
  assert.equal(deriveRisk({ status: { gjaldthrot: 1 } }), 'Há');
});
test('deriveRisk: PEP eða neikvæð media = Venjuleg', () => {
  assert.equal(deriveRisk({ pep: { matches: [{ name: 'P' }] } }), 'Venjuleg');
  assert.equal(deriveRisk({ media: { titles: [{ h: '1' }] } }), 'Venjuleg');
});
test('deriveRisk: ekkert = Lág', () => {
  assert.equal(deriveRisk({ status: { gjaldthrot: 0 } }), 'Lág');
  assert.equal(deriveRisk({}), 'Lág');
});
```

- [ ] **Step 2: Keyra og staðfesta fall**

Run: `node --test web/src/lib/kyc.test.mjs`
Expected: FAIL (`deriveRisk is not a function`).

- [ ] **Step 3: Bæta útfærslu í `kyc.mjs`**

Bæta neðst í `web/src/lib/kyc.mjs`:
```js
export function deriveRisk(s) {
  s = s || {};
  const L = (sig) => s[sig] || {};
  if ((L('sanctions').hits || []).length || L('status').gjaldthrot ||
      (L('legal').notices || []).some((n) => n.type === 'bankruptcy')) return 'Há';
  if ((L('pep').matches || []).length || (L('tax').claims || []).length || L('status').afskrad ||
      (L('legal').notices || []).length || (L('media').titles || []).length) return 'Venjuleg';
  return 'Lág';
}
```

- [ ] **Step 4: Keyra og staðfesta grænt**

Run: `node --test web/src/lib/kyc.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/kyc.mjs web/src/lib/kyc.test.mjs
git commit -m "KYC v1: deriveRisk ahaettumat + prof"
```

---

### Task 4: Worker — skimun & merkja-lesari (`kycPepIndex`, `kycScreenKt`)

**Files:**
- Modify: `web/worker.js` (bæta við nálægt `sanctionsIndex` ~L2439; endurnýta `augGet`, `sancNorm`, `_uTier`).

**Interfaces:**
- Consumes: `sanctionsIndex(env)`, `sancNorm(s)` (`worker.js:2438-2453`), `augGet(env,'pep.json')`, D1 `felog/folk/eign/hlutverk`.
- Produces:
  - `kycPepIndex(env) -> Map<normNafn, {nafn, tegund}>` (mirror `sanctionsIndex`, hleður `pep.json`).
  - `async kycScreenKt(env, kt) -> { ubo, board, sanctions, pep, status, legal, tax, media }` (state-hlutir í forminu sem `signalEvents`/`deriveRisk` (Task 2/3) neyta).

- [ ] **Step 1: Skrifa `kycPepIndex` + `kycScreenKt` í `worker.js`**

Bæta (t.d. rétt á eftir `sanctionsHandler`, ~L2464). Athugið að `pep.json` er nafn-lyklað; `eigNorm`-ígildi = `sancNorm` (lowercase + NFD strip):
```js
// ── Áreiðanleikavaktin: server-hlið skimun + merkja-lesari (v1) ──
let KYC_PEP_IDX = null;
async function kycPepIndex(env) {
  if (KYC_PEP_IDX) return KYC_PEP_IDX;
  const idx = new Map();
  const arr = await augGet(env, 'pep.json').catch(() => null);
  for (const p of (Array.isArray(arr) ? arr : (arr?.pep || arr?.results || []))) {
    const nafn = p.nafn || p.name || p.fulltNafn; if (!nafn) continue;
    idx.set(sancNorm(nafn), { nafn, tegund: p.tegund || p.embaetti || 'PEP' });
  }
  KYC_PEP_IDX = idx; return idx;
}
async function _kycNames(env, kt) {
  // Nöfn sem eru skimuð: félagið sjálft + virkir eigendur + virk stjórn (RCA v1 = beinir tengdir).
  const felag = await env.TENGSL.prepare('SELECT nafn,stada,gjaldthrot,afskrad,gjaldthol FROM felog WHERE kt=?').bind(kt).first().catch(() => null);
  const owners = (await env.TENGSL.prepare(
    "SELECT e.eigandi_key AS key, e.hlutur AS hlutur, COALESCE(p.nafn,f.nafn,e.eigandi_key) AS nafn " +
    "FROM eign e LEFT JOIN folk p ON p.person_key=e.eigandi_key LEFT JOIN felog f ON f.kt=e.eigandi_key " +
    "WHERE e.felag_kt=? AND e.seen_last IS NULL").bind(kt).all().catch(() => ({ results: [] }))).results || [];
  const board = (await env.TENGSL.prepare(
    "SELECT h.person_key AS key, h.hlutverk AS hlutverk, COALESCE(p.nafn,h.person_key) AS nafn " +
    "FROM hlutverk h LEFT JOIN folk p ON p.person_key=h.person_key " +
    "WHERE h.felag_kt=? AND h.seen_last IS NULL").bind(kt).all().catch(() => ({ results: [] }))).results || [];
  return { felag, owners, board };
}
async function kycScreenKt(env, kt) {
  const { felag, owners, board } = await _kycNames(env, kt);
  const nameList = [felag?.nafn, ...owners.map((o) => o.nafn), ...board.map((b) => b.nafn)].filter(Boolean);
  // sanctions
  const sIdx = await sanctionsIndex(env);
  const sHits = [];
  for (const nm of nameList) { const m = sIdx.get(sancNorm(nm)); if (m) sHits.push({ name: nm }); }
  // pep
  const pIdx = await kycPepIndex(env);
  const pMatches = [];
  for (const nm of nameList) { const m = pIdx.get(sancNorm(nm)); if (m) pMatches.push({ name: nm, tegund: m.tegund }); }
  // legal (Lögbirting) — bökuð, kt-lyklað
  const lb = await augGet(env, 'logbirting.json').catch(() => null);
  const notices = [];
  const lbRows = Array.isArray(lb) ? lb : (lb?.faerslur || lb?.results || []);
  for (const r of lbRows) {
    if (String(r.kt || '').replace(/\D/g, '') !== kt) continue;
    const teg = /gjaldþrot|þrotabú|bankrupt/i.test(r.tegund || r.flokkur || '') ? 'bankruptcy'
      : /innköllun/i.test(r.tegund || '') ? 'innkollun'
        : /nauðung/i.test(r.tegund || '') ? 'nauthungarsala' : 'legal';
    notices.push({ ref: String(r.id || r.ref || (r.dags + '|' + (r.tegund || ''))), type: teg, dags: r.dags || r.date || '' });
  }
  // media (íhaldssamt: nákvæmt nafn-token match í sentiment.json titlum; info-only)
  const titles = [];
  const sent = await augGet(env, 'sentiment.json').catch(() => null);
  const felagNafn = (felag?.nafn || '').trim();
  if (felagNafn.length >= 4) {
    const rows = Array.isArray(sent) ? sent : (sent?.results || sent?.greinar || []);
    for (const a of rows) {
      const t = a.title || a.titill || ''; if (!t) continue;
      if ((a.sent ?? a.sentiment ?? 0) < 0 && t.includes(felagNafn)) titles.push({ h: hashOf(t), title: t.slice(0, 200) });
    }
  }
  return {
    ubo: { owners: owners.map((o) => ({ key: o.key, nafn: o.nafn, hlutur: o.hlutur })) },
    board: { members: board.map((b) => ({ key: b.key, nafn: b.nafn, hlutverk: b.hlutverk })) },
    sanctions: { hits: sHits },
    pep: { matches: pMatches },
    status: { stada: felag?.stada || '', gjaldthrot: felag?.gjaldthrot || 0, afskrad: felag?.afskrad || 0, gjaldthol: felag?.gjaldthol || 0 },
    legal: { notices },
    tax: { claims: [] }, // v1: engin áreiðanleg vanskilaskrá (bíður leyfis #36) — stubbur, engin atburðamyndun.
    media: { titles },
  };
}
```

Bæta líka litlum hash-hjálpara efst hjá öðrum util-um (ef `hashOf` er ekki til — annars sleppa):
```js
function hashOf(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }
```

- [ ] **Step 2: Staðfesta að worker þáttist**

Run: `node --check web/worker.js`
Expected: engin villa (exit 0).

- [ ] **Step 3: Lifandi reyk-próf (staðbundinn worker)**

Bæta TÍMABUNDINNI debug-línu efst í dispatch (`~L3976`), keyra `npx wrangler dev`, kalla á þekkt kt, fjarlægja línuna svo aftur:
```js
if (url.pathname === '/api/kyc/_smoke') return _ajson(await kycScreenKt(env, new URL(request.url).searchParams.get('kt') || ''));
```
Run: `npx wrangler dev` → í öðrum skel: `curl "http://localhost:8787/api/kyc/_smoke?kt=<þekkt-kt>"`.
Expected: JSON með 8 merkja-lyklum; `status.stada` fyllt fyrir raun-kt. **Fjarlægja debug-línuna** fyrir commit.

- [ ] **Step 4: Commit**

```bash
git add web/worker.js
git commit -m "KYC v1: server-hlid skimun (kycPepIndex) + merkja-lesari (kycScreenKt)"
```

---

### Task 5: Worker — `/api/kyc/watch` (GET/POST/DELETE)

**Files:**
- Modify: `web/worker.js` (nýr `kycHandler` + dispatch-línur).

**Interfaces:**
- Consumes: `readSession`, `_ajson`, `_uTier`, `kycScreenKt`, `canon`/`hash` (import úr `./src/lib/kyc.mjs`), töflur úr Task 1.
- Produces: `kycHandler(request, env, ctx)` sem meðhöndlar `/api/kyc/watch`; `_kycGate(u,now)`; `_kycWatchCap(u,now)`.

- [ ] **Step 1: Bæta import + gate + cap efst í worker (nálægt öðrum importum/hjálpurum)**

```js
import { canon as kycCanon, hash as kycHash, signalEvents as kycSignalEvents, deriveRisk as kycDeriveRisk, SEVERITY_RANK as KYC_SEV } from './src/lib/kyc.mjs';
const KYC_SIGNALS = ['ubo', 'board', 'sanctions', 'pep', 'status', 'legal', 'tax', 'media'];
const _kycGate = (u, now) => !!(u && (u.is_admin === 1 || (u.tier === 'fyrirtaeki_plus' && u.tier_until > now)));
const _kycWatchCap = (u, now) => (u.is_admin === 1 ? -1 : (u.tier === 'fyrirtaeki_plus' && u.tier_until > now ? 100 : 0));
```

- [ ] **Step 2: Skrifa `kycHandler` (watch-hluti) + hjálparann `_kycSnapshotWrite`**

```js
async function _kycSnapshotWrite(env, kt, states, ts) {
  const stmts = [];
  const p = env.TENGSL.prepare('INSERT INTO kyc_snapshot (kt,signal,state_hash,state_json,computed_at) VALUES (?,?,?,?,?) ON CONFLICT(kt,signal) DO UPDATE SET state_hash=excluded.state_hash, state_json=excluded.state_json, computed_at=excluded.computed_at');
  for (const sig of KYC_SIGNALS) { const st = states[sig] || {}; const j = kycCanon(st); stmts.push(p.bind(kt, sig, kycHash(j), j, ts)); }
  for (let i = 0; i < stmts.length; i += 40) await env.TENGSL.batch(stmts.slice(i, i + 40)).catch(() => {});
}
async function kycHandler(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/kyc/, '');
  const uid = await readSession(env, request);
  const now = Math.floor(Date.now() / 1000);
  if (!uid) return _ajson({ ok: false, error: 'login' }, { status: 401 });
  const u = await env.TENGSL.prepare('SELECT id,email,is_admin,tier,tier_until FROM users WHERE id=?').bind(uid).first().catch(() => null);
  if (!_kycGate(u, now)) return _ajson({ ok: false, error: 'tier' }, { status: 403 });
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (path === '/watch') {
    if (request.method === 'GET') {
      const rows = (await env.TENGSL.prepare(
        "SELECT w.kt,w.nafn,w.risk,w.status,w.reviewed_at, (SELECT COUNT(*) FROM kyc_ack a JOIN kyc_event e ON e.id=a.event_id WHERE a.owner_id=w.owner_id AND e.kt=w.kt AND a.status='open') AS opnar " +
        "FROM kyc_watch w WHERE w.owner_id=? AND w.status='active' ORDER BY w.added_at DESC").bind(uid).all().catch(() => ({ results: [] }))).results || [];
      return _ajson({ ok: true, cap: _kycWatchCap(u, now), watch: rows });
    }
    if (request.method === 'POST') {
      const kt = String(body.kt || '').replace(/\D/g, '');
      if (kt.length !== 10) return _ajson({ ok: false, error: 'kt' });
      const cap = _kycWatchCap(u, now);
      const cnt = (await env.TENGSL.prepare("SELECT COUNT(*) AS n FROM kyc_watch WHERE owner_id=? AND status='active'").bind(uid).first().catch(() => ({ n: 0 }))).n || 0;
      const exists = await env.TENGSL.prepare('SELECT id,status FROM kyc_watch WHERE owner_id=? AND kt=?').bind(uid, kt).first().catch(() => null);
      if (!exists && cap >= 0 && cnt >= cap) return _ajson({ ok: false, error: 'cap', cap });
      // Upphafs-CDD: skima strax, geyma grunnlínu-snapshot, skrá initial_cdd.
      const states = await kycScreenKt(env, kt);
      const risk = kycDeriveRisk(states);
      const felagNafn = states.status?.nafn || (await env.TENGSL.prepare('SELECT nafn FROM felog WHERE kt=?').bind(kt).first().catch(() => null))?.nafn || kt;
      await env.TENGSL.prepare('INSERT INTO kyc_watch (owner_id,kt,nafn,risk,status,added_at,reviewed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_id,kt) DO UPDATE SET status=\'active\', reviewed_at=excluded.reviewed_at')
        .bind(uid, kt, felagNafn, risk, 'active', now, now).run().catch(() => {});
      await _kycSnapshotWrite(env, kt, states, now);
      const findings = { sanctions: (states.sanctions.hits || []).length, pep: (states.pep.matches || []).length, gjaldthrot: states.status.gjaldthrot ? 1 : 0, risk };
      await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)')
        .bind(uid, kt, now, u.email || String(uid), 'initial_cdd', 'Upphafleg áreiðanleikakönnun', JSON.stringify(findings)).run().catch(() => {});
      return _ajson({ ok: true, kt, nafn: felagNafn, risk });
    }
    if (request.method === 'DELETE') {
      const kt = String((url.searchParams.get('kt') || body.kt || '')).replace(/\D/g, '');
      await env.TENGSL.prepare("UPDATE kyc_watch SET status='archived' WHERE owner_id=? AND kt=?").bind(uid, kt).run().catch(() => {});
      await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)')
        .bind(uid, kt, now, u.email || String(uid), 'note', 'Viðskiptavinur færður í geymslu (archived)', '{}').run().catch(() => {});
      return _ajson({ ok: true });
    }
  }
  return _ajson({ ok: false, error: 'notfound' }, { status: 404 });
}
```

- [ ] **Step 3: Skrá dispatch-línu** (nálægt hinum `/api/...` línunum, ~L3990):
```js
    if (url.pathname.startsWith('/api/kyc/')) return kycHandler(request, env, ctx);
```

- [ ] **Step 4: Staðfesta þáttun + lifandi reyk-próf**

Run: `node --check web/worker.js`
Expected: exit 0.
Svo `npx wrangler dev` og (innskráður-cookie, eða admin-token skv. verkefnis-venju):
```bash
curl -X POST "http://localhost:8787/api/kyc/watch" -H "content-type: application/json" --cookie "karp_session=<gilt>" -d '{"kt":"<þekkt-kt>"}'
curl "http://localhost:8787/api/kyc/watch" --cookie "karp_session=<gilt>"
```
Expected: POST skilar `{ok:true,kt,nafn,risk}`; GET listar kt með `risk` + `opnar:0`. Án `fyrirtaeki_plus` → `{ok:false,error:'tier'}` (403).

- [ ] **Step 5: Commit**

```bash
git add web/worker.js
git commit -m "KYC v1: /api/kyc/watch (owner-keyed, cap 100, hasTier3, upphafs-CDD)"
```

---

### Task 6: Worker — `/api/kyc/file`, `/risk`, `/ack`, `/note`, `/rescreen`

**Files:**
- Modify: `web/worker.js` (víkka `kycHandler`).

**Interfaces:**
- Consumes: sömu hjálpara og Task 5.
- Produces: viðbótar-path-greinar í `kycHandler` sem skila möppu + skrá `kyc_audit`.

- [ ] **Step 1: Bæta path-greinum í `kycHandler`** (á undan lokal `return _ajson({ok:false,error:'notfound'},...)`):
```js
  if (path === '/file') {
    const kt = String(url.searchParams.get('kt') || '').replace(/\D/g, '');
    const w = await env.TENGSL.prepare('SELECT kt,nafn,risk,risk_reason,status,added_at,reviewed_at FROM kyc_watch WHERE owner_id=? AND kt=?').bind(uid, kt).first().catch(() => null);
    if (!w) return _ajson({ ok: false, error: 'notfound' }, { status: 404 });
    const snaps = (await env.TENGSL.prepare('SELECT signal,state_json,computed_at FROM kyc_snapshot WHERE kt=?').bind(kt).all().catch(() => ({ results: [] }))).results || [];
    const states = {}; for (const s of snaps) { try { states[s.signal] = JSON.parse(s.state_json); } catch (e) {} }
    const audit = (await env.TENGSL.prepare('SELECT ts,actor,action,summary,detail_json FROM kyc_audit WHERE owner_id=? AND kt=? ORDER BY ts DESC LIMIT 200').bind(uid, kt).all().catch(() => ({ results: [] }))).results || [];
    const events = (await env.TENGSL.prepare(
      "SELECT e.id,e.signal,e.kind,e.severity,e.detail_json,e.detected_at, COALESCE(a.status,'open') AS ack " +
      "FROM kyc_event e LEFT JOIN kyc_ack a ON a.event_id=e.id AND a.owner_id=? " +
      "WHERE e.kt=? ORDER BY e.detected_at DESC LIMIT 100").bind(uid, kt).all().catch(() => ({ results: [] }))).results || [];
    return _ajson({ ok: true, watch: w, states, audit, events });
  }
  if (request.method === 'POST' && path === '/risk') {
    const kt = String(body.kt || '').replace(/\D/g, ''); const risk = String(body.risk || ''); const reason = String(body.reason || '').slice(0, 500);
    if (!['Lág', 'Venjuleg', 'Há'].includes(risk)) return _ajson({ ok: false, error: 'risk' });
    await env.TENGSL.prepare('UPDATE kyc_watch SET risk=?, risk_reason=?, reviewed_at=? WHERE owner_id=? AND kt=?').bind(risk, reason, now, uid, kt).run().catch(() => {});
    await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(uid, kt, now, u.email || String(uid), 'risk_set', 'Áhætturating: ' + risk, JSON.stringify({ risk, reason })).run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (request.method === 'POST' && path === '/ack') {
    const eid = parseInt(body.event_id, 10); const status = ['resolved', 'dismissed', 'open'].includes(body.status) ? body.status : 'resolved';
    const ev = await env.TENGSL.prepare('SELECT kt FROM kyc_event WHERE id=?').bind(eid).first().catch(() => null);
    if (!ev) return _ajson({ ok: false, error: 'event' });
    await env.TENGSL.prepare('INSERT INTO kyc_ack (owner_id,event_id,status,note,by,at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_id,event_id) DO UPDATE SET status=excluded.status, note=excluded.note, by=excluded.by, at=excluded.at')
      .bind(uid, eid, status, String(body.note || '').slice(0, 500), u.email || String(uid), now).run().catch(() => {});
    await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(uid, ev.kt, now, u.email || String(uid), 'ack', 'Viðvörun ' + status, JSON.stringify({ event_id: eid, status })).run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (request.method === 'POST' && path === '/note') {
    const kt = String(body.kt || '').replace(/\D/g, ''); const note = String(body.note || '').slice(0, 1000);
    if (!note) return _ajson({ ok: false, error: 'empty' });
    await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(uid, kt, now, u.email || String(uid), 'note', note, '{}').run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (request.method === 'POST' && path === '/rescreen') {
    const kt = String(body.kt || '').replace(/\D/g, '');
    const states = await kycScreenKt(env, kt);
    await _kycSnapshotWrite(env, kt, states, now); // athugið: rescreen uppfærir grunnlínu (handvirk endurskoðun, ekki cron-diff)
    const risk = kycDeriveRisk(states);
    await env.TENGSL.prepare('UPDATE kyc_watch SET reviewed_at=? WHERE owner_id=? AND kt=?').bind(now, uid, kt).run().catch(() => {});
    await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(uid, kt, now, u.email || String(uid), 'screening', 'Handvirk endurskimun', JSON.stringify({ risk, sanctions: states.sanctions.hits.length, pep: states.pep.matches.length })).run().catch(() => {});
    return _ajson({ ok: true, risk });
  }
```

- [ ] **Step 2: Þáttun + lifandi reyk-próf**

Run: `node --check web/worker.js` → exit 0.
`npx wrangler dev`, svo:
```bash
curl "http://localhost:8787/api/kyc/file?kt=<kt>" --cookie "karp_session=<gilt>"
curl -X POST "http://localhost:8787/api/kyc/risk" -H "content-type: application/json" --cookie "karp_session=<gilt>" -d '{"kt":"<kt>","risk":"Há","reason":"prufa"}'
```
Expected: `/file` skilar `{watch,states,audit,events}` (audit inniheldur `initial_cdd`); `/risk` skilar `{ok:true}` og bætir `risk_set` í audit.

- [ ] **Step 3: Commit**

```bash
git add web/worker.js
git commit -m "KYC v1: /api/kyc/file|risk|ack|note|rescreen (compliance-mappa + audit)"
```

---

### Task 7: Worker — vöktunar-cron (`kycDiffCron`, `kycCriticalCron`) + `scheduled()` + wrangler

**Files:**
- Modify: `web/worker.js` (cron-föll + `scheduled()`-grein).
- Modify: `web/wrangler.toml` (nýr daglegur cron).

**Interfaces:**
- Consumes: `kycScreenKt`, `_kycSnapshotWrite`, `kycSignalEvents`, `kycDeriveRisk`, `KYC_SIGNALS`, Gmail-send hjálpari verkefnisins (sami og `digestRun` notar).
- Produces: `kycDiffCron(env)` (öll merki), `kycCriticalCron(env)` (aðeins `sanctions`+`legal`).

- [ ] **Step 1: Skrifa cron-föllin** (nálægt `newsIngest`/`frettavaktCron`):
```js
async function _kycRunDiff(env, kt, onlySignals) {
  const now = Math.floor(Date.now() / 1000);
  const states = await kycScreenKt(env, kt);
  const prevRows = (await env.TENGSL.prepare('SELECT signal,state_json FROM kyc_snapshot WHERE kt=?').bind(kt).all().catch(() => ({ results: [] }))).results || [];
  const prev = {}; for (const r of prevRows) { try { prev[r.signal] = JSON.parse(r.state_json); } catch (e) {} }
  const sigs = onlySignals || KYC_SIGNALS;
  const evStmt = env.TENGSL.prepare('INSERT INTO kyc_event (kt,signal,kind,severity,detail_json,detected_at) VALUES (?,?,?,?,?,?)');
  const snapStmt = env.TENGSL.prepare('INSERT INTO kyc_snapshot (kt,signal,state_hash,state_json,computed_at) VALUES (?,?,?,?,?) ON CONFLICT(kt,signal) DO UPDATE SET state_hash=excluded.state_hash, state_json=excluded.state_json, computed_at=excluded.computed_at');
  const writes = []; const newEvents = [];
  for (const sig of sigs) {
    const cur = states[sig] || {};
    const evs = kycSignalEvents(sig, Object.prototype.hasOwnProperty.call(prev, sig) ? prev[sig] : null, cur);
    for (const e of evs) { writes.push(evStmt.bind(kt, sig, e.kind, e.severity, JSON.stringify(e.detail || {}), now)); newEvents.push(e); }
    const j = kycCanon(cur); writes.push(snapStmt.bind(kt, sig, kycHash(j), j, now));
  }
  for (let i = 0; i < writes.length; i += 40) await env.TENGSL.batch(writes.slice(i, i + 40)).catch(() => {});
  return { newEvents, risk: kycDeriveRisk(states) };
}
async function _kycOwnersOf(env, kt) {
  return ((await env.TENGSL.prepare("SELECT DISTINCT owner_id FROM kyc_watch WHERE kt=? AND status='active'").bind(kt).all().catch(() => ({ results: [] }))).results || []).map((r) => r.owner_id);
}
async function _kycAfterEvents(env, kt, res, critical) {
  if (!res.newEvents.length) return;
  const now = Math.floor(Date.now() / 1000);
  const owners = await _kycOwnersOf(env, kt);
  for (const oid of owners) {
    const stmts = [];
    for (const e of res.newEvents) {
      stmts.push(env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(oid, kt, now, 'system', 'change_detected', e.kind, JSON.stringify(e.detail || {})));
    }
    for (let i = 0; i < stmts.length; i += 40) await env.TENGSL.batch(stmts.slice(i, i + 40)).catch(() => {});
    // opnar viðvaranir eru sóttar úr kyc_event↔kyc_ack (default 'open'); kritísk merki senda strax póst.
    if (critical) {
      const crit = res.newEvents.filter((e) => e.severity === 'critical');
      if (crit.length) { const em = (await env.TENGSL.prepare('SELECT email FROM users WHERE id=?').bind(oid).first().catch(() => null))?.email; if (em) await kycSendAlert(env, em, kt, crit).catch(() => {}); }
    }
  }
}
async function kycDiffCron(env) {
  const kts = ((await env.TENGSL.prepare("SELECT DISTINCT kt FROM kyc_watch WHERE status='active'").all().catch(() => ({ results: [] }))).results || []).map((r) => r.kt);
  for (const kt of kts) { const res = await _kycRunDiff(env, kt, null).catch(() => ({ newEvents: [] })); await _kycAfterEvents(env, kt, res, false).catch(() => {}); }
}
async function kycCriticalCron(env) {
  const kts = ((await env.TENGSL.prepare("SELECT DISTINCT kt FROM kyc_watch WHERE status='active'").all().catch(() => ({ results: [] }))).results || []).map((r) => r.kt);
  for (const kt of kts) { const res = await _kycRunDiff(env, kt, ['sanctions', 'legal']).catch(() => ({ newEvents: [] })); await _kycAfterEvents(env, kt, res, true).catch(() => {}); }
}
```

- [ ] **Step 2: Skrifa `kycSendAlert`** — endurnýta `sendGmail(env, { to, subject, text })` (`worker.js:3067`, sama sendileið og `digestRun`; secret-gated → brotnar ekki án Gmail-secrets):
```js
async function kycSendAlert(env, email, kt, crit) {
  const lines = crit.map((e) => '• ' + e.kind + (e.detail?.name ? ' — ' + e.detail.name : '')).join('\n');
  const subject = 'Áreiðanleikavaktin: kritísk breyting (' + kt + ')';
  const text = 'Kritísk vöktunar-breyting á vöktuðu félagi ' + kt + ':\n\n' + lines + '\n\nSkoðaðu möppuna: https://karp.is/areidanleikavaktin/?kt=' + kt;
  await sendGmail(env, { to: email, subject, text }); // sendGmail (worker.js:3067) er secret-gated: skilar {unconfigured:true} án Gmail-secrets, brotnar ekki.
}
```

- [ ] **Step 3: Bæta cron-greinum í `scheduled()`** (`worker.js:3955`):
```js
  async scheduled(event, env, ctx) {
    if (event.cron === '10 8 * * 1') ctx.waitUntil(digestRun(env));
    else if (event.cron === '30 6 * * *') ctx.waitUntil(kycDiffCron(env));
    else ctx.waitUntil(newsIngest(env).then(() => frettavaktCron(env)).then(() => kycCriticalCron(env)));
  },
```

- [ ] **Step 4: Bæta daglega cron í `web/wrangler.toml`** (`[triggers]` ~L18):
```toml
crons = ["10 8 * * 1", "0 */3 * * *", "30 6 * * *"]
```

- [ ] **Step 5: Þáttun + þurrkeyrsla**

Run:
```bash
node --check web/worker.js
npx wrangler deploy --dry-run
```
Expected: bæði án villu; dry-run sýnir 3 crons.
Valfrjálst lifandi: `npx wrangler dev`, kalla debug-route sem keyrir `kycDiffCron(env)` einu sinni yfir 1 vaktað kt (bæta+fjarlægja tímabundið), staðfesta að `kyc_event`/`kyc_audit` fyllist við tilbúna breytingu.

- [ ] **Step 6: Commit**

```bash
git add web/worker.js web/wrangler.toml
git commit -m "KYC v1: voktunar-cron (kycDiffCron daglega + kycCriticalCron 3h) + scheduled"
```

---

### Task 8: UI — `/areidanleikavaktin` portfolio-yfirlit + tengill úr Mitt svæði

**Files:**
- Create: `web/src/pages/areidanleikavaktin.astro`
- Modify: `web/src/pages/mitt-svaedi.astro` (bæta korti/tengli í mælaborð, gated `hasTier(3)`).

**Interfaces:**
- Consumes: `/api/kyc/watch` (GET/POST/DELETE), `hasTier` úr `auth.js`.
- Produces: síðan `/areidanleikavaktin/` (portfolio + „bæta við"), drill-in kemur í Task 9.

- [ ] **Step 1: Skrifa síðuna** `web/src/pages/areidanleikavaktin.astro` (fylgja mynstri `kvotavaktin.astro`: Layout + client-gated):
```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="Áreiðanleikavaktin — KYC-vöktun | Karp+" description="Áframhaldandi KYC-vöktun viðskiptavina: eigenda-, refsilista-, PEP- og gjaldþrota-vakt með audit-slóð." canonical="https://karp.is/areidanleikavaktin/">
  <main class="kv-wrap" data-pg="areidanleikavaktin">
    <p class="kicker">Karp+ · Fyrirtæki+</p>
    <h1>Áreiðanleikavaktin</h1>
    <p class="lead">Vaktaðu viðskiptavini yfir 8 merki — eigendur, stjórn, refsilistar, PEP, gjaldþrot, staða, skattkröfur, fjölmiðla — með sjálf-viðhaldinni compliance-möppu og audit-slóð.</p>
    <p class="pep-note">ⓘ Innlend PEP + opinberir refsilistar (OFAC/UN/EU). Erlendir PEP-ar takmarkaðir í þessari útgáfu.</p>

    <div id="kv-gate" hidden><p>Þessi vakt er hluti af <a href="/karp-pro/#verd">Fyrirtæki+</a> þrepinu.</p></div>

    <section id="kv-app" hidden>
      <form id="kv-add" class="kv-add"><input id="kv-kt" placeholder="Kennitala viðskiptavinar…" inputmode="numeric" aria-label="Kennitala" /><button type="submit">Bæta við vöktun</button><span id="kv-cap" class="kv-cap"></span></form>
      <div id="kv-msg" class="kv-msg" hidden></div>
      <table class="kv-tbl"><thead><tr><th>Viðskiptavinur</th><th>Áhætta</th><th>Opnar viðv.</th><th>Síðast skimað</th><th></th></tr></thead><tbody id="kv-rows"></tbody></table>
      <p id="kv-empty" class="kv-empty" hidden>Engir viðskiptavinir í vöktun enn — bættu við kennitölu að ofan.</p>
    </section>
  </main>

  <style>
    .kv-wrap { max-width: 900px; margin: 0 auto; padding: 44px 20px 64px; }
    .kicker { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); margin: 0 0 4px; }
    h1 { font-size: 30px; margin: 0 0 10px; }
    .lead { color: var(--ink); }
    .pep-note { font-size: 13px; color: var(--muted); background: rgba(255,255,255,.04); border-left: 3px solid #f6b13b; padding: 8px 12px; border-radius: 0 8px 8px 0; }
    .kv-add { display: flex; gap: 8px; margin: 18px 0 6px; flex-wrap: wrap; }
    .kv-add input { flex: 1; min-width: 220px; padding: 11px 13px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); }
    .kv-add button { padding: 11px 18px; border-radius: 10px; border: 0; background: var(--gold); color: #1a1205; font-weight: 700; cursor: pointer; }
    .kv-cap { align-self: center; font-size: 12px; color: var(--faint); }
    .kv-msg { font-size: 13px; margin: 6px 0; padding: 8px 12px; border-radius: 8px; background: rgba(255,109,122,.12); color: #ff9aa4; }
    .kv-tbl { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 12px; }
    .kv-tbl th, .kv-tbl td { text-align: left; padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .kv-tbl th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--faint); }
    .risk-Há { color: #ff6d7a; font-weight: 700; } .risk-Venjuleg { color: #f6b13b; } .risk-Lág { color: #46e08a; }
    .kv-empty { color: var(--muted); margin-top: 14px; }
    .kv-rm { background: none; border: 0; color: var(--faint); cursor: pointer; }
    .kv-open { background: #ff6d7a; color: #1a1205; border-radius: 999px; padding: 1px 8px; font-weight: 700; font-size: 12px; }
  </style>

  <script>
    import { hasTier } from '../lib/auth.js';
    const $ = (s) => document.querySelector(s);
    async function api(path, opts) { const r = await fetch('/api/kyc' + path, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...opts }); return r.json().catch(() => ({})); }
    function row(w) {
      const kt = w.kt; const risk = w.risk || 'Lág';
      return `<tr data-kt="${kt}"><td><a href="/areidanleikavaktin/?kt=${kt}">${w.nafn || kt}</a><br><small style="color:var(--faint)">${kt}</small></td>`
        + `<td class="risk-${risk}">${risk}</td>`
        + `<td>${w.opnar ? `<span class="kv-open">${w.opnar}</span>` : '0'}</td>`
        + `<td>${w.reviewed_at ? new Date(w.reviewed_at * 1000).toLocaleDateString('is-IS') : '–'}</td>`
        + `<td><button class="kv-rm" data-kt="${kt}" title="Fjarlægja">✕</button></td></tr>`;
    }
    async function load() {
      const d = await api('/watch');
      if (!d.ok) { $('#kv-gate').hidden = false; return; }
      $('#kv-app').hidden = false;
      $('#kv-cap').textContent = (d.cap < 0 ? '' : `${d.watch.length} / ${d.cap}`);
      $('#kv-rows').innerHTML = (d.watch || []).map(row).join('');
      $('#kv-empty').hidden = (d.watch || []).length > 0;
    }
    async function boot() {
      if (!hasTier(3)) { $('#kv-gate').hidden = false; return; }
      await load();
      $('#kv-add').addEventListener('submit', async (e) => {
        e.preventDefault(); const kt = ($('#kv-kt').value || '').replace(/\D/g, ''); const msg = $('#kv-msg');
        const d = await api('/watch', { method: 'POST', body: JSON.stringify({ kt }) });
        if (!d.ok) { msg.hidden = false; msg.textContent = d.error === 'cap' ? 'Hámarki náð (' + d.cap + ' kt).' : d.error === 'kt' ? 'Ógild kennitala.' : 'Villa.'; return; }
        msg.hidden = true; $('#kv-kt').value = ''; await load();
      });
      $('#kv-rows').addEventListener('click', async (e) => {
        const b = e.target.closest('.kv-rm'); if (!b) return;
        if (!confirm('Fjarlægja úr vöktun? (audit-skráin varðveitist)')) return;
        await api('/watch?kt=' + b.dataset.kt, { method: 'DELETE' }); await load();
      });
    }
    document.addEventListener('astro:page-load', () => { if (document.querySelector('main[data-pg="areidanleikavaktin"]')) boot(); });
  </script>
</Layout>
```

- [ ] **Step 2: Bæta korti í Mitt svæði** — í `web/src/pages/mitt-svaedi.astro`, `#p-dash`-hlutann (~L91), bæta gated tengli. Fylgja núverandi korta-mynstri síðunnar; lágmark:
```astro
<a id="ms-kyc" class="ms-card" href="/areidanleikavaktin/" hidden>🛡️ Áreiðanleikavaktin — KYC-vöktun viðskiptavina</a>
```
Og í `<script>`-inu (þar sem `hasTier`/`karpGet` eru þegar aðgengileg, ~L424) sýna það fyrir þrep 3:
```js
if (hasTier(3)) document.getElementById('ms-kyc')?.removeAttribute('hidden');
```

- [ ] **Step 3: Build + lifandi próf**

Run (úr `web/`): `npx astro build`
Expected: byggist án villu; `dist/areidanleikavaktin/index.html` til.
Preview: `npx wrangler dev` (eða `npm run preview`), opna `/areidanleikavaktin/` innskráður sem `fyrirtaeki_plus` → sést app; bæta kt → birtist í töflu með áhættu. Innskráður sem lægra þrep → sést `#kv-gate`.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/areidanleikavaktin.astro web/src/pages/mitt-svaedi.astro
git commit -m "KYC v1: /areidanleikavaktin portfolio-yfirlit + tengill i Mitt svaedi"
```

---

### Task 9: UI — compliance-mappa (drill-in) + aðgerðir + PDF

**Files:**
- Modify: `web/src/pages/areidanleikavaktin.astro` (drill-in þegar `?kt=` er sett; aðgerðir; prent-CSS).

**Interfaces:**
- Consumes: `/api/kyc/file?kt=`, `/api/kyc/risk|ack|note|rescreen`.
- Produces: möppu-sýn með tímalínu + aðgerðum + `window.print()` PDF.

- [ ] **Step 1: Bæta möppu-sýn** — í `<main>` (á eftir `#kv-app`), bæta:
```astro
    <section id="kv-file" hidden>
      <p><a href="/areidanleikavaktin/">← Til baka í yfirlit</a></p>
      <div class="kv-file-h"><div><h2 id="kf-nafn"></h2><small id="kf-kt" style="color:var(--faint)"></small></div>
        <div class="kf-actions"><button id="kf-rescreen">Skima aftur</button><button id="kf-print">Prenta / PDF</button></div></div>
      <div class="kf-risk">Áhætta: <select id="kf-risk"><option>Lág</option><option>Venjuleg</option><option>Há</option></select>
        <input id="kf-reason" placeholder="rökstuðningur (valfrjálst)" /><button id="kf-risk-save">Vista</button></div>
      <h3>Opnar viðvaranir</h3><div id="kf-events"></div>
      <h3>Núverandi skimun</h3><div id="kf-states"></div>
      <h3>Atburðaskrá (audit)</h3><div class="kf-note"><input id="kf-note" placeholder="Bæta athugasemd…" /><button id="kf-note-save">Skrá</button></div>
      <ol id="kf-audit" class="kf-audit"></ol>
      <p class="pep-note">ⓘ Innlend PEP + opinberir refsilistar (OFAC/UN/EU). Erlendir PEP-ar takmarkaðir.</p>
    </section>
```
Prent-CSS + stílar (bæta í `<style>`):
```css
    .kv-file-h { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .kf-actions button, .kf-risk button, .kf-note button { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer; }
    .kf-risk, .kf-note { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
    .kf-risk select, .kf-risk input, .kf-note input { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); }
    .kf-ev { border-left: 3px solid #ff6d7a; padding: 6px 10px; margin: 6px 0; background: rgba(255,109,122,.08); border-radius: 0 6px 6px 0; }
    .kf-ev.sev-info { border-color: #7e8ca6; background: rgba(255,255,255,.04); } .kf-ev.sev-high { border-color: #f6b13b; }
    .kf-audit { font-size: 13px; color: var(--muted); padding-left: 18px; } .kf-audit li { margin: 4px 0; }
    @media print {
      body * { visibility: hidden; }
      #kv-file, #kv-file * { visibility: visible; }
      #kv-file { position: absolute; left: 0; top: 0; width: 100%; }
      .kf-actions, .kf-risk button, .kf-note, #kf-risk, .kv-rm { display: none !important; }
    }
```

- [ ] **Step 2: Bæta drill-in rökfræði í `<script>`** (kalla `openFile(kt)` ef `?kt=` er sett í `boot()`):
```js
    const kSev = (s) => 'sev-' + s;
    async function openFile(kt) {
      $('#kv-app').hidden = true; $('#kv-file').hidden = false;
      const d = await api('/file?kt=' + kt); if (!d.ok) { $('#kv-file').innerHTML = '<p>Fannst ekki.</p>'; return; }
      $('#kf-nafn').textContent = d.watch.nafn || kt; $('#kf-kt').textContent = kt;
      $('#kf-risk').value = d.watch.risk || 'Lág'; $('#kf-reason').value = d.watch.risk_reason || '';
      const open = (d.events || []).filter((e) => e.ack === 'open');
      $('#kf-events').innerHTML = open.length ? open.map((e) => `<div class="kf-ev ${kSev(e.severity)}"><b>${e.kind}</b> — ${new Date(e.detected_at*1000).toLocaleDateString('is-IS')} <button class="kf-ack" data-id="${e.id}">✓ Ljúka</button></div>`).join('') : '<p style="color:var(--muted)">Engar opnar viðvaranir.</p>';
      const st = d.states || {};
      $('#kf-states').innerHTML = `<ul><li>Refsilistar: <b>${(st.sanctions?.hits||[]).length}</b></li><li>PEP: <b>${(st.pep?.matches||[]).length}</b></li>`
        + `<li>Gjaldþrot: <b>${st.status?.gjaldthrot ? 'JÁ' : 'nei'}</b></li><li>Endanlegir eigendur: <b>${(st.ubo?.owners||[]).length}</b></li>`
        + `<li>Stjórn: <b>${(st.board?.members||[]).length}</b></li><li>Lögbirtingar: <b>${(st.legal?.notices||[]).length}</b></li></ul>`;
      $('#kf-audit').innerHTML = (d.audit || []).map((a) => `<li>${new Date(a.ts*1000).toLocaleString('is-IS')} — <b>${a.action}</b>: ${a.summary || ''} <small>(${a.actor})</small></li>`).join('');
      $('#kf-print').onclick = () => window.print();
      $('#kf-rescreen').onclick = async () => { await api('/rescreen', { method: 'POST', body: JSON.stringify({ kt }) }); openFile(kt); };
      $('#kf-risk-save').onclick = async () => { await api('/risk', { method: 'POST', body: JSON.stringify({ kt, risk: $('#kf-risk').value, reason: $('#kf-reason').value }) }); openFile(kt); };
      $('#kf-note-save').onclick = async () => { const n = $('#kf-note').value.trim(); if (!n) return; await api('/note', { method: 'POST', body: JSON.stringify({ kt, note: n }) }); $('#kf-note').value=''; openFile(kt); };
      $('#kf-events').onclick = async (e) => { const b = e.target.closest('.kf-ack'); if (!b) return; await api('/ack', { method: 'POST', body: JSON.stringify({ event_id: +b.dataset.id, status: 'resolved' }) }); openFile(kt); };
    }
```
Og í `boot()`, á eftir `if (!hasTier(3)) {...}`:
```js
      const qkt = new URLSearchParams(location.search).get('kt');
      if (qkt) { await openFile(qkt.replace(/\D/g, '')); return; }
```

- [ ] **Step 3: Build + prent-próf**

Run (úr `web/`): `npx astro build` → grænt.
Preview: opna `/areidanleikavaktin/?kt=<vaktað-kt>` → möppa birtist (skimun + audit með `initial_cdd`); „Skima aftur", „Vista áhættu", „Skrá athugasemd" uppfæra tímalínuna; „Prenta / PDF" sýnir aðeins möppuna í prent-forskoðun.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/areidanleikavaktin.astro
git commit -m "KYC v1: compliance-mappa (drill-in) + adgerdir + PDF prent-CSS"
```

---

### Task 10: Loka-sannreyning + fast-follow-nótur

**Files:**
- Modify: `docs/superpowers/plans/2026-07-26-areidanleikavaktin.md` (haka við + fast-follow-lista).

- [ ] **Step 1: Keyra fulla græna hliðið**

Run:
```bash
cd web && npx astro build && cd ..
node --check web/worker.js
node --test web/src/lib/kyc.test.mjs
```
Expected: allt grænt (build OK, check exit 0, öll kyc-próf PASS).

- [ ] **Step 2: Lifandi enda-til-enda (preview/dev, innskráður `fyrirtaeki_plus`)**
  - Bæta kt → sést í yfirliti með áhættu; mappa opnast með `initial_cdd` í audit.
  - (Valfrjálst) keyra `kycDiffCron` handvirkt einu sinni; tilbúin breyting (t.d. setja `gjaldthrot=1` á test-kt í local D1) → `kyc_event` + audit `change_detected` + (kritískt) póst-tilraun.

- [ ] **Step 3: Skrá handoff-nótur Arons í commit-skilaboð / spec** (fast-follows sem eru VÍSVITANDI utan v1):
  - Remote-migration: `npx wrangler d1 execute tengsl --remote --file web/migrations/0008_kyc.sql`.
  - Lögfræði: vinnslusamningur (DPA) í Fyrirtæki+ skilmála + DPIA-viðbót.
  - Org/sæta-sameign (accounts-tafla) svo listinn deilist milli 10 sæta.
  - Sönn near-live: auka refresh á `sanctions.json`/`logbirting.json` (worker beint eða tíðari build).
  - Erlend vottuð PEP/sanctions-veita; full indirect-UBO (`computeUbo`) í diff; `tax`-merki (vanskilaskrá, leyfi #36); adverse-media nákvæmni.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-07-26-areidanleikavaktin.md
git commit -m "KYC v1: plan afklarad — loka-sannreyning + fast-follow-notur"
```

---

## Self-Review (höfundar-yfirferð)

**Spec-þekja:** migration (§gagnalíkan) ✓ T1 · diff-vél + risk (§vöktunar-vél, §áhættumat) ✓ T2–3 · server-skimun/graf-lesari (§skimun) ✓ T4 · watchlist owner-keyed + cap + CDD (§réttindi, §UX) ✓ T5 · mappa/audit/aðgerðir (§UX, §audit) ✓ T6 · cron diff + kritísk + scheduled + wrangler (§vöktunar-vél, §viðvaranir) ✓ T7 · portfolio + Mitt-svæði (§UX) ✓ T8 · drill-in + PDF (§UX) ✓ T9 · græna hliðið + fast-follows (§utan umfangs) ✓ T10.

**Opnar spurningar spec-sins leystar:** severity-vörpun (sanctions/legal-bankruptcy/status-gjaldþrot=critical; ubo/pep/tax/status=high; board/media/new_annual=info) ✓ · digest-sjálfgildi (kritískt=strax póstur; dagl. digest = fast-follow yfir `kyc_ack` opnar — ekki blokk á v1) · server-skimun (sanctions til, PEP nýtt `kycPepIndex`) ✓ · adverse-media (íhaldssamt nákvæmt nafn-match, info) ✓ · tax (stubbur, bíður vanskilaskrár) ✓ · near-live (3h cron; heimildar-refresh = fast-follow) ✓.

**Type-samræmi:** state-form (`{hits}`,`{notices}`,`{matches}`,`{owners}`,`{members}`,`{stada,gjaldthrot,...}`,`{claims}`,`{titles}`) er eins í `kycScreenKt` (T4), `signalEvents`/`deriveRisk` (T2–3) og `_kycSnapshotWrite`/`_kycRunDiff` (T5/T7). `owner_id`/`kt`/`event_id` samræmd. `_kycGate`/`_kycWatchCap` nota `tier==='fyrirtaeki_plus'` (ekki client `hasTier`). ✓

**Gmail-sendi-fall staðfest:** `sendGmail(env, { to, subject, text })` (`worker.js:3067`), secret-gated (skilar `{unconfigured:true}` án `GMAIL_*`-secrets) → kritísk-póstur brotnar ekki þótt secrets vanti.
