// raedur_detect.js — hreinn fréttavél-skynjari: „talaði mest á Alþingi" á viku (raedugreining.json). CommonJS; engin fs/net.
// pickRaedur(ra, snap, {nafnAf, max=3}) → { listi: [{nafn, minutur}], fra, til, snap: {thing, dags, min: {id: mínútur}} }
//
// AF HVERJU (22.9.2026): grunnurinn var dagsettur eftir keyrsludegi og borinn saman þegar 6 dagar eða fleiri voru liðnir,
// án efri marka. Stæði raedugreining.json óbreytt (Alþingi svarar stundum 429 og skráin er þá ekki skrifuð) og lifnaði
// síðan, bæri mismunurinn allar ræður tímabilsins en fréttin segði „á viku" frá dagsetningu keyrslunnar. Grunnurinn
// ber nú dagsetningu skrárinnar sjálfrar (`updated`, skrifuð aðeins þegar sóttist) og er borinn saman þegar VIKA_FRA
// til VIKA_TIL dagar eru milli skránna; lengra bil, nýtt þing og grunnur á gamla sniðinu endurstilla í þögn.
// Tóm eða hálf skrá (Alþingi svarar 200 með styttum lista) verður aldrei grunnur: annars fengi hver þingmaður sem vantaði
// allt þingið sem „vikuna" viku síðar. Uppsafnaðar mínútur þingsins lækka ekki nema um smáleiðréttingar, svo skrá
// sem er undir LAEKKUN af grunninum er hálf og grunnurinn helst.
'use strict';

const VIKA_FRA = 6;
const VIKA_TIL = 8;
const LAGMARK = 60;
const LAEKKUN = 0.98;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;

function pickRaedur(ra, snap, opts) {
  const o = opts || {};
  const max = o.max || 3;
  const nafnAf = o.nafnAf || {};
  const dags = iso(ra && ra.updated);
  const mp = ra && ra.mp && typeof ra.mp === 'object' ? ra.mp : {};
  if (!dags || !Object.keys(mp).length) return { listi: [], fra: null, til: null, snap };

  const cur = {};
  for (const [id, d] of Object.entries(mp)) cur[id] = Math.round((d && d.min) || 0);
  const nyr = { thing: ra.thing, dags, min: cur };
  const s = snap && iso(snap.dags) && snap.min && snap.thing === ra.thing ? snap : null;
  const summa = (m) => Object.values(m).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  if (s && summa(cur) < summa(s.min) * LAEKKUN) return { listi: [], fra: null, til: null, snap };   // hálf skrá
  const bil = s ? dagur(dags) - dagur(iso(s.dags)) : NaN;

  if (bil >= 0 && bil < VIKA_FRA) return { listi: [], fra: null, til: null, snap };
  if (!(bil >= VIKA_FRA && bil <= VIKA_TIL)) return { listi: [], fra: null, til: null, snap: nyr };

  const listi = Object.entries(cur)
    .map(([id, m]) => ({ nafn: nafnAf[id], minutur: m - (s.min[id] || 0) }))
    .filter((x) => x.nafn && x.minutur > 0)
    .sort((a, b) => b.minutur - a.minutur);
  return { listi: listi.length && listi[0].minutur >= LAGMARK ? listi.slice(0, max) : [], fra: iso(s.dags), til: dags, snap: nyr };
}

module.exports = { pickRaedur };
