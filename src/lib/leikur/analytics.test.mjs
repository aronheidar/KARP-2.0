import { buildAnalytics } from './analytics.mjs';
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
  { round: 2, teamId: 1, decisions: { peningastefna: 'slaka2', utgjold: 'orvun2', skattar: 'obreytt', fjarfesting: 'innvidir', vidbragd: 'kolefni' } },
  { round: 2, teamId: 2, decisions: { peningastefna: 'herda2', utgjold: 'adhald2', skattar: 'haekka2', fjarfesting: 'engin', vidbragd: 'absorb' } },
];
const a = buildAnalytics({ history, decisions, teams, mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: 2 });

ok('scorecard 2 lið', a.scorecard.length === 2);
ok('scorecard raðað eftir cumulative (A=165 fyrst)', a.scorecard[0].teamId === 1 && a.scorecard[0].cumulative === 165);
ok('scorecard perKpi 4 stig', a.scorecard[0].perKpi.length === 4 && a.scorecard[0].perKpi[0].score === 85);
ok('decisionsTable 2 lið', a.decisionsTable.length === 2);
const t1 = a.decisionsTable.find((r) => r.teamId === 1);
ok('#1 optLabel leyst (Slaka mikið)', t1.choices.find((c) => c.decId === 'peningastefna').optLabel === 'Slaka mikið');
ok('#5 vidbragd leyst úr scenario (Flýta orkuskiptum)', t1.choices.find((c) => c.decId === 'vidbragd').optLabel === 'Flýta orkuskiptum');
ok('trajectories.cumulative 2 línur', a.trajectories.cumulative.length === 2);
ok('cumulative A 2 punktar (r1,r2)', a.trajectories.cumulative.find((s) => s.teamId === 1).points.length === 2);
ok('byKpi hefur 4 KPI', Object.keys(a.trajectories.byKpi).length === 4);
ok('byKpi verdbolga hefur línu per lið', a.trajectories.byKpi.verdbolga.series.length === 2);
const a1 = buildAnalytics({ history: history.filter((h) => h.round === 1), decisions: [], teams, mandate: MANDATE, decisionsConfig: DECISIONS, scenario: SCENARIO, currentRound: 1 });
ok('1 umferð → cumulative 1 punktur', a1.trajectories.cumulative[0].points.length === 1);
ok('engin ákvörðun → optLabel —', a1.decisionsTable[0].choices[0].optLabel === '—');
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
