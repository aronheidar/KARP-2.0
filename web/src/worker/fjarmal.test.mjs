import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminFjarmalHandler, saekjaFjarmal } from './fjarmal.mjs';
import { _hmac } from './felag.mjs';

const mkState = () => ({ sync: {}, users: { 8: { is_admin: 1 } }, subs: [], usr: [], bila: {} });
function fakeDb(state) {
  const exec = (sql, args) => {
    if (/SELECT v, updated FROM stjorn_sync WHERE k='fjarmal'/.test(sql)) return state.sync.fjarmal || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('fjarmal'/.test(sql)) { state.sync.fjarmal = { v: args[0], updated: args[1] }; return { meta: {} }; }
    // ⚠ Prufunotenda-listinn er sóttur með LITERAL lykli, ekki bundnum — vanti þessi lína skilar
    //   fakeDb villu sem kallstaðurinn gleypir (.catch), listinn verður tómur og prufu-sían mælist
    //   ALDREI. Nákvæmlega þannig lifði „sían fjarlægð" af alla fyrri yfirferð.
    if (/^SELECT v FROM stjorn_sync WHERE k='test_ids'/.test(sql)) return state.sync.test_ids != null ? { v: state.sync.test_ids } : null;
    if (/^SELECT v FROM stjorn_sync WHERE k=\?$/.test(sql)) { const k = args[0]; return state.sync[k] != null ? { v: state.sync[k] } : null; }
    if (/FROM sub_service/.test(sql)) { if (state.bila.subs) throw new Error('d1 niðri'); return { results: state.subs }; }
    if (/FROM users/.test(sql) && /tier/.test(sql)) { if (state.bila.usr) throw new Error('d1 niðri'); return { results: state.usr }; }
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
    throw new Error('fakeDb: óþekkt SQL: ' + sql);
  };
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return exec(sql, a); }, async all() { return exec(sql, a); }, async run() { return exec(sql, a); } }; return st; } };
}
const mkEnv = (state, over = {}) => Object.assign(
  { TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó', ASKELL_PRIVATE_KEY: 'ak_test', GITHUB_DISPATCH_TOKEN: 'ghp_test' }, over);

/** Stubbur SEM TELUR. ⚠ `ok:true` segir ekkert um hvort rétt margar beiðnir fóru út eða hvert —
 *  öll síðufletti- og girðingapróf hér neðar fullyrða á `njosn.kollur`, ekki bara á skilagildinu. */
function stubFetch(t, svor) {
  const orig = globalThis.fetch;
  let i = 0;
  const kollur = [];
  globalThis.fetch = async (u) => {
    kollur.push(String(u));
    const s = typeof svor === 'function' ? svor(String(u)) : (Array.isArray(svor) ? (svor[Math.min(i++, svor.length - 1)]) : svor);
    if (s instanceof Error) throw s;
    return { ok: s.status === 200, status: s.status, json: async () => s.d, text: async () => JSON.stringify(s.d) };
  };
  t.after(() => { globalThis.fetch = orig; });
  return {
    kollur,
    samningar: () => kollur.filter((u) => /subscription-contracts/.test(u)),
    dispatch: () => kollur.filter((u) => /api\.github\.com/.test(u)),
    utan: () => kollur.filter((u) => !u.startsWith('https://askell.is/') && !u.startsWith('https://api.github.com/')),
  };
}
const bein = (b, headers = {}) => new Request('https://karp.is/api/admin/fjarmal', {
  method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://karp.is' }, headers), body: JSON.stringify(b),
});
const get = (env, headers, leit = '') => adminFjarmalHandler(new Request('https://karp.is/api/admin/fjarmal' + leit, { headers }), env, {});
const kaka = async (env, uid) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return 'karp_session=' + encodeURIComponent(uid + '.' + exp + '.' + await _hmac(env, uid + '.' + exp));
};
/** Einn virkur samningur á einkvæmri kt. Föst upphæð á liðnum svo `mrrAskell` sé TALA sem próf getur mælt. */
const samningur = (n, vara = 'kvoti', verd = 100) => ({
  id: 'c' + n, customer_reference: String(1000000000 + n), state: 'active',
  items: [{ product_reference: vara, amount: verd }],
});
/** Leiðavalinn stubbur: verðskráin og samningarnir eru tveir ÓHÁÐIR straumar. Vísitölustubbur
 *  gaf þeim svör á víxl eftir microtask-röð — próf sem hélt um leið og röðin breyttist. */
const leidir = (samn, verd = { status: 200, d: { results: [] } }) => (u) => (/catalog\/prices/.test(u) ? verd : (typeof samn === 'function' ? samn(u) : samn));

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

// ── Síðufletting ─────────────────────────────────────────────────────────────────────────────────
// ⚠ Fyrri útgáfa þessara prófa fullyrti aðeins `ok === true`. Það heldur óbreytt þótt `u = d.next`
//   sé strikað út, þótt `next` vísi á annan hýsil, þótt sama síða sé lögð saman 20× og þótt
//   varðþakið stöðvi í miðjum lista. Prófin hér TELJA: fjölda liða, fjölda beiðna og hvert þær fóru.

test('síðuflett: ALLIR samningar teljast, ekki bara fyrsta síðan', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const sida2 = 'https://askell.is/api/v2/subscription-contracts/?page=2';
  const sida = (fra, n, next) => ({ status: 200, d: { results: Array.from({ length: n }, (_, i) => samningur(fra + i)), next } });
  const njosn = stubFetch(t, leidir((u) => (u === sida2 ? sida(100, 20, null) : sida(0, 100, sida2))));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.villa, undefined, 'tvær heilar síður — engin villa');
  assert.equal(njosn.samningar().length, 2, 'báðar síður sóttar');
  assert.equal(r.verdUppsprettur.lidur, 120, '120 liðir; 100 þýðir að seinni síðan týndist í hljóði');
  assert.equal(r.mrrAskell, 12000, 'talan sjálf, ekki ok:true');
});

test('`next` út fyrir askell.is er ALDREI elt — API-lykillinn fer hvergi annað', async (t) => {
  // ⚠⚠ `next` kemur úr SVARBOL. Væri hún elt í blindni fengi sá hýsill sem svarið nefnir
  //    `Authorization: Api-Key <ASKELL_PRIVATE_KEY>` afhentan.
  const state = mkState(); const env = mkEnv(state);
  const njosn = stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)], next: 'https://arasarmadur.example/steal' } }));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(njosn.utan().length, 0, 'ENGIN beiðni út fyrir askell.is: ' + njosn.utan().join(' '));
  assert.equal(r.villa, 'askell', 'ókunnur hýsill er villa, ekki hálfur listi sem lítur heill út');
  assert.equal(r.mrrAskell, 0);
});

test('`next` sem vísar á sjálfa sig leggur EKKI sömu síðu saman', async (t) => {
  // Mælt á fyrri útgáfu: mrrAskell varð 198.000 þar sem rétt gildi er 9.900 — með ok:true og enga villu.
  const state = mkState(); const env = mkEnv(state);
  const sjalf = 'https://askell.is/api/v2/subscription-contracts/?page_size=100';
  const njosn = stubFetch(t, leidir({ status: 200, d: { results: [samningur(1, 'kvoti', 9900)], next: sjalf } }));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(njosn.samningar().length, 1, 'sama síða sótt einu sinni, ekki 20×');
  assert.equal(r.villa, 'askell');
  assert.notEqual(r.mrrAskell, 198000, 'margfölduð tala má ALDREI berast upp');
  assert.equal(r.mrrAskell, 0);
});

test('síðuþak slegið er VILLA — hálfur listi má ekki líta út eins og heill', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  let n = 0;
  const njosn = stubFetch(t, leidir(() => { n += 1; return { status: 200, d: { results: [samningur(n)], next: 'https://askell.is/api/v2/subscription-contracts/?page=' + (n + 1) } }; }));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(njosn.samningar().length, 20, 'stöðvað á þakinu, ekki hamrað áfram');
  assert.equal(r.villa, 'askell', 'þak slegið = svarið er ekki tæmandi og verður að segja það');
  assert.equal(r.mrrAskell, 0);
});

// ── Verðskrá og hlutabilanir ─────────────────────────────────────────────────────────────────────

test('verðskráin berst inn í verðrek', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)] } }, { status: 200, d: { results: [{ reference: 'kvoti', amount: 8900 }] } }));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.villa, undefined);
  assert.deepEqual(r.verdrek, [{ vara: 'kvoti', askell: 8900, fast: 9900 }]);
});

test('biluð verðskrá er MERKT — „ekkert verðrek" má ekki þýða „aldrei mælt"', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)] } }, { status: 500, d: {} }));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.ok, true, 'samningarnir náðust — svarið fellur ekki með verðskránni');
  assert.equal(r.villa, 'verdskra_hluti');
  assert.deepEqual(r.verdrek, []);
});

test('verðskrá sem er ekki fylki telst líka biluð', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)] } }, { status: 200, d: { villa: 'eitthvað' } }));
  assert.equal((await saekjaFjarmal(env, { thvinga: true })).villa, 'verdskra_hluti');
});

test('hlutabilun í D1 er merkt d1_hluti', async (t) => {
  const state = mkState(); state.bila.subs = true; const env = mkEnv(state);
  stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)] } }));
  assert.equal((await saekjaFjarmal(env, { thvinga: true })).villa, 'd1_hluti');
});

test('brotni bæði D1 og verðskrá er D1 nefnt — EINN kóði fer út', async (t) => {
  const state = mkState(); state.bila.subs = true; const env = mkEnv(state);
  stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)] } }, { status: 500, d: {} }));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.villa, 'd1_hluti', 'D1-gatið snertir bæði mrrD1 og misraemi; verðskráin aðeins verdrek');
});

test('geymd mynd YFIRSKRIFAR ekki `villa` — Áskell ónáanlegur segir askell, ekki d1_hluti', async (t) => {
  // Mælt á fyrri útgáfu: `Object.assign({ villa:'askell' }, geymt.gogn)` lét geymdu myndina vinna,
  // svo spjaldið sagði „náði í Áskel en ekki alla heimildalista" þegar það náði alls ekki í Áskel.
  const state = mkState(); state.bila.subs = true; const env = mkEnv(state);
  stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)] } }));
  assert.equal((await saekjaFjarmal(env, { thvinga: true })).villa, 'd1_hluti');
  globalThis.fetch = async () => { throw new Error('net'); };
  assert.equal((await saekjaFjarmal(env, { thvinga: true })).villa, 'askell');
});

test('geymda myndin ber ENGA villu — hlutabilun litar ekki svarið í 15 mín eftir á', async (t) => {
  const state = mkState(); state.bila.subs = true; const env = mkEnv(state);
  stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)] } }));
  await saekjaFjarmal(env, { thvinga: true });
  assert.equal(JSON.parse(state.sync.fjarmal.v).villa, undefined, 'aðeins GÖGN eru geymd, ekki merking');
  state.bila.subs = false;
  assert.equal((await saekjaFjarmal(env, {})).villa, undefined, 'fersk geymsla, D1 komið aftur → engin villa');
});

test('gömul geymd röð sem BER villu smitar hvorki nýtt svar né cache-svar', async (t) => {
  // ⚠ Raunstaða við deploy: raðirnar sem liggja í stjorn_sync voru skrifaðar af fyrri útgáfu og bera
  //   `villa`. Þær mega hvorki yfirskrifa `askell` þegar Áskell er ónáanlegur né lita ferskt cache-svar
  //   í 15 mín eftir á. Það er þessi gátun sem ber hegðunina — röðin á Object.assign er belti OFAN á axlabönd.
  const state = mkState();
  const gomul = { misraemi: [], fripofanir: [], tvirukkun: [], mrrAskell: 9900, mrrD1: 0, verdrek: [], verdUppsprettur: { lidur: 1, verdskra: 0, ekkert: 0 }, mrrAskellOvisst: false, villa: 'd1_hluti' };
  state.sync.fjarmal = { v: JSON.stringify(gomul), updated: Math.floor(Date.now() / 1000) };
  const env = mkEnv(state);
  stubFetch(t, new Error('net'));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.villa, 'askell', 'gamla merkingin má ekki vinna yfir „náðum ekki í Áskel"');
  assert.equal(r.mrrAskell, 9900, 'en gögnin sjálf standa');
  assert.equal((await saekjaFjarmal(env, {})).villa, undefined, 'og ferska cache-svarið erfir hana ekki heldur');
});

test('varabraut án geymdrar myndar hendir ENGU úr Verki 1', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, new Error('net'));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.equal(r.villa, 'askell');
  assert.equal(r.mrrAskellOvisst, true, 'án mælingar vitum við sannanlega ekki neitt');
  assert.deepEqual(r.verdUppsprettur, { lidur: 0, verdskra: 0, ekkert: 0 });
  assert.deepEqual(r.tvirukkun, []);
  assert.deepEqual(Object.keys(r).sort(), ['fripofanir', 'misraemi', 'mrrAskell', 'mrrAskellOvisst', 'mrrD1', 'ok', 'sott', 'tvirukkun', 'verdUppsprettur', 'verdrek', 'villa']);
});

// ── Niðurstöður Verks 1 berast óbreyttar ─────────────────────────────────────────────────────────

test('tvirukkun berst óbreytt upp úr samstemma', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const tveir = [
    { id: 'c1', customer_reference: '1234567890', state: 'active', items: [{ product_reference: 'kvoti', amount: 9900 }] },
    { id: 'c2', customer_reference: '1234567890', state: 'active', items: [{ product_reference: 'kvoti', amount: 9900 }] },
  ];
  stubFetch(t, leidir({ status: 200, d: { results: tveir } }));
  const r = await saekjaFjarmal(env, { thvinga: true });
  assert.deepEqual(r.tvirukkun, [{ kt: '1234567890', vara: 'kvoti', fjoldi: 2, verd: 19800 }]);
});

test('verdUppsprettur og mrrAskellOvisst eru MÆLD, ekki fastsett', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  // (a) liður án upphæðar og ekkert í verðskrá → uppspretta `ekkert` → óvíst
  stubFetch(t, leidir({ status: 200, d: { results: [{ id: 'c1', customer_reference: '1234567890', state: 'active', items: [{ product_reference: 'kvoti' }] }] } }));
  const a = await saekjaFjarmal(env, { thvinga: true });
  assert.deepEqual(a.verdUppsprettur, { lidur: 0, verdskra: 0, ekkert: 1 });
  assert.equal(a.mrrAskellOvisst, true);
  // (b) sami liður, en verðskráin svarar → uppspretta `verdskra` → ekki lengur óvíst
  stubFetch(t, leidir(
    { status: 200, d: { results: [{ id: 'c1', customer_reference: '1234567890', state: 'active', items: [{ product_reference: 'kvoti' }] }] } },
    { status: 200, d: { results: [{ reference: 'kvoti', amount: 9900 }] } }));
  const b = await saekjaFjarmal(mkEnv(mkState()), { thvinga: true });
  assert.deepEqual(b.verdUppsprettur, { lidur: 0, verdskra: 1, ekkert: 0 });
  assert.equal(b.mrrAskellOvisst, false, 'reiturinn má ekki vera fastsettur `true`');
  assert.equal(b.mrrAskell, 9900);
});

test('prufunotendur falla út — annars mælir misræmið okkur sjálf', async (t) => {
  const nu = Math.floor(Date.now() / 1000);
  const rod = { uid: 8, kt: '1234567890', vara: 'kvoti', until: nu + 9999, askell_id: null, free_access: 0, is_admin: 0, nemandi: 0 };
  stubFetch(t, leidir({ status: 200, d: { results: [] } }));
  const anSiu = mkState(); anSiu.subs = [rod];
  const r1 = await saekjaFjarmal(mkEnv(anSiu), { thvinga: true });
  assert.equal(r1.misraemi.length, 1, 'viðmið: án síu telst notandinn misræmi');
  assert.equal(r1.mrrD1, 9900);
  const medSiu = mkState(); medSiu.subs = [rod]; medSiu.sync.test_ids = JSON.stringify([8]);
  const r2 = await saekjaFjarmal(mkEnv(medSiu), { thvinga: true });
  assert.equal(r2.misraemi.length, 0, 'prufunotandi 8 fellur út');
  assert.equal(r2.mrrD1, 0);
});

// ── Umgjörð svarsins ─────────────────────────────────────────────────────────────────────────────

test('GET ber `fjarmal` og `rofi` — villan er HREIÐRUÐ, aldrei á toppstigi', async (t) => {
  const state = mkState(); const env = mkEnv(state, { ASKELL_PRIVATE_KEY: '' });
  stubFetch(t, { status: 200, d: { results: [] } });
  const j = await (await get(env, { 'X-Admin-Key': 'adm-key' })).json();
  assert.deepEqual(Object.keys(j).sort(), ['fjarmal', 'ok', 'rofi']);
  assert.equal(j.error, undefined, 'ekkert villukóði á toppstigi — Verk 3 les svar.fjarmal.error');
  assert.equal(j.fjarmal.error, 'unconfigured');
});

test('POST saekja skilar SÖMU umgjörð og GET', async (t) => {
  // ⚠ Flatt svar hér er nákvæmlega gildran sem felldi `bjarkiGogn` einu lagi ofar: spjaldið ýtir á
  //   endurnýjun, teiknar upp úr svarinu og „óstillt" birtist aldrei.
  const state = mkState(); const env = mkEnv(state, { ASKELL_PRIVATE_KEY: '' });
  stubFetch(t, { status: 200, d: { results: [] } });
  const c = await kaka(env, 8);
  const jPost = await (await adminFjarmalHandler(bein({ action: 'saekja' }, { Cookie: c }), env, {})).json();
  const jGet = await (await get(env, { Cookie: c })).json();
  assert.equal(jPost.error, undefined);
  assert.equal(jPost.fjarmal.error, 'unconfigured');
  assert.deepEqual(Object.keys(jPost).sort(), Object.keys(jGet).sort());
  assert.deepEqual(jPost.fjarmal, jGet.fjarmal);
});

test('X-Admin-Key MÁ lesa', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  const j = await (await get(env, { 'X-Admin-Key': 'adm-key' })).json();
  assert.equal(j.ok, true);
  assert.equal(j.fjarmal.ok, true);
});

test('X-Admin-Key MÁ EKKI sækja né rétta Hrafni — það krefst lotu', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  for (const action of ['saekja', 'hrafn']) {
    const r = await adminFjarmalHandler(bein({ action }, { 'X-Admin-Key': 'adm-key' }), env, {});
    assert.equal((await r.json()).error, 'lota', action);
  }
});

// ── Peningagirðingin ─────────────────────────────────────────────────────────────────────────────

test('ENGIN aðgerð sem hreyfir peninga kemst í gegn — mælt UM LOTU, ekki lykil', async (t) => {
  // ⚠⚠ Fyrri útgáfa þessa prófs POSTaði með X-Admin-Key. Þá er uid = 0 og NÆSTA girðing skilar
  //    `lota` — bæði gefa ok:false, svo `assert.equal(j.ok, false)` gat ekki greint á milli og
  //    hvítalistann mátti fjarlægja án þess að prófið félli. Hér er lota notuð, fullyrt á
  //    `adgerd` NÁKVÆMLEGA, og talið að ENGINN dispatch hafi farið af stað.
  const state = mkState(); const env = mkEnv(state);
  const njosn = stubFetch(t, { status: 204, d: {} });
  const c = await kaka(env, 8);
  for (const action of ['greida', 'endurgreida', 'millifaera', 'segja_upp', 'cancel', 'refund']) {
    const r = await adminFjarmalHandler(bein({ action, verk: 'endurgreiddu 50000 kr' }, { Cookie: c }), env, {});
    assert.equal((await r.json()).error, 'adgerd', action + ': hvítalistinn á að hafna, ekki lotu-girðingin');
  }
  assert.equal(njosn.dispatch().length, 0, 'ENGINN repository_dispatch fór af stað');
});

test('hvítalistinn hafnar peningum LÍKA á lykil-leiðinni — hann er girðing, ekki aukaverkun af röð', async (t) => {
  // Væri hvítalistinn fjarlægður félli lykil-leiðin í gegn á `lota` í staðinn. Sama ok:false, ólík merking.
  const state = mkState(); const env = mkEnv(state);
  const njosn = stubFetch(t, { status: 204, d: {} });
  for (const action of ['greida', 'endurgreida', 'millifaera', 'segja_upp', 'cancel', 'refund']) {
    const r = await adminFjarmalHandler(bein({ action, verk: 'endurgreiddu 50000 kr' }, { 'X-Admin-Key': 'adm-key' }), env, {});
    assert.equal((await r.json()).error, 'adgerd', action + ': á að stranda á hvítalistanum, ekki á `lota`');
  }
  assert.equal(njosn.dispatch().length, 0);
});

test('dispatch-greinin er GÁTUÐ, ekki fall-through — hvítalistinn má ekki vera eina lagið', () => {
  // ⚠ BYGGINGARPRÓF, af ásettu ráði. Seinna lagið hefur enga hegðunarmun meðan fyrra lagið stendur —
  //   það er einmitt tilgangur þess. Hér er mælt að `_ghDispatch` sé ekki náð með falli í gegn:
  //   milli hvítalistans og dispatch VERÐUR að standa skýr gátun á `action`. Án hennar dugir ein
  //   eydd lína til að opna leið frá innskráðum stjórnanda að raunverulegri keyrslu.
  const src = readFileSync(new URL('./fjarmal.mjs', import.meta.url), 'utf8');
  const eftir = src.slice(src.indexOf('_FJ_ADGERDIR.includes'));
  const i = eftir.indexOf('_ghDispatch(');
  assert.ok(i > 0, 'dispatch-kallið fannst á eftir hvítalistanum');
  assert.match(eftir.slice(0, i), /action\s*(?:===|!==)\s*'hrafn'/, 'skýr gátun á `action` vantar á undan dispatch');
});

test('CSRF-gátunin stendur á kökulotu-leiðinni', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const njosn = stubFetch(t, { status: 204, d: {} });
  const c = await kaka(env, 8);
  const post = (h) => new Request('https://karp.is/api/admin/fjarmal', { method: 'POST', headers: Object.assign({ Cookie: c }, h), body: JSON.stringify({ action: 'hrafn', verk: 'Lagaðu bilunina í verðskránni' }) });
  const r1 = await adminFjarmalHandler(post({ 'content-type': 'application/json', origin: 'https://arasarmadur.example' }), env, {});
  assert.equal((await r1.json()).error, 'origin');
  const r2 = await adminFjarmalHandler(post({ 'content-type': 'text/plain', origin: 'https://karp.is' }), env, {});
  assert.equal((await r2.json()).error, 'content_type');
  assert.equal(njosn.dispatch().length, 0);
});

test('hrafn með raunverulegu verki fer af stað', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const njosn = stubFetch(t, { status: 204, d: {} });
  const c = await kaka(env, 8);
  const r = await adminFjarmalHandler(bein({ action: 'hrafn', verk: 'Lagaðu bilunina í verðskránni' }, { Cookie: c }), env, {});
  assert.equal((await r.json()).ok, true);
  assert.equal(njosn.dispatch().length, 1);
});

test('verk úr tómum bilum kemst ekki í gegn', async (t) => {
  // `bilanir.mjs:128` gerir .trim().slice(0,2000). Án .trim() sendu tíu bil autt verkefni á Hrafn.
  const state = mkState(); const env = mkEnv(state);
  const njosn = stubFetch(t, { status: 204, d: {} });
  const c = await kaka(env, 8);
  const r = await adminFjarmalHandler(bein({ action: 'hrafn', verk: '          ' }, { Cookie: c }), env, {});
  assert.equal((await r.json()).error, 'verk');
  assert.equal(njosn.dispatch().length, 0, 'ekkert autt verkefni á Hrafn');
});

// ── Rofinn ───────────────────────────────────────────────────────────────────────────────────────

test('rofi_elin stöðvar SÓKNINA líka — engin lifandi Áskels-köll, og svarið segir frá', async (t) => {
  // ⚠ Fyrri útgáfa stöðvaði aðeins dispatch: `rofi_elin=1` + `GET ?thvinga=1` gerði full lifandi
  //   Áskels-köll. Slökkt á Elínu verður að þýða slökkt, og geymda talan má ekki sýnast ný.
  const state = mkState(); const env = mkEnv(state);
  const njosn = stubFetch(t, leidir({ status: 200, d: { results: [samningur(1, 'kvoti', 9900)] } }));
  await saekjaFjarmal(env, { thvinga: true });          // ein raunmynd í geymslu
  const fyrir = njosn.kollur.length;
  state.sync.rofi_elin = '1';
  const j = await (await get(env, { 'X-Admin-Key': 'adm-key' }, '?thvinga=1')).json();
  assert.equal(njosn.kollur.length, fyrir, 'EKKERT kall á Áskel meðan slökkt er — líka með ?thvinga=1');
  assert.equal(j.ok, true, 'lesturinn stendur — spjald sem slokknar alveg lítur út eins og bilun');
  assert.equal(j.rofi, true, 'og rofinn sést');
  assert.equal(j.fjarmal.villa, 'rofi', 'gömul tala má ALDREI sýnast ný');
  assert.equal(j.fjarmal.mrrAskell, 9900, 'geymda myndin er borin fram, bara sannanlega gömul');
});

test('rofi án geymdrar myndar skilar merktri tómri mynd, ekki hálfri', async (t) => {
  const state = mkState(); state.sync.rofi_elin = '1'; const env = mkEnv(state);
  const njosn = stubFetch(t, leidir({ status: 200, d: { results: [samningur(1)] } }));
  const j = await (await get(env, { 'X-Admin-Key': 'adm-key' }, '?thvinga=1')).json();
  assert.equal(njosn.kollur.length, 0);
  assert.equal(j.fjarmal.villa, 'rofi');
  assert.equal(j.fjarmal.mrrAskellOvisst, true);
  assert.deepEqual(j.fjarmal.verdUppsprettur, { lidur: 0, verdskra: 0, ekkert: 0 });
  assert.deepEqual(j.fjarmal.tvirukkun, []);
});

test('rofi stöðvar POST-aðgerðir áfram', async (t) => {
  const state = mkState(); state.sync.rofi_elin = '1'; const env = mkEnv(state);
  const njosn = stubFetch(t, { status: 204, d: {} });
  const c = await kaka(env, 8);
  const r = await adminFjarmalHandler(bein({ action: 'hrafn', verk: 'Lagaðu bilunina í verðskránni' }, { Cookie: c }), env, {});
  assert.equal((await r.json()).error, 'rofi');
  assert.equal(njosn.dispatch().length, 0);
});

// ── Auðkenning um kökulotu ───────────────────────────────────────────────────────────────────────
// ⚠ Öll lykil-prófin fara framhjá `readSession`. Væri `_fjAdminUid` í ranga átt (röng röð á
//   (env, request) eða röng lögun á skilagildinu — auth.mjs skilar TÖLU, ekki hlut með .uid) stæðust
//   þau öll óbreytt en innskráður stjórnandi á /stjorn/ fengi `admin` á HVERJU kalli, í hljóði.

test('innskráður stjórnandi (kökulota, EKKI X-Admin-Key) má bæði lesa og senda hvítlistaða aðgerð', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  const c = await kaka(env, 8);
  assert.equal((await (await get(env, { Cookie: c })).json()).ok, true, 'GET um lotu án X-Admin-Key');
  const rPost = await adminFjarmalHandler(bein({ action: 'saekja' }, { Cookie: c }), env, {});
  assert.equal((await rPost.json()).fjarmal.ok, true, 'POST saekja um lotu án X-Admin-Key');
});

test('kökulota sem er EKKI stjórnandi fær admin, ekki aðgang', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { results: [] } });
  const r = await get(env, { Cookie: await kaka(env, 9) });
  assert.equal((await r.json()).error, 'admin');
});
