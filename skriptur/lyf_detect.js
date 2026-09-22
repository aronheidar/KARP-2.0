// lyf_detect.js — hreinn fréttavél-skynjari: nýr skortur á nauðsynlegu lyfi (lyf.json). CommonJS; engin fs/net.
// pickLyf(lyf, grunnur, fyrst, {max=2}) → { cand: [lyf], grunnur: {dags, n, sidast: {slug: dags}}, fyrst: {slug: dags|'ohekkt'}, vidvorun }
//   grunnur → state.lyfSeen · fyrst → state.lyfFyrst (hvenær skortur sást fyrst; bakgrunnur lyfjafréttar les hann)
//
// AF HVERJU (22.9.2026): grunnurinn var fylki slugga sem hver keyrsla skrifaði yfir, og upphafsdagur skorts var
// keyrsludagurinn. Þrennt birti skort sem hafði staðið lengi sem „nýjan":
//   · úrelt skrá: lyf.json stóð frá 7.7 til 25.7 og 26.7 birtist skortur sem hófst einhvern tíma á bilinu;
//   · skortur sem hverfur úr skránni í fáeina daga: 7 af 59 lyfjafréttum (t.d. myfenax 15.8 eftir eins dags hlé);
//   · tóm eða hálf skrá hefði birt allan skort sem nýjan daginn sem hún kæmi aftur.
// Reglurnar:
//   · borið er saman við grunn sem er í mesta lagi GRUNNUR_DAGAR eldri en skráin (dagsetning skrárinnar sjálfrar);
//     annars, og við grunn á gamla sniðinu (fylki), endurstillist hann í þögn og nýr skortur fær upphaf 'ohekkt';
//   · skortur sem sást á síðustu GLEYMA dögum er ekki nýr og heldur upphafsdegi sínum;
//   · skortsmynd sem er innan við helmingur þeirrar síðustu (t.d. tóm) er gagnabilun: allt stendur óbreytt meðan
//     grunnurinn er nothæfur, svo bilun í 1–3 daga brúast en varanleg fækkun er tekin gild í þögn;
//   · upphafsdagur nýs skorts er dagsetning skrárinnar, ekki keyrsludagurinn.
'use strict';

const GRUNNUR_DAGAR = 3;
const GLEYMA = 30;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;

function pickLyf(lyf, grunnur, fyrst0, opts) {
  const max = (opts && opts.max) || 2;
  const fyrri = fyrst0 && typeof fyrst0 === 'object' ? fyrst0 : {};
  const skortur = ((lyf && lyf.lyf) || []).filter((x) => x && x.shortage && x.slug);
  const dags = iso(lyf && lyf.updated);
  const g = grunnur && !Array.isArray(grunnur) && iso(grunnur.dags) && grunnur.sidast && typeof grunnur.sidast === 'object' ? grunnur : null;
  const obreytt = (vidvorun) => ({ cand: [], grunnur, fyrst: fyrst0, vidvorun });

  if (!dags) return obreytt('lyf.json án dagsetningar; lyfSeen og lyfFyrst óbreytt');
  const bil = g ? dagur(dags) - dagur(iso(g.dags)) : NaN;
  const sambaerilegt = bil >= 0 && bil <= GRUNNUR_DAGAR;
  // Vörnin brúar aðeins bilun meðan grunnurinn er nothæfur; standi fækkunin lengur er hún tekin gild í þögn.
  if (sambaerilegt && skortur.length < (g.n || 0) / 2) {
    return obreytt(`lyf.json: ${skortur.length} lyf í skorti en ${g.n} síðast; líkleg gagnabilun, lyfSeen og lyfFyrst óbreytt`);
  }
  const mork = dagur(dags) - GLEYMA;
  const sidast = {};
  if (g) for (const [s, d] of Object.entries(g.sidast)) if (iso(d) && dagur(iso(d)) >= mork && dagur(iso(d)) <= dagur(dags)) sidast[s] = iso(d);

  const cand = sambaerilegt ? skortur.filter((x) => x.essential && !(x.slug in sidast)).slice(0, max) : [];
  const fyrst = {};
  for (const x of skortur) fyrst[x.slug] = fyrri[x.slug] || (sambaerilegt && !(x.slug in sidast) ? dags : 'ohekkt');
  for (const s of Object.keys(sidast)) if (!(s in fyrst) && fyrri[s]) fyrst[s] = fyrri[s];   // horfinn í bili: upphafsdagur geymist
  for (const x of skortur) sidast[x.slug] = dags;
  return { cand, grunnur: { dags, n: skortur.length, sidast }, fyrst, vidvorun: null };
}

module.exports = { pickLyf };
