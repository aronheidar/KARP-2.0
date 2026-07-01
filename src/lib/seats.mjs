// seats.mjs — D'Hondt sætaspá. Hrein útgáfa af karpSeats() (dashboard.html l.2579).
// -------------------------------------------------------------------------
// Gagnaglobölin (POLLS, THINGMENN, PCODE) sem karpSeats las úr scope eru hér
// TEKIN SEM VIÐFÖNG (dependency injection) → prófanlegt, endurnýtanlegt í Astro.
// Extracted 2026-07-01 (#2 Á1).
import { PARTIES } from './parties.mjs';

/**
 * @param polls     { parties?:[kóðar], polls:[{ v:{ kóði:prósent } }] }  (POLLS-globalið)
 * @param thingmenn [{ flokkur }]  — núverandi þingmenn (THINGMENN-globalið); má sleppa
 * @param opts      { total=63, threshold=5, govKeys={S,C,F} }
 * @returns { proj, cur, govS, oppS, maj, order, used, GOVK, TOT } — eða null ef engin gögn
 */
export function projectSeats(polls, thingmenn = [], opts = {}) {
  if (!polls || !polls.polls || !polls.polls.length) return null;
  const parties = polls.parties || ['S', 'C', 'F', 'D', 'M', 'B', 'J', 'P', 'V'];
  const TOT = opts.total ?? 63;
  const THRESH = opts.threshold ?? 5;
  const GOVK = opts.govKeys || { S: 1, C: 1, F: 1 };

  // Meðaltal síðustu 3 kannana per flokk.
  const recent = polls.polls.slice(-3), avg = {}, used = recent.length;
  parties.forEach((p) => {
    let ss = 0, n = 0;
    recent.forEach((q) => { if (q.v[p] != null) { ss += q.v[p]; n++; } });
    if (n) avg[p] = ss / n;
  });

  // D'Hondt með 5% þröskuldi.
  const dh = (v) => {
    let tot = 0; Object.keys(v).forEach((p) => { tot += v[p]; });
    const e2 = {}; Object.keys(v).forEach((p) => { if (v[p] / tot * 100 >= THRESH) e2[p] = v[p]; });
    const s = {}; Object.keys(e2).forEach((p) => { s[p] = 0; });
    for (let i = 0; i < TOT; i++) {
      let b = null, bq = -1;
      Object.keys(e2).forEach((p) => { const q = e2[p] / (s[p] + 1); if (q > bq) { bq = q; b = p; } });
      if (b == null) break;
      s[b]++;
    }
    return s;
  };

  const proj = dh(avg), n2c = {}, cur = {};
  Object.keys(PARTIES).forEach((c) => { n2c[PARTIES[c].name] = c; });
  (thingmenn || []).forEach((m) => { const c = n2c[m.flokkur]; if (c) cur[c] = (cur[c] || 0) + 1; });

  let govS = 0; Object.keys(GOVK).forEach((p) => { govS += (proj[p] || 0); });
  const govList = Object.keys(GOVK).filter((p) => (proj[p] || 0) > 0).sort((a, b) => (proj[b] || 0) - (proj[a] || 0));
  const oppList = parties.filter((p) => !GOVK[p] && (proj[p] || 0) > 0).sort((a, b) => (proj[b] || 0) - (proj[a] || 0));
  return { proj, cur, govS, oppS: TOT - govS, maj: govS >= 32, order: govList.concat(oppList), used, GOVK, TOT };
}
