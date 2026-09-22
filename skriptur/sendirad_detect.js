// sendirad_detect.js — hreinn fréttavél-skynjari: nýr sendiherra Íslands (sendirad.json). CommonJS; engin fs/net.
// pickSendirad(sr, grunnur, {max=3}) → { cand: [{land, nafn, fyrri}], grunnur: {dags, sendiherrar: {land: {nafn, sidast}}} }
//
// AF HVERJU (22.9.2026): grunnurinn var ódagsettur og HVER keyrsla skrifaði yfir hann — líka tóm keyrsla.
// 29.7.2026 (795f4dc5) var lagfærð dauð OneDrive-slóð í 14 skriftum og build_sendirad.js fór þá loks að skrifa á
// raunverulegu gogn/-slóðina. Skriftan skrapar Wikipedia-lista yfir sendiráð og hefur ALDREI skrifað `sendiherra`
// (0 tilvik í báðum útgáfum skriftunnar í git; upprunasíðan ber engin sendiherranöfn). Hún skrifaði því yfir
// RITSTÝRÐU skrána og 20 sendiherranöfn hurfu. Skynjarinn setti þá `state.sendirad = {}`:
//   3.7.2026  state.sendirad = 20 lönd með nöfnum
//   29.7.2026 state.sendirad = {}            ← grunnurinn eyðilagðist í EINNI keyrslu og hefur verið tómur síðan
// Engin röng frétt varð til (lykkjan krefst fyrra nafns), en sendiherraskipti síðan 29.7 eru ófinnanleg að eilífu.
//
// Reglurnar:
//  1. HÁLF EÐA TÓM SKRÁ ÞURRKAR ALDREI GRUNNINN. Beri skráin færri en HLUTFALL af þeim nöfnum sem grunnurinn geymir
//     er hún ekki marktæk: engin frétt og grunnurinn stendur óbreyttur. Þetta eitt hefði varið nöfnin 29.7.
//  2. DAGSETTUR GRUNNUR. Borið er saman við grunn sem er í mesta lagi GRUNNUR_DAGAR eldri en skráin — standi skráin
//     kyrr (skrapið fellur og fyrri skrá heldur sér) og lifni síðan, yrðu öll skiptin í bilinu að fréttum dagsins.
//  3. LAND SEM VANTAR GEYMIST Í GLEYMA DAGA. Hálf skrá má ekki gleyma landi, annars finnst næsta breyting þess ekki
//     (skynjarinn krefst fyrra nafns). Ótækt nafn (tómt, ekki strengur) telst „vantar", ekki „missti sendiherra".
//  4. GAMLA SNIÐIÐ ({land: nafn}, án dagsetningar) er ekki borið saman: fyrsta keyrsla endurstillir í þögn.
//  5. LAND SEM VAR EKKI Í GRUNNINUM er aldrei frétt — nýtt sendiráð er ekki sendiherraskipti.
//  6. ÞAK `max`: aldrei flóð.
//
// ⚠ SKRÁIN ER RITSTÝRÐ að því er `sendiherra` varðar: enginn skrapari framleiðir þann reit. build_sendirad.js
//   varðveitir hann nú milli keyrslna og dagsetur skrána (`updated`). Meðan engin nöfn eru í skránni er skynjarinn
//   í dvala — hann þegir, og það er rétta hegðunin, ekki bilun.
'use strict';

const GRUNNUR_DAGAR = 3;
const GLEYMA = 30;
const HLUTFALL = 0.6;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;
const nafnAf = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function pickSendirad(sr, grunnur, opts) {
  const max = (opts && opts.max) || 3;
  const dags = iso(sr && sr.updated);
  const abroad = sr && Array.isArray(sr.abroad) ? sr.abroad : null;
  if (!dags || !abroad || !abroad.length) return { cand: [], grunnur };

  // Aðeins sendiráð með tæku nafni; ótækt nafn telst „vantar" og fer gegnum GLEYMA-geymsluna.
  const cur = {};
  for (const s of abroad) {
    const land = nafnAf(s && s.is), nafn = nafnAf(s && s.sendiherra);
    if (land && nafn) cur[land] = { nafn, sidast: dags };
  }

  const g = grunnur && typeof grunnur === 'object' && iso(grunnur.dags) && grunnur.sendiherrar && typeof grunnur.sendiherrar === 'object' ? grunnur : null;
  const fyrriNofn = g ? Object.keys(g.sendiherrar).length : 0;
  // 1. Hálf eða tóm skrá er ekki marktæk (á aðeins við þegar grunnurinn geymir nöfn til að vernda).
  if (fyrriNofn && Object.keys(cur).length < HLUTFALL * fyrriNofn) return { cand: [], grunnur };

  // 3. Land sem vantar í þessa keyrslu geymist í GLEYMA daga með ÓBREYTTU `sidast`.
  if (g) for (const [land, p] of Object.entries(g.sendiherrar)) {
    if (cur[land] || !p || !nafnAf(p.nafn) || !iso(p.sidast)) continue;
    if (dagur(dags) - dagur(iso(p.sidast)) <= GLEYMA) cur[land] = { nafn: nafnAf(p.nafn), sidast: iso(p.sidast) };
  }
  const nyr = { dags, sendiherrar: cur };

  // 2. Samanburður aðeins við dagsettan grunn í hæfilegri fjarlægð.
  const bil = g ? dagur(dags) - dagur(iso(g.dags)) : NaN;
  const cand = [];
  if (bil >= 0 && bil <= GRUNNUR_DAGAR) {
    for (const [land, c] of Object.entries(cur)) {
      const p = g.sendiherrar[land];
      const fyrri = p && nafnAf(p.nafn);
      // 5. Aðeins land sem grunnurinn þekkti með nafni.
      if (!fyrri || fyrri === c.nafn) continue;
      cand.push({ land, nafn: c.nafn, fyrri });
    }
  }
  return { cand: cand.slice(0, max), grunnur: nyr };   // 6. þak
}

module.exports = { pickSendirad };
