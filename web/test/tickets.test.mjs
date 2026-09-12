// tickets.test.mjs — verðirnir í þjónustuborðs-flæðinu (sjá src/worker/tickets.mjs).
// Prófar HREINU föllin: AI-JSON-þolið, leiðar-gátunina (módelinu er ekki treyst fyrir
// greiðslu-/aðgangsmálum) og HMAC-hlekkina sem stjórnandinn smellir á úr pósti.
import { test } from 'node:test';
import assert from 'node:assert';
import { TICKET_FLOKKAR_CTO, TICKET_STODUR, afgreidsluHlekkir, leidGuard, parseAiJson } from '../src/worker/tickets.mjs';
import { _hmac } from '../src/worker/felag.mjs';

test('parseAiJson: hreinn JSON', () => {
  assert.deepEqual(parseAiJson('{"svar":"hæ","leid":"cto"}'), { svar: 'hæ', leid: 'cto' });
});
test('parseAiJson: þolir ```json-girðingar og texta í kring', () => {
  const o = parseAiJson('Hér er svarið:\n```json\n{"leid":"madur","svar":"ok"}\n```\nKveðja');
  assert.equal(o.leid, 'madur');
});
test('parseAiJson: ónothæft → null', () => {
  assert.equal(parseAiJson('ekkert json hér'), null);
  assert.equal(parseAiJson('{brotið'), null);
  assert.equal(parseAiJson('[1,2,3]'), null);
  assert.equal(parseAiJson(''), null);
});

test('leidGuard: tæknilegir flokkar mega fara til CTO', () => {
  for (const f of TICKET_FLOKKAR_CTO) assert.equal(leidGuard(f, 'cto'), 'cto');
});
test('leidGuard: greiðslur og aðgangur fara ALLTAF til manneskju — þótt módelið segi cto', () => {
  assert.equal(leidGuard('Greiðslur & áskrift', 'cto'), 'madur');
  assert.equal(leidGuard('Innskráning & aðgangur', 'cto'), 'madur');
});
test('leidGuard: óþekkt gildi falla á manneskju', () => {
  assert.equal(leidGuard('Villa í gögnum', 'sprengja'), 'madur');
  assert.equal(leidGuard('Bogus-flokkur', 'cto'), 'madur');
  assert.equal(leidGuard(null, null), 'madur');
});

test('afgreidsluHlekkir: HMAC stemmir og er bundið við ticket+aðgerð', async () => {
  const env = { SESSION_SECRET: 'prófunar-leyndarmál' };
  const h = await afgreidsluHlekkir(env, 'https://karp.is', 'K-ABC123');
  const ja = new URL(h.ja), nei = new URL(h.nei);
  assert.equal(ja.pathname, '/api/ticket/afgreidsla');
  assert.equal(ja.searchParams.get('a'), 'patcha');
  assert.equal(nei.searchParams.get('a'), 'hafna');
  assert.equal(ja.searchParams.get('t'), await _hmac(env, 'ticket|K-ABC123|patcha'));
  // token annarrar aðgerðar/annars tickets gengur EKKI
  assert.notEqual(ja.searchParams.get('t'), nei.searchParams.get('t'));
  assert.notEqual(ja.searchParams.get('t'), await _hmac(env, 'ticket|K-XXX999|patcha'));
});

test('TICKET_STODUR: lífsferillinn er skjalfestur', () => {
  for (const s of ['nytt', 'cto', 'tillaga', 'samthykkt', 'lagad', 'villa']) assert.ok(TICKET_STODUR.includes(s), s);
});
