// Verðbil gluggans á allt.is. ⚠⚠ Bilið er punktmat ± 10%, ALDREI lo/hi úr metaUrSolusogu.
// Það er fjórðungsbil SAMBÆRILEGRA eigna og raunverð lendir innan þess í aðeins 35,4% tilvika
// (mælt 17.9.2026). ±10% hittir 79,3% á Reykjanesi, og þá fullyrðingu má segja upphátt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIL_HLUTFALL, BIL_ORDALAG, verdbil } from '../src/lib/verdbil.mjs';

test('bilið er punktmat ± 10%', () => {
  const r = verdbil(600000, 100);            // 60.000.000 kr
  assert.equal(r.lagt, 54000000);
  assert.equal(r.hatt, 66000000);
  assert.equal(BIL_HLUTFALL, 0.10);
});

test('⚠ ENGIN miðgildistala í svarinu — viðmótið á ekki að GETA sýnt punktmat', () => {
  const r = verdbil(600000, 100);
  assert.deepEqual(Object.keys(r).sort(), ['hatt', 'lagt', 'ordalag']);
});

test('orðalagið fylgir ALLTAF bilinu og er orðrétt', () => {
  assert.equal(verdbil(600000, 100).ordalag, BIL_ORDALAG);
  assert.equal(BIL_ORDALAG, 'Rétt í fjórum af hverjum fimm tilvikum.');
});

test('námundað í heilar krónur', () => {
  const r = verdbil(123457, 87.3);
  assert.equal(r.lagt, Math.round(123457 * 87.3 * 0.9));
  assert.equal(Number.isInteger(r.lagt), true);
  assert.equal(Number.isInteger(r.hatt), true);
});

test('rusl skilar null, ekki tölu', () => {
  for (const [p, f] of [[0, 100], [600000, 0], [null, 100], [600000, null], ['x', 'y'], [-1, 100], [NaN, 100]]) {
    assert.equal(verdbil(p, f), null, JSON.stringify([p, f]) + ' á að skila null');
  }
});
