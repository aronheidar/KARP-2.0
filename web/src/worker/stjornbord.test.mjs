import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminOverviewHandler, adminSyncHandler } from './stjornbord.mjs';
import { _hmac } from './felag.mjs';
import { PRICE_TIER, PRICE_SVC } from '../lib/fjarmal.mjs';

// ── Heildaryfirferð, atriði 5: verðtöflurnar eru á EINUM stað ────────────────────────────────────
// ⚠⚠ Töflurnar lágu í tveimur eintökum: fall-staðbundnar og óútfluttar í stjornbord.mjs og aftur í
//    ../lib/fjarmal.mjs. Gildin stemmdu, en prófið í fjarmal.test.mjs neglir Elínar-hliðina við
//    BÓKSTAFLEGAR tölur — ekki við stjórnborðið. Hækki einhver Fyrirtæki+ stjórnborðs-megin stendur
//    það próf grænt, Elín mælir gamla verðið, og misræmið sem hún á að finna verður að henni sjálfri.
//    `VIRK` fékk raunverulega hegðunarvörn (orðrétt sama regla og greidslur.mjs); þetta er hennar.
//
// ⚠ Prófið keyrir HANDLERINN sjálfan og les MRR-töluna sem stjórnborðið sýnir — það mælir því
//   útreikninginn, ekki innflutningslínuna. Væri taflan endurtekin staðbundið með öðru verði félli
//   það; væri hún flutt inn en aldrei notuð félli það líka.

/** D1-stubbur: svarar notenda- og áskriftarfyrirspurnunum, annað er tómt. Allir kallstaðir í
 *  adminOverviewHandler bera `.catch(...)`, svo tómt svar fellir ekki yfirlitið. */
function fakeDb(state) {
  const exec = (sql) => {
    if (/FROM users ORDER BY created DESC/.test(sql)) return { results: state.users };
    if (/FROM sub_service WHERE until>\?/.test(sql)) return { results: state.subs };
    return { results: [] };
  };
  return { prepare(sql) { const st = { bind() { return st; }, async first() { return null; }, async all() { return exec(sql); }, async run() { return {}; } }; return st; } };
}

const yfirlit = async (state) => {
  const env = { TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key' };
  const r = await adminOverviewHandler(new Request('https://karp.is/api/admin/overview', { headers: { 'X-Admin-Key': 'adm-key' } }), env);
  return (await r.json());
};
const notandi = (id, tier, now) => ({
  id, email: 'n' + id + '@x.is', username: 'n' + id, name: '', is_admin: 0, email_verified: 1,
  kt: String(1000000000 + id), tier, tier_until: tier ? now + 30 * 86400 : null, created: now - 86400,
  free_access: 0, nemandi: 0,
});

test('MRR stjórnborðsins er reiknað úr SÖMU töflu og Elín mælir við — engin önnur tala til', async () => {
  const now = Math.floor(Date.now() / 1000);
  const j = await yfirlit({
    users: [notandi(1, 'fyrirtaeki_plus', now), notandi(2, 'grunnur', now)],
    subs: [{ user_id: 1, service: 'kvoti', until: now + 30 * 86400, askell_id: null }],
  });
  assert.equal(j.ok, true);
  assert.equal(
    j.stats.mrr,
    PRICE_TIER.fyrirtaeki_plus + PRICE_TIER.grunnur + PRICE_SVC.kvoti,
    'talan á stjórnborðinu VERÐUR að koma úr ../lib/fjarmal.mjs — tvö eintök reka sig alltaf í sundur',
  );
});

test('hvert einasta þrep og hver einasta þjónusta er verðlögð úr sameiginlegu töflunni', async () => {
  // ⚠ Ein vara ein og sér sannar ekkert um hinar: staðbundin tafla með EINU röngu verði slyppi þá í
  //   gegn. Hér er hvert gildi beggja taflna mælt sérstaklega gegn handlernum sjálfum.
  const now = Math.floor(Date.now() / 1000);
  for (const [tier, verd] of Object.entries(PRICE_TIER)) {
    const j = await yfirlit({ users: [notandi(1, tier, now)], subs: [] });
    assert.equal(j.stats.mrr, verd, 'þrep ' + tier);
  }
  for (const [svc, verd] of Object.entries(PRICE_SVC)) {
    const j = await yfirlit({ users: [], subs: [{ user_id: 1, service: svc, until: now + 86400, askell_id: null }] });
    assert.equal(j.stats.mrr, verd, 'þjónusta ' + svc);
  }
});

test('stjornbord.mjs lýsir ENGRI eigin verðtöflu yfir — uppsprettan er ein, ekki samstillt', () => {
  // ⚠ Hegðunarprófin að ofan falla um leið og staðbundin tafla ber ANNAÐ verð, en þau standa græn ef
  //   einhver afritar töfluna aftur inn með RÉTTU verði. Þá er drift-gildran komin aftur, þögul, og
  //   bíður næstu verðbreytingar. Þessi lína lokar henni: taflan má aðeins koma að láni.
  const t = readFileSync(new URL('./stjornbord.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(t, /^\s*(?:export\s+)?(?:const|let|var)\s+PRICE_(?:SVC|TIER)\s*=/m,
    'PRICE_SVC/PRICE_TIER eiga að vera FLUTT INN úr ../lib/fjarmal.mjs, ekki lýst yfir hér');
  assert.match(t, /import\s*\{[^}]*PRICE_(?:SVC|TIER)[^}]*\}\s*from\s*'\.\.\/lib\/fjarmal\.mjs'/,
    'og innflutningurinn á að koma úr einingunni sem Elín mælir við');
});

// ── /api/admin/sync: CSRF-gátin á kökulotu-leiðinni ──────────────────────────────────────────────
// ⚠⚠ adminSyncHandler skrifar HVAÐA stjorn_sync-lykil sem er: rofa starfsmannanna (hjalp_agent_off,
//    rofi_hrafn, rofi_bjarki, rofi_elin), moot-stöðu, gmail_intake, sigrun_vika:…, atb:…. karp_session
//    er Domain=.karp.is, svo wp.karp.is er same-site og SameSite=Lax stoppar ekki POST þaðan, og
//    <form enctype=text/plain> sendir bol sem þáttast sem JSON. Hin admin-POST-in verjast með
//    adminCsrfVilla (hjalp_agent.mjs); þessi gerði það ekki.
// ⚠ Sami bolur í öllum prófunum: munurinn á hafnaðri og leyfðri beiðni er AÐEINS hausarnir.

/** D1-stubbur fyrir sync-leiðina: admin-uppfletting lotunnar + skrif í stjorn_sync. Óþekkt SQL kastar. */
function syncDb(state) {
  const exec = (sql, args) => {
    if (/^SELECT is_admin FROM users WHERE id=\?$/.test(sql)) return state.users[args[0]] || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \(\?,\?,\?\) ON CONFLICT\(k\)/.test(sql)) { state.sync[args[0]] = args[1]; return { meta: {} }; }
    throw new Error('syncDb: óþekkt SQL: ' + sql);
  };
  return { prepare(sql) { let args = []; const st = { bind(...a) { args = a; return st; }, async first() { return exec(sql, args); }, async all() { return exec(sql, args); }, async run() { return exec(sql, args); } }; return st; } };
}
const syncUmhverfi = () => { const state = { users: { 8: { is_admin: 1 } }, sync: {} }; return { state, env: { TENGSL: syncDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó' } }; };
async function cookieFor(env, uid) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return 'karp_session=' + encodeURIComponent(uid + '.' + exp + '.' + await _hmac(env, uid + '.' + exp));
}
// Það sem <form enctype=text/plain> sendir: nafnið `{"k":"hjalp_agent_off","v":"1","x":"`, `=`, gildið `"}` og CRLF.
const SLOKKVA_A_SIGRUNU = '{"k":"hjalp_agent_off","v":"1","x":"="}\r\n';
const sync = async (env, hausar) => (await adminSyncHandler(new Request('https://karp.is/api/admin/sync', { method: 'POST', headers: hausar, body: SLOKKVA_A_SIGRUNU }), env)).json();

test('adminSyncHandler: kross-síðu POST með admin-lotu er hafnað og skrifar ekkert', async () => {
  const { state, env } = syncUmhverfi(); const Cookie = await cookieFor(env, 8);
  const tilfelli = [
    ['formið á wp.karp.is, eins og vafrinn sendir það', { Origin: 'https://wp.karp.is', 'Sec-Fetch-Site': 'same-site', 'content-type': 'text/plain' }, 'origin'],
    ['Origin systkina-undirléns eitt og sér', { Origin: 'https://wp.karp.is', 'content-type': 'application/json' }, 'origin'],
    ['Sec-Fetch-Site same-site eitt og sér', { 'Sec-Fetch-Site': 'same-site', 'content-type': 'application/json' }, 'origin'],
    ['framandi uppruni', { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site', 'content-type': 'application/json' }, 'origin'],
    ['text/plain án Origin og Sec-Fetch-Site (eldri vafri)', { 'content-type': 'text/plain' }, 'content_type'],
    ['rangur X-Admin-Key opnar ekki lykilleiðina, lotan ræður og gátin gildir', { 'X-Admin-Key': 'rangur', Origin: 'https://wp.karp.is', 'content-type': 'application/json' }, 'origin'],
  ];
  for (const [lysing, hausar, villa] of tilfelli) {
    assert.deepEqual(await sync(env, Object.assign({ Cookie }, hausar)), { ok: false, error: villa }, lysing);
  }
  assert.deepEqual(state.sync, {}, 'ekkert skrifaðist í stjorn_sync, rofi Sigrúnar stendur');
});

test('adminSyncHandler: same-origin JSON-POST með admin-lotu skrifar lykilinn', async () => {
  const { state, env } = syncUmhverfi();
  const j = await sync(env, { Cookie: await cookieFor(env, 8), Origin: 'https://karp.is', 'Sec-Fetch-Site': 'same-origin', 'content-type': 'application/json' });
  assert.deepEqual(j, { ok: true });
  assert.equal(state.sync.hjalp_agent_off, '1');
});

test('adminSyncHandler: X-Admin-Key-leiðin er óbreytt, CSRF-gátin á aðeins við um lotuna', async () => {
  // Nákvæmlega það sem Node-stjórnborðið sendi (agent-stjornbord/src/cloud.ts): lykill + JSON, engin kaka.
  let { state, env } = syncUmhverfi();
  assert.deepEqual(await sync(env, { 'X-Admin-Key': 'adm-key', 'content-type': 'application/json' }), { ok: true });
  assert.equal(state.sync.hjalp_agent_off, '1');
  // Hausar sem kökuleiðinni er hafnað fyrir breyta engu hér: leyndarmálið sjálft er sönnunin,
  // og skriptur (t.d. `curl -d` án content-type) mega ekki falla á vafra-reglu.
  ({ state, env } = syncUmhverfi());
  assert.deepEqual(await sync(env, { 'X-Admin-Key': 'adm-key', Origin: 'https://wp.karp.is', 'Sec-Fetch-Site': 'same-site', 'content-type': 'text/plain' }), { ok: true });
  assert.equal(state.sync.hjalp_agent_off, '1');
});
