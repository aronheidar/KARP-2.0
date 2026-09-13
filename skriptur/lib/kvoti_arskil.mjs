// Ársskil fiskveiðiárs — hrein föll svo hægt sé að prófa þau.
//
// ⚠⚠ 13.9.2026: breytingavakt Kvótavaktarinnar (9.900 kr/mán) bar saman fiskveiðiárið 2025/26
// við 2026/27 og sagði áskrifendum að Vinnslustöðin hefði tapað 7,7 milljón kg og Brim 7,5 á
// EINNI VIKU. Ekkert af því gerðist — nýja árið var einfaldlega ókomið í úthlutun, og ~200
// útgerðir birtust sem „horfnar". Varan selst á nákvæmlega þessari vöktun, svo þögul skekkja
// af þessari stærð er verri en engin vakt.

/**
 * Eru síðasta keyrsla og þessi sitt hvorum megin við fiskveiðiára-skil?
 * Vantandi `fyrra` (fyrsta keyrsla) telst EKKI ársskil — þá er einfaldlega ekkert að bera saman.
 */
export function erArskil(fyrraTimabil, timabil) {
  return !!(fyrraTimabil && timabil && fyrraTimabil !== timabil);
}

/**
 * Er úthlutun yfirstandandi árs ólokið?
 *
 * Meðan handhafa vantar er samþjöppun OFMETIN — færri eru í nefnaranum. 7.9.2026 sýndi
 * 268 handhafa og topp-10 í 50,98% á móti 475 og 48,0% viku áður. Það er skekkja, ekki þróun.
 *
 * Viðmiðið er lokastaða FYRRA árs, sett á ársskilunum og borin áfram. Flaggið slekkur á sér
 * sjálft þegar úthlutun nær 90% af fyrra ári.
 */
export function erIUthlutun(nHafar, vidmid, hlutfall = 0.9) {
  if (!vidmid || !(vidmid.nHafar > 0) || !(nHafar >= 0)) return false;
  return nHafar < vidmid.nHafar * hlutfall;
}

/**
 * Viðmiðið sem á að bera áfram í næstu keyrslu.
 * Á ársskilum: lokastaða fyrra árs. Innan árs: óbreytt viðmið. Engin fyrri gögn: ekkert.
 */
export function naestaVidmid(fyrra, timabil) {
  if (!fyrra) return null;
  if (erArskil(fyrra.timabil, timabil) && fyrra.heild) {
    return { timabil: fyrra.timabil, nHafar: fyrra.heild.nHafar, ti_kg: fyrra.heild.ti_kg };
  }
  if (fyrra.timabil === timabil && fyrra.arskilVidmid) return fyrra.arskilVidmid;
  return null;
}

/** '2526' → '2025/2026'. Skilar tómu fyrir ógilt, svo texti detti út frekar en að sýna rusl. */
export function arFmt(timabil) {
  const t = String(timabil || '');
  return /^\d{4}$/.test(t) ? '20' + t.slice(0, 2) + '/20' + t.slice(2) : '';
}
