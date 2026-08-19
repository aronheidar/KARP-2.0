// leikstjori.test.mjs — leikstjóra-leyfi RÁS-leiksins (Verk A, 19.8.2026): prófar leikstjoriOf() í
// worker/auth.mjs — það sem worker-dispatch /api/leikur/* notar til að leiða gameUser.leikstjori —
// með mock-D1 (sama mynstur og önnur worker-próf: tilbúið env.TENGSL með prepare/bind/first).
//
// Reglan: kerfisstjóri (is_admin=1) eða frí-aðgangur (free_access=1) → leikstjóri án D1; annars
// VIRK 'leikur'-röð í sub_service á ACCOUNT-EIGANDANUM (accountOwner: parent_account_id || sjálfur)
// með NÁKVÆMLEGA sömu SELECT-setningu og kvótavaktin/þingskýrslur/fasteign gæta sínar þjónustur með.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _svcOk, leikstjoriOf } from '../src/worker/auth.mjs';

const NOW = 1_800_000_000;
const KVOTI_SELECT = 'SELECT * FROM sub_service WHERE user_id=? AND service=? AND until>?';

// Mock-D1: users-tafla (fyrir accountOwner) + sub_service-tafla; skráir hverja SELECT (sql+args) í `log`.
function mockD1({ users = [], subs = [] } = {}) {
  const log = [];
  const first = (sql, args) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    log.push({ sql: s, args });
    if (s.startsWith('SELECT * FROM users WHERE id=?')) return users.find((u) => u.id === args[0]) || null;
    if (s === KVOTI_SELECT) return subs.find((r) => r.user_id === args[0] && r.service === args[1] && r.until > args[2]) || null;
    throw new Error('óvænt SQL í prófi: ' + s);
  };
  const prep = (sql) => ({ bind: (...args) => ({ first: async () => first(sql, args), all: async () => ({ results: [] }), run: async () => ({ meta: {} }) }) });
  return { prepare: prep, log };
}
const envOf = (d1) => ({ TENGSL: d1 });
const NEI = { leikstjori: false, source: null, until: null };

test('_svcOk: leikur er gild þjónustu-vara (Áskell service → grantSubD1 → sub_service)', () => {
  assert.equal(_svcOk('leikur'), true);
  assert.equal(_svcOk('kvoti'), true);     // eldri listi ósnertur
  assert.equal(_svcOk('leikstjori'), false);
  assert.equal(_svcOk(''), false);
});

test('leikstjoriOf: enginn notandi → false, engin D1-fyrirspurn', async () => {
  const d1 = mockD1();
  assert.deepEqual(await leikstjoriOf(envOf(d1), null, NOW), NEI);
  assert.deepEqual(await leikstjoriOf(envOf(d1), undefined, NOW), NEI);
  assert.equal(d1.log.length, 0);
});

test('leikstjoriOf: kerfisstjóri → source admin, until null, EKKERT D1-kall', async () => {
  const d1 = mockD1();
  const r = await leikstjoriOf(envOf(d1), { id: 8, is_admin: 1, free_access: 0, parent_account_id: null }, NOW);
  assert.deepEqual(r, { leikstjori: true, source: 'admin', until: null });
  assert.equal(d1.log.length, 0);
});

test('leikstjoriOf: frí-aðgangur (notandi(frítt)) → source free, EKKERT D1-kall', async () => {
  const d1 = mockD1();
  const r = await leikstjoriOf(envOf(d1), { id: 19, is_admin: 0, free_access: 1, parent_account_id: null }, NOW);
  assert.deepEqual(r, { leikstjori: true, source: 'free', until: null });
  assert.equal(d1.log.length, 0);
});

test('leikstjoriOf: nemandi/venjulegur án sub_service-raðar → false', async () => {
  const d1 = mockD1({ subs: [{ user_id: 5, service: 'kvoti', until: NOW + 1000 }] });   // önnur þjónusta telst EKKI
  const r = await leikstjoriOf(envOf(d1), { id: 5, is_admin: 0, free_access: 0, nemandi: 1, parent_account_id: null }, NOW);
  assert.deepEqual(r, NEI);
});

test('leikstjoriOf: virk leikur-röð á notandanum sjálfum → source service + until úr röðinni', async () => {
  const d1 = mockD1({ subs: [{ user_id: 5, service: 'leikur', until: NOW + 30 * 86400, askell_id: 'x' }] });
  const r = await leikstjoriOf(envOf(d1), { id: 5, is_admin: 0, free_access: 0, parent_account_id: null }, NOW);
  assert.deepEqual(r, { leikstjori: true, source: 'service', until: NOW + 30 * 86400 });
});

test('leikstjoriOf: ÚTRUNNIN leikur-röð (until<=now) → false', async () => {
  const d1 = mockD1({ subs: [{ user_id: 5, service: 'leikur', until: NOW - 1 }] });
  assert.deepEqual(await leikstjoriOf(envOf(d1), { id: 5, is_admin: 0, free_access: 0, parent_account_id: null }, NOW), NEI);
  const d2 = mockD1({ subs: [{ user_id: 5, service: 'leikur', until: NOW }] });   // jaðar: until>now er STRANGT
  assert.deepEqual(await leikstjoriOf(envOf(d2), { id: 5, is_admin: 0, free_access: 0, parent_account_id: null }, NOW), NEI);
});

test('leikstjoriOf: SELECT-setningin er NÁKVÆMLEGA kvótavaktar-mynstrið, bundin (uid, leikur, now)', async () => {
  const d1 = mockD1({ subs: [] });
  await leikstjoriOf(envOf(d1), { id: 5, is_admin: 0, free_access: 0, parent_account_id: null }, NOW);
  const q = d1.log.find((l) => l.sql.includes('sub_service'));
  assert.ok(q, 'sub_service-fyrirspurn keyrð');
  assert.equal(q.sql, KVOTI_SELECT);
  assert.deepEqual(q.args, [5, 'leikur', NOW]);
  assert.equal(d1.log.length, 1, 'aðeins EIN auka D1-fyrirspurn f. sjálfstæðan notanda');
});

test('leikstjoriOf: sæta-sameign — meðlimur erfir leikur-áskrift account-EIGANDANS (accountOwner)', async () => {
  const owner = { id: 100, is_admin: 0, free_access: 0, parent_account_id: null, tier: 'fyrirtaeki', tier_until: NOW + 9999 };
  const member = { id: 101, is_admin: 0, free_access: 0, parent_account_id: 100 };
  const d1 = mockD1({ users: [owner, member], subs: [{ user_id: 100, service: 'leikur', until: NOW + 500 }] });
  const r = await leikstjoriOf(envOf(d1), member, NOW);
  assert.deepEqual(r, { leikstjori: true, source: 'service', until: NOW + 500 });
  const q = d1.log.find((l) => l.sql === KVOTI_SELECT);
  assert.deepEqual(q.args, [100, 'leikur', NOW], 'sub_service flett upp á EIGANDA (100), ekki meðlim (101)');
});

test('leikstjoriOf: meðlimur þar sem EIGANDI hefur enga leikur-röð → false (röð á meðlimnum sjálfum telst ekki — samræmi: allar þjónustur lesa sub_service á accountId/eiganda)', async () => {
  const owner = { id: 100, is_admin: 0, free_access: 0, parent_account_id: null };
  const member = { id: 101, is_admin: 0, free_access: 0, parent_account_id: 100 };
  const d1 = mockD1({ users: [owner, member], subs: [{ user_id: 101, service: 'leikur', until: NOW + 500 }] });
  assert.deepEqual(await leikstjoriOf(envOf(d1), member, NOW), NEI);
});

test('leikstjoriOf: ÖFUGT lekur EKKI — eigandi erfir ekki leikur-röð meðlims (rýni 19.8)', async () => {
  const owner = { id: 100, is_admin: 0, free_access: 0, parent_account_id: null };
  const member = { id: 101, is_admin: 0, free_access: 0, parent_account_id: 100 };
  const d1 = mockD1({ users: [owner, member], subs: [{ user_id: 101, service: 'leikur', until: NOW + 500 }] });
  assert.deepEqual(await leikstjoriOf(envOf(d1), owner, NOW), NEI);
  const q = d1.log.find((l) => l.sql === KVOTI_SELECT);
  assert.deepEqual(q.args, [100, 'leikur', NOW], 'eigandi flettir AÐEINS upp á sjálfum sér');
  assert.equal(d1.log.length, 1, 'eigandi (enginn parent) → engin users-uppfletting');
});

test('leikstjoriOf: samanburðurinn until>now er í epoch-SEKÚNDUM (jaðar ±1 s) — sama eining og grantSubD1/sub2/admin-grant skrifa', async () => {
  // Allir skrifarar (grantSubD1 vefkrókur, sub2ConfirmHandler, stjórnborð admin-grant) skrifa until í epoch-SEKÚNDUM; now er Math.floor(Date.now()/1000).
  const d1 = mockD1({ subs: [{ user_id: 5, service: 'leikur', until: NOW + 1 }] });
  assert.equal((await leikstjoriOf(envOf(d1), { id: 5, is_admin: 0, free_access: 0, parent_account_id: null }, NOW)).leikstjori, true);
  assert.equal((await leikstjoriOf(envOf(d1), { id: 5, is_admin: 0, free_access: 0, parent_account_id: null }, NOW + 1)).leikstjori, false, 'sekúndu síðar útrunnið');
});

test('leikstjoriOf: meðlimur með is_admin=1 → admin án D1 (eigin flagg gengur fyrir)', async () => {
  const d1 = mockD1();
  const r = await leikstjoriOf(envOf(d1), { id: 101, is_admin: 1, free_access: 0, parent_account_id: 100 }, NOW);
  assert.deepEqual(r, { leikstjori: true, source: 'admin', until: null });
  assert.equal(d1.log.length, 0);
});

test('leikstjoriOf: D1-villa (prepare kastar) → fail-closed false, ekki kast', async () => {
  const env = { TENGSL: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1 7403'); } }) }) } };
  assert.deepEqual(await leikstjoriOf(env, { id: 5, is_admin: 0, free_access: 0, parent_account_id: null }, NOW), NEI);
});

test('leikstjoriOf: ekkert env.TENGSL → false fyrir venjulegan, admin samt true', async () => {
  assert.deepEqual(await leikstjoriOf({}, { id: 5, is_admin: 0, free_access: 0 }, NOW), NEI);
  assert.deepEqual(await leikstjoriOf(undefined, { id: 5, is_admin: 0, free_access: 0 }, NOW), NEI);
  assert.equal((await leikstjoriOf({}, { id: 8, is_admin: 1 }, NOW)).source, 'admin');
});

test('leikstjoriOf: now sleppt → notar núverandi tíma (röð í framtíð gildir, útrunnin ekki)', async () => {
  const real = Math.floor(Date.now() / 1000);
  const d1 = mockD1({ subs: [{ user_id: 5, service: 'leikur', until: real + 3600 }] });
  assert.equal((await leikstjoriOf(envOf(d1), { id: 5, is_admin: 0, free_access: 0, parent_account_id: null })).leikstjori, true);
  const d2 = mockD1({ subs: [{ user_id: 5, service: 'leikur', until: real - 3600 }] });
  assert.equal((await leikstjoriOf(envOf(d2), { id: 5, is_admin: 0, free_access: 0, parent_account_id: null })).leikstjori, false);
});
