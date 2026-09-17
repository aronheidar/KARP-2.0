// rsk-fetchraw-tengsl.test.mjs — rskFetchRaw + TTL-reglan sem tengslanetHandler notar.
//
// Þrennt sem lá óvarið eftir kvóta-lotuna 17.9.2026:
//
//   1) TÍU-MÍNÚTNA REGLAN á neikvæðum svörum var varin af ATHUGASEMD einni. Þegar jákvæði
//      tíminn var lengdur í 7 daga hefði sama breyting á neikvæða tímanum runnið í gegn
//      grænt — og þá hefði tímabundin 404 fest sig á jaðrinum í viku.
//   2) rskFetchRaw HENTI kvóta-merkinu (skilaði null) svo /api/tengslanet svaraði áfram
//      `holdur:false` án ástæðu.
//   3) Verra: næðist rót-kt úr cache en hin félögin féllu á kvóta varð svarið `holdur:true`
//      með FÆRRI félögum — og hálft net cache-aðist í 12 klst sem fullbyggt.
import { test } from 'node:test';
import assert from 'node:assert';
import { rskFetchRaw, tengslNetTtl } from '../src/worker/veitur.mjs';

const KVOTABOLUR = '{"statusCode":403,"message":"Out of call volume quota. Quota will be replenished in 14.07:13:56."}';
const FELAG = '{"name":"Dæmi ehf.","status":"Virk skráning"}';
const KT = '4905220500';
const RAW_LYKILL = 'https://cache.karp.internal/rsk-raw?kt=' + KT;

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

function nyrFetch(status, body) {
  const kollud = [];
  globalThis.fetch = async (url, init) => {
    kollud.push(((init && init.headers) || {})['Ocp-Apim-Subscription-Key']);
    return new Response(body, { status });
  };
  return kollud;
}

async function saekja(env) {
  const bid = [];
  const ctx = { waitUntil: (p) => bid.push(p) };
  const out = await rskFetchRaw(KT, env || { RSK_KEY: 'L1' }, ctx);
  await Promise.all(bid);
  return out;
}

test('neikvætt svar lifir í 10 MÍNÚTUR — ekki 7 daga', async () => {
  const store = nyrCache();
  nyrFetch(404, 'not found');
  const out = await saekja();
  assert.equal(out.holdur, false);
  const geymt = store.get(RAW_LYKILL);
  assert.ok(geymt, 'neikvætt svar er geymt stutt svo endurtekin köll hamri ekki mælda APIð');
  assert.equal(geymt.headers.get('cache-control'), 'public, max-age=600',
    'tímabundin 404 má ALDREI festast á jaðrinum — krafan er bindandi og var áður aðeins athugasemd');
});

test('jákvætt svar fær SJÁLFGEFNA gluggann (24 klst) — tengslanetið biður ekki um langa', async () => {
  const store = nyrCache();
  nyrFetch(200, FELAG);
  const out = await saekja();
  assert.equal(out.holdur, true);
  assert.equal(store.get(RAW_LYKILL).headers.get('cache-control'), 'public, max-age=86400',
    'langi glugginn er opt-in fjölda-leiðarinnar; nýr neytandi á að fá fersk gögn sjálfkrafa');
});

test('uppurinn kvóti er BORINN ÁFRAM og ALDREI geymdur', async () => {
  const store = nyrCache();
  nyrFetch(403, KVOTABOLUR);
  const out = await saekja();
  assert.equal(out.holdur, false);
  assert.equal(out.kvoti, true,
    'án merkis svarar /api/tengslanet áfram holdur:false án ástæðu');
  assert.equal(store.has(RAW_LYKILL), false,
    'kvóta-svar myndi festa „engin gögn" á félag í fullu fjöri');
});

test('geymt jákvætt svar er borið fram án kalls', async () => {
  const store = nyrCache();
  store.set(RAW_LYKILL, new Response(JSON.stringify({ kt: KT, holdur: true, nafn: 'Geymt ehf.' })));
  const kollud = nyrFetch(200, FELAG);
  const out = await saekja();
  assert.deepEqual(kollud, []);
  assert.equal(out.nafn, 'Geymt ehf.');
});

// ── TTL-reglan: hálft net má ALDREI geymast sem heilt ─────────────────────────────────────

test('fullbyggt net → 12 klst', () => {
  assert.equal(tengslNetTtl({ holdur: true, n_felog: 5 }, false), 43200);
});

test('óbyggt tré (n_felog=1) → stutt svo fullbyggt taki fljótt við', () => {
  assert.equal(tengslNetTtl({ holdur: true, n_felog: 1 }, false), 900);
});

test('holdur:false → ekkert geymt', () => {
  assert.equal(tengslNetTtl({ holdur: false }, false), 0);
});

test('⚠ net sem VANTAR í vegna kvóta geymist ALDREI — líka þegar rótin náðist', () => {
  assert.equal(tengslNetTtl({ holdur: true, n_felog: 5 }, true), 0,
    'rót úr cache + hin félögin á kvóta = hálft net sem lítur út eins og heilt í 12 klst');
  assert.equal(tengslNetTtl({ holdur: true, n_felog: 1 }, true), 0);
});
