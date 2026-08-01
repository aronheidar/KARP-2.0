// „SVONA FÓR ÞAÐ Í ALVÖRU" — raun-hagsaga Íslands 2000–2032 per kjörtímabil. HREINT gagna-módúl
// (leik-lag): engin env/D1/net, snertir EKKI vélina. Notað eftir uppgjör lotu til að sýna liðum hvernig
// raunverulegar ríkisstjórnir höndluðu sama tímabil, borið saman við þeirra eigin ákvarðanir.
//
// VÖRPUN REALITY→LOTA: REALITY[kpi] er 33-staka fylki þar sem vísitala i svarar til ársins YEAR_START + i
// (2000..2032). Lota r spannar árin YEAR_START+(r-1)*4 .. YEAR_START+r*4; LOK lotu r = árið YEAR_START + r*4
// → REALITY-vísitala r*4. Dæmi: lok lotu 1 = 2004 → REALITY.verdbolga[4]; lok lotu 8 = 2032 → [32].
// kaupmattur er EKKI í REALITY → alltaf null (skil-formið heldur samt lyklinum svo client þurfi ekki sérreglu).
//
// SAGNFRÆÐI: frásagnir og raunAkvardanir eru skjalfest raun-saga (einkavæðing 2002–03, Kárahnjúkar,
// hrunið 2008 + neyðarlög + AGS, Icesave-þjóðaratkvæðin 2010/2011 þar sem þjóðin HAFNAÐI, höft 2008–2017,
// ESB-umsókn 2009 → dregin til baka 2015 …). raunAkvardanir innihalda AÐEINS ákvarðanir sem varpa má beint
// á stefnu-rofa leiksins (policies.mjs); verðtrygging var ALDREI afnumin í raun → skjalfest með val:null.

import { REALITY, ROUNDS, QUARTERS_PER_ROUND, YEAR_START } from './game-config.mjs';
import { POLICIES } from './policies.mjs';

const ARA_PER_LOTU = QUARTERS_PER_ROUND; // hvert skref = 1 ár → 4 ár per kjörtímabil (sjá game-config)
const policyById = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

// Efni lotanna 1..8 (timabil reiknað neðst svo það sé ALLTAF í takt við YEAR_START/ARA_PER_LOTU).
const LOTUR = [
  // ── Lota 1: 2000–2004 ─────────────────────────────────────────────────────
  {
    rikisstjornir: ['Sjálfstæðisflokkur + Framsóknarflokkur (Davíð Oddsson)'],
    frasogn:
      'Nýtt árþúsund hófst á því að alþjóðlega netbólan sprakk; hagvöxtur á Íslandi staðnæmdist um stund árið 2002 en verðbólgan hjaðnaði úr tæpum 7% árið 2001 í rúm 2% árið 2003. Ríkisstjórn Sjálfstæðisflokks og Framsóknarflokks lauk einkavæðingu bankanna: Landsbankinn var seldur Samson-hópnum og Búnaðarbankinn S-hópnum veturinn 2002–2003. Alþingi samþykkti Kárahnjúkavirkjun árið 2002 og framkvæmdir við stærstu virkjun landsins og álver Alcoa á Reyðarfirði hófust 2003 — umdeildasta stóriðjuframkvæmd Íslandssögunnar. Undir lok kjörtímabilsins var hagkerfið komið á fulla ferð á ný og innspýting stóriðjuframkvæmdanna tekin að ýta undir þenslu.',
    raunAkvardanir: [
      { id: 'bankar', val: 'einka', ar: 2003, texti: 'Einkavæðingu bankanna lokið: Landsbankinn seldur Samson-hópnum (2002) og Búnaðarbankinn S-hópnum (2003).' },
      { id: 'stjoridja', val: 'reisa', ar: 2003, texti: 'Kárahnjúkavirkjun samþykkt á Alþingi 2002; framkvæmdir við virkjunina og álver Alcoa á Reyðarfirði hófust 2003.' },
    ],
  },
  // ── Lota 2: 2004–2008 ─────────────────────────────────────────────────────
  {
    rikisstjornir: [
      'Sjálfstæðisflokkur + Framsóknarflokkur (Davíð Oddsson → Halldór Ásgrímsson → Geir H. Haarde)',
      'Sjálfstæðisflokkur + Samfylking (Geir H. Haarde, frá 2007)',
    ],
    frasogn:
      'Útrásarárin: íslensku bankarnir þöndust út erlendis og efnahagsreikningur bankakerfisins óx í um það bil tífalda landsframleiðslu haustið 2008. Bankarnir og Íbúðalánasjóður hófu að bjóða 90–100% íbúðalán haustið 2004, húsnæðisverð rauk upp og viðskiptahallinn varð sá mesti í sögu lýðveldisins. Kárahnjúkavirkjun var gangsett og álver Fjarðaáls hóf framleiðslu 2007, árið sem hagvöxtur mældist um 9,5%. Seðlabankinn hækkaði stýrivexti í rúm 15% til að hemja þensluna, krónan var sterk og erlent lánsfé flæddi inn — en kerfisáhættan hlóðst upp án þess að eftirlit og regluverk héldu í við vöxtinn.',
    raunAkvardanir: [
      { id: 'fjarmalaregluverk', val: 'losa', ar: 2004, texti: 'Bönkunum leyft að þenjast út erlendis; eftirlit og regluverk héldu ekki í við vöxtinn (niðurstaða rannsóknarnefndar Alþingis 2010). Útrásin ~2004–2008.' },
    ],
  },
  // ── Lota 3: 2008–2012 ─────────────────────────────────────────────────────
  {
    rikisstjornir: [
      'Sjálfstæðisflokkur + Samfylking (Geir H. Haarde, féll í janúar 2009)',
      'Samfylking + Vinstri græn (Jóhanna Sigurðardóttir, frá febrúar 2009)',
    ],
    frasogn:
      'Í október 2008 féllu Glitnir, Landsbankinn og Kaupþing á einni viku; Alþingi setti neyðarlögin 6. október, ríkið tók bankana yfir og Geir H. Haarde bað Guð að blessa Ísland. Krónan hrundi, verðbólgan fór yfir 18% í ársbyrjun 2009, gjaldeyrishöft voru sett í nóvember 2008 og samið var um efnahagsáætlun með Alþjóðagjaldeyrissjóðnum. Búsáhaldabyltingin felldi ríkisstjórnina í janúar 2009 og vinstristjórn Jóhönnu Sigurðardóttur sótti um aðild að ESB í júlí 2009. Þjóðin HAFNAÐI Icesave-samningunum í tveimur þjóðaratkvæðagreiðslum — í mars 2010 (yfir 90% sögðu nei) og apríl 2011 (um 60% nei) — eftir að forsetinn synjaði lögunum staðfestingar. Undir lok tímabilsins var hagvöxtur tekinn við sér á ný, en atvinnuleysi, skuldir ríkissjóðs og stökkbreytt verðtryggð lán heimilanna settu áfram mark sitt á samfélagið.',
    raunAkvardanir: [
      { id: 'hoft', val: true, ar: 2008, texti: 'Gjaldeyrishöft sett í nóvember 2008 til að stöðva fjármagnsflótta og verja krónuna eftir hrunið.' },
      { id: 'esb', val: true, ar: 2009, texti: 'Alþingi samþykkti að sækja um aðild að ESB í júlí 2009; aðildarviðræður hófust 2010.' },
      { id: 'icesave', val: 'reject', ar: 2011, texti: 'Þjóðin hafnaði Icesave-samningunum í tveimur þjóðaratkvæðagreiðslum: mars 2010 (yfir 90% nei) og apríl 2011 (um 60% nei). EFTA-dómstóllinn sýknaði Ísland svo að fullu í janúar 2013.' },
      { id: 'verdtrygging', val: null, ar: null, texti: 'Verðtryggingin var ALDREI afnumin í raun — þrátt fyrir stökkbreytt lán 2008 og ítrekaða umræðu situr hún enn. Ekkert raun-val til samanburðar.' },
    ],
  },
  // ── Lota 4: 2012–2016 ─────────────────────────────────────────────────────
  {
    rikisstjornir: [
      'Samfylking + Vinstri græn (Jóhanna Sigurðardóttir, til 2013)',
      'Framsóknarflokkur + Sjálfstæðisflokkur (Sigmundur Davíð Gunnlaugsson; Sigurður Ingi Jóhannsson frá apríl 2016)',
    ],
    frasogn:
      'EFTA-dómstóllinn sýknaði Ísland að fullu í Icesave-málinu í janúar 2013 — höfnun þjóðarinnar bakaði ríkinu enga greiðsluskyldu. Ríkisstjórn Framsóknar- og Sjálfstæðisflokks tók við 2013, hlé var gert á ESB-viðræðunum sama ár og ríkisstjórnin lýsti því svo yfir með bréfi árið 2015 að Ísland teldist ekki lengur umsóknarríki; „Leiðréttingin" færði verðtryggðum húsnæðislántakendum um 80 milljarða króna árið 2014. Ferðamannasprengjan umbreytti hagkerfinu: erlendum ferðamönnum fjölgaði úr um hálfri milljón árið 2010 í um 1,8 milljónir árið 2016. Nauðasamningar við slitabú föllnu bankanna og stöðugleikaframlög 2015 ruddu brautina fyrir losun haftanna og skuldir ríkissjóðs tóku að lækka hratt — en Panama-skjölin felldu forsætisráðherrann vorið 2016.',
    raunAkvardanir: [
      { id: 'esb', val: false, ar: 2015, texti: 'Hlé gert á aðildarviðræðum 2013; með bréfi til ESB árið 2015 lýsti ríkisstjórnin því yfir að Ísland teldist ekki lengur umsóknarríki.' },
    ],
  },
  // ── Lota 5: 2016–2020 ─────────────────────────────────────────────────────
  {
    rikisstjornir: [
      'Framsóknarflokkur + Sjálfstæðisflokkur (Sigurður Ingi Jóhannsson, til janúar 2017)',
      'Sjálfstæðisflokkur + Viðreisn + Björt framtíð (Bjarni Benediktsson, 2017)',
      'Vinstri græn + Sjálfstæðisflokkur + Framsóknarflokkur (Katrín Jakobsdóttir, frá nóvember 2017)',
    ],
    frasogn:
      'Ferðaþjónustan varð stærsta útflutningsgrein landsins og fjöldi erlendra ferðamanna náði hámarki í um 2,3 milljónum árið 2018. Fjármagnshöftin frá 2008 voru að mestu afnumin í mars 2017 og skuldir ríkissjóðs héldu áfram að lækka. Pólitíkin var óróleg — tvennar kosningar 2016 og 2017 og þrjár ríkisstjórnir á rúmu ári — þar til stjórn Katrínar Jakobsdóttur tók við í nóvember 2017. Fall WOW air í mars 2019 batt enda á samfellt vaxtarskeið ferðaþjónustunnar og hagkerfið kólnaði, en Lífskjarasamningarnir 2019 sömdu um hóflegar launahækkanir gegn vaxtalækkunum og verðbólga hélst nálægt markmiði út tímabilið.',
    raunAkvardanir: [
      { id: 'hoft', val: false, ar: 2017, texti: 'Fjármagnshöftin sem sett voru í nóvember 2008 voru að mestu afnumin í mars 2017, eftir losun í skrefum frá 2015.' },
    ],
  },
  // ── Lota 6: 2020–2024 ─────────────────────────────────────────────────────
  {
    rikisstjornir: [
      'Vinstri græn + Sjálfstæðisflokkur + Framsóknarflokkur (Katrín Jakobsdóttir, til apríl 2024)',
      'Sjálfstæðisflokkur + Framsóknarflokkur + Vinstri græn (Bjarni Benediktsson, 2024)',
    ],
    frasogn:
      'COVID-19 skall á í mars 2020: landamæri lokuðust, ferðaþjónustan þurrkaðist nánast út og landsframleiðslan dróst saman um tæp 7%. Ríkið svaraði með hlutabótaleið og stuðningspökkum og Seðlabankinn lækkaði stýrivexti í 0,75% — þá lægstu í sögunni. Viðsnúningurinn varð hraður, hagvöxtur mældist um 9% árið 2022, en með honum kom verðbólguskot sem náði rúmum 10% í ársbyrjun 2023, drifið af húsnæðisverði, innfluttri verðbólgu og stríðinu í Úkraínu. Seðlabankinn hækkaði stýrivexti fjórtán sinnum í röð, upp í 9,25% í ágúst 2023, og eldsumbrot á Reykjanesskaga kostuðu rýmingu Grindavíkur í nóvember 2023. Undir lok tímabilsins voru gerðir hófstilltir langtímakjarasamningar (2024) til að hjálpa til við að ná verðbólgunni niður.',
    raunAkvardanir: [],
  },
  // ── Lota 7: 2024–2028 ─────────────────────────────────────────────────────
  {
    rikisstjornir: ['Samfylking + Viðreisn + Flokkur fólksins (Kristrún Frostadóttir, frá desember 2024)'],
    frasogn:
      'Verðbólgan hjaðnaði jafnt og þétt eftir hámarkið 2023 og Seðlabankinn hóf vaxtalækkunarferli haustið 2024. Stjórnarsamstarfið frá 2017 leystist upp á árinu 2024 — Katrín Jakobsdóttir bauð sig fram til forseta um vorið og stjórn Bjarna Benediktssonar sprakk um haustið — og eftir kosningar í nóvember 2024 tók ríkisstjórn Kristrúnar Frostadóttur (Samfylking, Viðreisn og Flokkur fólksins) við í desember 2024. Stóru viðfangsefnin fram undan eru kunnugleg: að ná verðbólgu og vöxtum niður án harðrar lendingar, orkuskipti og öflun grænnar orku, og húsnæðismarkaður sem heldur ekki í við fólksfjölgun. Héðan í frá er sagan enn að gerast — leikurinn heldur áfram þar sem hún sleppir.',
    raunAkvardanir: [],
  },
  // ── Lota 8: 2028–2032 ─────────────────────────────────────────────────────
  {
    rikisstjornir: ['Óskrifað — framtíðin ræður'],
    frasogn:
      'Hér sleppir sögunni: árin 2028–2032 hafa ekki enn verið skrifuð. Engin ríkisstjórn hefur tekist á við þetta tímabil og engar raun-ákvarðanir liggja fyrir til samanburðar. Sagan dæmir hagstjórn ekki eftir einu góðu ári heldur eftir heilum ferli — hvort velmegunin stóðst áföllin sem enginn sá fyrir. Framtíðin er ykkar að skrifa: ákvarðanir ykkar í leiknum eru jafn góð spá og hver önnur.',
    raunAkvardanir: [],
  },
];

// SAGA[8] — timabil reiknað úr YEAR_START svo það sé alltaf rétt (lota i+1 = YEAR_START+i*4 .. YEAR_START+(i+1)*4).
export const SAGA = LOTUR.map((e, i) => ({
  timabil: `${YEAR_START + i * ARA_PER_LOTU}–${YEAR_START + (i + 1) * ARA_PER_LOTU}`,
  ...e,
}));

// Saga tiltekinnar lotu (1..8) eða null utan marka.
export function sagaFyrirLotu(round) {
  const r = Number(round);
  if (!Number.isInteger(r) || r < 1 || r > SAGA.length) return null;
  return SAGA[r - 1];
}

// Raun-KPI við LOK lotu r (sjá vörpun efst: vísitala r*4 í REALITY). kaupmattur er ekki í REALITY → null;
// sama gildir um hvert það gildi sem REALITY nær ekki yfir. Utan 1..ROUNDS → null.
export function raunKpiLotu(round) {
  const r = Number(round);
  if (!Number.isInteger(r) || r < 1 || r > ROUNDS) return null;
  const idx = r * ARA_PER_LOTU;
  const pick = (key) => {
    const serie = REALITY[key];
    const v = Array.isArray(serie) ? serie[idx] : undefined;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  return {
    verdbolga: pick('verdbolga'),
    hagvoxtur: pick('hagvoxtur'),
    atvinnuleysi: pick('atvinnuleysi'),
    skuldir: pick('skuldir'),
    kaupmattur: pick('kaupmattur'), // ekki til í REALITY → null
  };
}

// Uppsafnað raun-val stefnu-rofa til og með lotu round (síðari færsla yfirskrifar fyrri — t.d. hoft
// true í lotu 3 → false í lotu 5, esb true í lotu 3 → false í lotu 4). val:null (verðtrygging) telst „óráðið".
function raunStodur(round) {
  const st = {};
  const n = Math.max(0, Math.min(SAGA.length, Math.floor(Number(round) || 0)));
  for (let i = 0; i < n; i++) {
    for (const a of SAGA[i].raunAkvardanir) st[a.id] = a.val;
  }
  return st;
}

// Samanburður liðs við raunina eftir lotu round. policyStates = staða rofa liðsins (úr policyStates() í
// policies.mjs: toggle true/false — false aðeins ef áður virkt; choice = valinn lykill). Skilar færslu fyrir
// HVERN rofa í POLICIES (client síar): { id, icon, label, thitt, raun, eins }.
// thitt = val liðsins eða null (engin ákvörðun). raun = raun-val fram að lokum lotunnar eða null.
// eins = thitt === raun, en null ef annað hvort vantar (enginn samanburður mögulegur).
export function berSamanAkvardanir(round, policyStates = {}) {
  const raun = raunStodur(round);
  return POLICIES.map((p) => {
    const thitt = p.id in policyStates && policyStates[p.id] != null ? policyStates[p.id] : null;
    const r = p.id in raun && raun[p.id] != null ? raun[p.id] : null;
    return {
      id: p.id,
      icon: p.icon,
      label: p.label,
      thitt,
      raun: r,
      eins: thitt == null || r == null ? null : thitt === r,
    };
  });
}
