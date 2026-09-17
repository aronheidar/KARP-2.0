// Rökvísi verðmatsgluggans. Hún má ekki liggja í .astro-skránni, þar nær ekkert próf til hennar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grunnurTexti, hnitAfFangi, thattaFang, veljaForsendur } from '../src/lib/verdmat-gluggi.mjs';

test('þáttar heimilisfang með póstnúmeri', () => {
  assert.deepEqual(thattaFang('Heiðarbraut 12, 230'), { fang: 'heiðarbraut 12', pn: '230' });
  assert.deepEqual(thattaFang('  Heiðarbraut 12   230 '), { fang: 'heiðarbraut 12', pn: '230' });
});

test('án póstnúmers skilar pn null en fellur ekki', () => {
  assert.deepEqual(thattaFang('Heiðarbraut 12'), { fang: 'heiðarbraut 12', pn: null });
  assert.deepEqual(thattaFang(''), { fang: '', pn: null });
  assert.deepEqual(thattaFang(null), { fang: '', pn: null });
});

test('ÞEKKT eign — forsendur koma úr skránni, ekki frá notanda', () => {
  const r = veljaForsendur({ teg: 'Fjölbýli', fm: 96.4, ar: 1998 }, null);
  assert.deepEqual(r, { teg: 'Fjölbýli', fm: 96.4, ar: 1998, fraNotanda: false });
});

test('ÓÞEKKT eign með innslætti notanda skilar forsendum og MERKIR þær', () => {
  const r = veljaForsendur(null, { teg: 'Raðhús', fm: '142', ar: '2004' });
  assert.deepEqual(r, { teg: 'Raðhús', fm: 142, ar: 2004, fraNotanda: true });
});

test('óþekkt eign ÁN innsláttar skilar null, ekki villu', () => {
  assert.equal(veljaForsendur(null, null), null);
  assert.equal(veljaForsendur(null, { teg: 'Fjölbýli', fm: '', ar: '' }), null);
  assert.equal(veljaForsendur(null, { teg: 'Fjölbýli', fm: '4', ar: '2000' }), null, 'fm undir 15 er ekki eign');
});

test('skráð eign án nothæfrar stærðar fellur í notanda-innslátt', () => {
  assert.equal(veljaForsendur({ teg: 'Fjölbýli', fm: 0, ar: 1998 }, null), null);
});

test('byggingarár má vanta — það þrengir bara valið', () => {
  assert.equal(veljaForsendur(null, { teg: 'Fjölbýli', fm: '80', ar: '' }).ar, null);
});

test('forsendutextinn segir SATT um hvaðan stærðin kom', () => {
  const r = { n: 17, arSia: true, radiusKm: 1 };
  assert.match(grunnurTexti(r, '230', true), /sem þú slóst inn/);
  assert.equal(/sem þú slóst inn/.test(grunnurTexti(r, '230', false)), false);
});

test('forsendutextinn nefnir fjölda, póstnúmer og virkar síur', () => {
  const t = grunnurTexti({ n: 17, arSia: true, radiusKm: 1 }, '230', false);
  assert.match(t, /17 sambærilegar/);
  assert.match(t, /230/);
  assert.match(t, /±15 ár/);
  assert.match(t, /1 km/);
});

test('síur sem voru EKKI virkar eru ekki nefndar', () => {
  const t = grunnurTexti({ n: 8, arSia: false, radiusKm: null }, '260', false);
  assert.equal(/±15 ár/.test(t), false);
  assert.equal(/km/.test(t), false);
});

test('⚠ hnit finnast á LÁGSTAFA lykli og eru skilað sem [lat, lon]', () => {
  const hnit = { 'heiðarbraut 12': [63.99, -22.56, 'hverfi', 1, 2, 3] };
  assert.deepEqual(hnitAfFangi(hnit, 'Heiðarbraut 12'), [63.99, -22.56]);
  assert.equal(hnitAfFangi(hnit, 'engin gata 1'), null);
  assert.equal(hnitAfFangi(null, 'heiðarbraut 12'), null);
});
