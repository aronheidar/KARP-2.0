// markadsefni.mjs — HREIN eining: Postiz-færslur → dagatal og verk-listi markaðsfulltrúans.
//
// ⚠ TVENNT sem gerir tölurnar rangar ef það gleymist:
//   1. Postiz-reikningurinn ber FLEIRI rásir en Karp (EWB Iceland, Engineers Without Borders Iceland,
//      Steinsson|Greykdal). Ósíaður listi lítur út fyrir að vera réttur en er það ekki.
//   2. Ein færsla á tveimur rásum kemur sem TVÆR færslur með sameiginlegt `group`. Án hópunar tvítelst
//      hvert einasta myndband.
export const KARP_RASIR = [
  'cmt92pcw000r9p20yv7b53018',   // Karp — LinkedIn
  'cmt92q6mr00pbmp0ykfa92r3v',   // Karp — Facebook
];
export function erKarpRas(id) {
  return typeof id === 'string' && KARP_RASIR.includes(id);
}

/** Fyrsta setning færslunnar, á einni línu — það sem sést í dagatalinu. */
export function efnislina(f) {
  const t = String((f && f.content) || '').replace(/\s+/g, ' ').trim();
  if (!t) return '(enginn texti)';
  const setning = (t.match(/^[^.!?]*[.!?]/) || [t])[0].trim();
  return setning.slice(0, 120);
}

/** Postiz-færslur → eitt verk per `group`, aðeins Karp-rásir. Raðað eftir birtingartíma (elst fyrst). */
export function hopaFaerslur(posts) {
  const eftirHop = new Map();
  for (const f of (Array.isArray(posts) ? posts : [])) {
    if (!f || !erKarpRas(f.integration && f.integration.id)) continue;
    const lykill = f.group || f.id;
    const ts = Math.floor(new Date(f.publishDate || 0).getTime() / 1000) || 0;
    const fyrir = eftirHop.get(lykill);
    if (fyrir) {
      if (!fyrir.rasir.includes(f.integration.providerIdentifier)) fyrir.rasir.push(f.integration.providerIdentifier);
      if (f.state === 'PUBLISHED') fyrir.birt = true;
      continue;
    }
    eftirHop.set(lykill, {
      lykill, group: f.group || null, ts, texti: efnislina(f), state: f.state || '',
      birt: f.state === 'PUBLISHED', rasir: [f.integration.providerIdentifier],
    });
  }
  return [...eftirHop.values()].sort((a, b) => a.ts - b.ts);
}

/** Staða dagatalsins. `dagarFram` er talan sem segir hvort maður sé á eftir — ekki fjöldinn í röðinni. */
export function dagatal(verk, nu) {
  const listi = Array.isArray(verk) ? verk : [];
  const nuS = Number(nu) || 0;
  const framundan = listi.filter((v) => v.ts > nuS);
  const bakvid = listi.filter((v) => v.ts <= nuS);
  const sidasti = framundan.length ? framundan[framundan.length - 1].ts : 0;
  return {
    iRod: framundan.length,
    naesta: framundan[0] || null,
    birtSidast: bakvid.length ? bakvid[bakvid.length - 1] : null,
    naerTil: sidasti || 0,
    dagarFram: sidasti ? Math.round((sidasti - nuS) / 86400) : 0,
  };
}
