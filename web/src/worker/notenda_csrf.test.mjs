// CSRF á notenda-leiðunum (22.9), framhald af admin_csrf.test.mjs. Lax-lotukakan fylgir POST af wp.karp.is
// (sama „site"), og /api/kyc/ack, /api/u/reports/open, /api/auth/kt o.fl. þáttuðu JSON án uppruna-gátar:
// síða þar gat merkt KYC-viðvaranir viðskiptavinar afgreiddar, brennt greidda skýrslu-inneign hans eða skipt
// um kennitölu reikningsins. Hlið leiðavalsins (kokuHlidVilla) nær þeim öllum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kokuHlidVilla } from './hjalp_agent.mjs';

const KAKA = 'karp_session=8.9999999999.falsad';   // hliðið les tilvist kökunnar, gildið skiptir ekki máli hér
const hausar = {
  wp: { 'Sec-Fetch-Site': 'same-site', Origin: 'https://wp.karp.is', 'content-type': 'text/plain' },
  wpGamall: { Origin: 'https://wp.karp.is', 'content-type': 'text/plain' },           // án Sec-Fetch-Site
  annarVefur: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://illt.example', 'content-type': 'text/plain' },
  innan: { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://karp.is', 'content-type': 'application/json' },
  beacon: { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://karp.is', 'content-type': 'text/plain;charset=UTF-8' },
  eydu: { 'content-type': 'text/plain' },
};
const r = (slod, adferd, h, kaka = true) => new Request('https://karp.is' + slod, { method: adferd, headers: Object.assign(kaka ? { Cookie: 'x=1; ' + KAKA } : {}, h) });

test('kokuHlidVilla: POST með köku af wp.karp.is eða öðrum vef fellur, af karp.is fer það í gegn', () => {
  const s = '/api/kyc/ack';
  assert.equal(kokuHlidVilla(r(s, 'POST', hausar.wp), s), 'origin');
  assert.equal(kokuHlidVilla(r(s, 'POST', hausar.wpGamall), s), 'origin', 'Origin einn dugar');
  assert.equal(kokuHlidVilla(r(s, 'POST', hausar.annarVefur), s), 'origin');
  assert.equal(kokuHlidVilla(r(s, 'DELETE', hausar.wp), s), 'origin');
  assert.equal(kokuHlidVilla(r(s, 'POST', hausar.innan), s), null);
  assert.equal(kokuHlidVilla(r(s, 'POST', hausar.beacon), s), null, 'sendBeacon og útskráning af karp.is senda ekki JSON');
  assert.equal(kokuHlidVilla(r(s, 'POST', hausar.eydu), s), 'content_type', 'án upprunahausa er JSON krafist');
  assert.equal(kokuHlidVilla(r(s, 'POST', Object.assign({}, hausar.eydu, { 'content-type': 'application/json' })), s), null);
});

test('kokuHlidVilla: lestur fer óbreyttur, og beiðni án köku líka nema á /api/auth/*', () => {
  assert.equal(kokuHlidVilla(r('/api/u/reports', 'GET', hausar.wp), '/api/u/reports'), null);
  assert.equal(kokuHlidVilla(r('/api/u/reports', 'HEAD', hausar.wp), '/api/u/reports'), null);
  assert.equal(kokuHlidVilla(r('/api/askell/webhook', 'POST', hausar.annarVefur, false), '/api/askell/webhook'), null, 'vefkrókur ber enga köku');
  assert.equal(kokuHlidVilla(r('/api/cto/drog', 'POST', hausar.eydu, false), '/api/cto/drog'), null);
  assert.equal(kokuHlidVilla(r('/api/auth/login', 'POST', hausar.wp, false), '/api/auth/login'), 'origin', 'innskráningar-CSRF: útskráður gestur skráður inn sem árásaraðili');
  assert.equal(kokuHlidVilla(r('/api/auth/login', 'POST', hausar.innan, false), '/api/auth/login'), null);
  assert.equal(kokuHlidVilla(new Request('https://karp.is/api/u/profile', { method: 'POST', headers: Object.assign({ Cookie: 'annad=1; karp_session_gomul=x' }, hausar.wp) }), '/api/u/profile'), null, 'aðeins karp_session telst lota');
});

// Leiðirnar sem rýnin 22.9 nefndi, keyrðar gegnum leiðaval workersins sjálfs
const LEIDIR = ['/api/kyc/ack', '/api/kyc/watch', '/api/u/reports/open', '/api/u/thing/open', '/api/auth/kt', '/api/u/profile',
  '/api/u/follows', '/api/u/leitvakt', '/api/pay/checkout', '/api/stjorn/request?kt=5902697199', '/api/auth/logout', '/api/auth/resend-verify', '/api/leikur/ABC123/decisions', '/api/hjalp',
  '/api/arsreikningur/request?kt=5902697199', '/api/eigendur/request?kt=5902697199'];

test('leiðavalið: POST af wp.karp.is með köku fær origin á öllum leiðunum sem rýnin nefndi', async () => {
  const worker = (await import('../../worker.js')).default;
  for (const s of LEIDIR) {
    const res = await worker.fetch(new Request('https://karp.is' + s, { method: 'POST', headers: Object.assign({ Cookie: KAKA }, hausar.wp), body: '{"id":1}' }), {}, { waitUntil: () => {} });
    assert.deepEqual(await res.json(), { ok: false, error: 'origin' }, s);
  }
});

test('leiðavalið: hliðið stendur á undan hverri /api/-leið í fetch', () => {
  const src = readFileSync(fileURLToPath(new URL('../../worker.js', import.meta.url)), 'utf8');
  const f = src.indexOf('async fetch(request, env, ctx)');
  const hlid = src.indexOf("if (url.pathname.startsWith('/api/')) { const v = kokuHlidVilla(request, url.pathname)");
  assert.ok(f > 0 && hlid > f, 'hliðið er inni í fetch');
  const leidir = [...src.slice(f).matchAll(/url\.pathname(?: === '|\.startsWith\(')(\/api\/[^']*)'/g)]
    .map((m) => ({ slod: m[1], i: f + m.index })).filter((l) => l.slod !== '/api/' && l.slod !== '/api/admin/');
  assert.ok(leidir.length > 60, 'fann /api-leiðirnar (' + leidir.length + ')');
  for (const l of leidir) assert.ok(l.i > hlid, l.slod + ' stendur á undan hliðinu');
});

test('útskráning og stjórnar-beiðni taka aðeins POST (GET-hlekkur af öðrum vef fylgir Lax-kökunni)', async () => {
  const worker = (await import('../../worker.js')).default;
  const get = (s) => worker.fetch(new Request('https://karp.is' + s, { headers: { Cookie: KAKA, 'Sec-Fetch-Site': 'cross-site' } }), {}, { waitUntil: () => {} }).then((x) => x.json());
  assert.deepEqual(await get('/api/auth/logout'), { ok: false, error: 'post' });
  assert.deepEqual(await get('/api/stjorn/request?kt=5902697199'), { error: 'post' });
  // rýnin 22.9: sama gat á hinum tveimur keyrslu-leiðunum (ársreikningurinn skrapar RSK og ýtir á main)
  assert.deepEqual(await get('/api/arsreikningur/request?kt=5902697199'), { error: 'post' });
  assert.deepEqual(await get('/api/eigendur/request?kt=5902697199'), { error: 'post' });
  const ut = await worker.fetch(new Request('https://karp.is/api/auth/logout', { method: 'POST', headers: { Cookie: KAKA, 'Sec-Fetch-Site': 'same-origin', Origin: 'https://karp.is' } }), {}, { waitUntil: () => {} });
  assert.deepEqual(await ut.json(), { ok: true }, 'útskráning af karp.is virkar áfram');
  assert.match(ut.headers.get('set-cookie') || '', /karp_session=;.*Max-Age=0/);
});
