// skriptur/lib/px_top.test.mjs
// ⚠ 21.9.2026: /menntun/ sýndi brautskráða 1995–1996 sem nýjustu tölur. SKO04205 merkir „Ár" EKKI sem
// tímabreytu, og þá velur PxWeb-sían 'top' fyrstu gildin í geymsluröð, þ.e. þau elstu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leidrettaTop, hefurTop } from './px_top.mjs';

const SKO04205 = { variables: [
  { code: 'Svið', values: ['0', '1', '2'] },
  { code: 'Ár', values: ['1995-1996', '1996-1997', '2023-2024', '2024-2025'] },
] };
const sel = (code, filter, values) => ({ code, selection: { filter, values } });

test("'top' á ómerktri árabreytu velur NÝJASTA gildið, ekki það elsta", () => {
  const q = leidrettaTop([sel('Svið', 'item', ['1']), sel('Ár', 'top', ['1'])], SKO04205);
  assert.deepEqual(q[1], sel('Ár', 'item', ['2024-2025']));
  assert.deepEqual(q[0], sel('Svið', 'item', ['1']), 'aðrar valir óbreyttar');
});

test("'top' N skilar N nýjustu í tímaröð, líka ef geymsluröðin er öfug", () => {
  const ofug = { variables: [{ code: 'Ár', values: ['2025', '2024', '2023', '2022'] }] };
  assert.deepEqual(leidrettaTop([sel('Ár', 'top', ['2'])], ofug)[0], sel('Ár', 'item', ['2024', '2025']));
});

test("tímamerkt breyta (time:true) fær að halda 'top' — þar virkar sían rétt", () => {
  const meta = { variables: [{ code: 'Mánuður', time: true, values: ['2026M06', '2026M07'] }] };
  assert.deepEqual(leidrettaTop([sel('Mánuður', 'top', ['12'])], meta)[0], sel('Mánuður', 'top', ['12']));
});

test('breyta sem finnst ekki í lýsigögnum er látin óbreytt', () => {
  assert.deepEqual(leidrettaTop([sel('Ár', 'top', ['1'])], { variables: [] })[0], sel('Ár', 'top', ['1']));
});

test('hefurTop', () => {
  assert.equal(hefurTop([sel('Ár', 'item', ['2025'])]), false);
  assert.equal(hefurTop([sel('Ár', 'top', ['1'])]), true);
});
