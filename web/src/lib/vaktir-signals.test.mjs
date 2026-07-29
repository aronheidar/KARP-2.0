import { test } from 'node:test';
import assert from 'node:assert';
import { eftNylegt, byggMatch, rankMovement, ratingMovement, criticalDrop } from './vaktir-signals.mjs';

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

test('ratingMovement: fall (4→2) → down + badge', () => { const m = ratingMovement(4, 2); assert.equal(m.dir, 'down'); assert.equal(m.badge, '↓ féll úr 4 í 2'); assert.equal(m.from, 4); assert.equal(m.to, 2); });
test('ratingMovement: hækkun (2→4) → up + badge', () => { const m = ratingMovement(2, 4); assert.equal(m.dir, 'up'); assert.equal(m.badge, '↑ hækkaði úr 2 í 4'); });
test('ratingMovement: fall í 0 (1→0) telst fall', () => { assert.equal(ratingMovement(1, 0).dir, 'down'); });
test('ratingMovement: óbreytt (3→3) → null', () => { assert.equal(ratingMovement(3, 3), null); });
test('ratingMovement: engin saga (null→3) → null', () => { assert.equal(ratingMovement(null, 3), null); });
test('ratingMovement: ógilt cur → null', () => { assert.equal(ratingMovement(3, null), null); assert.equal(ratingMovement(3, undefined), null); });

test('criticalDrop: fall í 1 (4→1) → kritískt', () => { const m = criticalDrop(4, 1); assert.ok(m); assert.equal(m.to, 1); assert.equal(m.dir, 'down'); });
test('criticalDrop: fall í 0 (1→0) → kritískt', () => { assert.ok(criticalDrop(1, 0)); });
test('criticalDrop: fall EN ekki í 0-1 (4→2) → null', () => { assert.equal(criticalDrop(4, 2), null); });
test('criticalDrop: hækkun úr 0 (0→3) → null', () => { assert.equal(criticalDrop(0, 3), null); });
test('criticalDrop: engin saga (null→0) → null (sáning þegir)', () => { assert.equal(criticalDrop(null, 0), null); });
test('criticalDrop: óbreytt lágt (1→1) → null (endurtekur ekki)', () => { assert.equal(criticalDrop(1, 1), null); });
