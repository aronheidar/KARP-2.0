// Leikslok-samantekt fyrir RÁS-Leikinn: dregur lærdóm úr öllum kjörtímabilunum 2000–2032. HREINT.
// perRoundScores: [{round, score}] (composite per umferð, úr trajectory-Δ). realityPerTerm: [{round, score}]
// (raun-composite á sömu markmið). leversFull: [{round, levers}] (studio; [] f. classic). events: [{round,icon,title}].
export function buildRecap({ perRoundScores = [], realityPerTerm = [], leversFull = [], mandate, events = [], baseline, disp } = {}) {
  const n1 = (v) => (typeof v === 'number' ? (Math.round(v * 10) / 10).toString().replace('.', ',') : '–');
  const evTitle = (r) => { const e = events.find((x) => x.round === r); return e ? ((e.icon ? e.icon + ' ' : '') + e.title) : ('Kjörtímabil ' + r); };

  // Besta / erfiðasta kjörtímabil
  let bestTerm = null, worstTerm = null;
  for (const p of perRoundScores) {
    if (p.score == null) continue;
    if (!bestTerm || p.score > bestTerm.score) bestTerm = { round: p.round, score: p.score, title: evTitle(p.round) };
    if (!worstTerm || p.score < worstTerm.score) worstTerm = { round: p.round, score: p.score, title: evTitle(p.round) };
  }

  // Vs raunveruleikinn: hvar barstu af / undir, og stærsta frávik
  let beat = 0, trailed = 0, biggest = null;
  for (const p of perRoundScores) {
    const r = realityPerTerm.find((x) => x.round === p.round);
    if (!r || p.score == null || r.score == null) continue;
    const d = Math.round((p.score - r.score) * 10) / 10;
    if (d >= 0) beat++; else trailed++;
    if (!biggest || Math.abs(d) > Math.abs(biggest.diff)) biggest = { round: p.round, diff: d, title: evTitle(p.round) };
  }

  // Afdrifaríkasta ákvörðunin (studio): sleði með stærstu hlutfallslegu frávik yfir leikinn
  let defining = null;
  if (leversFull.length && baseline) {
    let best = null;
    for (const rd of leversFull) for (const [k, v] of Object.entries(rd.levers || {})) {
      const cfg = baseline.levers[k]; if (!cfg) continue;
      const span = (cfg.max - cfg.min) || 1, rel = Math.abs((+v - cfg.base) / span);
      if (rel > 1e-6 && (!best || rel > best.rel)) best = { key: k, label: cfg.label, value: +v, rel };
    }
    if (best) defining = { key: best.key, label: best.label, value: best.value, disp: (disp && baseline.levers[best.key]) ? disp(baseline.levers[best.key], best.value) : String(best.value) };
  }

  const lines = [];
  if (bestTerm) lines.push('🌟 Besta kjörtímabilið: <b>' + bestTerm.title + '</b> (' + bestTerm.score + '/100).');
  if (worstTerm && (!bestTerm || worstTerm.round !== bestTerm.round)) lines.push('🌧️ Erfiðasta: <b>' + worstTerm.title + '</b> (' + worstTerm.score + '/100).');
  if (beat + trailed > 0) {
    let s = '🕰️ Þið stóðuð ykkur betur en raunveruleikinn í <b>' + beat + '</b> af ' + (beat + trailed) + ' kjörtímabilum';
    if (biggest) s += ' (mest í ' + biggest.title + ': ' + (biggest.diff >= 0 ? '+' : '') + n1(biggest.diff) + ' stig)';
    lines.push(s + '.');
  }
  if (defining) lines.push('🎯 Afdrifaríkasta ákvörðunin: <b>' + defining.label + '</b> stillt í ' + defining.disp + (/\.$/.test(defining.disp) ? '' : '.'));

  return { bestTerm, worstTerm, vsReality: { beat, trailed, biggest }, defining, lines };
}
