// Proxy-vélin í web/worker.js: slóð sem er FALL (kvik) og skyndiminnislykill sem ber hana.
//
// Af hverju prófað hér en ekki aðeins í lib/lthing.mjs: villan sem þetta lagar var ekki í
// þáttuninni heldur í VÉLINNI — `PROXIES['/api/thingmal'].url` var fastur strengur og
// skyndiminnislykillinn var aðeins `url.pathname`. Hvort tveggja verður að haldast í hendur,
// annars bæri gamla þingið svarið áfram eftir þingskipti.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Workers-global sem Node hefur ekki. Sett ÁÐUR en worker.js er fluttur inn.
const cacheGeymsla = new Map();
globalThis.caches = {
  default: {
    async match(req) { const v = cacheGeymsla.get(req.url); return v == null ? undefined : new Response(v.body, { headers: v.headers }); },
    async put(req, res) { cacheGeymsla.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
  },
};

const worker = (await import('../../worker.js')).default;

const XML_THING = `<löggjafarþing><þing númer='158'><tímabil>2026-2027</tímabil></þing></löggjafarþing>`;
const XML_MAL = `<?xml version="1.0"?><þingmálalisti lþing="158"><mál málsnúmer="1"/></þingmálalisti>`;

const keyra = async ({ svor, bid = [] }) => {
  cacheGeymsla.clear();
  const sott = [];
  globalThis.fetch = async (u) => {
    sott.push(String(u));
    const s = svor(String(u));
    if (s instanceof Error) throw s;
    return { ok: s.ok !== false, status: s.status || 200, text: async () => s.body, headers: new Headers() };
  };
  const ctx = { waitUntil: (p) => bid.push(p) };
  const res = await worker.fetch(new Request('https://karp.is/api/thingmal'), {}, ctx);
  await Promise.all(bid);
  return { res, sott, texti: await res.text() };
};

test('/api/thingmal: spyr um yfirstandandi þing og sækir MÁLALISTA ÞESS þings', async () => {
  const { res, sott, texti } = await keyra({
    svor: (u) => (u.includes('loggjafarthing') ? { body: XML_THING } : { body: XML_MAL }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/xml; charset=utf-8');
  assert.equal(texti, XML_MAL);
  assert.ok(sott.some((u) => u.includes('thingmalalisti/?lthing=158')), 'sótti 158: ' + sott.join(' | '));
  assert.ok(!sott.some((u) => u.includes('lthing=157')), '⚠ harðkóðaða 157 má hvergi sjást');
});

test('/api/thingmal: þingið fer í skyndiminnislykilinn svo þingskipti skolist ekki burt', async () => {
  const { sott } = await keyra({ svor: (u) => (u.includes('loggjafarthing') ? { body: XML_THING } : { body: XML_MAL }) });
  assert.ok(sott.length >= 2);
  const lyklar = [...cacheGeymsla.keys()];
  assert.ok(lyklar.some((k) => k.includes('/api/thingmal') && k.includes('158')),
    'lykill á að bera þingið, fannst: ' + lyklar.join(' | '));
});

test('/api/thingmal: annað kall les úr skyndiminni — engin ný sókn á málalistann', async () => {
  const bid = [];
  await keyra({ svor: (u) => (u.includes('loggjafarthing') ? { body: XML_THING } : { body: XML_MAL }), bid });
  const sott2 = [];
  globalThis.fetch = async (u) => { sott2.push(String(u)); return { ok: true, status: 200, text: async () => XML_MAL, headers: new Headers() }; };
  const res2 = await worker.fetch(new Request('https://karp.is/api/thingmal'), {}, { waitUntil: () => {} });
  assert.equal(await res2.text(), XML_MAL);
  assert.equal(sott2.filter((u) => u.includes('thingmalalisti')).length, 0, 'málalistinn kom úr minni');
});

// ⚠ Ein 429-lota má ekki fella strauminn: síðasta þekkta þing er geymt í 30 daga.
test('/api/thingmal: þingveitan bilar en síðasta þekkta þing er í minni → straumurinn lifir', async () => {
  await keyra({ svor: (u) => (u.includes('loggjafarthing') ? { body: XML_THING } : { body: XML_MAL }) });
  for (const k of [...cacheGeymsla.keys()]) if (!k.includes('sidast')) cacheGeymsla.delete(k);   // stutta minnið rann út
  const sott = [];
  globalThis.fetch = async (u) => {
    sott.push(String(u));
    if (String(u).includes('loggjafarthing')) throw new Error('429');
    return { ok: true, status: 200, text: async () => XML_MAL, headers: new Headers() };
  };
  const res = await worker.fetch(new Request('https://karp.is/api/thingmal'), {}, { waitUntil: () => {} });
  assert.equal(await res.text(), XML_MAL);
  assert.ok(sott.some((u) => u.includes('lthing=158')), 'notaði síðasta þekkta þing: ' + sott.join(' | '));
});

test('/api/thingmal: allt bilað og ekkert þekkt þing → snyrtileg villa, ekki hrun', async () => {
  const { res, texti } = await keyra({ svor: () => new Error('net niðri') });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(texti), { error: 'upstream' });
});

// Fastar proxy-leiðir mega ekki hafa breyst — vélin er sameiginleg með tugum leiða.
test('fastar proxy-leiðir haga sér óbreytt (strengsslóð, lykill án viðskeytis)', async () => {
  cacheGeymsla.clear();
  const sott = [];
  globalThis.fetch = async (u) => { sott.push(String(u)); return { ok: true, status: 200, text: async () => '{"ok":1}', headers: new Headers() }; };
  const bid = [];
  const res = await worker.fetch(new Request('https://karp.is/api/samrad'), {}, { waitUntil: (p) => bid.push(p) });
  assert.equal(await res.text(), '{"ok":1}');
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  await Promise.all(bid);   // skyndiminnisskrif eru frestuð fram yfir svarið
  assert.deepEqual([...cacheGeymsla.keys()], ['https://cache.karp.internal/api/samrad'], 'ekkert viðskeyti á fasta lykilinn');
});
