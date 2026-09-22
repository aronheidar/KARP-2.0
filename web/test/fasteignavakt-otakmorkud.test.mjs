// Fasteignavaktin (sérlausn 'fasteign', 3.900 kr/mán) gefur ÓTAKMÖRKUÐ verðmöt frá 22.9.2026, ekki 20 á mánuði.
// Ákvörðun Arons: „þessi markaður er núna með mikla samkeppni. höldum verðinu í 3900 á síðunni".
// ⚠ Loforðið býr á tveimur stöðum sem verða að segja það sama: þjóninum (/api/u/fasteign/meta, /me)
//   og vörulýsingunni (data/lausnir.js). Prófin hér negla bæði.
// ⚠ Án kvóta er enginn tilgangur með `fasteign_done` (listi yfir metin heimilisföng, var aðeins til svo
//   endurmat sömu eignar æti ekki kvótann). Hann er ekki skrifaður lengur: við geymum ekki heimilisföng
//   sem enginn þarf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { authMeHandler } from '../src/worker/auth.mjs';
import { _hmac } from '../src/worker/felag.mjs';
import { SERLAUSNIR } from '../src/data/lausnir.js';
import { PRICE_SVC } from '../src/lib/fjarmal.mjs';

const SECRET = 'profa-leyndarmal-ekki-i-notkun';
const LYKILL = 'fasteign:Heiðarbraut 12, 230';
const manudur = () => new Date().toISOString().slice(0, 7);

function fakeDb(svara, log) {
  return {
    prepare(sql) {
      const mk = (args) => ({
        bind: (...a) => mk(a),
        first: async () => { log.push([sql, args]); return svara(sql, args, 'first') ?? null; },
        all: async () => { log.push([sql, args]); return { results: svara(sql, args, 'all') || [] }; },
        run: async () => { log.push([sql, args]); return { meta: {} }; },
      });
      return mk([]);
    },
  };
}

const kaka = async (env, uid) => {
  const body = uid + '.' + (Math.floor(Date.now() / 1000) + 3600);
  return 'karp_session=' + encodeURIComponent(body + '.' + await _hmac(env, body));
};

async function meta(notandi, sub) {
  const log = [];
  const env = {
    SESSION_SECRET: SECRET,
    TENGSL: fakeDb((sql) => {
      if (/FROM users WHERE id=\?/.test(sql)) return notandi;
      if (/FROM sub_service/.test(sql)) return sub;
      return null;
    }, log),
  };
  const r = await worker.fetch(new Request('https://karp.is/api/u/fasteign/meta', {
    method: 'POST', headers: { Cookie: await kaka(env, notandi.id), 'content-type': 'application/json' }, body: JSON.stringify({ key: LYKILL }),
  }), env, { waitUntil() {} });
  return { svar: await r.json(), log };
}

const ASKRIFANDI = { id: 7, is_admin: 0, free_access: 0, parent_account_id: null, samningur: null };
const askrift = (used, used_month = manudur()) => ({ user_id: 7, service: 'fasteign', until: 9e9, used, used_month });

test('áskrifandi fær ótakmarkað: 25. verðmat mánaðarins fer í gegn (þakið var 20)', async () => {
  const { svar } = await meta(ASKRIFANDI, askrift(25));
  assert.deepEqual(svar, { granted: true, owned: false, remaining: -1 });
});

test('verðmat áskrifanda telst áfram í yfirlitinu (used), án heimilisfangs', async () => {
  const { log } = await meta(ASKRIFANDI, askrift(25));
  const u = log.find(([sql]) => /UPDATE sub_service SET used=\?, used_month=\?/.test(sql));
  assert.ok(u, 'engin talning');
  assert.deepEqual(u[1], [26, manudur(), 7, 'fasteign']);
  const skrifad = log.filter(([sql]) => /^\s*(INSERT|UPDATE)/i.test(sql));
  assert.equal(/Heiðarbraut|Heidarbraut/i.test(JSON.stringify(skrifad)), false, 'heimilisfang má hvergi skrifast');
  assert.equal(skrifad.some(([sql]) => /user_prefs/.test(sql)), false, 'fasteign_done er ekki skrifaður lengur');
});

test('nýr mánuður: talningin byrjar á einum', async () => {
  const { log } = await meta(ASKRIFANDI, askrift(40, '2020-01'));
  const u = log.find(([sql]) => /UPDATE sub_service SET used=\?, used_month=\?/.test(sql));
  assert.deepEqual(u[1], [1, manudur(), 7, 'fasteign']);
});

test('kerfisstjóri og frír aðgangur: ótakmarkað og ekkert heimilisfang vistað', async () => {
  for (const notandi of [{ ...ASKRIFANDI, is_admin: 1 }, { ...ASKRIFANDI, free_access: 1 }]) {
    const { svar, log } = await meta(notandi, null);
    assert.deepEqual(svar, { granted: true, owned: false, remaining: -1 });
    assert.equal(log.some(([sql]) => /^\s*(INSERT|UPDATE)/i.test(sql) && /user_prefs/.test(sql)), false);
  }
});

test('án áskriftar er ekkert breytt: nosub', async () => {
  const { svar } = await meta(ASKRIFANDI, null);
  assert.deepEqual(svar, { error: 'nosub' });
});

test('/me: fasteign-áskrift er ótakmörkuð (quota -1), þingmannaskýrslur áfram 20', async () => {
  const env = {
    SESSION_SECRET: SECRET,
    TENGSL: fakeDb((sql, args, h) => {
      if (/FROM users WHERE id=\?/.test(sql)) return { ...ASKRIFANDI, email: 'a@stofa.example', pass_hash: 'pbkdf2$1$a$b', email_verified: 1 };
      if (/FROM sub_service WHERE user_id=\?/.test(sql) && h === 'all') {
        return [{ service: 'fasteign', used: 30, used_month: manudur() }, { service: 'thingskyrslur', used: 5, used_month: manudur() }];
      }
      return null;
    }, []),
  };
  const j = await (await authMeHandler(new Request('https://karp.is/api/auth/me', { headers: { Cookie: await kaka(env, 7) } }), env)).json();
  assert.deepEqual(j.svcQuota.fasteign, { used: 30, quota: -1, remaining: -1 });
  assert.deepEqual(j.svcQuota.thingskyrslur, { used: 5, quota: 20, remaining: 15 });
});

test('vörulýsingin lofar því sama og þjónninn gerir, á óbreyttu verði', () => {
  const f = SERLAUSNIR.find((s) => s.service === 'fasteign');
  assert.match(f.lysing, /[Óó]takmörkuð verðmöt/);
  assert.equal(/\b20\b/.test(f.lysing), false, 'ekkert 20-þak í lýsingunni');
  assert.equal(f.verd, 3900, 'verðið helst 3.900 kr');
  assert.equal(PRICE_SVC.fasteign, 3900, 'MRR og samstemming mæla sama verð');
});
