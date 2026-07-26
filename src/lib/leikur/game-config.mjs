// Sjálfgefið efni RÁS-Leiksins (S1). HREINT gagna-módúl — engin env/crypto/D1.
// Lever-lyklar staðfestir gegn gogn/roads/baseline.json (sjá próf).
export const ROUNDS = 8;
export const QUARTERS_PER_ROUND = 4;

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

// 8 atburðir. shocks = exogen sjokk umferðar (sömu fyrir öll lið). responses = 2-3 val, hvert með effect{lever?,shock?}.
export const SCENARIO = {
  id: 'grunn',
  events: [
    { round: 1, title: 'Rólegt upphaf', text: 'Hagkerfið er í jafnvægi. Setjið stefnuna.', shocks: {}, responses: [
      { key: 'ekkert', label: 'Engin sérstök viðbrögð', effect: {} },
      { key: 'vardsjodur', label: 'Leggja í varasjóð (aðhald)', effect: { lever: { utgjold: -3 } } } ] },
    { round: 2, title: 'Olíuverð hækkar 25%', text: 'Innfluttur orkukostnaður hækkar; þrýstingur á verðlag.', shocks: { olia: 25 }, responses: [
      { key: 'absorb', label: 'Taka á okkur (ekkert)', effect: {} },
      { key: 'kolefni', label: 'Flýta orkuskiptum', effect: { lever: { orkuskipti: 10 } } },
      { key: 'nidurgr', label: 'Niðurgreiða eldsneyti (útgjöld↑)', effect: { lever: { utgjold: 4 } } } ] },
    { round: 3, title: 'Kjarasamningar lausir', text: 'Verkalýðshreyfingin krefst launahækkana.', shocks: {}, responses: [
      { key: 'semja', label: 'Semja rausnarlega (laun↑)', effect: { lever: { laun: 4 } } },
      { key: 'hafna', label: 'Halda aftur af launum', effect: { lever: { laun: -2 } } },
      { key: 'skattaivilnun', label: 'Skattaívilnun í skiptum', effect: { lever: { skattar: -3 } } } ] },
    { round: 4, title: 'Uppsveifla í ferðaþjónustu', text: 'Metfjöldi ferðamanna; gjaldeyrir streymir inn.', shocks: { ferdamenn: 20 }, responses: [
      { key: 'nyta', label: 'Nýta til fulls (ekkert)', effect: {} },
      { key: 'gjald', label: 'Hækka ferðamannagjald', effect: { lever: { ferdamannagjald: 500 } } } ] },
    { round: 5, title: 'Alþjóðleg fjármálaókyrrð', text: 'Áhætta eykst á mörkuðum; fjármagn flýr.', shocks: { heimshagvoxtur: -2 }, responses: [
      { key: 'rolegt', label: 'Halda ró (ekkert)', effect: {} },
      { key: 'verja', label: 'Verja gengið (vextir↑)', effect: { lever: { vextir: 0.5 } } },
      { key: 'orva', label: 'Örva innlenda eftirspurn', effect: { lever: { utgjold: 6 } } } ] },
    { round: 6, title: 'Húsnæðisverð rýkur upp', text: 'Almenningur ræður ekki við íbúðaverð.', shocks: {}, responses: [
      { key: 'frambod', label: 'Stórauka framboð', effect: { lever: { frambod: 20 } } },
      { key: 'dsti', label: 'Herða lánþegaskilyrði', effect: { lever: { dsti: -8 } } },
      { key: 'ekkert', label: 'Láta markaðinn ráða', effect: {} } ] },
    { round: 7, title: 'Loftslagsskuldbindingar herðast', text: 'Alþjóðlegar kröfur um samdrátt í losun.', shocks: {}, responses: [
      { key: 'kolefnisgjald', label: 'Hækka kolefnisgjald', effect: { lever: { kolefnisgjald: 40 } } },
      { key: 'graenfjarf', label: 'Grænar fjárfestingar', effect: { lever: { orkuskipti: 15 } } },
      { key: 'fresta', label: 'Fresta aðgerðum', effect: {} } ] },
    { round: 8, title: 'Kosningaár', text: 'Almenningur vill sjá árangur. Lokaspretturinn.', shocks: {}, responses: [
      { key: 'agi', label: 'Sýna ábyrgð (aðhald)', effect: { lever: { utgjold: -4 } } },
      { key: 'gjafir', label: 'Örva fyrir kosningar', effect: { lever: { utgjold: 8 } } } ] },
  ],
};
