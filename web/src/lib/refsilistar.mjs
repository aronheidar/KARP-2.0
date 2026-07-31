// refsilistar.mjs — hrein lyklunar- og samsvörunarrök refsilista-skimunar (F9).
// Flutt úr worker/veitur.mjs 31.7.2026 svo hægt sé að prófa þau: sanctionsIndex er
// memo-að í modúl-breytu (SANCTIONS_IDX) sem prófin komast ekki framhjá.
//
// TVÖ LÖG, viljandi aðskilin:
//   sterk — fjöl-orða nöfn, lykill 'fyrsta|síðasta'. ÓBREYTT hegðun.
//   veik  — raunveruleg eins-orðs nöfn, lykill = fullt tóken, NÁKVÆMT jafnræði.
// Veik samsvörun má ALDREI enda í sanctions.hits: hits keyrir severity:'critical',
// deriveRisk→'Há', kycCriticalCron-póst og lánshæfis-þak (cap 20 → E).
// Mæling 31.7.2026: nákvæm eins-orðs samsvörun gaf 17 samsvaranir á 8.240 íslenskum
// nöfnum — allar falskar (Nova, Saga, Orion, Titan, Fox …). Þess vegna veikt lag.

// ⚠ sancNorm er EKKI eingöngu F9-rök: worker/veitur.mjs notar hana líka til að byggja
// og fletta upp í PEP-vísitölunni (kycPepIndex + PEP-samsvörunarlínan í kycScreenKt).
// Breyting hér hefur því þögul áhrif á PEP-samsvörun líka, ekki bara sanctions-skimun.
export const sancNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Eins og sancNorm en heldur TÖLUSTÖFUM og hendir bilum — til að bera fyrirspurn
// saman við birtingarnafn færslunnar. Greinarmerki og broddstafir hunsuð.
const alnum = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ðþæ]/g, '');

export function byggjaVisitolu(names) {
  const sterk = new Map(), veik = new Map();
  for (const x of (names || [])) {
    const t = String((x && x.n) || '').split(' ').filter(Boolean);
    const gildi = { nafn: x && x.nafn, listar: x && x.listar };
    if (t.length >= 2) {
      const key = t[0] + '|' + t[t.length - 1];
      if (!sterk.has(key)) sterk.set(key, gildi);
    } else if (t.length === 1) {
      // Aðeins RAUNVERULEG eins-orðs nöfn. Ef birtingarnafnið er fleiri en eitt orð
      // varð eins-orðs myndin til við normaliseringu (kýrillískt/grískt/tölur falla
      // burt): "полковник Omega"→omega, "Department 140/16"→department, "NAVIS 6"→navis.
      // 217 af 3.419 færslum eru slíkar og eru verstu falsjákvæðurnar.
      const disp = String((x && x.nafn) || '').trim().split(/\s+/).filter(Boolean);
      if (disp.length !== 1) continue;
      if (!veik.has(t[0])) veik.set(t[0], gildi);
    }
  }
  return { sterk, veik };
}

export function skima(visitala, rawNafn) {
  const sterk = (visitala && visitala.sterk) || new Map();
  const veik = (visitala && visitala.veik) || new Map();
  const t = sancNorm(rawNafn).split(' ').filter(Boolean);

  if (t.length >= 2) {
    const lykill = t[0] + '|' + t[t.length - 1];
    const m = sterk.get(lykill);
    return m ? { flokkur: 'sterk', lykill, listi: m.nafn, listar: m.listar } : null;
  }
  if (t.length === 1) {
    const m = veik.get(t[0]);
    // Fyrirspurnar-vörn: lyklunin ein og sér hleypir of miklu í gegn, því sancNorm
    // hendir tölustöfum. Krefjumst þess að fyrirspurnin sé stafrétt sama nafn og
    // BIRTINGARNAFN færslunnar — annars samsvarar "SSL25" ESB-færslunni SSL og
    // "Maia" OFAC-færslunni MAIA-1. Greinarmerki hunsuð: "Hamas." samsvarar "Hamas".
    if (!m || alnum(rawNafn) !== alnum(m.nafn)) return null;
    return { flokkur: 'veik', lykill: t[0], listi: m.nafn, listar: m.listar };
  }
  return null;
}

// flokkaNofn — ein sameiginleg leið fyrir báða kallstaðina (sanctionsHandler + kycScreenKt)
// til að raða nöfnum í sterkar/veikar. Áður var þessi lúkka afrituð inn í hvorn kallstað
// fyrir sig í worker/veitur.mjs — ÓPRÓFANLEG afritun sem leyfði stökkbreytingu (bæði lögin
// í sterkar) að renna í gegn með öll 336 prófin standandi. Nú á einum stað, einingaprófanleg.
export function flokkaNofn(visitala, nofn, { dedup = false } = {}) {
  const sterkar = [], veikar = [], seen = new Set();
  for (const raw of (nofn || [])) {
    const m = skima(visitala, raw);
    if (!m) continue;
    if (dedup) { const k = m.flokkur + '|' + m.lykill; if (seen.has(k)) continue; seen.add(k); }
    (m.flokkur === 'sterk' ? sterkar : veikar).push({ nafn: raw, listi: m.listi, listar: m.listar });
  }
  return { sterkar, veikar };
}

// skimunarNidurstada — skilar nákvæmlega því sem kycScreenKt setur í sanctions-sviðið.
// Áður var þessi lögun (flokkaNofn → { hits, veikar }) tvær .map-línur inni í kycScreenKt
// sjálfu — óprófanlegt glue (þarf D1-mokkun + fjögur augGet-gögn + fetch), og stökkbreyting
// sem sameinaði lögin þar lét öll 342 prófin standast. Nú á einum stað, einingaprófanleg.
// dedup:false er tilgreint berum orðum (ekki reitt á sjálfgefna gildi flokkaNofn) — þessi
// leið á ALDREI að fella saman endurtekningar, ólíkt sanctionsHandler sem tilgreinir dedup:true.
export function skimunarNidurstada(visitala, nofn) {
  const { sterkar, veikar } = flokkaNofn(visitala, nofn, { dedup: false });
  return {
    hits: sterkar.map((x) => ({ name: x.nafn })),
    veikar: veikar.map((x) => ({ name: x.nafn, listi: x.listi, listar: x.listar })),
  };
}
