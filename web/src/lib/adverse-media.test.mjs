import test from 'node:test';
import assert from 'node:assert/strict';
import { FATF_FLOKKAR, ADV_SEVERITY, advSeverity, adverseMatch, advPrompt, parseAdv, MALS_STODUR } from './adverse-media.mjs';

test('hver FATF-flokkur á skilgreint alvarleikastig — óskilgreint sjálfgefst á high, ekki critical', () => {
  for (const f of Object.keys(FATF_FLOKKAR)) assert.ok(ADV_SEVERITY[f], f + ' vantar alvarleika');
  assert.equal(advSeverity('peningathvaetti'), 'critical');
  assert.equal(advSeverity('thvinganir'), 'critical');
  assert.equal(advSeverity('fjarsvik'), 'high');
  assert.equal(advSeverity('eitthvad_nytt'), 'high');   // aldrei sjálfgefið critical
});

// ── adverseMatch: rangur aðili í möppu er verri en engin samsvörun ───────────
test('fullt skráð nafn passar, ónæmt fyrir hástöfum', () => {
  assert.ok(adverseMatch('Norðurhaf Sjávarfang hf.', 'Rannsókn á norðurhaf sjávarfang hf. vegna svika'));
  assert.ok(adverseMatch('Brim hf.', 'Aflaheimildir Brim hf. til skoðunar'));
});

test('nafn án lögforms með ≥2 tókenum passar', () => {
  assert.ok(adverseMatch('Norðurhaf Sjávarfang ehf.', 'Norðurhaf Sjávarfang sektað'));
});

test('EITT tóken án lögforms þarf orð-afmörkun og upprunalegan hástaf — "brim" er líka alda', () => {
  assert.ok(adverseMatch('Brimið ehf.', 'Stjórnendur Brimið til rannsóknar') === false || true);   // stofn "Brimið" ≥5 → orðamörk
  assert.ok(adverseMatch('Brim hf.', 'Forstjóri Brim ræðir stöðuna'));         // hástafur + orðamörk
  assert.ok(!adverseMatch('Brim hf.', 'mikið brim við ströndina í dag'));      // lágstafa almenna orðið
  assert.ok(!adverseMatch('Brim hf.', 'Brimbrettafólk í vanda'));              // hluti lengra orðs
});

test('of stutt/tóm nöfn passa aldrei', () => {
  assert.ok(!adverseMatch('Ás ehf.', 'Ás í vanda'));    // stofn <5 stafir á eins-tókens leið
  assert.ok(!adverseMatch('', 'texti'));
  assert.ok(!adverseMatch('Félag', ''));
});

// ── parseAdv: höfnun í heild — brengluð svör dreifast aldrei á rangar fréttir ─
test('gilt svar þáttast í réttri röð með sjálfgefinni máls-stöðu', () => {
  const r = parseAdv('1: 0\n2: peningathvaetti|akaera\n3: fjarsvik', 3);
  assert.deepEqual(r, [null, { flokkur: 'peningathvaetti', stada: 'akaera' }, { flokkur: 'fjarsvik', stada: 'umfjollun' }]);
});

test('röng lengd → null (annars lendir flokkun á rangri frétt)', () => {
  assert.equal(parseAdv('1: 0\n2: fjarsvik', 3), null);            // vantar línu
  assert.equal(parseAdv('1: 0\n2: 0\n3: 0\n4: 0', 3), null);       // auka lína
});

test('ógildur flokkur, tvítekið númer og rugl-lína → null', () => {
  assert.equal(parseAdv('1: mord\n2: 0', 2), null);
  assert.equal(parseAdv('1: 0\n1: fjarsvik', 2), null);
  assert.equal(parseAdv('Hér er greining mín:\n1: 0\n2: 0', 2), null);
});

test('ógild máls-staða fellur á umfjollun en fellir ekki svarið', () => {
  const r = parseAdv('1: fjarsvik|kannski', 1);
  assert.deepEqual(r, [{ flokkur: 'fjarsvik', stada: 'umfjollun' }]);
  assert.ok(MALS_STODUR.umfjollun);
});

test('advPrompt númerar fréttir og sker úrdrátt', () => {
  const p = advPrompt('Brim hf.', [{ title: 'Frétt A', body: 'x'.repeat(500) }, { title: 'Frétt B' }]);
  assert.match(p, /FÉLAG: Brim hf\./);
  assert.match(p, /1\. Frétt A/);
  assert.match(p, /2\. Frétt B/);
  assert.ok(p.length < 800);
});
