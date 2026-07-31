import test from 'node:test';
import assert from 'node:assert/strict';
import { outletBias } from './midlavog.mjs';

const c = (source, entity, n, tone) => ({ source, entity, n, tone });
// 6 efni svo miðlar standist minEntities=5
const EFNI = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];

test('KJARNINN: efnisval skekkir EKKI vogina (íþróttamiðill vs sakamálamiðill)', () => {
  // A fjallar bara um jákvætt efni, B bara um neikvætt — EN báðir hlutlausir innan síns efnis.
  // Hrár tónn er himinn og haf, en LEIÐRÉTT vog á að vera ~0 hjá báðum.
  const cells = [];
  for (const e of EFNI) {
    cells.push(c('Íþróttir', 'jak-' + e, 10, 0.8), c('Hlutlaus', 'jak-' + e, 10, 0.8));
    cells.push(c('Sakamál', 'neik-' + e, 10, -0.8), c('Hlutlaus2', 'neik-' + e, 10, -0.8));
  }
  const r = outletBias(cells);
  const ith = r.outlets.find((x) => x.s === 'Íþróttir');
  const sak = r.outlets.find((x) => x.s === 'Sakamál');
  assert.equal(ith.bias, 0, 'leiðrétt vog á að vera 0');
  assert.equal(sak.bias, 0, 'leiðrétt vog á að vera 0');
  assert.equal(ith.rawTone, 80);    // hrár tónn sýnir efnisvalið
  assert.equal(sak.rawTone, -80);
  assert.ok(ith.rawTone - sak.rawTone === 160, 'hrár munur er 160 stig — en það er EKKI hlutdrægni');
});

test('raunveruleg hlutdrægni mælist: sami miðill jákvæðari um SÖMU efni', () => {
  const cells = [];
  for (const e of EFNI) {
    cells.push(c('Jákvæði', e, 10, 0.5), c('Miðja', e, 10, 0), c('Neikvæði', e, 10, -0.5));
  }
  const r = outletBias(cells);
  const j = r.outlets.find((x) => x.s === 'Jákvæði');
  const m = r.outlets.find((x) => x.s === 'Miðja');
  const n = r.outlets.find((x) => x.s === 'Neikvæði');
  assert.ok(j.bias > 30, 'jákvæði miðillinn: ' + j.bias);
  assert.equal(m.bias, 0);
  assert.ok(n.bias < -30, 'neikvæði miðillinn: ' + n.bias);
});

test('efni sem AÐEINS einn miðill fjallar um telst ekki með (ekkert til að bera við)', () => {
  const cells = [];
  for (const e of EFNI) cells.push(c('A', e, 5, 0.2), c('B', e, 5, 0.2));
  cells.push(c('A', 'einkamal', 50, 1));      // enginn annar fjallar um þetta
  const r = outletBias(cells);
  assert.equal(r.entities, 6, 'aðeins sameiginlegu efnin teljast');
  assert.equal(r.outlets.find((x) => x.s === 'A').bias, 0, 'einkamálið má ekki lyfta voginni');
});

test('of fáar fréttir í frumu eru síaðar burt (hávaðavörn)', () => {
  const cells = [];
  for (const e of EFNI) cells.push(c('A', e, 10, 0), c('B', e, 10, 0));
  cells.push(c('C', EFNI[0], 1, 1));           // 1 frétt → undir minCell
  const r = outletBias(cells);
  assert.equal(r.outlets.find((x) => x.s === 'C'), undefined);
});

test('miðill með of fá ólík efni er ekki birtur (vog byggð á einu máli)', () => {
  const cells = [];
  for (const e of EFNI) cells.push(c('A', e, 10, 0), c('B', e, 10, 0));
  cells.push(c('Lítill', EFNI[0], 20, 1), c('Lítill', EFNI[1], 20, 1));   // aðeins 2 efni
  const r = outletBias(cells);
  assert.equal(r.outlets.find((x) => x.s === 'Lítill'), undefined);
});

test('efnis-meðaltal er VEGIÐ (stór miðill ræður meiru en örsmár)', () => {
  // A: 100 fréttir tónn 0 · B: 3 fréttir tónn 1 → meðaltal á að liggja nærri 0, ekki 0,5
  const cells = [];
  for (const e of EFNI) { cells.push(c('A', e, 100, 0), c('B', e, 3, 1)); }
  const r = outletBias(cells);
  const a = r.outlets.find((x) => x.s === 'A');
  assert.ok(Math.abs(a.bias) <= 3, 'stóri miðillinn á að vera nálægt 0: ' + a.bias);
});

test('sample sýnir efnin þar sem frávikið er mest', () => {
  const cells = [];
  for (const e of EFNI) cells.push(c('A', e, 10, 0), c('B', e, 10, 0));
  cells[0] = c('A', EFNI[0], 10, 1);            // A mjög jákvæður um e1
  const r = outletBias(cells);
  const a = r.outlets.find((x) => x.s === 'A');
  assert.equal(a.sample[0].entity, EFNI[0]);
  assert.ok(a.sample[0].dev > 0);
});

test('tómt/rusl-inntak hrynur ekki', () => {
  assert.deepEqual(outletBias([]).outlets, []);
  assert.deepEqual(outletBias(null).outlets, []);
  assert.deepEqual(outletBias([{ source: 'A' }, null]).outlets, []);
});
