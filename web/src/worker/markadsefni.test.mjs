import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminMarkadsefniHandler, saekjaPostiz, samstillaEfni } from './markadsefni.mjs';
import { _hmac } from './felag.mjs';

const LI = 'cmt92pcw000r9p20yv7b53018', EWB = 'cmpvni6bb00hpmt0yuatcjamo';
function fakeDb(state) {
  const exec = (sql, args) => {
    if (/SELECT v, updated FROM stjorn_sync WHERE k='postiz'/.test(sql)) return state.postiz || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('postiz'/.test(sql)) { state.postiz = { v: args[0], updated: args[1] }; return { meta: {} }; }
    if (/SELECT v, updated FROM stjorn_sync WHERE k='markads_tillogur'/.test(sql)) return state.tillogur || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('markads_tillogur'/.test(sql)) { state.tillogur = { v: args[0], updated: args[1] }; return { meta: {} }; }
    if (/^SELECT v FROM stjorn_sync WHERE k=\?$/.test(sql)) { const k = args[0]; return state.sync[k] != null ? { v: state.sync[k] } : null; }
    if (/^SELECT .* FROM markadsefni/.test(sql)) return { results: state.efni };
    if (/^INSERT INTO markadsefni/.test(sql)) { state.efni.push({ id: state.efni.length + 1, titill: args[1], efnistok: args[3], postiz_id: args[7], birt: args[9] }); return { meta: { last_row_id: state.efni.length } }; }
    if (/^UPDATE markadsefni SET/.test(sql)) { state.uppfaert = (state.uppfaert || 0) + 1; return { meta: {} }; }
    if (/SELECT title, body, ts FROM news/.test(sql)) { state.newsFyrirspurnir = (state.newsFyrirspurnir || 0) + 1; return { results: state.news || [] }; }
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
    throw new Error('fakeDb: óþekkt SQL: ' + sql);
  };
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return exec(sql, a); }, async all() { return exec(sql, a); }, async run() { return exec(sql, a); } }; return st; } };
}
const mkState = () => ({ efni: [], news: [], users: { 8: { is_admin: 1 }, 9: { is_admin: 0 } }, sync: {} });
const mkEnv = (state, over = {}) => Object.assign({ TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó', POSTIZ_API_KEY: 'pk_test', GITHUB_DISPATCH_TOKEN: 'ghp_test' }, over);
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
/** Kökulotu-auðkenning fyrir POST-próf sem eiga að fara í gegnum lotuna, ekki X-Admin-Key (afritað úr hjalp_agent.test.mjs). */
async function cookieFor(env, uid) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return 'karp_session=' + encodeURIComponent(uid + '.' + exp + '.' + await _hmac(env, uid + '.' + exp));
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
  assert.equal(state.efni[0].postiz_id, 'a', 'færslu-auðkennið, ekki `group` — Postiz gefur hverri færslu sitt eigið');
  const r2 = await samstillaEfni(env);
  assert.equal(r2.ny, 0, 'sama færsla skráist ekki tvisvar');
});

test('færsla án `group` skráist samt — parað er á færslu-auðkenni, sem er alltaf til', async (t) => {
  // ⚠ Áður var `group` skilyrði og slík færsla var sleppt. Mæling 16.9 sýndi að `group` auðkennir
  //   birtingu en ekki verk (`group === id` í öllum 41 færslum), svo pörun byggir nú á færslu-
  //   auðkennum. Þá er ekkert því til fyrirstöðu að skrá færslu sem vantar `group`.
  const state = mkState(); const env = mkEnv(state);
  const an = { id: 'x1', state: 'QUEUE', content: 'Verk án hóps', publishDate: '2026-09-20T09:00:00.000Z', integration: { id: LI, providerIdentifier: 'linkedin-page', name: 'Karp' } };
  stubFetch(t, { status: 200, d: { posts: [an] } });
  const r1 = await samstillaEfni(env);
  assert.equal(r1.ny, 1, '`group` er ekki lengur skilyrði — auðkennið dugar');
  assert.equal(state.efni[0].postiz_id, 'x1');
  const r2 = await samstillaEfni(env);
  assert.equal(r2.ny, 0, 'og hún tvískráist ekki við næstu samstillingu');
  assert.equal(state.efni.length, 1);
});

test('verk án NOKKURS auðkennis er sleppt sýnilega — það er ekki hægt að para það', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const an = { state: 'QUEUE', content: 'Hvorki id né group', publishDate: '2026-09-20T09:00:00.000Z', integration: { id: LI, providerIdentifier: 'linkedin-page', name: 'Karp' } };
  stubFetch(t, { status: 200, d: { posts: [an] } });
  const r = await samstillaEfni(env);
  assert.equal(r.ny, 0, 'ekkert skráð');
  assert.equal(r.sleppt.length, 1);
  assert.equal(r.sleppt[0].astaeda, 'engin_audkenni');
});

test('sama verk á tveimur rásum með ÓLÍK `group` verður EIN lína — raunmynstrið frá Postiz', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const FB = 'cmt92q6mr00pbmp0ykfa92r3v';
  const fb = { id: 'cmB', group: 'uuid-2', state: 'QUEUE', content: 'Texti', publishDate: '2026-09-20T09:00:00.000Z', integration: { id: FB, providerIdentifier: 'facebook', name: 'Karp' } };
  stubFetch(t, { status: 200, d: { posts: [faersla('cmA', 'uuid-1', LI, '2026-09-20T09:00:00.000Z'), fb] } });
  const r1 = await samstillaEfni(env);
  assert.equal(r1.ny, 1, 'eitt verk, ekki tvö — þetta tvítaldi hvert myndband áður');
  assert.equal(state.efni[0].postiz_id, 'cmA', 'fyrsta auðkennið í stafrófsröð');
  const r2 = await samstillaEfni(env);
  assert.equal(r2.ny, 0, 'og hvorugt auðkennið skráist aftur');
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

// ── rofi_bjarki: rofinn verður að vera rofi, ekki ljós (gat sem yfirferð Verks 5 fann) ─────────────────────────────
test('slökkt á Bjarka stöðvar framleiðslu — rofinn er rofi, ekki ljós', async (t) => {
  const state = mkState(); state.sync = Object.assign({}, state.sync, { rofi_bjarki: '1' });
  const env = mkEnv(state); const log = stubFetch(t, { status: 200, d: { posts: [] } });
  const C = { Cookie: await cookieFor(env, 8) };
  const r = await adminMarkadsefniHandler(new Request('https://karp.is/api/admin/markadsefni', {
    method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, C),
    body: JSON.stringify({ action: 'framleida', verk: 'Myndband um samþjöppun aflamarks' }),
  }), env, {});
  const j = await r.json();
  assert.equal(j.ok, false);
  assert.equal(j.dispatch && j.dispatch.error || j.error, 'rofi');
  assert.equal(log.filter((x) => String(x.url).includes('api.github.com')).length, 0, 'engin keyrsla ræst');
});

test('rofa-staða Bjarka skilar sér í GET-svarið', async (t) => {
  const state = mkState(); state.sync = Object.assign({}, state.sync || {}, { rofi_bjarki: '1' });
  const env = mkEnv(state); stubFetch(t, { status: 200, d: { posts: [] } });
  const r = await adminMarkadsefniHandler(new Request('https://karp.is/api/admin/markadsefni', { headers: { 'X-Admin-Key': 'adm-key' } }), env, {});
  assert.equal((await r.json()).rofi, true);
});

// ── 'skra' (Verk 8): eina POST-aðgerðin sem GH Action-keyrslan (engin lota) má nota ────────────────
test('skra virkar með X-Admin-Key — engin lota þarf — og skráir drög (birt=NULL)', async (t) => {
  const state = mkState(); const env = mkEnv(state); stubFetch(t, { status: 200, d: { posts: [] } });
  const K = { 'X-Admin-Key': 'adm-key' };
  const post = (b) => adminMarkadsefniHandler(new Request('https://karp.is/api/admin/markadsefni', {
    method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, K), body: JSON.stringify(b),
  }), env, {}).then((r) => r.json());
  const svar = await post({
    action: 'skra', titill: 'Fjárlögin 2027 — fyrsti afgangur í 8 ár', efnistok: 'Fjárlög',
    tala: '4,7 ma.kr.', heimild: 'fjarlog.json', postiz_id: 'g-nytt', tegund: 'myndband', lota: 5, skra: 'render-fjarlog.mjs',
  });
  assert.equal(svar.ok, true);
  assert.ok(svar.id, 'skilar id');
  assert.equal(state.efni.length, 1);
  assert.equal(state.efni[0].titill, 'Fjárlögin 2027 — fyrsti afgangur í 8 ár');
  assert.equal(state.efni[0].postiz_id, 'g-nytt');
  assert.equal(state.efni[0].birt, null, 'drög eru ALDREI birt');
  // gilt heiti varðveitist, ógilt verður óflokkað
  assert.equal(state.efni[0].efnistok, 'Fjárlög', 'gilt heiti ("Fjárlög" er til í malefni.json) varðveitist óbreytt');
  const svar2 = await post({
    action: 'skra', titill: 'Annað verk', efnistok: 'Ríkisfjármál',
    tala: null, heimild: null, postiz_id: 'g-annad', tegund: 'myndband', lota: 5, skra: null,
  });
  assert.equal(svar2.ok, true, 'ógilt efnistak fellir ALDREI keyrsluna — Claude semur frjálsan texta');
  assert.equal(state.efni.length, 2);
  assert.equal(state.efni[1].efnistok, null, 'ógilt heiti ("Ríkisfjármál" er ekki til — rétt heiti er "Fjárlög") verður óflokkað, ekki hafnað');
});

test('framleida hafnar X-Admin-Key án lotu — skra er EINA undantekningin', async (t) => {
  const state = mkState(); const env = mkEnv(state); stubFetch(t, { status: 200, d: { posts: [] } });
  const K = { 'X-Admin-Key': 'adm-key' };
  const r = await adminMarkadsefniHandler(new Request('https://karp.is/api/admin/markadsefni', {
    method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, K),
    body: JSON.stringify({ action: 'framleida', verk: 'Myndband um fjárlögin 2027' }),
  }), env, {});
  assert.deepEqual(await r.json(), { ok: false, error: 'lota' });
  assert.equal(state.efni.length, 0, 'ekkert skráð, engin keyrsla ræst');
});

test('merkja tekur aðeins raunverulegt málefnaheiti — ekki hvað sem er', async (t) => {
  const state = mkState(); state.efni.push({ id: 1, titill: 'Verk', postiz_id: 'g1', efnistok: null, birt: null });
  const env = mkEnv(state); stubFetch(t, { status: 200, d: { posts: [] } });
  const C = { Cookie: await cookieFor(env, 8) };
  const post = (b) => adminMarkadsefniHandler(new Request('https://karp.is/api/admin/markadsefni', {
    method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, C), body: JSON.stringify(b),
  }), env, {}).then((r) => r.json());
  assert.deepEqual(await post({ action: 'merkja', id: 1, efnistok: 'Ekki til sem málefni' }), { ok: false, error: 'efnistok' });
  const g = await post({ action: 'merkja', id: 1, efnistok: 'Sjávarútvegur', tala: '48%', heimild: 'Fiskistofa' });
  assert.equal(g.ok, true);
});

test('tillögur eru geymdar — fréttafyrirspurnin keyrir ekki við hverja hleðslu (D1-lestrarþakið hefur læst Aroni úti áður)', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [] } });
  const get = () => adminMarkadsefniHandler(new Request('https://karp.is/api/admin/markadsefni', { headers: { 'X-Admin-Key': 'adm-key' } }), env, {}).then((r) => r.json());
  await get();
  const fyrirspurnir = state.newsFyrirspurnir || 0;
  await get();
  assert.equal(state.newsFyrirspurnir, fyrirspurnir, 'engin ný fréttafyrirspurn innan fyrningar');
});

test('grunnlína sem nær ekki yfir tímabilið gefur ENGAR tillögur — þöggun er betri en hlutfall sem er ekki mælt', async (t) => {
  const NU = Math.floor(Date.now() / 1000);
  const state = mkState();
  // 300 fréttir en aðeins 20 daga aftur: ekkert „venjulegt" til að bera saman við
  state.news = Array.from({ length: 300 }, (_, i) => ({ title: 'Frett um kvóta ' + i, body: '', ts: NU - Math.floor((i / 299) * 20 * 86400) }));
  const env = mkEnv(state); stubFetch(t, { status: 200, d: { posts: [] } });
  const g = await adminMarkadsefniHandler(new Request('https://karp.is/api/admin/markadsefni', { headers: { 'X-Admin-Key': 'adm-key' } }), env, {}).then((r) => r.json());
  assert.deepEqual(g.tillogur, [], 'tuttugu daga saga dugar ekki fyrir níutíu daga grunnlínu');
});
