// Úrlausn liðs: öll ákvörðunasaga → fylki-gild sleða/sjokk-leiðir → simulate → KPI við lokafjórðung.
// Uppsöfnun: #1-3 afstöður eru Δ á hlaupandi sleða-stig (klippt í [min,max]); #4 eins-árs púls; #5 viðbragð atburðar.
// Sjokk sviðsmyndar sett á fjórðunga umferðar. Vélin óbreytt (styður fylki-sleða gegnum atStep).
//
// SVIÐSMYNDIR: þessi eining er ÞEGAR sviðsmynda-hlutlaus — hún les AÐEINS `scenario.events[r]` úr því
// sem kallandinn réttir henni. Þjónninn (server.mjs, resolveTeam) sendir cfg.scenario úr sviðsmynda-
// skránni (svidsmyndir.mjs) og vafrinn (client.mjs, studioSim) sendir { events: st.scenarioSoFar }.
// DEFAULT_SCENARIO hér er því AÐEINS öryggisnet fyrir kallendur sem senda ekkert (og er sögulega
// sviðsmyndin 'island2000'); enginn framleiðslu-kallandi treystir á það sjálfgefna gildi.
import { simulate } from '../roads/engine.mjs';
import { DECISIONS, SCENARIO as DEFAULT_SCENARIO, QUARTERS_PER_ROUND } from './game-config.mjs';

const DEC = Object.fromEntries(DECISIONS.map((d) => [d.id, d]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function buildInputs(history, { baseline, scenario = DEFAULT_SCENARIO, mode = 'classic', shockScale = 1, leverCap = null }) {
  if (mode === 'studio') return buildInputsStudio(history, { baseline, scenario, shockScale, leverCap });
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
      for (const [k, v] of Object.entries(ev.shocks || {})) { const s = ensureShock(k); for (let q = q0; q < q1; q++) s.value[q] = v * shockScale; }
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

// Studio-hamur: ákvörðun umferðar = { levers:{k:algert gildi} }. Sleðar bera á milli umferða (running),
// klippt í [min,max]; sviðsmyndar-sjokk ofan á. Discrete-viðbrögð eiga ekki við (þátttakandi svarar með sleðum).
function buildInputsStudio(history, { baseline, scenario = DEFAULT_SCENARIO, shockScale = 1, leverCap = null }) {
  const Q = history.length * QUARTERS_PER_ROUND, levers = {}, shocks = {}, running = {};
  const clampL = (k, v) => { const c = baseline.levers[k]; return Math.max(c.min, Math.min(c.max, +v)); };
  history.forEach((set, r) => {
    const q0 = r * QUARTERS_PER_ROUND, q1 = q0 + QUARTERS_PER_ROUND;
    if (set && set.levers) for (const [k, v] of Object.entries(set.levers)) { if (baseline.levers[k]) running[k] = clampL(k, v); }
    // Pólitískt vald (Erfitt): aðeins `leverCap` sterkustu VIRKU sleðar teljast — restin hlutlaus þessa umferð (þjóns-vörn; client læsir líka).
    let active = running;
    if (leverCap) {
      const off = Object.keys(running).filter((k) => baseline.levers[k] && running[k] !== baseline.levers[k].base);
      if (off.length > leverCap) {
        const keep = new Set(off.map((k) => { const c = baseline.levers[k]; return { k, w: Math.abs(running[k] - c.base) / ((c.max - c.min) || 1) }; }).sort((a, b) => b.w - a.w).slice(0, leverCap).map((x) => x.k));
        active = {}; for (const k in running) active[k] = keep.has(k) ? running[k] : baseline.levers[k].base;
      }
    }
    for (const [k, val] of Object.entries(active)) {
      const c = baseline.levers[k];
      const lev = levers[k] || (levers[k] = { value: new Array(Q).fill(c.base), base: c.base });
      for (let q = q0; q < q1; q++) lev.value[q] = val;
    }
    const ev = scenario.events[r];
    if (ev) for (const [k, v] of Object.entries(ev.shocks || {})) { const s = shocks[k] || (shocks[k] = { value: new Array(Q).fill(0), base: 0 }); for (let q = q0; q < q1; q++) s.value[q] = v * shockScale; }
  });
  return { levers, shocks, quarters: Q };
}

export function resolveTeam({ baseline, links, history, scenario = DEFAULT_SCENARIO, mode = 'classic', shockScale = 1, leverCap = null }) {
  const { levers, shocks, quarters } = buildInputs(history, { baseline, scenario, mode, shockScale, leverCap });
  // simulate tekur levers sem {k: value} þar sem value má vera fylki; base kemur úr baseline.
  const levOv = {}; for (const k in levers) levOv[k] = levers[k].value;
  const shkOv = {}; for (const k in shocks) shkOv[k] = shocks[k].value;
  const r = simulate({ baseline, links, levers: levOv, shocks: shkOv, quarters });
  const last = quarters - 1, kpis = {};
  for (const k in r.outcomes) kpis[k] = r.outcomes[k].mid[last];
  return { kpis, quarters };
}
