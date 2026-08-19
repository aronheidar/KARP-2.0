import { test } from 'node:test';
import assert from 'node:assert';
import { isn93 } from '../src/lib/isn93.mjs';

test('isn93: þekktur punktur úr staðfangaskrá — Bæjarlind 8, 201 Kópavogur', () => {
  // Sama röð í stadfangaskra_extra ber HNIT „POINT (359665 402849)" og N/E_HNIT_WGS84 64.09987002 / -21.87914013.
  const [x, y] = isn93(64.09987002, -21.87914013);
  assert.ok(Math.abs(x - 359665) < 1.5, 'x: ' + x);
  assert.ok(Math.abs(y - 402849) < 1.5, 'y: ' + y);
});

test('isn93: Leirdalur 36, 260 lendir í Reykjanesbæ (x ~ 330 km, y ~ 390 km)', () => {
  const [x, y] = isn93(63.97243, -22.4989);
  assert.ok(x > 320000 && x < 345000, 'x: ' + x);
  assert.ok(y > 380000 && y < 400000, 'y: ' + y);
});

test('isn93: miðlína vörpunar (lon −19°) gefur x = 500000', () => {
  const [x] = isn93(65, -19);
  assert.ok(Math.abs(x - 500000) < 0.01, 'x: ' + x);
  const [, y0] = isn93(65, -19);
  assert.ok(Math.abs(y0 - 500000) < 0.01, 'y á lat0 = FN: ' + y0);
});

test('isn93: ógild hnit → null', () => {
  assert.equal(isn93(0, 0), null);
  assert.equal(isn93(NaN, -21), null);
  assert.equal(isn93(64, -40), null);
});
