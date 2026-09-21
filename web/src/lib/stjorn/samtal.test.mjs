import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hreinsaSogu, tillagaHtml, samtalHtml } from './samtal.mjs';

test('samtalHtml: líkans-úttak er ótraust — ekkert HTML kemst í gegn', () => {
  const h = samtalHtml([{ hver: 'sigrun', texti: '<img src=x onerror=alert(1)> og <script>x</script>' }]);
  assert.ok(!h.includes('<img') && !h.includes('<script'));
  assert.ok(h.includes('&lt;img'));
});

test('hreinsaSogu: aðeins þekktir sendendur og strengir, síðustu 12', () => {
  const s = hreinsaSogu([{ hver: 'kerfi', texti: 'x' }, { hver: 'aron', texti: 42 }, { hver: 'aron', texti: '  ' },
    ...Array.from({ length: 20 }, (_, i) => ({ hver: i % 2 ? 'sigrun' : 'aron', texti: 'nr ' + i }))]);
  assert.equal(s.length, 12);
  assert.equal(s[s.length - 1].texti, 'nr 19');
  assert.ok(s.every((m) => m.hver === 'aron' || m.hver === 'sigrun'));
  assert.deepEqual(hreinsaSogu(null), []);
});

test('tillagaHtml: aðeins heiltölu-númer komast inn, efni og ástæða esc-uð', () => {
  const h = tillagaHtml({ adgerd: 'loka', midar: [{ id: 12, efni: 'Innskráning <b>', astaeda: 'svarað fyrir 9 dögum' },
    { id: '7; DROP', efni: 'x' }, { id: -3, efni: 'y' }, { id: 0 }] }, 'a');
  assert.ok(h.includes('data-id="12"'));
  assert.equal((h.match(/data-id=/g) || []).length, 1, 'aðeins eitt gilt númer');
  assert.ok(h.includes('Innskráning &lt;b&gt;'));
});

test('tillagaHtml: óþekkt aðgerð eða tómur listi → ekkert, aldrei tómur hnappur', () => {
  assert.equal(tillagaHtml({ adgerd: 'eyda', midar: [{ id: 1 }] }), '');
  assert.equal(tillagaHtml({ adgerd: 'loka', midar: [] }), '');
  assert.equal(tillagaHtml(null), '');
});

test('samtalHtml: tillaga birtist aðeins á skilaboðum frá henni, ekki Aroni', () => {
  const t = { adgerd: 'loka', midar: [{ id: 5, efni: 'a' }] };
  assert.ok(samtalHtml([{ hver: 'sigrun', texti: 'Þessi má loka.', tillaga: t }]).includes('stj-tillaga'));
  assert.ok(!samtalHtml([{ hver: 'aron', texti: 'x', tillaga: t }]).includes('stj-tillaga'));
});

test('tillagaHtml: túlkun er óhökuð og orð notandans birtast, esc-uð', () => {
  const h = tillagaHtml({ adgerd: 'loka', midar: [
    { id: 1, efni: 'Þögn', astaeda: 'svarað fyrir 9 dögum' },
    { id: 2, efni: 'Þakkir', astaeda: 'notandinn þakkaði fyrir', tilvitnun: 'Takk <b>kærlega</b>', ohakad: true },
  ] }, 'a');
  assert.match(h, /<input type="checkbox" checked data-id="1">/);
  assert.match(h, /<input type="checkbox" data-id="2">/, 'þakkir EKKI hakaðar fyrirfram');
  assert.ok(h.includes('<q>Takk &lt;b&gt;kærlega&lt;/b&gt;</q>'));
});
