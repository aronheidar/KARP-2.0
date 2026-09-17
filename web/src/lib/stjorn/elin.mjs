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
  const f = (s.fjarmal && typeof s.fjarmal === 'object') ? s.fjarmal : {};
  const ostillt = f.error === 'unconfigured';
  // ⚠ `mrrAskellOvisst` fellir töluna líka: fannst engin upphæð á einhverju virku staki er hún ekki
  //   tæmandi, og hálf tala lítur eins út og heil. Betra er óvíst en tala sem enginn getur rakið.
  const naest = !ostillt && !f.villa && f.ok !== false && !f.mrrAskellOvisst;
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
  const stada = ostillt ? 'Áskell er óstilltur — engan lykil að finna'
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
      { n: String(misraemi.length), l: 'misræmi', s: misraemi.length ? borga + ' borgar fyrir ekkert · ' + gefins + ' fær gefins' : '' },
      { n: String(frip.length), l: 'í fríprófun', s: frip.length ? 'verða ' + kr(fripVirdi) + ' kr/mán haldi þeir áfram' : '' },
      // ⚠ `verdrek: []` er ÞÖGULT: sama fylki fer út hvort ekkert verðrek fannst EÐA verðskráin
      //   náðist aldrei (villa: 'verdskra_hluti') — sjá athugasemdina við `villa =` í
      //   worker/fjarmal.mjs. Tómt-en-ómælt lítur út eins og tómt-af-því-ekkert-rak. `d1_hluti`
      //   snertir heimildalistana, ekki verðskrána, svo hann breytir þessari flís ekki.
      { n: f.villa === 'verdskra_hluti' ? 'óvíst' : String((Array.isArray(f.verdrek) ? f.verdrek : []).length), l: 'verðrek', s: '' },
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
