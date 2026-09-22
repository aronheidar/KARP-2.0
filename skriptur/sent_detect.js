// sent_detect.js — hreinn fréttavél-skynjari: tónsveifla í fjölmiðlaumfjöllun félags. CommonJS; engin fs/net.
// pickSent(se, grunnur, {max=3}) → { cand: [{nafn, fra, i, n, w}], grunnur: {dags, idx: {nafn: idx}} }
//
// AF HVERJU (22.9.2026): sentiment.json stóð óbreytt frá 28.6 til 22.9 og state.sent geymdi júnígildin. Næsta keyrsla
// hefði borið þriggja mánaða gamalt gildi saman við daginn í dag og birt „IKEA fór úr -100 í 29" sem frétt. Samanburður
// er því aðeins gerður við grunn sem er í mesta lagi GRUNNUR_DAGAR eldri en skráin, og grunnurinn geymir aðeins félög
// með a.m.k. LAGMARK_FRETTA fréttum (júnígildið -100 hvíldi á örfáum fréttum). Grunnur á gamla sniðinu ({nafn: idx},
// án dagsetningar) er ekki borinn saman: fyrsta keyrsla endurstillir í þögn.
'use strict';

const LAGMARK_FRETTA = 5;
const THROSKULDUR = 40;
const GRUNNUR_DAGAR = 3;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const dagur = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;

function pickSent(se, grunnur, opts) {
  const max = (opts && opts.max) || 3;
  const companies = (se && se.companies) || {};
  const dags = se && typeof se.updated === 'string' && ISO.test(se.updated) ? se.updated.slice(0, 10) : null;
  const nyr = { dags, idx: {} };
  for (const [nafn, d] of Object.entries(companies)) {
    if (d && typeof d.idx === 'number' && (d.n || 0) >= LAGMARK_FRETTA) nyr.idx[nafn] = d.idx;
  }
  const g = grunnur && typeof grunnur.dags === 'string' && ISO.test(grunnur.dags) && grunnur.idx ? grunnur : null;
  const bil = g && dags ? dagur(dags) - dagur(g.dags) : NaN;
  const cand = [];
  if (bil >= 0 && bil <= GRUNNUR_DAGAR) {
    for (const [nafn, i] of Object.entries(nyr.idx)) {
      const fra = g.idx[nafn];
      if (typeof fra !== 'number' || Math.abs(i - fra) < THROSKULDUR) continue;
      cand.push({ nafn, fra, i, n: companies[nafn].n, w: Math.abs(i - fra) });
    }
  }
  cand.sort((a, b) => b.w - a.w);
  return { cand: cand.slice(0, max), grunnur: nyr };
}

module.exports = { pickSent };
