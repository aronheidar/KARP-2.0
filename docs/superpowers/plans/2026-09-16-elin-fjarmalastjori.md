# Elín fjármálastjóri — framkvæmdaáætlun

> **Fyrir agenta:** NAUÐSYNLEG UNDIR-KUNNÁTTA: notaðu superpowers:subagent-driven-development (mælt með)
> eða superpowers:executing-plans til að vinna þetta verk fyrir verk. Skrefin nota `- [ ]` til að merkja.

**Markmið:** Elín samstemmir Áskel við D1 og sýnir hvar þeim ber ekki saman — MRR sem er *rukkað*, ekki
MRR sem er *veitt*.

**Högun:** Hrein eining reiknar (`lib/fjarmal.mjs`), worker-eining sækir og geymir
(`worker/fjarmal.mjs`), hrein eining birtir (`lib/stjorn/elin.mjs`), og `bidur_thin.mjs` fær fjórðu
uppsprettuna. Nákvæmlega sama lagskipting og Bjarki, sem er eina mynstrið sem hefur staðist yfirferð hér.

**Tæknistafli:** Node 22 + `node --test`, Astro 5 SSG, Cloudflare Worker + D1 (binding `TENGSL`),
Áskels-REST (`https://askell.is/api/v2/...`, haus `Authorization: Api-Key <ASKELL_PRIVATE_KEY>`).

## Altækar girðingar

Þessar gilda um ÖLL verk hér að neðan.

- **Elín hreyfir aldrei peninga.** Engar greiðslur, endurgreiðslur, millifærslur eða uppsagnir.
  `POST`-leiðin hefur hvítalista og hafnar öllu öðru. Negld með prófi.
- **Elín snertir aldrei kóða.** Misræmi sem krefst lagfæringar fer til Hrafns um `_ghDispatch`.
- **AI-saminn texti bíður Arons.** `hrafn`-aðgerðin skrifar drög sem birtast í „bíður þín"; ekkert fer
  af stað fyrr en hann samþykkir.
- **`virk()` er ORÐRÉTT sú sama og í `web/src/worker/greidslur.mjs`:**
  `(st) => /active|trial|current/i.test(String(st || '')) && !/cancel|fail|expire|inactive/i.test(String(st || ''))`
  Tvær talningar á sama hlut með ólíkri skilgreiningu enda alltaf á því að stangast á.
- **Pörun samnings við notanda er á kennitölu** (`String(c.customer_reference).replace(/\D/g,'')`),
  ALDREI á `askell_id` einu — það er flýtileið sem rekur sig (sjá `greidslur.mjs`, „Áskell = sannleikur").
- **Verð:** `PRICE_TIER = { grunnur: 2900, fyrirtaeki: 6900, fyrirtaeki_plus: 12900 }` og
  `PRICE_SVC = { kvoti: 9900, utbod: 1900, frettir: 3900, fasteign: 3900, thingskyrslur: 3900 }`
  (orðrétt úr `web/src/worker/stjornbord.mjs:56-57`).
- **Top-level nöfn í worker-einingum mega ekki rekast á** — `skriptur/ci_worker_bindings.mjs` fellir CI.
  Öll top-level nöfn í `worker/fjarmal.mjs` bera forskeytið `_fj`.
- **`ci_worker_bindings.mjs` keyrir ÚR RÓT**, ekki úr `web/`. (`cd web && node ../skriptur/...` VIRKAR EKKI.)
- **Prófaskrár finnast sjálfkrafa.** `web/package.json` keyrir
  `node --test src/lib/*.test.mjs src/lib/stjorn/*.test.mjs src/worker/*.test.mjs test/*.test.mjs` —
  allar þrjár nýju skrárnar lenda undir þessum glimum. Ekkert þarf að skrá handvirkt.
- **Prófgögn VERÐA að vera hreiðruð eins og raunsvarið.** `bjarkiGogn` las `svar.error` þegar raunsvarið
  bar `svar.postiz.error`; „óstillt" hefði aldrei birst, með sjö græn próf, af því fixtures voru flöt.
- **Byrjunarstaða:** 848 próf græn.

---

### Verk 1: Hrein samstemming (`lib/fjarmal.mjs`)

**Skrár:**
- Búa til: `web/src/lib/fjarmal.mjs`
- Prófa: `web/src/lib/fjarmal.test.mjs`

**Viðmót:**
- Neytir: engra fyrri verka.
- Framleiðir: `samstemma({ samningar, heimildir, verdskra, now })` → `{ misraemi, fripofanir, mrrAskell, mrrD1, verdrek }`
  - `samningar`: `[{ id, customer_reference, state, items: [{ product_reference, price }] }]` (úr Áskeli)
  - `heimildir`: `[{ uid, kt, vara, until, askell_id, free_access, is_admin, nemandi, tegund }]` þar sem
    `tegund` er `'tier'` eða `'svc'` (úr D1)
  - `verdskra`: `{ [product_reference]: verd }` (úr Áskeli)
  - `misraemi`: `[{ tegund: 'borgar_fyrir_ekkert' | 'gefins', kt, vara, verd, sidan }]`
  - `fripofanir`: `[{ kt, vara, verd }]`
  - `verdrek`: `[{ vara, askell, fast }]`
- Einnig flutt út: `VIRK`, `PRICE_TIER`, `PRICE_SVC`, `erFriprofun`, `ktHreint`.

- [ ] **Skref 1: Skrifaðu fallandi prófin**

Skrá `web/src/lib/fjarmal.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samstemma, VIRK, erFriprofun, ktHreint } from './fjarmal.mjs';

const NU = Date.UTC(2026, 8, 16) / 1000;
const SEINNA = NU + 30 * 86400;

const samn = (kt, vara, state = 'active', verd = 6900) => ({
  id: 'c_' + kt + '_' + vara, customer_reference: kt, state,
  items: [{ product_reference: vara, price: verd }],
});
const heim = (kt, vara, extra = {}) => Object.assign(
  { uid: 1, kt, vara, until: SEINNA, askell_id: null, free_access: 0, is_admin: 0, nemandi: 0, tegund: 'tier' },
  extra,
);
const VERD = { fyrirtaeki: 6900, grunnur: 2900, kvoti: 9900 };

test('VIRK er ORÐRÉTT sama regla og greidslur.mjs — annars reka talningarnar sig í sundur', () => {
  for (const s of ['active', 'trial', 'current', 'ACTIVE']) assert.equal(VIRK(s), true, s);
  for (const s of ['cancelled', 'failed', 'expired', 'inactive', '', null]) assert.equal(VIRK(s), false, String(s));
  assert.equal(VIRK('trial_cancelled'), false, 'neitunin vinnur yfir játunina');
});

test('samningur rukkar en engin heimild í D1 → viðskiptavinur borgar fyrir ekkert', () => {
  const r = samstemma({ samningar: [samn('1234567890', 'fyrirtaeki')], heimildir: [], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 1);
  assert.equal(r.misraemi[0].tegund, 'borgar_fyrir_ekkert');
  assert.equal(r.misraemi[0].verd, 6900);
});

test('heimild í D1 án virks samnings → við gefum vöruna', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 1);
  assert.equal(r.misraemi[0].tegund, 'gefins');
});

test('fríprófun með samningi er HVORKI misræmi NÉ rukkaðar tekjur', () => {
  // ⚠ Stærsta villan sem hönnunin gat framleitt: án þessa teldist HVER fríprófun „borgar fyrir ekkert"
  //   og listinn fylltist af fólki sem er nákvæmlega í réttri stöðu.
  const r = samstemma({
    samningar: [samn('1234567890', 'fyrirtaeki', 'trial')],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.misraemi.length, 0, 'ekkert misræmi');
  assert.equal(r.fripofanir.length, 1);
  assert.equal(r.fripofanir[0].verd, 6900, 'verður þetta virði haldi hann áfram');
  assert.equal(r.mrrAskell, 0, 'fríprófun leggur EKKERT til rukkaðra tekna');
});

test('free_access er gjafaaðgangur, ekki leki', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { free_access: 1 })], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 0);
});

test('is_admin er ekki leki', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { is_admin: 1 })], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 0);
});

test('nemandi er ekki leki', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { nemandi: 1 })], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 0);
});

test('útrunnin heimild telst ekki með — hún er ekki virk', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { until: NU - 86400 })], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 0);
  assert.equal(r.mrrD1, 0);
});

test('parað er á kennitölu, ekki á askell_id — id-ið rekur sig', () => {
  const r = samstemma({
    samningar: [samn('1234567890', 'fyrirtaeki')],
    heimildir: [heim('123456-7890', 'fyrirtaeki', { askell_id: 'DAUTT_ID' })],
    verdskra: VERD, now: NU,
  });
  assert.equal(r.misraemi.length, 0, 'bandstrik í kt má ekki fella pörunina');
});

test('MRR: Áskell notar RAUNVERÐ, D1 notar föstu töfluna', () => {
  const r = samstemma({
    samningar: [samn('1234567890', 'fyrirtaeki', 'active', 5900)],
    heimildir: [heim('1234567890', 'fyrirtaeki')],
    verdskra: { fyrirtaeki: 5900 }, now: NU,
  });
  assert.equal(r.mrrAskell, 5900, 'raunverð úr Áskeli');
  assert.equal(r.mrrD1, 6900, 'fasta taflan í kóðanum');
  assert.equal(r.verdrek.length, 1);
  assert.deepEqual(r.verdrek[0], { vara: 'fyrirtaeki', askell: 5900, fast: 6900 });
});

test('þjónustuáskrift (svc) notar PRICE_SVC en ekki PRICE_TIER', () => {
  const r = samstemma({
    samningar: [samn('1234567890', 'kvoti', 'active', 9900)],
    heimildir: [heim('1234567890', 'kvoti', { tegund: 'svc' })],
    verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrD1, 9900);
  assert.equal(r.verdrek.length, 0, 'verðið stemmir við PRICE_SVC');
});

test('verðrek er líka mælt á þjónustuverðum — þau eru jafn harðkóðuð og þrepaverðin', () => {
  const r = samstemma({ samningar: [], heimildir: [], verdskra: { kvoti: 11900 }, now: NU });
  assert.deepEqual(r.verdrek, [{ vara: 'kvoti', askell: 11900, fast: 9900 }]);
});

test('vara sem á sér ekkert fast verð rekur sig ekki', () => {
  const r = samstemma({ samningar: [], heimildir: [], verdskra: { eitthvad_nytt: 4900 }, now: NU });
  assert.equal(r.verdrek.length, 0);
});

test('ktHreint strípar allt sem er ekki tala', () => {
  assert.equal(ktHreint('123456-7890'), '1234567890');
  assert.equal(ktHreint(null), '');
});

test('erFriprofun þekkir trial en ekki active', () => {
  assert.equal(erFriprofun('trial'), true);
  assert.equal(erFriprofun('active'), false);
});
```

- [ ] **Skref 2: Keyrðu prófin og staðfestu að þau falli**

Keyrsla (úr `web/`): `node --test src/lib/fjarmal.test.mjs`
Búist við: FALL með `Cannot find module './fjarmal.mjs'`.

- [ ] **Skref 3: Skrifaðu útfærsluna**

Skrá `web/src/lib/fjarmal.mjs`:

```js
// fjarmal.mjs — HREIN eining: Áskels-samningar × D1-heimildir → misræmi, fríprófanir og tvær MRR-tölur.
//
// ⚠⚠ MRR á stjórnborðinu er reiknað úr D1 með FÖSTU verðtöflunni — það mælir hvað við höfum VEITT,
//    ekki hvað er RUKKAÐ. Þetta tvennt fer í sundur nákvæmlega þegar peningar hætta að berast: kort
//    hafnar endurnýjun, réttindin standa til `until`, og talan sýnir tekjur sem koma aldrei.
//    `greidslur.mjs` veit þetta — þar stendur „Áskell = sannleikur".
// ⚠ Engin fetch, ekkert env, ekkert Date.now(). `now` kemur frá kallanda svo prófin séu föst í tíma.

/** ⚠ ORÐRÉTT sama regla og `virk` í ../worker/greidslur.mjs. Tvær talningar á sama hlut með ólíkri
 *  skilgreiningu enda alltaf á því að stangast á — og þá hættir maður að treysta báðum. */
export const VIRK = (st) => /active|trial|current/i.test(String(st || '')) && !/cancel|fail|expire|inactive/i.test(String(st || ''));

/** Fríprófun BER samning (sub2-leiðin stofnar hann í `trial`-stöðu) — hún er því ekki „gefins".
 *  En Áskell rukkar 0 meðan hún stendur, svo hún er ekki tekjur heldur. Þriðji flokkur. */
export const erFriprofun = (st) => /trial/i.test(String(st || ''));

export const ktHreint = (s) => String(s == null ? '' : s).replace(/\D/g, '');

// ⚠ Orðrétt úr ../worker/stjornbord.mjs:56-57 — þetta ER talan sem stjórnborðið sýnir í dag.
export const PRICE_TIER = { grunnur: 2900, fyrirtaeki: 6900, fyrirtaeki_plus: 12900 };
export const PRICE_SVC = { kvoti: 9900, utbod: 1900, frettir: 3900, fasteign: 3900, thingskyrslur: 3900 };

const fastVerd = (h) => (h && h.tegund === 'svc' ? (PRICE_SVC[h.vara] || 0) : (PRICE_TIER[h.vara] || 0));

/** Vísvitandi gjafaaðgangur — ALDREI misræmi. Rati hann í listann verður hann hávaði sem enginn les. */
const erGjof = (h) => !!(h && (h.free_access || h.is_admin || h.nemandi));

export function samstemma({ samningar = [], heimildir = [], verdskra = {}, now = 0 } = {}) {
  const nu = Number(now) || 0;
  const sList = (Array.isArray(samningar) ? samningar : []).filter((c) => c && VIRK(c.state));
  const hList = (Array.isArray(heimildir) ? heimildir : []).filter((h) => h && Number(h.until) > nu);

  // Lykill = kt + vara. Samningur getur borið fleiri en eitt `item`; hvert þeirra er sín vara.
  const sMap = new Map();
  for (const c of sList) {
    const kt = ktHreint(c.customer_reference);
    for (const it of (Array.isArray(c.items) ? c.items : [])) {
      const vara = String((it && it.product_reference) || '');
      if (!kt || !vara) continue;
      sMap.set(kt + '|' + vara, { kt, vara, state: c.state, verd: Number(it.price) || Number(verdskra[vara]) || 0 });
    }
  }
  const hMap = new Map();
  for (const h of hList) {
    const kt = ktHreint(h.kt);
    if (!kt || !h.vara) continue;
    hMap.set(kt + '|' + String(h.vara), h);
  }

  const misraemi = [], fripofanir = [];
  let mrrAskell = 0, mrrD1 = 0;

  for (const [lykill, s] of sMap) {
    const h = hMap.get(lykill);
    if (erFriprofun(s.state)) { fripofanir.push({ kt: s.kt, vara: s.vara, verd: s.verd }); continue; }
    mrrAskell += s.verd;
    if (!h) misraemi.push({ tegund: 'borgar_fyrir_ekkert', kt: s.kt, vara: s.vara, verd: s.verd, sidan: nu });
  }
  for (const [lykill, h] of hMap) {
    mrrD1 += fastVerd(h);
    if (sMap.has(lykill) || erGjof(h)) continue;
    misraemi.push({ tegund: 'gefins', kt: ktHreint(h.kt), vara: String(h.vara), verd: fastVerd(h), sidan: Number(h.until) || nu });
  }

  // Verðrek: aðeins fyrir vörur sem eiga fast verð í kóðanum. Vara utan beggja taflna hefur ekkert að
  // reka sig frá. ⚠ BÁÐAR töflurnar eru skoðaðar — þjónustuverð eru jafn harðkóðuð og þrepaverð og
  // reka sig eins.
  const verdrek = [];
  for (const [vara, askell] of Object.entries(verdskra || {})) {
    const fast = PRICE_TIER[vara] != null ? PRICE_TIER[vara] : PRICE_SVC[vara];
    if (fast != null && Number(askell) !== fast) verdrek.push({ vara, askell: Number(askell), fast });
  }

  return { misraemi, fripofanir, mrrAskell, mrrD1, verdrek };
}
```

- [ ] **Skref 4: Keyrðu prófin og staðfestu að þau standist**

Keyrsla (úr `web/`): `node --test src/lib/fjarmal.test.mjs`
Búist við: `pass 15`, `fail 0`.

- [ ] **Skref 5: Committa**

```bash
git add web/src/lib/fjarmal.mjs web/src/lib/fjarmal.test.mjs
git commit -m "Samstemming Áskels og D1 — fríprófun er þriðji flokkur, hvorki misræmi né tekjur"
```

---

### Verk 2: Endapunkturinn (`worker/fjarmal.mjs`)

**Skrár:**
- Búa til: `web/src/worker/fjarmal.mjs`
- Prófa: `web/src/worker/fjarmal.test.mjs`
- Breyta: `web/worker.js` (innflutningur við línu 29, leið við línu 3041)

**Viðmót:**
- Neytir: `samstemma` úr `../lib/fjarmal.mjs` (Verk 1).
- Framleiðir: `adminFjarmalHandler(request, env, ctx)` og `saekjaFjarmal(env, { thvinga })`.
  Svarform GET: `{ ok, fjarmal: { ok, error?, villa?, sott, misraemi, fripofanir, mrrAskell, mrrD1, verdrek }, rofi }`.
  ⚠ Villan er HREIÐRUÐ undir `fjarmal`, ekki á toppstigi — Verk 3 les hana þaðan.

- [ ] **Skref 1: Skrifaðu fallandi prófin**

Skrá `web/src/worker/fjarmal.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminFjarmalHandler, saekjaFjarmal } from './fjarmal.mjs';

const mkState = () => ({ sync: {}, users: { 8: { is_admin: 1 } }, subs: [], usr: [] });
function fakeDb(state) {
  const exec = (sql, args) => {
    if (/SELECT v, updated FROM stjorn_sync WHERE k='fjarmal'/.test(sql)) return state.sync.fjarmal || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('fjarmal'/.test(sql)) { state.sync.fjarmal = { v: args[0], updated: args[1] }; return { meta: {} }; }
    if (/^SELECT v FROM stjorn_sync WHERE k=\?$/.test(sql)) { const k = args[0]; return state.sync[k] != null ? { v: state.sync[k] } : null; }
    if (/FROM sub_service/.test(sql)) return { results: state.subs };
    if (/FROM users/.test(sql) && /tier/.test(sql)) return { results: state.usr };
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
    throw new Error('fakeDb: óþekkt SQL: ' + sql);
  };
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return exec(sql, a); }, async all() { return exec(sql, a); }, async run() { return exec(sql, a); } }; return st; } };
}
const mkEnv = (state, over = {}) => Object.assign(
  { TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó', ASKELL_PRIVATE_KEY: 'ak_test', GITHUB_DISPATCH_TOKEN: 'ghp_test' }, over);

function stubFetch(t, svor) {
  const orig = globalThis.fetch;
  let i = 0;
  globalThis.fetch = async () => {
    const s = Array.isArray(svor) ? (svor[Math.min(i++, svor.length - 1)]) : svor;
    if (s instanceof Error) throw s;
    return { ok: s.status === 200, status: s.status, json: async () => s.d, text: async () => JSON.stringify(s.d) };
  };
  t.after(() => { globalThis.fetch = orig; });
}
const bein = (b, headers = {}) => new Request('https://karp.is/api/admin/fjarmal', {
  method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://karp.is' }, headers), body: JSON.stringify(b),
});

test('án ASKELL_PRIVATE_KEY er svarið unconfigured — ekkert brotnar', async () => {
  const r = await saekjaFjarmal(mkEnv(mkState(), { ASKELL_PRIVATE_KEY: '' }), { thvinga: true });
  assert.deepEqual(r, { ok: false, error: 'unconfigured' });
});

test('Áskell niðri → síðasta þekkta mynd stendur og villan er merkt', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  await saekjaFjarmal(env, { thvinga: true });
  globalThis.fetch = async () => { throw new Error('net'); };
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.villa, 'askell');
});

test('svar sem er EKKI fylki telst villa, ekki tómur listi', async (t) => {
  // ⚠ Tómur listi og bilað svar líta eins út á spjaldinu — þá sýnist „engin misræmi" þegar ekkert var mælt.
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { villa: 'eitthvað' } });
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.villa, 'askell');
});

test('síðuflett: fleiri en 100 samningar nást allir', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const sida = (n, next) => ({ status: 200, d: { results: Array.from({ length: n }, (_, i) => ({ id: 'c' + i, customer_reference: '1234567890', state: 'active', items: [] })), next } });
  stubFetch(t, [sida(100, 'https://askell.is/api/v2/subscription-contracts/?page=2'), sida(20, null), { status: 200, d: { results: [] } }, { status: 200, d: { results: [] } }]);
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.ok, true);
});

test('X-Admin-Key MÁ lesa', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  const r = await adminFjarmalHandler(new Request('https://karp.is/api/admin/fjarmal', { headers: { 'X-Admin-Key': 'adm-key' } }), env, {});
  assert.equal((await r.json()).ok, true);
});

test('X-Admin-Key MÁ EKKI sækja né rétta Hrafni — það krefst lotu', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  for (const action of ['saekja', 'hrafn']) {
    const r = await adminFjarmalHandler(bein({ action }, { 'X-Admin-Key': 'adm-key' }), env, {});
    assert.equal((await r.json()).error, 'lota', action);
  }
});

test('ENGIN aðgerð sem hreyfir peninga kemst í gegn', async (t) => {
  // ⚠ Hvítalistinn er girðingin sjálf. Falli þetta próf hefur einhver opnað leið að peningum.
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  for (const action of ['greida', 'endurgreida', 'millifaera', 'segja_upp', 'cancel', 'refund']) {
    const r = await adminFjarmalHandler(bein({ action }, { 'X-Admin-Key': 'adm-key' }), env, {});
    const j = await r.json();
    assert.equal(j.ok, false, action + ' á ALDREI að takast');
  }
});

test('rofi_elin stöðvar dispatch en ALDREI lesturinn', async (t) => {
  const state = mkState(); state.sync.rofi_elin = '1';
  const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  const r = await adminFjarmalHandler(new Request('https://karp.is/api/admin/fjarmal', { headers: { 'X-Admin-Key': 'adm-key' } }), env, {});
  const j = await r.json();
  assert.equal(j.ok, true, 'lesturinn stendur — spjald sem slokknar alveg lítur út eins og bilun');
  assert.equal(j.rofi, true, 'og rofinn sést');
});
```

- [ ] **Skref 2: Keyrðu prófin og staðfestu að þau falli**

Keyrsla (úr `web/`): `node --test src/worker/fjarmal.test.mjs`
Búist við: FALL með `Cannot find module './fjarmal.mjs'`.

- [ ] **Skref 3: Skrifaðu útfærsluna**

Skrá `web/src/worker/fjarmal.mjs`:

```js
// fjarmal.mjs (worker) — vél fjármálastjórans Elínar: Áskels-samningar × D1-heimildir.
//
// ⚠⚠ ELÍN HREYFIR ALDREI PENINGA. Engar greiðslur, endurgreiðslur, millifærslur eða uppsagnir.
//    POST-leiðin hefur hvítalista og hafnar öllu öðru; próf fellur ef hann víkkar.
// ⚠ Öll top-level nöfn bera forskeytið _fj — ci_worker_bindings.mjs fellir CI ef nöfn rekast á.
import { _ajson } from './felag.mjs';
import { adminCsrfVilla, _ghDispatch } from './hjalp_agent.mjs';
import { readSession } from './auth.mjs';
import { samstemma } from '../lib/fjarmal.mjs';

const _fjNow = () => Math.floor(Date.now() / 1000);
const _FJ_FYRNING = 900;   // 15 mín — áskriftir hreyfast í dögum, ekki sekúndum
const _FJ_API = 'https://askell.is/api/v2';
// ⚠ Hvítalistinn ER girðingin. Bættu ALDREI við aðgerð sem snertir peninga.
const _FJ_ADGERDIR = ['saekja', 'hrafn'];

async function _fjGeymt(env) {
  const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='fjarmal'").first().catch(() => null);
  if (!r) return null;
  try { return { gogn: JSON.parse(r.v), uppfaert: Number(r.updated) }; } catch (e) { return null; }
}

async function _fjRofi(env) {
  const r = await env.TENGSL.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind('rofi_elin').first().catch(() => null);
  return !!(r && String(r.v) === '1');
}

async function _fjAdminUid(env, request) {
  const s = await readSession(request, env).catch(() => null);
  if (!s || !s.uid) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(s.uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? s.uid : 0;
}

/** Áskell síðuflettir. ⚠ Svar sem er ekki fylki er VILLA, ekki tómur listi — annars sýnist
 *  „engin misræmi" þegar ekkert var mælt. */
async function _fjSaekjaAllt(env, slod) {
  const H = { Authorization: 'Api-Key ' + env.ASKELL_PRIVATE_KEY, Accept: 'application/json' };
  const ut = [];
  let u = _FJ_API + slod, vordur = 0;
  while (u && vordur++ < 20) {
    const r = await fetch(u, { headers: H });
    if (!r.ok) throw new Error('askell ' + r.status);
    const d = await r.json();
    const hluti = Array.isArray(d) ? d : (d && Array.isArray(d.results) ? d.results : null);
    if (hluti == null) throw new Error('askell: svar er ekki fylki');
    ut.push(...hluti);
    u = (d && !Array.isArray(d) && d.next) ? d.next : null;
  }
  return ut;
}

export async function saekjaFjarmal(env, { thvinga = false } = {}) {
  if (!env.ASKELL_PRIVATE_KEY) return { ok: false, error: 'unconfigured' };
  const geymt = await _fjGeymt(env);
  if (!thvinga && geymt && geymt.uppfaert > _fjNow() - _FJ_FYRNING) return Object.assign({ ok: true, sott: geymt.uppfaert }, geymt.gogn);
  try {
    const nu = _fjNow();
    const [samningarR, verdR, subsR, usrR] = await Promise.allSettled([
      _fjSaekjaAllt(env, '/subscription-contracts/?page_size=100'),
      _fjSaekjaAllt(env, '/catalog/prices/?active=all'),
      env.TENGSL.prepare('SELECT s.user_id AS uid, u.kt AS kt, s.service AS vara, s.until AS until, s.askell_id AS askell_id, u.free_access AS free_access, u.is_admin AS is_admin, u.nemandi AS nemandi FROM sub_service s JOIN users u ON u.id = s.user_id WHERE s.until > ?').bind(nu).all(),
      env.TENGSL.prepare('SELECT id AS uid, kt, tier AS vara, tier_until AS until, tier_askell AS askell_id, free_access, is_admin, nemandi FROM users WHERE tier IS NOT NULL AND tier_until > ?').bind(nu).all(),
    ]);
    if (samningarR.status !== 'fulfilled') throw samningarR.reason || new Error('askell');
    const verdskra = {};
    if (verdR.status === 'fulfilled') {
      for (const p of verdR.value) {
        const ref = String((p && (p.reference || p.product_reference)) || '');
        const v = Number(p && (p.amount != null ? p.amount : p.price));
        if (ref && Number.isFinite(v)) verdskra[ref] = v;
      }
    }
    const heimildir = [
      ...((subsR.status === 'fulfilled' && subsR.value.results) || []).map((x) => Object.assign({}, x, { tegund: 'svc' })),
      ...((usrR.status === 'fulfilled' && usrR.value.results) || []).map((x) => Object.assign({}, x, { tegund: 'tier' })),
    ];
    const gogn = samstemma({ samningar: samningarR.value, heimildir, verdskra, now: nu });
    if (subsR.status !== 'fulfilled' || usrR.status !== 'fulfilled') gogn.villa = 'd1_hluti';
    await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('fjarmal', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
      .bind(JSON.stringify(gogn), nu).run().catch(() => {});
    return Object.assign({ ok: true, sott: nu }, gogn);
  } catch (e) {
    // Stöðnuð mynd er betri en engin — EN hún er ALLTAF merkt, svo spjaldið segi `óvíst` en ekki tölu.
    return Object.assign({ ok: true, villa: 'askell', sott: geymt ? geymt.uppfaert : 0 },
      (geymt && geymt.gogn) || { misraemi: [], fripofanir: [], mrrAskell: 0, mrrD1: 0, verdrek: [] });
  }
}

/** Auth: GET má með X-Admin-Key EÐA lotu. POST KREFST LOTU — báðar aðgerðirnar ákveða eitthvað
 *  (sækja ferskt kostar Áskels-köll; rétta Hrafni ræsir keyrslu). Lykill má lesa, ekki ákveða. */
export async function adminFjarmalHandler(request, env, ctx) {
  const key = request.headers.get('X-Admin-Key');
  const byKey = !!(key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY);
  const uid = byKey ? 0 : await _fjAdminUid(env, request);
  if (!byKey && !uid) return _ajson({ ok: false, error: 'admin' });

  if (request.method === 'GET') {
    const thvinga = new URL(request.url).searchParams.get('thvinga') === '1';
    const fjarmal = await saekjaFjarmal(env, { thvinga });
    return _ajson({ ok: true, fjarmal, rofi: await _fjRofi(env) });
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  if (!byKey) { const csrf = adminCsrfVilla(request); if (csrf) return _ajson({ ok: false, error: csrf }); }
  const b = (await request.json().catch(() => null)) || {};
  const action = String(b.action || '');
  if (!_FJ_ADGERDIR.includes(action)) return _ajson({ ok: false, error: 'adgerd' });
  if (!uid) return _ajson({ ok: false, error: 'lota' });
  if (await _fjRofi(env)) return _ajson({ ok: false, error: 'rofi' });

  if (action === 'saekja') return _ajson(await saekjaFjarmal(env, { thvinga: true }));
  // 'hrafn': AI-saminn texti sem BÍÐUR Arons — hann ýtir, keyrslan fer þá af stað.
  const verk = String(b.verk || '').slice(0, 2000);
  if (verk.length < 10) return _ajson({ ok: false, error: 'verk' });
  const sent = await _ghDispatch(env, 'cto', { verk });
  return _ajson(sent && sent.ok ? { ok: true } : { ok: false, error: 'dispatch' });
}
```

- [ ] **Skref 4: Keyrðu prófin og staðfestu að þau standist**

Keyrsla (úr `web/`): `node --test src/worker/fjarmal.test.mjs`
Búist við: `pass 8`, `fail 0`.

- [ ] **Skref 5: Skráðu leiðina í `web/worker.js`**

Bættu við innflutningi beint á eftir línu 29:

```js
import { adminFjarmalHandler } from './src/worker/fjarmal.mjs';   // 💰 fjármálastjóri: Áskell × D1, misræmi og MRR
```

Bættu við leið beint á eftir línu 3041:

```js
    if (url.pathname === '/api/admin/fjarmal') return adminFjarmalHandler(request, env, ctx);   // 💰 GET samstemming · POST saekja/hrafn
```

- [ ] **Skref 6: Keyrðu bindinga-hliðið**

Keyrsla (ÚR RÓT, ekki úr `web/`): `node skriptur/ci_worker_bindings.mjs`
Búist við: `✅ Öll nöfn leyst — engin laus tenging.`

- [ ] **Skref 7: Committa**

```bash
git add web/src/worker/fjarmal.mjs web/src/worker/fjarmal.test.mjs web/worker.js
git commit -m "Endapunktur Elínar — lykill má lesa, lota þarf til að ákveða, peningar hreyfast aldrei"
```

---

### Verk 3: Spjaldgögnin (`lib/stjorn/elin.mjs`)

**Skrár:**
- Búa til: `web/src/lib/stjorn/elin.mjs`
- Prófa: `web/src/lib/stjorn/elin.test.mjs`

**Viðmót:**
- Neytir: svar Verks 2 (`{ ok, fjarmal: {...}, rofi }`) og `bidurFyrir` úr `./bidur_thin.mjs`.
- Framleiðir: `elinGogn(svar, bidurListi, now)` → `{ stada, sidast, bidur, vinnsla, tolur, heimildir, rofi }`.

- [ ] **Skref 1: Skrifaðu fallandi prófin**

Skrá `web/src/lib/stjorn/elin.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elinGogn } from './elin.mjs';

const NU = Date.UTC(2026, 8, 16) / 1000;
// ⚠ HREIÐRAÐ eins og raunsvarið. bjarkiGogn las `svar.error` þegar raunsvarið bar `svar.postiz.error`
//   — „óstillt" hefði ALDREI birst, með sjö græn próf, af því fixtures voru flöt.
const svar = (fjarmal, rofi = false) => ({ ok: true, fjarmal, rofi });
const heilt = (yfir = {}) => Object.assign({ ok: true, sott: NU, misraemi: [], fripofanir: [], mrrAskell: 120000, mrrD1: 120000, verdrek: [] }, yfir);

test('MRR úr Áskeli er efsta talan þegar allt stemmir', () => {
  const g = elinGogn(svar(heilt()), [], NU);
  assert.equal(g.tolur[0].n, '120.000');
  assert.equal(g.tolur[0].s, '', 'enginn mismunur, engin undirlína');
});

test('náist ekki í Áskel stendur óvíst — ALDREI D1-talan ein', () => {
  // ⚠ Beinn lærdómur af hrafn.mjs: þrjú ástönd sýndu öll „main grænt" þegar ekkert svar barst.
  const g = elinGogn(svar(heilt({ villa: 'askell' })), [], NU);
  assert.equal(g.tolur[0].n, 'óvíst');
});

test('óstillt Áskell sést — villan er HREIÐRUÐ, ekki á toppstigi', () => {
  const g = elinGogn(svar({ ok: false, error: 'unconfigured' }), [], NU);
  assert.equal(g.tolur[0].n, 'óvíst');
  assert.match(g.stada, /óstillt/i);
});

test('mismunur á MRR birtist undir tölunni', () => {
  const g = elinGogn(svar(heilt({ mrrAskell: 100000, mrrD1: 120000 })), [], NU);
  assert.match(g.tolur[0].s, /20\.000/);
});

test('fríprófanir fá eigin flís — annars lítur bilið út eins og villa', () => {
  const g = elinGogn(svar(heilt({ mrrAskell: 0, mrrD1: 13800, fripofanir: [{ kt: '1', vara: 'fyrirtaeki', verd: 6900 }, { kt: '2', vara: 'fyrirtaeki', verd: 6900 }] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'í fríprófun');
  assert.equal(flis.n, '2');
  assert.match(flis.s, /13\.800/);
});

test('misræmi eru talin og sundurliðuð', () => {
  const g = elinGogn(svar(heilt({ misraemi: [
    { tegund: 'borgar_fyrir_ekkert', kt: '1234567890', vara: 'fyrirtaeki', verd: 6900, sidan: NU },
    { tegund: 'gefins', kt: '9876543210', vara: 'kvoti', verd: 9900, sidan: NU },
  ] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'misræmi');
  assert.equal(flis.n, '2');
  assert.match(flis.s, /1 borgar fyrir ekkert/);
  assert.match(flis.s, /1 fær gefins/);
});

test('raðir koma ÚR bidurListi, þær eru ekki smíðaðar hér', () => {
  // ⚠ Bjarki féll á þessu: raðirnar lágu utan bidurThin og sáust hvorki á forstofunni né á andlitinu.
  const bidur = [{ starfsmadur: 'elin', tegund: 'gefins', titill: 'x' }, { starfsmadur: 'hrafn', tegund: 'bilun', titill: 'y' }];
  const g = elinGogn(svar(heilt()), bidur, NU);
  assert.equal(g.bidur.length, 1);
  assert.equal(g.bidur[0].starfsmadur, 'elin');
});

test('kennitala er grímuð í vinnslulistanum', () => {
  const g = elinGogn(svar(heilt({ misraemi: [{ tegund: 'gefins', kt: '1234567890', vara: 'kvoti', verd: 9900, sidan: NU }] })), [], NU);
  assert.ok(!g.vinnsla.some((v) => v.texti.includes('1234567890')), 'full kennitala fer ALDREI í viðmótið');
  assert.ok(g.vinnsla.some((v) => v.texti.includes('123456')), 'fyrri hlutinn dugar til að þekkja');
});

test('rofinn skilar sér', () => {
  const g = elinGogn(svar(heilt(), true), [], NU);
  assert.deepEqual(g.rofi, { lykill: 'rofi_elin', off: true });
});
```

- [ ] **Skref 2: Keyrðu prófin og staðfestu að þau falli**

Keyrsla (úr `web/`): `node --test src/lib/stjorn/elin.test.mjs`
Búist við: FALL með `Cannot find module './elin.mjs'`.

- [ ] **Skref 3: Skrifaðu útfærsluna**

Skrá `web/src/lib/stjorn/elin.mjs`:

```js
// elin.mjs — HREIN eining: svar /api/admin/fjarmal → hólfin fimm á spjaldi Elínar (fjármálastjóri).
// Engin fetch, ekkert env, ekkert Date.now() — allt kemur með svarinu og með `now` frá kallanda.
//
// ⚠ Villan er HREIÐRUÐ: `svar.fjarmal.error` / `svar.fjarmal.villa`, ekki á toppstigi. bjarkiGogn las
//   rangt dýpi og „óstillt" hefði aldrei birst, með sjö græn próf, af því prófgögnin voru flöt.
import { bidurFyrir } from './bidur_thin.mjs';

const kr = (n) => Math.round(Number(n) || 0).toLocaleString('is-IS').replace(/,/g, '.');
/** ⚠ Full kennitala fer ALDREI í viðmótið — fyrri hlutinn dugar til að þekkja manneskjuna. */
const ktGrima = (kt) => String(kt || '').slice(0, 6) + '-••••';
const dagsTexti = (ts) => {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '. kl. ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
};
const TEXTI = { borgar_fyrir_ekkert: 'borgar fyrir ekkert', gefins: 'fær gefins' };

export function elinGogn(svar, bidurListi, now) {
  const s = (svar && typeof svar === 'object') ? svar : {};
  const f = (s.fjarmal && typeof s.fjarmal === 'object') ? s.fjarmal : {};
  const ostillt = f.error === 'unconfigured';
  const naest = !ostillt && !f.villa && f.ok !== false;   // náðist ferskt og villulaust
  const misraemi = Array.isArray(f.misraemi) ? f.misraemi : [];
  const frip = Array.isArray(f.fripofanir) ? f.fripofanir : [];

  const borga = misraemi.filter((m) => m && m.tegund === 'borgar_fyrir_ekkert').length;
  const gefins = misraemi.filter((m) => m && m.tegund === 'gefins').length;
  const mismunur = (Number(f.mrrD1) || 0) - (Number(f.mrrAskell) || 0);
  const fripVirdi = frip.reduce((a, x) => a + (Number(x && x.verd) || 0), 0);

  const stada = ostillt ? 'Áskell er óstilltur — engan lykil að finna'
    : f.villa === 'askell' ? 'náði ekki í Áskel — talan er óviss'
      : f.villa === 'd1_hluti' ? 'náði í Áskel en ekki alla heimildalista'
        : misraemi.length ? misraemi.length + ' misræmi milli Áskels og réttinda'
          : 'Áskell og réttindin stemma';

  const vinnsla = misraemi.slice().sort((a, b) => (a.sidan || 0) - (b.sidan || 0)).slice(0, 5).map((m) => ({
    texti: ktGrima(m.kt) + ' · ' + (m.vara || '') + ' · ' + (TEXTI[m.tegund] || m.tegund) + ' · ' + kr(m.verd) + ' kr/mán',
    hvenaer: dagsTexti(m.sidan),
  }));

  return {
    stada,
    sidast: dagsTexti(f.sott),
    bidur: bidurFyrir(bidurListi, 'elin'),
    vinnsla,
    tolur: [
      { n: naest ? kr(f.mrrAskell) : 'óvíst', l: 'kr/mán rukkað', s: (naest && mismunur) ? kr(Math.abs(mismunur)) + ' kr munur á réttindum' : '' },
      { n: String(misraemi.length), l: 'misræmi', s: misraemi.length ? borga + ' borgar fyrir ekkert · ' + gefins + ' fær gefins' : '' },
      { n: String(frip.length), l: 'í fríprófun', s: frip.length ? 'verða ' + kr(fripVirdi) + ' kr/mán haldi þeir áfram' : '' },
      { n: String((Array.isArray(f.verdrek) ? f.verdrek : []).length), l: 'verðrek', s: '' },
    ],
    heimildir: [
      'les Áskel og réttindin í D1 og ber saman',
      'sækir ferskt þegar þú biður um það',
      'réttir Hrafni misræmi sem krefst kóðabreytingar — bíður þín',
      'hreyfir aldrei peninga',
    ],
    rofi: { lykill: 'rofi_elin', off: !!s.rofi },
  };
}
```

- [ ] **Skref 4: Keyrðu prófin og staðfestu að þau standist**

Keyrsla (úr `web/`): `node --test src/lib/stjorn/elin.test.mjs`
Búist við: `pass 9`, `fail 0`.

- [ ] **Skref 5: Committa**

```bash
git add web/src/lib/stjorn/elin.mjs web/src/lib/stjorn/elin.test.mjs
git commit -m "Spjald Elínar — óvíst þegar Áskell næst ekki, aldrei D1-talan ein"
```

---

### Verk 4: Fjórða uppsprettan í „bíður þín"

**Skrár:**
- Breyta: `web/src/lib/stjorn/bidur_thin.mjs` (bæta við `fjarmal` í viðfang `bidurThin`)
- Prófa: `web/src/lib/stjorn/bidur_thin.test.mjs` (til fyrir — bæta við)

**Viðmót:**
- Neytir: svar Verks 2.
- Framleiðir: fjórar nýjar raðtegundir undir `starfsmadur: 'elin'` —
  `borgar_fyrir_ekkert`, `gefins`, `rennur_ut`, `uppsogn`.

- [ ] **Skref 1: Skrifaðu fallandi prófin**

Bættu aftast í `web/src/lib/stjorn/bidur_thin.test.mjs`:

```js
// ── Elín: fjórða uppsprettan ────────────────────────────────────────────────────────────────────
// ⚠ Raðirnar VERÐA að smíðast HÉR en ekki í elin.mjs — annars sér forstofan þær ekki og talan á
//   andlitinu verður núll þótt eitthvað bíði. Bjarki féll nákvæmlega á þessu.
const NU_E = Date.UTC(2026, 8, 16) / 1000;

test('misræmi Elínar rata á forstofuna', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, misraemi: [
    { tegund: 'borgar_fyrir_ekkert', kt: '1234567890', vara: 'fyrirtaeki', verd: 6900, sidan: NU_E - 100 },
    { tegund: 'gefins', kt: '9876543210', vara: 'kvoti', verd: 9900, sidan: NU_E - 200 },
  ] } } });
  const elin = r.filter((x) => x.starfsmadur === 'elin');
  assert.equal(elin.length, 2);
  assert.ok(elin.every((x) => x.slod === '#elin'));
  assert.ok(elin.some((x) => x.tegund === 'borgar_fyrir_ekkert'));
  assert.ok(elin.some((x) => x.tegund === 'gefins'));
});

test('full kennitala fer ALDREI í rað-titilinn', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, misraemi: [
    { tegund: 'gefins', kt: '1234567890', vara: 'kvoti', verd: 9900, sidan: NU_E },
  ] } } });
  assert.ok(!r.some((x) => String(x.titill + x.vidbot).includes('1234567890')));
});

test('áskrift sem rennur út innan viku bíður þín, sú sem rennur út eftir mánuð ekki', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, rennurUt: [
    { kt: '1234567890', vara: 'fyrirtaeki', until: NU_E + 3 * 86400 },
    { kt: '9876543210', vara: 'kvoti', until: NU_E + 25 * 86400 },
  ] } } });
  const ut = r.filter((x) => x.tegund === 'rennur_ut');
  assert.equal(ut.length, 1);
});

test('ekkert fjarmal-svar fellir ekki listann', () => {
  assert.doesNotThrow(() => bidurThin({ now: NU_E }));
  assert.doesNotThrow(() => bidurThin({ now: NU_E, fjarmal: null }));
  assert.doesNotThrow(() => bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: false, error: 'unconfigured' } } }));
});
```

- [ ] **Skref 2: Keyrðu prófin og staðfestu að þau falli**

Keyrsla (úr `web/`): `node --test src/lib/stjorn/bidur_thin.test.mjs`
Búist við: FALL — engar `elin`-raðir skila sér.

- [ ] **Skref 3: Bættu `rennurUt` við worker-svarið**

Í `web/src/worker/fjarmal.mjs`, inni í `saekjaFjarmal` beint á eftir `const gogn = samstemma(...)`:

```js
    // ⚠ Reiknað HÉR en ekki í samstemma(): þetta er ekki misræmi heldur dagatal, og samstemma á að
    //   halda sig við eitt hlutverk — að bera saman tvo lista.
    // ⚠ Allt innan 30 daga fer með; vikumörkin eru sía í bidur_thin. Væru þau sett hér sæi spjaldið
    //   aldrei mánuðinn og „endurnýjast"-flísin yrði alltaf sama talan og „bíður þín".
    gogn.rennurUt = heimildir
      .filter((h) => Number(h.until) > nu && Number(h.until) <= nu + 30 * 86400)
      .map((h) => ({ kt: String(h.kt || ''), vara: String(h.vara || ''), until: Number(h.until) }))
      .sort((a, b) => a.until - b.until)
      .slice(0, 40);
```

- [ ] **Skref 4: Bættu uppsprettunni við `bidurThin`**

Í `web/src/lib/stjorn/bidur_thin.mjs`, breyttu undirskriftinni:

```js
export function bidurThin({ tickets = {}, bilanir = [], now = 0, markads = null, fjarmal = null } = {}) {
```

og bættu þessari blokk inn beint á undan `return ut` (á eftir markaðsefna-blokkinni):

```js
  // 💰 Fjármál: misræmi milli Áskels og réttinda, og áskriftir sem renna út innan viku. Þetta á heima
  //    HÉR en ekki inni í spjaldinu — annars sæi forstofan þær ekki og talan á andlitinu yrði núll.
  // ⚠ Full kennitala fer ALDREI í titil — fyrri hlutinn dugar til að þekkja manneskjuna.
  const fj = (fjarmal && typeof fjarmal === 'object' && fjarmal.fjarmal && typeof fjarmal.fjarmal === 'object') ? fjarmal.fjarmal : null;
  if (fj) {
    const grima = (kt) => String(kt || '').slice(0, 6) + '-••••';
    const krT = (n) => Math.round(Number(n) || 0).toLocaleString('is-IS').replace(/,/g, '.');
    const TXT = {
      borgar_fyrir_ekkert: ['Borgar fyrir ekkert', 'rukkað í Áskeli en engin réttindi'],
      gefins: ['Fær gefins', 'réttindi án virks samnings'],
    };
    for (const m of (Array.isArray(fj.misraemi) ? fj.misraemi : [])) {
      const t = m && TXT[m.tegund];
      if (!t) continue;
      ut.push(rod('elin', m.tegund, t[0] + ': ' + grima(m.kt) + ' · ' + (m.vara || ''), t[1] + ' · ' + krT(m.verd) + ' kr/mán', m.sidan || nu, '#elin'));
    }
    for (const r of (Array.isArray(fj.rennurUt) ? fj.rennurUt : [])) {
      if (!r || Number(r.until) > nu + 7 * 86400) continue;   // mánuðurinn sést á spjaldinu, vikan bíður þín
      ut.push(rod('elin', 'rennur_ut', 'Rennur út: ' + grima(r.kt) + ' · ' + (r.vara || ''), 'innan viku', nu, '#elin'));
    }
  }
```

- [ ] **Skref 5: Keyrðu prófin og staðfestu að þau standist**

Keyrsla (úr `web/`): `node --test src/lib/stjorn/bidur_thin.test.mjs`
Búist við: öll græn, þar á meðal fjögur ný.

- [ ] **Skref 6: Committa**

```bash
git add web/src/lib/stjorn/bidur_thin.mjs web/src/lib/stjorn/bidur_thin.test.mjs web/src/worker/fjarmal.mjs
git commit -m "Raðir Elínar smíðast í bidurThin — annars sæi forstofan þær aldrei"
```

⚠ `uppsogn`-raðtegundin úr hönnuninni er **vísvitandi ekki hér**: hún krefst þess að geyma „síðast séð"
í `stjorn_sync` og bera saman milli lestra. Það er eigin verk og bíður þess að fyrsta mælingin sýni
hvort uppsagnir séu yfirleitt sýnilegar í Áskels-svarinu. Sjá „Utan umfangs" neðst.

---

### Verk 5: Andlitið á /stjorn/

**Skrár:**
- Breyta: `web/src/lib/personur.mjs` (línur 30 og 85)
- Breyta: `web/src/pages/stjorn.astro` (línur 378, 383, 384, 405, 409, 778, 779)
- Prófa: `web/src/lib/personur.test.mjs` (til fyrir — bæta við)

**Viðmót:**
- Neytir: `elinGogn` (Verk 3), `bidurThin` með `fjarmal` (Verk 4), `/api/admin/fjarmal` (Verk 2).
- Framleiðir: fjórða andlitið í röndinni og virka skúffu á `#elin`.

- [ ] **Skref 1: Skrifaðu fallandi prófið**

Bættu aftast í `web/src/lib/personur.test.mjs`:

```js
test('Elín hefur rofa og heitir fjármálastjóri á íslensku', () => {
  // ⚠ Hrafn fór úr „CTO" í „forritari" að beiðni Arons — sama íslenskun gildir hér.
  assert.equal(rofiLykill('elin'), 'rofi_elin');
  assert.equal(persona('elin').hlutverk, 'fjármálastjóri');
});
```

- [ ] **Skref 2: Keyrðu prófið og staðfestu að það falli**

Keyrsla (úr `web/`): `node --test src/lib/personur.test.mjs`
Búist við: FALL — `rofiLykill('elin')` skilar `null` og hlutverkið er `'CFO'`.

- [ ] **Skref 3: Breyttu `personur.mjs`**

Lína 30, breyttu hlutverkinu:

```js
    id: 'elin', nafn: 'Elín', hlutverk: 'fjármálastjóri', emoji: '💰', kyn: 'kvk', litur: '#f6b13b',
```

Lína 85, bættu Elínu í rofakortið:

```js
export const ROFAR = { sigrun: 'hjalp_agent_off', hrafn: 'rofi_hrafn', bjarki: 'rofi_bjarki', elin: 'rofi_elin' };
```

- [ ] **Skref 4: Keyrðu prófið og staðfestu að það standist**

Keyrsla (úr `web/`): `node --test src/lib/personur.test.mjs`
Búist við: allt grænt.

- [ ] **Skref 5: Tengdu spjaldið í `stjorn.astro`**

Lína 378, bættu við innflutningi beint á eftir `bjarkiGogn`:

```js
    import { elinGogn } from '../lib/stjorn/elin.mjs';
```

Lína 383, bættu Elínu aftast:

```js
    const STARFSMENN = ['sigrun', 'hrafn', 'bjarki', 'elin'];
```

Lína 384, bættu við geymslu fyrir síðasta svar:

```js
    let sidastaSvar = null, sidustuBilanir = { ok: false, bilanir: [] }, sidastaMarkads = { ok: false }, sidastaFjarmal = { ok: false };
```

Línur 405 og 779, bættu `fjarmal` við BÁÐA `bidurThin`-kallana (þeir eru tveir — annar í `teiknaSpjald`,
hinn í `boot`; gleymist annar þeirra hverfa raðirnar í öðru hvoru samhenginu):

```js
      const bidur = bidurThin({ tickets: d.tickets || {}, bilanir: sidustuBilanir.bilanir || [], markads: sidastaMarkads, fjarmal: sidastaFjarmal, now: nu });
```

Lína 409, bættu við greininni fyrir Elínu:

```js
        : id === 'bjarki' ? bjarkiGogn(sidastaMarkads, bidur, nu)
          : elinGogn(sidastaFjarmal, bidur, nu);
```

Lína 778, sæktu svarið samhliða hinum:

```js
      sidastaFjarmal = await fetch('/api/admin/fjarmal', { credentials: 'include' }).then((r) => r.json()).catch(() => ({ ok: false }));
```

- [ ] **Skref 6: Byggðu og staðfestu**

Keyrsla (úr `web/`): `npx astro build`
Búist við: `Complete!` og 4254+ síður.

⚠ Ef spjaldið teiknast tómt í vafra en byggingin er græn: `.stj-*`-reglur VERÐA að liggja í
`<style is:global>`. Astro tré-hristir scoped CSS sem aðeins er notað í `innerHTML` á keyrslutíma.

- [ ] **Skref 7: Committa**

```bash
git add web/src/lib/personur.mjs web/src/lib/personur.test.mjs web/src/pages/stjorn.astro
git commit -m "Fjórða andlitið — Elín fjármálastjóri á /stjorn/"
```

---

### Verk 6: Heildarverifun og útgáfa

**Skrár:** engar nýjar.

- [ ] **Skref 1: Öll hliðin**

```bash
cd web && npm test
```
Búist við: `pass 885` (848 + 15 + 8 + 9 + 4 + 1 = 37 ný), `fail 0`.

⚠ Stemmi talan ekki er það merki, ekki formsatriði: annaðhvort gleymdist prófskrá eða próf sem átti að
falla stóðst af tilviljun. Teldu muninn áður en þú heldur áfram.

```bash
node skriptur/ci_worker_bindings.mjs
```
(ÚR RÓT.) Búist við: `✅ Öll nöfn leyst — engin laus tenging.`

```bash
cd web && npx astro build
```
Búist við: `Complete!`

```bash
cd web && npx wrangler deploy --dry-run
```
Búist við: `--dry-run: exiting now.`

- [ ] **Skref 2: Ýttu út**

```bash
git fetch origin && git rebase origin/main && git push origin hjalp-agent:main
```

⚠ `origin/main` hreyfist af sjálfu sér — `karp-bot` ýtir gagnauppfærslum nokkrum sinnum á dag. Rebase
fyrst, alltaf. ⚠ Keyrðu `git checkout -- web/.astro/` fyrst ef byggingin skildi eftir línuskila-breytingar
í kynslóðaskrám.

- [ ] **Skref 3: Bíddu deploysins og mældu í lofti**

Bíddu þar til `Workers Builds: karp21` er `completed/success` á commit-inu:

```bash
gh api repos/aronheidar/KARP-2.0/commits/<sha>/check-runs -q '.check_runs[] | select(.name=="Workers Builds: karp21") | .status + "/" + (.conclusion // "-")'
```

⚠ `Workers Builds: karp2` fellur ALLTAF — það er dauð eldri þjónusta, ekki bilun.

Sæktu svo fyrstu raunmælinguna:

```bash
curl -s -H "X-Admin-Key: $KARP_ADMIN_KEY" 'https://karp.is/api/admin/fjarmal?thvinga=1'
```

Búist við: `fjarmal.ok: true`. **Þetta er fyrsta mælingin á bilinu milli D1 og Áskels og engin
spá er til um hana** — hönnunin gerir ekki ráð fyrir neinni tiltekinni tölu.

- [ ] **Skref 4: Farðu yfir niðurstöðuna með Aroni áður en lengra er haldið**

Þrennt þarf mannlegt mat:

1. Eru misræmin raunveruleg, eða vantar undanþágu sem við sáum ekki? Listi sem er fullur af fólki í
   réttri stöðu verður hávaði sem enginn les, og þá er spjaldið verra en ekkert.
2. Stemmir `mrrAskell` við það sem Áskell sjálfur sýnir í sínu viðmóti?
3. Er verðrekið raunverulegt, eða les `catalog/prices` annað snið en við gerum ráð fyrir?

---

## Utan umfangs

- **Teya og Arion-bankareikningur.** Rökstutt í hönnuninni: Arion gefur okkur Open Data en ekki eigin
  reikning (þarf PSD2-leyfi eða Business-samning með skilríkjum), og Teya hefur enga skýrsluleið.
- **Greiðslufærslur, mislukkaðar greiðslur og endurgreiðslur.** Engin greiðslutafla er til í D1 og
  óstaðfest hvort Áskell birti þær í API.
- **`uppsogn`-raðtegundin.** Krefst „síðast séð"-geymslu og samanburðar milli lestra; bíður þess að
  fyrsta mælingin sýni hvort uppsagnir séu sýnilegar í svarinu yfirleitt.
- **Spár og áætlanir.** Elín mælir það sem er.
- **Unnur, Hildur og Egill.**
