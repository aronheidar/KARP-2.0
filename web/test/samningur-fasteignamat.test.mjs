// /api/u/fasteign/meta fyrir starfsmann á samningi (Allt): ótakmarkað verðmat, og notkunin talin á
// SAMNINGINN svo hægt sé að semja um endurnýjun út frá raunnotkun.
// ⚠⚠ Talningin geymir EKKERT persónugreinanlegt: hvorki heimilisfang, notanda né fyrirspurn. Manneskja
//    sem metur hús er að gefa til kynna hvaða eign er til skoðunar. Aðeins mánuður, samningur, þjónusta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { _hmac } from '../src/worker/felag.mjs';

const SECRET = 'profa-leyndarmal-ekki-i-notkun';
const LYKILL = 'fasteign:Heiðarbraut 12, 230';

function fakeDb(svara, log) {
  return {
    prepare(sql) {
      const mk = (args) => ({
        bind: (...a) => mk(a),
        first: async () => { log.push([sql, args]); return svara(sql, args) ?? null; },
        all: async () => { log.push([sql, args]); return { results: [] }; },
        run: async () => { log.push([sql, args]); svara(sql, args); return { meta: {} }; },
      });
      return mk([]);
    },
  };
}

async function meta(notandi, { sub = null, talningFellur = false } = {}) {
  const log = [];
  const env = {
    SESSION_SECRET: SECRET,
    TENGSL: fakeDb((sql) => {
      if (/INSERT INTO samningur_notkun/.test(sql) && talningFellur) throw new Error('D1 niðri');
      if (/FROM users WHERE id=\?/.test(sql)) return notandi;
      if (/FROM sub_service/.test(sql)) return sub;
      return null;
    }, log),
  };
  const body = notandi.id + '.' + (Math.floor(Date.now() / 1000) + 3600);
  const cookie = 'karp_session=' + encodeURIComponent(body + '.' + await _hmac(env, body));
  const r = await worker.fetch(new Request('https://karp.is/api/u/fasteign/meta', {
    method: 'POST', headers: { Cookie: cookie, 'content-type': 'application/json' }, body: JSON.stringify({ key: LYKILL }),
  }), env, { waitUntil() {} });
  return { svar: await r.json(), log };
}

const STARFSMADUR = { id: 40, is_admin: 0, free_access: 0, parent_account_id: null, samningur: 'allt' };
const manudur = () => new Date().toISOString().slice(0, 7);

test('starfsmaður á samningi fær ótakmarkað verðmat', async () => {
  const { svar } = await meta(STARFSMADUR);
  assert.deepEqual(svar, { granted: true, owned: false, remaining: -1 });
});

test('verðmatið telst á samninginn: mánuður, samningur og þjónusta', async () => {
  const { log } = await meta(STARFSMADUR);
  const t = log.find(([sql]) => /INSERT INTO samningur_notkun/.test(sql));
  assert.ok(t, 'engin talning');
  assert.match(t[0], /ON CONFLICT/);
  assert.deepEqual(t[1], [manudur(), 'allt', 'fasteign']);
});

test('⚠⚠ ekkert persónugreinanlegt í talningunni og ekkert heimilisfang vistað á notandann', async () => {
  const { log } = await meta(STARFSMADUR);
  const skrifad = log.filter(([sql]) => /^\s*(INSERT|UPDATE)/i.test(sql));
  assert.equal(/Heiðarbraut|Heidarbraut/i.test(JSON.stringify(skrifad)), false, 'heimilisfang má hvergi skrifast');
  assert.equal(skrifad.some(([, a]) => a.includes(40)), false, 'notandinn má ekki fylgja talningunni');
});

test('samningsverðmat étur ekki kvóta eigin áskriftar', async () => {
  const { svar, log } = await meta(STARFSMADUR, { sub: { user_id: 40, service: 'fasteign', until: 9e9, used: 19, used_month: manudur() } });
  assert.equal(svar.remaining, -1);
  assert.equal(log.some(([sql]) => /UPDATE sub_service/.test(sql)), false);
});

test('talning sem fellur fellir ekki verðmatið', async () => {
  const { svar } = await meta(STARFSMADUR, { talningFellur: true });
  assert.equal(svar.granted, true);
});

test('notandi án samnings og án áskriftar fær áfram nosub', async () => {
  const { svar, log } = await meta({ ...STARFSMADUR, samningur: null });
  assert.deepEqual(svar, { error: 'nosub' });
  assert.equal(log.some(([sql]) => /samningur_notkun/.test(sql)), false);
});
