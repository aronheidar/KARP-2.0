import { awardMedals } from './medals.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const r = (round, kpis, roundScore, extra = {}) => ({ round, kpis, roundScore, stability: { approval: 60, level: 'stable' }, ...extra });

// Verðbólgu-baninn — verðbólga í bandi allar 8 umferðir
const good = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => r(i, { verdbolga: 2.5, skuldir: 38, fiskistofn: 101, byggdajofnudur: 101, losun: 100 }, 85));
let m = awardMedals(good);
const has = (t) => m.some((x) => x.title === t);
ok('Verðbólgu-baninn', has('Verðbólgu-baninn'));
ok('Skuldlausi (skuldir<45)', has('Skuldlausi'));
ok('Efnahags-snillingurinn (avgScore≥80)', has('Efnahags-snillingurinn'));
ok('Stöðugleika-stjórnin (engin kreppa)', has('Stöðugleika-stjórnin'));
ok('Sjálfbæri (fiskistofn≥100)', has('Sjálfbæri'));
ok('Græna byltingin (losun≤106 KT6-8)', has('Græna byltingin'));

// Kreppu-kappinn: KT3 stig ≥55
ok('Kreppu-kappinn ef KT3≥55', awardMedals([r(3, { verdbolga: 8 }, 62)]).some((x) => x.title === 'Kreppu-kappinn'));
ok('EKKI Kreppu-kappinn ef KT3<55', !awardMedals([r(3, { verdbolga: 8 }, 30)]).some((x) => x.title === 'Kreppu-kappinn'));

// Fullveldis-hetjan: Icesave hafnað í lokastöðu
ok('Fullveldis-hetjan (icesave reject)', awardMedals([r(4, { verdbolga: 3 }, 50, { policies: { icesave: 'reject' } })]).some((x) => x.title === 'Fullveldis-hetjan'));

// Léleg stjórn fær enga „góða" peninga
const bad = [1, 2, 3].map((i) => r(i, { verdbolga: 12, skuldir: 90 }, 25, { crisis: true, stability: { approval: 20, level: 'revolt' } }));
ok('léleg stjórn fær ekki Verðbólgu-baninn', !awardMedals(bad).some((x) => x.title === 'Verðbólgu-baninn'));

ok('tómt → engir peningar', awardMedals([]).length === 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
