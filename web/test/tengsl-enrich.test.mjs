import { test } from 'node:test';
import assert from 'node:assert';
import { tengslGrunnurEnrich, maskaKortSvar } from '../worker.js';

// Fake D1: env.TENGSL.prepare(sql).bind(...).all() → { results: [...] }
function fakeD1(rowsByKt) {
  return {
    prepare(sql) {
      return { bind(...args) { const pk = args[0]; return { async all() { return { results: rowsByKt[pk] || [] }; } }; } };
    },
  };
}

test('tengslGrunnurEnrich: adds country-wide companies to a named officer', async () => {
  const out = { kt: '5920190799', holdur: true, stjornendur: [{ nafn: 'Anna', _kt: '1201743509', hlutverk_rot: ['stjórn'], onnur: [] }], krossar: [] };
  const env = { TENGSL: fakeD1({ '1201743509': [{ kt: '4808221610', nafn: 'Fjarlægt ehf.', hlutverk: 'Stjórn' }] }) };
  const r = await tengslGrunnurEnrich(env, out, '5920190799');
  const anna = r.stjornendur[0];
  assert.ok(anna.onnur.some((o) => o.kt === '4808221610' && o.nafn === 'Fjarlægt ehf.' && o.grunnur));
});

test('tengslGrunnurEnrich: no TENGSL binding → unchanged, _kt stripped', async () => {
  const out = { kt: '5920190799', holdur: true, stjornendur: [{ nafn: 'Anna', _kt: '1201743509', onnur: [] }], krossar: [] };
  const r = await tengslGrunnurEnrich({}, out, '5920190799');
  assert.equal(r.stjornendur[0].onnur.length, 0);
  assert.equal(r.stjornendur[0]._kt, undefined); // stripped even without binding
});

test('privacy: enriched then masked → krossar carry no names, officer _kt stripped', async () => {
  const out = {
    kt: '5920190799', holdur: true,
    stjornendur: [{ nafn: 'Anna', _kt: '1201743509', hlutverk_rot: ['stjórn'], onnur: [] }],
    krossar: [{ nafn: 'Leyni Persóna', felog: [{ kt: '4808221610', nafn: 'Fjarlægt ehf.' }] }],
  };
  const env = { TENGSL: fakeD1({ '1201743509': [{ kt: '4808221610', nafn: 'Fjarlægt ehf.', hlutverk: 'Stjórn' }] }) };
  const enriched = await tengslGrunnurEnrich(env, out, '5920190799');
  const masked = maskaKortSvar(enriched);
  const s = JSON.stringify(masked);
  assert.ok(!s.includes('Leyni Persóna'));          // distant person name cut
  assert.ok(!s.includes('1201743509'));             // person-kt never leaves
  assert.equal(masked.krossar[0].token, 'E1');
});
