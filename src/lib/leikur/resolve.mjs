// Úrlausn liðs: öll ákvörðunasaga → fylki-gild sleða/sjokk-leiðir → simulate → KPI við lokafjórðung.
// Uppsöfnun: #1-3 afstöður eru Δ á hlaupandi sleða-stig (klippt í [min,max]); #4 eins-árs púls; #5 viðbragð atburðar.
// Sjokk sviðsmyndar sett á fjórðunga umferðar. Vélin óbreytt (styður fylki-sleða gegnum atStep).
import { simulate } from '../roads/engine.mjs';
import { DECISIONS, SCENARIO as DEFAULT_SCENARIO, QUARTERS_PER_ROUND } from './game-config.mjs';

const DEC = Object.fromEntries(DECISIONS.map((d) => [d.id, d]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function buildInputs(history, { baseline, scenario = DEFAULT_SCENARIO }) {
  const Q = history.length * QUARTERS_PER_ROUND;
  const levers = {}, shocks = {};
  const ensureLever = (k) => { if (!levers[k]) levers[k] = { value: new Array(Q).fill(baseline.levers[k].base), base: baseline.levers[k].base }; return levers[k]; };
  const ensureShock = (k) => { if (!shocks[k]) shocks[k] = { value: new Array(Q).fill(0), base: 0 }; return shocks[k]; };
  // Hlaupandi stig #1-3 sleða
  const running = {};
  for (const d of DECISIONS) if (d.mode === 'delta' && d.lever) running[d.lever] = baseline.levers[d.lever].base;

  history.forEach((set, r) => {
    const q0 = r * QUARTERS_PER_ROUND, q1 = q0 + QUARTERS_PER_ROUND;
    // #1-3: Δ á hlaupandi stig, haldið yfir fjórðunga umferðar
    for (const d of DECISIONS) {
      if (d.mode !== 'delta' || !d.lever) continue;
      const opt = d.options.find((o) => o.key === set[d.id]);
      const delta = opt ? (opt.delta || 0) : 0;
      const cfg = baseline.levers[d.lever];
      running[d.lever] = clamp(running[d.lever] + delta, cfg.min, cfg.max);
      const lev = ensureLever(d.lever);
      for (let q = q0; q < q1; q++) lev.value[q] = running[d.lever];
    }
    // #4: eins-árs púls (fráviks-gildi ofan á grunn, aðeins þessi umferð)
    const fj = DEC.fjarfesting.options.find((o) => o.key === set.fjarfesting);
    if (fj && fj.lever && fj.pulse) {
      const lev = ensureLever(fj.lever), cfg = baseline.levers[fj.lever];
      for (let q = q0; q < q1; q++) lev.value[q] = clamp(cfg.base + fj.pulse, cfg.min, cfg.max);
    }
    // sviðsmynd: sjokk umferðar (haldið yfir fjórðunga umferðar)
    const ev = scenario.events[r];
    if (ev) {
      for (const [k, v] of Object.entries(ev.shocks || {})) { const s = ensureShock(k); for (let q = q0; q < q1; q++) s.value[q] = v; }
      // #5: viðbragð → effect{lever?,shock?} (púls yfir umferð)
      const resp = (ev.responses || []).find((x) => x.key === set.vidbragd);
      if (resp && resp.effect) {
        for (const [k, v] of Object.entries(resp.effect.lever || {})) { const cfg = baseline.levers[k]; const lev = ensureLever(k); for (let q = q0; q < q1; q++) lev.value[q] = clamp(cfg.base + v, cfg.min, cfg.max); }
        for (const [k, v] of Object.entries(resp.effect.shock || {})) { const s = ensureShock(k); for (let q = q0; q < q1; q++) s.value[q] = v; }
      }
    }
  });
  return { levers, shocks, quarters: Q };
}

export function resolveTeam({ baseline, links, history, scenario = DEFAULT_SCENARIO }) {
  const { levers, shocks, quarters } = buildInputs(history, { baseline, scenario });
  // simulate tekur levers sem {k: value} þar sem value má vera fylki; base kemur úr baseline.
  const levOv = {}; for (const k in levers) levOv[k] = levers[k].value;
  const shkOv = {}; for (const k in shocks) shkOv[k] = shocks[k].value;
  const r = simulate({ baseline, links, levers: levOv, shocks: shkOv, quarters });
  const last = quarters - 1, kpis = {};
  for (const k in r.outcomes) kpis[k] = r.outcomes[k].mid[last];
  return { kpis, quarters };
}
