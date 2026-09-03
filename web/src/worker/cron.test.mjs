import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _mentions, _greinLyklar } from './cron.mjs';

/** Hermir eftir dedup-lykkjunni í firmaHandler. */
function dedup(items) {
  const sed = new Set();
  return items.filter((it) => {
    const l = _greinLyklar(it);
    if (l.some((k) => sed.has(k))) return false;
    for (const k of l) sed.add(k);
    return true;
  });
}

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

// ══════════════════════════════════════════════════════════════════════════
// TVÍTEKNINGAR — RAUNTILFELLI: Vísir endurskrifar slóðir eftir á.
// Sama grein (auðkenni 20262828256d) fannst á ÞREMUR slóðum í frétta­safninu og
// tvítaldist bæði í fjölda og tóni. Slóð ein og sér dugar því ekki sem lykill.
// ══════════════════════════════════════════════════════════════════════════

const V = 'https://www.visir.is/g/20262828256d/';
const grein = (slug, title) => ({ url: V + slug, source: 'Vísir', title, date: '2026-01-13' });

test('sama grein á þremur slóðum telst EIN (Vísir-tilfellið)', () => {
  const t = 'Borgin firrti sig allri ábyrgð á skemmunni';
  const inn = [
    grein('borgin-firrti-sig-allri-abyrgd-a-skemmunni', t),
    grein('borgin-firrti-sig-allri-a-byrgd-a-skemmunni', t),   // bandstrikun breyttist
    grein('borgin-firradi-sig-allri-a-byrgd-a-skemmunni', t),  // innsláttarvilla leiðrétt
  ];
  assert.equal(dedup(inn).length, 1);
});

test('bandstrikunar-afbrigði eitt og sér nægir til að fella út', () => {
  const a = { url: 'https://x.is/a-b-c', source: 'X', title: 'Eitt', date: '2026-01-01' };
  const b = { url: 'https://x.is/ab-c', source: 'X', title: 'Annað', date: '2026-01-02' };
  assert.equal(dedup([a, b]).length, 1, 'sama slóð eftir að bandstrik eru fjarlægð');
});

test('ÓLÍKAR greinar haldast — dedup má ekki éta réttar færslur', () => {
  const inn = [
    grein('vaktin-nad-tokum', 'Vaktin: Náð tökum á stórbrunanum í Gufunesi'),
    grein('nad-tokum', 'Náð tökum á stórbrunanum í Gufunesi'),   // ólík fyrirsögn = önnur grein
  ];
  assert.equal(dedup(inn).length, 2);
});

test('slóðlaus færsla fellur á miðil|fyrirsögn|dagsetningu', () => {
  const x = { source: 'Vísir', title: 'Sama frétt', date: '2026-01-13' };
  assert.equal(dedup([x, { ...x }]).length, 1);
  assert.equal(dedup([x, { ...x, date: '2026-01-14' }]).length, 2, 'annar dagur = önnur færsla');
});
