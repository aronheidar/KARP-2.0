import { HOFT, hoftActive, liftedAtRound, applyHoft } from './hoft.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// hoftActive
ok('KT1-2 engin höft', !hoftActive(1, null) && !hoftActive(2, null));
ok('KT3 höft sjálfkrafa á', hoftActive(3, null) === true);
ok('KT6 höft enn á ef ekki afnumin', hoftActive(6, null) === true);
ok('afnumin í KT5 → af frá KT5', !hoftActive(5, 5) && !hoftActive(6, 5) && hoftActive(4, 5));

// liftedAtRound — hoftLift í umferð >= liftableFrom(5) telur
ok('lyft í KT5 → 5', liftedAtRound([{}, {}, {}, {}, { hoftLift: true }]) === 5);
ok('hoftLift fyrir KT5 hunsast', liftedAtRound([{}, { hoftLift: true }, {}, {}]) === null);
ok('aldrei lyft → null', liftedAtRound([{}, {}, {}]) === null);

// applyHoft — stöðugleiki dregur að grunni + vaxtar-drag
const base = { gengi: 0, verdbolga: 2.5, hagvoxtur: 2 };
const crisis = { gengi: -30, verdbolga: 10, hagvoxtur: -6 };
const after = applyHoft(crisis, base);
ok('höft draga gengi-hrun að grunni (−30 → nær 0)', after.gengi > crisis.gengi && after.gengi < 0);
ok('höft lækka kreppu-verðbólgu', after.verdbolga < crisis.verdbolga && after.verdbolga > base.verdbolga);
ok('höft draga hagvöxt niður (drag)', after.hagvoxtur === crisis.hagvoxtur + HOFT.growthDrag);
ok('KPI án grunns óbreytt', applyHoft({ skuldir: 50 }, {}).skuldir === 50);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
