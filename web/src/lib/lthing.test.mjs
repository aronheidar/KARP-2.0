import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lesaThingNumer, thingmalSlod, nuverandiThing, LTHING_TTL, LTHING_SEIGLA_TTL } from './lthing.mjs';

const XML_EITT = `<?xml version="1.0" encoding="utf-8"?><löggjafarþing><þing númer='158'><tímabil>2026-2027</tímabil></þing></löggjafarþing>`;
const XML_LISTI = `<löggjafarþing><þing númer='156'/><þing númer='158'/><þing númer='157'/></löggjafarþing>`;

// ── lesaThingNumer ────────────────────────────────────────────────────────
test('lesaThingNumer: les númerið úr svari /yfirstandandi/', () => {
  assert.equal(lesaThingNumer(XML_EITT), 158);
});

test('lesaThingNumer: úr heildarlista er HÆSTA þingið yfirstandandi', () => {
  assert.equal(lesaThingNumer(XML_LISTI), 158);
});

test('lesaThingNumer: rusl, tómt og villusíða gefa null — ekki 0 og ekki ágiskun', () => {
  for (const x of ['', null, undefined, '<html>Villa</html>', '<þing númer=\'\'/>']) {
    assert.equal(lesaThingNumer(x), null, JSON.stringify(String(x).slice(0, 20)));
  }
});

// ── thingmalSlod ──────────────────────────────────────────────────────────
test('thingmalSlod: byggir málalista-slóðina á gefnu þingi', () => {
  assert.equal(thingmalSlod(158), 'https://www.althingi.is/altext/xml/thingmalalisti/?lthing=158');
});

// ── nuverandiThing: skyndiminni + seigla ──────────────────────────────────
const falsadCache = (byrjun = {}) => {
  const geymsla = new Map(Object.entries(byrjun));
  return {
    geymsla,
    async match(req) { const v = geymsla.get(req.url); return v == null ? undefined : new Response(v); },
    async put(req, res) { geymsla.set(req.url, await res.text()); },
  };
};
const svar = (body, ok = true) => ({ ok, status: ok ? 200 : 429, text: async () => body });
// waitUntil frestar skrifum fram yfir svarið (rétt hegðun í Workers) — prófið verður að bíða
// eftir þeim, annars mælir það kappakstur við sjálft sig en ekki eininguna.
const nyrCtx = () => { const bid = []; return { waitUntil: (p) => bid.push(p), bida: () => Promise.all(bid) }; };
const ctx = nyrCtx();

test('nuverandiThing: skyndiminni fullt → ekkert kall á Alþingi', async () => {
  let koll = 0;
  const cache = falsadCache({ 'https://cache.karp.internal/_lthing': '158' });
  const t = await nuverandiThing({ cache, ctx, fetchImpl: async () => { koll++; return svar(XML_EITT); } });
  assert.equal(t, 158);
  assert.equal(koll, 0);
});

test('nuverandiThing: tómt skyndiminni → sækir, þáttar og geymir BÆÐI stutt og langt', async () => {
  const cache = falsadCache();
  const c = nyrCtx();
  const t = await nuverandiThing({ cache, ctx: c, fetchImpl: async () => svar(XML_EITT) });
  await c.bida();
  assert.equal(t, 158);
  assert.equal(cache.geymsla.get('https://cache.karp.internal/_lthing'), '158');
  assert.equal(cache.geymsla.get('https://cache.karp.internal/_lthing-sidast'), '158',
    'langa færslan er seiglan sem grípur næstu bilun');
});

// ⚠ Ein 429-lota frá althingi.is má ekki fella strauminn. Síðasta þekkta þing er réttara
//   en ekkert — og margfalt réttara en harðkóðað 157 sem fraus hér í heilt þing.
test('nuverandiThing: veitan bilar en síðasta þekkta þing er til → það er notað', async () => {
  for (const bilun of [async () => { throw new Error('net'); }, async () => svar('', false), async () => svar('<html/>')]) {
    const cache = falsadCache({ 'https://cache.karp.internal/_lthing-sidast': '158' });
    assert.equal(await nuverandiThing({ cache, ctx, fetchImpl: bilun }), 158);
  }
});

test('nuverandiThing: veitan bilar og ekkert þekkt þing → hendir (engin 157-ágiskun)', async () => {
  const cache = falsadCache();
  await assert.rejects(() => nuverandiThing({ cache, ctx, fetchImpl: async () => svar('', false) }), /lthing/);
});

test('nuverandiThing: skammtímaminnið lifir skemur en seiglan', () => {
  assert.ok(LTHING_TTL < LTHING_SEIGLA_TTL);
  assert.ok(LTHING_TTL >= 3600, 'þing skiptir um einu sinni á ári — ekki spyrja á tíu mínútna fresti');
});
