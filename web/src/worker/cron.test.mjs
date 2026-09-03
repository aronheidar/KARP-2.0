import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _mentions } from './cron.mjs';

// ══════════════════════════════════════════════════════════════════════════
// AFTURFARAR-VÖRN — RAUNTILFELLI 2.9.2026
//
// Áreiðanleikaskýrsla (KYC) um `Enor ehf.` skilaði 17 fréttum og ENGIN þeirra fjallaði um
// félagið. Ellefu voru um bruna í leikmunageymslu TrueNorth í Gufunesi — „Tru·enor·th"
// inniheldur `enor` — og tónninn reiknaðist −23 (neikvæður) af þeim brunafréttum.
//
// Orsök: `_mentions` gerði `hay.includes(a)` án orðamarka, og `firmaHandler` kallaði ekki
// einu sinni á hana: SQL-leitin (`body LIKE '%enor%'`) fór beint í tón og orðspors-einkunn.
//
// Í KYC-skýrslu er falssamsvörun VERRI en engin niðurstaða: hún eignar félagi neikvæða
// umfjöllun sem það á enga aðild að, og fer fyrir augu regluvarðar sem treystir henni.
// Þessi próf mega ekki slakna án þess að sú áhætta sé tekin meðvitað.
// ══════════════════════════════════════════════════════════════════════════

const FALSAR = [
  ['TrueNorth', 'leikmunageymsla truenorth í gufunesi alelda'],
  ['TrueNorth 2', 'borgin ber enga ábyrgð í gufunesbruna og stjórnarmaður í truenorth segir tjónið mikið'],
  ['Elenora', 'elenora: uppskriftin að nýjasta æðinu'],
  ['generator', 'nýr generator settur upp í varaaflstöðinni'],
  ['senor', 'senor pizza opnar á akureyri'],
];

test('„Enor" samsvarar EKKI orði sem einungis inniheldur það (Enor-tilfellið)', () => {
  for (const [hvad, texti] of FALSAR) {
    assert.equal(_mentions(texti, ['enor']), false, `falssamsvörun (${hvad}): ${texti.slice(0, 60)}`);
  }
});

test('„Enor" samsvarar áfram þegar það stendur sem sjálfstætt orð', () => {
  const RETT = [
    'enor ehf. skilaði ársreikningi fyrir 2025',
    'endurskoðunarstofan enor tók við nýjum viðskiptavini',
    'samkvæmt enor er staðan óbreytt',
    'stjórn enors samþykkti tillöguna',        // eignarfall
    'viðskiptavinir enors eru margir',
    '(enor) var nefnt í skýrslunni',           // svigar telja orðamörk
    'enor, kt. 530612-2010, er endurskoðunarstofa',
  ];
  for (const t of RETT) assert.equal(_mentions(t, ['enor']), true, `átti að samsvara: ${t}`);
});

test('beygingarendingar leyfast en samsett orð ekki', () => {
  assert.equal(_mentions('brims hlutur jókst', ['brim']), true, 'eignarfall -s');
  assert.equal(_mentions('hjá brimi í reykjavík', ['brim']), true, 'þágufall -i');
  assert.equal(_mentions('í briminu var mikið að gera', ['brim']), true, 'með greini -inu');
  assert.equal(_mentions('brimborg seldi 40 bíla', ['brim']), false, 'ANNAÐ félag — má ekki samsvara');
  assert.equal(_mentions('brimgarðar keyptu húsið', ['brim']), false, 'annað félag');
});

test('fjölorða nöfn virka og vinstri mörk gilda þar líka', () => {
  assert.equal(_mentions('bláa lónið hlýtur útflutningsverðlaunin', ['bláa lónið']), true);
  assert.equal(_mentions('ekkert um það hér', ['bláa lónið']), false);
});

test('of stutt leitarorð samsvara aldrei', () => {
  for (const stutt of ['', 'a', 'ís']) assert.equal(_mentions('eitthvað ís og annað', [stutt]), false);
});

test('samheitalisti: nóg að EITT samheiti samsvari', () => {
  assert.equal(_mentions('fisk-seafood keypti nýtt skip', ['fisk-seafood', 'fisk seafood']), true);
  assert.equal(_mentions('ekkert hér', ['fisk-seafood', 'fisk seafood']), false);
});

test('sértákn í nafni brjóta ekki regex', () => {
  assert.doesNotThrow(() => _mentions('texti', ['a.b*c+d(e)']));
  assert.equal(_mentions('félagið a.b*c+d(e) var nefnt', ['a.b*c+d(e)']), true);
});
