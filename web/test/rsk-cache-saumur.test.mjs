// rsk-cache-saumur.test.mjs — saumurinn milli FJÖLDA-leiðarinnar og GREIDDU leiðarinnar.
//
// ⚠⚠ Hvers vegna þetta próf er til:
//
// /fyrirtaeki/<kt>/ er worker-SSR yfir 44.917 slóðir og þarf LANGAN cache svo mánaðarkvóti
// RSK brenni ekki upp. En NÁKVÆMLEGA sama fall (fyrirtaekiHandler → rskHandler) ber líka
// gögnin í seldu 990-skýrsluna: gjaldþrota-borðann og E-þak lánshæfismatsins. Væri einn
// sameiginlegur cache-lykill færi versta ferskleikagat gjaldþrotamerkis á SELDRI skýrslu
// úr ~2 sólarhringum í ~8 daga.
//
// Saumurinn liggur í TVEIMUR lögum og bæði verða að halda:
//   · /api/fyrirtaeki — SITTHVOR jaðar-lykillinn, svo fjölda-byggð færsla (með allt að
//     7 daga gömlum RSK-gögnum innan í) lendi aldrei þar sem greidda leiðin les.
//   · /api/rsk        — EIN færsla (tvær myndu tvöfalda mælda kallið) með `sott`-stimpli
//     og aldurs-hliði: 7 dagar fyrir fjöldann, 24 klst fyrir alla aðra. Prófað í
//     rsk-kvoti-handler.test.mjs.
//
// Flaggið er FALL-VIÐFANG, ekki slóðarbreyta: /api/fyrirtaeki er opinn endapunktur og
// `?fjoldi=1` úr vafra myndi opna gatið aftur utan frá.
import { test } from 'node:test';
import assert from 'node:assert';
import { fyrirtaekiHandler, fyrirtaekiSidaHandler } from '../worker.js';

const KT = '4905220500';
const HTML = '<div class="company box"><h1>Dæmi ehf. (' + KT + ')</h1></div>';
const FELAG_JSON = '{"name":"Dæmi ehf.","status":"Virk skráning"}';

const STUTTUR = 'https://cache.karp.internal/api/fyrirtaeki?q=' + KT;
const FJOLDI = STUTTUR + '&fjoldi=1';

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

function nyrFetch() {
  const maeld = [];   // köll á MÆLDA APIð — hvert þeirra kostar úr mánaðarkvótanum
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.skattur.cloud')) { maeld.push(String(url)); return new Response(FELAG_JSON, { status: 200 }); }
    return new Response(HTML, { status: 200 });   // www.skatturinn.is — gjaldfrjálsa skrapið
  };
  return maeld;
}

function nyrCtx() {
  const bid = [];
  return { ctx: { waitUntil: (p) => bid.push(p) }, bid };
}

const ENV = { RSK_KEY: 'L1' };

test('greidda leiðin les EKKI færslu sem fjölda-leiðin skrifaði', async () => {
  const store = nyrCache();
  nyrFetch();
  store.set(FJOLDI, new Response(JSON.stringify({ q: KT, merki: 'fjoldi' })));
  const { ctx, bid } = nyrCtx();
  const res = await fyrirtaekiHandler(new Request('https://karp.is/api/fyrirtaeki?q=' + KT), ENV, ctx);
  await Promise.all(bid);
  const json = await res.json();
  assert.equal(json.merki, undefined,
    'fjölda-færslan getur borið allt að 7 daga gömul RSK-gögn — hún má ALDREI berast í selda skýrslu');
  assert.equal(json.felag && json.felag.nafn, 'Dæmi ehf.');
});

test('fjölda-leiðin skrifar á SINN lykil og snertir ekki þann stutta', async () => {
  const store = nyrCache();
  nyrFetch();
  const { ctx, bid } = nyrCtx();
  await fyrirtaekiHandler(new Request('https://karp.is/api/fyrirtaeki?q=' + KT), ENV, ctx, { fjoldi: true });
  await Promise.all(bid);
  assert.ok(store.has(FJOLDI), 'fjölda-leiðin á sinn eigin lykil');
  assert.equal(store.has(STUTTUR), false,
    'skrifaði hún á sameiginlega lykilinn væri saumurinn enginn');
});

test('fjölda-flaggið BERST niður í RSK-lagið — þriggja daga gömul mæling dugar', async () => {
  const store = nyrCache();
  store.set('https://cache.karp.internal/api/rsk?kt=' + KT, new Response(JSON.stringify({
    kt: KT, holdur: true, nafn: 'Dæmi ehf.', sott: Math.floor(Date.now() / 1000) - 3 * 86400,
  })));
  const maeld = nyrFetch();
  const { ctx, bid } = nyrCtx();
  await fyrirtaekiHandler(new Request('https://karp.is/api/fyrirtaeki?q=' + KT), ENV, ctx, { fjoldi: true });
  await Promise.all(bid);
  assert.deepEqual(maeld, [],
    'berist flaggið ekki niður fellur fjölda-leiðin aftur í sólarhrings-glugga — bilunin sem brenndi kvótann');
});

test('greidda leiðin fær EKKI þriggja daga gömlu mælinguna', async () => {
  const store = nyrCache();
  store.set('https://cache.karp.internal/api/rsk?kt=' + KT, new Response(JSON.stringify({
    kt: KT, holdur: true, nafn: 'Gamalt ehf.', sott: Math.floor(Date.now() / 1000) - 3 * 86400,
  })));
  const maeld = nyrFetch();
  const { ctx, bid } = nyrCtx();
  const res = await fyrirtaekiHandler(new Request('https://karp.is/api/fyrirtaeki?q=' + KT), ENV, ctx);
  await Promise.all(bid);
  const json = await res.json();
  assert.equal(maeld.length, 1, 'selda skýrslan á að kalla fram ferska mælingu');
  assert.equal(json.felag.rsk.nafn, 'Dæmi ehf.',
    'gjaldþrota-borðinn og E-þak lánshæfismatsins lesa ÞENNAN hlut');
});

test('greidda leiðin skrifar á stutta lykilinn', async () => {
  const store = nyrCache();
  nyrFetch();
  const { ctx, bid } = nyrCtx();
  await fyrirtaekiHandler(new Request('https://karp.is/api/fyrirtaeki?q=' + KT), ENV, ctx);
  await Promise.all(bid);
  assert.ok(store.has(STUTTUR));
  assert.equal(store.has(FJOLDI), false);
});

test('?fjoldi=1 UTAN FRÁ opnar ekki langa gluggann', async () => {
  const store = nyrCache();
  nyrFetch();
  const { ctx, bid } = nyrCtx();
  await fyrirtaekiHandler(new Request('https://karp.is/api/fyrirtaeki?q=' + KT + '&fjoldi=1'), ENV, ctx);
  await Promise.all(bid);
  assert.equal(store.has(FJOLDI), false,
    'flaggið er fall-viðfang; slóðarbreyta myndi láta hvern sem er velja stöðnuð gögn í seldri skýrslu');
});

test('SSR-síðan (44.917 slóðir) biður um fjölda-leiðina', async () => {
  const store = nyrCache();
  nyrFetch();
  const { ctx, bid } = nyrCtx();
  const env = {
    ...ENV,
    ASSETS: { fetch: async () => new Response('<html><title>%%KARP_TITLE%%</title>%%KARP_MAIN%%</html>') },
  };
  await fyrirtaekiSidaHandler(new Request('https://karp.is/fyrirtaeki/' + KT + '/'), env, ctx);
  await Promise.all(bid);
  assert.ok(store.has(FJOLDI),
    'bæði lögin verða að opta inn — annars borgar SSR-ið fyrir 44.917 slóðir á sólarhring');
  assert.equal(store.has(STUTTUR), false);
});
