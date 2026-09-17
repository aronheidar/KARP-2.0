// elin.mjs — HREIN eining: svar /api/admin/fjarmal → hólfin fimm á spjaldi Elínar (fjármálastjóri).
// Engin fetch, ekkert env, ekkert Date.now() — allt kemur með svarinu og með `now` frá kallanda.
//
// ⚠ Villan er HREIÐRUÐ: `svar.fjarmal.error` / `svar.fjarmal.villa`, ekki á toppstigi. bjarkiGogn las
//   rangt dýpi og „óstillt" hefði aldrei birst, með sjö græn próf, af því prófgögnin voru flöt.
import { MANUDUR_SEK, VIKA_SEK, bidurFyrir, rennurUtInnan } from './bidur_thin.mjs';

const kr = (n) => Math.round(Number(n) || 0).toLocaleString('is-IS').replace(/,/g, '.');
/** ⚠ Full kennitala fer ALDREI í viðmótið — fyrri hlutinn dugar til að þekkja manneskjuna. */
const ktGrima = (kt) => String(kt || '').slice(0, 6) + '-••••';
const dagsTexti = (ts) => {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '. kl. ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
};
const TEXTI = { borgar_fyrir_ekkert: 'borgar fyrir ekkert', gefins: 'fær gefins' };

export function elinGogn(svar, bidurListi, now) {
  const s = (svar && typeof svar === 'object') ? svar : {};
  // ⚠⚠ `fjarmalVantar` er sjálfstæð athugun á `s.fjarmal` SJÁLFU, reiknuð Á UNDAN `f`-sjálfgildinu —
  //   ekki af neinu innan `f`. Falli toppstigs-girðingin í worker/fjarmal.mjs (admin/method/origin/
  //   adgerd/lota/rofi/verk/dispatch) vantar `fjarmal`-reitinn ALVEG og `f` verður `{}` hér að neðan;
  //   þá er `f.ok !== false` hverfandi SATT (því `f.ok` er `undefined`), svo án þessarar sjálfstæðu
  //   athugunar sýndist "ekkert svar barst" nákvæmlega eins og "mælt núll" — sama gildran og allt
  //   þetta verk snýst um, bara einu lagi ofar. Mælt núll (`f.ok === true`, `mrrAskell` raunverulega
  //   0, t.d. enginn borgandi viðskiptavinur) á ÁFRAM að sýna '0' — það próf stendur við hlið þessa.
  const fjarmalVantar = !(s.fjarmal && typeof s.fjarmal === 'object');
  const f = fjarmalVantar ? {} : s.fjarmal;
  const ostillt = f.error === 'unconfigured';
  // ⚠ `mrrAskellOvisst` fellir töluna líka: fannst engin upphæð á einhverju virku staki er hún ekki
  //   tæmandi, og hálf tala lítur eins út og heil. Betra er óvíst en tala sem enginn getur rakið.
  const naest = !fjarmalVantar && !ostillt && !f.villa && f.ok !== false && !f.mrrAskellOvisst;
  const misraemi = Array.isArray(f.misraemi) ? f.misraemi : [];
  const frip = Array.isArray(f.fripofanir) ? f.fripofanir : [];

  const borga = misraemi.filter((m) => m && m.tegund === 'borgar_fyrir_ekkert').length;
  const gefins = misraemi.filter((m) => m && m.tegund === 'gefins').length;
  const mismunur = (Number(f.mrrD1) || 0) - (Number(f.mrrAskell) || 0);
  const fripVirdi = frip.reduce((a, x) => a + (Number(x && x.verd) || 0), 0);

  // ⚠⚠ Heildaryfirferð, atriði 1: `tvirukkun` var reiknuð í ../fjarmal.mjs, geymd og borin út alla
  //    leið — og LESIN HVERGI. Mælt gaf viðskiptavinur sem er rukkaður TVISVAR fyrir sömu vöru
  //    „Áskell og réttindin stemma", núll misræmi og uppblásna MRR-tölu sem rétta.
  //    ⚠ Tvírukkun er ANNARS EÐLIS en misræmi: misræmi er „við og Áskell erum ósammála", tvírukkun er
  //      „við erum að rukka of mikið" — peningar sem viðskiptavinurinn á inni hjá okkur. Hún fær því
  //      eigin setningu í `stada` en sameinast aldrei misræmis-talningunni.
  //    ⚠ ENGIN `naest`-gátun hér: báðir neytendur listans bera hana sjálfir (`stada`-leggurinn krefst
  //      `naest` og `vinnslaStok` gátar beint). Þriðja girðingin sem ekkert próf gæti greint frá hinum
  //      tveimur væri dautt hold — stökkbreytingapróf staðfesti að hún lifði af að vera fjarlægð.
  const tvirukkun = Array.isArray(f.tvirukkun) ? f.tvirukkun.filter(Boolean) : [];
  const tvirukkunTexti = !tvirukkun.length ? ''
    : (tvirukkun.length === 1 ? '1 tvírukkun' : tvirukkun.length + ' tvírukkanir') + ' — við rukkum of mikið';

  // ⚠⚠ Heildaryfirferð, atriði 3: samþykkta hönnunin á FJÓRUM flísum og sú fjórða er „endurnýjast".
  //    Áætlunin setti „verðrek" í hennar stað og þá sást áskrift sem rennur út eftir 20 daga HVERGI —
  //    hvorki hér né á forstofunni, því `bidur_thin` þrengir vísvitandi í sjö daga. Worker-inn skilar
  //    `rennurUt` með 30 daga glugga einmitt til að þessi flís geti svarað „hvað endurnýjast í þessum
  //    mánuði", sem var ein af fjórum ástæðum þess að spjaldið var byggt.
  //    ⚠ Mörkin eru mæld hér UPP Á NÝTT (ekki treyst á glugga worker-sins): geymda myndin er allt að
  //      15 mín gömul (_FJ_FYRNING) og getur í stöðnuðu tilviki verið mun eldri, svo `until` úr henni
  //      má vera liðið. `rennurUtInnan` er FLUTT INN frá bidur_thin.mjs — ekki afrituð — svo talan hér
  //      og fjöldi „bíður þín"-raðanna geti aldrei rekið í sundur á sama skjá.
  //    ⚠ ENGIN `naest`-gátun hér — flísin sjálf ber hana, og tvöföld girðing sem ekkert próf getur
  //      greint á milli er dautt hold sem rotnar. Sjá `l: 'endurnýjast'` að neðan.
  const rennurUt = Array.isArray(f.rennurUt) ? f.rennurUt : [];
  const endurManudur = rennurUt.filter((r) => rennurUtInnan(r, now, MANUDUR_SEK)).length;
  const endurVika = rennurUt.filter((r) => rennurUtInnan(r, now, VIKA_SEK)).length;

  // ⚠⚠ Verðrekið átti flísina sem „endurnýjast" á, og flytur nú í `stada`. Vörnin sem það bar VERÐUR
  //    að lifa flutninginn af: `verdrek: []` er ÞÖGULT — sama fylki fer út hvort ekkert verðrek fannst
  //    EÐA verðskráin náðist aldrei. `villa` DUGAR EKKI til að greina þar á milli (endapunkturinn
  //    skilar AÐEINS EINUM kóða og `d1_hluti` þaggar `verdskra_hluti` þegar bæði brotna samtímis, sjá
  //    athugasemdina við `villa =` í worker/fjarmal.mjs), svo `verdrekMaelt` er sjálfstæður reitur frá
  //    worker-num og ræður hér ÓHÁÐ villukóðanum. Vanti hann (eldra svarsnið) er sjálfgefið varkárt.
  //    ⚠ Mælt verðrek sem er ENGIN þegir: staðan fyllist ekki af núllum.
  const verdrekListi = Array.isArray(f.verdrek) ? f.verdrek : [];
  const verdrekTexti = !f.verdrekMaelt ? 'verðrek ómælt'
    : verdrekListi.length ? verdrekListi.length + ' verðrek' : '';

  // ⚠ ALLIR villukóðar sem Verk 2 getur skilað verða að eiga texta hér. Óþekktur kóði birtist
  //   annars sem tómt eða sem hrár strengur, og þá segir spjaldið ekkert þótt eitthvað sé að.
  const VILLUTEXTI = {
    askell: 'náði ekki í Áskel — talan er óviss',
    d1_hluti: 'náði í Áskel en ekki alla heimildalista',
    verdskra_hluti: 'náði í samningana en ekki verðskrána — verðrek var aldrei mælt',
    rofi: 'slökkt á Elínu — þetta er síðasta myndin, ekki ný',
  };
  // ⚠⚠ `fjarmalVantar` verður að vera FYRSTA greinin hér, á undan `ostillt`/`villa`/misræmis-talningunni:
  //   falli toppstigs-girðingin (`admin`/`method`/`origin`/`adgerd`/`lota`/`rofi`/`verk`/`dispatch` í
  //   worker/fjarmal.mjs) er `f` `{}` og allar hinar greinarnar verða þá hverfandi ósannar — án þessarar
  //   greinar félli `stada` beint niður í „Áskell og réttindin stemma", ekkert barst en fyrirsögnin segði
  //   allt í lagi. Sami lærdómur og `svarOgilt` í hrafn.mjs dró af (comment þar: grænt-þegar-ekkert-barst
  //   lét tvær fallnar keyrslur liggja óséðar) og sem `ekkertSvar` í bjarki.mjs ver nú þegar — `elin.mjs`
  //   var eina spjaldið án þessarar greinar. MRR-flísin (`naest`) var löguð á undan, en `stada` sjálf
  //   gleymdist, og skildi spjaldið eftir VERRA en áður: lesandi les „stemma" og afgreiðir stakt `óvíst`
  //   sem smáatriði.
  // ⚠ Verðreks-setningin hnýtist aftan við hvern legg sem á annað borð barst — LÍKA villuleggina, því
  //   þar er hún oft eina vísbendingin um að verðskráin hafi brugðist (texti `d1_hluti` nefnir hana
  //   hvergi). Tveir leggir standa vísvitandi utan við: `fjarmalVantar` og `ostillt`. Þar var EKKERT
  //   kall gert og staðan segir það í heilu lagi; „verðrek ómælt" þar aftan við er hávaði, ekki
  //   upplýsing. Það er ÞESSI listi sem ræður — ekki gátun inni í `verdrekTexti`, sem ekkert próf
  //   gæti greint frá honum.
  const medVerdreki = (t) => (verdrekTexti ? t + ' · ' + verdrekTexti : t);
  const stada = fjarmalVantar ? 'fjármálin náðust ekki (' + (s.error || 'villa') + ')'
    : ostillt ? 'Áskell er óstilltur — engan lykil að finna'
    : f.villa ? medVerdreki(VILLUTEXTI[f.villa] || ('óþekkt villa: ' + f.villa))
      // ⚠⚠ Sama gildra og `fjarmalVantar` lokaði einu lagi ofar, nú fyrir stök sem mældust ekki: fyndust
      //   engin misræmi AF ÞVÍ að virkur samningur komst aldrei í samanburðinn (óauðkennt stak, eða
      //   ekkert verð) sagði fyrirsögnin „Áskell og réttindin stemma". Grænt ljós á mælingu sem fór
      //   aldrei fram er verra en engin fyrirsögn — lesandinn afgreiðir þá stakt `óvíst` sem smáatriði.
      : !naest ? medVerdreki('samanburðurinn náði ekki utan um allt — tölurnar eru óvissar')
        // ⚠⚠ „stemma" má AÐEINS standa þegar hvorugt fannst. Tvírukkun ein og sér undir fyrirsögninni
        //    „Áskell og réttindin stemma" er grænt ljós á peningum sem við skuldum — Áskell og
        //    réttindin geta stemmt fullkomlega á meðan við rukkum sama manninn tvisvar.
        : (misraemi.length || tvirukkun.length)
          ? medVerdreki([misraemi.length ? misraemi.length + ' misræmi milli Áskels og réttinda' : '', tvirukkunTexti].filter(Boolean).join(' · '))
          : medVerdreki('Áskell og réttindin stemma');

  // ⚠ Raðað eftir PENINGUM, ekki tíma. `sidan` er fasti (`nu`) á hverju staki eftir Verk 1, svo röðun
  //   eftir honum væri núll-aðgerð og „fimm efstu" yrðu fimm handahófskennd í stað fimm dýrustu.
  // ⚠⚠ Heildaryfirferð: listinn er TÓMUR þegar ekkert var mælt (`naest`). Nafngreint misræmi með
  //   upphæð er sterkari fullyrðing en talan sjálf — það bendir á tiltekna manneskju og segir hvað hún
  //   skuldi. Hafi flísin fallið í `óvíst` má listinn undir henni ekki standa eftir og segja hið gagnstæða.
  // ⚠⚠ Tvírukkanirnar liggja í SAMA lista: talan í `stada` segir hve margar, en það er nafngreind
  //    lína með upphæð sem gerir hana að einhverju sem hægt er að vinna með. Þær eru sömu tegundar
  //    fullyrðing og misræmin — um tiltekna manneskju og tiltekna krónutölu — svo þær hlíta sömu
  //    `naest`-reglu og raðast með þeim eftir peningum.
  const vinnslaStok = naest
    ? misraemi.concat(tvirukkun.map((x) => ({ tegund: 'tvirukkun', kt: x.kt, vara: x.vara, verd: x.verd, fjoldi: Math.max(2, Number(x.fjoldi) || 2) })))
    : [];
  const vinnsla = vinnslaStok.slice().sort((a, b) => (Number(b.verd) || 0) - (Number(a.verd) || 0)).slice(0, 5).map((m) => ({
    texti: ktGrima(m.kt) + ' · ' + (m.vara || '') + ' · '
      + (m.tegund === 'tvirukkun' ? 'rukkað ' + m.fjoldi + ' sinnum' : (TEXTI[m.tegund] || m.tegund))
      + ' · ' + kr(m.verd) + ' kr/mán',
    hvenaer: dagsTexti(m.sidan),
  }));

  return {
    stada,
    sidast: dagsTexti(f.sott),
    bidur: bidurFyrir(bidurListi, 'elin'),
    vinnsla,
    tolur: [
      { n: naest ? kr(f.mrrAskell) : 'óvíst', l: 'kr/mán rukkað', s: (naest && mismunur) ? kr(Math.abs(mismunur)) + ' kr munur á réttindum' : '' },
      // ⚠ Sama gildra og MRR-flísin fyrir ofan: `misraemi.length`/`frip.length` eru `0` bæði þegar
      //   EKKERT misræmi/engin fríprófun fannst OG þegar ekkert var mælt — tvö ólík ástönd sem litu
      //   nákvæmlega eins út. Mælt núll (fjarmal til staðar, ekkert talið) á ÁFRAM að sýna '0' — sjá
      //   prófið „engin misræmi og engin í fríprófun ÞEGAR MÆLT" því til staðfestingar.
      // ⚠⚠ Heildaryfirferð: `fjarmalVantar` EINN dugði ekki. Hann nær aðeins yfir það þegar
      //   `fjarmal`-reiturinn vantar ALVEG; óstillt Áskell, `villa:'askell'`, `villa:'rofi'`,
      //   `villa:'d1_hluti'`, `villa:'verdskra_hluti'` og óauðkennd virk stök sluppu allar í gegn.
      //   Mælt: óstilltur Áskell gaf `óvíst kr/mán | 0 misræmi | 0 í fríprófun | óvíst verðrek` — tvær
      //   flísar af fjórum sögðu örugga tölu yfir ástandi þar sem ENGIN mæling hafði farið fram.
      //   Flísarnar þrjár hlíta nú EINNI reglu (`naest`); verðrek hefur sína eigin (`verdrekMaelt`),
      //   sem er sjálfstæð af ástæðu — sjá athugasemdina við hana að neðan.
      { n: naest ? String(misraemi.length) : 'óvíst', l: 'misræmi', s: (naest && misraemi.length) ? borga + ' borgar fyrir ekkert · ' + gefins + ' fær gefins' : '' },
      { n: naest ? String(frip.length) : 'óvíst', l: 'í fríprófun', s: (naest && frip.length) ? 'verða ' + kr(fripVirdi) + ' kr/mán haldi þeir áfram' : '' },
      // ⚠ Fjórða flísin úr samþykktu hönnuninni. Hún hlítir SÖMU einu reglunni og hinar þrjár
      //   (`naest`) — flís sem giskaði á eigin áreiðanleika væri önnur gerð af sömu gildru. Verðrekið,
      //   sem sat hér um tíma, á sér sjálfstæðan reit frá worker-num og býr því í `stada`-línunni.
      // ⚠ Undirlínan þegir þegar enginn er innan viku — „0 innan viku" er hávaði, ekki upplýsing.
      { n: naest ? String(endurManudur) : 'óvíst', l: 'endurnýjast', s: (naest && endurVika) ? endurVika + ' innan viku' : '' },
    ],
    heimildir: [
      'les Áskel og réttindin í D1 og ber saman',
      'sækir ferskt þegar þú biður um það',
      'réttir Hrafni misræmi sem krefst kóðabreytingar — bíður þín',
      'hreyfir aldrei peninga',
    ],
    rofi: { lykill: 'rofi_elin', off: !!s.rofi },
  };
}
