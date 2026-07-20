// throtlok_detect.js — hreinn fréttavél-skynjari: „Þrotabú gert upp" (skiptalok). CommonJS; engin fs/net.
// pickThrotlok(byKt, typeLabels, {todayISO, days=30, max=3}) → fréttastök (nýjasta skiptalok per kt).
'use strict';

function pickThrotlok(byKt, typeLabels, opts) {
  const o = opts || {};
  const days = o.days || 30;
  const max = o.max || 3;
  const cut = new Date(new Date(o.todayISO + 'T00:00:00Z').getTime() - days * 86400000).toISOString().slice(0, 10);
  const heiti = (typeLabels && typeLabels.skiptalok) || 'Skiptalok þrotabús';

  const perKt = {};
  for (const kt of Object.keys(byKt || {})) {
    const entry = byKt[kt] || {};
    if (!entry.name) continue;                                     // þarf nafn í titil/texta
    for (const n of (entry.notices || [])) {
      if (n && n.type === 'skiptalok' && n.date && n.date >= cut) {
        if (!perKt[kt] || n.date > perKt[kt].date) perKt[kt] = { date: n.date, court: n.court || null, name: entry.name };
      }
    }
  }
  const rows = Object.keys(perKt).map((kt) => ({ kt, date: perKt[kt].date, court: perKt[kt].court, name: perKt[kt].name }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalRecent = rows.length;

  return rows.slice(0, max).map((r) => ({
    id: `throtlok-${r.kt}`,
    type: 'throtlok',
    facts: { felag: r.name, tegund: heiti, domstoll: r.court, dags: r.date },
    url: '/logbirting/',
    samhengi: `Eitt af ${totalRecent} þrotabúum lögaðila sem skiptum lauk á í Lögbirtingablaðinu síðustu ${days} daga.`,
    title: `${heiti}: ${r.name}`,
    text: `${heiti} — ${r.name}. Birt í Lögbirtingablaðinu ${r.date}${r.court ? ' (' + r.court + ')' : ''}. Ferill málsins er rakinn hér að neðan.`,
  }));
}

module.exports = { pickThrotlok };
