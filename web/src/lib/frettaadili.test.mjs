import test from 'node:test';
import assert from 'node:assert/strict';
import { adiliSlug, findAdili, adiliTerms, adiliPageData, adiliDesc, umMynd, skyldirAdilar } from './frettaadili.mjs';

const NOW = 1800000000;
const it = (title, source, sent, daysAgo = 5) => ({ title, url: 'https://x/' + title, source, sent, ts: NOW - daysAgo * 86400, date: '2026-07-01' });
const LIST = [{ n: 'Evrópusambandið', a: ['ESB', 'Evrópusambandsins'] }, { n: 'Brim hf.', a: [] }];

test('slug meðhöndlar íslenska stafi (þ/ð/ö/æ) svo slóðin sé nothæf', () => {
  assert.equal(adiliSlug('Evrópusambandið'), 'evropusambandid');
  assert.equal(adiliSlug('Þórdís Kolbrún'), 'thordis-kolbrun');
  assert.equal(adiliSlug('Ölgerðin'), 'olgerdin');
});

test('findAdili finnur aðila og er ónæmt fyrir hástöfum', () => {
  assert.equal(findAdili('evropusambandid', LIST).n, 'Evrópusambandið');
  assert.equal(findAdili('EVROPUSAMBANDID', LIST).n, 'Evrópusambandið');
});

test('findAdili skilar null fyrir ÓÞEKKTAN slug (engar ruslsíður fyrir leitarvélar)', () => {
  assert.equal(findAdili('eitthvad-rugl', LIST), null);
  assert.equal(findAdili('', LIST), null);
  assert.equal(findAdili('x', null), null);
});

test('adiliTerms sameinar nafn og samheiti án tvítekninga', () => {
  const t = adiliTerms(LIST[0]);
  assert.ok(t.includes('Evrópusambandið') && t.includes('ESB'));
  assert.equal(new Set(t).size, t.length);
});

test('adiliTerms sleppir of stuttum orðum (of víð leit)', () => {
  assert.deepEqual(adiliTerms({ n: 'AB', a: ['AB', 'Gott nafn'] }), ['Gott nafn']);
});

test('adiliPageData reiknar miðla, tímalínu og einkunn', () => {
  const items = [it('a', 'RÚV', 1), it('b', 'RÚV', -1), it('c', 'Vísir', 0)];
  const d = adiliPageData(items, { now: NOW });
  assert.equal(d.n, 3);
  assert.deepEqual(d.sources[0], { s: 'RÚV', n: 2 });
  assert.equal(d.timeline.length, 1);
  assert.equal(d.nyjast.length, 3);
});

test('nyjast er í RÉTTRI tímaröð (nýjast fyrst)', () => {
  const d = adiliPageData([it('gamalt', 'A', 0, 40), it('nytt', 'A', 0, 1)], { now: NOW });
  assert.equal(d.nyjast[0].title, 'nytt');
});

test('tómt safn hrynur ekki og gefur enga falska einkunn', () => {
  const d = adiliPageData([], { now: NOW });
  assert.equal(d.n, 0);
  assert.equal(d.ordspor.score, null);
  assert.deepEqual(d.sources, []);
});

test('lýsingin er UPPLÝSANDI (inniheldur tölur), ekki almennt orðalag', () => {
  const d = adiliPageData([it('a', 'RÚV', 1), it('b', 'RÚV', 1)], { now: NOW });
  const desc = adiliDesc('Brim hf.', d);
  assert.match(desc, /2 fréttir um Brim hf\./);
  assert.match(desc, /orðspors-einkunn/);
  assert.ok(desc.length <= 200, 'meta description má ekki vera of löng: ' + desc.length);
});

test('lýsing án gagna er samt gild', () => {
  assert.match(adiliDesc('X', adiliPageData([], { now: NOW })), /Fréttaumfjöllun um X/);
});

test('nöfn með greini beygjast í þolfall — „um Seðlabankinn" er rangt mál', () => {
  assert.equal(umMynd('Seðlabankinn'), 'Seðlabankann');
  assert.equal(umMynd('Landspítalinn'), 'Landspítalann');
  assert.equal(umMynd('Skatturinn'), 'Skattinn');
  assert.equal(umMynd('Vegagerðin'), 'Vegagerðina');
  assert.equal(umMynd('Síminn'), 'Símann');
  assert.equal(umMynd('Ölgerðin'), 'Ölgerðina');
});

test('skýr mynd (t.d. úr malefni.json) gengur framar töflunni', () => {
  assert.equal(umMynd('Verðbólga', 'verðbólgu'), 'verðbólgu');
  assert.equal(umMynd('Síminn', 'Símann sjálfan'), 'Símann sjálfan');
});

test('ÓÞEKKT nöfn haldast ÓBREYTT — mannanöfn mega ALDREI rangbeygjast', () => {
  // Katrín/Kristín enda eins og nöfn með greini (Vegagerðin) — sjálfvirk endinga-regla
  // myndi búa til „um Katrína". Þess vegna er tafla, ekki regla.
  assert.equal(umMynd('Katrín Jakobsdóttir'), 'Katrín Jakobsdóttir');
  assert.equal(umMynd('Kristín'), 'Kristín');
  assert.equal(umMynd('Marel'), 'Marel');
  assert.equal(umMynd('Samkeppniseftirlitið'), 'Samkeppniseftirlitið');  // hvorugkyn: nf. = þf.
});

test('umMynd þolir tómt/ógilt inntak', () => {
  assert.equal(umMynd(''), '');
  assert.equal(umMynd(null), '');
  assert.equal(umMynd('Síminn', '   '), 'Símann');
});

// ── skyldirAdilar: innri tenging (síðurnar voru munaðarlausar) ───────────────
const LISTI = [
  { n: 'A', slug: 'a', f: 'X' }, { n: 'B', slug: 'b', f: 'X' }, { n: 'C', slug: 'c', f: 'Y' },
  { n: 'D', slug: 'd' }, { n: 'E', slug: 'e' }, { n: 'F', slug: 'f' },
];

test('flokks-systkini koma fyrst — gagnlegra lesanda', () => {
  const s = skyldirAdilar(LISTI[0], LISTI, 3).map((x) => x.slug);
  assert.equal(s[0], 'b', 'sami flokkur (X) á að vera fremst');
  assert.equal(s.length, 3);
});

test('HVER aðili fær tengla — líka flokkslausir (annars héldust þeir munaðarlausir)', () => {
  for (const a of LISTI) {
    const s = skyldirAdilar(a, LISTI, 4);
    assert.ok(s.length > 0, a.slug + ' fékk enga tengla');
    assert.ok(!s.some((x) => x.slug === a.slug), a.slug + ' tengir á sjálfan sig');
    assert.equal(new Set(s.map((x) => x.slug)).size, s.length, 'tvítekið í ' + a.slug);
  }
});

test('HVER aðili fær líka INN-hlekk — nágrannahringurinn lokar netinu', () => {
  const innhlekkir = new Map(LISTI.map((a) => [a.slug, 0]));
  for (const a of LISTI) for (const x of skyldirAdilar(a, LISTI, 4)) innhlekkir.set(x.slug, innhlekkir.get(x.slug) + 1);
  for (const [slug, n] of innhlekkir) assert.ok(n > 0, slug + ' fær engan inn-hlekk — er enn munaðarlaus');
});

test('ókunnur aðili og tómur listi hrynja ekki', () => {
  assert.deepEqual(skyldirAdilar({ slug: 'zzz' }, LISTI), []);
  assert.deepEqual(skyldirAdilar(LISTI[0], []), []);
  assert.deepEqual(skyldirAdilar(null, LISTI), []);
});
