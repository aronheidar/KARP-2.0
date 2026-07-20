import { test } from 'node:test';
import assert from 'node:assert';
import { topplistaBody } from '../worker.js';
import { greinaSql } from '../src/lib/greinar.mjs';

const rows = Array.from({ length: 10 }, (_, i) => ({ kt: '49' + i, nafn: 'Félag ' + i, sala: 1000 - i }));

test('topplistaBody: entitled → full rows', () => {
  const b = topplistaBody(rows, true, 42);
  assert.equal(b.radir.length, 10);
  assert.equal(b.locked, false);
  assert.equal(b.total, 42);
});

test('topplistaBody: not entitled → top-3 teaser', () => {
  const b = topplistaBody(rows, false, 42);
  assert.equal(b.radir.length, 3);
  assert.equal(b.locked, true);
  assert.equal(b.radir[0].nafn, 'Félag 0');
});

test('greinaSql wiring: verslun filter', () => {
  assert.equal(greinaSql('verslun'), "substr(f.isat_primary,1,2) IN ('45','46','47')");
});
