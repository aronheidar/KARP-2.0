// fjarmal.mjs — HREIN eining: Áskels-samningar × D1-heimildir → misræmi, fríprófanir og tvær MRR-tölur.
//
// ⚠⚠ MRR á stjórnborðinu er reiknað úr D1 með FÖSTU verðtöflunni — það mælir hvað við höfum VEITT,
//    ekki hvað er RUKKAÐ. Þetta tvennt fer í sundur nákvæmlega þegar peningar hætta að berast: kort
//    hafnar endurnýjun, réttindin standa til `until`, og talan sýnir tekjur sem koma aldrei.
//    `greidslur.mjs` veit þetta — þar stendur „Áskell = sannleikur".
// ⚠ Engin fetch, ekkert env, ekkert Date.now(). `now` kemur frá kallanda svo prófin séu föst í tíma.

/** ⚠ ORÐRÉTT sama regla og `virk` í ../worker/greidslur.mjs. Tvær talningar á sama hlut með ólíkri
 *  skilgreiningu enda alltaf á því að stangast á — og þá hættir maður að treysta báðum. */
export const VIRK = (st) => /active|trial|current/i.test(String(st || '')) && !/cancel|fail|expire|inactive/i.test(String(st || ''));

/** Fríprófun BER samning (sub2-leiðin stofnar hann í `trial`-stöðu) — hún er því ekki „gefins".
 *  En Áskell rukkar 0 meðan hún stendur, svo hún er ekki tekjur heldur. Þriðji flokkur. */
export const erFriprofun = (st) => /trial/i.test(String(st || ''));

export const ktHreint = (s) => String(s == null ? '' : s).replace(/\D/g, '');

// ⚠ Orðrétt úr ../worker/stjornbord.mjs:56-57 — þetta ER talan sem stjórnborðið sýnir í dag.
export const PRICE_TIER = { grunnur: 2900, fyrirtaeki: 6900, fyrirtaeki_plus: 12900 };
export const PRICE_SVC = { kvoti: 9900, utbod: 1900, frettir: 3900, fasteign: 3900, thingskyrslur: 3900 };

const fastVerd = (h) => (h && h.tegund === 'svc' ? (PRICE_SVC[h.vara] || 0) : (PRICE_TIER[h.vara] || 0));

/** Vísvitandi gjafaaðgangur — ALDREI misræmi. Rati hann í listann verður hann hávaði sem enginn les. */
const erGjof = (h) => !!(h && (h.free_access || h.is_admin || h.nemandi));

const erTala = (v) => typeof v === 'number' && Number.isFinite(v);

/** ⚠⚠ Upphæðin er ÓÞEKKT snið og má ekki þykjast vera þekkt.
 *
 *  `../worker/greidslur.mjs` sendir INN verð-AUÐKENNI úr `askellPriceId()` í `items[].price`
 *  (sjá línur 333 og 569-579) — ekki upphæð. Sama skrá segir berum orðum að Áskels-sniðin séu
 *  „óskjalfest" og prófar sig áfram gegnum mörg form. Við vitum því ekki hvað kemur TIL BAKA í þeim
 *  reit: auðkenni, upphæð eða hlutur.
 *
 *  Þess vegna er upphæðin sótt EXPLÍSIT og uppsprettan SKRÁÐ. Fyrsta raunmælingin á að SEGJA OKKUR
 *  hvaða snið Áskell notar (`verdUppsprettur`), í stað þess að við giskum — og ef ekkert verð finnst
 *  segir einingin `óvíst` fremur en tölu.
 *
 *  ⚠ `typeof === 'number'` er skilyrðið á `amount`/`price`, EKKI `Number(...)`. Auðkenni Áskels eru
 *    ekki hreinar tölur, en reglan verður að liggja á SNIÐINU: `Number('5900')` gefur 5900 og lítur
 *    út eins og rétt svar. Strengur telst aldrei upphæð. Falli reiturinn í gegn lendum við á
 *    listaverðinu og það SÉST í `verdUppsprettur.verdskra`.
 *  ⚠ `== null`-próf, ALDREI `||`. Liður á verði 0 (fullur afsláttur) er GILD upphæð og má ekki
 *    falla á listaverðið.
 *
 *  @returns {{ verd: number, uppspretta: 'lidur'|'verdskra'|'ekkert' }}
 */
function lidVerd(it, verdskra, vara) {
  const lid = (it && typeof it === 'object') ? it : {};
  if (erTala(lid.amount)) return { verd: lid.amount, uppspretta: 'lidur' };
  if (erTala(lid.price)) return { verd: lid.price, uppspretta: 'lidur' };
  if (lid.price && typeof lid.price === 'object' && erTala(lid.price.amount)) {
    return { verd: lid.price.amount, uppspretta: 'lidur' };
  }
  // Verðskráin er OKKAR tafla, lyklað á vöru — þar er engin auðkennis-tvíræðni, svo tölustrengur
  // úr Áskeli má þáttast hér þótt hann megi það ekki á liðnum.
  const skra = (verdskra && typeof verdskra === 'object') ? verdskra[vara] : undefined;
  if (skra != null && skra !== '') {
    const n = Number(skra);
    if (Number.isFinite(n)) return { verd: n, uppspretta: 'verdskra' };
  }
  return { verd: 0, uppspretta: 'ekkert' };
}

/** Liðir geta borið `quantity` (sjá `greidslur.mjs:333`). Fimm sæti eru ekki eitt sæti.
 *  Engin auðkennis-tvíræðni á fjölda, svo tölustrengur má þáttast. */
function lidMagn(it) {
  const n = Number(it && it.quantity);
  return (Number.isFinite(n) && n > 0) ? n : 1;
}

export function samstemma({ samningar = [], heimildir = [], verdskra = {}, now = 0 } = {}) {
  const nu = Number(now) || 0;
  const sList = (Array.isArray(samningar) ? samningar : []).filter((c) => c && VIRK(c.state));
  const hList = (Array.isArray(heimildir) ? heimildir : []).filter((h) => h && Number(h.until) > nu);

  // ⚠⚠ Lykill = kt + vara, en hann SAFNAR — hann yfirskrifar ekki. `Map.set` lét þann samning sem kom
  //    síðast vinna, svo sömu gögn í öfugri röð gáfu ólíka `mrrAskell`: helmingur upphæðar hvarf þegar
  //    samningur bar tvö stök á sömu vöru, tvírukkun varð ósýnileg, og hvort verk taldist fríprófun eða
  //    tekjur réðst af innlestrarröðinni.
  const verdUppsprettur = { lidur: 0, verdskra: 0, ekkert: 0 };
  const sMap = new Map();
  let ix = 0;
  for (const c of sList) {
    const kt = ktHreint(c.customer_reference);
    const fri = erFriprofun(c.state);
    // Auðkenni samnings telur tvírukkun. Vanti það er hver samningur samt sitt stak (röð breytir
    // ekki FJÖLDANUM, bara nafninu á honum).
    const cid = (c.id != null && c.id !== '') ? ('id:' + c.id) : ('ix:' + ix);
    ix += 1;
    for (const it of (Array.isArray(c.items) ? c.items : [])) {
      const vara = String((it && it.product_reference) || '');
      if (!kt || !vara) continue;
      const { verd, uppspretta } = lidVerd(it, verdskra, vara);
      verdUppsprettur[uppspretta] += 1;
      const upphaed = verd * lidMagn(it);
      const lykill = kt + '|' + vara;
      let b = sMap.get(lykill);
      if (!b) { b = { kt, vara, verdVirkt: 0, verdFri: 0, fri: true, greidandi: new Set() }; sMap.set(lykill, b); }
      if (fri) {
        b.verdFri += upphaed;
      } else {
        // ⚠ Ekki-fríprófun VINNUR alltaf, óháð röð — sá sem borgar ER að borga, hvað sem prófun líður.
        b.verdVirkt += upphaed;
        b.fri = false;
        b.greidandi.add(cid);
      }
    }
  }

  const misraemi = [], fripofanir = [], tvirukkun = [];
  let mrrAskell = 0, mrrD1 = 0;

  // ⚠⚠ mrrD1 telur PER RÖÐ, nákvæmlega eins og ../worker/stjornbord.mjs:59-60. `users.kt` hefur
  //    ÓEINKVÆMAN index og `parent_account_id` gerir marga notendur á einni kt að hannaðri stöðu —
  //    sé afritatvítekið per kt+vöru telja tvær heimildir sama firma sem ein og talan hættir að vera
  //    samanburðarhæf við stjórnborðið. Pörun við samninga er áfram á kt+vöru.
  const hMap = new Map();
  for (const h of hList) {
    const kt = ktHreint(h.kt);
    if (!kt || !h.vara) continue;
    const vara = String(h.vara);
    mrrD1 += fastVerd(h);
    const lykill = kt + '|' + vara;
    let b = hMap.get(lykill);
    if (!b) { b = { kt, vara, virdi: 0, ekkiGjof: 0 }; hMap.set(lykill, b); }
    if (!erGjof(h)) { b.ekkiGjof += 1; b.virdi += fastVerd(h); }
  }

  for (const [lykill, b] of sMap) {
    if (b.fri) { fripofanir.push({ kt: b.kt, vara: b.vara, verd: b.verdFri }); continue; }
    mrrAskell += b.verdVirkt;
    if (b.greidandi.size > 1) tvirukkun.push({ kt: b.kt, vara: b.vara, fjoldi: b.greidandi.size, verd: b.verdVirkt });
    // ⚠ `sidan: nu` — merkingin er „þetta sáum við núna", sem er satt. Raðað er eftir `virdi`.
    if (!hMap.has(lykill)) {
      misraemi.push({ tegund: 'borgar_fyrir_ekkert', kt: b.kt, vara: b.vara, verd: b.verdVirkt, virdi: b.verdVirkt, sidan: nu });
    }
  }
  for (const [lykill, b] of hMap) {
    if (sMap.has(lykill) || !b.ekkiGjof) continue;
    // ⚠ Áður stóð hér `sidan: h.until` — FRAMTÍÐARdagsetning sem efra lagið birti sem „síðan".
    //   Efra lagið raðar eftir `virdi`, ekki upploginni dagsetningu.
    misraemi.push({ tegund: 'gefins', kt: b.kt, vara: b.vara, verd: b.virdi, virdi: b.virdi, sidan: nu, fjoldi: b.ekkiGjof });
  }

  // Verðrek: aðeins fyrir vörur sem eiga fast verð í kóðanum. Vara utan beggja taflna hefur ekkert að
  // reka sig frá. ⚠ BÁÐAR töflurnar eru skoðaðar — þjónustuverð eru jafn harðkóðuð og þrepaverð og
  // reka sig eins.
  const verdrek = [];
  for (const [vara, askell] of Object.entries(verdskra || {})) {
    const fast = PRICE_TIER[vara] != null ? PRICE_TIER[vara] : PRICE_SVC[vara];
    if (fast != null && Number(askell) !== fast) verdrek.push({ vara, askell: Number(askell), fast });
  }

  // ⚠ Lendi EITTHVERT virkt samningsstak í `'ekkert'` er `mrrAskell` ekki tæmandi og efra lagið á að
  //   segja `óvíst` fremur en tölu. Fríprófanir teljast með: VIRK() telur þær virkar, og finnist ekkert
  //   verð á þeim er `fripofanir[].verd` líka óþekkt.
  return { misraemi, fripofanir, tvirukkun, mrrAskell, mrrD1, verdrek, verdUppsprettur, mrrAskellOvisst: verdUppsprettur.ekkert > 0 };
}
