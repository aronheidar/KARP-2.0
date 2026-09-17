// rsk_api.mjs — sókn á mælda RSK-APIð (api.skattur.cloud) fyrir nætur-skriðuna, með
// flokkun svara sem greinir BANVÆNT frá „sleppa þessu félagi" og frá „reyna aftur síðar".
//
// ⚠⚠ Bakgrunnur (17.9.2026): crawl_tengsl.mjs hafði
//       if (r.status === 404 || r.status === 403) return { notfound: true };
//    sem felldi TVÖ óskyld tilvik saman. Þegar mánaðarkvóti RSK tæmist svarar Azure 403 við
//    HVERJU kalli — skriðan merkti þá hvert RAUNVERULEGT félag sem „ekki til", taldi það
//    afgreitt og heimsótti það ALDREI aftur (biðröðin tekur aldrei upp 'notfound'). Keyrslan
//    hefði verið græn á meðan grunnurinn úreltist. Það hafði ekki bitið enn (42 notfound gegn
//    6.615 done) en beið. Reglan sem sker úr býr í web/src/lib/rsk-kvoti.mjs — SÚ SAMA og
//    workerinn notar, svo hún geti ekki rekið í sundur.
//
// Sama mynstur og buildScrapeFetcher í rsk_fetch.mjs við hliðina: `fetchImpl` er sprautað
// inn svo flokkunin sé prófanleg ÁN þess að snerta mælda APIð (hvert kall er sóun).
import { erKvotaSvar } from '../../web/src/lib/rsk-kvoti.mjs';

const API = 'https://api.skattur.cloud/legalentities/v2.1/';

/**
 * @param {object} o
 * @param {string} o.proxyBase  worker-slóð (t.d. https://karp.is) eða '' fyrir beina sókn
 * @param {string} o.rskKey     áskriftarlykill (fer sem X-Karp-Proxy um proxy, annars beint)
 * @param {number} [o.timeout]  ms; án hans engin tímamörk (prófin nota það)
 * @param {Function} [o.fetchImpl]
 */
export function buildApiFetcher({ proxyBase, rskKey, timeout, fetchImpl }) {
  const base = String(proxyBase || '').replace(/\/$/, '');
  const f = fetchImpl || globalThis.fetch;

  /**
   * Skilar EINU af: { json } · { notfound } · { retry } · { error }.
   * KASTAR við 401 (ógildur lykill) OG við kvóta-403 — hvort tveggja þýðir að ekkert
   * frekara kall þessa nótt skilar gögnum, svo skriðan á að HÆTTA en ekki menga.
   */
  async function fetchApi(kt) {
    const url = base ? (base + '/api/rskproxy?api=' + kt) : (API + kt + '?language=is');
    const headers = base
      ? { 'X-Karp-Proxy': rskKey, 'Accept': 'application/json' }
      : { 'Ocp-Apim-Subscription-Key': rskKey, 'Accept': 'application/json' };
    const init = { headers };
    if (timeout) init.signal = AbortSignal.timeout(timeout);
    let r;
    try { r = await f(url, init); }
    catch (e) { return { retry: 'network' }; }   // DNS/tenging/tímarof → reyna aftur síðar
    // 401 og 403 eru einu stöðurnar þar sem bolurinn sker úr, svo hann er aðeins lesinn þar.
    if (r.status === 401 || r.status === 403) {
      const raw = await r.text().catch(() => '') || '';
      const b = raw.replace(/\s+/g, ' ').slice(0, 140);   // aðeins til birtingar í loggi
      if (r.status === 401) throw new Error('AUTH 401 (ógildur lykill?) :: ' + b);
      // ⚠ Bolurinn — ekki staðan — greinir uppurinn kvóta frá lokuðu lögformi. Prófað er á
      //   ÓSTYTTAN bol: styttingin er birtingaratriði og má ekki geta falið merkið.
      if (erKvotaSvar(403, raw)) throw new Error('KVÓTI UPPURINN (mánaðarkvóti RSK) :: ' + b);
      return { notfound: true };   // lokað lögform (t.d. Z3) → sleppa félaginu eins og 404
    }
    if (r.status === 404) return { notfound: true };
    if (r.status === 429 || r.status >= 500) return { retry: r.status };   // tímabundið
    if (!r.ok) return { error: r.status };                                 // annað 4xx → gefast upp
    const txt = await r.text().catch(() => '');
    let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return json ? { json } : { retry: 'badjson' };
  }

  return { fetchApi };
}

/**
 * Samantektarlína fyrir nótt sem STÖÐVAÐIST — `null` þegar ekkert stopp varð.
 *
 * ⚠ Hvers vegna: stoppið skildi aðeins eftir stderr-línu og keyrslan varð GRÆN. Uppurinn
 *   kvóti er VÆNTANLEGT ástand héðan í frá (ekki bilun) og á því að standa í samantekt
 *   keyrslunnar, eins og heilsu-hliðið gerir — annars hættir grunnurinn að vaxa í þögn.
 *
 * @param {string|null} skilabod villuskilaboðin sem stöðvuðu nóttina (`e.message`)
 * @param {{unnid?:number, budget?:number}} [taln]
 */
export function stoppLina(skilabod, taln) {
  const m = String(skilabod == null ? '' : skilabod).trim();
  if (!m) return null;
  const { unnid, budget } = taln || {};
  const komst = (unnid == null ? '?' : unnid) + '/' + (budget == null ? '?' : budget) + ' API-köll';
  // Kvóti og ógildur lykill kalla á ÓLÍK viðbrögð — bíða af sér mánaðamót vs. skipta um lykil.
  if (/KVÓTI UPPURINN/.test(m) || erKvotaSvar(403, m)) {
    return '⛔ **Nóttin stöðvaðist: mánaðarkvóti RSK er uppurinn.** Komst í ' + komst
      + '. Biðröðin er ÓSNERT (engin `notfound`-mengun) — grunnurinn úreltist frekar en að spillast.'
      + ' Kvótinn fyllist 1. næsta mánaðar; til að flýta þarf annan áskriftarlykil.';
  }
  if (/AUTH 401/.test(m)) {
    // ⚠ Orðið „kvóti" kemur hvergi fyrir hér, líka ekki í neitun: prófið ver aðgreininguna með
    //   berum orðaleitum og „EKKI kvóti" myndi ýmist fella það eða kenna því að líta framhjá.
    //   Línan segir hvað ÞETTA ER og hvað þarf að gera — það er líka betri texti.
    return '⛔ **Nóttin stöðvaðist: RSK hafnaði lyklinum (401).** Komst í ' + komst
      + '. Lykillinn sjálfur er ógildur eða útrunninn; mánaðamót laga það ekki og skipta þarf um lykil.';
  }
  return '⛔ **Nóttin stöðvaðist:** `' + m.split(' :: ')[0] + '`. Komst í ' + komst + '.';
}
