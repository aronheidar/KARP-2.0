// Þver-liða greining fyrir leikstjóra-mælaborð. HREINT (engin env/D1/vél).
function optLabelFor(decId, optKey, decisionsConfig, scenario, round) {
  if (decId === 'vidbragd') { const ev = scenario.events[round - 1]; const o = ev && (ev.responses || []).find((r) => r.key === optKey); return o ? o.label : (optKey || '—'); }
  const d = decisionsConfig.find((x) => x.id === decId); const o = d && (d.options || []).find((x) => x.key === optKey); return o ? o.label : (optKey || '—');
}

export function buildAnalytics({ history, decisions, teams, mandate, decisionsConfig, scenario, currentRound, mode = 'classic', leverLabels = {}, leverBase = {} }) {
  const nameOf = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const kpiKeys = mandate.kpis.map((k) => k.key);
  const kpiLabel = Object.fromEntries(mandate.kpis.map((k) => [k.key, k.label]));

  const cur = history.filter((h) => h.round === currentRound);
  const scorecard = cur.map((h) => ({
    teamId: h.teamId, name: nameOf[h.teamId] || ('Lið ' + h.teamId), cumulative: h.cumulative,
    perKpi: kpiKeys.map((k) => { const p = (h.perKpi || []).find((x) => x.key === k); return { key: k, label: kpiLabel[k], score: p ? p.score : null }; }),
  })).sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0));

  const decCur = decisions.filter((d) => d.round === currentRound);
  const decLabelOf = Object.fromEntries(decisionsConfig.map((d) => [d.id, d.label]));
  const decIds = decisionsConfig.map((d) => d.id);
  const decisionsTable = teams.map((t) => {
    const row = decCur.find((d) => d.teamId === t.id), dec = row ? row.decisions : {};
    if (mode === 'studio') {
      const lv = (dec && dec.levers) || {};
      const changed = Object.entries(lv).filter(([k, v]) => !(k in leverBase) || +v !== leverBase[k]);
      const items = changed.map(([k, v]) => (leverLabels[k] || k) + ' ' + v).slice(0, 6);
      return { teamId: t.id, name: t.name, studio: true, summary: items.length ? items.join(' · ') : '—' };
    }
    return { teamId: t.id, name: t.name, choices: decIds.map((id) => ({ decId: id, decLabel: decLabelOf[id], optLabel: (dec && dec[id] != null) ? optLabelFor(id, dec[id], decisionsConfig, scenario, currentRound) : '—' })) };
  });

  const rounds = [...new Set(history.map((h) => h.round))].sort((a, b) => a - b);
  const seriesFor = (valFn) => teams.map((t) => ({ teamId: t.id, name: t.name, points: rounds.map((r) => { const h = history.find((x) => x.round === r && x.teamId === t.id); return { round: r, value: h ? valFn(h) : null }; }).filter((p) => p.value != null) }));
  const trajectories = {
    cumulative: seriesFor((h) => h.cumulative),
    byKpi: Object.fromEntries(kpiKeys.map((k) => [k, { label: kpiLabel[k], series: seriesFor((h) => { const p = (h.perKpi || []).find((x) => x.key === k); return p ? p.score : null; }) }])),
  };
  return { scorecard, decisionsTable, trajectories, rounds };
}

// #6 Kennslu-vísbendingar: 3–5 umræðu-spurningar úr greiningar-mynstrum (fyrir leikstjóra). HREINT.
// an = buildAnalytics-úttak. scenarioEvents = [{round,icon,title}] (til að nefna kjörtímabil).
export function teachingPrompts(an, { scenarioEvents = [] } = {}) {
  if (!an || !an.scorecard || !an.scorecard.length) return [];
  const out = [];
  // Liðs-nöfn eru notanda-innslegin → escape áður en flétt í <b> (XSS-vörn); KPI/atburða-heiti líka til öryggis.
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const evTitle = (r) => { const e = scenarioEvents.find((x) => x.round === r); return esc(e ? e.title : ('umferð ' + r)); };
  const sc = an.scorecard, first = sc[0];
  const scoreAt = (row, key) => { const p = (row.perKpi || []).find((x) => x.key === key); return p ? p.score : null; };

  // 1) Mesta dreifing milli liða í einu markmiði (núverandi umferð)
  if (sc.length >= 2 && first && first.perKpi) {
    let widest = null;
    for (const kp of first.perKpi) {
      const vals = sc.map((r) => scoreAt(r, kp.key)).filter((v) => v != null);
      if (vals.length < 2) continue;
      const spread = Math.max(...vals) - Math.min(...vals);
      if (!widest || spread > widest.spread) widest = { label: kp.label, spread };
    }
    if (widest && widest.spread >= 25) out.push('Liðin nálguðust <b>' + esc(widest.label) + '</b> mjög ólíkt (bil ' + Math.round(widest.spread) + ' stig) — berðu saman aðferðir þeirra og af hverju útkoman varð svona ólík.');
  }
  // 2) Sameiginlegur veikleiki (öll lið lág í sama markmiði)
  if (first && first.perKpi) {
    for (const kp of first.perKpi) {
      const vals = sc.map((r) => scoreAt(r, kp.key)).filter((v) => v != null);
      if (vals.length && vals.every((v) => v < 45)) { out.push('Öll lið áttu erfitt með <b>' + esc(kp.label) + '</b> — ræðið hvað gerði það svona krefjandi þessa umferð.'); break; }
    }
  }
  // 3) Leiðtogi vs eftirbátur
  if (sc.length >= 2) {
    const top = sc[0], bot = sc[sc.length - 1];
    if ((top.cumulative || 0) - (bot.cumulative || 0) > 10) out.push('Spyrðu <b>' + esc(top.name) + '</b> hvað skýrir forystuna — og hvað <b>' + esc(bot.name) + '</b> gæti gert öðruvísi.');
  }
  // 4) Erfiðasta kjörtímabilið (lægstu meðal-stig í umferð)
  const cum = an.trajectories && an.trajectories.cumulative, rounds = an.rounds || [];
  if (cum && cum.length && rounds.length >= 2) {
    let worst = null;
    for (let i = 1; i < rounds.length; i++) {
      const r = rounds[i], deltas = cum.map((s) => { const a = s.points.find((p) => p.round === r), b = s.points.find((p) => p.round === rounds[i - 1]); return (a && b) ? (a.value - b.value) : null; }).filter((v) => v != null);
      if (!deltas.length) continue;
      const avg = deltas.reduce((x, y) => x + y, 0) / deltas.length;
      if (!worst || avg < worst.avg) worst = { round: r, avg };
    }
    if (worst) out.push('Kjörtímabilið „<b>' + evTitle(worst.round) + '</b>" reyndist liðunum erfiðast (lægstu meðal-stig) — hvað var svona snúið, og hvernig brugðust liðin við?');
  }
  // 5) Ólík umboð (hlutverk)
  if (sc.some((r) => r.role)) out.push('Umboðin voru ólík milli liða — var samkeppnin sanngjörn, og hvernig mótaði leynda hlutverkið ákvarðanir hvers liðs?');

  return out.slice(0, 5);
}
