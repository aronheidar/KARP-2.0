// Sjálfvirk innskráning úr staðfestingarhlekk aðeins í vafranum sem nýskráði sig (22.9). Áður skráði hlekkurinn
// HVAÐA vafra sem er inn sem eiganda tókans, svo sá sem sendi þér sinn eigin hlekk gat skráð þig inn á sinn
// reikning. Prófað á raunverulegri SQLite með migration-skemanu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { _hmac } from './felag.mjs';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* ekki til — prófum sleppt */ }
const t = DatabaseSync ? test : test.skip;
const { authRegisterHandler, authVerifyHandler, readSession, nyskraUid } = await import('./auth.mjs');

const SS = 'leyndo-nyskra';
const mig = (n) => readFileSync(fileURLToPath(new URL('../../migrations/' + n, import.meta.url)), 'utf8');
function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
  });
  return { prepare: (sql) => stmt(sql) };
}
function grunnur() {
  const db = new DatabaseSync(':memory:');
  db.exec(mig('0002_auth.sql'));
  db.exec(mig('0006_stjorn_sync.sql'));
  return { db, env: { TENGSL: d1(db), SESSION_SECRET: SS } };
}
const nyskra = (env, email) => authRegisterHandler(new Request('https://karp.is/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'lykilord-123', terms: true }) }), env);
const tokiFyrir = (db, email) => db.prepare("SELECT t.token FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE u.email=? AND t.kind='verify'").get(email).token;
const kokurUr = (res) => (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')]).filter(Boolean);
const gildiKoku = (kaka) => kaka.split(';')[0];   // „nafn=gildi" eins og vafrinn sendir til baka
const smella = (env, toki, kokur = []) => authVerifyHandler(new Request('https://karp.is/api/auth/verify?token=' + toki, { headers: kokur.length ? { Cookie: kokur.join('; ') } : {} }), env);

t('nýskráning setur __Host-köku: Secure, Path=/, ENGIN Domain, svo wp.karp.is getur hvorki sett hana né skrifað yfir', async () => {
  const { env } = grunnur();
  const res = await nyskra(env, 'anna@x.is');
  assert.equal((await res.json()).ok, true);
  const [kaka] = kokurUr(res);
  assert.match(kaka, /^__Host-karp_nyskra=/);
  assert.match(kaka, /; Path=\/;/);
  assert.match(kaka, /; Secure;/);
  assert.match(kaka, /; HttpOnly;/);
  assert.match(kaka, /; SameSite=Lax;/, 'Lax: hlekkur úr vefpósti er leiðsögn af öðrum vef');
  assert.doesNotMatch(kaka, /Domain=/i);
});

t('sami vafri: hlekkurinn staðfestir, skráir inn og hreinsar nýskráningarkökuna', async () => {
  const { db, env } = grunnur();
  const kaka = kokurUr(await nyskra(env, 'anna@x.is'))[0];
  const res = await smella(env, tokiFyrir(db, 'anna@x.is'), [gildiKoku(kaka)]);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/mitt-svaedi/?verified=1');
  const k = kokurUr(res);
  const lota = k.find((x) => x.startsWith('karp_session=') && !/Max-Age=0/.test(x));
  assert.ok(lota, 'lota búin til');
  const uid = db.prepare("SELECT id FROM users WHERE email='anna@x.is'").get().id;
  assert.equal(await readSession(env, new Request('https://karp.is/', { headers: { Cookie: gildiKoku(lota) } })), uid, 'lotan er fyrir nýja notandann');
  assert.ok(k.some((x) => x.startsWith('__Host-karp_nyskra=;') && /Max-Age=0/.test(x)), 'nýskráningarkakan hreinsuð');
  assert.equal(db.prepare('SELECT email_verified FROM users WHERE id=?').get(uid).email_verified, 1);
});

t('annar vafri eða tæki: netfangið staðfestist, en engin lota — innskráning á /innskra/', async () => {
  const { db, env } = grunnur();
  await nyskra(env, 'anna@x.is');
  const res = await smella(env, tokiFyrir(db, 'anna@x.is'));
  assert.equal(res.headers.get('location'), '/innskra/?verify=ok');
  assert.deepEqual(kokurUr(res), [], 'engin kaka sett');
  assert.equal(db.prepare("SELECT email_verified FROM users WHERE email='anna@x.is'").get().email_verified, 1);
});

t('árásin: hlekkur árásaraðila í vafra fórnarlambs skráir fórnarlambið hvorki inn né út', async () => {
  const { db, env } = grunnur();
  const kakaFornarl = kokurUr(await nyskra(env, 'fornarlamb@x.is'))[0];   // fórnarlambið nýskráði sig líka í þessum vafra
  await nyskra(env, 'illur@x.is');
  const fornarlamb = db.prepare("SELECT id FROM users WHERE email='fornarlamb@x.is'").get().id;
  // (a) nýskráningarkaka fórnarlambsins opnar ekki reikning árásaraðilans
  const a = await smella(env, tokiFyrir(db, 'illur@x.is'), [gildiKoku(kakaFornarl)]);
  assert.equal(a.headers.get('location'), '/innskra/?verify=ok');
  assert.deepEqual(kokurUr(a), []);
  // (b) innskráð fórnarlamb helst innskráð sem það sjálft
  const body = fornarlamb + '.' + (Math.floor(Date.now() / 1000) + 3600);
  const lota = 'karp_session=' + encodeURIComponent(body + '.' + await _hmac({ SESSION_SECRET: SS }, body));
  await nyskra(env, 'illur2@x.is');
  const b = await smella(env, tokiFyrir(db, 'illur2@x.is'), [lota]);
  assert.equal(b.headers.get('location'), '/innskra/?verify=ok');
  assert.deepEqual(kokurUr(b), [], 'lotu fórnarlambsins er hvorki skipt út né hún hreinsuð');
});

t('fölsuð, útrunnin eða lánuð kaka gefur enga lotu', async () => {
  const { db, env } = grunnur();
  await nyskra(env, 'anna@x.is');
  const uid = db.prepare("SELECT id FROM users WHERE email='anna@x.is'").get().id;
  const nu = Math.floor(Date.now() / 1000);
  const med = (gildi) => new Request('https://karp.is/', { headers: { Cookie: '__Host-karp_nyskra=' + encodeURIComponent(gildi) } });
  const exp = nu + 3600;
  assert.equal(await nyskraUid(env, med(uid + '.' + exp + '.' + await _hmac(env, 'nyskra:' + uid + ':' + exp))), uid, 'rétt undirrituð');
  assert.equal(await nyskraUid(env, med(uid + '.' + exp + '.falsad')), 0);
  const gomul = nu - 10;
  assert.equal(await nyskraUid(env, med(uid + '.' + gomul + '.' + await _hmac(env, 'nyskra:' + uid + ':' + gomul))), 0, 'útrunnin');
  // lotukakan notar sama leyndarmál en annað skilaboðasnið (`uid.exp`): hún má ekki duga sem nýskráningarkaka
  const lotuGildi = uid + '.' + exp + '.' + await _hmac(env, uid + '.' + exp);
  assert.equal(await nyskraUid(env, med(lotuGildi)), 0, 'lotu-undirskrift er ekki nýskráningar-undirskrift');
  assert.equal(await nyskraUid(Object.assign({}, env, { SESSION_SECRET: 'annad' }), med(uid + '.' + exp + '.' + await _hmac(env, 'nyskra:' + uid + ':' + exp))), 0, 'annað leyndarmál þjónsins');
  const res = await smella(env, tokiFyrir(db, 'anna@x.is'), ['__Host-karp_nyskra=' + encodeURIComponent(lotuGildi)]);
  assert.equal(res.headers.get('location'), '/innskra/?verify=ok');
});

t('þegar innskráður sem sami notandi: staðfestingin heldur lotunni án þess að búa til nýja', async () => {
  const { db, env } = grunnur();
  await nyskra(env, 'anna@x.is');
  const uid = db.prepare("SELECT id FROM users WHERE email='anna@x.is'").get().id;
  const body = uid + '.' + (Math.floor(Date.now() / 1000) + 3600);
  const lota = 'karp_session=' + encodeURIComponent(body + '.' + await _hmac({ SESSION_SECRET: SS }, body));
  const res = await smella(env, tokiFyrir(db, 'anna@x.is'), [lota]);
  assert.equal(res.headers.get('location'), '/mitt-svaedi/?verified=1');
  assert.deepEqual(kokurUr(res), []);
});
