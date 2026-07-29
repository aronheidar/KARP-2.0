import { test } from 'node:test';
import assert from 'node:assert';
import { eftNylegt, byggMatch, rankMovement } from './vaktir-signals.mjs';

test('eftNylegt: nýleg dagsetning (>=wk) → true', () => { assert.equal(eftNylegt('2026-07-25', '2026-07-22'), true); });
test('eftNylegt: full ISO slice → true', () => { assert.equal(eftNylegt('2026-07-25T10:00:00Z', '2026-07-22'), true); });
test('eftNylegt: gömul dagsetning → false', () => { assert.equal(eftNylegt('2026-07-20', '2026-07-22'), false); });
test('eftNylegt: tómt/nullish → false', () => { assert.equal(eftNylegt('', '2026-07-22'), false); assert.equal(eftNylegt(null, '2026-07-22'), false); });
test('byggMatch: póstnúmer (3ja stafa q) → true', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, '101'), true); });
test('byggMatch: rangt póstnúmer → false', () => { assert.equal(byggMatch({ pn: '105', a: 'Bragagata 26' }, '101'), false); });
test('byggMatch: gatna-forskeyti (case-insensitive) → true', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, 'braga'), true); });
test('byggMatch: ósamsvarandi gata → false', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, 'Laufás'), false); });
test('byggMatch: tómt q → false', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, ''), false); });

test('rankMovement: inn í topp-3 (5→2) → milestone up', () => { const m = rankMovement({ rank: 5 }, { rank: 2 }); assert.equal(m.dir, 'up'); assert.equal(m.badge, '↑ í topp 3'); });
test('rankMovement: nýtt #1 (2→1)', () => { assert.equal(rankMovement({ rank: 2 }, { rank: 1 }).badge, '🥇 nýtt #1 í greininni'); });
test('rankMovement: út úr topp-5 (4→7) → milestone down', () => { assert.equal(rankMovement({ rank: 4 }, { rank: 7 }).badge, '↓ úr topp 5'); });
test('rankMovement: stökk niður (40→36) → jump up 4', () => { const m = rankMovement({ rank: 40 }, { rank: 36 }); assert.equal(m.kind, 'jump'); assert.equal(m.badge, '↑ 4 sæti'); });
test('rankMovement: smá-rek (40→41) → null', () => { assert.equal(rankMovement({ rank: 40 }, { rank: 41 }), null); });
test('rankMovement: óbreytt/null → null', () => { assert.equal(rankMovement({ rank: 3 }, { rank: 3 }), null); assert.equal(rankMovement(null, { rank: 3 }), null); assert.equal(rankMovement({ rank: 3 }, { rank: null }), null); });
