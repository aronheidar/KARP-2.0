import test from 'node:test';
import assert from 'node:assert/strict';
import { vikuForgangur, adgerdFyrir, atburdarLina, ADGERDIR, DIGEST_FYRIRVARI } from './kyc-digest.mjs';

const W = [{ kt: '1111111111', nafn: 'Alfa ehf.' }, { kt: '2222222222', nafn: 'Beta hf.' }, { kt: '3333333333', nafn: 'Gamma ehf.' }];
const ev = (kt, kind, severity, at = 100, ack = 'open') => ({ kt, kind, severity, detail_json: '{}', detected_at: at, ack });

test('critical-félag raðast EFST — óháð innsetningarröð', () => {
  const r = vikuForgangur(W, [ev('2222222222', 'board_change', 'info'), ev('3333333333', 'sanctions_hit', 'critical'), ev('1111111111', 'filing_default', 'high')]);
  assert.deepEqual(r.radad.map((x) => x.nafn), ['Gamma ehf.', 'Alfa ehf.', 'Beta hf.']);
  assert.equal(r.radad[0].severity, 'critical');
});

test('„N án breytinga" telur rétt — hún er sjálf skjalfesting samfelldrar vöktunar', () => {
  const r = vikuForgangur(W, [ev('1111111111', 'adverse_fatf', 'critical')]);
  assert.equal(r.obreytt, 2);
  assert.equal(r.n, 3);
  assert.equal(r.radad.length, 1);
});

test('innan félags: alvarlegasti atburður fyrst, svo nýjastur', () => {
  const r = vikuForgangur([W[0]], [ev('1111111111', 'board_change', 'info', 500), ev('1111111111', 'bankruptcy', 'critical', 100), ev('1111111111', 'filing_default', 'high', 300)]);
  assert.deepEqual(r.radad[0].atburdir.map((a) => a.kind), ['bankruptcy', 'filing_default', 'board_change']);
});

test('hver atburður ber FASTA aðgerðatillögu — ókunn tegund fær almenna, aldrei tóma', () => {
  const r = vikuForgangur([W[0]], [ev('1111111111', 'adverse_fatf', 'critical')]);
  assert.equal(r.radad[0].atburdir[0].adgerd, ADGERDIR.adverse_fatf);
  assert.ok(adgerdFyrir('splunkuny_tegund').length > 10);
});

test('atburðalínur eru læsilegar og hrynja ekki á brengluðu detail_json', () => {
  assert.match(atburdarLina({ kind: 'adverse_fatf', detail_json: '{"flokkur":"peningathvaetti","title":"Frétt X"}' }), /Peningaþvætti/);
  assert.match(atburdarLina({ kind: 'bankruptcy', detail_json: 'EKKI JSON' }), /gjaldþrota/);
  assert.equal(atburdarLina({ kind: 'okunn_tegund', detail_json: '{}' }), 'okunn_tegund');
});

test('fleiri en 6 atburðir skerast með teljara — digestið á að vera læsilegt, ekki tæmandi', () => {
  const evs = Array.from({ length: 9 }, (_, i) => ev('1111111111', 'board_change', 'info', i));
  const r = vikuForgangur([W[0]], evs);
  assert.equal(r.radad[0].atburdir.length, 6);
  assert.equal(r.radad[0].fleiri, 3);
});

test('fyrirvarinn er til og segir að endanlegt mat sé hjá tilkynningarskylda aðilanum', () => {
  assert.match(DIGEST_FYRIRVARI, /tilkynningarskylda/);
});
