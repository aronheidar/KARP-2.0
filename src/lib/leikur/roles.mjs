// Hlutverka-safn RÁS-Leiksins (S5). HREINT gagna-/afleiðslu-módúl — engin env/crypto/D1.
// Umboð liðs = grunn-MANDATE með vigtum úr role.weights + role.overrides brætt per KPI.
export const ROLES = [
  { id: 'verdbolgu_haukur', label: 'Verðbólgu-haukur', blurb: 'Stöðugt verðlag umfram allt. Verðbólga við 2,5% er heilög.', weights: { verdbolga: 3 } },
  { id: 'vaxtar_stjorn', label: 'Vaxtar-stjórn', blurb: 'Kraftmikill hagvöxtur skiptir mestu; við þolum örlítið meiri verðbólgu.', weights: { hagvoxtur: 3 }, overrides: { verdbolga: { band: 2.0 } } },
  { id: 'fjarmala_vardstjori', label: 'Ríkisfjármála-varðstjóri', blurb: 'Sjálfbær ríkisfjármál. Skuldir mega ekki fara úr böndunum.', weights: { skuldir: 3 }, overrides: { skuldir: { max: 35 } } },
  { id: 'velferdar_sinni', label: 'Atvinnu-/velferðar-sinni', blurb: 'Full atvinna og velferð. Enginn skal skilinn eftir.', weights: { atvinnuleysi: 3 } },
];

// Skilar nýju mandate þar sem hver KPI fær weight úr role.weights (sjálfg. 1) + override brætt inn.
// crisis/crisisFactor haldast. role null/undefined → skilar base óbreyttu.
export function mandateForRole(baseMandate, role) {
  if (!role) return baseMandate;
  const w = role.weights || {}, ov = role.overrides || {};
  const kpis = baseMandate.kpis.map((k) => ({ ...k, weight: w[k.key] != null ? w[k.key] : 1, ...(ov[k.key] || {}) }));
  return { ...baseMandate, kpis };
}

// Round-robin úthlutun: teamIds[i] → roles[i % roles.length].id.
export function assignRoles(teamIds, roles = ROLES) {
  const map = {};
  teamIds.forEach((id, i) => { map[id] = roles[i % roles.length].id; });
  return map;
}

export function roleById(id, roles = ROLES) { return roles.find((r) => r.id === id) || null; }

// { teamId: roleId } → [{ teamId, roleId, label, blurb }] raðað eftir teamId (til birtingar/afhjúpunar).
export function revealRoles(roleMap, roles = ROLES) {
  return Object.entries(roleMap || {})
    .map(([teamId, roleId]) => { const r = roleById(roleId, roles); return { teamId: +teamId, roleId, label: r ? r.label : roleId, blurb: r ? r.blurb : '' }; })
    .sort((a, b) => a.teamId - b.teamId);
}
