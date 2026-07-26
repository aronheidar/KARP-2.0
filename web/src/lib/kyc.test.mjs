import { test } from 'node:test';
import assert from 'node:assert';
import { canon, hash, signalEvents, SEVERITY_RANK } from './kyc.mjs';

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
