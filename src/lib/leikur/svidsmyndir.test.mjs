// Próf fyrir SVIÐSMYNDA-SKRÁNA (svidsmyndir.mjs) — skráin sem gerir leikinn fjöl-sviðsmynda.
// ÁHERSLA: (a) 'island2000' er BÆTA-EINS og áður (afturför útilokuð), (b) framtíðar-sviðsmyndin fær
// rétt eðli (ekkert spól, engin raun-saga, engir nafngreindir ráðherrar), (c) fallback og validering.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SVIDSMYNDIR, SVIDSMYNDA_LISTI, SVIDSMYND_SJALFGEFIN, island2000, island2026, svidsmyndOf, svidsmyndMeta, gildSvidsmynd } from './svidsmyndir.mjs';
import { SVIDSMYND_2058 } from './svidsmynd-2058.mjs';
import { YEAR_START, ROUNDS, SCENARIO, REALITY, YEAR2000_DIALS } from './game-config.mjs';
import { SAGA_SVIDSMYND } from './saga.mjs';
import { DEMO_SVIDSMYND } from './demo-logic.mjs';
import { buildInputs } from './resolve.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(__dirname, f), 'utf8');
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// 1) svidsmyndOf — fallback á sjálfgefnu við ÖLL ógild inntök (aldrei undefined, aldrei kast)
{
  ok('sjálfgefna sviðsmyndin er island2000', SVIDSMYND_SJALFGEFIN === 'island2000');
  for (const bad of [undefined, null, '', 'island1999', 'ISLAND2000', 0, 42, {}, [], true, 'constructor', '__proto__', 'toString']) {
    const r = svidsmyndOf(bad);
    if (r !== island2000) { ok('fallback á island2000 fyrir ' + JSON.stringify(bad), false); break; }
  }
  ok('svidsmyndOf fellur á island2000 við ógilt/vantandi auðkenni (líka prototype-lykla)',
    [undefined, null, '', 'island1999', 0, {}, 'constructor', '__proto__', 'toString'].every((b) => svidsmyndOf(b) === island2000));
  ok('svidsmyndOf skilar réttri sviðsmynd fyrir gild auðkenni', svidsmyndOf('island2000') === island2000 && svidsmyndOf('island2026') === island2026);
  ok('gildSvidsmynd samþykkir aðeins raunverulega lykla', gildSvidsmynd('island2000') && gildSvidsmynd('island2026')
    && !gildSvidsmynd('constructor') && !gildSvidsmynd('toString') && !gildSvidsmynd('x') && !gildSvidsmynd(null) && !gildSvidsmynd(2026));
}

// 2) Skráin sjálf — lyklar = id, öll svið til staðar, listinn í takt
{
  ok('lyklar SVIDSMYNDIR stemma við id', Object.entries(SVIDSMYNDIR).every(([k, v]) => v.id === k));
  const svid = ['id', 'heiti', 'undirtitill', 'yearStart', 'rounds', 'dials', 'events', 'reality', 'hefurSogu', 'blurb', 'erFramtid'];
  ok('allar sviðsmyndir hafa öll svið formsins', Object.values(SVIDSMYNDIR).every((s) => svid.every((k) => k in s)));
  ok('heiti/undirtitill/blurb eru ekki tóm', Object.values(SVIDSMYNDIR).every((s) => s.heiti && s.undirtitill && s.blurb));
  ok('events eru fylki með jafnmörgum stökum og rounds', Object.values(SVIDSMYNDIR).every((s) => Array.isArray(s.events) && s.events.length === s.rounds));
  ok('SVIDSMYNDA_LISTI hefur sjálfgefnu fyrst og allar sviðsmyndir', SVIDSMYNDA_LISTI[0] === island2000 && SVIDSMYNDA_LISTI.length === Object.keys(SVIDSMYNDIR).length);
}

// 3) island2000 = ÓBREYTT efni úr game-config (sama TILVÍSUN, ekki afrit — getur því aldrei rekið í sundur)
{
  ok('island2000.yearStart === YEAR_START', island2000.yearStart === YEAR_START && island2000.yearStart === 2000);
  ok('island2000.rounds === ROUNDS', island2000.rounds === ROUNDS);
  ok('island2000.events === SCENARIO.events (sama tilvísun)', island2000.events === SCENARIO.events);
  ok('island2000.scenario === SCENARIO (sama tilvísun)', island2000.scenario === SCENARIO);
  ok('island2000.dials === YEAR2000_DIALS (sama tilvísun)', island2000.dials === YEAR2000_DIALS);
  ok('island2000.reality === REALITY (sama tilvísun)', island2000.reality === REALITY);
  ok('island2000 hefur sögu og er ekki framtíð', island2000.hefurSogu === true && island2000.erFramtid === false);
  ok('island2000.heiti reiknað úr ártölum → „Ísland 2000–2032"', island2000.heiti === 'Ísland 2000–2032');
}

// 4) AFTURFARAR-SÖNNUN: buildInputs skilar NÁKVÆMLEGA sama fyrir sömu sögu, hvort sem sviðsmyndin
//    kemur beint úr game-config (gamla leiðin) eða úr skránni (nýja leiðin) — classic OG studio.
{
  const setAll = (o) => ({ peningastefna: 'obreytt', utgjold: 'obreytt', skattar: 'obreytt', fjarfesting: 'engin', vidbragd: '', ...o });
  const sogur = [
    [setAll({}), setAll({})],
    [setAll({ peningastefna: 'slaka2', utgjold: 'orvun2', vidbragd: 'innvidir' }), setAll({ skattar: 'haekka1', fjarfesting: 'innvidir' }), setAll({ vidbragd: 'verja' })],
  ];
  let eins = true;
  for (const history of sogur) {
    const gamalt = JSON.stringify(buildInputs(history, { baseline, scenario: SCENARIO, mode: 'classic' }));
    const nytt = JSON.stringify(buildInputs(history, { baseline, scenario: svidsmyndOf('island2000').scenario, mode: 'classic' }));
    if (gamalt !== nytt) { eins = false; break; }
  }
  ok('AFTURFÖR (classic): buildInputs bæta-eins gamla leiðin vs sviðsmynda-skráin', eins);

  const sogurStudio = [
    [{ levers: {} }],
    [{ levers: { vextir: 6, skattar: 2 } }, { levers: { utgjold: 5 } }, { levers: { vextir: 3 } }],
  ];
  let einsS = true;
  for (const history of sogurStudio) {
    const gamalt = JSON.stringify(buildInputs(history, { baseline, scenario: SCENARIO, mode: 'studio' }));
    const nytt = JSON.stringify(buildInputs(history, { baseline, scenario: svidsmyndOf('island2000').scenario, mode: 'studio' }));
    if (gamalt !== nytt) { einsS = false; break; }
  }
  ok('AFTURFÖR (studio): buildInputs bæta-eins gamla leiðin vs sviðsmynda-skráin', einsS);
  // Sjálfs-próf á aðferðinni: prófið á að FALLA ef sviðsmyndin er raunverulega önnur.
  const framtid = JSON.stringify(buildInputs([setAll({}), setAll({})], { baseline, scenario: svidsmyndOf('island2026').scenario, mode: 'classic' }));
  const sogulegt = JSON.stringify(buildInputs([setAll({}), setAll({})], { baseline, scenario: SCENARIO, mode: 'classic' }));
  ok('samanburðurinn er marktækur (önnur sviðsmynd → önnur inntök)', framtid !== sogulegt);
}

// 5) island2026 — FRAMTÍÐIN: rétt ártöl, ENGIN spólun, ENGIN raun-gögn, ENGIN saga
{
  ok('island2026.yearStart === 2026', island2026.yearStart === 2026);
  ok('island2026 ártöl → „Ísland 2026–2058"', island2026.heiti === 'Ísland 2026–2058'
    && island2026.yearStart + island2026.rounds * 4 === 2058);
  ok('island2026.dials er TÓMT (baseline ER 2026 → engin spólun)', island2026.dials && Object.keys(island2026.dials).length === 0);
  ok('island2026.reality === null (engin raungögn um framtíðina)', island2026.reality === null);
  ok('island2026.hefurSogu === false (ekkert „Svona fór það í alvöru")', island2026.hefurSogu === false);
  ok('island2026.erFramtid === true (aldrei nafngreindir framtíðar-ráðherrar)', island2026.erFramtid === true);
  ok('ártöl atburða byrja í 2026 og hækka um 4 ár per lotu',
    island2026.events.every((e, i) => e.year === 2026 + i * 4 && e.round === i + 1));
}

// 6) SAMNINGURINN við svidsmynd-2058.mjs — lýsi skráin sjálfri sér má hún ALDREI reka frá því sem skráin neglir
{
  ok('SVIDSMYND_2058 flytur út events-fylki', Array.isArray(SVIDSMYND_2058.events) && SVIDSMYND_2058.events.length > 0);
  ok('events komast óbreytt í gegn (sama tilvísun)', island2026.events === SVIDSMYND_2058.events);
  const lys = (k, v) => !(k in SVIDSMYND_2058) || JSON.stringify(SVIDSMYND_2058[k]) === JSON.stringify(v);
  ok('sjálfslýsing 2058-skrárinnar rekur ekki frá neglingum skrárinnar',
    lys('dials', {}) && lys('reality', null) && lys('hefurSogu', false) && lys('erFramtid', true) && lys('yearStart', 2026) && lys('id', 'island2026'));
  ok('hver atburður hefur responses-fylki (classic-hamur les það)',
    SVIDSMYND_2058.events.every((e) => Array.isArray(e.responses) && e.responses.length >= 2 && e.responses.every((r) => r.key && r.label && r.effect)));
  ok('sjokk-lyklar framtíðar-sviðsmyndar eru til í baseline.shocks',
    SVIDSMYND_2058.events.every((e) => Object.keys(e.shocks || {}).every((k) => baseline.shocks && baseline.shocks[k])));
}

// 7) svidsmyndMeta — NÁKVÆMLEGA lýsigögnin; efnið (events/dials/reality) LEKUR ALDREI í /state
{
  const m = svidsmyndMeta(island2026);
  const lyklar = Object.keys(m).sort().join(',');
  ok('svidsmyndMeta hefur nákvæmlega 6 lykla', lyklar === 'erFramtid,hefurSogu,heiti,id,undirtitill,yearStart');
  ok('svidsmyndMeta lekur hvorki events, dials né reality', !('events' in m) && !('dials' in m) && !('reality' in m) && !('scenario' in m));
  ok('svidsmyndMeta ber rétt gildi', m.id === 'island2026' && m.yearStart === 2026 && m.erFramtid === true && m.hefurSogu === false);
  ok('svidsmyndMeta án viðfangs → sjálfgefna sviðsmyndin', svidsmyndMeta(null).id === 'island2000' && svidsmyndMeta(undefined).hefurSogu === true);
}

// 8) LÆSINGAR ANNARRA EININGA: saga.mjs og demo-logic.mjs eiga BÆÐI að vera negld við island2000
{
  ok('saga.mjs er negld við island2000 (eina sviðsmyndin með hefurSogu)', SAGA_SVIDSMYND === 'island2000' && svidsmyndOf(SAGA_SVIDSMYND).hefurSogu === true);
  ok('demo-logic.mjs er NEGLT við island2000 (fylgir ekki sviðsmynda-vali)', DEMO_SVIDSMYND === 'island2000');
  const demoSrc = src('demo-logic.mjs');
  ok('demo-logic flytur EKKI inn sviðsmynda-skrána (getur því ekki fylgt valinu)', !/from '\.\/svidsmyndir\.mjs'/.test(demoSrc));
}

// 9) NEYTENDA-HLIÐ (client.mjs): gátt-skilyrðin verða að vera til staðar í kóðanum. Vafra-einingin er
//    ekki keyranleg í Node (DOM+auth), svo hér er staðfest að gáttirnar séu ekki fjarlægðar óvart.
{
  const c = src('client.mjs');
  ok('client: sagaCard er gátt á hefurSogu', /function sagaCard\(st\)[\s\S]{0,600}?if \(!svHefurSogu\(st\)\)/.test(c));
  ok('client: ráðherra-uppfletting er gátt á erFramtid', /radh = svErFramtid\(st\) \? null : radherraFyrirLotu/.test(c));
  ok('client: nafnskiltið sýnir EKKERT nafn í framtíðar-sviðsmynd', /nafnTxt = svErFramtid\(st\) \? null : radherraTexti/.test(c));
  ok('client: ártöl leiksins koma úr sviðsmyndinni (svAr0), ekki föstu YEAR_START', /const svAr0 = \(st\)/.test(c) && !/termYears = \(r\) => \[YEAR_START/.test(c));
  ok('client: stjórnstöðin spólar með dials sviðsmyndarinnar, ekki YEAR2000_DIALS beint', /Object\.entries\(svidsmyndOf\(svOf\(st\)\.id\)\.dials/.test(c) && !/import \{[^}]*YEAR2000_DIALS/.test(c));
  ok('client: REALITY er ekki lengur flutt inn beint (raun-gögn koma úr sviðsmynd)', !/import \{[^}]*\bREALITY\b/.test(c));
  ok('client: sviðsmyndar-val er í lobby-stillingunum', /id="lk-svidsmynd"/.test(c) && /body\.svidsmynd = svidsmynd/.test(c));
}

// 10) server.mjs: /state ber lýsigögnin og /create validerar valið gegn skránni
{
  const s = src('server.mjs');
  ok('server: gameCfg flettir sviðsmyndinni upp úr config.svidsmynd', /const sv = svidsmyndOf\(c\.svidsmynd\)/.test(s));
  ok('server: /state sendir svidsmyndMeta', /out\.svidsmynd = svidsmyndMeta\(cfg\.svidsmynd\)/.test(s));
  ok('server: /create hafnar óþekktri sviðsmynd (400) í stað þess að falla þegjandi', /if \(!gildSvidsmynd\(cb\.svidsmynd\)\) return sjson\(\{ error: 'svidsmynd' \}, 400\)/.test(s));
  ok('server: ártala-fallback notar upphafsár sviðsmyndarinnar', /cfg\.svidsmynd\.yearStart \+ \(r - 1\) \* 4/.test(s));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
