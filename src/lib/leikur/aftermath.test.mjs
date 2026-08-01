import { carryover } from './aftermath.mjs';
import { surpriseById } from './surprise.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// Ekkert að segja → null
ok('engar ákvarðanir + ekkert atvik → null', carryover({ policyStates: {}, prevEvent: null }) === null);
ok('false-rofi telst ekki virkur', carryover({ policyStates: { hoft: false } }) === null);

// Standandi rofar → arfleifðar-línur með texta
const c1 = carryover({ policyStates: { hoft: true, bankar: 'einka' } });
ok('virkir rofar → policies-línur', c1 && c1.policies.length === 2);
ok('rofa-lína hefur icon+label+texta', c1.policies.every((p) => p.icon && p.label && p.text && p.text.length > 10));
ok('choice-rofi notar rétta vals-lýsingu (einka)', c1.policies.find((p) => p.id === 'bankar').text.includes('Einkavæddu') || c1.policies.find((p) => p.id === 'bankar').text.includes('einkavæ'));

// Nýjar ákvarðanir hafa arfleifðar-texta
ok('stóriðja (reisa) arfleifð', carryover({ policyStates: { stjoridja: 'reisa' } }).policies[0].text.length > 10);
ok('þjóðarsjóður arfleifð', carryover({ policyStates: { audlindasjodur: true } }).policies[0].text.includes('sjóð'));

// Fyrra óvænt atvik → event-lína með vali
const ev = surpriseById('eldgos');
const c2 = carryover({ policyStates: {}, prevEvent: ev, prevChoiceKey: 'neydarfe' });
ok('fyrra atvik → event-lína', c2 && c2.event && c2.event.title === ev.title);
ok('event-lína hefur valið', c2.event.choice && c2.event.text.length > 10);
ok('event án vals er í lagi', (() => { const c = carryover({ prevEvent: ev }); return c.event && c.event.choice == null; })());

// Bæði saman
const c3 = carryover({ policyStates: { verdtrygging: true }, prevEvent: surpriseById('spilling'), prevChoiceKey: 'segjaaf' });
ok('bæði policies + event', c3.policies.length === 1 && c3.event && c3.event.id === 'spilling');

// F1-V2: deltas-kort ({id:{kpi:delta}}) berst áfram á policy-raðir
const c4 = carryover({ policyStates: { esb: true, hoft: true }, deltas: { esb: { verdbolga: -0.4, skuldir: -2 } } });
ok('deltas: röðin ber deltas', (() => { const p = c4.policies.find((x) => x.id === 'esb'); return p.deltas && p.deltas.skuldir === -2 && p.deltas.verdbolga === -0.4; })());
ok('deltas: röð utan kortsins fær ekki deltas', c4.policies.find((x) => x.id === 'hoft').deltas === undefined);
ok('deltas: tómt framlag ({}) berst samt (badge án talna)', (() => { const c = carryover({ policyStates: { hoft: true }, deltas: { hoft: {} } }); return c.policies[0].deltas && Object.keys(c.policies[0].deltas).length === 0; })());
ok('án deltas: röð óbreytt (ekkert deltas-svið)', carryover({ policyStates: { hoft: true } }).policies[0].deltas === undefined);
ok('deltas breyta ekki texta-arfleifðinni', c4.policies.every((p) => p.icon && p.label && p.text.length > 10));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
