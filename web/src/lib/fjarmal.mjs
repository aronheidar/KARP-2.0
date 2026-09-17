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

/** Vísvitandi gjafaaðgangur — ALDREI misræmi. Rati hann í listann verður hann hávaði sem enginn les.
 *  ⚠ Verk 4-yfirferð: flutt út (export) svo worker/fjarmal.mjs geti flutt hana INN í `rennurUt` í stað
 *    þess að afrita skilgreininguna — tvær útgáfur af sama hugtaki reka alltaf í sundur. */
export const erGjof = (h) => !!(h && (h.free_access || h.is_admin || h.nemandi));

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

  // ⚠⚠ PÖRUNIN ER Í ÞREMUR ÞREPUM og forgangurinn er hluti af skilgreiningunni:
  //    (1) SAMNINGSAUÐKENNI — `samningur.id` á móti `heimild.askell_id`. Ótvírætt þegar það hittir.
  //    (2) kennitala + vara — grípur þau tilvik þar sem auðkennið hefur rekið sig eða vantar.
  //    (3) hitti hvorugt er stakið ÓAUÐKENNT og talan segir frá því (`verdUppsprettur.oaudkennt`).
  //
  //    ⚠ Hér stóð áður að parað væri EINGÖNGU á kt+vöru og að `askell_id` mætti aldrei nota eitt.
  //      Sú regla var of hörð og hún var MÆLD ÚR GILDI: fyrsta raunkeyrslan gaf `oaudkennt: 3` og
  //      `mrrAskellOvisst: true` — enginn samningur var auðkennanlegur, svo einingin mældi ekkert.
  //      Ástæðan er að Áskell skilar okkur hvorugum reitnum sem parað var á:
  //      · `../worker/greidslur.mjs:334` setur `customer_reference` AÐEINS þegar kt er nákvæmlega
  //        10 stafir → borgandi viðskiptavinur án hennar mældist ALLS EKKI.
  //      · `:579` stofnar samninga með `items: [{ price }]` og ENGU `product_reference` → liðurinn
  //        datt út og D1-heimildin stóð ein eftir sem „fær gefins".
  //      `askell_id` er hins vegar ekki afleiddur reitur heldur SAMNINGSAUÐKENNIÐ SJÁLFT: `:212`
  //      sækir hann til að segja upp áskrift um `subscription-contracts/<id>/cancel/`, og
  //      samningalistinn ber sama gildi í `c.id`. Þegar hvorki kennitala né vara berst er hann EINA
  //      pörunin sem til er — og bannið valdi þá blindu fram yfir mælingu.
  //      Reglan sem eftir stendur, og sem prófin verja, er sú sem hún átti alltaf að vera:
  //      auðkennið má ekki YFIRTAKA kennitölu-pörun sem virkar (liður 2 stendur óhaggaður), og
  //      samningur má ALDREI fara báðar leiðirnar — þá teldist hann tvisvar.
  //    ⚠ Áfram er EKKI giskað á vöru eða kennitölu út frá samhengi. Liður 1 er ekki ágiskun: hann er
  //      auðkennið sem við sjálf skrifuðum í D1 þegar áskriftin var stofnuð.
  const samningsAudkenni = new Set();
  for (const c of sList) {
    const id = String(c.id == null ? '' : c.id);
    if (id) samningsAudkenni.add(id);
  }

  const misraemi = [], fripofanir = [], tvirukkun = [];
  let mrrAskell = 0, mrrD1 = 0;

  // ⚠⚠ mrrD1 telur PER RÖÐ, nákvæmlega eins og ../worker/stjornbord.mjs:59-60. `users.kt` hefur
  //    ÓEINKVÆMAN index og `parent_account_id` gerir marga notendur á einni kt að hannaðri stöðu —
  //    sé afritatvítekið per kt+vöru telja tvær heimildir sama firma sem ein og talan hættir að vera
  //    samanburðarhæf við stjórnborðið.
  // ⚠⚠ Heimildirnar eru lesnar Á UNDAN samningunum af því að ÞÆR ráða hvaða auðkenni teljast pöruð.
  //    Aðeins röð sem kemst alla leið í `hMap` má setja auðkenni í `parudAudkenni`: heimild sem
  //    fellur út hér (`!kt`) en stæði samt í listanum myndi draga samninginn í auðkennis-lykil sem
  //    enginn heimildarlykill svarar — og hann yrði „borgar_fyrir_ekkert" með TÓMA kennitölu.
  const hMap = new Map();
  const parudAudkenni = new Set();
  for (const h of hList) {
    const kt = ktHreint(h.kt);
    if (!kt || !h.vara) continue;
    const vara = String(h.vara);
    mrrD1 += fastVerd(h);
    const aid = String(h.askell_id == null ? '' : h.askell_id);
    const parad = !!aid && samningsAudkenni.has(aid);
    const lykill = parad ? ('aid:' + aid) : (kt + '|' + vara);
    if (parad) parudAudkenni.add(aid);
    let b = hMap.get(lykill);
    if (!b) {
      b = { kt, vara, verd: 0, ekkiGjof: 0 };
      hMap.set(lykill, b);
    } else if (parad && (kt + '|' + vara) < (b.kt + '|' + b.vara)) {
      // ⚠ Í auðkennis-lykli eru kt og vara EKKI leidd af lyklinum sjálfum (ólíkt kt+vöru-leiðinni),
      //   svo þau mega ekki ráðast af því hvaða röð kom fyrst. Lægsti `kt|vara` vinnur — sama gildi
      //   hvernig sem raðað er inn. Þetta eru BIRTINGARreitir; upphæðirnar leggjast saman hér fyrir
      //   neðan óháð þessu.
      b.kt = kt; b.vara = vara;
    }
    if (!erGjof(h)) { b.ekkiGjof += 1; b.verd += fastVerd(h); }
  }

  // ⚠⚠ Lykillinn SAFNAR — hann yfirskrifar ekki. `Map.set` lét þann samning sem kom síðast vinna,
  //    svo sömu gögn í öfugri röð gáfu ólíka `mrrAskell`: helmingur upphæðar hvarf þegar samningur
  //    bar tvö stök á sömu vöru, tvírukkun varð ósýnileg, og hvort verk taldist fríprófun eða tekjur
  //    réðst af innlestrarröðinni.
  // ⚠⚠ `oaudkennt` telur virk stök sem falla ÚT úr samanburðinum áður en verð er svo mikið sem leitað.
  //    Án hans hurfu þau í hljóði: teljarinn hækkaði hvergi, `mrrAskellOvisst` stóð í `false` og
  //    spjaldið sýndi örugga tölu yfir mælingu sem náði ekki utan um alla borgandi viðskiptavini.
  const verdUppsprettur = { lidur: 0, verdskra: 0, ekkert: 0, oaudkennt: 0 };
  const sMap = new Map();
  let ix = 0;
  for (const c of sList) {
    const id = String(c.id == null ? '' : c.id);
    // ⚠ EITT val fyrir allan samninginn, ekki per liði: annars gætu liðir sama samnings dreifst á
    //   báðar leiðirnar og hann teldist bæði um auðkenni og um kennitölu.
    const umAudkenni = !!id && parudAudkenni.has(id);
    const kt = ktHreint(c.customer_reference);
    const fri = erFriprofun(c.state);
    // Auðkenni samnings telur tvírukkun. Vanti það er hver samningur samt sitt stak (röð breytir
    // ekki FJÖLDANUM, bara nafninu á honum).
    const cid = id ? ('id:' + id) : ('ix:' + ix);
    ix += 1;
    for (const it of (Array.isArray(c.items) ? c.items : [])) {
      const vara = String((it && it.product_reference) || '');
      let lykill, bKt, bVara;
      if (umAudkenni) {
        // Heimildin sem ber auðkennið er ÖRUGGLEGA komin í `hMap` — `parudAudkenni` er fyllt þar og
        // hvergi annars staðar. Hún ber því kennitöluna og vöruna sem samninginn vantar.
        lykill = 'aid:' + id;
        const hb = hMap.get(lykill);
        bKt = hb.kt; bVara = hb.vara;
      } else {
        // ⚠ Talið PER STAKI, ekki per samningi: samningur án kt fellir ALLA liði sína, og teldist
        //   hann sem eitt yrði hlutfallið sem segir hversu mikið vantar ómarktækt.
        if (!kt || !vara) { verdUppsprettur.oaudkennt += 1; continue; }
        lykill = kt + '|' + vara; bKt = kt; bVara = vara;
      }
      // ⚠ Verðið er áfram flett upp á VÖRU LIÐARINS, ekki vöru heimildarinnar. Auðkennið segir okkur
      //   hver þetta er, ekki hvað hann borgar — beri liðurinn enga vöru fellur hann í `ekkert` og
      //   `mrrAskellOvisst` verður satt. Það er rétt svar: pörunin stendur, upphæðin er ófundin.
      const { verd, uppspretta } = lidVerd(it, verdskra, vara);
      verdUppsprettur[uppspretta] += 1;
      const upphaed = verd * lidMagn(it);
      let b = sMap.get(lykill);
      if (!b) { b = { kt: bKt, vara: bVara, verdVirkt: 0, verdFri: 0, fri: true, greidandi: new Set() }; sMap.set(lykill, b); }
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

  for (const [lykill, b] of sMap) {
    if (b.fri) { fripofanir.push({ kt: b.kt, vara: b.vara, verd: b.verdFri }); continue; }
    mrrAskell += b.verdVirkt;
    if (b.greidandi.size > 1) tvirukkun.push({ kt: b.kt, vara: b.vara, fjoldi: b.greidandi.size, verd: b.verdVirkt });
    // ⚠ `sidan: nu` — merkingin er „þetta sáum við núna", sem er satt. Efra lagið raðar eftir `verd`,
    //   lækkandi (dýrasta efst) — ekki eftir `sidan`, sem er fasti.
    if (!hMap.has(lykill)) {
      misraemi.push({ tegund: 'borgar_fyrir_ekkert', kt: b.kt, vara: b.vara, verd: b.verdVirkt, sidan: nu });
    }
  }
  for (const [lykill, b] of hMap) {
    if (sMap.has(lykill) || !b.ekkiGjof) continue;
    // ⚠ Áður stóð hér `sidan: h.until` — FRAMTÍÐARdagsetning sem efra lagið birti sem „síðan".
    //   Efra lagið raðar eftir `verd`, lækkandi (dýrasta efst), ekki upploginni dagsetningu.
    misraemi.push({ tegund: 'gefins', kt: b.kt, vara: b.vara, verd: b.verd, sidan: nu });
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
  // ⚠⚠ `oaudkennt` fellir töluna EINS OG `ekkert` — og vegur raunar þyngra: stak sem fannst ekkert verð
  //    á var þó BORIÐ SAMAN, en stak sem var ekki auðkennanlegt komst aldrei í samanburðinn. Það gerir
  //    ekki bara `mrrAskell` ó-tæmandi heldur getur skilið D1-heimild eftir eina sem falskt „gefins".
  return { misraemi, fripofanir, tvirukkun, mrrAskell, mrrD1, verdrek, verdUppsprettur, mrrAskellOvisst: verdUppsprettur.ekkert > 0 || verdUppsprettur.oaudkennt > 0 };
}
