// Sjálfgefið efni RÁS-Leiksins (S1). HREINT gagna-módúl — engin env/crypto/D1.
// Lever-lyklar staðfestir gegn gogn/roads/baseline.json (sjá próf).
export const ROUNDS = 8;
export const QUARTERS_PER_ROUND = 4;
// Tímalíkan: hvert skref = 1 ár, hver umferð = 4-ára kjörtímabil. Leikurinn nær 2000→2032 (8 umferðir × 4 ár).
export const YEAR_START = 2000;

// Besta-nálgun á stefnu Íslands árið 2000 (studio-sjálfgefið). Fráviks-sleðar (base 0) bera 2000-frávik
// frá núverandi raunstöðu; algerir sleðar (vextir/veðhlutfall/DSTI/verðtrygging) bera raun-2000-gildi. Klippt í [min,max].
export const YEAR2000_DIALS = {
  // Peningastefna & varúð
  vextir: 11,            // háir stýrivextir um aldamótin
  vedhlutfall: 65,       // fyrir 90–100% íbúðalánin (komu ~2004)
  dsti: 45,              // engin greiðslubyrðar-þök
  verdtrygging: 40,      // flest lán verðtryggð
  // Ríkisfjármál & skattar
  skattar: 1,            // tekjuskattur ~38% (vs 37 nú)
  fjarmagnstekjuskattur: -10, // 10% (vs ~22% nú)
  tryggingagjald: -1,    // ~5,3% (vs 6,35% nú)
  tilfaerslur: -2,       // lægri tilfærslur
  veidigjald: -50,       // ekkert veiðigjald enn (kom 2004)
  ivilnanir: -5,         // færri ívilnanir
  menntun: -5,           // lægri menntaútgjöld
  // Vinnumarkaður & mannauður
  innflytjendastefna: -10, // strangari (fyrir EES-vinnuafl 2006)
  // Auðlindir, orka & loftslag
  fiskeldi: -20,         // fiskeldi nær ekkert (sprakk út ~2012+)
  orka: -15,             // lægri stóriðju-orka (fyrir Kárahnjúka/Fjarðaál 2007)
  orkuskipti: -10,       // ekkert orkuskipta-átak
  kolefnisgjald: -50,    // ekkert kolefnisgjald (kom ~2010)
  // Aðrir sleðar helst á grunni (base ≈ 2000-gildi): vsk 24,5%, útgjöld, framboð,
  // laun (base 6% = raunhæft 2000), lífeyrisaldur 67, kvóti, byggðastefna o.fl.
};

// Söguleg raun-gildi 2000–2032 (best-effort nálgun; STÍLFÆRT viðmið, ekki nákvæm hagsaga).
// 33 gildi per KPI (2000..2032). Notað í „Raunveruleikinn"-línu + „Svona fór það"-samanburð.
export const REALITY = {
  verdbolga:    [5.0, 6.7, 4.8, 2.1, 3.2, 4.0, 6.8, 5.0, 12.7, 12.0, 5.4, 4.0, 5.2, 3.9, 2.0, 1.6, 1.7, 1.8, 2.7, 3.0, 2.8, 4.4, 8.3, 8.7, 5.9, 4.0, 3.5, 3.8, 3.5, 3.6, 3.4, 3.7, 3.5],
  atvinnuleysi: [2.3, 2.3, 3.3, 3.4, 3.1, 2.6, 2.9, 2.3, 3.0, 7.2, 7.6, 7.1, 6.0, 5.4, 5.0, 4.0, 3.0, 2.8, 2.7, 3.6, 6.4, 6.0, 3.8, 3.4, 3.5, 3.6, 3.7, 3.9, 3.8, 3.8, 3.7, 3.9, 3.8],
  skuldir:      [41, 42, 41, 40, 35, 26, 28, 29, 68, 82, 88, 92, 90, 84, 80, 65, 52, 42, 37, 36, 48, 53, 52, 49, 47, 45, 43, 47, 46, 46, 45, 47, 46],
  hagvoxtur:    [4.3, 3.9, 0.1, 2.4, 7.8, 5.7, 4.2, 9.5, 1.5, -6.8, -3.4, 2.0, 1.2, 4.1, 2.1, 4.4, 6.3, 4.2, 4.9, 2.4, -6.8, 4.5, 8.9, 5.0, 0.5, 1.8, 2.2, 2.4, 2.4, 2.3, 2.3, 2.2, 2.2],
};

// Flipa-merki (studio): baseline.levers.group → {icon, stutt-heiti}. Aðeins BIRTING; hermir óáhrifaður.
export const TAB_META = {
  'Peningastefna & varúð': { icon: '🏦', label: 'Peningastefna' },
  'Ríkisfjármál & skattar': { icon: '💰', label: 'Ríkisfjármál' },
  'Húsnæði': { icon: '🏘️', label: 'Húsnæði' },
  'Vinnumarkaður & mannauður': { icon: '👥', label: 'Vinnumarkaður' },
  'Auðlindir, orka & loftslag': { icon: '🌱', label: 'Auðlindir & orka' },
  'Byggð & ferðaþjónusta': { icon: '🧭', label: 'Byggð & ferðaþj.' },
};

// „Ný stjórntæki": sleði opnast (verður stillanlegur) í tiltekinni umferð (sögulega réttilega). Sjálfgefið 1.
// Læstir sleðar halda dial-gildi (submittast áfram = 2000-stig) en þátttakandi getur ekki breytt þeim fyrr.
export const LEVER_UNLOCK = {
  innflytjendastefna: 2,     // EES-vinnuafl ~2006
  fjarmagnstekjuskattur: 2,  // hækkanir eftir 2004
  veidigjald: 2,             // veiðigjald 2004
  kolefnisgjald: 3,          // kolefnisgjald ~2010
  atvinnuthatttaka: 3,       // virk vinnumarkaðsstefna
  ferdamannagjald: 4,        // gistináttagjald ~2011
  orkuskipti: 4,             // orkuskipti-átak
  fiskeldi: 4,               // fiskeldis-sprenging ~2012+
  skograekt: 4,              // aukin skógrækt/kolefnisbinding
  dsti: 5,                   // greiðslubyrðar-þök (lánþegaskilyrði 2017)
  votlendi: 5,               // endurheimt votlendis
};

// #4 Mýkri byrjun: kjarna-stjórntæki auðkennd (⭐) í umferð 1 svo fyrstu-spilarar byrji á fáum, skýrum tólum.
export const CORE_LEVERS = ['vextir', 'skattar', 'tilfaerslur', 'menntun'];

// #1-3: afstaða = Δ á hlaupandi sleða-stig. #4: eins-árs púls (fjárhags-kostnaður kemur SJÁLFKRAFA úr
// tengslum sleðans við afkomu í vélinni — engin sér-refsing). #5 (viðbragð) er í SCENARIO.
export const DECISIONS = [
  { id: 'peningastefna', label: 'Peningastefna (stýrivextir)', lever: 'vextir', mode: 'delta', options: [
    { key: 'herda2', label: 'Herða mikið', delta: 1.0 }, { key: 'herda', label: 'Herða', delta: 0.5 },
    { key: 'obreytt', label: 'Óbreytt', delta: 0 }, { key: 'slaka', label: 'Slaka', delta: -0.5 }, { key: 'slaka2', label: 'Slaka mikið', delta: -1.0 } ] },
  { id: 'utgjold', label: 'Ríkisútgjöld', lever: 'utgjold', mode: 'delta', options: [
    { key: 'adhald2', label: 'Mikið aðhald', delta: -8 }, { key: 'adhald', label: 'Aðhald', delta: -4 },
    { key: 'obreytt', label: 'Hlutlaust', delta: 0 }, { key: 'orvun', label: 'Örvun', delta: 6 }, { key: 'orvun2', label: 'Mikil örvun', delta: 12 } ] },
  { id: 'skattar', label: 'Skattstefna', lever: 'skattar', mode: 'delta', options: [
    { key: 'haekka2', label: 'Hækka mikið', delta: 8 }, { key: 'haekka', label: 'Hækka', delta: 4 },
    { key: 'obreytt', label: 'Óbreytt', delta: 0 }, { key: 'laekka', label: 'Lækka', delta: -4 }, { key: 'laekka2', label: 'Lækka mikið', delta: -8 } ] },
  { id: 'fjarfesting', label: 'Fjárfesting / umbót', mode: 'pulse', options: [
    { key: 'engin', label: 'Engin (spara svigrúm)' },
    { key: 'innvidir', label: 'Innviðir', lever: 'innvidir', pulse: 15 },
    { key: 'orkuskipti', label: 'Orkuskipti', lever: 'orkuskipti', pulse: 15 },
    { key: 'husnaedi', label: 'Húsnæði', lever: 'frambod', pulse: 20 },
    { key: 'nyskopun', label: 'Menntun/nýsköpun', lever: 'menntun', pulse: 15 } ] },
  { id: 'vidbragd', label: 'Viðbragð við atburði', mode: 'response', options: [] }, // fyllt af atburði umferðar
];

export const MANDATE = {
  kpis: [
    { key: 'verdbolga', label: 'Verðbólga', target: 2.5, band: 1.0, zeroAt: 4.0, dir: 'target', weight: 1 },
    { key: 'atvinnuleysi', label: 'Atvinnuleysi', max: 4.5, band: 1.0, zeroAt: 4.0, dir: 'max', weight: 1 },
    { key: 'skuldir', label: 'Skuldir ríkis', max: 40, band: 5, zeroAt: 30, dir: 'max', weight: 1 },
    { key: 'hagvoxtur', label: 'Hagvöxtur', min: 2.0, band: 1.0, zeroAt: 3.0, dir: 'min', weight: 1 },
  ],
  crisis: [ { key: 'verdbolga', over: 10 }, { key: 'atvinnuleysi', over: 12 }, { key: 'skuldir', over: 90 } ],
  crisisFactor: 0.3,
};

// Fasi A — MARKMIÐ BREYTAST EFTIR KJÖRTÍMABILI. Þjóðhagslegur kjarni (verðb/atvl/skuldir/hagv) ALLTAF með,
// þemu lögð á smám saman svo umhverfis-/sjálfbærni-/byggða-/jöfnuðar-sleðar skipti máli í stiginu (annars 0 áhrif).
// Aðeins fyrir sjálfgefna leiki; sérsniðnir leikir nota fast mandate úr config. Hagvísar 100-vísitala (2000).
export const GOAL_SPECS = {
  verdbolga: { key: 'verdbolga', label: 'Verðbólga', target: 2.5, band: 1.0, zeroAt: 4.0, dir: 'target', weight: 1, icon: '💵' },
  atvinnuleysi: { key: 'atvinnuleysi', label: 'Atvinnuleysi', max: 4.5, band: 1.0, zeroAt: 4.0, dir: 'max', weight: 1, icon: '👥' },
  skuldir: { key: 'skuldir', label: 'Skuldir ríkis', max: 40, band: 5, zeroAt: 30, dir: 'max', weight: 1, icon: '🏛️' },
  hagvoxtur: { key: 'hagvoxtur', label: 'Hagvöxtur', min: 2.0, band: 1.0, zeroAt: 3.0, dir: 'min', weight: 1, icon: '📈' },
  kaupmattur: { key: 'kaupmattur', label: 'Kaupmáttur launa', min: 0.5, band: 1.5, zeroAt: 6, dir: 'min', weight: 1, icon: '🛒' },
  fiskistofn: { key: 'fiskistofn', label: 'Fiskistofn (sjálfbærni)', min: 96, band: 4, zeroAt: 25, dir: 'min', weight: 1, icon: '🐟' },
  byggdajofnudur: { key: 'byggdajofnudur', label: 'Byggðajöfnuður', min: 98, band: 3, zeroAt: 15, dir: 'min', weight: 1, icon: '🗺️' },
  losun: { key: 'losun', label: 'CO₂-losun (loftslag)', max: 106, band: 4, zeroAt: 60, dir: 'max', weight: 1, icon: '🌱' },
  jofnudur: { key: 'jofnudur', label: 'Tekjujöfnuður', min: 98, band: 3, zeroAt: 15, dir: 'min', weight: 1, icon: '⚖️' },
};
const CORE_GOALS = ['verdbolga', 'atvinnuleysi', 'skuldir', 'hagvoxtur'];
// Markmið per kjörtímabil (KT1..KT8): kjarni + þema. Þemu magnast: lífskjör→fiskur→(hrun)→byggð→ferðamenn→loftslag→jöfnuður→allt.
export const ROUND_GOALS = [
  [...CORE_GOALS, 'kaupmattur'],                                         // KT1 2000 netbóla: lífskjör
  [...CORE_GOALS, 'fiskistofn'],                                         // KT2 2004 útrás: sjálfbær sjávarútvegur
  [...CORE_GOALS],                                                       // KT3 2008 hrun: lifa af (þjóðhagur ræður)
  [...CORE_GOALS, 'byggdajofnudur'],                                     // KT4 2012 endurreisn: byggðir
  [...CORE_GOALS, 'fiskistofn', 'kaupmattur'],                           // KT5 2016 ferðamenn: án ofþenslu
  [...CORE_GOALS, 'losun'],                                              // KT6 2020 COVID+Paris: græn viðreisn
  [...CORE_GOALS, 'losun', 'jofnudur'],                                  // KT7 2024 verðbólga: loftslag+jöfnuður
  [...CORE_GOALS, 'losun', 'fiskistofn', 'byggdajofnudur', 'jofnudur'],  // KT8 2028 framtíð: allt
];
export function mandateFor(round) {
  const keys = ROUND_GOALS[Math.min(ROUND_GOALS.length - 1, Math.max(0, (round || 1) - 1))] || CORE_GOALS;
  return { kpis: keys.map((k) => GOAL_SPECS[k]).filter(Boolean), crisis: MANDATE.crisis, crisisFactor: MANDATE.crisisFactor };
}

// Söguleg sjálfgefin sviðsmynd: ÍSLAND 2000–2032, hvert kjörtímabil (4 ár) fær raun-atburð + sjokk.
// `year` = upphafsár kjörtímabils, `icon` = tákn f. tímalínu. shocks = exogen (sömu f. öll lið).
// responses (≥2, gild effect) haldast f. classic-samhæfi; studio-hamur hunsar þau (svarað með sleðum).
export const SCENARIO = {
  id: 'island2000',
  events: [
    { round: 1, year: 2000, icon: '💻', title: 'Ný öld — netbólan springur', text: 'Aldamótin ganga í garð. Alþjóðleg netbóla springur en Ísland stendur traustum fótum: atvinnuleysi er lágt, hagvöxtur góður og bankarnir nýlega einkavæddir. Þið takið við hagkerfi í jafnvægi — en grunnurinn sem þið leggið núna mótar næstu áratugi.', watch: 'Freistingin er að ýta undir vöxtinn. En ofhitnun og skuldasöfnun heimila geta orðið að vandamáli síðar. Hugið að stöðugleika.', shocks: { heimshagvoxtur: -1 }, responses: [
      { key: 'bida', label: 'Halda ró', effect: {} },
      { key: 'innvidir', label: 'Örva með innviðum', effect: { lever: { innvidir: 10 } } } ] },
    { round: 2, year: 2004, icon: '🚀', title: 'Útrásin — ofþensla', text: 'Útrásin er í hámarki. Bankarnir þenjast út erlendis, erlent fjármagn streymir inn og krónan styrkist. Íbúðalán upp í 90–100% verða til, húsnæðisverð rýkur upp og neyslan æðir áfram. Allir virðast græða — en undir yfirborðinu safnast upp áhætta.', watch: 'Ofhitnun, viðskiptahalli og skuldsetning heimila eru að verða hættuleg. Aðhald núna gæti verið óvinsælt en varið ykkur gegn falli.', shocks: { adflutningur: 15, gengi: 8 }, responses: [
      { key: 'herda', label: 'Herða lánþegaskilyrði (DSTI↓)', effect: { lever: { dsti: -10 } } },
      { key: 'sjodur', label: 'Safna í varasjóð (skattar↑)', effect: { lever: { skattar: 3 } } },
      { key: 'leyfa', label: 'Leyfa uppsveiflunni að rúlla', effect: {} } ] },
    { round: 3, year: 2008, icon: '🏦', title: 'Bankahrunið', text: 'Hrunið er skollið á. Alþjóðleg fjármálakreppa fellir alla þrjá stóru bankana á einni viku. Krónan hrynur um tugi prósenta, verðbólga rýkur í tveggja stafa tölu, atvinnuleysi margfaldast og skuldir heimila með verðtryggingu stökkbreytast. Þetta er stærsta prófraun lýðveldisins.', watch: 'Nú reynir á allt: verja heimilin, halda ríkissjóði á floti OG endurheimta traust — í senn. Það er engin sársaukalaus leið út.', shocks: { gengi: -35, heimshagvoxtur: -4, hravaruverd: -10 }, responses: [
      { key: 'adhald', label: 'Neyðarlán og aðhald', effect: { lever: { utgjold: -6 } } },
      { key: 'verja', label: 'Verja heimilin (útgjöld↑)', effect: { lever: { utgjold: 8 } } },
      { key: 'vextir', label: 'Lækka vexti hratt', effect: { lever: { vextir: -1 } } } ] },
    { round: 4, year: 2012, icon: '🔒', title: 'Endurreisn í höftum', text: 'Versta er afstaðið. Fjármagnshöft verja krónuna meðan hagkerfið réttir hægt úr sér. Ferðamenn fara að streyma inn og gefa nýja von. En ríkissjóður er skuldsettur upp fyrir haus og heimilin bera enn þungar byrðar.', watch: 'Jafnvægið milli þess að greiða niður skuldir og að fjárfesta í viðspyrnu. Of hart aðhald kæfir batann; of laust eykur skuldirnar.', shocks: { heimshagvoxtur: 1, ferdamenn: 12 }, responses: [
      { key: 'uppbygging', label: 'Fjárfesta í uppbyggingu', effect: { lever: { innvidir: 12 } } },
      { key: 'skuldir', label: 'Greiða niður skuldir', effect: { lever: { utgjold: -4 } } } ] },
    { round: 5, year: 2016, icon: '✈️', title: 'Ferðamannasprengjan', text: 'Ferðamannasprengjan umbreytir hagkerfinu. Metfjöldi ferðamanna, gjaldeyrir flæðir inn og krónan styrkist á ný. En húsnæðisverð rýkur upp — ungt fólk ræður ekki við íbúðaverð og Airbnb þrengir að leigumarkaði.', watch: 'Uppsveiflan er kærkomin en einhæf. Húsnæðiskreppa og of mikið traust á einni atvinnugrein eru áhætturnar. Hugið að framboði og fjölbreytni.', shocks: { ferdamenn: 30, gengi: 6 }, responses: [
      { key: 'frambod', label: 'Stórauka íbúðaframboð', effect: { lever: { frambod: 20 } } },
      { key: 'gjald', label: 'Hækka ferðamannagjald', effect: { lever: { ferdamannagjald: 500 } } },
      { key: 'nyta', label: 'Nýta uppsveifluna', effect: {} } ] },
    { round: 6, year: 2020, icon: '🦠', title: 'Heimsfaraldur', text: 'Heimsfaraldur skellur á. COVID-19 lokar landamærum og ferðaþjónustan — nú burðarás hagkerfisins — hrynur nánast á einni nóttu. Heimshagkerfið dregst saman og óvissan er alger. Vextir eru þó lágir um allan heim.', watch: 'Hvað á að verja og hvað á að láta? Stór stuðningur bjargar störfum en hleður á skuldir. Þetta gæti líka verið tækifæri til að endurhugsa hagkerfið.', shocks: { ferdamenn: -40, heimshagvoxtur: -3 }, responses: [
      { key: 'studningur', label: 'Stór stuðningspakki', effect: { lever: { utgjold: 10 } } },
      { key: 'graent', label: 'Græn viðspyrna', effect: { lever: { orkuskipti: 15 } } },
      { key: 'adhald', label: 'Halda að sér höndum', effect: { lever: { utgjold: -2 } } } ] },
    { round: 7, year: 2024, icon: '🔥', title: 'Verðbólgu-bylgjan', text: 'Verðbólgan er komin aftur. Uppsöfnuð eftirspurn eftir faraldurinn, stríð og hátt orkuverð keyra upp verðlag um allan heim. Seðlabankar hækka vexti hratt og greiðslubyrði heimila þyngist. Kaupmáttur er í hættu.', watch: 'Klassíska klemman: að kæla verðbólguna án þess að kalla fram samdrátt og atvinnuleysi. Vaxtahækkanir bíta — en of hægt viðbragð festir verðbólguna í sessi.', shocks: { olia: 30, hravaruverd: 15 }, responses: [
      { key: 'herdavexti', label: 'Herða peningastefnu', effect: { lever: { vextir: 1 } } },
      { key: 'kaupmattur', label: 'Verja kaupmátt (tilfærslur↑)', effect: { lever: { tilfaerslur: 8 } } },
      { key: 'bida', label: 'Bíða af sér bylgjuna', effect: {} } ] },
    { round: 8, year: 2028, icon: '🗳️', title: 'Framtíðin — óviss (kosningaár)', text: 'Lokakjörtímabilið. Orkuskipti, loftslagsskuldbindingar og alþjóðleg óvissa móta framtíðina. Almenningur er þreyttur á sveiflum og vill sjá stöðugan, sjálfbæran árangur. Arfleifð ykkar verður dæmd í kosningum — og af sögunni.', watch: 'Skammtíma-vinsældir gegn langtíma-sjálfbærni. Það sem þið byggið upp núna ræður hvernig heildar-ferillinn 2000–2032 verður metinn.', shocks: { heimshagvoxtur: -1, olia: 5 }, responses: [
      { key: 'agi', label: 'Sýna ábyrgð (aðhald)', effect: { lever: { utgjold: -4 } } },
      { key: 'graentatak', label: 'Grænt lokaátak', effect: { lever: { orkuskipti: 20 } } },
      { key: 'kosningar', label: 'Örva fyrir kosningar', effect: { lever: { utgjold: 8 } } } ] },
  ],
};
