// CSRF á admin-leiðunum (22.9). Lotukakan er `Domain=.karp.is; SameSite=Lax`, og Lax ver EKKI gegn
// wp.karp.is: það er sama „site", svo síða eða viðbót þar gat sent POST á /api/admin/* með köku Arons.
// Fimm leiðir athuguðu ekki uppruna (set-type gerði hvern sem er að admin). Prófin nota GILDA admin-köku,
// svo höfnun sannar að hliðið stóð, ekki að innskráningin brást.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { _hmac } from './felag.mjs';
import { adminHlidVilla } from './hjalp_agent.mjs';
import { adminUserHandler, adminEmailHandler, adminRefreshHandler, adminSendHandler, adminSetTypeHandler } from './stjornbord.mjs';

const SS = 'leyndo-csrf-profun', ADMIN = 8, MARK = 5;
// D1-stubbur: notandi #8 er admin, #5 venjulegur. Hvert run() er skráð, svo prófið sjái hvort EITTHVAÐ var skrifað.
function gerdEnv(auka = {}) {
  const skrif = [];
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => {
      if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return { is_admin: args[0] === ADMIN ? 1 : 0 };
      if (/FROM users WHERE id=\?/.test(sql)) return { id: args[0], email: 'n' + args[0] + '@x.is', name: '', is_admin: 0, email_verified: 0 };
      if (/COUNT\(\*\) c FROM users WHERE is_admin=1/.test(sql)) return { c: 2 };
      return null;
    },
    all: async () => ({ results: [] }),
    run: async () => { skrif.push(sql.replace(/\s+/g, ' ').slice(0, 30)); return {}; },
  });
  return { skrif, env: Object.assign({ TENGSL: { prepare: (sql) => st(sql) }, SESSION_SECRET: SS, ADMIN_API_KEY: 'adm-lykill' }, auka) };
}
async function kaka(uid) {
  const body = uid + '.' + (Math.floor(Date.now() / 1000) + 3600);
  return 'karp_session=' + encodeURIComponent(body + '.' + await _hmac({ SESSION_SECRET: SS }, body));
}
const ctx = { waitUntil: () => {} };
// Beiðni af karp.is sjálfu (vafrinn setur Sec-Fetch-Site og Origin), af wp.karp.is, og án vafrahausa.
const hausar = {
  innan: { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://karp.is', 'content-type': 'application/json' },
  wp: { 'Sec-Fetch-Site': 'same-site', Origin: 'https://wp.karp.is', 'content-type': 'text/plain' },
  eyduform: { 'content-type': 'text/plain' },   // gamall vafri eða form án Origin: aðeins content-type ver
};
async function beidni(slod, hvadan, body, adferd = 'POST') {
  const h = Object.assign({ Cookie: await kaka(ADMIN) }, hausar[hvadan]);
  return new Request('https://karp.is' + slod, { method: adferd, headers: h, body: adferd === 'GET' ? undefined : JSON.stringify(body) });
}

const LEIDIR = [
  ['set-type', adminSetTypeHandler, { id: MARK, type: 'admin' }],
  ['user', adminUserHandler, { id: MARK, action: 'verify' }],
  ['email', adminEmailHandler, { id: 'welcome', reset: true }],
  ['refresh', adminRefreshHandler, {}],
  ['send', adminSendHandler, { to: 'hver@sem.er', subject: 'Frá Karp', html: '<p>x</p>' }],
];

test('fimm leiðirnar hafna POST af wp.karp.is þótt kakan sé gild admin-kaka, og skrifa ekkert', async () => {
  const utkoll = [];
  const orig = globalThis.fetch; globalThis.fetch = async (u) => { utkoll.push(String(u)); return { status: 204, ok: true, json: async () => ({}) }; };
  try {
    for (const [nafn, fall, body] of LEIDIR) {
      const { env, skrif } = gerdEnv({ GITHUB_DISPATCH_TOKEN: 'ghp' });
      const j = await (await fall(await beidni('/api/admin/' + nafn, 'wp', body), env, ctx)).json();
      assert.deepEqual(j, { ok: false, error: 'origin' }, nafn);
      assert.deepEqual(skrif, [], nafn + ': ekkert skrifað');
    }
  } finally { globalThis.fetch = orig; }
  assert.deepEqual(utkoll, [], 'hvorki GitHub-keyrsla ræst né póstur sendur');
});

test('text/plain án Origin (form eða gamall vafri) fellur á content-type', async () => {
  for (const [nafn, fall, body] of LEIDIR) {
    const { env, skrif } = gerdEnv();
    const j = await (await fall(await beidni('/api/admin/' + nafn, 'eyduform', body), env, ctx)).json();
    assert.deepEqual(j, { ok: false, error: 'content_type' }, nafn);
    assert.deepEqual(skrif, [], nafn);
  }
});

test('sama beiðni af karp.is sjálfu fer í gegn: /stjorn/ virkar áfram', async () => {
  const st = gerdEnv();
  assert.deepEqual(await (await adminSetTypeHandler(await beidni('/api/admin/set-type', 'innan', { id: MARK, type: 'free' }), st.env)).json(), { ok: true, id: MARK, type: 'free' });
  assert.ok(st.skrif.some((s) => s.startsWith('UPDATE users SET is_admin')), 'tegundin var skrifuð');
  const us = gerdEnv();
  assert.deepEqual(await (await adminUserHandler(await beidni('/api/admin/user', 'innan', { id: MARK, action: 'verify' }), us.env, ctx)).json(), { ok: true });
  const em = gerdEnv();
  assert.equal((await (await adminEmailHandler(await beidni('/api/admin/email', 'innan', { id: 'welcome', reset: true }), em.env, ctx)).json()).ok, true);
  const orig = globalThis.fetch; globalThis.fetch = async () => ({ status: 204, ok: true, json: async () => ({}) });
  try {
    const rf = gerdEnv({ GITHUB_DISPATCH_TOKEN: 'ghp' });
    assert.deepEqual(await (await adminRefreshHandler(await beidni('/api/admin/refresh', 'innan', {}), rf.env, ctx)).json(), { ok: true });
  } finally { globalThis.fetch = orig; }
});

test('send: X-Admin-Key (þjónn til þjóns) þarf hvorki Origin né köku, en rangur lykill fær enga undanþágu', async () => {
  const { env } = gerdEnv();
  const med = (lykill) => new Request('https://karp.is/api/admin/send', { method: 'POST', headers: Object.assign({ 'X-Admin-Key': lykill }, hausar.wp), body: JSON.stringify({ to: 'a@b.is', subject: 's', text: 't' }) });
  const rett = await (await adminSendHandler(med('adm-lykill'), env)).json();
  assert.notEqual(rett.error, 'origin');
  assert.notEqual(rett.error, 'content_type');
  assert.deepEqual(await (await adminSendHandler(med('giskad'), env)).json(), { ok: false, error: 'origin' });
});

test('set-type tekur aðeins POST', async () => {
  const { env, skrif } = gerdEnv();
  assert.deepEqual(await (await adminSetTypeHandler(await beidni('/api/admin/set-type?id=5&type=admin', 'innan', null, 'GET'), env)).json(), { ok: false, error: 'post' });
  assert.deepEqual(skrif, []);
});

test('adminHlidVilla: lestur og gildur lykill fara óbreytt, allt annað verður að vera same-origin JSON', () => {
  const env = { ADMIN_API_KEY: 'adm-lykill' };
  const r = (adferd, h) => new Request('https://karp.is/api/admin/ticket', { method: adferd, headers: h });
  assert.equal(adminHlidVilla(r('GET', hausar.wp), env), null, 'lestur breytir engu');
  assert.equal(adminHlidVilla(r('HEAD', hausar.wp), env), null);
  assert.equal(adminHlidVilla(r('POST', Object.assign({ 'X-Admin-Key': 'adm-lykill' }, hausar.wp)), env), null);
  assert.equal(adminHlidVilla(r('POST', Object.assign({ 'X-Admin-Key': 'giskad' }, hausar.wp)), env), 'origin');
  assert.equal(adminHlidVilla(r('POST', hausar.innan), env), null);
  assert.equal(adminHlidVilla(r('DELETE', hausar.wp), env), 'origin');
  assert.equal(adminHlidVilla(r('OPTIONS', hausar.wp), env), 'origin');
  assert.equal(adminHlidVilla(r('POST', hausar.wp), {}), 'origin', 'án ADMIN_API_KEY í env gildir enginn lykill');
});

test('leiðavalið: hliðið stendur á undan ÖLLUM /api/admin/-leiðum, og hafnar POST af wp.karp.is á hverri þeirra', async () => {
  const src = readFileSync(fileURLToPath(new URL('../../worker.js', import.meta.url)), 'utf8');
  const fetchByrjar = src.indexOf('async fetch(request, env, ctx)');
  const hlid = src.indexOf("url.pathname.startsWith('/api/admin/')) { const v = adminHlidVilla(request, env)");
  assert.ok(fetchByrjar > 0 && hlid > fetchByrjar, 'hliðið er inni í fetch');
  const leidir = [...src.slice(fetchByrjar).matchAll(/url\.pathname === '(\/api\/admin\/[^']+)'/g)].map((m) => ({ slod: m[1], i: fetchByrjar + m.index }));
  assert.ok(leidir.length >= 13, 'fann admin-leiðirnar (' + leidir.length + ')');
  for (const l of leidir) assert.ok(l.i > hlid, l.slod + ' stendur á undan hliðinu');
  const worker = (await import('../../worker.js')).default;
  for (const { slod } of leidir) {
    const res = await worker.fetch(new Request('https://karp.is' + slod, { method: 'POST', headers: Object.assign({ Cookie: await kaka(ADMIN) }, hausar.wp), body: '{"id":5,"type":"admin"}' }), { ADMIN_API_KEY: 'adm-lykill', SESSION_SECRET: SS }, ctx);
    assert.deepEqual(await res.json(), { ok: false, error: 'origin' }, slod);
  }
});
