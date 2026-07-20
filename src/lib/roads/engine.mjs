// ROADS Íslands — hrein tímaskref-vél (isomorphic: node + vafri).
// Módel = gögn (baseline + links). Skilar ferlum m/óvissu-böndum (jaðra-samsetning).
// Frávik: vogarstöng = gildi−base (fast yfir t); sjokk = gildi (base 0); útkoma = tafið mið-frávik.
// Regla: útkoma→útkoma tengsl verða að hafa lag ≥ 1.
// ÓLÍNULEIKI (valkvæður, afturvirkt-samhæfður): tengsl mega hafa `nl`-svið:
//   {type:'sat', k}    → mettun (minnkandi ávöxtun): áhrif = k·tanh(coef·frávik/k). Lítið frávik ≈ línulegt.
//   {type:'accel', at, by, cap} → hröðun yfir þröskuld (t.d. skuldakreppa/þensla): áhrif = coef·frávik·min(cap, 1+by·max(0,|coef·frávik|−at)).
// Án `nl` er tengslið HREINT LÍNULEGT (öll fyrri tengsl óbreytt → öll próf standast).

export function applyNL(x, nl) {
  if (!nl) return x;
  if (nl.type === 'sat') return nl.k * Math.tanh(x / nl.k);
  if (nl.type === 'accel') return x * Math.min(nl.cap ?? 2.5, 1 + nl.by * Math.max(0, Math.abs(x) - nl.at));
  return x;
}

// Tímaháð leið: vogarstöng/sjokk mega vera fylki (gildi per skref) — dýnamísk bestun.
// Fylki styttra en Q → heldur síðasta gildi. Tala = fast yfir tímann (afturvirkt-samhæft).
function atStep(v, s) { return Array.isArray(v) ? (v[s] ?? v[v.length - 1]) : v; }
export function deviationOf(from, s, ctx) {
  const { levers, shocks, dev } = ctx;
  if (levers && from in levers) return atStep(levers[from].value, s) - levers[from].base;
  if (shocks && from in shocks) return atStep(shocks[from].value, s);
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
        // Framsýnar væntingar: `lead` → viðbrögð við VÆNTRI BREYTINGU boðaðrar exogenrar leiðar (framtíð − nú).
        // 0 fyrir fasta leið (afturvirkt-samhæft); bítur aðeins þegar stýring er tímaháð/boðuð. Aðeins exogen uppspretta.
        if (ln.lead && ((L && ln.from in L) || (S && ln.from in S))) {
          const anticip = deviationOf(ln.from, t + ln.lead, ctx) - deviationOf(ln.from, t, ctx);
          d += applyNL(ln.coef * anticip, ln.nl);
          const band = ((ln.ci_hi ?? ln.coef) - (ln.ci_lo ?? ln.coef)) / 2;
          u += Math.abs(band * anticip);
          continue;
        }
        const s = t - (ln.lag || 0);
        if (s < 0) continue;
        const fd = deviationOf(ln.from, s, ctx);
        d += applyNL(ln.coef * fd, ln.nl);
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
