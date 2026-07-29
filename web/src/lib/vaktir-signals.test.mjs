import { test } from 'node:test';
import assert from 'node:assert';
import { eftNylegt, byggMatch } from './vaktir-signals.mjs';

test('eftNylegt: nýleg dagsetning (>=wk) → true', () => { assert.equal(eftNylegt('2026-07-25', '2026-07-22'), true); });
test('eftNylegt: full ISO slice → true', () => { assert.equal(eftNylegt('2026-07-25T10:00:00Z', '2026-07-22'), true); });
test('eftNylegt: gömul dagsetning → false', () => { assert.equal(eftNylegt('2026-07-20', '2026-07-22'), false); });
test('eftNylegt: tómt/nullish → false', () => { assert.equal(eftNylegt('', '2026-07-22'), false); assert.equal(eftNylegt(null, '2026-07-22'), false); });
test('byggMatch: póstnúmer (3ja stafa q) → true', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, '101'), true); });
test('byggMatch: rangt póstnúmer → false', () => { assert.equal(byggMatch({ pn: '105', a: 'Bragagata 26' }, '101'), false); });
test('byggMatch: gatna-forskeyti (case-insensitive) → true', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, 'braga'), true); });
test('byggMatch: ósamsvarandi gata → false', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, 'Laufás'), false); });
test('byggMatch: tómt q → false', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, ''), false); });
