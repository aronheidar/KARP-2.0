import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminFjarmalHandler, saekjaFjarmal } from './fjarmal.mjs';
import { _hmac } from './felag.mjs';

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

// ── Viðbót umfram briefið (9.) ───────────────────────────────────────────────────────────────────
// Öll átta prófin hér að ofan nota EINGÖNGU X-Admin-Key — ekkert þeirra fer um kökulotuna
// (readSession). Væri _fjAdminUid í ranga átt (röng röð á (env, request) eða röng lögun á
// skilagildinu — sjá auth.mjs: readSession skilar TÖLU, ekki hlut með .uid) myndu ÖLL átta
// standast óbreytt en innskráður stjórnandi á /stjorn/ fengi samt `admin`/`lota` á HVERJU kalli,
// að eilífu, í hljóði. Þetta próf er beint afrit af mynstrinu í `bilanir.mjs`/`hjalp_agent.test.mjs`.
test('innskráður stjórnandi (kökulota, EKKI X-Admin-Key) má bæði lesa og senda hvítlistaða aðgerð', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const cookie = 'karp_session=' + encodeURIComponent(8 + '.' + exp + '.' + await _hmac(env, 8 + '.' + exp));
  const rGet = await adminFjarmalHandler(new Request('https://karp.is/api/admin/fjarmal', { headers: { Cookie: cookie } }), env, {});
  assert.equal((await rGet.json()).ok, true, 'GET um lotu án X-Admin-Key');
  const rPost = await adminFjarmalHandler(bein({ action: 'saekja' }, { Cookie: cookie }), env, {});
  assert.equal((await rPost.json()).ok, true, 'POST saekja um lotu án X-Admin-Key');
});

test('kökulota sem er EKKI stjórnandi fær admin, ekki aðgang', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const cookie = 'karp_session=' + encodeURIComponent(9 + '.' + exp + '.' + await _hmac(env, 9 + '.' + exp));
  const r = await adminFjarmalHandler(new Request('https://karp.is/api/admin/fjarmal', { headers: { Cookie: cookie } }), env, {});
  assert.equal((await r.json()).error, 'admin');
});
