// kyc-umsvif.mjs — umfang rekstrar úr ársreikningi, fyrir áreiðanleikakönnun.
//
// EIN UPPSPRETTA fyrir tvo neytendur sem VERÐA að sýna sömu tölur:
//   · 990-kr Áreiðanleikamatið      (web/src/pages/fyrirtaeki.astro, ?vidmot=areidanleiki)
//   · CDD-greinargerðin í vaktinni  (web/src/lib/kyc-greinargerd.mjs → areidanleikavaktin)
// Ef þessi tvö sýndu ólíkar tölur um sama félag væri skjalið ónýtt sem eftirlitsgagn, svo
// útreikningurinn býr hér — ekki afritaður í hvorn stað fyrir sig.
//
// ⚠ SÉR EINING (ekki inni í kyc-greinargerd.mjs) svo vafra-búnturinn þurfi ekki að draga
//   adverse-media.mjs + kyc.mjs með sér inn í fyrirtækjasíðuna fyrir eitt fall.

/**
 * ⚠ LEYFISSKYLDU-LÍNAN. Karp birtir hvorki lánshæfiseinkunn, greiðslumat né vanskilaskrá — það er
 * leyfisskyld starfsemi (lög nr. 33/2005) og sá fyrirvari stendur á áreiðanleikasíðunni. Þessi
 * kafli fer EKKI yfir þá línu því hann gerir tvennt og aðeins tvennt:
 *
 *   1. endurbirtir tölur ORÐRÉTT úr ársreikningi sem félagið sjálft skilaði til ársreikningaskrár
 *      Skattsins — opinberu skjali sem hver sem er getur sótt; og
 *   2. dregur ENGA ályktun um greiðsluhæfi, lánstraust eða áhættu af þeim.
 *
 * Tilgangurinn er sá sem 8. gr. laga nr. 140/2018 gerir beinlínis kröfu um: að þekkja eðli og
 * umfang viðskiptasambandsins — þ.e. hvort raunverulegur rekstur standi að baki félaginu eða
 * hvort um skel sé að ræða. Það er auðkennis-spurning, ekki lánshæfis-spurning.
 *
 * ⚠ Ef einhvern tíma stendur til að BÆTA VIÐ afleiddri einkunn, stigi eða röðun í þennan kafla:
 *   sú breyting fer yfir línuna og þarf lögfræðilega yfirferð ÁÐUR en hún fer í loftið.
 *   Prófið „LEYFISSKYLDU-LÍNAN" í kyc-greinargerd.test.mjs stendur vörð um það.
 */
export const UMSVIF_FYRIRVARI = 'Tölur í þessum kafla eru endurbirtar orðrétt úr ársreikningi félagsins '
  + 'eins og honum var skilað til ársreikningaskrár Skattsins. Þær fela hvorki í sér lánshæfiseinkunn, '
  + 'greiðslumat né vanskilaupplýsingar, og eru birtar í þeim eina tilgangi að lesandinn geti metið eðli '
  + 'og umfang viðskiptasambandsins skv. 8. gr. laga nr. 140/2018. Staðfestu tölur í ársreikningnum sjálfum.';

/**
 * Dregur umsvifin úr ársreikningi-JSON (gogn/arsreikningar/⟨kt⟩.json) — nýjasta ár sem ber efni.
 *
 * ⚠ ÓLÍKT `arsreikningurSummary` í skriptur/lib/fjarhagur.mjs sleppir þetta EKKI erlendri mynt.
 *   Sú fall er fyrir RÖÐUN (þar sem ISK-samræmi er forsenda); hér er verið að lýsa EINU félagi,
 *   og að fella Brim (EUR-samstæðu) út úr eigin áreiðanleikaskýrslu væri fáránlegt. Myntin fylgir
 *   því hverri tölu og birtist í textanum.
 *
 * `lysing` er tilbúinn íslenskur texti með ÖLLUM tölunum eins og þær eiga að lesast. Það er ekki
 * skraut: talna-gátin í parseTulkun hafnar túlkun sem nefnir tölu utan samhengisins, svo formaða
 * myndin verður að standa í samhenginu líka — annars félli hver túlkun sem skrifar „409.668" í stað
 * hrátölunnar. Sjá prófið „talna-gátin hleypir formuðu tölunum úr lysing í gegn".
 */
export function umsvifUrArsreikningi(json) {
  if (!json || !json.ar) return null;
  const ar = Object.keys(json.ar).sort().reverse();
  for (const y of ar) {
    const a = json.ar[y] || {};
    const r = a.rekstur || {}, e = a.efnahagur || {}, k = a.kpi || {};
    if (r.sala == null && e.eignir == null) continue;      // ár án efnis — reyndu næsta á undan
    const mynt = a.mynt || 'ISK';
    const kv = a.kvardi === 1000 ? 'þús. ' : '';
    const t = (v) => (v == null ? null : Math.round(v).toLocaleString('de-DE'));   // 409.668 (ísl. þúsundapunktur)
    const p = (v) => (v == null ? null : (v * 100).toFixed(2).replace('.', ','));
    const bitar = [];
    if (r.sala != null) bitar.push('Velta ' + t(r.sala) + ' ' + kv + mynt);
    if (r.hagnadur != null) bitar.push((r.hagnadur < 0 ? 'tap ' : 'hagnaður ') + t(Math.abs(r.hagnadur)) + ' ' + kv + mynt);
    if (e.eignir != null) bitar.push('eignir ' + t(e.eignir) + ' ' + kv + mynt);
    if (e.eigid_fe != null) bitar.push('eigið fé ' + t(e.eigid_fe) + ' ' + kv + mynt);
    if (k.eiginfjarhlutfall != null) bitar.push('eiginfjárhlutfall ' + p(k.eiginfjarhlutfall) + '%');
    if (a.starfsmenn != null) bitar.push(a.starfsmenn + ' starfsmenn');
    return {
      ar: y, mynt, kvardi: a.kvardi || 1, teg: a.teg || '', starfsmenn: a.starfsmenn ?? null,
      sala: r.sala ?? null, hagnadur: r.hagnadur ?? null, ebitda: r.ebitda ?? null,
      eignir: e.eignir ?? null, eigid_fe: e.eigid_fe ?? null, skuldir: e.skuldir ?? null,
      eiginfjarhlutfall: k.eiginfjarhlutfall ?? null, veltufjarhlutfall: k.veltufjarhlutfall ?? null,
      ar_a_skra: ar,
      lysing: bitar.join(', ') + ' (' + y + (a.teg ? ', ' + String(a.teg).toLowerCase() : '') + ').',
    };
  }
  return null;
}
