import { test } from 'node:test';
import assert from 'node:assert';
import { felagTitill, TITILL_HAM } from '../src/lib/felag-titill.mjs';

const lengd = (s) => [...s].length;

test('stuttur nafn fær kennitölu, lýsingu og merki — og kemst fyrir', () => {
  const t = felagTitill('Slæging ehf.', '5509110940');
  assert.ok(t.startsWith('Slæging ehf.'), 'nafnið verður að standa fremst: ' + t);
  assert.ok(t.includes('550911-0940'), 'kennitalan á að fylgja þegar pláss er: ' + t);
  assert.ok(lengd(t) <= TITILL_HAM, `${lengd(t)} > ${TITILL_HAM}: ${t}`);
});

// ⚠ Markið er ≤60 NEMA nafnið sjálft sé lengra: þá stendur nafnið eitt og óklippt.
// Klippt heiti í miðju orði lítur út fyrir að vera bilun og svarar ekki fyrirspurninni;
// langur titill er einfaldlega styttur í birtingu hjá Google og heldur samt samsvöruninni.
test('ALLIR titlar halda sig innan marka — líka löngustu raunnöfnin', () => {
  const nofn = [
    'Slæging ehf.',
    'Ölgerðin Egill Skallagrímss ehf',
    'Knattspyrnudómarasamband Íslands',
    'Lóðafélag Bakkasels 19-35',
    'Hjálparsveit skáta í Reykjavík og nágrenni sameinuð ses.',
    'Samband íslenskra sveitarfélaga og landshlutasamtaka byggðarlaga hf.',
    'A',
  ];
  for (const n of nofn) {
    const t = felagTitill(n, '5509110940');
    const mork = Math.max(TITILL_HAM, lengd(n));
    assert.ok(lengd(t) <= mork, `${lengd(t)} > ${mork}: ${t}`);
    assert.ok(t.startsWith(n.slice(0, 8)), 'nafnið á alltaf að byrja titilinn: ' + t);
  }
});

test('nafnið er ALDREI stytt — heldur er hinu sleppt', () => {
  const langt = 'Samband íslenskra sveitarfélaga og landshlutasamtaka byggðarlaga hf.';
  const t = felagTitill(langt, '5509110940');
  assert.equal(t, langt, 'nafn sem fyllir markið á að standa eitt og óklippt');
  assert.ok(!t.includes('…'), 'engin klipping á nafni');
});

test('þrepin falla í réttri forgangsröð eftir því sem nafnið lengist', () => {
  const kt = '5509110940';
  const stutt = felagTitill('Afl sf', kt);
  const midlungs = felagTitill('Knattspyrnudómarasamband Íslands', kt);
  const langt = felagTitill('Hjálparsveit skáta í Reykjavík og nágrenni sameinuð ses.', kt);
  assert.ok(stutt.includes('ársreikningur'), 'stutt nafn á að fá lýsinguna: ' + stutt);
  assert.ok(midlungs.includes('550911-0940'), 'miðlungsnafn á að halda kennitölunni: ' + midlungs);
  assert.ok(!midlungs.includes('ársreikningur'), 'lýsingin á að víkja á undan kennitölunni: ' + midlungs);
  assert.ok(!langt.includes('550911-0940'), 'kennitalan á að víkja fyrir löngu nafni: ' + langt);
});

test('merkið „| Karp“ víkur á undan nafninu en á eftir lýsingunni', () => {
  const t = felagTitill('Afl sf', '5509110940');
  assert.ok(t.endsWith('| Karp'), 'stutt nafn á að enda á merkinu: ' + t);
});

test('ógild eða vantandi kennitala fellir ekki titilinn', () => {
  for (const kt of [null, undefined, '', 'rusl', '123']) {
    const t = felagTitill('Afl sf', kt);
    assert.ok(t.startsWith('Afl sf'), 'nafnið stendur: ' + t);
    assert.ok(!t.includes('('), 'engin tóm svigapör: ' + t);
    assert.ok(lengd(t) <= TITILL_HAM);
  }
});

test('kennitala er snidin með bandstriki', () => {
  assert.ok(felagTitill('Afl sf', '5509110940').includes('550911-0940'));
  assert.ok(felagTitill('Afl sf', '550911-0940').includes('550911-0940'), 'þolir að fá hana þegar snidna');
});

test('tómt nafn skilar nothæfum titli en aldrei tómum', () => {
  for (const n of [null, undefined, '', '   ']) {
    const t = felagTitill(n, '5509110940');
    assert.ok(t.length > 0, 'titill má aldrei vera tómur');
    assert.ok(lengd(t) <= TITILL_HAM);
  }
});

test('nafn sem eitt og sér sprengir markið stendur heilt — ekkert annað fylgir', () => {
  const of_langt = 'Samband íslenskra sveitarfélaga og landshlutasamtaka byggðarlaga hf.';
  assert.ok(lengd(of_langt) > TITILL_HAM, 'prófgagnið verður að vera lengra en markið');
  const t = felagTitill(of_langt, '5509110940');
  assert.equal(t, of_langt);
  assert.ok(!t.includes('|') && !t.includes('('), 'ekkert má hengjast aftan á: ' + t);
});

test('bil eru snyrt — engin tvöföld bil eða hangandi skiltákn', () => {
  const t = felagTitill('  Afl sf  ', '5509110940');
  assert.ok(!/\s{2}/.test(t), 'tvöfalt bil: ' + JSON.stringify(t));
  assert.ok(!/[—|·]\s*$/.test(t), 'hangandi skiltákn: ' + JSON.stringify(t));
  assert.equal(t, t.trim());
});
