import { test } from 'node:test';
import assert from 'node:assert';
import { ktTolur, erLogadili, felagSlod, felagHref, HOLF as HOLF_ALL, stafHolf as stafHolf_ } from '../src/lib/fyrirtaeki-slod.mjs';

test('ktTolur hreinsar bandstrik og bil', () => {
  assert.equal(ktTolur('550911-0940'), '5509110940');
  assert.equal(ktTolur(' 550911 0940 '), '5509110940');
  assert.equal(ktTolur(5509110940), '5509110940');
  assert.equal(ktTolur(null), '');
  assert.equal(ktTolur(undefined), '');
});

test('erLogadili: 41–71 í fyrstu tveimur = lögaðili', () => {
  assert.equal(erLogadili('4905220500'), true);
  assert.equal(erLogadili('550911-0940'), true);   // bandstrik breytir engu
  assert.equal(erLogadili('4102070600'), true);    // neðri mörk (41)
  assert.equal(erLogadili('7112345678'), true);    // efri mörk (71)
});

test('erLogadili: einstaklings-kt og rusl hafnað', () => {
  assert.equal(erLogadili('1203894569'), false);   // fæðingardagur 12 → einstaklingur
  assert.equal(erLogadili('3112894569'), false);   // 31 → einstaklingur
  assert.equal(erLogadili('7212345678'), false);   // 72 > 71
  assert.equal(erLogadili('4012345678'), false);   // 40 < 41
  assert.equal(erLogadili('12345'), false);        // of stutt
  assert.equal(erLogadili('Sandholt ehf.'), false);
  assert.equal(erLogadili(''), false);
  assert.equal(erLogadili(null), false);
});

test('felagSlod skilar hreinni prófílslóð fyrir lögaðila', () => {
  assert.equal(felagSlod('4905220500'), '/fyrirtaeki/4905220500/');
  assert.equal(felagSlod('490522-0500'), '/fyrirtaeki/4905220500/');   // normaliserað
});

test('felagSlod skilar null þegar kt dugar ekki', () => {
  assert.equal(felagSlod('1203894569'), null);
  assert.equal(felagSlod('Sandholt ehf.'), null);
  assert.equal(felagSlod(null), null);
});

test('felagSlod ber viðmót áfram sem fyrirspurn', () => {
  assert.equal(felagSlod('4905220500', { vidmot: 'areidanleiki' }), '/fyrirtaeki/4905220500/?vidmot=areidanleiki');
});

test('felagHref: lögaðili → prófíll, annað → leitarsíðan', () => {
  assert.equal(felagHref('4905220500'), '/fyrirtaeki/4905220500/');
  assert.equal(felagHref('Sandholt ehf.'), '/fyrirtaeki/?q=Sandholt%20ehf.');
  assert.equal(felagHref('1203894569'), '/fyrirtaeki/?q=1203894569');
  assert.equal(felagHref(''), '/fyrirtaeki/');
  assert.equal(felagHref(null), '/fyrirtaeki/');
});

test('felagHref: viðmót fylgir báðum leiðum', () => {
  assert.equal(felagHref('4905220500', { vidmot: 'areidanleiki' }), '/fyrirtaeki/4905220500/?vidmot=areidanleiki');
  assert.equal(felagHref('Sandholt ehf.', { vidmot: 'areidanleiki' }), '/fyrirtaeki/?q=Sandholt%20ehf.&vidmot=areidanleiki');
});

test('felagHref sleppir tómri fyrirspurn í stað ?q=', () => {
  assert.equal(felagHref(undefined, { vidmot: 'areidanleiki' }), '/fyrirtaeki/?vidmot=areidanleiki');
});

// felagaskra.json knýr BÆÐI /fyrirtaeki/skra/ og sitemap-fyrirtaeki.xml. Rusl þar
// yrði að munaðarlausum 404-tenglum í sitemap — ódýrt að verja það hér.
test('felagaskra.json: aðeins lögaðilar, engin tvítekning, öll með nafn', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const slod = new URL('../../gogn/felagaskra.json', import.meta.url);
  if (!existsSync(slod)) return;   // CI-byggð; ekki fella prófin í fersku tré
  const skra = JSON.parse(readFileSync(slod, 'utf8'));
  const felog = skra.felog || [];
  assert.ok(felog.length > 0, 'felagaskra.json er tóm');
  const rangKt = felog.filter((f) => !erLogadili(f.kt));
  assert.equal(rangKt.length, 0, 'kt sem eru ekki lögaðilar: ' + JSON.stringify(rangKt.slice(0, 3)));
  const nafnlaus = felog.filter((f) => !f.nafn || !String(f.nafn).trim());
  assert.equal(nafnlaus.length, 0, 'félög án nafns: ' + JSON.stringify(nafnlaus.slice(0, 3)));
  assert.equal(new Set(felog.map((f) => f.kt)).size, felog.length, 'tvítekin kt í skránni');
  assert.equal(skra.alls, felog.length, 'alls-talan stemmir ekki við fjölda færslna');
  // Hvert félag verður að lenda í hólfi sem [staf].astro byggir raunverulega síðu fyrir.
  for (const f of felog) assert.ok(HOLF_ALL.includes(stafHolf_(f.nafn)), 'ekkert hólf fyrir: ' + f.nafn);
});

// ⚠ Reklsvörn: þrjár síður inline-a felagHref af því define:vars slekkur á bundlingu.
// Hér er spegillinn LESINN úr síðunum sjálfum, keyrður og borinn saman við eininguna.
test('inline-speglar felagHref í define:vars-skriftum haldast í takt við eininguna', async () => {
  const { readFileSync } = await import('node:fs');
  const SIDUR = ['logbirting.astro', 'loftfor.astro', 'eftirlit-byggingar.astro'];
  const SYNI = ['4905220500', '550911-0940', '4102070600', '7112345678', '1203894569', '7212345678', 'Sandholt ehf.', '', null];
  for (const s of SIDUR) {
    const txt = readFileSync(new URL('../src/pages/' + s, import.meta.url), 'utf8');
    const lina = txt.split('\n').find((l) => l.trim().startsWith('const felagHref = (kt) =>'));
    assert.ok(lina, s + ': inline-spegill felagHref fannst ekki — var hann fjarlægður eða endurnefndur?');
    const speglad = new Function(lina.trim() + ' return felagHref;')();
    for (const inn of SYNI) {
      assert.equal(speglad(inn), felagHref(inn), s + ': spegill og eining ósammála um ' + JSON.stringify(inn));
    }
  }
});

test('stafhólf: flokkun fyrir /fyrirtaeki/skra/', async () => {
  const { stafHolf, HOLF } = await import('../src/lib/fyrirtaeki-slod.mjs');
  assert.equal(stafHolf('Sandholt ehf.'), 's');
  assert.equal(stafHolf('Össur hf.'), 'oe');         // Ö = sérstakur bókstafur í íslenskri stafrófsröð
  assert.equal(stafHolf('Árvakur hf.'), 'a');        // Á fellur í a (annars tugir örhólfa)
  assert.equal(stafHolf('Þórsberg ehf.'), 'th');
  assert.equal(stafHolf('Ægir ehf.'), 'ae');
  assert.equal(stafHolf('Ðurr'), 'd');
  assert.equal(stafHolf('101 Hótel ehf.'), '0-9');
  assert.equal(stafHolf(''), 'annad');
  assert.equal(stafHolf('—'), 'annad');
  assert.ok(HOLF.includes('th') && HOLF.includes('0-9') && HOLF.length > 26);
});
