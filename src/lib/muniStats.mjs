// muniStats.mjs — sveitarfélaga-uppflettingar: atvinnuleysi, afbrot, húsnæðisverð, stöðugleiki.
// -------------------------------------------------------------------------
// Hrein útgáfa af svUnemp/svUnempMuni/svCrime/svHouse/svStab (dashboard.html l.6344–6351).
// makeMuniStats(data) bindur gögnin einu sinni og skilar uppflettiföllunum. svStab er
// alveg hreint (F → %) og er líka flutt út standalone. #2 Á1, 2026-07-01.
// ATH: regionOf (landshluti per sveitarfélag) er GEO (point-in-polygon) → bíður geo.mjs;
//      föllin hér taka landshlutann `rn` sem viðfang eins og í mælaborðinu.

// Fjárhagslegur stöðugleiki 15–99 út frá skuldahlutfalli + afkomu. Hreint (F = SVFIN[nafn]).
export function svStab(F) {
  const skh = (F && F.tekjur > 0) ? (F.skuldir / F.tekjur * 100) : null;
  return skh != null
    ? Math.max(15, Math.min(99, Math.round(100 - (skh - 50) * 0.6 + (((F.afkoma_ibui || 0) >= 0) ? 5 : -8))))
    : null;
}

/**
 * @param data { ATVINNULEYSI, GLAEPIR, FASTEIGNIR }
 * @returns { svUnemp, svUnempMuni, svCrime, svHouse, svStab }
 */
export function makeMuniStats(data = {}) {
  const A = data.ATVINNULEYSI || {};
  const G = (data.GLAEPIR && data.GLAEPIR.byRegion) || {};
  const F = data.FASTEIGNIR || {};

  // Atvinnuleysi: per sveitarfélag ef til, annars landshluti (nafn-samræming svæðið↔svæði).
  const svUnemp = (name, rn) => {
    if (name && A.byMuni && A.byMuni[name] && A.byMuni[name].rate != null) return A.byMuni[name].rate;
    const a = A.byRegion || [];
    if (!rn) return null;
    const n = String(rn).replace(/svæðið$/, 'svæði');
    for (let i = 0; i < a.length; i++) if (String(a[i].name).replace(/svæðið$/, 'svæði') === n) return a[i].v;
    return null;
  };
  const svUnempMuni = (name) => !!(name && A.byMuni && A.byMuni[name] && A.byMuni[name].rate != null);

  // Afbrot per landshluti (nafn-samræming svæði↔svæðið).
  const svCrime = (rn) => { if (!rn) return null; return G[rn] || G[String(rn).replace(/svæði$/, 'svæðið')] || null; };

  // Húsnæðisverð: per sveitarfélag ef til (m²), annars nýjasti mánuður (höfuðborgarsvæði vs land).
  const svHouse = (name, rn) => {
    if (name && F.byMuni && F.byMuni[name] && F.byMuni[name].m2) return { v: F.byMuni[name].m2, muni: true };
    const ms = F.months || [];
    if (!ms.length) return null;
    const m = ms[ms.length - 1];
    const v = (rn === 'Höfuðborgarsvæðið') ? ((m.hbsv && m.hbsv.m2) || null) : ((m.land && m.land.m2) || null);
    return v != null ? { v, muni: false } : null;
  };

  return { svUnemp, svUnempMuni, svCrime, svHouse, svStab };
}
