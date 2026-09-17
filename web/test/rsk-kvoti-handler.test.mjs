// rsk-kvoti-handler.test.mjs — rskHandler (worker/veitur.mjs) gagnvart RSK-kvótanum.
//
// Bakgrunnur (mælt 17.9.2026): /fyrirtaeki/<kt>/ er worker-SSR og felagaskra.json fór úr
// 6.527 félögum í 44.918 þann 14.9. Hver leitarvélarheimsókn kallaði því á mælda APIð og
// jákvæð svör lifðu aðeins 24 klst — mánaðarkvótinn brann upp á rúmum tveimur vikum og
// Azure svarar nú 403 „Out of call volume quota" við hverju kalli.
//
// Prófin hér festa fernt:
//   1) SAUMURINN: langi glugginn (7 dagar) þjónar AÐEINS fjölda-leiðinni og hún verður að
//      biðja um hann; sjálfgefið er stutti glugginn (24 klst) svo gjaldþrotamerki á SELDRI
//      skýrslu geti aldrei orðið margra daga gamalt,
//   2) neikvætt svar cache-ast ALDREI,
//   3) RSK_KEY2 er VARALEIÐ eftir sannaðan kvóta-403 — ekki hringekja,
//   4) þegar ekkert svar fæst er það MERKT (kvoti), ekki þögult „engin gögn".
import { test } from 'node:test';
import assert from 'node:assert';
import { rskHandler, rskKvotiSlod } from '../src/worker/veitur.mjs';

const NU = () => Math.floor(Date.now() / 1000);

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

async function kalla(env, kt, valk) {
  const bid = [];
  const ctx = { waitUntil: (p) => bid.push(p) };
  const res = await rskHandler({ url: 'https://karp.is/api/rsk?kt=' + (kt || KT) }, env, ctx, valk);
  await Promise.all(bid);
  return { res, json: await res.clone().json() };
}

const RSK_LYKILL = 'https://cache.karp.internal/api/rsk?kt=' + KT;

/** Sáir einni geymdri færslu með völdum aldri (sek.) svo aldurs-hliðið sé mælanlegt. */
function saGamalt(store, aldur, extra) {
  store.set(RSK_LYKILL, new Response(JSON.stringify({
    kt: KT, holdur: true, nafn: 'Gamalt ehf.', sott: NU() - aldur, ...(extra || {}),
  }), { headers: { 'content-type': 'application/json' } }));
}

test('sjálfgefið (greidda leiðin) fær STUTTA gluggann — ekki 7 daga', async () => {
  const store = nyrCache();
  nyrFetch({ L1: svar(200, FELAG) });
  const { res, json } = await kalla({ RSK_KEY: 'L1' });
  assert.equal(json.holdur, true);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=86400',
    'nýr neytandi á að fá fersk gögn sjálfkrafa — langi glugginn er OPT-IN, ekki sjálfgefinn');
  assert.ok(store.has(RSK_LYKILL), 'jákvætt svar á að liggja í jaðar-cache');
});

test('fjölda-leiðin biður um langa gluggann og fær 7 daga', async () => {
  const store = nyrCache();
  nyrFetch({ L1: svar(200, FELAG) });
  const { res, json } = await kalla({ RSK_KEY: 'L1' }, KT, { fjoldi: true });
  assert.equal(json.holdur, true);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=604800',
    '44.917 opinberar SSR-slóðir mega ekki brenna kalli á sólarhring');
  assert.equal(store.get(RSK_LYKILL).headers.get('cache-control'), 'public, max-age=604800',
    'GEYMSLAN verður að bera langa gluggann óháð því hver mældi — annars rennur færslan út '
    + 'á sólarhring fyrir fjöldann og upphaflega bilunin er komin aftur');
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

// ── SAUMURINN: langi glugginn má ALDREI ná greiddu leiðinni ───────────────────────────────
// Ein geymd færsla þjónar báðum leiðum (tvær færslur myndu tvöfalda mælda kallið), og
// `sott`-stimpillinn sker úr: fjölda-leiðin þolir 7 daga, greidda leiðin 24 klst.

test('þriggja daga gömul færsla er EKKI borin fram á greiddu leiðinni', async () => {
  const store = nyrCache();
  saGamalt(store, 3 * 86400);
  const kollud = nyrFetch({ L1: svar(200, FELAG) });
  const { json } = await kalla({ RSK_KEY: 'L1' });
  assert.deepEqual(kollud, ['L1'], 'úrelt færsla á að kalla fram nýja mælingu, ekki vera borin fram');
  assert.equal(json.nafn, 'Dæmi ehf.',
    'gjaldþrotamerki á seldri skýrslu má ekki vera margra daga gamalt');
  const geymt = await store.get(RSK_LYKILL).clone().json();
  assert.ok(geymt.sott >= NU() - 5, 'nýja mælingin á að leysa þá gömlu af í geymslunni');
});

test('þriggja daga gömul færsla ER borin fram á fjölda-leiðinni — ekkert kall', async () => {
  const store = nyrCache();
  saGamalt(store, 3 * 86400);
  const kollud = nyrFetch({ L1: svar(200, FELAG) });
  const { res, json } = await kalla({ RSK_KEY: 'L1' }, KT, { fjoldi: true });
  assert.deepEqual(kollud, [], 'fjölda-leiðin má ekki brenna kalli á þriggja daga gömul gögn');
  assert.equal(json.nafn, 'Gamalt ehf.');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=604800');
});

test('fersk færsla (1 klst) er borin fram á greiddu leiðinni án kalls', async () => {
  const store = nyrCache();
  saGamalt(store, 3600);
  const kollud = nyrFetch({ L1: svar(200, FELAG) });
  const { res, json } = await kalla({ RSK_KEY: 'L1' });
  assert.deepEqual(kollud, [], 'fersk gögn eiga ekki að kalla á APIð');
  assert.equal(json.nafn, 'Gamalt ehf.');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=86400');
});

test('færsla ÁN sott-stimpils telst úrelt á greiddu leiðinni', async () => {
  const store = nyrCache();
  store.set(RSK_LYKILL, new Response(JSON.stringify({ kt: KT, holdur: true, nafn: 'Ómerkt ehf.' })));
  const kollud = nyrFetch({ L1: svar(200, FELAG) });
  const { json } = await kalla({ RSK_KEY: 'L1' });
  assert.deepEqual(kollud, ['L1'], 'ómerktar færslur (frá því fyrir saumin) eru af óþekktum aldri → ferskt kall');
  assert.equal(json.nafn, 'Dæmi ehf.');
});

test('úrelt færsla + uppurinn kvóti → borin fram MERKT, ekki horfin', async () => {
  const store = nyrCache();
  saGamalt(store, 3 * 86400);
  nyrFetch({ L1: svar(403, KVOTABOLUR) });
  const { res, json } = await kalla({ RSK_KEY: 'L1' });
  assert.equal(json.holdur, true, 'úrelt en til staðar er skárra en ekkert — gjaldþrotamerkið má ekki hverfa');
  assert.equal(json.nafn, 'Gamalt ehf.');
  assert.equal(json.urelt, true, 'aldurinn verður að sjást');
  assert.equal(json.kvoti, true, 'ástæðan verður að sjást');
  assert.equal(res.headers.get('cache-control'), 'no-store',
    'úrelt svar má ekki festast aftur á jaðrinum');
  const geymt = await store.get(RSK_LYKILL).clone().json();
  assert.equal(geymt.urelt, undefined, 'geymda færslan á að standa ósnert');
});

// ── Kvótaminnið: mánuður í lyklinum, ekki TTL ─────────────────────────────────────────────

test('kvótalykill ber YYYY-MM svo endurheimt sé nákvæm við mánaðamót', () => {
  const des = rskKvotiSlod('RSK_KEY', Date.UTC(2026, 11, 31, 23, 59, 59));
  const jan = rskKvotiSlod('RSK_KEY', Date.UTC(2027, 0, 1, 0, 0, 1));
  assert.ok(des.includes('/2026-12/'), 'lykillinn á að bera mánuðinn: ' + des);
  assert.ok(jan.includes('/2027-01/'), 'lykillinn á að bera mánuðinn: ' + jan);
  assert.notEqual(des, jan,
    '6 klst TTL lét „uppurinn" lifa fram yfir áfyllingu — og per gagnaveri jöfnuðust þau á víxl');
  assert.equal(rskKvotiSlod('RSK_KEY', Date.UTC(2026, 11, 1)), rskKvotiSlod('RSK_KEY', Date.UTC(2026, 11, 20)),
    'innan sama mánaðar á minnið að haldast');
  assert.notEqual(rskKvotiSlod('RSK_KEY', 0), rskKvotiSlod('RSK_KEY2', 0), 'sinn lykill hvor');
});

test('kvótamerking er skrifuð á mánaðar-lykilinn', async () => {
  const store = nyrCache();
  nyrFetch({ L1: svar(403, KVOTABOLUR) });
  await kalla({ RSK_KEY: 'L1' });
  const manudur = new Date().toISOString().slice(0, 7);
  assert.ok([...store.keys()].some((k) => k === rskKvotiSlod('RSK_KEY', Date.now())),
    'merkið á að liggja á ' + manudur + '-lyklinum: ' + [...store.keys()].join(' · '));
});

// ── Lyklaskipti: RSK_KEY2 einn og sér er GILD uppsetning ──────────────────────────────────

test('aðeins RSK_KEY2 uppsettur → virkar (ekki „unconfigured")', async () => {
  nyrCache();
  const kollud = nyrFetch({ L2: svar(200, FELAG) });
  const { json } = await kalla({ RSK_KEY2: 'L2' });
  assert.equal(json.unconfigured, undefined,
    'gildran við lyklaskipti: gátunin spurði um RSK_KEY einan og felldi varalykilinn úr gildi');
  assert.equal(json.holdur, true);
  assert.deepEqual(kollud, ['L2']);
});

test('enginn lykill → unconfigured', async () => {
  nyrCache();
  const kollud = nyrFetch({});
  const { json } = await kalla({});
  assert.equal(json.unconfigured, true);
  assert.deepEqual(kollud, [], 'ekkert kall án lykils');
});
