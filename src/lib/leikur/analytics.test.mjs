import { buildAnalytics, teachingPrompts, teamReview } from './analytics.mjs';
import { THOKA_HANDBOOK } from './handbook.mjs';
import { MANDATE, DECISIONS, SCENARIO } from './game-config.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const teams = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
const perKpi = (v) => MANDATE.kpis.map((k) => ({ key: k.key, label: k.label, value: 0, score: v }));
const history = [
  { round: 1, teamId: 1, roundScore: 80, cumulative: 80, perKpi: perKpi(80) },
  { round: 1, teamId: 2, roundScore: 90, cumulative: 90, perKpi: perKpi(90) },
  { round: 2, teamId: 1, roundScore: 85, cumulative: 165, perKpi: perKpi(85) },
  { round: 2, teamId: 2, roundScore: 60, cumulative: 150, perKpi: perKpi(60) },
];
const decisions = [
  { round: 2, teamId: 1, decisions: { peningastefna: 'slaka2', utgjold: 'orvun2', skattar: 'obreytt', fjarfesting: 'innvidir', vidbragd: 'herda' } },
  { round: 2, teamId: 2, decisions: { peningastefna: 'herda2', utgjold: 'adhald2', skattar: 'haekka2', fjarfesting: 'engin', vidbragd: 'leyfa' } },
];
const a = buildAnalytics({ history, decisions, teams, mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: 2 });

ok('scorecard 2 lið', a.scorecard.length === 2);
ok('scorecard raðað eftir cumulative (A=165 fyrst)', a.scorecard[0].teamId === 1 && a.scorecard[0].cumulative === 165);
ok('scorecard perKpi 4 stig', a.scorecard[0].perKpi.length === 4 && a.scorecard[0].perKpi[0].score === 85);
ok('decisionsTable 2 lið', a.decisionsTable.length === 2);
const t1 = a.decisionsTable.find((r) => r.teamId === 1);
ok('#1 optLabel leyst (Slaka mikið)', t1.choices.find((c) => c.decId === 'peningastefna').optLabel === 'Slaka mikið');
ok('#5 vidbragd leyst úr scenario (Herða lánþegaskilyrði (DSTI↓))', t1.choices.find((c) => c.decId === 'vidbragd').optLabel === 'Herða lánþegaskilyrði (DSTI↓)');
ok('trajectories.cumulative 2 línur', a.trajectories.cumulative.length === 2);
ok('cumulative A 2 punktar (r1,r2)', a.trajectories.cumulative.find((s) => s.teamId === 1).points.length === 2);
ok('byKpi hefur 4 KPI', Object.keys(a.trajectories.byKpi).length === 4);
ok('byKpi verdbolga hefur línu per lið', a.trajectories.byKpi.verdbolga.series.length === 2);
const a1 = buildAnalytics({ history: history.filter((h) => h.round === 1), decisions: [], teams, mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: 1 });
ok('1 umferð → cumulative 1 punktur', a1.trajectories.cumulative[0].points.length === 1);
ok('engin ákvörðun → optLabel —', a1.decisionsTable[0].choices[0].optLabel === '—');
// STUDIO: decisionsTable sýnir breytta-sleða-samantekt
const sLeverBase = { vextir: 7.75, utgjold: 1450 };
const sDecisions = [
  // team1 sendir fullt ástand: vextir breytt (9.5), utgjold á grunni (1450 → á að síast burt)
  { round: 1, teamId: 1, decisions: { levers: { vextir: 9.5, utgjold: 1450 } } },
  { round: 1, teamId: 2, decisions: { levers: { vextir: 7.75 } } },
];
const sa = buildAnalytics({ history: history.filter((h) => h.round === 1), decisions: sDecisions, teams, mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: 1, mode: 'studio', leverLabels: { vextir: 'Stýrivextir', utgjold: 'Ríkisútgjöld' }, leverBase: sLeverBase });
ok('studio: decisionsTable studio-merkt', sa.decisionsTable.every((r) => r.studio === true));
ok('studio: samantekt sýnir breyttan sleða', sa.decisionsTable.find((r) => r.teamId === 1).summary.includes('Stýrivextir 9.5'));
ok('studio: grunn-gildi síast burt úr samantekt', !sa.decisionsTable.find((r) => r.teamId === 1).summary.includes('Ríkisútgjöld'));
ok('studio: allt á grunni → —', sa.decisionsTable.find((r) => r.teamId === 2).summary === '—');

// #6 teachingPrompts
const scEv = SCENARIO.events.map((e) => ({ round: e.round, icon: e.icon, title: e.title }));
const tp = teachingPrompts(a, { scenarioEvents: scEv });
ok('teachingPrompts skilar fylki', Array.isArray(tp));
ok('teachingPrompts ≤ 5', tp.length <= 5);
ok('teachingPrompts nefnir forystu (A vs B)', tp.some((p) => p.includes('A') && p.includes('B')));
// Sameiginlegur veikleiki: bæði lið mjög lág í öllu
const lowHist = [ { round: 1, teamId: 1, cumulative: 20, perKpi: perKpi(20) }, { round: 1, teamId: 2, cumulative: 25, perKpi: perKpi(25) } ];
const lowA = buildAnalytics({ history: lowHist, decisions: [], teams, mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: 1 });
ok('teachingPrompts greinir sameiginlegan veikleika', teachingPrompts(lowA, { scenarioEvents: scEv }).some((p) => p.includes('erfitt með')));
// Tóm greining → tómt
ok('teachingPrompts tóm greining → tómt', teachingPrompts(null).length === 0);
// „Hagstjórn í þoku": thoka=true → tvær þoku-debrief-spurningar úr THOKA_HANDBOOK FREMST; thoka=false/sleppt → engin.
{
  const tpT = teachingPrompts(a, { scenarioEvents: scEv, thoka: true });
  const tpF = teachingPrompts(a, { scenarioEvents: scEv, thoka: false });
  ok('þoka: nákvæmlega 2 þoku-spurningar bætast við', tpT.length === tpF.length + 2 && tpT.filter((p) => p.includes('Í þoku')).length === 2);
  ok('þoka: þoku-spurningarnar eru fremstar', tpT[0].includes('Í þoku') && tpT[1].includes('Í þoku'));
  ok('þoka: texti = THOKA_HANDBOOK.debrief_spurningar[0..1]', tpT[0].includes(THOKA_HANDBOOK.debrief_spurningar[0]) && tpT[1].includes(THOKA_HANDBOOK.debrief_spurningar[1]));
  ok('þoka: hin promptin óbreytt á eftir', JSON.stringify(tpT.slice(2)) === JSON.stringify(tpF));
  ok('þoka: sjálfgefið (flagg sleppt) = engin þoku-spurning', !tp.some((p) => p.includes('Í þoku')));
  ok('þoka: tóm greining → tómt þótt thoka=true (engar lotur = engin umræða)', teachingPrompts(null, { thoka: true }).length === 0);
  ok('þoka: þakið 8 heldur', tpT.length <= 8);
}

// teamReview: sterk/veik svið + fylgi + föll
{
  const rounds = [
    { perKpi: [{ key: 'verdbolga', label: 'Verðbólga', score: 95 }, { key: 'losun', label: 'Losun', score: 40 }], approval: 60, fell: false },
    { perKpi: [{ key: 'verdbolga', label: 'Verðbólga', score: 90 }, { key: 'losun', label: 'Losun', score: 30 }], approval: 20, fell: true },
  ];
  const rev = teamReview([{ teamId: 1, name: 'A', rounds }]);
  ok('teamReview skilar liði', rev.length === 1 && rev[0].name === 'A');
  ok('teamReview: sterkt svið (verðbólga ~92)', rev[0].strong.some((d) => d.key === 'verdbolga' && d.avg >= 80));
  ok('teamReview: veikt svið (losun ~35)', rev[0].weak.some((d) => d.key === 'losun' && d.avg < 65));
  ok('teamReview: meðal-fylgi (60+20)/2=40', rev[0].avgApproval === 40);
  ok('teamReview: taldi 1 fall', rev[0].fell === 1);
  ok('teamReview: tómt lið án hruns/veikra', (() => { const r = teamReview([{ teamId: 2, name: 'B', rounds: [{ perKpi: [{ key: 'verdbolga', label: 'V', score: 100 }], approval: 70, fell: false }] }])[0]; return r.fell === 0 && r.weak.length === 0 && r.strong.length === 1; })());
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
