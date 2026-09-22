// nefndir_detect.js — hreinn fréttavél-skynjari: ný formennska þingnefndar (nefndir.json). CommonJS; engin fs/net.
// pickNefndir(nef, meta, grunnur) → { cand: [{id, nefnd, formadur, fyrri}], grunnur: {dags, nefndir: {id: {heiti, formadur, sidast}}} }
//
// AF HVERJU (22.9.2026): grunnurinn var ódagsettur og hver keyrsla skrifaði yfir hann. Stæði nefndir.json óbreytt
// (althingi.is svarar 429 og seiglan heldur þá fyrri skrá) og lifnaði síðan, yrðu öll formannsskipti bilsins að
// fréttum dagsins. Tóm skrá þurrkaði líka grunninn — 22.8–8.9 skrifaði build_committees.js tóma nefndaskrá fimm
// sinnum — og þá fannst næsta formannsbreyting alls ekki (skynjarinn krefst fyrri færslu).
// ⚠ nefndir.json er FYLKI og ber enga dagsetningu. `updated` er sótt í althingi_meta.json, sem build_committees.js
//   skrifar í SÖMU keyrslu úr sömu sókn og gegnum sömu seiglu, svo dagsetningin á við bæði skjölin.
// Reglurnar: borið er saman við grunn sem er í mesta lagi GRUNNUR_DAGAR eldri en skráin; tóm skrá og skrá án
// dagsetningar skilja grunninn eftir óbreyttan; nefnd sem vantar í skrána geymist í GLEYMA daga (hálf skrá), svo
// formannsskipti hennar finnist þegar hún kemur aftur; grunnur á gamla sniðinu endurstillist í þögn.
'use strict';

const GRUNNUR_DAGAR = 3;
const GLEYMA = 30;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;

function pickNefndir(nef, meta, grunnur) {
  const dags = iso(meta && meta.updated);
  if (!dags || !Array.isArray(nef) || !nef.length) return { cand: [], grunnur };

  const cur = {};
  for (const c of nef) {
    if (!c || !c.id) continue;
    const f = (c.members || []).find((m) => /formaður/i.test((m && m.stada) || ''));
    cur[c.id] = { heiti: c.heiti, formadur: f ? f.nafn : null, sidast: dags };
  }
  const g = grunnur && grunnur.nefndir && typeof grunnur.nefndir === 'object' && iso(grunnur.dags) ? grunnur : null;
  const bil = g ? dagur(dags) - dagur(iso(g.dags)) : NaN;
  const cand = [];
  if (bil >= 0 && bil <= GRUNNUR_DAGAR) {
    for (const [id, c] of Object.entries(cur)) {
      const p = g.nefndir[id];
      if (p && p.formadur && c.formadur && p.formadur !== c.formadur) cand.push({ id: +id, nefnd: c.heiti, formadur: c.formadur, fyrri: p.formadur });
    }
  }
  // Nefnd sem vantar í skrána geymist í GLEYMA daga; síðan gleymist hún.
  if (g) for (const [id, p] of Object.entries(g.nefndir)) {
    if (cur[id] || !p || !iso(p.sidast)) continue;
    if (dagur(dags) - dagur(iso(p.sidast)) <= GLEYMA) cur[id] = p;
  }
  return { cand, grunnur: { dags, nefndir: cur } };
}

module.exports = { pickNefndir };
