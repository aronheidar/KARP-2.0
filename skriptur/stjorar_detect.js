// stjorar_detect.js — hreinn fréttavél-skynjari: nýr bæjar-/sveitarstjóri (sveitarstjorar.json). CommonJS; engin fs/net.
// pickStjorar(st, grunnur) → { cand: [{sveitarfelag, nafn, titill, fyrri}], grunnur: {dags, stjorar: {sveitarfélag: {stjori, titill}}} }
//
// AF HVERJU (22.9.2026): grunnurinn var ódagsettur og borinn saman yfir hvaða bil sem er. Stæði sveitarstjorar.json
// óbreytt vikum saman (skriftan skrifar ekkert þegar skröpun bregst) og lifnaði, yrðu öll stjóraskipti bilsins að
// fréttum dagsins. Grunnurinn ber nú dagsetningu skrárinnar sjálfrar (`updated`) og er aðeins borinn saman ef hann
// er í mesta lagi GRUNNUR_DAGAR eldri en skráin; annars, og á gamla sniðinu, endurstillist hann í þögn. Tóm skrá
// skrifar ekki yfir grunninn. Sveitarfélag sem hafði engan skráðan stjóra síðast er ekki frétt (eins og áður).
'use strict';

const GRUNNUR_DAGAR = 3;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;

function pickStjorar(st, grunnur) {
  const cur = {};
  for (const [muni, d] of Object.entries((st && st.byName) || {})) if (d && d.stjori) cur[muni] = { stjori: d.stjori, titill: d.stjoriTitill || 'sveitarstjóri' };
  const dags = iso(st && st.updated);
  if (!dags || !Object.keys(cur).length) return { cand: [], grunnur };

  const g = grunnur && iso(grunnur.dags) && grunnur.stjorar && typeof grunnur.stjorar === 'object' ? grunnur : null;
  const bil = g ? dagur(dags) - dagur(iso(g.dags)) : NaN;
  const cand = [];
  if (bil >= 0 && bil <= GRUNNUR_DAGAR) {
    for (const [muni, c] of Object.entries(cur)) {
      const p = g.stjorar[muni];
      if (p && p.stjori && p.stjori !== c.stjori) cand.push({ sveitarfelag: muni, nafn: c.stjori, titill: c.titill, fyrri: p.stjori });
    }
  }
  return { cand, grunnur: { dags, stjorar: cur } };
}

module.exports = { pickStjorar };
