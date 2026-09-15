import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminMarkadsefniHandler, saekjaPostiz, samstillaEfni } from './markadsefni.mjs';
import { _hmac } from './felag.mjs';

const LI = 'cmt92pcw000r9p20yv7b53018', EWB = 'cmpvni6bb00hpmt0yuatcjamo';
function fakeDb(state) {
  const exec = (sql, args) => {
    if (/SELECT v, updated FROM stjorn_sync WHERE k='postiz'/.test(sql)) return state.postiz || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('postiz'/.test(sql)) { state.postiz = { v: args[0], updated: args[1] }; return { meta: {} }; }
    if (/^SELECT .* FROM markadsefni/.test(sql)) return { results: state.efni };
    if (/^INSERT INTO markadsefni/.test(sql)) { state.efni.push({ id: state.efni.length + 1, titill: args[1], postiz_id: args[7], birt: args[9] }); return { meta: { last_row_id: state.efni.length } }; }
    if (/^UPDATE markadsefni SET/.test(sql)) { state.uppfaert = (state.uppfaert || 0) + 1; return { meta: {} }; }
    if (/SELECT title, body, ts FROM news/.test(sql)) return { results: state.news || [] };
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
    throw new Error('fakeDb: óþekkt SQL: ' + sql);
  };
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return exec(sql, a); }, async all() { return exec(sql, a); }, async run() { return exec(sql, a); } }; return st; } };
}
const mkState = () => ({ efni: [], news: [], users: { 8: { is_admin: 1 }, 9: { is_admin: 0 } } });
const mkEnv = (state, over = {}) => Object.assign({ TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó', POSTIZ_API_KEY: 'pk_test' }, over);
function stubFetch(t, svar) {
  const log = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    log.push({ url: String(url), headers: (opts && opts.headers) || {} });
    if (svar instanceof Error) throw svar;
    return { ok: svar.status === 200, status: svar.status || 200, json: async () => svar.d };
  };
  t.after(() => { globalThis.fetch = orig; });
  return log;
}
const faersla = (id, group, rasId, iso, state = 'QUEUE') => ({ id, group, state, content: 'Texti', publishDate: iso, integration: { id: rasId, providerIdentifier: 'linkedin-page', name: 'Karp' } });

test('án POSTIZ_API_KEY er svarið unconfigured — ekkert brotnar', async () => {
  const r = await saekjaPostiz(mkEnv(mkState(), { POSTIZ_API_KEY: '' }), { thvinga: true });
  assert.deepEqual(r, { ok: false, error: 'unconfigured' });
});

test('lykillinn fer í Authorization-haus, ALDREI í slóð', async (t) => {
  const log = stubFetch(t, { status: 200, d: { posts: [] } });
  await saekjaPostiz(mkEnv(mkState()), { thvinga: true });
  assert.ok(log.length >= 1);
  assert.ok(!log[0].url.includes('pk_test'), 'lykillinn er hvergi í slóðinni');
  assert.equal(log[0].headers.Authorization, 'pk_test');
});

test('EWB-færslur eru síaðar burt og niðurstaðan geymd', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [faersla('e', 'ge', EWB, '2026-09-20T09:00:00.000Z'), faersla('a', 'g1', LI, '2026-09-20T09:00:00.000Z')] } });
  const r = await saekjaPostiz(env, { thvinga: true });
  assert.equal(r.ok, true);
  assert.equal(r.verk.length, 1, 'aðeins Karp-verkið');
  assert.ok(state.postiz, 'niðurstaðan geymd');
});

test('Postiz niðri → síðasta þekkta dagatal stendur og villan er merkt', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [faersla('a', 'g1', LI, '2026-09-20T09:00:00.000Z')] } });
  await saekjaPostiz(env, { thvinga: true });
  globalThis.fetch = async () => { throw new Error('net'); };
  const r = await saekjaPostiz(env, { thvinga: true });
  assert.equal(r.villa, 'postiz');
  assert.equal(r.verk.length, 1, 'gamla dagatalið hvarf ekki');
});

test('samstilling skráir ný verk sem óflokkuð og tvískráir ekki það sem er þegar til', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [faersla('a', 'g1', LI, '2026-09-20T09:00:00.000Z')] } });
  const r1 = await samstillaEfni(env);
  assert.equal(r1.ny, 1);
  assert.equal(state.efni[0].postiz_id, 'g1');
  const r2 = await samstillaEfni(env);
  assert.equal(r2.ny, 0, 'sama færsla skráist ekki tvisvar');
});

test('endapunktur: GET má með lykli, POST krefst lotu', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [] } });
  const req = (m, h, b) => new Request('https://karp.is/api/admin/markadsefni', { method: m, headers: Object.assign(b ? { 'content-type': 'application/json' } : {}, h), body: b ? JSON.stringify(b) : undefined });
  const js = (r) => r.json();
  assert.deepEqual(await js(await adminMarkadsefniHandler(req('GET', {}), env, {})), { ok: false, error: 'admin' });
  const K = { 'X-Admin-Key': 'adm-key' };
  assert.equal((await js(await adminMarkadsefniHandler(req('GET', K), env, {}))).ok, true);
  assert.deepEqual(await js(await adminMarkadsefniHandler(req('POST', K, { action: 'samstilla' }), env, {})), { ok: false, error: 'lota' });
});
