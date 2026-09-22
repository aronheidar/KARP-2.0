// nyjar_detect.js — hreinn fréttavél-skynjari: NÝJAR færslur í skrá miðað við grunn fyrri keyrslu. CommonJS; engin fs/net.
// pickNyjar(items, grunnur, {dags, lykill, dagsetning?, dagar=30, hopur?, hamark=5000})
//   → { nyjar: [færslur], grunnur: {dags, lyklar, hopar?} }
// Notað fyrir útboðsniðurstöður og tilboðsopnanir (utbod_urslit.json) og styrki (styrkir.json).
//
// AF HVERJU (22.9.2026): grunnurinn var fylki lykla sem hver keyrsla skrifaði yfir. Þrjár gildrur birtu gamlar færslur
// sem fréttir dagsins:
//   · tóm skrá: 11.9 skilaði TED engu, grunnurinn varð [] og 12.9 birtust fríhafnarsamningur úr TED 9.4.2025,
//     Borgarlínusamningur frá 2025 og veitusamningur frá apríl sem nýjar niðurstöður;
//   · heimild sem dettur út: 8.–10.8 vantaði Tækniþróunarsjóð í styrkir.json og 11.8 birtust styrkir frá 2019 og 2020;
//   · úrelt skrá: færslur sem bættust við á meðan skráin stóð óbreytt birtust allar daginn sem hún lifnaði.
// Reglurnar:
//   · tóm skrá er ekki athugun: grunnurinn helst óbreyttur;
//   · borið er saman við grunn sem er í mesta lagi GRUNNUR_DAGAR eldri en skráin (dagsetning skráarinnar sjálfrar);
//     annars, og við grunn á gamla sniðinu (fylki), endurstillist hann í þögn;
//   · þekktir lyklar gleymast ekki þótt færsla vanti einn dag (hálf skrá), svo hún er ekki ný þegar hún kemur aftur;
//   · færsla með eigin dagsetningu (`dagsetning`) er aðeins frétt ef hún er í mesta lagi `dagar` eldri en skráin;
//   · færsla með eigið ár (`ar`, t.d. úthlutunarár styrks) er aðeins frétt ef árið er í mesta lagi einu ári á undan
//     ári skrárinnar (síðari ár leyfð: Kvikmyndasjóður úthlutar fyrir næsta ár), svo lyklabreyting birti ekki gamla styrki;
//   · með `hopur` (t.d. sjóður) er færsla aðeins borin saman ef hópur hennar var í skránni síðast.
'use strict';

const GRUNNUR_DAGAR = 3;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;

function pickNyjar(items, grunnur, opts) {
  const o = opts || {};
  const listi = Array.isArray(items) ? items : [];
  if (!listi.length) return { nyjar: [], grunnur };

  const dags = iso(o.dags);
  const dagar = o.dagar || 30;
  const hamark = o.hamark || 5000;
  const nyir = listi.map((x) => String(o.lykill(x)));
  const fyrri = Array.isArray(grunnur) ? grunnur.map(String) : grunnur && Array.isArray(grunnur.lyklar) ? grunnur.lyklar : [];
  const g = grunnur && !Array.isArray(grunnur) && iso(grunnur.dags) && Array.isArray(grunnur.lyklar) ? grunnur : null;
  const bil = g && dags ? dagur(dags) - dagur(iso(g.dags)) : NaN;
  const hopar = o.hopur ? (g && Array.isArray(g.hopar) ? new Set(g.hopar) : null) : null;

  const nyjar = [];
  if (bil >= 0 && bil <= GRUNNUR_DAGAR && (!o.hopur || hopar)) {
    const thekkt = new Set(g.lyklar);
    listi.forEach((x, i) => {
      if (thekkt.has(nyir[i])) return;
      if (o.hopur && !hopar.has(o.hopur(x))) return;
      if (o.dagsetning) {
        const d = iso(o.dagsetning(x));
        const aldur = d ? dagur(dags) - dagur(d) : NaN;
        if (!(aldur >= 0 && aldur <= dagar)) return;
      }
      if (o.ar && !(Number(o.ar(x)) >= Number(dags.slice(0, 4)) - 1)) return;
      thekkt.add(nyir[i]);   // ein færsla á nýjan lykil (styrkir án slug deila lykli og þar með fréttar-id)
      nyjar.push(x);
    });
  }

  const lyklar = [...new Set(nyir.concat(fyrri))].slice(0, hamark);
  const nyr = { dags, lyklar };
  if (o.hopur) nyr.hopar = [...new Set(listi.map(o.hopur))];
  return { nyjar, grunnur: nyr };
}

module.exports = { pickNyjar };
