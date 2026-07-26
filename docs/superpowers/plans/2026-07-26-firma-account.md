# Firma-account (org/sæta-sameign v1) — Útfærsluáætlun

> **Fyrir agentíska verkamenn:** NAUÐSYNLEG UNDIR-SKILL: superpowers:subagent-driven-development. Skref nota gátreiti (`- [ ]`).

**Markmið:** Gera Karp+ sætin raunveruleg — eigandi hefur team-meðlimi sem erfa þrep/áskriftir/skýrslu-heimildir og deila account-gögnum (KYC-listi, ktwatch, follows).

**Arkitektúr:** einn nýr dálkur `users.parent_account_id` + hrein `accountId()`/`tierFields()` (í `web/src/lib/account.mjs`). `authMeHandler` auto-tengir meðlimi + reiknar entitlements af account-eiganda; entitlement-gates og deild gögn nota `accountId(u)`. Enginn client-breyting (auth.js les nú þegar `effectiveTier` úr /me).

**Tæknistakkur:** Node 22 `node:test`, Cloudflare Worker (`web/worker.js`), D1 (`TENGSL`), Astro.

## Global Constraints

- **Migration = `0010`** (0009_leikur er til). Apply: `npx wrangler d1 execute tengsl --remote --file web/migrations/0010_account.sql` (local: `--local`).
- **Próf:** `node:test`, `node --test <skrá.test.mjs>`. Græna hliðið: `npx astro build` (úr web/) + `node --check web/worker.js` + `node --test`.
- `accountId(u) = u.parent_account_id || u.id`. Meðlimir resolve-a entitlements + deild gögn gegnum account-eiganda. **Halda per-notanda:** `id`/`email`/`name`, `auth_tokens`, persónuleg atkvæði, og vakt/digest-tilkynningastillingar (v1).
- **Enginn `auth.js`-breyting** — `/me` skilar account-resolved `effectiveTier`/`subs`/`reports`/`reportsRemaining`/`svcQuota`. `effectiveTier` = account-þrep (hærra af eigin/account); `tier` = eigin þrep.
- **Hæsta áhætta:** kvóta-increment (`worker.js:3450,3468,3487`) skrifa á **account-eigandann**; data-proxy (`4317`) les account-heimildir; `kyc_audit.actor` helst raun-notandinn.
- **DRY:** worker IMPORTAR `accountId`/`tierFields` úr `account.mjs` (ekki afrita).
- Commit strax eftir hverja skrá (automation-reset). Aðeins snerta skrár verksins. Ekki `--remote`/push nema lokaverk.

---

### Task 1: Migration 0010 — `parent_account_id`

**Files:** Create `web/migrations/0010_account.sql`

**Interfaces:** Produces dálkinn `users.parent_account_id` (nullable INTEGER) sem öll síðari verk nota.

- [ ] **Step 1: Skrifa migration**
```sql
-- 0010_account.sql — firma-account (org/sæta-sameign v1). parent_account_id = users.id eigandans; null = eigandi/sjálfstæður.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0010_account.sql
ALTER TABLE users ADD COLUMN parent_account_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_account_id);
```

- [ ] **Step 2: Staðfesta staðbundið**
```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt/web" && npx wrangler d1 execute tengsl --local --file migrations/0010_account.sql && npx wrangler d1 execute tengsl --local --command "SELECT name FROM pragma_table_info('users') WHERE name='parent_account_id'"
```
Expected: skilar `parent_account_id`. (Ef local-D1 er ekki uppsett → í lagi, ekki keyra `--remote`; SQL er einfalt ALTER.)

- [ ] **Step 3: Commit**
```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/migrations/0010_account.sql && git commit -m "Account v1: migration 0010 (users.parent_account_id)"
```
> **Aron (handoff):** remote: `npx wrangler d1 execute tengsl --remote --file web/migrations/0010_account.sql`.

---

### Task 2: `account.mjs` — hrein resolver + tierFields

**Files:** Create `web/src/lib/account.mjs`, `web/src/lib/account.test.mjs`

**Interfaces:**
- Produces: `accountId(u) -> number|null` (`u.parent_account_id || u.id`); `tierFields(ownRow, ownerRow, now) -> { tier, effectiveTier }` (tier = eigin virkt þrep; effectiveTier = hærra virkt þrep af eigin/account).

- [ ] **Step 1: Skrifa fallandi próf** — `web/src/lib/account.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert';
import { accountId, tierFields } from './account.mjs';

const NOW = 1000;
const active = (tier) => ({ tier, tier_until: NOW + 1 });
const expired = (tier) => ({ tier, tier_until: NOW - 1 });

test('accountId: eigandi = eigið id', () => {
  assert.equal(accountId({ id: 5, parent_account_id: null }), 5);
});
test('accountId: meðlimur = parent', () => {
  assert.equal(accountId({ id: 7, parent_account_id: 5 }), 5);
});
test('tierFields: sjálfstæður virkur = sama tier/effectiveTier', () => {
  const r = tierFields(active('fyrirtaeki_plus'), active('fyrirtaeki_plus'), NOW);
  assert.deepEqual(r, { tier: 'fyrirtaeki_plus', effectiveTier: 'fyrirtaeki_plus' });
});
test('tierFields: meðlimur án eigin þreps erfir account', () => {
  const r = tierFields({ tier: null, tier_until: null }, active('fyrirtaeki_plus'), NOW);
  assert.equal(r.tier, null);
  assert.equal(r.effectiveTier, 'fyrirtaeki_plus');
});
test('tierFields: meðlimur með eigin hærra þrep heldur því', () => {
  const r = tierFields(active('fyrirtaeki'), active('grunnur'), NOW);
  assert.equal(r.effectiveTier, 'fyrirtaeki');
});
test('tierFields: útrunnið = null', () => {
  const r = tierFields(expired('fyrirtaeki_plus'), expired('fyrirtaeki_plus'), NOW);
  assert.deepEqual(r, { tier: null, effectiveTier: null });
});
```

- [ ] **Step 2: Keyra → falla** — `node --test web/src/lib/account.test.mjs` → FAIL (module vantar).

- [ ] **Step 3: Skrifa `web/src/lib/account.mjs`:**
```js
// account.mjs — hrein firma-account resolver (engin I/O; einingaprófuð). Sjá spec 2026-07-26.
import { TIER_LVL } from '../data/lausnir.js';

export const accountId = (u) => (u && (u.parent_account_id || u.id)) || null;

const _activeTier = (r, now) => (r && r.tier && r.tier_until && r.tier_until > now) ? r.tier : null;
const _lvl = (t) => (t && TIER_LVL[t]) || 0;

// tier = eigin virkt þrep; effectiveTier = hærra virkt þrep af eigin (ownRow) og account (ownerRow).
export function tierFields(ownRow, ownerRow, now) {
  const own = _activeTier(ownRow, now);
  const acct = _activeTier(ownerRow, now);
  const effectiveTier = _lvl(acct) >= _lvl(own) ? acct : own;
  return { tier: own, effectiveTier: effectiveTier || null };
}
```

- [ ] **Step 4: Keyra → grænt** — `node --test web/src/lib/account.test.mjs` → PASS.

- [ ] **Step 5: Commit**
```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/src/lib/account.mjs web/src/lib/account.test.mjs && git commit -m "Account v1: hrein resolver (accountId/tierFields) + prof"
```

---

### Task 3: Worker — resolver-hjálparar + auto-tenging + entitlement-resolution í `authMeHandler`

**Files:** Modify `web/worker.js`

**Interfaces:**
- Consumes: `accountId`/`tierFields` (import), `_seatsCap` (`3368`), `_prefGet` (`3369`), `readSession`, `_ajson`.
- Produces: `accountOwner(env,u)`, `_autoLinkAccount(env,u,now)`; `authMeHandler`/`userPayload` skila account-resolved entitlements.

- [ ] **Step 1: Bæta import** við `kyc.mjs`-importinn (`worker.js:4`):
```js
import { accountId, tierFields } from './src/lib/account.mjs';
```

- [ ] **Step 2: Bæta hjálpurum** (nálægt `_seatsCap`, ~`worker.js:3368`):
```js
const accountOwnerId = (u) => (u && (u.parent_account_id || u.id));
async function accountOwner(env, u) {
  if (!u || !u.parent_account_id) return u;
  return (await env.TENGSL.prepare('SELECT * FROM users WHERE id=?').bind(u.parent_account_id).first().catch(() => null)) || u;
}
async function _autoLinkAccount(env, u, now) {
  if (!u || u.parent_account_id) return u; // þegar tengt eða er eigandi
  const email = (u.email || '').toLowerCase();
  const rows = (await env.TENGSL.prepare("SELECT user_id, v FROM user_prefs WHERE k='team'").all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) {
    let team = []; try { team = JSON.parse(r.v); } catch (e) {}
    if (!Array.isArray(team) || team.indexOf(email) < 0 || r.user_id === u.id) continue;
    const owner = await env.TENGSL.prepare('SELECT id,is_admin,tier,tier_until FROM users WHERE id=?').bind(r.user_id).first().catch(() => null);
    if (!owner) continue;
    const ownerActive = owner.is_admin === 1 || (owner.tier && owner.tier_until > now);
    if (!ownerActive) continue;
    const cap = _seatsCap(owner, now);
    const n = (await env.TENGSL.prepare('SELECT COUNT(*) AS n FROM users WHERE parent_account_id=?').bind(owner.id).first().catch(() => ({ n: 0 }))).n || 0;
    if (cap >= 0 && n >= cap) continue; // þak fullt → ótengdur
    await env.TENGSL.prepare('UPDATE users SET parent_account_id=? WHERE id=?').bind(owner.id, u.id).run().catch(() => {});
    u.parent_account_id = owner.id;
    return u;
  }
  return u;
}
```

- [ ] **Step 3: Splitta `userPayload`** (`worker.js:3163-3174`) svo það taki account-eiganda:
```js
function userPayload(u, owner, now) {
  const base = { /* … óbreytt loginUrl/registerUrl/paywall … */ };
  if (!u) return { loggedIn: false, ...base };
  now = now || Math.floor(Date.now() / 1000);
  const tf = tierFields(u, owner || u, now);
  const plus = u.is_admin === 1 || !!tf.effectiveTier;
  return {
    loggedIn: true, id: u.id, email: u.email, name: u.name || u.username || u.email,
    isAdmin: u.is_admin === 1, plus,
    tier: tf.tier, effectiveTier: tf.effectiveTier,
    emailVerified: u.email_verified === 1, kt: u.kt || null, ...base,
  };
}
```
(Haltu nákvæmu `base`-innihaldi úr núverandi falli.) **Grep alla `userPayload(`-kallendur** og uppfæra: `userPayload(null)` → óbreytt; aðrir → bæta `owner, now` (eða `u, u, now` fyrir sjálfstæða).

- [ ] **Step 4: Uppfæra `authMeHandler`** (`worker.js:3176-3201`) — eftir `const u = … WHERE id=uid` (þarf `SELECT *` svo `parent_account_id` fylgi):
```js
  const now = Math.floor(Date.now() / 1000);
  await _autoLinkAccount(env, u, now);
  // afskráning: hreinsa tengingu ef ekki lengur á team-lista virks eiganda
  if (u.parent_account_id) {
    const ot = await _prefGet(env, u.parent_account_id, 'team', []);
    const ow = await env.TENGSL.prepare('SELECT is_admin,tier,tier_until FROM users WHERE id=?').bind(u.parent_account_id).first().catch(() => null);
    const oActive = ow && (ow.is_admin === 1 || (ow.tier && ow.tier_until > now));
    if (!Array.isArray(ot) || ot.indexOf((u.email || '').toLowerCase()) < 0 || !oActive) {
      await env.TENGSL.prepare('UPDATE users SET parent_account_id=NULL WHERE id=?').bind(u.id).run().catch(() => {});
      u.parent_account_id = null;
    }
  }
  const acct = accountId(u);
  const owner = await accountOwner(env, u);
  const p = userPayload(u, owner, now);
```
Svo breyta entitlement-lestrunum: `sub_service … WHERE user_id=?` `.bind(acct, now)` (3184); `reports_granted … WHERE user_id=?` `.bind(acct)` (3185); kvóti `used`/`quota` úr `owner.reports_month`/`owner.reports_used`/`p.tier` — **NB nota `p.effectiveTier` fyrir `REPORT_QUOTA`** (ekki `p.tier`), og `owner.reports_used`/`owner.reports_month` (3189-3190); `p.follows = await _prefGet(env, acct, 'follows', [])` (3194). `p.membership = u.parent_account_id ? { owner: owner.email } : null;` (fyrir UI).

- [ ] **Step 5: Sannreyna** — `node --check web/worker.js` → exit 0. Commit:
```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/worker.js && git commit -m "Account v1: accountId/accountOwner + auto-tenging + entitlement-resolution i authMeHandler"
```
(Lifandi curl-smoke þarf cookie → valfrjálst; slepptu ef óhentugt.)

---

### Task 4: Worker — entitlement-gates → account-resolved + kvóta-increment á eiganda

**Files:** Modify `web/worker.js`

**Regla:** Hvert af eftirfarandi call-sites les caller-röð `u` (eða `uid`) og gate-ar/increment-ar. Fyrir hvert: tryggja að röðin sem gate/kvóti les sé **account-eigandans** — sæktu `const owner = await accountOwner(env, u)` (eða beint `parent_account_id`) og notaðu `accountId(u)` fyrir `WHERE user_id=?` og increment-`UPDATE`. Haltu caller-`uid` fyrir hluti sem eru per-notanda (t.d. audit-actor).

- [ ] **Step 1: Uppfæra gates** (les-hlið — nota account-þrep/heimildir):
  - `topplistarHandler` `worker.js:2978-2980`: `SELECT … users WHERE id=?` → hlaða `parent_account_id` líka; `topplistaEntitled(await accountOwner(env,urow), now)`.
  - `kycHandler` gate `worker.js:2563-2564`: `u` er þegar sótt (`SELECT id,email,is_admin,tier,tier_until`) → bæta `parent_account_id` í SELECT; `_kycGate(await accountOwner(env,u), now)`; `_kycWatchCap(owner, now)` (2572); KYC watch-`COUNT owner_id` (2580) → `accountId(u)` (sjá Task 5).
  - `/ktwatch` `worker.js:3495-3497`: `_ktwatchCap(await accountOwner(env,u), now)`.

- [ ] **Step 2: Uppfæra kvóta-lestur + increment** (⚠ increment á eiganda):
  - `/reports/open` `worker.js:3442-3450`: heimildir `reports_granted WHERE user_id=accountId(u)` (3445); kvóti `REPORT_QUOTA[effectiveTier(owner)]` + `owner.reports_month`/`owner.reports_used` (3446-3447); **`INSERT reports_granted (user_id=accountId(u),…)`** (3449); **`UPDATE users SET reports_used=…,reports_month=… WHERE id=accountId(u)`** (3450).
  - `/thing/open` `worker.js:3459-3468`: `reports_granted user_id=accountId(u)` (3462); `sub_service WHERE user_id=accountId(u) AND service='thingskyrslur'` (3463); increment `UPDATE sub_service … WHERE user_id=accountId(u)` (3468); `INSERT reports_granted user_id=accountId(u)` (3467).
  - `/fasteign/meta` `worker.js:3477-3487`: `sub_service WHERE user_id=accountId(u) …fasteign` (3481); `UPDATE sub_service … WHERE user_id=accountId(u)` (3487); `fasteign_done`-pref → `accountId(u)` (3479-3486, sjá Task 5).
  - **gated data-proxy** `worker.js:4315-4317`: `SELECT 1 FROM reports_granted WHERE user_id=? AND report_key=?` → `.bind(accountId(caller), …)` (caller-röð `guid` þarf `parent_account_id`; sæktu accountOwner-id).

- [ ] **Step 3: Sannreyna + commit**
```bash
node --check web/worker.js
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/worker.js && git commit -m "Account v1: entitlement-gates + kvota-increment account-resolved (a eiganda)"
```

---

### Task 5: Worker — deild gögn (KYC / ktwatch / follows / grants) → `accountId`

**Files:** Modify `web/worker.js`

- [ ] **Step 1: KYC `owner_id` → `accountId(u)`.** Í `kycHandler` (eftir að `u` er sótt með `parent_account_id`): `const acct = accountId(u);` og skipta **öllum** `owner_id`-bind úr `uid`/`u.id` í `acct` á línum `worker.js:2570,2571,2578,2579,2585,2586,2589,2595,2596,2603,2607,2610,2611,2617,2619,2620,2625,2627,2629,2635,2637,2642,2646,2647`. **Halda `kyc_audit.actor = u.email`** (raun-notandinn) óbreyttu. Í cron `_kycAfterEvents`/`_kycOwnersOf` (`2673,2682,2687`): `owner_id` er nú `accountId` → `_kycOwnersOf` skilar account-id-um; póstur fer á þann account-eiganda (sækja email `WHERE id=owner_id`) — óbreytt rökrétt. `kyc_snapshot`/`kyc_event` (global per kt) → ENGIN breyting.

- [ ] **Step 2: Prefs sem eru deild gögn → `accountId`.** Breyta `_prefGet`/`_prefSet`-köllum úr `uid` í `accountId(u)` fyrir keys **`ktwatch`** (`3497,3503`), **`follows`** (`3194,3421`), **`fasteign_done`** (`3479,3480,3486`). (Þarf caller-röð með `parent_account_id`; sæktu ef vantar.) Keys **`frettavakt`/`leitvakt`/`fastvakt`/`firmavakt`/`utbodvakt`/`verkprofil`/`digest`/`vaktir`/`team`** → **ÓBREYTT (per-notanda, sjá Global Constraints).**

- [ ] **Step 3: Grants → `accountId(kaupanda)`.** `INSERT reports_granted`/`sub_service`/`UPDATE users tier` á kaup-leiðum: `worker.js:1277-1278` (checkout return), `1661-1662` (Áskell stak), `1795-1796` (webhook), `grantReportD1`/`grantSubD1` (`3244-3264`). Ef kaupandi-uid er þekkt: `INSERT … user_id=accountId(kaupanda-röð)`. (`_uidByKt` skilar nú þegar eiganda; webhook/checkout eru oftast eigandi — en resolve-a `accountId` til öryggis.)

- [ ] **Step 4: Sannreyna + commit**
```bash
node --check web/worker.js
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/worker.js && git commit -m "Account v1: deild gogn (KYC/ktwatch/follows/grants) -> accountId"
```

---

### Task 6: UI — team-stjórnun (eigandi) + meðlima-borði í Mitt svæði

**Files:** Modify `web/src/pages/mitt-svaedi.astro`

- [ ] **Step 1: Lesa** núverandi `mitt-svaedi.astro` (tabs `#p-dash`/`#p-still`, script ~L424, `karpGet`/`karpPost`, `/api/u/team` er til). Bæta í Stillingar-hlutann (`#p-still`) „Team"-kassa:
```html
<section id="ms-team" hidden>
  <h3>Team (sæti)</h3>
  <p class="ms-team-note">Bættu við netföngum starfsmanna — þeir erfa þrepið þitt og deila gögnum þegar þeir skrá sig inn.</p>
  <form id="ms-team-add"><input id="ms-team-email" type="email" placeholder="netfang@stofa.is" /><button>Bæta við</button><span id="ms-team-cap"></span></form>
  <ul id="ms-team-list"></ul>
</section>
```
Client (þar sem `karpGet`/`karpPost`/`hasTier` eru til, í `loadUser().then`-callback):
```js
async function loadTeam() {
  const d = await karpGet('/team'); if (!d) return;
  document.getElementById('ms-team-cap').textContent = (d.cap < 0 ? '' : `${d.members.length} / ${d.cap} sæti`);
  document.getElementById('ms-team-list').innerHTML = (d.members || []).map((e) => `<li>${e} <button class="ms-team-rm" data-e="${e}">✕</button></li>`).join('');
}
// aðeins eigandi (ekki meðlimur) stjórnar team:
if (u.loggedIn && !u.membership && hasTier(2)) { document.getElementById('ms-team').removeAttribute('hidden'); loadTeam(); }
document.getElementById('ms-team-add').addEventListener('submit', async (e) => { e.preventDefault(); const em = document.getElementById('ms-team-email').value.trim(); const r = await karpPost('/team', { email: em }); if (r && r.ok) { document.getElementById('ms-team-email').value=''; loadTeam(); } else if (r && r.error === 'cap') alert('Öll sæti í notkun.'); });
document.getElementById('ms-team-list').addEventListener('click', async (e) => { const b = e.target.closest('.ms-team-rm'); if (!b) return; await karpPost('/team', { email: b.dataset.e, action: 'remove' }); loadTeam(); });
```
Meðlima-borði (ef `u.membership`): sýna „Þú ert í account **{u.membership.owner}** — þú deilir gögnum og þrepi með stofunni." efst í dash. (Nýtir `p.membership` úr Task 3.)

- [ ] **Step 2: Build + commit**
```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt/web" && npx astro build
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/src/pages/mitt-svaedi.astro && git commit -m "Account v1: team-stjornun (eigandi) + medlima-bordi i Mitt svaedi"
```
Expected: build grænt.

---

### Task 7: Loka-sannreyning + fast-follow-nótur

- [ ] **Step 1: Fulla græna hliðið**
```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt/web" && npx astro build && cd .. && node --check web/worker.js && node --test web/src/lib/account.test.mjs && node --test web/src/lib/kyc.test.mjs
```
Expected: allt grænt (build OK, check 0, account+kyc próf PASS).

- [ ] **Step 2: Handoff-nótur (Aron / vísvitandi utan v1):**
  - Remote: `npx wrangler d1 execute tengsl --remote --file web/migrations/0010_account.sql`.
  - Fast-follows: fínstillt hlutverk; invite-tákn/accept; per-meðlims vakt/digest email + account-scoped vakt-config; `account_members`-index (v1=team-blobb skönnun í `_autoLinkAccount`); per-sæti gjald.

- [ ] **Step 3: Commit** (ef nótur bætt við plan/skjöl).

---

## Self-Review

**Spec-þekja:** migration 0010 ✓T1 · accountId/tierFields+próf ✓T2 · auto-tenging+entitlement-resolution ✓T3 · gates+kvóta-increment ✓T4 · deild gögn (KYC/ktwatch/follows/grants) ✓T5 · team-UI+meðlima-borði ✓T6 · græna hliðið+fast-follows ✓T7.

**Opnar spurningar spec leystar:** auto-link í `authMeHandler` (link-on-/me, `parent_account_id IS NULL`-vörð); team-lookup=full `k='team'`-skönnun (index=fast-follow); vakt/digest per-notanda í v1; `userPayload` splittað (tier eigin / effectiveTier account).

**Type-samræmi:** `accountId(u)` notað eins í T3-T5; `tierFields` import-að í worker (ekki afritað — DRY); `owner`/`acct` samræmd; `kyc_audit.actor=u.email` haldið.

**⚠ Verkamaður STAÐFESTIR:** (a) grep alla `userPayload(`-kallendur (T3-S3) og uppfæra undirskrift; (b) `authMeHandler`-`u` verður að vera `SELECT *` (svo `parent_account_id`+`reports_*` fylgi); (c) `REPORT_QUOTA` notar `effectiveTier` (ekki `tier`).
