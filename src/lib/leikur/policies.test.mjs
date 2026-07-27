import { POLICIES, policyAvailable, policyStates, applyPolicies } from './policies.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const P = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

// policyAvailable
ok('höft ekki í boði KT1', !policyAvailable(P.hoft, 1, {}));
ok('höft í boði KT3+', policyAvailable(P.hoft, 3, {}) && policyAvailable(P.hoft, 6, {}));
ok('Icesave aðeins KT4', policyAvailable(P.icesave, 4, {}) && !policyAvailable(P.icesave, 5, {}));
ok('val horfið eftir ákvörðun', !policyAvailable(P.icesave, 4, { icesave: 'pay' }));
ok('esb gluggi 4–7', policyAvailable(P.esb, 4, {}) && policyAvailable(P.esb, 7, {}) && !policyAvailable(P.esb, 8, {}));

// policyStates — toggle síðasta gildi, choice fyrsta varanleg
let st = policyStates([{ policies: { hoft: true } }, { policies: {} }, { policies: { hoft: false } }]);
ok('höft toggle: síðasta (false)', st.hoft === false);
st = policyStates([{ policies: { hoft: true } }, { policies: {} }]);
ok('höft heldur (true) þótt ekki sett aftur', st.hoft === true);
st = policyStates([{ policies: { icesave: 'pay' } }, { policies: { icesave: 'reject' } }]);
ok('icesave choice: fyrsta varanleg (pay)', st.icesave === 'pay');
ok('ósett → undefined', policyStates([{ policies: {} }]).hoft === undefined);

// applyPolicies — áhrif
const base = { verdbolga: 2.5, gengi: 0, hagvoxtur: 2, skuldir: 40, atvinnuleysi: 4, kaupmattur: 1, vanskil: 100 };
const bl = { verdbolga: 2.5, gengi: 0, gengi_endo: 100, hagvoxtur: 2 };
ok('icesave pay: skuldir↑ hagvöxtur↑', (() => { const r = applyPolicies(base, { icesave: 'pay' }, bl); return r.skuldir === 47 && r.hagvoxtur > 2; })());
ok('icesave reject: hagvöxtur↓ verðbólga↑', (() => { const r = applyPolicies(base, { icesave: 'reject' }, bl); return r.hagvoxtur < 2 && r.verdbolga > 2.5; })());
ok('bankar einka: skuldir↓ vöxtur↑ vanskil↑', (() => { const r = applyPolicies(base, { bankar: 'einka' }, bl); return r.skuldir === 36 && r.hagvoxtur > 2 && r.vanskil > 100; })());
ok('verðtrygging afnumin í hárri verðbólgu → kaupmáttur varinn', (() => { const r = applyPolicies({ ...base, verdbolga: 12 }, { verdtrygging: true }, bl); return r.kaupmattur > base.kaupmattur; })());
ok('höft: gengi-hrun dregið að grunni', (() => { const r = applyPolicies({ ...base, gengi: -30 }, { hoft: true }, bl); return r.gengi > -30 && r.hagvoxtur < 2; })());
ok('engir rofar → óbreytt', (() => { const r = applyPolicies(base, {}, bl); return r.skuldir === 40 && r.hagvoxtur === 2; })());

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
