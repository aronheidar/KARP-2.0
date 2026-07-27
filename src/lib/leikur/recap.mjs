// Leikslok-samantekt fyrir RÁS-Leikinn: dregur lærdóm úr öllum kjörtímabilunum 2000–2032. HREINT.
// perRoundScores: [{round, score}] (composite per umferð, úr trajectory-Δ). realityPerTerm: [{round, score}]
// (raun-composite á sömu markmið). leversFull: [{round, levers}] (studio; [] f. classic). events: [{round,icon,title}].
export function buildRecap({ perRoundScores = [], realityPerTerm = [], leversFull = [], mandate, events = [], baseline, disp, finalPerKpi = [], avgApproval = null } = {}) {
  const n1 = (v) => (typeof v === 'number' ? (Math.round(v * 10) / 10).toString().replace('.', ',') : '–');
  const evTitle = (r) => { const e = events.find((x) => x.round === r); return e ? ((e.icon ? e.icon + ' ' : '') + e.title) : ('Kjörtímabil ' + r); };
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

  // Heildar-ferill: meðaltal, sveiflur (spönn), stefna (fyrri vs seinni helmingur), vendipunktur (stærsta stökk milli lota)
  const scored = perRoundScores.filter((p) => p.score != null);
  const avg = scored.length ? scored.reduce((a, p) => a + p.score, 0) / scored.length : null;
  const spread = scored.length ? Math.max(...scored.map((p) => p.score)) - Math.min(...scored.map((p) => p.score)) : 0;
  const half = Math.ceil(scored.length / 2);
  const firstAvg = scored.slice(0, half).reduce((a, p) => a + p.score, 0) / (half || 1);
  const lastAvg = scored.slice(half).reduce((a, p) => a + p.score, 0) / ((scored.length - half) || 1);
  const trend = scored.length >= 4 ? (lastAvg - firstAvg) : 0;
  let turningPoint = null;
  for (let i = 1; i < scored.length; i++) { const d = scored[i].score - scored[i - 1].score; if (!turningPoint || Math.abs(d) > Math.abs(turningPoint.diff)) turningPoint = { round: scored[i].round, diff: Math.round(d * 10) / 10, title: evTitle(scored[i].round) }; }
  // Sterkasta / veikasta svið í leikslok (úr lokaumferðar perKpi)
  let strongest = null, weakest = null;
  for (const p of finalPerKpi) { if (p == null || p.score == null) continue; if (!strongest || p.score > strongest.score) strongest = p; if (!weakest || p.score < weakest.score) weakest = p; }

  const lines = [];
  if (avg != null) {
    const verdict = avg >= 80 ? 'framúrskarandi hagstjórn' : avg >= 65 ? 'traust hagstjórn' : avg >= 50 ? 'blönduð útkoma' : 'erfið kjörtímabil';
    lines.push('📊 Heildar-einkunn ferilsins 2000–2032: <b>' + n1(avg) + '/100</b> — ' + verdict + '.');
  }
  if (avgApproval != null) {
    const av = avgApproval >= 55 ? 'vinsæl og traust stjórn' : avgApproval >= 45 ? 'hélt naumlega umboði' : avgApproval >= 32 ? 'óvinsæl og völt stjórn' : 'stjórn í stöðugum mótmælum';
    lines.push('🗳️ Meðal-fylgi ríkisstjórnarinnar öll árin: <b>' + Math.round(avgApproval) + '%</b> — ' + av + '.');
  }
  if (bestTerm) lines.push('🌟 Besta kjörtímabilið: <b>' + bestTerm.title + '</b> (' + bestTerm.score + '/100).');
  if (worstTerm && (!bestTerm || worstTerm.round !== bestTerm.round)) lines.push('🌧️ Erfiðasta: <b>' + worstTerm.title + '</b> (' + worstTerm.score + '/100).');
  if (strongest && weakest && strongest.key !== weakest.key) lines.push('✅ Sterkasta sviðið í lokin: <b>' + esc(strongest.label) + '</b> (' + strongest.score + '/100). ❌ Veikasta: <b>' + esc(weakest.label) + '</b> (' + weakest.score + '/100).');
  if (scored.length >= 4 && Math.abs(trend) >= 5) lines.push((trend > 0 ? '📈 Þið sóttuð í ykkur veðrið' : '📉 Ykkur fór aftur') + ' þegar á leið — seinni helmingurinn var ' + n1(Math.abs(trend)) + ' stigum ' + (trend > 0 ? 'betri' : 'lakari') + ' en sá fyrri.');
  if (turningPoint && Math.abs(turningPoint.diff) >= 10) lines.push('⚡ Mesti viðsnúningurinn varð í <b>' + turningPoint.title + '</b> (' + (turningPoint.diff >= 0 ? '+' : '') + n1(turningPoint.diff) + ' stig frá fyrri umferð).');
  if (spread >= 40) lines.push('🎢 Sveiflukennd hagstjórn — bilið milli besta og versta kjörtímabils var ' + n1(spread) + ' stig. Stöðugleiki er líka verðmæti.');
  if (beat + trailed > 0) {
    let s = '🕰️ Þið stóðuð ykkur betur en raunveruleikinn í <b>' + beat + '</b> af ' + (beat + trailed) + ' kjörtímabilum';
    if (biggest) s += ' (mest í ' + biggest.title + ': ' + (biggest.diff >= 0 ? '+' : '') + n1(biggest.diff) + ' stig)';
    lines.push(s + '.');
  }
  if (defining) lines.push('🎯 Afdrifaríkasta ákvörðunin: <b>' + defining.label + '</b> stillt í ' + defining.disp + (/\.$/.test(defining.disp) ? '' : '.'));

  return { bestTerm, worstTerm, vsReality: { beat, trailed, biggest }, defining, avg, trend, turningPoint, strongest, weakest, lines };
}
