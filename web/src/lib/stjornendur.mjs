// stjornendur.mjs — sameinar BYGGÐA stjórn og LIFANDI tengslanet fyrir stjórnendahólfið. Engin I/O.
//
// ⚠⚠ AF HVERJU ÞETTA ER TIL (17.9.2026). Hólfið sótti stjórnina eingöngu úr `/api/tengslanet`, sem
// fer á GJALDSKYLDA RSK-vefþjónustu (api.skattur.cloud, RSK_KEY). Þegar áskriftin fór að skila 403
// féll kallið, `holdur` varð ósatt og teiknifallið skilaði sér út með einni línu — engin fyrirsögn,
// engin skilaboð, ekkert. Skýrslan leit út eins og félagið ætti enga stjórn.
//
// Á meðan lá sama stjórn FULLBYGGÐ í `gogn/stjorn/<kt>.json`, byggð samdægurs af `build_stjorn.mjs`
// sem skrapar GJALDFRJÁLSA yfirlitið með headless Chrome og snertir lykilinn ekki. Gögnin voru til
// staðar allan tímann. Skýrslan leit bara aldrei á þau.
//
// Þess vegna gildir hér EIN regla: byggða skráin er GRUNNURINN, lifandi kallið AUÐGAR hana. Falli
// auðgunin heldur skýrslan sér.
//
// Og hin reglan, sem er í raun sama villan: FJARVERA ER ALDREI BORIN FRAM SEM STAÐFEST NÚLL.
// Vanti auðgunina segir `krossVantar` það, svo viðmótið segi „vitum ekki" í stað þess að þegja.
// Þögnin er einmitt ástæðan fyrir því að 403-ið lifði óséð.

/** Samanburðarlykill á nafni. Byggða skráin ber engar kennitölur, svo nafn er eina samtengingin. */
export function nafnLykill(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

/** Ástæðukóðar → texti. EIN uppspretta svo orðalagið reki ekki í sundur milli skýrslu og korts. */
export const ASTAEDA_TEXTI = {
  i_lagi: null,
  innskraning: 'Hlutverk í öðrum félögum krefjast innskráningar.',
  ostillt: 'Uppfletting í fyrirtækjaskrá Skattsins er ekki uppsett, svo hlutverk í öðrum félögum liggja ekki fyrir.',
  rsk_svarar_ekki: 'Fyrirtækjaskrá Skattsins svarar ekki í augnablikinu, svo hlutverk þessa fólks í öðrum félögum liggja ekki fyrir. Listinn hér að ofan er úr gjaldfrjálsa yfirlitinu og stendur óhaggaður.',
};

/**
 * @param {object|null} byggd    gogn/stjorn/<kt>.json  → { stjorn:[{nafn,hlutverk}], firmaritun }
 * @param {object|null} lifandi  svar /api/tengslanet   → { holdur, stjornendur, krossar, n_felog }
 * @returns {{rows:Array, krossar:Array, grunnur:('byggd'|'lifandi'|null), n_felog:(number|null),
 *            firmaritun:(string|null), astaeda:string, krossVantar:boolean}}
 */
export function sameinaStjornendur(byggd, lifandi) {
  const B = byggd && typeof byggd === 'object' ? byggd : null;
  const L = lifandi && typeof lifandi === 'object' ? lifandi : null;
  const bStjorn = Array.isArray(B && B.stjorn) ? B.stjorn : [];
  const lFolk = (L && L.holdur && Array.isArray(L.stjornendur)) ? L.stjornendur : [];

  // Ástæðurnar mega ALDREI renna saman — það var upprunalega villan. Óinnskráður, óuppsettur og
  // bilaður eru þrjú ólík vandamál með þrjár ólíkar lagfæringar, og notandinn á rétt á að vita hvert.
  const astaeda = (L && L.holdur) ? 'i_lagi'
    : (L && L.error === 'login') ? 'innskraning'
      : (L && L.unconfigured) ? 'ostillt'
        : 'rsk_svarar_ekki';

  const map = new Map();   // nafnLykill -> { nafn, hlutverk[], onnur[] } — Map heldur innsetningarröð
  const sla = (nafn) => {
    const k = nafnLykill(nafn);
    let p = map.get(k);
    if (!p) { p = { nafn: String(nafn || '').trim(), hlutverk: [], onnur: [] }; map.set(k, p); }
    return p;
  };
  const baeta = (p, h) => { const t = String(h || '').trim(); if (t && p.hlutverk.indexOf(t) < 0) p.hlutverk.push(t); };

  // 1) Byggða skráin fyrst, í sinni röð (stjórn á undan prókúru eins og RSK ber hana fram).
  //    Sami maður birtist oft tvisvar (t.d. stjórnarformaður OG prókúruhafi) — ein lína, tvö hlutverk.
  for (const s of bStjorn) { if (s && s.nafn) baeta(sla(s.nafn), s.hlutverk); }

  // Grunnurinn ræðst ÁÐUR en lifandi gögnum er blandað saman við, svo hann segi satt um upprunann.
  const grunnur = map.size ? 'byggd' : (lFolk.length ? 'lifandi' : null);

  // 2) Lifandi auðgun ofan á. Fólk sem er aðeins þar (nýrra en skrapið) bætist við fremur en að tapast.
  for (const s of lFolk) {
    if (!s || !s.nafn) continue;
    const p = sla(s.nafn);
    for (const h of (Array.isArray(s.hlutverk_rot) ? s.hlutverk_rot : [])) baeta(p, h);
    for (const o of (Array.isArray(s.onnur) ? s.onnur : [])) {
      if (o && !p.onnur.some((x) => x.kt === o.kt)) p.onnur.push(o);
    }
  }

  return {
    rows: [...map.values()],
    krossar: (L && L.holdur && Array.isArray(L.krossar)) ? L.krossar : [],
    grunnur,
    n_felog: (L && L.holdur && L.n_felog) ? L.n_felog : null,
    firmaritun: (B && B.firmaritun) ? B.firmaritun : null,
    astaeda,
    krossVantar: astaeda !== 'i_lagi',
  };
}
