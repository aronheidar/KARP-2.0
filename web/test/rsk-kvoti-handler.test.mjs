// rsk-kvoti-handler.test.mjs — rskHandler (worker/veitur.mjs) gagnvart RSK-kvótanum.
//
// Bakgrunnur (mælt 17.9.2026): /fyrirtaeki/<kt>/ er worker-SSR og felagaskra.json fór úr
// 6.527 félögum í 44.918 þann 14.9. Hver leitarvélarheimsókn kallaði því á mælda APIð og
// jákvæð svör lifðu aðeins 24 klst — mánaðarkvótinn brann upp á rúmum tveimur vikum og
// Azure svarar nú 403 „Out of call volume quota" við hverju kalli.
//
// Prófin hér festa þrennt:
//   1) jákvætt svar cache-ast í 7 daga, neikvætt ALDREI,
//   2) RSK_KEY2 er VARALEIÐ eftir sannaðan kvóta-403 — ekki hringekja,
//   3) þegar ekkert svar fæst er það MERKT (kvoti), ekki þögult „engin gögn".
import { test } from 'node:test';
import assert from 'node:assert';
import { rskHandler } from '../src/worker/veitur.mjs';

const KVOTABOLUR = '{"statusCode":403,"message":"Out of call volume quota. Quota will be replenished in 14.07:13:56."}';
const LOKAD_LOGFORM = '{"statusCode":403,"message":"Legal form Z3 is not accessible via the Public Api."}';
const FELAG = '{"name":"Dæmi ehf.","status":"Virk skráning"}';
const KT = '4905220500';
const KT2 = '5005050500';

/** Jaðar-cache í minni. Hver prófun fær sitt eintak svo kvóta-minnið leki ekki milli prófa. */
function nyrCache() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(req) { const e = store.get(req.url); return e ? e.clone() : undefined; },
      async put(req, res) { store.set(req.url, res.clone()); },
    },
  };
  return store;
}

/** fetch-hermir: svar valið eftir ÁSKRIFTARLYKLINUM svo sjáist hvor lykillinn var notaður. */
function nyrFetch(svor) {
  const kollud = [];
  globalThis.fetch = async (url, init) => {
    const lykill = ((init && init.headers) || {})['Ocp-Apim-Subscription-Key'];
    kollud.push(lykill);
    const s = svor[lykill] || { status: 500, body: 'ekkert svar skilgreint' };
    return new Response(s.body, { status: s.status });
  };
  return kollud;
}

const svar = (status, body) => ({ status, body });

async function kalla(env, kt) {
  const bid = [];
  const ctx = { waitUntil: (p) => bid.push(p) };
  const res = await rskHandler({ url: 'https://karp.is/api/rsk?kt=' + (kt || KT) }, env, ctx);
  await Promise.all(bid);
  return { res, json: await res.clone().json() };
}

test('jákvætt svar cache-ast í 7 daga (ekki 24 klst)', async () => {
  const store = nyrCache();
  nyrFetch({ L1: svar(200, FELAG) });
  const { res, json } = await kalla({ RSK_KEY: 'L1' });
  assert.equal(json.holdur, true);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=604800',
    '24 klst × 44.917 SSR-síður brenndi mánaðarkvótanum — 7 dagar er fastinn');
  assert.ok(store.has('https://cache.karp.internal/api/rsk?kt=' + KT), 'jákvætt svar á að liggja í jaðar-cache');
});

test('neikvætt svar cache-ast ALDREI', async () => {
  const store = nyrCache();
  nyrFetch({ L1: svar(404, 'not found') });
  const { res, json } = await kalla({ RSK_KEY: 'L1' });
  assert.equal(json.holdur, false);
  assert.equal(json.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(store.has('https://cache.karp.internal/api/rsk?kt=' + KT), false,
    'tímabundin 404 má ALDREI festast á jaðrinum');
});

test('lokað lögform (403) er óbreytt — engin kvóta-merking, enginn varalykill', async () => {
  nyrCache();
  const kollud = nyrFetch({ L1: svar(403, LOKAD_LOGFORM), L2: svar(200, FELAG) });
  const { json } = await kalla({ RSK_KEY: 'L1', RSK_KEY2: 'L2' });
  assert.deepEqual(json, { kt: KT, holdur: false, status: 403 },
    'lokað lögform er EÐLILEGT svar — það mældist, og á ekki að bera kvóta-merki');
  assert.deepEqual(kollud, ['L1'], 'varalykill má ekki grípa eðlilegt 403');
});

test('RSK_KEY2 er notaður eftir kvóta-403 á RSK_KEY', async () => {
  nyrCache();
  const kollud = nyrFetch({ L1: svar(403, KVOTABOLUR), L2: svar(200, FELAG) });
  const { json } = await kalla({ RSK_KEY: 'L1', RSK_KEY2: 'L2' });
  assert.equal(json.holdur, true, 'varalykillinn á að bjarga svarinu');
  assert.equal(json.kvoti, undefined, 'svar sem fékkst er ekki kvóta-merkt');
  assert.deepEqual(kollud, ['L1', 'L2'], 'RSK_KEY alltaf fyrst, RSK_KEY2 aðeins á eftir');
});

test('RSK_KEY2 sem vantar breytir engu', async () => {
  nyrCache();
  const kollud = nyrFetch({ L1: svar(200, FELAG) });
  const { json } = await kalla({ RSK_KEY: 'L1' });
  assert.equal(json.holdur, true);
  assert.deepEqual(kollud, ['L1']);
});

test('kvóta-403 án varalykils skilar MERKTU svari, ekki þögulu', async () => {
  const store = nyrCache();
  const kollud = nyrFetch({ L1: svar(403, KVOTABOLUR) });
  const { res, json } = await kalla({ RSK_KEY: 'L1' });
  assert.deepEqual(kollud, ['L1']);
  assert.equal(json.holdur, false);
  assert.equal(json.status, 403);
  assert.equal(json.kvoti, true,
    'án merkis les neytandinn þetta sem „engin gögn" og afskraning/gjaldþrot hverfur úr 990-matinu');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(store.has('https://cache.karp.internal/api/rsk?kt=' + KT), false);
});

test('báðir lyklar uppurnir → svarið er MERKT', async () => {
  nyrCache();
  const kollud = nyrFetch({ L1: svar(403, KVOTABOLUR), L2: svar(403, KVOTABOLUR) });
  const { json } = await kalla({ RSK_KEY: 'L1', RSK_KEY2: 'L2' });
  assert.deepEqual(kollud, ['L1', 'L2']);
  assert.equal(json.holdur, false);
  assert.equal(json.kvoti, true);
});

test('uppurinn kvóti man sig — næsta kt brennir ekki öðru kalli á sama lykil', async () => {
  nyrCache();
  const kollud = nyrFetch({ L1: svar(403, KVOTABOLUR), L2: svar(200, FELAG) });
  await kalla({ RSK_KEY: 'L1', RSK_KEY2: 'L2' }, KT);
  assert.deepEqual(kollud, ['L1', 'L2']);
  const { json } = await kalla({ RSK_KEY: 'L1', RSK_KEY2: 'L2' }, KT2);
  assert.equal(json.holdur, true);
  assert.deepEqual(kollud, ['L1', 'L2', 'L2'],
    'hvert isolate á að lesa kvótastöðuna úr cache, ekki enduruppgötva hana með köllum');
});
