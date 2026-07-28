import { POLICIES, policyAvailable, policyStates, applyPolicies, policyApproval } from './policies.mjs';
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

// nýjar ákvarðanir — gluggar
ok('stóriðja gluggi KT2–3', policyAvailable(P.stjoridja, 2, {}) && policyAvailable(P.stjoridja, 3, {}) && !policyAvailable(P.stjoridja, 4, {}));
ok('fjármálaregluverk gluggi KT2–3', policyAvailable(P.fjarmalaregluverk, 2, {}) && !policyAvailable(P.fjarmalaregluverk, 4, {}));
ok('þjóðarsjóður KT5+', !policyAvailable(P.audlindasjodur, 4, {}) && policyAvailable(P.audlindasjodur, 5, {}) && policyAvailable(P.audlindasjodur, 8, {}));

// applyPolicies — áhrif
const base = { verdbolga: 2.5, gengi: 0, hagvoxtur: 2, skuldir: 40, atvinnuleysi: 4, kaupmattur: 1, vanskil: 100, byggdajofnudur: 100, losun: 100 };
const bl = { verdbolga: 2.5, gengi: 0, gengi_endo: 100, hagvoxtur: 2 };
ok('icesave pay: skuldir↑ hagvöxtur↑', (() => { const r = applyPolicies(base, { icesave: 'pay' }, bl); return r.skuldir === 47 && r.hagvoxtur > 2; })());
ok('icesave reject: hagvöxtur↓ verðbólga↑', (() => { const r = applyPolicies(base, { icesave: 'reject' }, bl); return r.hagvoxtur < 2 && r.verdbolga > 2.5; })());
ok('bankar einka: skuldir↓ vöxtur↑ vanskil↑', (() => { const r = applyPolicies(base, { bankar: 'einka' }, bl); return r.skuldir === 36 && r.hagvoxtur > 2 && r.vanskil > 100; })());
ok('verðtrygging afnumin í hárri verðbólgu → kaupmáttur varinn', (() => { const r = applyPolicies({ ...base, verdbolga: 12 }, { verdtrygging: true }, bl); return r.kaupmattur > base.kaupmattur; })());
ok('höft: gengi-hrun dregið að grunni', (() => { const r = applyPolicies({ ...base, gengi: -30 }, { hoft: true }, bl); return r.gengi > -30 && r.hagvoxtur < 2; })());
ok('engir rofar → óbreytt', (() => { const r = applyPolicies(base, {}, bl); return r.skuldir === 40 && r.hagvoxtur === 2; })());
// nýjar ákvarðanir — fórnarskipti (mörg KPI)
ok('stóriðja reisa: vöxtur+byggð+störf EN losun↑', (() => { const r = applyPolicies(base, { stjoridja: 'reisa' }, bl); return r.hagvoxtur > 2 && r.byggdajofnudur > 100 && r.atvinnuleysi < 4 && r.losun > 100; })());
ok('stóriðja hafna: losun↓ EN vöxtur↓', (() => { const r = applyPolicies(base, { stjoridja: 'hafna' }, bl); return r.losun < 100 && r.hagvoxtur < 2; })());
ok('fjármál losa: uppgangur+kaupmáttur EN vanskil↑', (() => { const r = applyPolicies(base, { fjarmalaregluverk: 'losa' }, bl); return r.hagvoxtur > 2 && r.kaupmattur > 1 && r.vanskil > 100; })());
ok('fjármál aðhald: vanskil↓ EN vöxtur↓', (() => { const r = applyPolicies(base, { fjarmalaregluverk: 'adhald' }, bl); return r.vanskil < 100 && r.hagvoxtur < 2; })());
ok('þjóðarsjóður: skuldir↓ EN kaupmáttur↓', (() => { const r = applyPolicies(base, { audlindasjodur: true }, bl); return r.skuldir < 40 && r.kaupmattur < 1; })());
ok('icesave reject sparar líka skuldir', applyPolicies(base, { icesave: 'reject' }, bl).skuldir < 40);
ok('verðtrygging léttir á heimilum líka í eðlilegri verðbólgu', applyPolicies(base, { verdtrygging: true }, bl).kaupmattur > 1);

// policyApproval — bein fylgis-áhrif
ok('Icesave hafna → jákvætt fylgi', policyApproval({ icesave: 'reject' }) > 0);
ok('Icesave greiða → neikvætt fylgi', policyApproval({ icesave: 'pay' }) < 0);
ok('afnema verðtryggingu → jákvætt fylgi', policyApproval({ verdtrygging: true }) > 0);
ok('einkavæða banka → neikvætt fylgi', policyApproval({ bankar: 'einka' }) < 0);
ok('engir rofar → 0 fylgi', policyApproval({}) === 0);
ok('samlegð margra rofa', policyApproval({ icesave: 'reject', verdtrygging: true }) === 8 + 6);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
