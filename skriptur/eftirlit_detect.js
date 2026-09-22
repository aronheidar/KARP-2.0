// eftirlit_detect.js — hreinn fréttavél-skynjari: fjöldi matvælastaða í RVK með stöðvaða eða takmarkaða starfsemi
// (einkunn 0–1 í eftirlit.json). CommonJS; engin fs/net.
// pickEftirlit(eft, grunnur) → { bad, fyrri: fyrra gildi ef frétt, annars null, grunnur: {dags, bad, fjoldi} }
//
// AF HVERJU (22.9.2026): grunnurinn var tala (state.eftirlitBad) án dagsetningar og fréttin segir „borið saman við X
// áður". Stæði eftirlit.json óbreytt vikum saman og lifnaði, yrði breyting yfir allt bilið að frétt dagsins. Og
// build_eftirlit.js skrifar skrána þótt einstakar fyrirspurnir bregðist, svo hálf skrá (færri staðir, færri „slæmir")
// hefði orðið að frétt og heila skráin daginn eftir að annarri. Reglurnar:
//   · borið er saman við grunn sem er í mesta lagi GRUNNUR_DAGAR eldri en skráin (dagsetning skrárinnar sjálfrar);
//   · fækki stöðum um meira en FRAVIK miðað við nothæfan grunn er skráin hálf: engin frétt og grunnurinn helst;
//   · fjölgi þeim um meira en FRAVIK er þýðið annað: endurstillt í þögn;
//   · grunnur á gamla sniðinu (tala) og eldri grunnur endurstillast í þögn.
'use strict';

const GRUNNUR_DAGAR = 3;
const FRAVIK = 0.05;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;

function pickEftirlit(eft, grunnur) {
  if (!eft || !Array.isArray(eft.dist) || eft.dist.length < 6 || !eft.count) return { bad: null, fyrri: null, grunnur };
  const bad = (eft.dist[0] || 0) + (eft.dist[1] || 0);
  const dags = iso(eft.updated);
  if (!dags) return { bad, fyrri: null, grunnur };

  const nyr = { dags, bad, fjoldi: eft.count };
  const g = grunnur && typeof grunnur === 'object' && iso(grunnur.dags) && typeof grunnur.bad === 'number' && grunnur.fjoldi > 0 ? grunnur : null;
  const bil = g ? dagur(dags) - dagur(iso(g.dags)) : NaN;
  if (!(bil >= 0 && bil <= GRUNNUR_DAGAR)) return { bad, fyrri: null, grunnur: nyr };
  if (eft.count < g.fjoldi * (1 - FRAVIK)) return { bad, fyrri: null, grunnur };
  if (eft.count > g.fjoldi * (1 + FRAVIK)) return { bad, fyrri: null, grunnur: nyr };
  return { bad, fyrri: bad !== g.bad ? g.bad : null, grunnur: nyr };
}

module.exports = { pickEftirlit };
