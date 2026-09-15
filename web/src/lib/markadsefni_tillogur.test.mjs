import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VORUKORT, heitMalefni, pararVidVoru, tillogur } from './markadsefni_tillogur.mjs';

const NU = Date.UTC(2026, 8, 15) / 1000;
const MALEFNI = [
  { n: 'Sjávarútvegur', f: 'Atvinnuvegir', um: 'sjávarútveg', a: ['sjávarútveg', 'kvóta', 'fiskveiði'] },
  { n: 'Verðbólga', f: 'Efnahagur', um: 'verðbólgu', a: ['verðbólga', 'verðbólgu'] },
  { n: 'Veður', f: 'Samfélag', um: 'veður', a: ['veður', 'óveður'] },
];
/** n fréttir um `ord`, dreifðar yfir `dagarAftur` daga. */
const frettir = (ord, n, dagarAftur) => Array.from({ length: n }, (_, i) => ({
  title: 'Frétt um ' + ord + ' nr ' + i, body: '', ts: NU - Math.floor((i / Math.max(1, n - 1)) * dagarAftur * 86400),
}));

test('heitt málefni er HLUTFALL, ekki fjöldi — þrefalt venjulegt er frétt, þrjátíu greinar eru það ekki', () => {
  // kvóti: 12 greinar á 7 dögum, 24 á 90 dögum → grunnlína ~1,9/viku → hlutfall ~6
  // verðbólga: 30 greinar jafndreifðar á 90 daga → ~2,3 í vikunni, hlutfall ~1
  const f = [...frettir('kvóta', 12, 7), ...frettir('kvóta', 12, 90), ...frettir('verðbólgu', 30, 90)];
  const h = heitMalefni(f, MALEFNI, { nu: NU });
  assert.equal(h[0].malefni, 'Sjávarútvegur', 'sjávarútvegur er heitastur þótt verðbólga hafi fleiri greinar alls');
  assert.ok(h[0].hlutfall > 2, 'hlutfall yfir tvöfalt');
  const verdbolga = h.find((x) => x.malefni === 'Verðbólga');
  assert.ok(!verdbolga || verdbolga.hlutfall < 2, 'jafndreifð umfjöllun er ekki heit');
});

test('málefni með of fáar greinar í glugganum kemst ekki á listann — hávaði er ekki frétt', () => {
  const h = heitMalefni(frettir('óveður', 2, 3), MALEFNI, { nu: NU });
  assert.deepEqual(h.map((x) => x.malefni), [], 'tvær greinar duga ekki');
  const h2 = heitMalefni(frettir('óveður', 6, 5), MALEFNI, { nu: NU });
  assert.deepEqual(h2.map((x) => x.malefni), ['Veður']);
});

test('pararVidVoru: aðeins málefni sem við eigum RAUNVERULEGA tölu um', () => {
  const v = pararVidVoru('Sjávarútvegur');
  assert.ok(v && v.vara && v.slod, 'sjávarútvegur á sér vöru');
  assert.equal(pararVidVoru('Veður'), null, 'við eigum enga veðurtölu — engin tillaga');
  assert.equal(pararVidVoru(null), null);
  for (const [nafn, v2] of Object.entries(VORUKORT)) {
    assert.ok(v2.vara && v2.slod && v2.tala, nafn + ' ber vöru, slóð og lýsingu á tölunni');
  }
});

test('tillögur sleppa því sem við höfum þegar birt um síðustu 30 daga', () => {
  const heitt = [{ malefni: 'Sjávarútvegur', hlutfall: 4, vika: 12 }, { malefni: 'Verðbólga', hlutfall: 3, vika: 9 }];
  const safn = [{ efnistok: 'Sjávarútvegur', birt: NU - 10 * 86400 }];
  const t = tillogur(heitt, safn, NU);
  assert.deepEqual(t.map((x) => x.malefni), ['Verðbólga'], 'nýbirt efni endurtekst ekki');
  const gamalt = [{ efnistok: 'Sjávarútvegur', birt: NU - 60 * 86400 }];
  assert.equal(tillogur(heitt, gamalt, NU).length, 2, 'tveggja mánaða gamalt efni lokar ekki málefninu');
});

test('tillaga ber rökin með sér svo hún sé metanleg', () => {
  const t = tillogur([{ malefni: 'Sjávarútvegur', hlutfall: 3.4, vika: 12 }], [], NU);
  assert.equal(t.length, 1);
  assert.match(t[0].rok, /3,4/, 'hlutfallið stendur í rökunum');
  assert.match(t[0].rok, /12/, 'fjöldi greina stendur líka');
  assert.ok(t[0].vara && t[0].slod && t[0].tala);
});

test('tóm eða gölluð gögn skila tómum lista í stað þess að kasta', () => {
  assert.deepEqual(heitMalefni(null, null, { nu: NU }), []);
  assert.deepEqual(heitMalefni([], MALEFNI, { nu: NU }), []);
  assert.deepEqual(tillogur(null, null, NU), []);
});
