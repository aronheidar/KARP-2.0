import { test } from 'node:test';
import assert from 'node:assert';
import { ktTolur, erLogadili, felagSlod, felagHref } from '../src/lib/fyrirtaeki-slod.mjs';

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
