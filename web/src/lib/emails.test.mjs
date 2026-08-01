import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_TYPES, emailById, resolveEmail, renderEmail, validateEmail } from './emails.mjs';

test('skráin telur allar 11 póst-tegundir og hver er heil', () => {
  assert.equal(EMAIL_TYPES.length, 11);   // +kyc_digest (morgunfundurinn)
  const ids = EMAIL_TYPES.map((t) => t.id);
  assert.equal(new Set(ids).size, 11, 'id verða að vera einkvæm');
  for (const t of EMAIL_TYPES) {
    assert.ok(t.label && t.hvenaer && t.vidtakandi && t.hopur, t.id + ' vantar lýsingu');
    assert.ok(t.subject, t.id + ' vantar efnislínu');
    assert.ok(['fastur', 'kvikur'].includes(t.flokkur), t.id + ' hefur ógildan flokk');
    if (t.flokkur === 'fastur') assert.ok(t.html, t.id + ' (fastur) vantar html');
  }
});

test('auðkenningar-póstar bera skyldu-hlekkinn sjálfgefið', () => {
  for (const id of ['verify', 'reset', 'reset_admin']) {
    const t = emailById(id);
    assert.deepEqual(t.krafist, ['hlekkur']);
    assert.ok(t.html.includes('{{hlekkur}}'), id + ' vantar {{hlekkur}}');
  }
});

test('renderEmail skiptir út breytum og heldur óþekktum', () => {
  assert.equal(renderEmail('Hæ {{nafn}}!', { nafn: 'Aron' }), 'Hæ Aron!');
  assert.equal(renderEmail('{{a}} {{b}}', { a: '1' }), '1 {{b}}', 'óþekkt breyta helst sýnileg');
  assert.equal(renderEmail(null, {}), '');
});

test('resolveEmail skilar sjálfgefnu án yfirskriftar', () => {
  const r = resolveEmail('verify', {});
  assert.equal(r.subject, 'Staðfestu netfangið þitt á Karp');
  assert.equal(r.breytt, false);
  assert.ok(r.html.includes('{{hlekkur}}'));
});

test('resolveEmail bræðir yfirskrift saman og merkir breytt', () => {
  const r = resolveEmail('verify', { verify: { subject: 'Nýtt efni' } });
  assert.equal(r.subject, 'Nýtt efni');
  assert.equal(r.breytt, true);
  assert.ok(r.html.includes('{{hlekkur}}'), 'óritaður reitur helst sjálfgefinn');
});

test('kvikur póstur skilar intro/footer en ekki html', () => {
  const r = resolveEmail('eftirlit_crit', {});
  assert.equal(r.html, undefined);
  assert.ok(r.intro.includes('einkunn 0-1'));
  assert.ok(r.footer.includes('karp.is/eftirlit-byggingar/'));
});

test('validateEmail HAFNAR þegar skyldu-breyta hverfur', () => {
  const v = validateEmail('verify', { html: '<p>Enginn hlekkur hér</p>' });
  assert.equal(v.ok, false);
  assert.match(v.villa, /\{\{hlekkur\}\}/);
});

test('validateEmail samþykkir þegar skyldu-breyta helst', () => {
  assert.equal(validateEmail('verify', { html: '<p><a href="{{hlekkur}}">Virkja</a></p>' }).ok, true);
});

test('validateEmail hafnar tómri efnislínu og óritanlegum reit', () => {
  assert.equal(validateEmail('verify', { subject: '   ' }).ok, false);
  assert.equal(validateEmail('eftirlit_crit', { html: '<p>x</p>' }).ok, false, 'kvikur póstur á ekki html');
  assert.equal(validateEmail('verify', { intro: 'x' }).ok, false, 'fastur póstur á ekki intro');
  assert.equal(validateEmail('ekki_til', { subject: 'x' }).ok, false);
});

test('validateEmail hafnar ó-texta gildi', () => {
  assert.equal(validateEmail('digest', { subject: 42 }).ok, false);
});

test('ritanlegt endurspeglar EINGÖNGU víraða reiti', () => {
  // digest/frettavakt/hjalp: meginmálið er byggt annars staðar → aðeins efnislína ritanleg.
  for (const id of ['digest', 'frettavakt', 'hjalp']) {
    assert.deepEqual(emailById(id).ritanlegt, ['subject'], id);
    assert.equal(validateEmail(id, { intro: 'x' }).ok, false, id + ' á ekki að leyfa intro');
    assert.equal(validateEmail(id, { subject: 'Nýtt' }).ok, true, id + ' á að leyfa subject');
  }
  // vaktir með einföldu texta-meginmáli: intro+footer líka
  for (const id of ['kyc_alert', 'eftirlit_crit', 'logbirting_crit']) {
    assert.deepEqual(emailById(id).ritanlegt, ['subject', 'intro', 'footer'], id);
    assert.equal(validateEmail(id, { intro: 'Nýr inngangur' }).ok, true, id);
  }
});

test('hver tegund lýsir aðeins reitum sem hún á', () => {
  for (const t of EMAIL_TYPES) {
    assert.ok(Array.isArray(t.ritanlegt) && t.ritanlegt.length, t.id + ' vantar ritanlegt');
    if (t.ritanlegt.includes('html')) assert.equal(t.flokkur, 'fastur', t.id);
    for (const f of t.ritanlegt) assert.ok(typeof t[f] === 'string', t.id + ' vantar sjálfgefið fyrir ' + f);
  }
});
