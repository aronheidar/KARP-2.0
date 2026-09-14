// felag-titill.mjs — <title> fyrir /fyrirtaeki/<kt>/.
//
// ⚠ Bakgrunnur (SEO-úttekt 13.9.2026, lagað 14.9): titillinn var fastur strengur —
//   "Nafn ehf. (550911-0940) — ársreikningur, eigendur, kennitala | Karp"
// sem er ~70 stafir og klippist í leitarniðurstöðum við ~60. Allt frá „ársreikningur“
// og aftur úr hvarf því sjónum notandans. Með 31.000+ síður í vísitölu er titillinn
// stærsti einstaki smellihlutfalls-hnappurinn á vefnum.
//
// Reglan: NAFNIÐ er það sem leitað er að og má aldrei klippast. Hitt víkur í þessari
// röð þegar plássið þrýtur: lýsing → merki → kennitala. Þannig fá stutt nöfn fullan
// titil en löng nöfn standa heil í stað þess að vera klippt í miðju orði.

// ~580px í Google. Markið er hart NEMA nafnið sjálft sé lengra — þá stendur það eitt
// og óklippt: klippt heiti í miðju orði lítur út fyrir bilun og svarar ekki fyrirspurninni,
// en langur titill er einfaldlega styttur í birtingu og heldur samt samsvöruninni.
export const TITILL_HAM = 60;
const MERKI = ' | Karp';
const LYSING = ' — ársreikningur og eigendur';

const ktSnid = (kt) => {
  const d = String(kt ?? '').replace(/\D/g, '');
  return d.length === 10 ? d.slice(0, 6) + '-' + d.slice(6) : '';
};

const snyrta = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lengd = (s) => [...s].length;   // séríslenskir stafir eru eitt tákn, ekki tvö

/**
 * @param {string} nafn  Heiti félagsins úr fyrirtækjaskrá.
 * @param {string} kt    Kennitala (með eða án bandstriks).
 * @returns {string}     Titill sem er aldrei lengri en TITILL_HAM og byrjar á nafninu.
 */
export function felagTitill(nafn, kt) {
  const n = snyrta(nafn) || 'Fyrirtæki';
  const k = ktSnid(kt);
  const medKt = k ? `${n} (${k})` : n;

  // Þrepin, best fyrst. Fyrsta sem kemst fyrir vinnur.
  const kostir = [
    medKt + LYSING + MERKI,
    medKt + LYSING,
    medKt + MERKI,
    medKt,
    n + MERKI,
    n,
  ];
  for (const t of kostir) if (lengd(t) <= TITILL_HAM) return t;
  return n;   // nafnið eitt, óklippt — betra en klippt nafn
}
