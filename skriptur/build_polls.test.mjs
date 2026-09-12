// Dagsetningar í könnunartöflu Wikipedia eru á fleiri sniðum en þáttarinn réð við.
// Tvær villur sátu í polls.json 12.9.2026 og þessi próf festa lagfæringuna:
//   1. `\b(Jan|…|Dec)\b` felldi FULLT mánaðarheiti („June“) út í þögn → nýjasta
//      Gallup-könnunin (n=12.102) vantaði mánuðum saman.
//   2. Mánuður var tekinn úr FYRSTA heiti en dagur úr því síðasta, svo „30 Apr – 31 May 2026“
//      varð 2026-04-31 — dagsetning sem er ekki til — á könnun með 12.979 svarendum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { parseDate, pollster, num } = createRequire(import.meta.url)('./build_polls.js');

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
