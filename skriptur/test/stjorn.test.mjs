import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStjornText } from '../lib/rsk.mjs';

// Raunverulegur pdftotext -raw -enc UTF-8 texti (Brim hf., staðfest 2026-07-08).
const BRIM = [
  'Firmað rita: Meirihluti stjórnar',
  'Stjórn félagsins skipa samkvæmt fundi þann: 19.03.2026',
  '161160-2889 Kristján Þórarinn Davíðsson, Kirkjusandi 1, 105 Reykjavík, Stjórnarformaður',
  '290750-6879 Anna G Sverrisdóttir, Grjótaseli 13, 109 Reykjavík, Meðstjórnandi',
  '180465-4809 Guðmundur Marteinsson, Bæjarlind 5, 201 Kópavogur, Meðstjórnandi',
  '020758-6949 Hjálmar Þór Kristjánsson, Háarifi 15, 360 Hellissandur, Meðstjórnandi',
  '280871-4199 Kristrún Heimisdóttir, Hrólfsskálamel 10, 170 Seltjarnarnes, Meðstjórnandi',
  'Endurskoðandi/skoðunarmaður:',
  '521098-2449 Deloitte ehf., Dalvegi 30, 201 Kópavogur, Endurskoðandi',
  'Framkvæmdastjóri:',
  '220860-4429 Guðmundur Kristjánsson, Nesvegi 107, 170 Seltjarnarnes, Framkvæmdastjórn',
  'Prókúruhafar:',
  '220860-4429 Guðmundur Kristjánsson, Nesvegi 107, 170 Seltjarnarnes, Prókúruhafi',
  '290864-7719 Inga Jóna Friðgeirsdóttir, Gnitakór 14, 203 Kópavogur, Prókúruhafi',
].join('\n');

// Heilt tvítyngt skjal: íslensk síða 1 (m/haus fyrir nafn) + ensk endurtekning síðu 2.
const BRIM_FULL = [
  '- Fyrirtækjaskrá -',
  'Katrínartúni 6, 105 Reykjavík, Ísland - Sími: +354 442-1250',
  'www.skatturinn.is',
  'Yfirlit lögaðila',
  '8.7.2026',
  'Brim hf.',
  'Póstfang',
  'Norðurgarði 1',
  '101 Reykjavík',
  'Kt: 541185-0389',
  BRIM,
  'www.skatturinn.is',
  '- Register of Enterprises -',
  'Katrínartúni 6, 105 Reykjavík, Iceland - Tel: +354 442-1250',
  'Registration Overview',
  '7.8.2026',
  'Brim hf. Reg Id: 541185-0389',
  '161160-2889 Kristján Þórarinn Davíðsson, Kirkjusandi 1, 105 Reykjavík, Chairman',
  '290750-6879 Anna G Sverrisdóttir, Grjótaseli 13, 109 Reykjavík, Director',
  '521098-2449 Deloitte ehf., Dalvegi 30, 201 Kópavogur, Auditor',
  '220860-4429 Guðmundur Kristjánsson, Nesvegi 107, 170 Seltjarnarnes, Management',
  '220860-4429 Guðmundur Kristjánsson, Nesvegi 107, 170 Seltjarnarnes, Power of Procuration',
].join('\n');

test('parseStjornText: bilingual doc — extracts name, drops English duplicate board', () => {
  const r = parseStjornText(BRIM_FULL);
  assert.equal(r.nafn, 'Brim hf.');            // ekki "Iceland" úr enskri síðu
  assert.equal(r.stjorn.length, 9);            // ensk endurtekning sleppt (ekki 18)
  const ENGLISH = ['Chairman', 'Director', 'Auditor', 'Management', 'Power of Procuration'];
  assert.ok(!r.stjorn.some((x) => ENGLISH.includes(x.hlutverk)), 'engin ensk hlutverk');
});

test('parseStjornText: full board, name+role only', () => {
  const r = parseStjornText(BRIM);
  assert.equal(r.firmaritun, 'Meirihluti stjórnar');
  assert.equal(r.dags, '19.03.2026');
  assert.equal(r.stjorn.length, 9);
  assert.deepEqual(r.stjorn[0], { nafn: 'Kristján Þórarinn Davíðsson', hlutverk: 'Stjórnarformaður' });
});

test('parseStjornText: normalises Framkvæmdastjórn -> Framkvæmdastjóri', () => {
  const r = parseStjornText(BRIM);
  assert.ok(r.stjorn.some((x) => x.nafn === 'Guðmundur Kristjánsson' && x.hlutverk === 'Framkvæmdastjóri'));
});

test('parseStjornText: company auditor kept with role', () => {
  const r = parseStjornText(BRIM);
  assert.ok(r.stjorn.some((x) => x.nafn === 'Deloitte ehf.' && x.hlutverk === 'Endurskoðandi'));
});

test('parseStjornText: PRIVACY — no kennitala or address leaks', () => {
  const r = parseStjornText(BRIM);
  for (const p of r.stjorn) {
    assert.deepEqual(Object.keys(p).sort(), ['hlutverk', 'nafn']);   // engir aðrir reitir
    assert.doesNotMatch(p.nafn, /\d{6}-?\d{4}/, 'nafn má ekki innihalda kt');
    assert.doesNotMatch(p.nafn, /,/, 'nafn má ekki innihalda heimilisfang');
  }
});

test('parseStjornText: garbage input yields empty, no throw', () => {
  const r = parseStjornText('einhver\nótengdur\ntexti');
  assert.deepEqual(r.stjorn, []);
});
