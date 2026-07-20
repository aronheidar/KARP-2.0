import { simulate, deviationOf } from './engine.mjs';
let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }

// Fixture: 1 lever (vextir base 8), 1 outcome (verdbolga BAU flat 4), 1 link vextir→verdbolga coef -0.15 lag 2
const baseline = {
  quarters: 6,
  levers: { vextir: { base: 8, min: 0, max: 15, step: 0.25, unit: '%', label: 'Vextir' } },
  shocks: { olia: { base: 0, min: -50, max: 100, step: 5, unit: '%', label: 'Olía' } },
  outcomes: {
    verdbolga: { label: 'Verðbólga', unit: '%', path: [4, 4, 4, 4, 4, 4] },
    laun: { label: 'Laun', unit: '%', path: [6, 6, 6, 6, 6, 6] },
  },
  clamp: { verdbolga: [0, 25] },
};
const links = [
  { id: 'r_infl', from: 'vextir', to: 'verdbolga', coef: -0.15, lag: 2, unit: 'pp', source: 'test', ci_lo: -0.25, ci_hi: -0.05 },
  { id: 'infl_laun', from: 'verdbolga', to: 'laun', coef: 0.4, lag: 1, unit: 'pp', source: 'test', ci_lo: 0.4, ci_hi: 0.4 },
];

// 1) Engin breyting → útkoma == grunnur
{
  const r = simulate({ baseline, links, levers: {}, shocks: {}, quarters: 6 });
  ok('no change → verdbolga == baseline', r.outcomes.verdbolga.mid.every((v, i) => approx(v, 4)));
  ok('lo == mid == hi when no deviation', r.outcomes.verdbolga.lo.every((v, i) => approx(v, r.outcomes.verdbolga.mid[i])));
}
// 2) +2pp vextir → −0.15*2 = −0.30 áhrif, en AÐEINS frá ársfj. index 2 (lag 2)
{
  const r = simulate({ baseline, links, levers: { vextir: 10 }, shocks: {}, quarters: 6 });
  ok('lag: q0,q1 unchanged', approx(r.outcomes.verdbolga.mid[0], 4) && approx(r.outcomes.verdbolga.mid[1], 4));
  ok('lag: q2 = 4 + (-0.15*2) = 3.70', approx(r.outcomes.verdbolga.mid[2], 3.70));
  ok('band at q2 = ((-0.05 - -0.25)/2)*|2| = 0.20', approx(r.outcomes.verdbolga.lo[2], 3.50) && approx(r.outcomes.verdbolga.hi[2], 3.90));
}
// 3) Feedback: verdbolga(dev)→laun með lag 1 (laun færist eftir að verðbólga hreyfist)
{
  const r = simulate({ baseline, links, levers: { vextir: 10 }, shocks: {}, quarters: 6 });
  // verðbólgu-frávik fyrst í q2 (−0.30); laun frávik = 0.4*(−0.30) í q3
  ok('feedback: laun q2 unchanged', approx(r.outcomes.laun.mid[2], 6));
  ok('feedback: laun q3 = 6 + 0.4*(-0.30) = 5.88', approx(r.outcomes.laun.mid[3], 5.88));
}
// 4) clamp virkar
{
  const b2 = JSON.parse(JSON.stringify(baseline)); b2.outcomes.verdbolga.path = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const r = simulate({ baseline: b2, links, levers: { vextir: 20 }, shocks: {}, quarters: 6 });
  ok('clamp: verdbolga never < 0', r.outcomes.verdbolga.lo.every((v) => v >= 0));
}
// 5) deviationOf: lever/shock/outcome
{
  const ctx = { levers: { vextir: { base: 8, value: 10 } }, shocks: { olia: { base: 0, value: 25 } }, dev: { verdbolga: [0, -0.3, -0.3] } };
  ok('deviationOf lever', approx(deviationOf('vextir', 0, ctx), 2));
  ok('deviationOf shock', approx(deviationOf('olia', 0, ctx), 25));
  ok('deviationOf outcome', approx(deviationOf('verdbolga', 1, ctx), -0.3));
}

console.log(`\nROADS engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
