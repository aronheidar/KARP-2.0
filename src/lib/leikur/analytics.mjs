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
