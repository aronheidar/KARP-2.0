import { test } from 'node:test';
import assert from 'node:assert';
import { arsreikningurSummary } from './fjarhagur.mjs';

test('arsreikningurSummary: picks latest ISK year with revenue, applies kvardi', () => {
  const json = {
    kt: '4101692079',
    ar: {
      '2024': { mynt: 'ISK', kvardi: 1, rekstur: { sala: 400000000, hagnadur: 20000000 }, efnahagur: { eignir: 200000000, eigid_fe: 100000000 } },
      '2025': { mynt: 'ISK', kvardi: 1, rekstur: { sala: 535278416, hagnadur: 31675787 }, efnahagur: { eignir: 241090900, eigid_fe: 118156526 } },
    },
  };
  const s = arsreikningurSummary(json);
  assert.equal(s.kt, '4101692079');
  assert.equal(s.ar, '2025');
  assert.equal(s.sala, 535278416);
  assert.equal(s.eigid_fe, 118156526);
});

test('arsreikningurSummary: applies kvardi (thousands)', () => {
  const json = { kt: '5', ar: { '2024': { mynt: 'ISK', kvardi: 1000, rekstur: { sala: 5000 }, efnahagur: {} } } };
  assert.equal(arsreikningurSummary(json).sala, 5000000);
});

test('arsreikningurSummary: skips non-ISK and no-revenue years → null', () => {
  assert.equal(arsreikningurSummary({ kt: '5', ar: { '2024': { mynt: 'EUR', rekstur: { sala: 100 }, efnahagur: {} } } }), null);
  assert.equal(arsreikningurSummary({ kt: '5', ar: { '2024': { mynt: 'ISK', rekstur: {}, efnahagur: {} } } }), null);
  assert.equal(arsreikningurSummary({ kt: '5', ar: {} }), null);
});
