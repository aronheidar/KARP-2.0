import { test } from 'node:test';
import assert from 'node:assert';
import { parseLeit, flokkaLeit, parseStakt, teljaRadir } from './rsk_leit_parse.mjs';

// ⚠ ÞRIÐJA síðugerðin: skili leitin NÁKVÆMLEGA einu félagi vísar skatturinn.is beint á
// félagssíðuna — engin leitartafla, engin „Leit eftir …“-lína. Sweepið tók það fyrir
// þrengingu og sat fast á forskeytinu „1b“ í 14+ mínútur (13.9) þótt svarið væri rétt.
const STAKT = `<html><head>
  <link rel="canonical" href="https://www.skatturinn.is/fyrirtaekjaskra/leit/kennitala/7101081880" />
  </head><body><h1>1body ehf. (7101081880)</h1>
  <dl><dt>Númer</dt><dd>…</dd></dl></body></html>`;

// Raunverulegt markúp af www.skatturinn.is/fyrirtaekjaskra/leit?nafn=ölg (sótt 13.9.2026).
const RAUN = `
  <table width="100%">
    <thead><tr><th>Kennitala</th><th>Nafn</th><th>Póstfang</th></tr></thead>
    <tbody>
      <tr class="active">
        <td><a href="/fyrirtaekjaskra/leit/kennitala/5108080960">5108080960</a></td>
        <td>Ölgerð El Grillo ehf
                <em> </em></td>
        <td>Ármúla 36, 108 Reykjavík</td>
      </tr>
      <tr class="active">
        <td><a href="/fyrirtaekjaskra/leit/kennitala/6801260110">6801260110</a></td>
        <td>Ölgerðin Egill Skallagrímss ehf
                <em> </em></td>
        <td>Grjóthálsi 7-11, 110 Reykjavík</td>
      </tr>
    </tbody>
  </table>`;

test('þáttar kt, nafn og póstfang úr niðurstöðutöflu', () => {
  const r = parseLeit(RAUN);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { kt: '5108080960', nafn: 'Ölgerð El Grillo ehf', postfang: 'Ármúla 36, 108 Reykjavík', merki: '' });
  assert.equal(r[1].nafn, 'Ölgerðin Egill Skallagrímss ehf');
  assert.equal(r[1].kt, '6801260110');
});

test('hausaröðin (engin kennitala) telst ekki með', () => {
  assert.equal(parseLeit('<tr><th>Kennitala</th><th>Nafn</th></tr>').length, 0);
});

test('tómt/ógilt innlegg skilar tómum lista', () => {
  for (const x of ['', null, undefined, '<html><body>Engar niðurstöður</body></html>']) {
    assert.deepEqual(parseLeit(x), []);
  }
});

test('merki í <em> er lesið sér og haldið utan nafnsins', () => {
  const h = `<tr><td><a href="/fyrirtaekjaskra/leit/kennitala/4905220500">4905220500</a></td>
             <td>Dæmi ehf<em>afskráð</em></td><td>Brunnstíg 2, 230 Reykjanesbær</td></tr>`;
  const [r] = parseLeit(h);
  assert.equal(r.nafn, 'Dæmi ehf');
  assert.equal(r.merki, 'afskráð');
});

test('HTML-einingar afkóðaðar í nafni og póstfangi', () => {
  const h = `<tr><td><a href="/fyrirtaekjaskra/leit/kennitala/4905220500">4905220500</a></td>
             <td>Ben &amp; J&oacute;n ehf<em> </em></td><td>Skeifan 3&nbsp;b, 108 Reykjav&iacute;k</td></tr>`;
  const [r] = parseLeit(h);
  assert.equal(r.nafn, 'Ben & Jón ehf');
  assert.equal(r.postfang, 'Skeifan 3 b, 108 Reykjavík');
});

test('röð án póstfangs fellur ekki á gólfið', () => {
  const h = `<tr><td><a href="/fyrirtaekjaskra/leit/kennitala/4905220500">4905220500</a></td><td>Dæmi ehf</td></tr>`;
  const [r] = parseLeit(h);
  assert.equal(r.nafn, 'Dæmi ehf');
  assert.equal(r.postfang, '');
});

test('aðeins lögaðila-kennitölur skila sér (einstaklingar síaðir burt)', () => {
  const h = `<tr><td><a href="/fyrirtaekjaskra/leit/kennitala/1203894569">1203894569</a></td><td>Einstaklingur</td></tr>`;
  assert.deepEqual(parseLeit(h), []);
});

// ⚠ Mettunarprófið MÁ EKKI nota lögaðila-síaða talningu: skili leitin 100 röðum þar sem
// hluti eru einstaklingar lítur forskeytið út fyrir að vera ómettað, dýpkunin stöðvast og
// öll greinin undir því tapast þögult. teljaRadir telur ÓSÍAÐ.
test('teljaRadir telur allar niðurstöðuraðir, líka einstaklinga', () => {
  const rod = (kt, nafn) => `<tr><td><a href="/fyrirtaekjaskra/leit/kennitala/${kt}">${kt}</a></td><td>${nafn}</td><td>X</td></tr>`;
  const html = rod('4905220500', 'Dæmi ehf') + rod('1203894569', 'Jón Jónsson') + rod('5509110940', 'Slæging ehf');
  assert.equal(teljaRadir(html), 3, 'allar raðir eiga að teljast');
  assert.equal(parseLeit(html).length, 2, 'aðeins lögaðilar skila sér í gögnin');
});

test('teljaRadir telur hverja kt einu sinni og hunsar hausinn', () => {
  const rod = `<tr><td><a href="/fyrirtaekjaskra/leit/kennitala/4905220500">x</a></td><td>Dæmi ehf</td></tr>`;
  assert.equal(teljaRadir('<tr><th>Kennitala</th></tr>' + rod + rod), 1);
  assert.equal(teljaRadir(''), 0);
  assert.equal(teljaRadir(null), 0);
});

test('tvítekin kt skilar sér einu sinni', () => {
  const rad = `<tr><td><a href="/fyrirtaekjaskra/leit/kennitala/4905220500">4905220500</a></td><td>Dæmi ehf</td><td>X</td></tr>`;
  assert.equal(parseLeit(rad + rad).length, 1);
});

// ⚠ ÞETTA er munurinn sem stöðvaði sweepið: forskeyti sem á engin félög (t.d. "ð" eftir
// lögaðila-síun) leit út NÁKVÆMLEGA eins og þrenging, svo skriptan beið að óþægju eftir
// glugga sem var aldrei lokaður. Síðan segir sjálf hvort er — nýtum það.
test('flokkaLeit greinir treff frá raunverulega tómri leit og frá þrengingu', () => {
  assert.equal(flokkaLeit('<p>Leit eftir „ð“ skilaði eftirfarandi niðurstöðum. Smelltu á kennitölu…</p>'), 'nidurstodur');
  assert.equal(flokkaLeit('<p>Leit eftir „qzqzqz“ skilaði engri niðurstöðu</p>'), 'tomt');
  assert.equal(flokkaLeit('<html><body>Eitthvað allt annað</body></html>'), 'obrugdid');
  assert.equal(flokkaLeit(''), 'obrugdid');
  assert.equal(flokkaLeit(null), 'obrugdid');
});

test('flokkaLeit þolir HTML-einingar í skilaboðunum', () => {
  assert.equal(flokkaLeit('<p>Leit eftir &bdquo;x&ldquo; skila&eth;i engri ni&eth;urst&ouml;&eth;u</p>'), 'tomt');
  assert.equal(flokkaLeit('<p>skila&eth;i eftirfarandi ni&eth;urst&ouml;&eth;um.</p>'), 'nidurstodur');
});

test('flokkaLeit lætur línuskil og aukabil ekki rugla sig', () => {
  assert.equal(flokkaLeit('<p>\n   skilaði\n   engri\n   niðurstöðu\n</p>'), 'tomt');
});

test('flokkaLeit þekkir stöku félagssíðuna sem leitin vísaði á', () => {
  assert.equal(flokkaLeit(STAKT), 'stakt');
});

test('parseStakt les nafn og kt úr félagssíðunni', () => {
  assert.deepEqual(parseStakt(STAKT), { kt: '7101081880', nafn: '1body ehf.', postfang: '', merki: '' });
});

test('parseStakt þolir nafn með svigum og einingum', () => {
  const h = `<h1>Ben &amp; J&oacute;n (eldri) ehf. (4905220500)</h1>`;
  assert.deepEqual(parseStakt(h), { kt: '4905220500', nafn: 'Ben & Jón (eldri) ehf.', postfang: '', merki: '' });
});

test('parseStakt hafnar einstaklings-kt og rusli', () => {
  assert.equal(parseStakt('<h1>Jón Jónsson (1203894569)</h1>'), null);
  assert.equal(parseStakt('<h1>Engin kennitala hér</h1>'), null);
  assert.equal(parseStakt(''), null);
  assert.equal(parseStakt(null), null);
});

test('leitartafla er ALDREI flokkuð sem stök félagssíða', () => {
  // Félagssíðan hefur enga <th>Kennitala</th>; niðurstöðutaflan hefur hana alltaf.
  const medTeflu = '<h1>Eitthvað ehf. (4905220500)</h1><table><thead><tr><th>Kennitala</th></tr></thead></table>';
  assert.notEqual(flokkaLeit(medTeflu), 'stakt');
});
