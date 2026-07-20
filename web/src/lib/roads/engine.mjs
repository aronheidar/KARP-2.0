// ROADS Íslands — hrein tímaskref-vél (isomorphic: node + vafri).
// Módel = gögn (baseline + links). Skilar ferlum m/óvissu-böndum (jaðra-samsetning).
// Frávik: vogarstöng = gildi−base (fast yfir t); sjokk = gildi (base 0); útkoma = tafið mið-frávik.
// Regla: útkoma→útkoma tengsl verða að hafa lag ≥ 1.

export function deviationOf(from, s, ctx) {
  const { levers, shocks, dev } = ctx;
  if (levers && from in levers) return levers[from].value - levers[from].base;
  if (shocks && from in shocks) return shocks[from].value;
  if (dev && dev[from]) return dev[from][s] ?? 0;
  return 0;
}

export function simulate({ baseline, links, levers = {}, shocks = {}, quarters } = {}) {
  const Q = quarters ?? baseline.quarters;
  const outKeys = Object.keys(baseline.outcomes);
  const L = {}; for (const k in baseline.levers) L[k] = { base: baseline.levers[k].base, value: levers[k] ?? baseline.levers[k].base };
  const S = {}; for (const k in baseline.shocks) S[k] = { base: baseline.shocks[k].base, value: shocks[k] ?? baseline.shocks[k].base };
  const dev = {}, unc = {};
  for (const k of outKeys) { dev[k] = new Array(Q).fill(0); unc[k] = new Array(Q).fill(0); }
  const ctx = { levers: L, shocks: S, dev };
  const byTo = {};
  for (const ln of links) (byTo[ln.to] ||= []).push(ln);
  for (let t = 0; t < Q; t++) {
    for (const to of outKeys) {
      let d = 0, u = 0;
      for (const ln of (byTo[to] || [])) {
        const s = t - (ln.lag || 0);
        if (s < 0) continue;
        const fd = deviationOf(ln.from, s, ctx);
        d += ln.coef * fd;
        const band = ((ln.ci_hi ?? ln.coef) - (ln.ci_lo ?? ln.coef)) / 2;
        u += Math.abs(band * fd);
      }
      dev[to][t] = d; unc[to][t] = u;
    }
  }
  const outcomes = {};
  for (const k of outKeys) {
    const path = baseline.outcomes[k].path;
    const cl = (baseline.clamp || {})[k];
    const clamp = cl ? (v) => Math.max(cl[0], Math.min(cl[1], v)) : (v) => v;
    outcomes[k] = {
      label: baseline.outcomes[k].label,
      unit: baseline.outcomes[k].unit,
      baseline: path.slice(0, Q),
      mid: path.slice(0, Q).map((p, t) => clamp(p + dev[k][t])),
      lo: path.slice(0, Q).map((p, t) => clamp(p + dev[k][t] - unc[k][t])),
      hi: path.slice(0, Q).map((p, t) => clamp(p + dev[k][t] + unc[k][t])),
    };
  }
  return { quarters: Q, outcomes };
}
