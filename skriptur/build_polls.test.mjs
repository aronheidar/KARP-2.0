// Dagsetningar í könnunartöflu Wikipedia eru á fleiri sniðum en þáttarinn réð við.
// Tvær villur sátu í polls.json 12.9.2026 og þessi próf festa lagfæringuna:
//   1. `\b(Jan|…|Dec)\b` felldi FULLT mánaðarheiti („June“) út í þögn → nýjasta
//      Gallup-könnunin (n=12.102) vantaði mánuðum saman.
//   2. Mánuður var tekinn úr FYRSTA heiti en dagur úr því síðasta, svo „30 Apr – 31 May 2026“
//      varð 2026-04-31 — dagsetning sem er ekki til — á könnun með 12.979 svarendum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { parseDate, pollster, num, parseDateIs, numIs, lesaIsTofla, sameinaKannanir } = createRequire(import.meta.url)('./build_polls.js');

// ⚠ 22.9.2026: enska Wikipedia stóð í Gallup 30.6 en sú íslenska var komin í 31.8 (Gallup,
// Maskína 11.8 o.fl.). Íslenska taflan: komma = tugabrot, punktur = þúsund, íslensk mánaðarheiti,
// flokkaröð S, D, C, F, M, B, J, P, V lesin úr hausnum, og atburðalínur sem byrja á „!".
const IS_TAFLA = `==Skoðanakannanir==
{| class="wikitable sortable"
|- style="height:40px;"
! rowspan="2"| Fyrirtæki
! rowspan="2"| Síðasti dagur framkvæmda
! rowspan="2"| Úrtak
! rowspan="2"| Svarhlutfall
! class="unsortable" |[[Samfylkingin|S]]
! class="unsortable" |[[Sjálfstæðisflokkurinn|D]]
! class="unsortable" |[[Viðreisn|C]]
! class="unsortable" |[[Flokkur fólksins|F]]
! class="unsortable" |[[Miðflokkurinn (Ísland)|M]]
! class="unsortable" |[[Framsóknarflokkurinn|B]]
! class="unsortable" |[[Sósíalistaflokkur Íslands (21. öld)|J]]
! class="unsortable" |[[Píratar|P]]
! class="unsortable" |[[Vinstrihreyfingin – grænt framboð|V]]
! rowspan="2"| Aðrir
! rowspan="2"| Forskot
|-
! style="background:{{flokkslitur|Samfylkingin}};"|
|-
|[https://www.ruv.is/frettir/x Gallup]
|31. ágúst 2026
|13.836
|40,2
|style="background:#F6CDCF;"|'''29,6'''
|26,8
|9,7
|4,8
|15,6
|5,5
|2,4
|1,9
|3,6
|–
| style="background:{{flokkslitur|Samfylkingin}};color:#FFFFFF;"| 2,8
|-
!
!29. ágúst 2026
! colspan="13" |Þjóðaratkvæðagreiðsla fer fram.
|-
|[https://www.visir.is/g/y Maskína]
|11. ágúst 2026
|3.172
|–
|style="background:#F6CDCF;"|'''26,2'''
|25,1
|11,5
|5,2
|12,7
|7,8
|3,9
|3,5
|4,2
|–
| 1,1
|}`;

test('íslensk dagsetning: síðasti dagur og síðasta mánaðarheiti', () => {
  assert.equal(parseDateIs('31. ágúst 2026'), '2026-08-31');
  assert.equal(parseDateIs('1.–30. júní 2026'), '2026-06-30');
  assert.equal(parseDateIs('28. febrúar 2026'), '2026-02-28');
  assert.equal(parseDateIs('óljóst'), null);
});

test('íslensk tala: komma er tugabrot og punktur þúsund', () => {
  assert.equal(numIs("style=\"background:#F6CDCF;\"|'''29,6'''"), 29.6);
  assert.equal(numIs('13.836'), 13836);
  assert.equal(numIs('–'), null);
});

test('íslenska taflan: flokkaröð úr hausnum og atburðalínum sleppt', () => {
  const k = lesaIsTofla(IS_TAFLA);
  assert.equal(k.length, 2);
  assert.deepEqual(k[0], { date: '2026-08-31', pollster: 'Gallup', sample: 13836,
    v: { S: 29.6, D: 26.8, C: 9.7, F: 4.8, M: 15.6, B: 5.5, J: 2.4, P: 1.9, V: 3.6 } });
  assert.equal(k[1].pollster, 'Maskína');
  assert.equal(k[1].v.M, 12.7);
});

test('sameinaKannanir: sama könnun með ólíkum lokadegi á síðunum tveimur telst einu sinni', () => {
  // Raunverulegt 22.9.2026: Maskína 2025-06-22 (en) og 2025-06-26 (is), sömu fylgistölur.
  const v = { S: 28.1, D: 20.2, C: 12.0 };
  const en = [{ date: '2025-06-22', pollster: 'Maskína', sample: null, v }];
  const is = [{ date: '2025-06-26', pollster: 'Maskína', sample: 876, v: { ...v } }];
  const s = sameinaKannanir(en, is);
  assert.equal(s.length, 1);
  assert.equal(s[0].date, '2025-06-26', 'íslenska útgáfan gildir');
});

test('sameinaKannanir: tvær ólíkar kannanir sama fyrirtækis sömu viku halda sér báðar', () => {
  const en = [{ date: '2026-03-02', pollster: 'Prósent', sample: 900, v: { S: 27.0, D: 21.0, C: 11.0 } }];
  const is = [{ date: '2026-03-06', pollster: 'Prósent', sample: 950, v: { S: 29.5, D: 19.0, C: 12.5 } }];
  assert.equal(sameinaKannanir(en, is).length, 2);
});

test('sameinaKannanir: sama fyrirtæki og dagur telst einu sinni, íslenska gildir', () => {
  const en = [{ date: '2026-06-30', pollster: 'Gallup', sample: 12102, v: { S: 26.2 } }];
  const is = [{ date: '2026-06-30', pollster: 'Gallup', sample: 12102, v: { S: 26.3 } },
    { date: '2026-08-31', pollster: 'Gallup', sample: 13836, v: { S: 29.6 } }];
  const s = sameinaKannanir(en, is);
  assert.equal(s.length, 2);
  assert.equal(s[0].v.S, 26.3);
  assert.deepEqual(s.map((k) => k.date), ['2026-06-30', '2026-08-31']);
});

test('fullt mánaðarheiti þáttast (var þögult brottfall)', () => {
  assert.equal(parseDate('1–30 June 2026'), '2026-06-30');
  assert.equal(parseDate('3–9 September 2026'), '2026-09-09');
  assert.equal(parseDate('15 January 2026'), '2026-01-15');
});

test('stytt mánaðarheiti þáttast áfram', () => {
  assert.equal(parseDate('2–11 Jun 2026'), '2026-06-11');
  assert.equal(parseDate('30 Nov 2024'), '2024-11-30');
});

test('bil yfir mánaðamót tekur SÍÐARI mánuðinn', () => {
  assert.equal(parseDate('30 Apr – 31 May 2026'), '2026-05-31');
  assert.equal(parseDate('28 Feb – 31 Mar 2026'), '2026-03-31');
  assert.equal(parseDate('29 Dec 2025 – 5 Jan 2026'), '2026-01-05');
});

test('dagur er aldrei utan mánaðar', () => {
  assert.equal(parseDate('1–31 Apr 2026'), '2026-04-30');   // apríl á engan 31.
  assert.equal(parseDate('1–31 Feb 2026'), '2026-02-28');
});

test('hver skiluð dagsetning er raunverulegur almanaksdagur', () => {
  for (const s of ['1–30 June 2026', '30 Apr – 31 May 2026', '1–31 Apr 2026', '2–11 Jun 2026']) {
    const [y, m, d] = parseDate(s).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    assert.equal(dt.getUTCMonth() + 1, m, s + ' gaf mánuð sem stenst ekki');
    assert.equal(dt.getUTCDate(), d, s + ' gaf dag sem stenst ekki');
  }
});

test('ólesanleg dagsetning skilar null (kallandi telur og segir frá)', () => {
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('—'), null);
  assert.equal(parseDate('2026'), null, 'ártal eitt og sér er ekki dagsetning');
});

test('pollster hreinsar wiki-hlekki', () => {
  assert.equal(pollster('[https://www.gallup.is/eitthvad/ Gallup]'), 'Gallup');
  assert.equal(pollster('[[Maskína]]'), 'Maskína');
});

test('num les prósentu en ALDREI þingsætatöluna á eftir', () => {
  assert.equal(num("style=\"background:#F6CDCF;\" | '''26.2'''"), 26.2);
  assert.equal(num('11.4<br/>{{font|size=85%|text=8}}'), 11.4);
  assert.equal(num('12,102'), 12102);
  assert.equal(num('–'), null);
});
