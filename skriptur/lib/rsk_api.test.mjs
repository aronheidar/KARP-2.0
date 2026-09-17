// rsk_api.test.mjs — flokkun RSK-API-svara fyrir nætur-skriðuna (crawl_tengsl.mjs).
//
// ⚠⚠ Gatið sem þessi skrá lokar (mælt 17.9.2026): `if (r.status === 404 || r.status === 403)
//    return { notfound: true }` felldi TVÖ óskyld tilvik saman. Þegar mánaðarkvóti RSK
//    tæmist svarar Azure 403 við HVERJU kalli — skriðan merkti þá hvert RAUNVERULEGT félag
//    sem „ekki til", taldi það afgreitt og heimsótti það aldrei aftur. Mengun sem enginn sér:
//    keyrslan er græn, talan `notfound` hækkar, og grunnurinn verður ÚRELDUR en ekki tómur.
//
// Reglan sjálf býr í web/src/lib/rsk-kvoti.mjs (sama regla og workerinn notar).
import { test } from 'node:test';
import assert from 'node:assert';
import { buildApiFetcher } from './rsk_api.mjs';

const KVOTABOLUR = '{"statusCode":403,"message":"Out of call volume quota. Quota will be replenished in 14.07:13:56."}';
const LOKAD_LOGFORM = '{"statusCode":403,"message":"Legal form Z3 is not accessible via the Public Api."}';
const KT = '4905220500';

/** fetch-hermir: skilar föstu svari og geymir slóð + hausa sem kallað var með. */
const herma = (status, body) => {
  const kollud = [];
  const f = async (url, init) => {
    kollud.push({ url, headers: (init && init.headers) || {} });
    if (status instanceof Error) throw status;
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { f, kollud };
};

const smid = (f, proxyBase) => buildApiFetcher({ proxyBase: proxyBase || '', rskKey: 'LYKILL', fetchImpl: f });

test('kvóta-403 er BANVÆNT — kastar með skýrri villu', async () => {
  const { f } = herma(403, KVOTABOLUR);
  await assert.rejects(() => smid(f).fetchApi(KT), (e) => {
    assert.match(e.message, /KV[ÓO]TI/i, 'villan verður að nefna kvóta svo orsökin sjáist í nætur-loggi');
    assert.match(e.message, /Out of call volume quota/, 'svarbolurinn á að fylgja með sem sönnun');
    return true;
  });
});

test('lokað lögform með 403 heldur áfram — sleppir félaginu eins og 404', async () => {
  const { f } = herma(403, LOKAD_LOGFORM);
  assert.deepEqual(await smid(f).fetchApi(KT), { notfound: true },
    'lokað lögform er EÐLILEGT svar og má ekki stöðva nóttina');
});

test('404 heldur áfram sem notfound', async () => {
  const { f } = herma(404, 'not found');
  assert.deepEqual(await smid(f).fetchApi(KT), { notfound: true });
});

test('401 er áfram banvænt', async () => {
  const { f } = herma(401, 'unauthorized');
  await assert.rejects(() => smid(f).fetchApi(KT), /AUTH 401/);
});

test('429 og 5xx eru tímabundin — reyna aftur', async () => {
  const a = herma(429, 'slow down');
  assert.deepEqual(await smid(a.f).fetchApi(KT), { retry: 429 });
  const b = herma(503, 'unavailable');
  assert.deepEqual(await smid(b.f).fetchApi(KT), { retry: 503 });
});

test('net-villa skilar retry, ekki notfound', async () => {
  const { f } = herma(new Error('ECONNRESET'));
  assert.deepEqual(await smid(f).fetchApi(KT), { retry: 'network' });
});

test('annað 4xx er villa (hvorki notfound né retry)', async () => {
  const { f } = herma(400, 'bad request');
  assert.deepEqual(await smid(f).fetchApi(KT), { error: 400 });
});

test('200 skilar þáttuðu JSON; ólesanlegt JSON skilar retry', async () => {
  const a = herma(200, '{"name":"Dæmi ehf."}');
  assert.deepEqual(await smid(a.f).fetchApi(KT), { json: { name: 'Dæmi ehf.' } });
  const b = herma(200, 'ekki json');
  assert.deepEqual(await smid(b.f).fetchApi(KT), { retry: 'badjson' });
});

test('án proxy fer beint á Azure með áskriftarlykli', async () => {
  const { f, kollud } = herma(200, '{"name":"x"}');
  await smid(f).fetchApi(KT);
  assert.match(kollud[0].url, /^https:\/\/api\.skattur\.cloud\/legalentities\/v2\.1\/4905220500/);
  assert.equal(kollud[0].headers['Ocp-Apim-Subscription-Key'], 'LYKILL');
});

test('með proxy fer um workerinn og lykillinn fer EKKI beint í Azure', async () => {
  const { f, kollud } = herma(200, '{"name":"x"}');
  await smid(f, 'https://karp.is').fetchApi(KT);
  assert.match(kollud[0].url, /^https:\/\/karp\.is\/api\/rskproxy\?api=4905220500$/);
  assert.equal(kollud[0].headers['X-Karp-Proxy'], 'LYKILL');
  assert.equal(kollud[0].headers['Ocp-Apim-Subscription-Key'], undefined);
});

test('kvóta-403 um proxy-leiðina er jafn banvænt', async () => {
  // Workerinn skilar stöðu OG bol Azure áfram óbreyttum (rskProxyHandler), svo reglan
  // verður að virka eins hvort sem farið er beint eða um proxy.
  const { f } = herma(403, KVOTABOLUR);
  await assert.rejects(() => smid(f, 'https://karp.is').fetchApi(KT), /KV[ÓO]TI/i);
});
