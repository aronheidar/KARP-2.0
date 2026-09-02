// Gagnagrunns-bilun MÁ EKKI líta út eins og röng skilríki eða útskráning.
// 1.9.2026 sprakk D1-lestrarþakið; `.catch(() => null)` gerði kvótavilluna að „rangt lykilorð“
// og að þögulli útskráningu, svo stjórnandi læstist úti og orsökin var ógreinanleg að utan.
// Þessi próf festa aðskilnaðinn: 'db' / dbError = bilun, 'invalid' = raunverulega röng skilríki.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authLoginHandler, authMeHandler } from '../src/worker/auth.mjs';
import { _hmac } from '../src/worker/felag.mjs';

const SECRET = 'profa-leyndarmal-ekki-i-notkun';

/** env þar sem D1 hendir (eins og 7500-kvótavillan gerir). */
const envSemFellur = () => ({
  SESSION_SECRET: SECRET,
  TENGSL: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1 exceeded free tier daily row read limit'); } }) }) },
});

/** env þar sem D1 svarar en finnur engan notanda. */
const envAnNotanda = () => ({
  SESSION_SECRET: SECRET,
  TENGSL: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
});

const postLogin = (env) => authLoginHandler(
  new Request('https://karp.is/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: 'aron@karp.is', password: 'hvad-sem-er' }),
  }), env);

/** GET /api/auth/me með GILDRI undirritaðri lotu-köku (readSession snertir ekki D1). */
async function getMe(env, uid = 8) {
  const body = uid + '.' + (Math.floor(Date.now() / 1000) + 3600);
  const cookie = 'karp_session=' + encodeURIComponent(body + '.' + await _hmac(env, body));
  return authMeHandler(new Request('https://karp.is/api/auth/me', { headers: { Cookie: cookie } }), env);
}

test('innskráning: D1-bilun skilar "db", EKKI "invalid"', async () => {
  const j = await (await postLogin(envSemFellur())).json();
  assert.equal(j.ok, false);
  assert.equal(j.error, 'db', 'bilun á ekki að líta út eins og rangt lykilorð');
});

test('innskráning: óþekktur notandi skilar áfram "invalid"', async () => {
  const j = await (await postLogin(envAnNotanda())).json();
  assert.equal(j.error, 'invalid', 'engin notenda-upptalning: óþekktur = sama villa og rangt lykilorð');
});

test('auth/me: D1-bilun skilar dbError, ekki þögulli útskráningu', async () => {
  const env = envSemFellur();
  const j = await (await getMe(env)).json();
  assert.equal(j.dbError, true, 'framendinn verður að geta greint bilun frá útskráningu');
  assert.equal(j.loggedIn, false, 'við VITUM ekki stöðuna → ekki fullyrða að hann sé innskráður');
});

test('auth/me: eydd notandaröð er ÁFRAM venjuleg útskráning (ekkert dbError)', async () => {
  const j = await (await getMe(envAnNotanda())).json();
  assert.equal(j.loggedIn, false);
  assert.ok(!j.dbError, 'engin röð != bilun — annars felum við raunverulegar útskráningar');
});

test('auth/me: engin lotu-kaka snertir hvorki D1 né dbError', async () => {
  const env = envSemFellur();   // myndi henda EF spurt væri
  const j = await (await authMeHandler(new Request('https://karp.is/api/auth/me'), env)).json();
  assert.equal(j.loggedIn, false);
  assert.ok(!j.dbError, 'útskráður gestur á ekki að fá bilunar-skilaboð');
});
