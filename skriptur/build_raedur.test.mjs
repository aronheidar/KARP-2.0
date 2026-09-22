import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './build_raedur.js';
const { greinRaedulista, erTom } = mod;

// ── fixtures: snið raedulisti-XML (sbr. build_raedur_nylegar.test.mjs, staðfest 22.8.2026) ──
const RAEDA = (o = {}) => {
  const { id = '1417', teg = 'ræða', heiti = 'prufumál', t0 = '2026-09-10T10:00:00', t1 = '2026-09-10T10:10:00' } = o;
  const maelandi = id === null ? '<ræðumaður> <nafn>Gestur</nafn> </ræðumaður>' : `<ræðumaður id='${id}'> <nafn>X</nafn> </ræðumaður>`;
  return `<ræða> ${maelandi} <löggjafarþing>158</löggjafarþing> <ræðahófst>${t0}</ræðahófst> <ræðulauk>${t1}</ræðulauk>`
    + ` <tegundræðu>${teg}</tegundræðu> <mál> <málsheiti>${heiti}</málsheiti> </mál> </ræða>`;
};
const LISTI = (...c) => `<?xml version="1.0" encoding="UTF-8"?> <ræðulisti>${c.join('')}</ræðulisti>`;

// ── greinRaedulista ───────────────────────────────────────────────────────
test('greinRaedulista: telur ræður og ræðumínútur per ræðumann', () => {
  const r = greinRaedulista(LISTI(
    RAEDA({ id: '1417', t0: '2026-09-10T10:00:00', t1: '2026-09-10T10:10:00' }),
    RAEDA({ id: '1417', t0: '2026-09-11T13:00:00', t1: '2026-09-11T13:05:30' }),
    RAEDA({ id: '9999', t0: '2026-09-11T14:00:00', t1: '2026-09-11T14:02:00' }),
  ));
  assert.equal(r.total, 3);
  assert.equal(r.mp['1417'].n, 2);
  assert.equal(r.mp['1417'].min, 16);          // 10 + 5,5 mín, námundað
  assert.equal(r.mp['1417'].raedur, 2);
  assert.equal(r.mp['9999'].min, 2);
});

test('greinRaedulista: ræða án auðkennis ræðumanns telst „sleppt" og kemst ekki í mp', () => {
  const r = greinRaedulista(LISTI(RAEDA({ id: '1417' }), RAEDA({ id: null })));
  assert.equal(r.skipped, 1);
  assert.deepEqual(Object.keys(r.mp), ['1417']);
});

test('greinRaedulista: andsvör = andsvar + svar; fundarstjórn og flutningsræða talin sér', () => {
  const r = greinRaedulista(LISTI(
    RAEDA({ teg: 'andsvar' }), RAEDA({ teg: 'svar' }),
    RAEDA({ teg: 'um fundarstjórn' }), RAEDA({ teg: 'flutningsræða' }), RAEDA({ teg: 'ræða' }),
  ));
  const e = r.mp['1417'];
  assert.deepEqual([e.n, e.andsvor, e.fundarstj, e.flutn, e.raedur], [5, 2, 1, 1, 1]);
});

// ⚠ KJARNINN: Alþingi svarar stundum 200 með tómum eða öðrum lista. Þá má EKKERT verða til.
test('greinRaedulista: XML án <ræða> (tómt svar eða villusíða með 200) skilar tómu mp', () => {
  for (const x of ['<?xml version="1.0"?> <ræðulisti> </ræðulisti>', '<html>Villa</html>', '', null]) {
    const r = greinRaedulista(x);
    assert.equal(r.total, 0, String(x).slice(0, 20));
    assert.deepEqual(r.mp, {});
  }
});

test('greinRaedulista: topMal raðað eftir ræðutíma, mest 5 mál; ávörp og þingsetning ekki talin mál', () => {
  const r = greinRaedulista(LISTI(
    RAEDA({ heiti: 'stutt mál', t0: '2026-09-10T10:00:00', t1: '2026-09-10T10:02:00' }),
    RAEDA({ heiti: 'langt mál', t0: '2026-09-10T11:00:00', t1: '2026-09-10T11:30:00' }),
    RAEDA({ heiti: 'ávarp forseta Íslands', t0: '2026-09-10T12:00:00', t1: '2026-09-10T12:40:00' }),
    RAEDA({ heiti: 'þingsetning', t0: '2026-09-10T13:00:00', t1: '2026-09-10T13:20:00' }),
  ));
  assert.deepEqual(r.mp['1417'].topMal, [{ h: 'langt mál', n: 1, min: 30 }, { h: 'stutt mál', n: 1, min: 2 }]);

  const morg = greinRaedulista(LISTI(...Array.from({ length: 7 }, (_, i) =>
    RAEDA({ heiti: 'mál ' + i, t0: '2026-09-10T10:00:00', t1: `2026-09-10T10:0${i + 1}:00` }))));
  assert.equal(morg.mp['1417'].topMal.length, 5);
  assert.deepEqual(morg.mp['1417'].topMal.map((m) => m.h), ['mál 6', 'mál 5', 'mál 4', 'mál 3', 'mál 2']);
});

test('greinRaedulista: óraunhæf lengd (3 klst eða meira, eða öfugir tímar) telst 0 mínútur', () => {
  const r = greinRaedulista(LISTI(
    RAEDA({ id: '1', t0: '2026-09-10T10:00:00', t1: '2026-09-10T13:30:00' }),   // 210 mín
    RAEDA({ id: '2', t0: '2026-09-10T13:00:00', t1: '2026-09-10T10:00:00' }),   // öfugt
    RAEDA({ id: '3', t0: '', t1: '' }),                                          // engir tímar
  ));
  assert.deepEqual([r.mp['1'].min, r.mp['2'].min, r.mp['3'].min], [0, 0, 0]);
  assert.equal(r.mp['1'].n, 1, 'ræðan telst samt með');
});

test('greinRaedulista: heiti lengri en 80 stafir klippt í 77 + ellipsu', () => {
  const langt = 'a'.repeat(100);
  const r = greinRaedulista(LISTI(RAEDA({ heiti: langt })));
  assert.equal(r.mp['1417'].topMal[0].h, 'a'.repeat(77) + '…');
  assert.equal(r.mp['1417'].longestHeiti, 'a'.repeat(77) + '…');
});

test('greinRaedulista: longest/longestHeiti er lengsta STAKA ræðan, ekki samtalan', () => {
  const r = greinRaedulista(LISTI(
    RAEDA({ heiti: 'stutt', t0: '2026-09-10T10:00:00', t1: '2026-09-10T10:05:00' }),
    RAEDA({ heiti: 'stutt', t0: '2026-09-10T11:00:00', t1: '2026-09-10T11:05:00' }),
    RAEDA({ heiti: 'lengsta', t0: '2026-09-10T12:00:00', t1: '2026-09-10T12:08:00' }),
  ));
  assert.equal(r.mp['1417'].longest, 8);
  assert.equal(r.mp['1417'].longestHeiti, 'lengsta');
  assert.equal(r.mp['1417'].min, 18);
});

// ── erTom: vörnin sem writeJsonUnlessEmpty byggir á ───────────────────────
test('erTom: skrá án ræðumanna er tóm — en nýtt þing með fáum ræðum er það EKKI', () => {
  assert.equal(erTom({ thing: 158, total: 0, mp: {} }), true);
  assert.equal(erTom(undefined), true);
  assert.equal(erTom({ thing: 158, total: 3, mp: {} }), true, 'mp ræður, ekki total');
  // Fyrstu daga nýs þings er skráin agnarsmá. Væri hún talin „tóm" frysi 157. þing að eilífu.
  assert.equal(erTom({ thing: 158, total: 1, mp: { 1417: { n: 1, min: 3 } } }), false);
});
