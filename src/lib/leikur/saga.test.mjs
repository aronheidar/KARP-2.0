import { SAGA, sagaFyrirLotu, raunKpiLotu, berSamanAkvardanir } from './saga.mjs';
import { REALITY, ROUNDS, YEAR_START } from './game-config.mjs';
import { POLICIES } from './policies.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const byId = Object.fromEntries(POLICIES.map((p) => [p.id, p]));
const finna = (list, id) => list.find((x) => x.id === id);

// ── SAGA grunnform ──────────────────────────────────────────────────────────
ok('SAGA.length === 8 (== ROUNDS)', SAGA.length === 8 && SAGA.length === ROUNDS);
SAGA.forEach((s, i) => {
  const vaent = `${YEAR_START + i * 4}–${YEAR_START + (i + 1) * 4}`;
  ok(`timabil lotu ${i + 1} = ${vaent}`, s.timabil === vaent);
  ok(`lota ${i + 1}: rikisstjornir = non-empty strengja-fylki`,
    Array.isArray(s.rikisstjornir) && s.rikisstjornir.length > 0 && s.rikisstjornir.every((r) => typeof r === 'string' && r.length > 3));
  ok(`lota ${i + 1}: frasogn efnisleg (≥3 setningar)`,
    typeof s.frasogn === 'string' && s.frasogn.length > 150 && (s.frasogn.match(/\./g) || []).length >= 3);
  ok(`lota ${i + 1}: raunAkvardanir er fylki`, Array.isArray(s.raunAkvardanir));
});

// ── raunAkvardanir: öll id+val til í POLICIES (ítrað) ───────────────────────
for (const s of SAGA) for (const a of s.raunAkvardanir) {
  const p = byId[a.id];
  ok(`${s.timabil} ${a.id}: id til í POLICIES`, !!p);
  if (!p) continue;
  const gilt = a.val == null
    || (p.kind === 'toggle' && typeof a.val === 'boolean')
    || (p.kind === 'choice' && (p.options || []).some((o) => o.key === a.val));
  ok(`${s.timabil} ${a.id}: val ${JSON.stringify(a.val)} gilt f. ${p.kind}`, gilt);
  ok(`${s.timabil} ${a.id}: texti fylgir`, typeof a.texti === 'string' && a.texti.length > 10);
  ok(`${s.timabil} ${a.id}: ar er ártal eða null`, a.ar === null || (Number.isInteger(a.ar) && a.ar >= 2000 && a.ar <= 2032));
}

// ── Sagnfræðilegar staðsetningar ────────────────────────────────────────────
const l1 = SAGA[0], l3 = SAGA[2], l4 = SAGA[3], l5 = SAGA[4];
ok('lota 1: bankar=einka 2003', !!l1.raunAkvardanir.find((a) => a.id === 'bankar' && a.val === 'einka' && a.ar === 2003));
ok('lota 1: stjoridja=reisa 2003', !!l1.raunAkvardanir.find((a) => a.id === 'stjoridja' && a.val === 'reisa' && a.ar === 2003));
ok('lota 2: fjarmalaregluverk=losa', !!SAGA[1].raunAkvardanir.find((a) => a.id === 'fjarmalaregluverk' && a.val === 'losa'));
ok('lota 3 (2008–12): hoft=true 2008', !!l3.raunAkvardanir.find((a) => a.id === 'hoft' && a.val === true && a.ar === 2008));
ok('lota 3 (2008–12): esb=true 2009', !!l3.raunAkvardanir.find((a) => a.id === 'esb' && a.val === true && a.ar === 2009));
ok('lota 3 (2008–12): icesave=reject (þjóðaratkvæðin 2010/2011)',
  !!l3.raunAkvardanir.find((a) => a.id === 'icesave' && a.val === 'reject' && (a.ar === 2010 || a.ar === 2011)));
ok('lota 4 (2012–16): esb=false 2015', !!l4.raunAkvardanir.find((a) => a.id === 'esb' && a.val === false && a.ar === 2015));
ok('lota 5 (2016–20): hoft=false 2017', !!l5.raunAkvardanir.find((a) => a.id === 'hoft' && a.val === false && a.ar === 2017));
ok('verdtrygging skjalfest sem ÓRÁÐIN (val=null) — ekkert afnám í raun',
  SAGA.some((s) => s.raunAkvardanir.some((a) => a.id === 'verdtrygging' && a.val === null)));
ok('engin raunAkvordun eftir lotu 5 (framtíðin óskrifuð)', SAGA.slice(5).every((s) => s.raunAkvardanir.length === 0));

// ── sagaFyrirLotu ───────────────────────────────────────────────────────────
ok('sagaFyrirLotu(1) === SAGA[0]', sagaFyrirLotu(1) === SAGA[0]);
ok('sagaFyrirLotu(8) === SAGA[7]', sagaFyrirLotu(8) === SAGA[7]);
ok('sagaFyrirLotu utan marka → null', sagaFyrirLotu(0) === null && sagaFyrirLotu(9) === null && sagaFyrirLotu(null) === null && sagaFyrirLotu('x') === null);

// ── raunKpiLotu: vörpun REALITY→lota (lok lotu r = ár YEAR_START + r*4 → vísitala r*4) ──
for (let r = 1; r <= 6; r++) {
  const k = raunKpiLotu(r);
  ok(`raunKpiLotu(${r}): tölur f. verdbolga/hagvoxtur/atvinnuleysi/skuldir`,
    k && ['verdbolga', 'hagvoxtur', 'atvinnuleysi', 'skuldir'].every((key) => typeof k[key] === 'number'));
}
ok('raunKpiLotu(7) og (8) hrynja ekki og skila hlut', !!raunKpiLotu(7) && !!raunKpiLotu(8));
ok('vörpun: lok lotu 1 (2004) = REALITY[4]', raunKpiLotu(1).verdbolga === REALITY.verdbolga[4] && raunKpiLotu(1).hagvoxtur === REALITY.hagvoxtur[4]);
ok('vörpun: lok lotu 2 (2008) = REALITY[8] (hrun-árið, verðbólga 12,7)', raunKpiLotu(2).verdbolga === REALITY.verdbolga[8] && raunKpiLotu(2).verdbolga === 12.7);
ok('vörpun: lok lotu 3 (2012) = REALITY[12]', raunKpiLotu(3).skuldir === REALITY.skuldir[12]);
ok('vörpun: lok lotu 8 (2032) = REALITY[32]', raunKpiLotu(8).skuldir === REALITY.skuldir[32]);
ok('kaupmattur ekki í REALITY → null', raunKpiLotu(1).kaupmattur === null && raunKpiLotu(8).kaupmattur === null);
ok('raunKpiLotu utan marka → null', raunKpiLotu(0) === null && raunKpiLotu(9) === null);

// ── berSamanAkvardanir ──────────────────────────────────────────────────────
// Lið sem einkavæddi banka = eins:true; lið sem þjóðnýtti = eins:false (raun = einka 2003).
const bEinka = finna(berSamanAkvardanir(4, { bankar: 'einka' }), 'bankar');
ok('bankar: lið einkavæddi → eins:true', bEinka && bEinka.thitt === 'einka' && bEinka.raun === 'einka' && bEinka.eins === true);
const bThjod = finna(berSamanAkvardanir(4, { bankar: 'thjod' }), 'bankar');
ok('bankar: lið þjóðnýtti → eins:false', bThjod && bThjod.thitt === 'thjod' && bThjod.raun === 'einka' && bThjod.eins === false);

// Tóm policyStates → thitt null (og eins null) alls staðar.
const tomt = berSamanAkvardanir(3, {});
ok('tóm policyStates → thitt null alls staðar', tomt.length === POLICIES.length && tomt.every((e) => e.thitt === null && e.eins === null));
ok('færslur bera icon+label úr POLICIES', tomt.every((e) => e.icon === byId[e.id].icon && e.label === byId[e.id].label));

// Uppsöfnun og yfirskrift raun-vals: hoft true í lotu 3–4 → false frá lotu 5; esb true í lotu 3 → false frá lotu 4.
ok('raun hoft=true eftir lotu 3', finna(tomt, 'hoft').raun === true);
ok('raun hoft=true eftir lotu 4', finna(berSamanAkvardanir(4, {}), 'hoft').raun === true);
ok('raun hoft=false eftir lotu 5 (afnám 2017)', finna(berSamanAkvardanir(5, {}), 'hoft').raun === false);
ok('raun esb=true eftir lotu 3, false eftir lotu 4', finna(tomt, 'esb').raun === true && finna(berSamanAkvardanir(4, {}), 'esb').raun === false);
ok('raun icesave=reject eftir lotu 3 og 4', finna(tomt, 'icesave').raun === 'reject' && finna(berSamanAkvardanir(4, {}), 'icesave').raun === 'reject');
ok('lota 1: raun bankar=einka + stjoridja=reisa, esb enn null',
  finna(berSamanAkvardanir(1, {}), 'bankar').raun === 'einka'
  && finna(berSamanAkvardanir(1, {}), 'stjoridja').raun === 'reisa'
  && finna(berSamanAkvardanir(1, {}), 'esb').raun === null);

// Höft: lið með höft í lotu 3 = eins raun; sama lið í lotu 5 = ekki eins (raunin afnam 2017).
ok('hoft: lið á höftum í lotu 3 → eins:true', finna(berSamanAkvardanir(3, { hoft: true }), 'hoft').eins === true);
ok('hoft: lið enn á höftum í lotu 5 → eins:false', finna(berSamanAkvardanir(5, { hoft: true }), 'hoft').eins === false);
ok('hoft: lið afnam líka → eins:true í lotu 5', finna(berSamanAkvardanir(5, { hoft: false }), 'hoft').eins === true);

// Verðtrygging: ekkert raun-val → eins alltaf null, jafnvel þó lið hafi ákveðið.
const vt = finna(berSamanAkvardanir(8, { verdtrygging: true }), 'verdtrygging');
ok('verdtrygging: raun null + eins null þrátt fyrir ákvörðun liðs', vt.thitt === true && vt.raun === null && vt.eins === null);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
