// Live fórnarskipta-skynjun fyrir RÁS-Leikinn: canonical þjóðhags-spennur út frá KPI-stöðu.
// HREINT — engin env/D1. kpiVals: {verdbolga, atvinnuleysi, skuldir, hagvoxtur, ...}. mandate = umboð.
// Skilar [{ key1, key2, msg }] — birt sem live gult ⚠-borði í studio-forskoðun (uppfærist með sleðum).
export function detectConflicts(kpiVals = {}, mandate) {
  const spec = {}; for (const k of (mandate && mandate.kpis) || []) spec[k.key] = k;
  const val = (k) => (kpiVals[k] == null ? null : kpiVals[k]);
  // Yfir efri mörkum (target/max) að viðbættu bandi
  const over = (k) => { const s = spec[k], v = val(k); if (!s || v == null) return false; const b = s.band || 0; return s.dir === 'target' ? v > s.target + b : s.dir === 'max' ? v > s.max + b : false; };
  // Undir neðri mörkum (min) að frádregnu bandi
  const under = (k) => { const s = spec[k], v = val(k); if (!s || v == null) return false; const b = s.band || 0; return s.dir === 'min' ? v < s.min - b : false; };
  // Kröftugur (yfir min+band) — f. örvunar-spennu
  const strong = (k) => { const s = spec[k], v = val(k); if (!s || v == null) return false; const b = s.band || 0; return s.dir === 'min' ? v > s.min + b : false; };

  const out = [];
  // Phillips: verðbólga OG atvinnuleysi bæði of há
  if (over('verdbolga') && over('atvinnuleysi'))
    out.push({ key1: 'verdbolga', key2: 'atvinnuleysi', msg: 'Verðbólga og atvinnuleysi bæði yfir mörkum — að kæla verðbólgu (hærri vextir/aðhald) ýtir atvinnuleysi enn hærra. Klassísk klemma.' });
  // Örvun vs verðstöðugleiki: kröftugur vöxtur EN verðbólga of há
  if (over('verdbolga') && strong('hagvoxtur'))
    out.push({ key1: 'hagvoxtur', key2: 'verdbolga', msg: 'Kröftugur vöxtur en há verðbólga — meiri örvun eykur verðbólguna. Vöxtur og verðstöðugleiki toga á móti.' });
  // Aðhald vs vöxtur: skuldir of háar OG vöxtur of veikur
  if (over('skuldir') && under('hagvoxtur'))
    out.push({ key1: 'skuldir', key2: 'hagvoxtur', msg: 'Háar skuldir og veikur vöxtur — aðhald lækkar skuldir en kælir vöxtinn enn frekar; örvun hjálpar vexti en hleður á skuldir.' });
  return out;
}
