import { ROLES, mandateForRole, assignRoles, roleById, revealRoles } from './roles.mjs';
import { MANDATE } from './game-config.mjs';
import { scoreRound } from './scoring.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const kpiKeys = new Set(MANDATE.kpis.map((k) => k.key));

// (1) allir weights/overrides-lyklar ∈ MANDATE kpi-lyklum
let allKeysValid = true;
for (const r of ROLES) {
  for (const k of Object.keys(r.weights || {})) if (!kpiKeys.has(k)) allKeysValid = false;
  for (const k of Object.keys(r.overrides || {})) if (!kpiKeys.has(k)) allKeysValid = false;
}
ok('weights/overrides-lyklar ∈ MANDATE', allKeysValid);

// (2) mandateForRole setur weight 3 á verðbólgu f. haukur
const mh = mandateForRole(MANDATE, roleById('verdbolgu_haukur'));
ok('haukur: verðbólga weight 3', mh.kpis.find((k) => k.key === 'verdbolga').weight === 3);
ok('haukur: aðrar KPI weight 1', mh.kpis.filter((k) => k.key !== 'verdbolga').every((k) => k.weight === 1));

// (3) vaxtar_stjorn bræðir band 2.0 á verðbólgu + weight 3 á hagvöxt
const mv = mandateForRole(MANDATE, roleById('vaxtar_stjorn'));
ok('vaxtar: hagvöxtur weight 3', mv.kpis.find((k) => k.key === 'hagvoxtur').weight === 3);
ok('vaxtar: verðbólgu band 2.0 (override)', mv.kpis.find((k) => k.key === 'verdbolga').band === 2.0);
ok('vaxtar: verðbólgu target óbreytt', mv.kpis.find((k) => k.key === 'verdbolga').target === 2.5);
ok('fjármála: skuldaþak 35 (override)', mandateForRole(MANDATE, roleById('fjarmala_vardstjori')).kpis.find((k) => k.key === 'skuldir').max === 35);

// (4) mandateForRole(base,null) === base
ok('null hlutverk → base óbreytt', mandateForRole(MANDATE, null) === MANDATE);

// (5) assignRoles round-robin vefst
const am = assignRoles([10, 11, 12, 13, 14], ROLES);
ok('assignRoles 5 lið → id14 vefst á roles[0]', am[14] === ROLES[0].id && am[10] === ROLES[0].id && am[11] === ROLES[1].id);
ok('assignRoles fyllir öll fyrstu 4 hlutverk', new Set([am[10], am[11], am[12], am[13]]).size === 4);

// (6) revealRoles skilar label/blurb raðað eftir teamId
const rev = revealRoles({ 12: 'velferdar_sinni', 10: 'verdbolgu_haukur' });
ok('revealRoles raðað eftir teamId', rev[0].teamId === 10 && rev[1].teamId === 12);
ok('revealRoles hefur label+blurb', rev[0].label === 'Verðbólgu-haukur' && rev[0].blurb.length > 0);

// (7) score-diff: sama kpis en ólíkur composite v/ vigtir+override
const sampleKpis = { verdbolga: 4.5, atvinnuleysi: 4, skuldir: 38, hagvoxtur: 2 };
const s0 = scoreRound(sampleKpis, mandateForRole(MANDATE, ROLES[0])).composite;
const s1 = scoreRound(sampleKpis, mandateForRole(MANDATE, ROLES[1])).composite;
ok('sama kpis → ólíkur composite (haukur vs vaxtar)', s0 !== s1);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
