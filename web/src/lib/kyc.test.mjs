import { test } from 'node:test';
import assert from 'node:assert';
import { canon, hash, signalEvents, SEVERITY_RANK } from './kyc.mjs';
import { traceUbo, hlutFrac, KYC_UBO_THRESHOLD } from './ubo-core.mjs';

test('canon er óháð lykla-röð og fylkja-röð', () => {
  assert.equal(canon({ b: 1, a: [2, 1] }), canon({ a: [1, 2], b: 1 }));
});
test('hash er deterministic og breytist við breytingu', () => {
  assert.equal(hash('abc'), hash('abc'));
  assert.notEqual(hash('abc'), hash('abd'));
});
test('signalEvents: prev=null (grunnlína) skilar engum atburðum', () => {
  assert.deepEqual(signalEvents('sanctions', null, { hits: [{ name: 'X' }] }), []);
});
test('signalEvents: nýtt refsilista-hit = critical', () => {
  const ev = signalEvents('sanctions', { hits: [] }, { hits: [{ name: 'Acme' }] });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'sanctions_hit');
  assert.equal(ev[0].severity, 'critical');
  assert.equal(ev[0].detail.name, 'Acme');
});
test('signalEvents: ný gjaldþrota-innköllun = critical', () => {
  const ev = signalEvents('legal', { notices: [] }, { notices: [{ ref: 'L1', type: 'bankruptcy', dags: '2026-07-20' }] });
  assert.equal(ev[0].kind, 'bankruptcy');
  assert.equal(ev[0].severity, 'critical');
});
test('signalEvents: nýr/horfinn UBO = high', () => {
  const add = signalEvents('ubo', { owners: [] }, { owners: [{ key: 'p1', nafn: 'Jón', hlutur: 0.3 }] });
  assert.equal(add[0].kind, 'new_ubo'); assert.equal(add[0].severity, 'high');
  const rem = signalEvents('ubo', { owners: [{ key: 'p1', nafn: 'Jón', hlutur: 0.3 }] }, { owners: [] });
  assert.equal(rem[0].kind, 'removed_ubo');
});
test('signalEvents: status → gjaldþrot = critical bankruptcy', () => {
  const ev = signalEvents('status', { gjaldthrot: 0, afskrad: 0, stada: 'Virkt' }, { gjaldthrot: 1, afskrad: 0, stada: 'Virkt' });
  assert.equal(ev[0].kind, 'bankruptcy'); assert.equal(ev[0].severity, 'critical');
});
test('signalEvents: nýtt PEP-match = high', () => {
  const ev = signalEvents('pep', { matches: [] }, { matches: [{ name: 'Ráðherra' }] });
  assert.equal(ev[0].kind, 'pep_change'); assert.equal(ev[0].severity, 'high');
});
test('SEVERITY_RANK raðar', () => {
  assert.ok(SEVERITY_RANK.critical > SEVERITY_RANK.high && SEVERITY_RANK.high > SEVERITY_RANK.info);
});
import { deriveRisk } from './kyc.mjs';
test('deriveRisk: refsilisti eða gjaldþrot = Há', () => {
  assert.equal(deriveRisk({ sanctions: { hits: [{ name: 'X' }] } }), 'Há');
  assert.equal(deriveRisk({ status: { gjaldthrot: 1 } }), 'Há');
});
test('deriveRisk: PEP eða neikvæð media = Venjuleg', () => {
  assert.equal(deriveRisk({ pep: { matches: [{ name: 'P' }] } }), 'Venjuleg');
  assert.equal(deriveRisk({ media: { titles: [{ h: '1' }] } }), 'Venjuleg');
});
test('deriveRisk: ekkert = Lág', () => {
  assert.equal(deriveRisk({ status: { gjaldthrot: 0 } }), 'Lág');
  assert.equal(deriveRisk({}), 'Lág');
});

// ── Endanlegt/óbeint UBO (ubo-core.mjs + ubo-undirmerki í signalEvents) ──────────
const mkGraph = (adj) => ({ getOwners: (k) => adj[k] || [] });

test('signalEvents: nýr/horfinn endanlegur eigandi (beneficial) = high', () => {
  const add = signalEvents('ubo', { owners: [], beneficial: [] }, { owners: [], beneficial: [{ key: 'p1', nafn: 'Jón', effPct: 30 }] });
  assert.equal(add.length, 1);
  assert.equal(add[0].kind, 'new_beneficial'); assert.equal(add[0].severity, 'high'); assert.equal(add[0].detail.key, 'p1');
  const rem = signalEvents('ubo', { owners: [], beneficial: [{ key: 'p1', nafn: 'Jón', effPct: 30 }] }, { owners: [], beneficial: [] });
  assert.equal(rem[0].kind, 'removed_beneficial'); assert.equal(rem[0].severity, 'high');
});
test('signalEvents: eldri ubo-snapshot ÁN beneficial-lykils gefur enga falska beneficial-atburði', () => {
  const ev = signalEvents('ubo',
    { owners: [{ key: 'a', nafn: 'A', hlutur: '50%' }] },                                         // gamalt snið, enginn beneficial-lykill
    { owners: [{ key: 'a', nafn: 'A', hlutur: '50%' }], beneficial: [{ key: 'p1', nafn: 'X', effPct: 50 }] });
  assert.equal(ev.length, 0);
});
test('signalEvents: beinir eigendur og beneficial diffast samhliða', () => {
  const ev = signalEvents('ubo',
    { owners: [], beneficial: [] },
    { owners: [{ key: 'a', nafn: 'A', hlutur: '30%' }], beneficial: [{ key: 'a', nafn: 'A', effPct: 30 }] });
  assert.deepEqual(ev.map((e) => e.kind).sort(), ['new_beneficial', 'new_ubo']);
});

test('traceUbo: margfaldar keðjur og safnar sama einstakling um margar leiðir + raðar', () => {
  const g = mkGraph({
    root: [{ key: 'p1', hlutur: 30, isCompany: false, nafn: 'Jón' }, { key: 'C', hlutur: 80, isCompany: true, nafn: 'C ehf.' }],
    C: [{ key: 'p1', hlutur: 50, isCompany: false, nafn: 'Jón' }, { key: 'p2', hlutur: 50, isCompany: false, nafn: 'Anna' }],
  });
  const { beneficial, incompleteChain } = traceUbo(g, 'root');
  assert.equal(incompleteChain, false);
  assert.deepEqual(beneficial.map((b) => [b.key, b.effPct]), [['p1', 70], ['p2', 40]]);   // 30 + 80*50%
  assert.ok(!beneficial.some((b) => b.incomplete));
});
test('traceUbo: aðeins virkt eignarhald ≥25% telst raunverulegur eigandi', () => {
  const g = mkGraph({ root: [{ key: 'a', hlutur: 20, isCompany: false }, { key: 'b', hlutur: 25, isCompany: false }] });
  assert.deepEqual(traceUbo(g, 'root').beneficial.map((b) => b.key), ['b']);
  assert.equal(KYC_UBO_THRESHOLD, 0.25);
});
test('traceUbo: hringur stöðvar (engin óendanleg lykkja) og setur incompleteChain', () => {
  const g = mkGraph({
    root: [{ key: 'C', hlutur: 50, isCompany: true }],
    C: [{ key: 'root', hlutur: 50, isCompany: true }, { key: 'p', hlutur: 60, isCompany: false, nafn: 'P' }],
  });
  const { beneficial, incompleteChain } = traceUbo(g, 'root');
  assert.equal(incompleteChain, true);
  const p = beneficial.find((b) => b.key === 'p');
  assert.ok(p && p.effPct === 30);   // 0.5 * 0.6
});
test('traceUbo: félag án eigenda = blindgata → incompleteChain + incomplete-merki á óbeinum eiganda, ENGIN félög sem beneficial', () => {
  const g = mkGraph({
    root: [{ key: 'D', hlutur: 60, isCompany: true, nafn: 'D ehf.' }, { key: 'X', hlutur: 40, isCompany: true, nafn: 'X hf.' }],
    D: [{ key: 'a', hlutur: 100, isCompany: false, nafn: 'Anna' }],
    // X hefur enga skráða eigendur -> blindgata (órakið/óbyggt)
  });
  const { beneficial, incompleteChain } = traceUbo(g, 'root');
  assert.equal(incompleteChain, true);
  assert.equal(beneficial.length, 1);
  assert.deepEqual([beneficial[0].key, beneficial[0].effPct, beneficial[0].incomplete], ['a', 60, true]);
});
test('traceUbo: dýptar- og hnútaþak binda rakninguna og merkja incompleteChain', () => {
  const chain = mkGraph({
    root: [{ key: 'C1', hlutur: 100, isCompany: true }],
    C1: [{ key: 'C2', hlutur: 100, isCompany: true }],
    C2: [{ key: 'p', hlutur: 100, isCompany: false, nafn: 'P' }],
  });
  const dcap = traceUbo(chain, 'root', { depthCap: 1 });
  assert.equal(dcap.incompleteChain, true);
  assert.equal(dcap.beneficial.length, 0);                 // p handan dýptarþaks
  const ncap = traceUbo(chain, 'root', { nodeCap: 1 });
  assert.equal(ncap.truncated, true);
  assert.equal(ncap.incompleteChain, true);
});
test('hlutFrac: þáttar strengi/tölur/rusl í brot (eign.hlutur er strengur eins og \'60%\')', () => {
  assert.equal(hlutFrac('60%'), 0.6);
  assert.equal(hlutFrac('60,5%'), 0.605);
  assert.equal(hlutFrac(60), 0.6);
  assert.equal(hlutFrac('-'), 0);
  assert.equal(hlutFrac(null), 0);
  assert.equal(hlutFrac(undefined), 0);
});
