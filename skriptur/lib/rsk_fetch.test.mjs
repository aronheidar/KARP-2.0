import { test } from 'node:test';
import assert from 'node:assert';
import { buildScrapeFetcher } from './rsk_fetch.mjs';

const svar = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const PFX = '/fyrirtaekjaskra/leit?nafn=a';
const MEÐ_KT = '<a href="/fyrirtaekjaskra/leit/kennitala/4905220500">Dæmi ehf.</a>';
const TÓMT = '<html><body>Engar niðurstöður</body></html>';
const gilt = (h) => /kennitala\/\d{10}/.test(h);

/** fetch-hermir: skilar svari eftir því hvort slóðin fer um proxy eða beint. */
const herma = (svor) => {
  const kallad = [];
  const f = async (url) => {
    const leid = url.includes('/api/rskproxy') ? 'proxy' : 'beint';
    kallad.push(leid);
    const s = svor[leid];
    if (s instanceof Error) throw s;
    return s;
  };
  return { f, kallad };
};

test('án PROXY_BASE fer beint og skilar texta', async () => {
  const { f, kallad } = herma({ beint: svar(200, MEÐ_KT) });
  const s = buildScrapeFetcher({ proxyBase: '', rskKey: 'x', fetchImpl: f });
  assert.equal(await s.fetchText(PFX, gilt), MEÐ_KT);
  assert.deepEqual(kallad, ['beint']);
});

test('proxy sem skilar nothæfu svari → engin bein sókn', async () => {
  const { f, kallad } = herma({ proxy: svar(200, MEÐ_KT) });
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f });
  assert.equal(await s.fetchText(PFX, gilt), MEÐ_KT);
  assert.deepEqual(kallad, ['proxy'], 'mátti ekki sækja beint þegar proxy dugði');
});

test('proxy 403 → fellur beint og skilar þeim texta', async () => {
  const { f, kallad } = herma({ proxy: svar(403, 'forbidden'), beint: svar(200, MEÐ_KT) });
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f });
  assert.equal(await s.fetchText(PFX, gilt), MEÐ_KT);
  assert.deepEqual(kallad, ['proxy', 'beint']);
  assert.equal(s.stats().villur['proxy:http-403'], 1);
});

// Þetta er nákvæmlega bilunin sem felldi crawlið 12 nætur: HTTP 200 en engin kennitala.
test('proxy 200 en TÓMT (throttla) → fellur beint', async () => {
  const { f, kallad } = herma({ proxy: svar(200, TÓMT), beint: svar(200, MEÐ_KT) });
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f });
  assert.equal(await s.fetchText(PFX, gilt), MEÐ_KT);
  assert.deepEqual(kallad, ['proxy', 'beint']);
  assert.equal(s.stats().villur['proxy:200-ognothaeft'], 1);
});

test('net-villa á proxy → fellur beint', async () => {
  const { f, kallad } = herma({ proxy: new Error('fetch failed'), beint: svar(200, MEÐ_KT) });
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f });
  assert.equal(await s.fetchText(PFX, gilt), MEÐ_KT);
  assert.deepEqual(kallad, ['proxy', 'beint']);
  assert.equal(s.stats().villur['proxy:net'], 1);
});

test('báðar leiðir bregðast → null, báðar taldar', async () => {
  const { f } = herma({ proxy: svar(200, TÓMT), beint: svar(200, TÓMT) });
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f });
  assert.equal(await s.fetchText(PFX, gilt), null);
  const v = s.stats().villur;
  assert.equal(v['proxy:200-ognothaeft'], 1);
  assert.equal(v['beint:200-ognothaeft'], 1);
});

// Bilaður proxy má ekki tvöfalda álagið á RSK alla nóttina.
test('eftir 3 samfelldar proxy-bilanir er hætt að reyna proxy', async () => {
  const { f, kallad } = herma({ proxy: svar(403, 'forbidden'), beint: svar(200, MEÐ_KT) });
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f, proxyMaxFail: 3 });
  for (let i = 0; i < 5; i++) await s.fetchText(PFX, gilt);
  assert.equal(kallad.filter((x) => x === 'proxy').length, 3, 'proxy átti að slökkva á sér eftir 3 bilanir');
  assert.equal(kallad.filter((x) => x === 'beint').length, 5);
  assert.equal(s.stats().proxyDautt, true);
});

test('velheppnað proxy-svar núllstillir bilanateljarann', async () => {
  let n = 0;
  const kallad = [];
  const f = async (url) => {
    const leid = url.includes('/api/rskproxy') ? 'proxy' : 'beint';
    kallad.push(leid);
    if (leid === 'beint') return svar(200, MEÐ_KT);
    n++;
    return n === 3 ? svar(200, MEÐ_KT) : svar(403, 'forbidden');   // 3ja sóknin tekst
  };
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f, proxyMaxFail: 3 });
  for (let i = 0; i < 5; i++) await s.fetchText(PFX, gilt);
  assert.equal(s.stats().proxyDautt, false, 'teljari átti að núllstillast við velheppnaða sókn');
  assert.equal(kallad.filter((x) => x === 'proxy').length, 5);
});

test('gáttarhaus fylgir aðeins proxy-sókninni, aldrei beinu', async () => {
  const hausar = [];
  const f = async (url, o) => { hausar.push([url.includes('/api/rskproxy') ? 'proxy' : 'beint', o.headers]); return svar(200, MEÐ_KT); };
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'LEYNI', fetchImpl: f });
  await s.fetchText(PFX, gilt);
  assert.equal(hausar[0][1]['X-Karp-Proxy'], 'LEYNI');
  const s2 = buildScrapeFetcher({ proxyBase: '', rskKey: 'LEYNI', fetchImpl: f });
  await s2.fetchText(PFX, gilt);
  assert.equal(hausar[1][1]['X-Karp-Proxy'], undefined, '⚠ lykill mátti ALDREI fara beint á skatturinn.is');
});

test('proxy-slóðin er url-kóðuð og SSRF-örugg', async () => {
  const slodir = [];
  const f = async (url) => { slodir.push(url); return svar(200, MEÐ_KT); };
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f });
  await s.fetchText(PFX, gilt);
  assert.equal(slodir[0], 'https://karp.is/api/rskproxy?p=' + encodeURIComponent(PFX));
});

test('án gildisprófs dugar hvaða 200-svar sem er', async () => {
  const { f, kallad } = herma({ proxy: svar(200, TÓMT) });
  const s = buildScrapeFetcher({ proxyBase: 'https://karp.is', rskKey: 'x', fetchImpl: f });
  assert.equal(await s.fetchText(PFX), TÓMT);
  assert.deepEqual(kallad, ['proxy']);
});
