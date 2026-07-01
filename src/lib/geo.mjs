// geo.mjs — landshluta-vörpun (point-in-polygon) + lífsgæðavísitala.
// -------------------------------------------------------------------------
// Hrein útgáfa af pointInRing/pointInFeat/ringMinD2/featMinD2 + regionOf (dashboard.html
// l.2360–2366) og lifsQ (l.2418). Gögn (SVCOORDS/REGIONGEO/SVMETA) og þver-modúl föll
// (svUnemp/svCrime úr muniStats) eru INJECTUÐ → engir imports, ekkert scope. #2 Á1, 2026-07-01.

// ---------- Hrein rúmfræði (ray-casting point-in-polygon) ----------
export function pointInRing(pt, ring) {
  const x = pt[0], y = pt[1], n = ring.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

export function pointInFeat(pt, gm) {
  if (!gm) return false;
  if (gm.type === 'Polygon') return pointInRing(pt, gm.coordinates[0]);
  if (gm.type === 'MultiPolygon') return gm.coordinates.some((p) => pointInRing(pt, p[0]));
  return false;
}

// Ferningsfjarlægð í næsta hring-hnút (0.44 = grófleiðrétting fyrir lengdargráðu á Íslandi).
function ringMinD2(pt, ring) {
  let m = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const dx = (ring[i][0] - pt[0]) * 0.44, dy = ring[i][1] - pt[1], d = dx * dx + dy * dy;
    if (d < m) m = d;
  }
  return m;
}

export function featMinD2(pt, gm) {
  if (!gm) return Infinity;
  if (gm.type === 'Polygon') return ringMinD2(pt, gm.coordinates[0]);
  if (gm.type === 'MultiPolygon') { let m = Infinity; gm.coordinates.forEach((p) => { const d = ringMinD2(pt, p[0]); if (d < m) m = d; }); return m; }
  return Infinity;
}

// ---------- regionOf: sveitarfélag → landshluti ----------
// Punktur inni í landshluta → nafn hans; annars næsti landshluti (fallback).
// data = { SVCOORDS: {nafn:[lat,lon]}, REGIONGEO: GeoJSON FeatureCollection }
export function makeRegionOf(data = {}) {
  const SVCOORDS = data.SVCOORDS || {}, REGIONGEO = data.REGIONGEO || null;
  return function regionOf(nafn) {
    const g = SVCOORDS[nafn];
    if (!g || !REGIONGEO) return null;
    const pt = [g[1], g[0]], fs = REGIONGEO.features || [];   // [lat,lon] → [lon,lat] fyrir GeoJSON
    for (let i = 0; i < fs.length; i++) if (pointInFeat(pt, fs[i].geometry)) return fs[i].properties.name;
    let best = null, bd = Infinity;
    for (let k = 0; k < fs.length; k++) { const d = featMinD2(pt, fs[k].geometry); if (d < bd) { bd = d; best = fs[k].properties.name; } }
    return best;
  };
}

// ---------- lifsQ: lífsgæði 0–100 (atvinna · öryggi · vöxtur) ----------
// Meðaltal tiltækra þátta. Deps injectuð: regionOf (geo), svUnemp+svCrime (muniStats), SVMETA (gögn).
export function makeLifsQ(deps = {}) {
  const SVMETA = deps.SVMETA || {};
  const regionOf = deps.regionOf || (() => null);
  const svUnemp = deps.svUnemp || (() => null);
  const svCrime = deps.svCrime || (() => null);
  return function lifsQ(name) {
    const reg = regionOf(name), m = SVMETA[name] || {};
    const au = svUnemp(name, reg), atv = (au == null) ? null : Math.max(0, Math.min(100, 100 - au * 11));
    const cr = svCrime(reg), ory = cr ? Math.max(0, Math.min(100, 100 - cr.hegn / 4.5)) : null;
    const vox = (m.breyting_pct != null) ? Math.max(0, Math.min(100, 50 + m.breyting_pct * 12)) : null;
    const v = [atv, ory, vox].filter((x) => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
}
