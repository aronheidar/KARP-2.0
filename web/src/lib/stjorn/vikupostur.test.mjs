import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vikupostur, vikuOrd, hjalparSetning, greinaSetning } from './vikupostur.mjs';
import { isoVika } from './vika.mjs';

const V38 = isoVika(Math.floor(Date.parse('2026-09-16T12:00:00Z') / 1000));
const V40 = isoVika(Math.floor(Date.parse('2026-10-01T12:00:00Z') / 1000));

test('vikuOrd: „til" en ekki strik, líka yfir mánaðamót', () => {
  assert.equal(vikuOrd(V38), '14. til 20. september');
  assert.equal(vikuOrd(V40), '28. september til 4. október');
});

test('hjalparSetning og greinaSetning: talnasamræmi og engin hætta á falli á efni líkansins', () => {
  assert.equal(hjalparSetning([{ id: 12, texti: 'nefnir endurgreiðslu' }]), 'Ég þarf þig á einni beiðni, #12 (nefnir endurgreiðslu).');
  assert.equal(hjalparSetning([{ id: 12, texti: 'nefnir endurgreiðslu' }, { id: 15, texti: 'í þriðja sinn á 30 dögum' }]),
    'Ég þarf þig á tveimur beiðnum, #12 (nefnir endurgreiðslu) og #15 (í þriðja sinn á 30 dögum).');
  const sjo = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
  assert.equal(hjalparSetning(sjo), 'Ég þarf þig á 7 beiðnum, meðal annars #1, #2, #3, #4 og #5.');
  assert.equal(hjalparSetning([]), '');
  assert.equal(greinaSetning([{ efni: 'Staðfesting á netfangi', ids: [1, 2, 3] }]),
    'Ég legg til eina nýja hjálpargrein, „Staðfesting á netfangi“, því sama spurningin hefur borist þrisvar eða oftar. Drögin skrifa ég þegar þú biður um þau.');
  assert.ok(greinaSetning([{ efni: 'A', ids: [1] }, { efni: 'B', ids: [2] }]).startsWith('Ég legg til tvær nýjar hjálpargreinar, „A“ og „B“,'));
});

test('vikupostur: málsgreinar úr tölum, engir tvípunktar eða strik í meginmáli, og allt escape-að', () => {
  const p = vikupostur({
    vika: V38,
    tolur: { barust: 8, svaradHenni: 3, svaradAroni: 4, tilHrafns: 1, lokad: 6, hafnad: 1, svartimiKlst: 3.2 },
    lifandi: { opnir: 2 },
    laerdomur: { fjoldi: 4, obreytt: 1, breytt: 3, lengd: 0.65, tekidUtOft: [], baettVidOft: [] },
    still: { ordHamark: 60 },
    hjalp: [{ id: 12, texti: 'nefnir <b>endurgreiðslu</b>' }],
    greinar: [],
  });
  assert.equal(p.efni, 'Vikan hjá mér, 14. til 20. september');
  const meginmal = p.texti.split('\n\nSpjaldið mitt')[0];
  assert.ok(!/[:–—]/.test(meginmal) && !/ - /.test(meginmal), 'póst-tónninn: ' + meginmal);
  assert.ok(p.texti.includes('8 beiðnir bárust í vikunni. Ég svaraði 3, þú svaraðir 4 og 1 fór áfram til Hrafns.'));
  assert.ok(p.texti.includes('Þú styttir þau að jafnaði um þriðjung, svo nú hef ég drögin styttri.'));
  assert.ok(p.html.includes('nefnir &lt;b&gt;endurgreiðslu&lt;/b&gt;') && !p.html.includes('<b>endurgreiðslu'));
  assert.ok(p.html.includes('https://karp.is/stjorn/#sigrun'));
});

test('vikupostur: róleg vika án lærdóms eða hjálpar er samt heill póstur', () => {
  const p = vikupostur({ vika: V38, tolur: { barust: 0 }, lifandi: { opnir: 0 } });
  assert.equal(p.texti.split('\n\n').slice(0, 2).join(' | '), 'Góðan daginn. | Engin beiðni barst í vikunni. Engin er opin núna.');
});
