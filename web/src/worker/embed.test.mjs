// ⚠⚠ Teljarinn má ALDREI geyma heimilisfang. Manneskja sem flettir upp sínu eigin húsi á
// fasteignasöluvef er að gefa sterkt til kynna að hún sé að íhuga sölu. Sá listi verður ekki til.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMBED_LEN, embedTalningHandler } from './embed.mjs';

function fakeDb(state) {
  return {
    prepare(sql) {
      let a = [];
      const st = {
        bind(...x) { a = x; return st; },
        async run() { state.sql.push([sql, a]); return { meta: {} }; },
      };
      return st;
    },
  };
}
const mkEnv = (state) => ({ TENGSL: fakeDb(state) });
const mkState = () => ({ sql: [] });
const post = (uppspretta) => new Request('https://karp.is/api/embed/talning?u=' + uppspretta, { method: 'POST' });

test('talning skrifar eina færslu á dag og uppsprettu', async () => {
  const s = mkState();
  const r = await embedTalningHandler(post('allt'), mkEnv(s));
  assert.equal(r.status, 200);
  assert.equal(s.sql.length, 1);
  assert.match(s.sql[0][0], /INSERT INTO embed_notkun/);
  assert.match(s.sql[0][0], /ON CONFLICT/);
  assert.equal(s.sql[0][1][1], 'allt');
});

test('⚠ ekkert persónugreinanlegt fer í SQL — engin heimilisföng, engar fyrirspurnir', async () => {
  const s = mkState();
  await embedTalningHandler(new Request('https://karp.is/api/embed/talning?u=allt&a=Heidarbraut%2012', { method: 'POST' }), mkEnv(s));
  const allt = JSON.stringify(s.sql);
  assert.equal(/Heidarbraut|Heiðarbraut/i.test(allt), false, 'heimilisfang má ALDREI rata í teljarann');
});

test('óþekkt uppspretta er hafnað — teljarinn er ekki opinn öllum', async () => {
  const s = mkState();
  const r = await embedTalningHandler(post('einhver-annar'), mkEnv(s));
  assert.equal(r.status, 400);
  assert.equal(s.sql.length, 0);
});

test('aðeins POST', async () => {
  const s = mkState();
  const r = await embedTalningHandler(new Request('https://karp.is/api/embed/talning?u=allt'), mkEnv(s));
  assert.equal(r.status, 405);
  assert.equal(s.sql.length, 0);
});

test('D1 niðri fellir ekki gluggann — talning er aukaatriði, matið er aðalatriði', async () => {
  const env = { TENGSL: { prepare() { throw new Error('D1 niðri'); } } };
  const r = await embedTalningHandler(post('allt'), env);
  assert.equal(r.status, 200);
});

test('uppsprettulistinn er lokaður listi', () => {
  assert.deepEqual(EMBED_LEN, ['allt']);
});

// ── Rammalásinn ─────────────────────────────────────────────────────────────
import { embedSidaHandler } from './embed.mjs';

const mkAssets = () => ({ fetch: async () => new Response('<html>gluggi</html>', { headers: { 'content-type': 'text/html', 'x-frame-options': 'SAMEORIGIN' } }) });

test('⚠⚠ X-Frame-Options er FJARLÆGT — annars opnast glugginn aldrei hjá Allt', async () => {
  const r = await embedSidaHandler(new Request('https://karp.is/embed/verdmat/'), { ASSETS: mkAssets() });
  assert.equal(r.headers.get('x-frame-options'), null);
});

test('frame-ancestors hleypir Allt inn og engum öðrum', async () => {
  const r = await embedSidaHandler(new Request('https://karp.is/embed/verdmat/'), { ASSETS: mkAssets() });
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors/);
  assert.match(csp, /https:\/\/allt\.is/);
  assert.match(csp, /https:\/\/www\.allt\.is/);
  assert.equal(/frame-ancestors[^;]*\*/.test(csp), false, 'aldrei stjörnumerki í frame-ancestors');
});

test('aðrar leiðir fara ÓSNERTAR áfram — undantekningin nær aðeins til /embed/', async () => {
  const r = await embedSidaHandler(new Request('https://karp.is/fasteignavakt/'), { ASSETS: mkAssets() });
  assert.equal(r, null);
});
