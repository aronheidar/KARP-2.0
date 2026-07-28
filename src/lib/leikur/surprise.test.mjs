import { SURPRISE_EVENTS, rollSurprise, surpriseById, applySurprise } from './surprise.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// rollSurprise — determinískt + ekki KT1
ok('ekkert atvik í KT1', rollSurprise('ABCDE', 1) === null);
ok('sama atvik fyrir sama (kóða,umferð)', JSON.stringify(rollSurprise('ABCDE', 3)) === JSON.stringify(rollSurprise('ABCDE', 3)));
// ólíkir kóðar gefa (yfirleitt) ólíka röð — a.m.k. eru sum atvik og sum null yfir margar umferðir
let events = 0, nulls = 0; for (let r = 2; r <= 8; r++) { for (const c of ['AAAAA', 'BBBBB', 'CCCCC', 'DEFGH', 'XYZ12']) { (rollSurprise(c, r) ? events++ : nulls++); } }
ok('bæði atvik og engin yfir mörg köst', events > 0 && nulls > 0);
ok('roll skilar gildu atviki eða null', (() => { for (let r = 2; r <= 8; r++) { const e = rollSurprise('TESTX', r); if (e && !surpriseById(e.id)) return false; } return true; })());

// applySurprise — áhrif + klemmu-val + pop
const base = { hagvoxtur: 2, skuldir: 40, kaupmattur: 1, fiskistofn: 100, verdbolga: 2.5, byggdajofnudur: 100, jofnudur: 100, atvinnuleysi: 4 };
const eldgos = surpriseById('eldgos');
const r1 = applySurprise(base, eldgos, 'neydarfe');
ok('eldgos + neyðarfé: hagvöxtur↓, skuldir↑, fylgi↑', r1.kpis.hagvoxtur < 2 && r1.kpis.skuldir > 40 && r1.pop > 0);
const r2 = applySurprise(base, eldgos, 'bida');
ok('eldgos + bíða: fylgi↓', r2.pop < 0);
const mak = applySurprise(base, surpriseById('makrill'), 'storsokn');
ok('makríll stórsókn: hagvöxtur↑ en fiskistofn↓', mak.kpis.hagvoxtur > 2 && mak.kpis.fiskistofn < 100);
ok('spilling: bein fylgis-lækkun', applySurprise(base, surpriseById('spilling'), null).pop < 0);
ok('ekkert atvik → óbreytt', (() => { const r = applySurprise(base, null, null); return r.kpis.hagvoxtur === 2 && r.pop === 0; })());
ok('a.m.k. 6 atvik í safni', SURPRISE_EVENTS.length >= 6);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
