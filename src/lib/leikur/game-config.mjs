// Sjálfgefið efni RÁS-Leiksins (S1). HREINT gagna-módúl — engin env/crypto/D1.
// Lever-lyklar staðfestir gegn gogn/roads/baseline.json (sjá próf).
export const ROUNDS = 8;
export const QUARTERS_PER_ROUND = 4;
// Tímalíkan: hvert skref = 1 ár, hver umferð = 4-ára kjörtímabil. Leikurinn nær 2000→2032 (8 umferðir × 4 ár).
export const YEAR_START = 2000;

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

// Söguleg sjálfgefin sviðsmynd: ÍSLAND 2000–2032, hvert kjörtímabil (4 ár) fær raun-atburð + sjokk.
// `year` = upphafsár kjörtímabils, `icon` = tákn f. tímalínu. shocks = exogen (sömu f. öll lið).
// responses (≥2, gild effect) haldast f. classic-samhæfi; studio-hamur hunsar þau (svarað með sleðum).
export const SCENARIO = {
  id: 'island2000',
  events: [
    { round: 1, year: 2000, icon: '💻', title: 'Ný öld — netbólan springur', text: 'Aldamótin: alþjóðleg netbóla springur og bankarnir eru einkavæddir. Hófleg ládeyða úti í heimi — grunnurinn er lagður.', shocks: { heimshagvoxtur: -1 }, responses: [
      { key: 'bida', label: 'Halda ró', effect: {} },
      { key: 'innvidir', label: 'Örva með innviðum', effect: { lever: { innvidir: 10 } } } ] },
    { round: 2, year: 2004, icon: '🚀', title: 'Útrásin — ofþensla', text: 'Bankarnir þenjast út erlendis, erlent fjármagn streymir inn og krónan styrkist. Hagkerfið ofhitnar.', shocks: { adflutningur: 15, gengi: 8 }, responses: [
      { key: 'herda', label: 'Herða lánþegaskilyrði (DSTI↓)', effect: { lever: { dsti: -10 } } },
      { key: 'sjodur', label: 'Safna í varasjóð (skattar↑)', effect: { lever: { skattar: 3 } } },
      { key: 'leyfa', label: 'Leyfa uppsveiflunni að rúlla', effect: {} } ] },
    { round: 3, year: 2008, icon: '🏦', title: 'Bankahrunið', text: 'Alþjóðleg fjármálakreppa fellir bankana. Krónan hrynur, atvinnuleysi rýkur upp og traust gufar upp. Stærsta prófraunin.', shocks: { gengi: -35, heimshagvoxtur: -4, hravaruverd: -10 }, responses: [
      { key: 'adhald', label: 'Neyðarlán og aðhald', effect: { lever: { utgjold: -6 } } },
      { key: 'verja', label: 'Verja heimilin (útgjöld↑)', effect: { lever: { utgjold: 8 } } },
      { key: 'vextir', label: 'Lækka vexti hratt', effect: { lever: { vextir: -1 } } } ] },
    { round: 4, year: 2012, icon: '🔒', title: 'Endurreisn í höftum', text: 'Fjármagnshöft verja krónuna meðan hagkerfið réttir úr sér. Ferðamenn fara að streyma inn.', shocks: { heimshagvoxtur: 1, ferdamenn: 12 }, responses: [
      { key: 'uppbygging', label: 'Fjárfesta í uppbyggingu', effect: { lever: { innvidir: 12 } } },
      { key: 'skuldir', label: 'Greiða niður skuldir', effect: { lever: { utgjold: -4 } } } ] },
    { round: 5, year: 2016, icon: '✈️', title: 'Ferðamannasprengjan', text: 'Metfjöldi ferðamanna, gjaldeyrir flæðir inn og krónan styrkist á ný. Húsnæðisverð rýkur upp.', shocks: { ferdamenn: 30, gengi: 6 }, responses: [
      { key: 'frambod', label: 'Stórauka íbúðaframboð', effect: { lever: { frambod: 20 } } },
      { key: 'gjald', label: 'Hækka ferðamannagjald', effect: { lever: { ferdamannagjald: 500 } } },
      { key: 'nyta', label: 'Nýta uppsveifluna', effect: {} } ] },
    { round: 6, year: 2020, icon: '🦠', title: 'Heimsfaraldur', text: 'COVID-19 lokar landamærum. Ferðaþjónustan hrynur og heimshagkerfið dregst saman.', shocks: { ferdamenn: -40, heimshagvoxtur: -3 }, responses: [
      { key: 'studningur', label: 'Stór stuðningspakki', effect: { lever: { utgjold: 10 } } },
      { key: 'graent', label: 'Græn viðspyrna', effect: { lever: { orkuskipti: 15 } } },
      { key: 'adhald', label: 'Halda að sér höndum', effect: { lever: { utgjold: -2 } } } ] },
    { round: 7, year: 2024, icon: '🔥', title: 'Verðbólgu-bylgjan', text: 'Eftirspurn og orkuverð keyra upp verðbólgu um allan heim. Seðlabankar hækka vexti hratt.', shocks: { olia: 30, hravaruverd: 15 }, responses: [
      { key: 'herdavexti', label: 'Herða peningastefnu', effect: { lever: { vextir: 1 } } },
      { key: 'kaupmattur', label: 'Verja kaupmátt (tilfærslur↑)', effect: { lever: { tilfaerslur: 8 } } },
      { key: 'bida', label: 'Bíða af sér bylgjuna', effect: {} } ] },
    { round: 8, year: 2028, icon: '🗳️', title: 'Framtíðin — óviss (kosningaár)', text: 'Orkuskipti, loftslag og alþjóðleg óvissa móta lokakjörtímabilið. Almenningur vill sjá árangur.', shocks: { heimshagvoxtur: -1, olia: 5 }, responses: [
      { key: 'agi', label: 'Sýna ábyrgð (aðhald)', effect: { lever: { utgjold: -4 } } },
      { key: 'graentatak', label: 'Grænt lokaátak', effect: { lever: { orkuskipti: 20 } } },
      { key: 'kosningar', label: 'Örva fyrir kosningar', effect: { lever: { utgjold: 8 } } } ] },
  ],
};
