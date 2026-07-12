import { test } from 'node:test';
import assert from 'node:assert';
import { eigNorm, personKey, rskErFyrirtaeki, parseLegalEntity, parseEigendur } from './rsk_parse.mjs';

test('rskErFyrirtaeki: day 41-71 = company, 01-31 = person', () => {
  assert.equal(rskErFyrirtaeki('5920190799'), true);   // day 59
  assert.equal(rskErFyrirtaeki('1201743509'), false);  // day 12
});

test('personKey: kt when known, else nm:norm|faeding', () => {
  assert.equal(personKey({ kt: '1201743509' }), '1201743509');
  assert.equal(personKey({ nafn: 'Jón Á. Jónsson', faeding: '1970' }), 'nm:jon a jonsson|1970');
});

test('parseLegalEntity: PascalCase API → felag + folk + hlutverk + discovered', () => {
  const api = {
    Name: 'Rót ehf.', NationalId: '5920190799', Status: 'Virk skráning',
    Registered: '2001-04-03T00:00:00', LegalForm: { Name: 'Einkahlutafélag' },
    Deregistration: { Bankrupcy: false, Insolvency: false },
    ArticlesOfAssociation: { ShareCapital: 500000, ShareCapitalCurrency: 'ISK' },
    ActivityCode: [{ Id: '62.01', Name: 'Forritun' }],
    Relationships: [
      { Name: 'Anna Ansdóttir', NationalId: '1201743509', Type: 'Stjórn', Position: 'Stjórnarformaður' },
      { Name: 'Beta ehf.', NationalId: '4808221610', Type: 'Móðurfélag' },
      { Name: 'Endurskoðandi Inc', NationalId: '2201743019', Type: 'Endurskoðandi' },
    ],
  };
  const r = parseLegalEntity('5920190799', api);
  assert.equal(r.felag.nafn, 'Rót ehf.');
  assert.equal(r.felag.form, 'Einkahlutafélag');
  assert.equal(r.felag.hlutafe, 500000);
  // person relationship → folk + hlutverk (person-kt kept internally)
  const anna = r.folk.find((p) => p.nafn === 'Anna Ansdóttir');
  assert.equal(anna.person_key, '1201743509');
  assert.ok(r.hlutverk.some((h) => h.person_key === '1201743509' && h.hlutverk === 'Stjórnarformaður'));
  // company relationship → discovered kt, NOT folk
  assert.deepEqual(r.discovered, ['4808221610']);
  assert.ok(!r.folk.some((p) => p.person_key === '4808221610'));
  // auditor filtered out of hlutverk (noise)
  assert.ok(!r.hlutverk.some((h) => /2201743019/.test(h.person_key)));
});

test('parseLegalEntity: bankruptcy dates captured', () => {
  const api = { Name: 'Þrota ehf.', NationalId: '5920190799', Deregistration: { Bankrupcy: true, BankrupcyDate: '2024-02-01T00:00:00' } };
  const r = parseLegalEntity('5920190799', api);
  assert.equal(r.felag.gjaldthrot, 1);
  assert.equal(r.felag.gjaldthrot_dags, '2024-02-01');
});

test('parseLegalEntity: empty/invalid → null', () => {
  assert.equal(parseLegalEntity('5920190799', {}), null);
});

test('parseEigendur: parses owner blocks from detail HTML', () => {
  const html = `<div>Raunverulegir eigendur</div>
    <h4>Jón Jónsson</h4><table><tbody><tr><td>1970</td><td>Ísland.</td><td>Ísland</td><td>60%</td><td>Beint eignarhald,</td></tr></tbody></table>
    <h4>Guðrún Ó.</h4><table><tbody><tr><td>1965</td><td>Ísland.</td><td>Ísland</td><td>-</td><td>Óbeint</td></tr></tbody></table>
    <h3>Leit í fyrirtækjaskrá</h3>`;
  const rows = parseEigendur(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].nafn, 'Jón Jónsson');
  assert.equal(rows[0].faeding, '1970');
  assert.equal(rows[0].hlutur, '60%');
  assert.equal(rows[1].hlutur, null); // '-' → null
});

test('parseEigendur: no owner section → empty array', () => {
  assert.deepEqual(parseEigendur('<div>ekkert hér</div>'), []);
});
