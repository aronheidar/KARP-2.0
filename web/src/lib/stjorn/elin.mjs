// elin.mjs — HREIN eining: svar /api/admin/fjarmal → hólfin fimm á spjaldi Elínar (fjármálastjóri).
// Engin fetch, ekkert env, ekkert Date.now() — allt kemur með svarinu og með `now` frá kallanda.
//
// ⚠ Villan er HREIÐRUÐ: `svar.fjarmal.error` / `svar.fjarmal.villa`, ekki á toppstigi. bjarkiGogn las
//   rangt dýpi og „óstillt" hefði aldrei birst, með sjö græn próf, af því prófgögnin voru flöt.
import { bidurFyrir } from './bidur_thin.mjs';

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
  const stada = fjarmalVantar ? 'fjármálin náðust ekki (' + (s.error || 'villa') + ')'
    : ostillt ? 'Áskell er óstilltur — engan lykil að finna'
    : f.villa ? (VILLUTEXTI[f.villa] || ('óþekkt villa: ' + f.villa))
      : misraemi.length ? misraemi.length + ' misræmi milli Áskels og réttinda'
        : 'Áskell og réttindin stemma';

  // ⚠ Raðað eftir PENINGUM, ekki tíma. `sidan` er fasti (`nu`) á hverju staki eftir Verk 1, svo röðun
  //   eftir honum væri núll-aðgerð og „fimm efstu" yrðu fimm handahófskennd í stað fimm dýrustu.
  const vinnsla = misraemi.slice().sort((a, b) => (Number(b.verd) || 0) - (Number(a.verd) || 0)).slice(0, 5).map((m) => ({
    texti: ktGrima(m.kt) + ' · ' + (m.vara || '') + ' · ' + (TEXTI[m.tegund] || m.tegund) + ' · ' + kr(m.verd) + ' kr/mán',
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
      //   EKKERT misræmi/engin fríprófun fannst OG þegar `fjarmal`-reiturinn vantar alveg (þá er `f`
      //   `{}` og bæði fylkin sjálfgefið tóm að ofan) — tvö ólík ástönd sem litu nákvæmlega eins út án
      //   `fjarmalVantar`-gátarinnar hér. Mælt núll (fjarmal til staðar, ekkert talið) á ÁFRAM að sýna
      //   '0' — sjá prófið „engin misræmi og engin í fríprófun ÞEGAR MÆLT" því til staðfestingar.
      { n: fjarmalVantar ? 'óvíst' : String(misraemi.length), l: 'misræmi', s: misraemi.length ? borga + ' borgar fyrir ekkert · ' + gefins + ' fær gefins' : '' },
      { n: fjarmalVantar ? 'óvíst' : String(frip.length), l: 'í fríprófun', s: frip.length ? 'verða ' + kr(fripVirdi) + ' kr/mán haldi þeir áfram' : '' },
      // ⚠ `verdrek: []` er ÞÖGULT: sama fylki fer út hvort ekkert verðrek fannst EÐA verðskráin
      //   náðist aldrei. `villa` DUGAR EKKI til að greina þar á milli: endapunkturinn skilar AÐEINS
      //   EINUM villukóða og `d1_hluti` þaggar `verdskra_hluti` þegar bæði brotna samtímis (sjá
      //   athugasemdina við `villa =` í worker/fjarmal.mjs) — svo að lesa `villa` hér væri ágiskun,
      //   ekki mæling. Worker-inn veit þetta ÓHÁÐ villukóðanum og segir það beint í `verdrekMaelt`;
      //   vanti reiturinn (eldra svarsnið) er sjálfgefið varkárt — 'óvíst', ekki tala.
      { n: f.verdrekMaelt ? String((Array.isArray(f.verdrek) ? f.verdrek : []).length) : 'óvíst', l: 'verðrek', s: '' },
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
