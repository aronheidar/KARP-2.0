// mark_detect.js — hreinn fréttavél-skynjari: dagshreyfingar ≥ 4% og met í gagnaröð Karp. CommonJS; engin fs/net.
// pickMark(mk, rec, {idag, max=2}) → { cand: [{tegund, sym, nafn, verd, dags, hist, w, breyting | met+dagar}], rec }
//
// AF HVERJU (22.9.2026): fréttin var dagsett eftir keyrsludegi (`mark-${TODAY}-…`) og sagði „í dag". VÍS hafði ekki
// verslast síðan 17.7 en „lækkaði um 20% í dag" fimmtán daga í röð (30.8–15.9), Solid Clouds +41,7% fjóra daga og
// hreyfing föstudags birtist aftur á laugardegi og sunnudegi. Hver frétt ber því SÍÐASTA VIÐSKIPTADAG bréfsins
// (`dates` í markadir.json; sumar raðir eru degi á eftir) og bréf sem hefur ekki verslast í VIDSKIPTI_DAGAR daga er
// ekki fréttaefni, hvorki hreyfing né met. Sama viðskiptadag ber sama id, svo helgarkeyrslur tvítaka ekkert.
// `rec[sym]` geymir hæsta/lægsta skráða verð (met kviknar aðeins þegar nýtt met er sett) og `d`, síðasta viðskiptadag
// sem frétt var gefin út fyrir. Frambjóðandi fyrir þegar tilkynntan viðskiptadag er ekki gefinn út aftur, svo röð sem
// er degi á eftir eða met sem kviknar aftur á lokagengi taki ekki pláss í þakinu (27.8: hreyfing Solid Clouds ýtti
// nýju meti NOVA út; 12.9: endurtekið met Arion ýtti meti Brims út).
'use strict';

const HREYFING = 4;
const VIDSKIPTI_DAGAR = 4;   // föstudagur → þriðjudagur eftir mánudagsfrí

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;

function vidskiptadagur(s, idag) {
  const d = Array.isArray(s.dates) && s.dates.length ? String(s.dates[s.dates.length - 1]) : '';
  if (!ISO.test(d) || !ISO.test(String(idag))) return null;
  const bil = dagur(idag) - dagur(d);
  return bil >= 0 && bil <= VIDSKIPTI_DAGAR ? d : null;
}

function pickMark(mk, rec0, opts) {
  const o = opts || {};
  const max = o.max || 2;
  const rec = { ...(rec0 || {}) }, recInit = !!rec0;
  const cand = [];
  for (const s of (mk && mk.stocks) || []) {
    const dags = vidskiptadagur(s, o.idag);
    if (!dags) continue;
    const r = rec[s.sym] || {};
    const tilkynnt = typeof r.d === 'string' && r.d >= dags;
    const h = (s.hist || []).filter((x) => x > 0);
    const grunn = { sym: s.sym, nafn: s.name, verd: s.price, dags, hist: s.hist };
    if (typeof s.chgPct === 'number' && Math.abs(s.chgPct) >= HREYFING) {
      if (!tilkynnt) cand.push({ ...grunn, tegund: 'hreyfing', breyting: s.chgPct, w: Math.abs(s.chgPct) });
    } else if (h.length >= 30) {
      if (recInit && !tilkynnt && s.price >= Math.max(...h) && s.price > (typeof r.hi === 'number' ? r.hi : 0)) {
        cand.push({ ...grunn, tegund: 'met', met: 'hæsta', dagar: h.length, w: 3 });
      } else if (recInit && !tilkynnt && s.price <= Math.min(...h) && s.price < (typeof r.lo === 'number' ? r.lo : Infinity)) {
        cand.push({ ...grunn, tegund: 'met', met: 'lægsta', dagar: h.length, w: 3 });
      }
      rec[s.sym] = { ...r, hi: Math.max(typeof r.hi === 'number' ? r.hi : 0, s.price), lo: Math.min(typeof r.lo === 'number' ? r.lo : Infinity, s.price) };
    }
  }
  cand.sort((a, b) => b.w - a.w);
  const ut = cand.slice(0, max);
  for (const c of ut) rec[c.sym] = { ...(rec[c.sym] || {}), d: c.dags };
  return { cand: ut, rec };
}

module.exports = { pickMark };
