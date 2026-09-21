import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thurfHjalp, mannEftir, mannEftirTexti, radtala } from './hjalparbeidni.mjs';

const D = 86400, NU = 1790000000;
const KB = [{ id: 'verd', um: 'verðskrá / hvað kostar / áskriftarþrep' }];
const midi = (o) => ({ id: 1, stada: 'nytt', netfang: 'jon@x.is', created: NU, efni: '', lysing: '', tegund: 'spurning', ...o });

test('thurfHjalp: lögfræði og persónuvernd, með íslenskum orðaskilum', () => {
  for (const s of ['Ég mun tala við lögfræðinginn minn', 'Lögmaður minn hefur samband', 'Kvörtun til Persónuverndar',
    'Vinsamlegast eyðið öllum gögnum um mig', 'Fjarlægið upplýsingar um fyrirtækið', 'I will contact my lawyer'])
    assert.equal(thurfHjalp(midi({ lysing: s }))?.astaeda, 'log', s);
  // „Kæra Sigrún" er ávarp, ekki kæra; „lögmál" er ekki lögmaður
  assert.equal(thurfHjalp(midi({ lysing: 'Kæra Sigrún, hvað kostar áskriftin?' })), null);
  assert.equal(thurfHjalp(midi({ lysing: 'Þetta er eins og lögmál Murphys' })), null);
});

test('thurfHjalp: endurgreiðsla og tvírukkun, en ekki „endurgreina"', () => {
  assert.deepEqual(thurfHjalp(midi({ lysing: 'Getið þið endurgreitt mér áskriftina?' })), { astaeda: 'peningar', texti: 'nefnir endurgreiðslu' });
  assert.deepEqual(thurfHjalp(midi({ efni: 'Endurgreiðsla' })), { astaeda: 'peningar', texti: 'nefnir endurgreiðslu' });
  assert.deepEqual(thurfHjalp(midi({ lysing: 'Ég var rukkaður tvisvar fyrir sama mánuð' })), { astaeda: 'peningar', texti: 'nefnir tvírukkun' });
  assert.deepEqual(thurfHjalp(midi({ lysing: 'I want a refund' })), { astaeda: 'peningar', texti: 'nefnir endurgreiðslu' });
  assert.equal(thurfHjalp(midi({ lysing: 'Getið þið endurgreint gögnin?' })), null);
});

test('thurfHjalp: nýjustu skilaboð notanda gilda líka, ekki bara fyrsta lýsingin', () => {
  assert.equal(thurfHjalp(midi({ stada: 'stadfest', lysing: 'Kemst ekki inn', sidastaInn: 'Ég vil fá endurgreitt ef þetta lagast ekki' }))?.astaeda, 'peningar');
});

test('thurfHjalp: aðeins beiðnir sem bíða okkar — svarað, hjá Hrafni eða lokað er ekki hennar að biðja um', () => {
  for (const stada of ['svarad', 'cto', 'tillaga', 'lokad', 'hafnad']) assert.equal(thurfHjalp(midi({ stada, lysing: 'endurgreiðsla' })), null, stada);
  assert.equal(thurfHjalp(null), null);
});

test('thurfHjalp: óvissa — greiningin féll á varaleið, eða forsamið svar með miðlungsvissu', () => {
  assert.deepEqual(thurfHjalp(midi({ g_model: 'fallback:ai 529' })), { astaeda: 'ovisst', texti: 'ég náði ekki að greina hana' });
  assert.deepEqual(thurfHjalp(midi({ g_model: 'claude', g_kb: 'verd', g_vissa: 0.7 }), { kb: KB }),
    { astaeda: 'ovisst', texti: 'svarið um verðskrá gæti átt við en ég er ekki viss' });
  assert.equal(thurfHjalp(midi({ g_model: 'claude', g_kb: 'verd', g_vissa: 0.3 }), { kb: KB }), null, 'lág vissa: hún veit að það á ekki við');
  assert.equal(thurfHjalp(midi({ g_model: 'off' })), null, 'slökkt á henni er ekki óvissa');
  assert.equal(thurfHjalp(midi({ g_model: 'claude', g_kb: 'horfid', g_vissa: 0.7 }), { kb: KB }).texti, 'forsamið svar gæti átt við en ég er ekki viss');
});

test('thurfHjalp: sterkasta ástæðan ræður — lögfræði á undan peningum á undan óvissu', () => {
  assert.equal(thurfHjalp(midi({ lysing: 'endurgreiðsla, annars fer þetta til lögfræðings', g_model: 'fallback' })).astaeda, 'log');
  assert.equal(thurfHjalp(midi({ lysing: 'endurgreiðsla', g_model: 'fallback' })).astaeda, 'peningar');
});

test('mannEftir: þriðja samband á 30 dögum, stafsetning netfangs skiptir ekki máli', () => {
  const listi = [
    { id: 5, netfang: 'Jon@X.is ', created: NU - 20 * D, efni: 'Kemst ekki inn', tegund: 'adgangur' },
    { id: 8, netfang: 'jon@x.is', created: NU - 5 * D, efni: 'Lykilorðið virkar ekki', tegund: 'adgangur' },
    { id: 9, netfang: 'jon@x.is', created: NU - 40 * D, efni: 'Of gamalt', tegund: 'adgangur' },
    { id: 11, netfang: 'jon@x.is', created: NU + D, efni: 'Kom á eftir', tegund: 'adgangur' },
    { id: 12, netfang: 'jon@x.is', created: NU - D, efni: 'Aron skrifaði', uppruni: 'stjorn' },
    { id: 13, netfang: 'anna@x.is', created: NU - D, efni: 'Önnur manneskja' },
  ];
  const t = midi({ id: 10, tegund: 'adgangur' });
  const m = mannEftir(t, listi);
  assert.equal(m.fjoldi, 3);
  assert.deepEqual(m.fyrri.map((x) => x.id), [5, 8], 'elst fyrst; of gamalt, síðar komið og samið af Aroni telst ekki');
  assert.equal(m.samaTegund, 2);
  assert.equal(mannEftirTexti(m, t), 'Þetta er í þriðja sinn á 30 dögum sem þessi notandi hefur samband. Áður komu #5 „Kemst ekki inn“ og #8 „Lykilorðið virkar ekki“. Í öll skiptin um aðgang.');
  assert.equal(thurfHjalp(Object.assign({}, t, { stada: 'stadfest' }), { listi }).texti, 'í þriðja sinn á 30 dögum');
  assert.equal(mannEftir(t, listi.slice(0, 1)), null, 'annað samband er ekki endurtekning');
  assert.equal(mannEftir(Object.assign({}, t, { uppruni: 'stjorn' }), listi), null);
});

test('mannEftir: ólík erindi — línan stendur en hún biður ekki um hjálp út á það', () => {
  const listi = [{ id: 5, netfang: 'jon@x.is', created: NU - 3 * D, efni: 'Verð', tegund: 'spurning' },
    { id: 6, netfang: 'jon@x.is', created: NU - 2 * D, efni: 'Villa', tegund: 'villa' }];
  const t = midi({ id: 7, tegund: 'adgangur' });
  assert.equal(mannEftirTexti(mannEftir(t, listi), t), 'Þetta er í þriðja sinn á 30 dögum sem þessi notandi hefur samband. Áður komu #5 „Verð“ og #6 „Villa“.');
  assert.equal(thurfHjalp(t, { listi }), null);
});

test('radtala: raðtölur í hvorugkyni og punktur ofan við tíu', () => {
  assert.equal(radtala(3), 'þriðja');
  assert.equal(radtala(10), 'tíunda');
  assert.equal(radtala(11), '11.');
});
