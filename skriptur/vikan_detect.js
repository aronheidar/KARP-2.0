// vikan_detect.js — hreinn fréttavél-skynjari: „5 mál vikunnar" (vikuleg samantekt). CommonJS; engin import (deps injectuð).
// pickVikan(items, {todayISO, weightOf, catOf, asciiId, days=7, n=5, perType=2, min=3}) → null | vikan-stak.
'use strict';

const EXCLUDE = new Set(['vika', 'thema', 'vikan', 'fyrvik', 'fonix']);

function pickVikan(items, opts) {
  const o = opts || {};
  const days = o.days || 7;
  const n = o.n || 5;
  const perType = o.perType || 2;
  const min = o.min || 3;
  const weightOf = o.weightOf || (() => 0);
  const catOf = o.catOf || (() => ({ label: '', emoji: '' }));
  const asciiId = o.asciiId || ((s) => String(s));
  const cut = new Date(new Date(o.todayISO + 'T00:00:00Z').getTime() - days * 86400000).toISOString().slice(0, 10);

  const seen = new Set();
  const cand = (items || []).filter((it) => {
    if (!it || !it.id || !it.date || !it.title || EXCLUDE.has(it.type) || it.date < cut) return false;
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  cand.sort((a, b) => (weightOf(b.type) - weightOf(a.type)) || String(b.date).localeCompare(String(a.date)));

  const chosen = [];
  const perCount = {};
  for (const it of cand) {
    if (chosen.length >= n) break;
    if ((perCount[it.type] || 0) >= perType) continue;
    perCount[it.type] = (perCount[it.type] || 0) + 1;
    chosen.push(it);
  }
  if (chosen.length < min) return null;

  const mal = chosen.map((it) => {
    const c = catOf(it.type) || {};
    return { title: it.title, slug: asciiId(it.id), cat: c.label || '', emoji: c.emoji || '', hook: String(it.text || '').slice(0, 90).trim(), dags: it.date };
  });

  return {
    id: 'vikan-' + o.todayISO,
    type: 'vikan',
    noai: true,
    url: '/frettavel/',
    title: '5 mál vikunnar',
    text: 'Fimm mál stóðu upp úr í fréttavél Karp vikuna á undan — raðað eftir vægi. Smelltu til að lesa hvert mál.',
    facts: { mal },
  };
}

module.exports = { pickVikan };
