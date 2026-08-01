import { POLICIES, policyAvailable, policyStates, policyStatesMeta, policyStage, applyPolicies, policyDeltas, policyApproval } from './policies.mjs';
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

// policyStatesMeta — since = lotan þar sem NÚVERANDI staða var fyrst sett (F1-V2)
const m1 = policyStatesMeta([{}, {}, {}, { policies: { esb: true } }]);
ok('meta: toggle sett í lotu 4 → since 4', m1.states.esb === true && m1.since.esb === 4);
const m2 = policyStatesMeta([{ policies: { hoft: true } }, { policies: { hoft: false } }, {}, { policies: { hoft: true } }]);
ok('meta: toggle af og á aftur → since = seinni kveikjan (4)', m2.states.hoft === true && m2.since.hoft === 4);
ok('meta: endurtekin SAMA stilling færir since ekki', policyStatesMeta([{ policies: { hoft: true } }, { policies: { hoft: true } }]).since.hoft === 1);
const m3 = policyStatesMeta([{ policies: { icesave: 'pay' } }, { policies: { icesave: 'reject' } }]);
ok('meta: choice fyrsta varanleg + since = 1', m3.states.icesave === 'pay' && m3.since.icesave === 1);
ok('meta: history-item með .round notar hann', policyStatesMeta([{ round: 3, policies: { esb: true } }]).since.esb === 3);
ok('meta: states ≡ policyStates (bakvirkni)', (() => { const h = [{ policies: { hoft: true, icesave: 'pay' } }, { policies: { hoft: false } }]; return JSON.stringify(policyStatesMeta(h).states) === JSON.stringify(policyStates(h)); })());

// policyStage — ESB-lífsferill (F1-V2)
ok('stage: esb umsokn í töku-lotunni', policyStage('esb', { esb: true }, { esb: 4 }, 4) === 'umsokn');
ok('stage: esb adild næstu lotu og áfram', policyStage('esb', { esb: true }, { esb: 4 }, 5) === 'adild' && policyStage('esb', { esb: true }, { esb: 4 }, 7) === 'adild');
ok('stage: esb ursogn lotuna sem slökkt er', policyStage('esb', { esb: false }, { esb: 6 }, 6) === 'ursogn');
ok('stage: esb slökkt í fortíð → null (ekkert stig)', policyStage('esb', { esb: false }, { esb: 6 }, 7) === null);
ok('stage: aðrar virkar ákvarðanir → virk', policyStage('hoft', { hoft: true }, { hoft: 3 }, 5) === 'virk' && policyStage('icesave', { icesave: 'pay' }, { icesave: 4 }, 6) === 'virk');
ok('stage: óvirk → null', policyStage('hoft', { hoft: false }, { hoft: 3 }, 5) === null && policyStage('esb', {}, {}, 4) === null);

// applyPolicies með stages — ESB-lífsferill (F1-V2); án stages er hegðun óbreytt (prófin hér að ofan sanna það)
const base8 = { ...base, verdbolga: 8 }; // verðbólga fjarri grunni → full ESB-áhrif sjást greinilega
ok('esb umsokn: AÐEINS hagvöxtur −0.1 (engin stöðugleika-/skulda-áhrif)', (() => { const r = applyPolicies(base8, { esb: true }, bl, { esb: 'umsokn' }); return Math.abs(r.hagvoxtur - 1.9) < 1e-9 && r.verdbolga === 8 && r.skuldir === 40; })());
ok('esb ursogn: högg (hagvöxtur −0.4, verðbólga +0.3) og ENGIN ESB-áhrif', (() => { const r = applyPolicies(base8, { esb: false }, bl, { esb: 'ursogn' }); return Math.abs(r.hagvoxtur - 1.6) < 1e-9 && Math.abs(r.verdbolga - 8.3) < 1e-9 && r.skuldir === 40; })());
ok('esb adild um stages: full áhrif — eins og án stages', (() => { const a = applyPolicies(base8, { esb: true }, bl, { esb: 'adild' }); const b = applyPolicies(base8, { esb: true }, bl); return JSON.stringify(a) === JSON.stringify(b) && a.skuldir === 38; })());

// policyDeltas — framlag hverrar virkrar ákvörðunar með diffi (F1-V2)
const pd = policyDeltas(base8, { esb: true }, bl);
ok('deltas: esb-adild {verdbolga−, skuldir:-2, hagvoxtur:-0.2}', pd.esb && pd.esb.skuldir === -2 && pd.esb.hagvoxtur === -0.2 && pd.esb.verdbolga < -1);
ok('deltas: umsokn-stig → aðeins {hagvoxtur:-0.1}', (() => { const d = policyDeltas(base8, { esb: true }, bl, { esb: 'umsokn' }); return d.esb && d.esb.hagvoxtur === -0.1 && Object.keys(d.esb).length === 1; })());
ok('deltas: virk ákvörðun með engin áhrif → {} (EKKI sleppt)', (() => { const d = policyDeltas({ verdbolga: 2.5 }, { audlindasjodur: true }, bl); return 'audlindasjodur' in d && Object.keys(d.audlindasjodur).length === 0; })());
ok('deltas: óvirk (false/ósett) ákvörðun ekki með', (() => { const d = policyDeltas(base, { hoft: false, icesave: 'pay' }, bl); return !('hoft' in d) && ('icesave' in d); })());
ok('deltas: margar virkar → framlag hverrar aðgreint', (() => { const d = policyDeltas(base, { icesave: 'pay', bankar: 'einka' }, bl); return d.icesave.skuldir === 7 && d.bankar.skuldir === -4 && d.bankar.vanskil === 3; })());
ok('deltas: ~0-framlag síað út (gengi við grunn)', (() => { const d = policyDeltas(base8, { esb: true }, bl); return !('gengi' in d.esb); })());

// policyApproval — bein fylgis-áhrif
ok('Icesave hafna → jákvætt fylgi', policyApproval({ icesave: 'reject' }) > 0);
ok('Icesave greiða → neikvætt fylgi', policyApproval({ icesave: 'pay' }) < 0);
ok('afnema verðtryggingu → jákvætt fylgi', policyApproval({ verdtrygging: true }) > 0);
ok('einkavæða banka → neikvætt fylgi', policyApproval({ bankar: 'einka' }) < 0);
ok('engir rofar → 0 fylgi', policyApproval({}) === 0);
ok('samlegð margra rofa', policyApproval({ icesave: 'reject', verdtrygging: true }) === 8 + 6);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
