// ─────────────────────────────────────────────────────────────
// malalyklar.cjs — lyklun þingmála á <þing>-<nr>. Hreint — engin fs/net.
//
// Af hverju (22.9.2026): atkvaedi.json var lyklað á BERT málsnúmer meðan frumvorp.json
// notar thingListi() og spannar tvö þing. **Mál nr. 1 á 158 eru fjárlögin en allt annað
// á 157.** Um leið og nýja þingið eignaðist mál með lokaatkvæðagreiðslu hefði
// `if (mal[b.nr]) continue` haldið því sem kom fyrst og nafnakall sest undir RANGT mál —
// þögult, í glugga sem segir notandanum hvernig þingmenn greiddu atkvæði.
//
// ⚠ finnaMal() les BÁÐI sniðin viljandi. Skráin (CI) og síðan (deploy) fara í loftið hvor
//   í sínu lagi, svo uppfletting sem þyldi aðeins nýja sniðið felldi nafnakallið út þangað
//   til refresh-data keyrði næst. Varaleiðin er ódýr og má standa.
// ─────────────────────────────────────────────────────────────
'use strict';

// '157-712'. Þing sem vantar (munaðarlaus færsla) heldur bera lyklinum — við búum ekki til þing.
function malLykill(thing, nr) {
  return thing == null || thing === '' ? String(nr) : String(thing) + '-' + String(nr);
}

function flettaLykil(key) {
  const m = String(key).match(/^(\d+)-(\d+)$/);
  if (m) return { thing: +m[1], nr: +m[2] };
  return { thing: null, nr: /^\d+$/.test(String(key)) ? +key : null };
}

// Nýi lykillinn fyrst, gamli beri sem varaleið meðan skrár og síður eru ósamstiga.
function finnaMal(mal, thing, nr) {
  if (!mal) return null;
  return mal[malLykill(thing, nr)] || mal[String(nr)] || null;
}

// faeraLykla(mal, bills) → { mal, faerd, oraedanleg }
// Færir gömlu beru lyklana yfir á <þing>-<nr> með því að fletta númerinu upp í málaskránni,
// svo skiptin kosti EKKI endursókn á öllum nafnaköllunum (161 köll á althingi.is).
// ⚠ Finnist númerið á FLEIRI EN EINU þingi er ekkert sem segir hvoru gamla færslan tilheyrði.
//   Þá er EKKI giskað — færslan helst ber og telst óráðanleg svo hún sjáist í loggi.
function faeraLykla(mal, bills) {
  const thingAf = {};
  (bills || []).forEach((b) => { (thingAf[b.nr] = thingAf[b.nr] || new Set()).add(b.thing); });
  const ut = {};
  let faerd = 0, oraedanleg = 0;
  for (const [key, val] of Object.entries(mal || {})) {
    if (flettaLykil(key).thing != null) { ut[key] = val; continue; }   // þegar fært
    const t = thingAf[key];
    if (t && t.size === 1) { ut[malLykill([...t][0], key)] = val; faerd++; continue; }
    ut[key] = val;
    oraedanleg++;
  }
  return { mal: ut, faerd, oraedanleg };
}

module.exports = { malLykill, flettaLykil, finnaMal, faeraLykla };
