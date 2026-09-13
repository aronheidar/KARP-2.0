import { test } from 'node:test';
import assert from 'node:assert';
import { parseLeit, flokkaLeit } from './rsk_leit_parse.mjs';

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
