// crawl_stopp.test.mjs — nótt sem STÖÐVAST á að sjást í samantekt keyrslunnar.
//
// ⚠ Bakgrunnur (17.9.2026): crawl_tengsl.mjs gerir nú `break` þegar RSK-kvótinn er uppurinn
// í stað þess að merkja raunveruleg félög „ekki til". Það er stórbót frá menguninni — en
// stoppið skildi aðeins eftir stderr-línu og keyrslan varð GRÆN. Uppurinn kvóti er væntanlegt
// ástand héðan í frá og á að standa í `$GITHUB_STEP_SUMMARY`, eins og heilsu-hliðið gerir,
// svo enginn þurfi að opna loggann til að vita hvers vegna grunnurinn hætti að vaxa.
import { test } from 'node:test';
import assert from 'node:assert';
import { stoppLina } from './lib/rsk_api.mjs';

test('kvóta-stopp skilar skýrri línu sem nefnir kvótann', () => {
  const md = stoppLina('KVÓTI UPPURINN (mánaðarkvóti RSK) :: {"statusCode":403,"message":"Out of call volume quota."}', { unnid: 12, budget: 900 });
  assert.match(md, /kvóti/i, 'ástæðan verður að standa í samantektinni');
  assert.match(md, /12/, 'hversu langt nóttin komst á að sjást');
  assert.match(md, /900/);
  assert.ok(md.startsWith('⛔'), 'stopp á ekki að líta út eins og venjuleg lína: ' + md);
});

test('auth-stopp er aðgreint frá kvóta-stoppi', () => {
  const md = stoppLina('AUTH 401 (ógildur lykill?) :: forbidden', { unnid: 0, budget: 900 });
  assert.match(md, /401/);
  // ⚠ Prófið mældi áður /kvóti uppurinn/ — það orðalag stendur hvergi orðrétt í kvóta-línunni
  //   („mánaðarkvóti RSK er uppurinn"), svo það mældi rangan eiginleika og hleypti samfellingu
  //   í gegn. Krafan er að orðið KVÓTI komi hvergi fyrir: viðbrögðin eru ólík.
  assert.doesNotMatch(md, /kvót/i,
    'ógildur lykill og uppurinn kvóti kalla á ÓLÍK viðbrögð — línan má ekki fella þau saman');
});

test('óþekkt stopp skilar samt línu (þögn er versta niðurstaðan)', () => {
  const md = stoppLina('eitthvað allt annað', { unnid: 3, budget: 900 });
  assert.ok(md && md.length > 10);
  assert.ok(md.startsWith('⛔'));
});

test('ekkert stopp → engin lína', () => {
  assert.equal(stoppLina(null, { unnid: 900, budget: 900 }), null);
  assert.equal(stoppLina('', {}), null);
});
