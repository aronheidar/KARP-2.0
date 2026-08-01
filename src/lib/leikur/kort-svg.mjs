// kort-svg.mjs — teiknar Lifandi Íslandskortið (hönnunarskjal kafli E) sem SVG-streng.
//
// Hrein strengja-eining: ekkert DOM, engir event-handlerar, engin <text>-element,
// ekkert random — sama threp gefur ALLTAF nákvæmlega sama streng (client endurteiknar
// við sleða-drög). Inntakið er þrep-hluturinn frá kort-throp.mjs:
// { byggd, menntun, fiskur, losun, ljos, atvik, taknmyndir }.
//
// STRANDLÍNAN er unnin úr RAUN-GÖGNUM: web/public/gogn/sveitarfelog_adm2.json
// (geoBoundaries ADM2, CC-BY 4.0 — sama grunn og choropleth-kortin nota).
// Einnota skrifta sameinaði 653 sveitarfélaga-fjölhyrninga í ytri strandlínu
// (kantar sem koma aðeins einu sinni fyrir = strönd), einfaldaði með Douglas-
// Peucker (eps 1,8 px → 526 punktar, firðir haldast tenntir) og varpaði á
// viewBox 0 0 640 400 (x = lon·cos65°, y = −lat, padding 26 px). Heimaey
// (Vestmannaeyjar) er sér smá-eyja úr sömu vinnslu. Öll kennileiti (bæir,
// jöklar, hringvegur, tákn) eru varpanir raun-hnita í sama hnitakerfi.
//
// Litaspjald (sama og annars staðar í leiknum):
//   gull #f6b13b · ljós-ink #cdd6e6 · dempað #5d6b85 · grænt #42d086
//   sjór #131a28-grunnur · land #232c3e-grunnur · jöklar hvítt/ljósblátt
//
// Tvö kort mega birtast á sömu síðu: öll defs-id fá idPrefix (sjálfgefið 'kt')
// og eru ÞREP-ÓHÁÐ — tvö default-kort deila þá skaðlaust fyrstu defs-unum.

const GULL = '#f6b13b';
const INK = '#cdd6e6';
const DEMPAD = '#5d6b85';
const GRAENT = '#42d086';
const SJOR = '#131a28';
const LAND = '#232c3e';

// — Strandlína Íslands (526 punktar) úr sveitarfelog_adm2.json, sjá haus. —
const ISLAND_PATH =
  'M578.2 187.9 L575.9 185.8 L577.4 177.9 L571.6 186.8 L572.1 183.7 L568.3 184.5 L571 181.8 L565.9 181.6 L570.7 179.7 L572.1 175.2 L553.7 175.2 L569.8 172.8 L573 169.3 L574.5 166.2 L568.6 163.2 L554.1 166.3 L567.6 159.9 L561.8 156.7 L571 153.4 L572.9 139.5 L568.9 135 L564.3 138.7 L563.1 133.5 L560 132.7 L561.2 128.8 L552.3 128.9 L538.1 119.1 L536.5 115.5 L539.1 108.8 L515.1 115.8 L518.8 108.8 L512.6 112.4 L517.2 109.5 L517.5 103.6 L520.8 102.7 L525 95.8 L525.9 86.4 L520.4 79 L514.5 84.7 L512.3 81.4 L503.8 81.2 L505.1 75 L499 73.5 L510.7 64.8 L509.4 54.2 L529.8 43.6 L521.2 45.8 L515.8 42.8 L511.1 44.5 L502.2 55.8 L492.1 57 L491.9 66.4 L487.7 67.7 L480.4 59.9 L474.8 60.2 L475.8 56.3 L472.2 54.5 L475.7 49.3 L475 41.7 L464 39.3 L463.6 33.3 L466.1 31.7 L459.9 26.1 L457.9 28.7 L451.8 26 L446.4 31.8 L440.6 28.1 L435.6 29.1 L437.3 46.5 L441.5 54.7 L439.3 61.9 L419.1 72 L412.7 62.7 L403.8 64.5 L394.9 86.4 L384.3 86.7 L380.3 78.4 L370.5 69.1 L364.4 69.9 L363 67.2 L354.8 66.2 L352.3 72 L353.4 79.1 L358.9 90.7 L358 94.3 L361 96.1 L361 94.3 L364.4 102 L364.8 123.7 L359.9 115.2 L358.5 101.9 L355.3 100.2 L352.2 91.7 L342.7 88.7 L342 75.9 L336.7 77.3 L339 72.3 L335.6 67.6 L330.4 71 L330.7 64.1 L327.2 63.6 L324.5 70.6 L324.1 64.8 L318 68.3 L314 77.8 L304 76.9 L300.2 80.3 L301.7 86.2 L296.7 89.3 L303.8 104.5 L302 112.5 L298.4 114.7 L295.2 110.8 L294.4 113.4 L290.3 113.1 L287.6 100.8 L280.2 96.8 L269.3 72.3 L254.6 75.8 L253.6 83.6 L260.9 109.5 L260.2 122.4 L256.3 128.7 L245.9 130.3 L242.3 120.1 L230 132.3 L227.5 143.9 L231.3 157.2 L229.1 157.7 L224.3 145.9 L222.6 146.6 L223.5 179.2 L217.8 162.8 L218 148.2 L213.5 142.7 L204.8 146.8 L212.6 138.4 L213.2 130.5 L210.2 129.7 L204.6 134.3 L209 127.4 L197.2 124.9 L195.2 114.4 L190.6 111.6 L195.4 111.8 L199.8 119.6 L206.6 120 L211.1 114.9 L205.1 111 L209.6 109.7 L213.6 104.1 L213.6 93.9 L205.8 93.1 L208.8 89.5 L198.6 90.4 L212.1 87 L211.8 84.8 L208.4 82.4 L202.9 84 L201.4 75.8 L198.3 76.2 L198.8 81.4 L195.7 83.6 L197.7 80.3 L192.8 78 L192.4 65.3 L184.4 62 L179.9 63.7 L183.9 58.7 L181.9 55.7 L176.9 57.3 L176.7 53.3 L173.7 57.8 L173.3 54.5 L169.6 56.4 L171.3 47.8 L163.2 42 L161.4 35.2 L158.2 34 L157.8 38.4 L151.6 34 L147.6 39.7 L136.2 33.6 L135.6 37.5 L127.1 37.8 L132.7 43.9 L129.4 47.6 L124.6 45.8 L126.4 49.4 L135.2 52.8 L143.6 44.9 L141.6 51.2 L152 44.9 L147.1 52.4 L153 54 L156.6 48.7 L158.9 51.4 L153.6 55.9 L163.3 55.6 L154.1 58.1 L154 61.4 L144.6 56.4 L134.6 60.2 L141.1 69 L156.4 76.9 L161.9 76 L157.6 82.1 L164.4 95.7 L160.4 103.5 L152.9 109.4 L160.4 99.1 L160.5 93.3 L159.2 97.8 L156.2 87.5 L149.3 105.1 L153.6 87.9 L148.5 79.5 L144.2 80.1 L140.9 97.6 L141.4 85.1 L134.2 95.8 L139.9 81.5 L137.6 89 L136.1 80.3 L129.6 89.5 L134.1 83.5 L132.9 75.2 L126 80.6 L128.6 74 L126.7 70.4 L111.5 63.7 L105.4 69.5 L111.2 70.8 L116.5 76.4 L107.9 70.7 L102.4 73.2 L116.5 87.4 L113.5 86.2 L113.3 82.6 L97.9 77.7 L95.5 84.7 L106.9 96 L125 103.5 L112.6 101.3 L110.5 98.6 L106 99.6 L96.6 94.1 L92.8 98 L100.3 110 L108.6 112.7 L124.8 109.7 L123.5 114.9 L108.6 116.5 L112.5 121.1 L121.4 121.3 L114.3 123.7 L114.9 127.5 L110.2 125.5 L108.3 129.5 L105.3 119.1 L82 107.1 L83.8 119 L97.2 129.9 L89.9 125.3 L83.2 125.4 L92.5 136.6 L96.8 137.5 L92.3 138.9 L89.3 134.4 L81.5 132.5 L72.1 125.2 L69.5 134.8 L61.8 140.6 L78.1 140.7 L86.3 145.5 L84.3 143.7 L89.1 144.2 L88.7 147.2 L87.1 145.7 L88.9 150.4 L99.3 150.3 L103.2 144.8 L115.4 141.4 L114.2 138.8 L123.2 142.3 L126.8 131.2 L126.7 135.7 L133.5 136.3 L136.2 128.1 L137.8 133.9 L141 130.5 L140.5 126.5 L144.2 129.6 L139.6 137 L146.7 141.1 L144.4 126.2 L146.6 128.3 L149.2 125.7 L147 131.2 L150.6 138.5 L151.3 127.2 L153 137 L155.3 135.5 L154.9 124.9 L158 140.4 L161.5 138.4 L160.6 134.8 L163 137.8 L166.7 132.6 L164.5 137.7 L169.4 137.6 L176.2 129.8 L171.2 137.8 L161.9 142.6 L170.2 149.1 L175.4 137.4 L177.6 143.7 L179.9 139.9 L184.1 144.2 L182.1 147.9 L195 145.9 L186.8 150.5 L185 146.7 L183.6 153.1 L182.3 151.8 L172.7 160.6 L163 164.2 L153.9 175.7 L156.8 174 L159.3 175.8 L154.6 178.4 L158.9 180 L161.6 177.2 L167 181.9 L177.1 184.3 L187.1 178.7 L188.8 173.6 L192.2 173.6 L193.8 178.8 L188.1 188.5 L190.7 190.2 L189.1 194 L170.9 193.1 L164.9 189.1 L155.5 190.5 L151.6 193.9 L152.9 199.5 L148.8 192.8 L145.3 194.2 L149.1 190.9 L146.9 191.2 L147.6 188.7 L144.3 190.7 L146.4 187.3 L139.5 192.7 L144.8 192.7 L143.9 194.5 L137.5 198 L132.7 195.8 L130.8 199.7 L134 201.7 L132.8 205 L132.7 201.3 L128.7 199.8 L127.8 205.4 L125.9 202.2 L129.6 195.9 L124.6 195 L123.1 204.7 L119 204.6 L119.1 201.7 L117.4 203.2 L116.9 199.4 L103.8 208.4 L95.2 204.5 L90.6 205.3 L87.2 209.4 L84.6 208.8 L86.1 215.2 L90.6 223.8 L95.9 226.4 L103.2 225.2 L105.7 218.3 L113 219.4 L115.9 215.5 L147.6 221.4 L144.6 218.4 L148.6 217.6 L150 221.6 L161 217 L159.5 222.6 L165.9 223.3 L160.8 233 L165.2 231.6 L162.7 235.9 L159.2 233.8 L164.4 238.2 L163.8 244.8 L167.8 243.4 L169.5 244.9 L167.4 246.5 L170.1 245.9 L169.7 254.3 L169.9 250.9 L171.6 255.1 L174 254.4 L172.8 256 L176.4 254.7 L177.9 248.3 L181.4 248.6 L184.2 245.2 L185.1 247.7 L185.6 244.4 L191.4 242.6 L188.4 246.6 L190.6 247.9 L182.6 250.1 L178.3 262.1 L181.2 265.3 L186.2 263 L186.9 265.4 L181.1 265.6 L175.9 272.8 L184.6 272.9 L197 262.3 L206.4 263 L205.2 265.9 L210.4 264.3 L207.9 267.4 L200.4 265.2 L195.4 267.6 L197.4 269.9 L192.8 269 L184.5 281.2 L193.4 283.9 L190.7 287.3 L194 287.6 L191.1 289.7 L188.4 288 L189.9 292.9 L187.6 293.1 L186.6 289.5 L179.5 288.9 L184.8 295.4 L179.1 294.6 L182.3 299.6 L178.4 302.4 L163.8 305.5 L161.8 310.3 L155.3 309.9 L154.2 303.6 L147.8 297.8 L145 310.2 L150.7 313.4 L145.6 319.4 L147.3 329.1 L160.6 324.5 L161.5 326.3 L164.2 322.9 L176.5 325.8 L190.9 321.8 L196.5 326.8 L217.4 320.3 L239.5 334 L265 358.3 L287 360.1 L314.7 373.6 L321.6 371.6 L335.3 373.8 L359.1 366.9 L370.1 359 L377.3 344 L384.1 337.5 L399.7 331.7 L431.1 329.3 L448.4 305.9 L463 292 L479.7 282.9 L499.1 281.5 L488.7 280.3 L490.6 274.8 L495.5 276.4 L498.6 274.2 L497.9 280.3 L499.1 275.8 L505.3 275.7 L507.2 278.9 L498.8 281.2 L509.6 280.4 L512.2 271.1 L521.3 260 L528.8 261.9 L518.8 266 L529.3 262.5 L531.3 258.6 L532.3 248.7 L538.7 240.8 L531.8 249.4 L532.7 246.7 L528.3 248.1 L528.2 241.4 L535.7 240.5 L531.3 234.6 L544.1 235.5 L538.7 232.4 L531.1 219.3 L539.4 229.1 L550.7 229.5 L555.4 225.7 L551.3 219.1 L552.6 221.7 L555 218.8 L562.2 218.4 L556.7 214.1 L562.6 215.6 L566.2 211.2 L552.5 203.4 L569.5 205.8 L569.6 202.7 L564.8 202.7 L558.4 195.5 L543.4 192.5 L555.1 191.6 L553.1 187.7 L564.7 197.7 L570.5 197.9 Z';

// Heimaey (Vestmannaeyjar) — smá-eyja úr sömu vinnslu (13 punktar).
const EYJAR_PATH =
  'M259 368.6 L260.8 372.6 L260.2 372.9 L260.2 373.7 L261.4 372.6 L261.2 371.4 L262.7 370.5 L263.3 369.4 L262.7 368.4 L260.6 368.5 L262 367.6 L262.3 368.1 L262.3 367.1 Z';

// Land = meginland + Heimaey í einni path (tveir aðskildir undirferlar).
const LAND_D = ISLAND_PATH + ' ' + EYJAR_PATH;

// — 14 byggða-punktar á réttum stöðum (varpanir raun-hnita bæjanna).
//   tier: 0 = Reykjavík (alltaf sýnileg), 1 = Akureyri, 2 = hinir tólf.
const BAEIR = [
  { nafn: 'reykjavik', x: 186.5, y: 293, r: 6.5, tier: 0 },
  { nafn: 'akureyri', x: 362, y: 126, r: 4.6, tier: 1 },
  { nafn: 'keflavik', x: 153.5, y: 310, r: 3, tier: 2 },
  { nafn: 'akranes', x: 182, y: 269, r: 2.7, tier: 2 },
  { nafn: 'borgarnes', x: 187.5, y: 251.5, r: 2.6, tier: 2 },
  { nafn: 'isafjordur', x: 131, y: 79.5, r: 3, tier: 2 },
  { nafn: 'saudarkrokur', x: 291, y: 116, r: 2.7, tier: 2 },
  { nafn: 'husavik', x: 401, y: 80, r: 2.7, tier: 2 },
  { nafn: 'egilsstadir', x: 536, y: 167, r: 3.2, tier: 2 },
  { nafn: 'neskaupstadur', x: 563, y: 183, r: 2.6, tier: 2 },
  { nafn: 'hofn', x: 495, y: 273.5, r: 2.9, tier: 2 },
  { nafn: 'selfoss', x: 227, y: 313, r: 3, tier: 2 },
  { nafn: 'vik', x: 320, y: 368.5, r: 2.4, tier: 2 },
  { nafn: 'vestmannaeyjar', x: 261, y: 370.5, r: 2.2, tier: 2 },
];

// Skólahús-staðir í birtingarröð (þrep 1 → RVK, 2 → +Akureyri, 3 → +Egilsstaðir).
const SKOLAR = [
  [202, 302],  // við Reykjavík
  [349, 136],  // við Akureyri (vestan fjarðar)
  [523, 178],  // við Egilsstaði (Hérað)
];

// Fiska-hnit í sjónum umhverfis landið, í birtingarröð (þrep 0/1/2/3 → 2/4/7/10).
// [x, y, kvarði, spegla] — kvarði/spegla gefa fasta fjölbreytni (ekkert random).
const FISKAR = [
  [95, 255, 1.05, 0],   // Faxaflói
  [520, 332, 1, 1],     // suðaustur-mið
  [300, 42, 0.9, 0],    // norðan Skagafjarðar
  [105, 172, 0.95, 1],  // Breiðafjörður
  [600, 148, 1.1, 0],   // austan Austfjarða
  [425, 16, 0.85, 1],   // norðan Melrakkasléttu
  [40, 118, 1, 0],      // vestan Vestfjarða
  [300, 390, 1.05, 1],  // sunnan lands
  [545, 60, 0.9, 0],    // Þistilfjarðar-mið
  [170, 352, 0.9, 1],   // suðvestan Reykjaness
];
const FISKAFJOLDI = [2, 4, 7, 10]; // per þrep

// Mistur-opacity per losunar-þrep (0 = ekkert mistur → græn tré í staðinn).
const MISTUR_OP = [0, 0.1, 0.2, 0.32];

// Græn tré á suðurlandi þegar losunar-þrep er 0 (skógrækt/hreint land).
const TRE = [
  [249, 334], [257, 338], [265, 341],           // Fljótshlíð/Þórsmörk-þyrping
  [294, 349], [302, 353],                       // Mýrdalur-þyrping
  [385, 326], [393, 330], [401, 326],           // Öræfi-þyrping
];

// Jöklarnir fjórir + Snæfellsjökull — mjúkir blettir á réttum stöðum.
const JOKLAR = [
  // Vatnajökull (stærstur, SA-hálendið)
  'M394 266 Q390 248 410 244 Q424 233 446 240 Q466 236 473 251 Q483 261 474 273 Q470 288 452 291 Q436 300 420 293 Q401 295 395 281 Q388 274 394 266 Z',
  // Langjökull (ílangur NNA-SSV, vesturhálendið)
  'M247 207 Q257 202 260 212 Q265 224 258 237 Q254 245 246 241 Q239 235 243 222 Q241 211 247 207 Z',
  // Hofsjökull (hringlaga, miðhálendið)
  'M328 207 Q341 209 341 221 Q341 233 328 235 Q315 233 315 221 Q316 209 328 207 Z',
  // Mýrdalsjökull (sunnan til, ofan Víkur)
  'M316 339 Q327 341 329 347 Q329 354 317 355 Q306 354 305 347 Q306 341 316 339 Z',
  // Snæfellsjökull (lítill, á tá Snæfellsness)
  'M95 212.5 Q99.5 214 99 216.5 Q98.5 219.5 95 219.5 Q91.5 219.5 91 216.5 Q90.5 213.5 95 212.5 Z',
];

// Hringvegurinn — 24 raun-vegpunktar (Rvk → Borgarnes → Blönduós → Akureyri →
// Mývatn → Egilsstaðir → Djúpivogur → Höfn → Vík → Selfoss → Rvk), varpaðir.
const HRINGVEGUR =
  'M187.3 293.7 L194.3 288.1 L182.6 251.6 L201.3 221.7 L223.3 180.7 L260.8 125.4 ' +
  'L300.1 135.4 L348.7 129.8 L363.2 123.2 L388.5 123.2 L414.7 127.6 L465.7 157.5 ' +
  'L534.9 167.5 L538.2 207.3 L541.5 233.9 L507.8 273.7 L496.1 277.1 L452.6 300.3 ' +
  'L415.6 304.7 L365.1 329.1 L320.2 369 L263.6 333.5 L227.5 312.5 L218.2 305.9 L187.3 293.7';

// Föst hnit táknmynda (varpanir raun-staða).
const TAKN_HNIT = {
  alver: [548, 197],    // verksmiðja við Reyðarfjörð (Austfirðir)
  gagnaver: [263, 137], // server-kassi við Blönduós
  esb: [166, 316],      // ESB-fáni suðvestanlands (við Reykjavík)
  sjodur: [325, 244],   // gull-kista á miðhálendinu (sunnan Hofsjökuls)
  hoft: [206, 320],     // lás suðvestanlands
};

// — NÆTURLJÓSA-VÍDDIN (threp.ljos 0-3): byggða-glóðin hefur TVÆR AÐSKILDAR víddir:
//   · byggd ræður ÁFRAM stærð og fjölda punktanna (jöfnuður/dreifing byggðar),
//   · ljos ræður AÐEINS birtu og hita ljósanna (hagsveiflan).
//   [kjarna-litur, RVK-kjarna-litur, opacity-stuðull, glóðar-gradient-viðskeyti, glóðar-op-stuðull]
const LJOS_STILL = [
  ['#8fa3c4', '#b9c8de', 0.55, '-baer-kalt', 0.5],  // 0: kreppa-dimma — daufir kaldir punktar
  [GULL, '#ffe9b8', 1, '-baer', 1],                 // 1: hlutlaust (óbreytt grunn-útlit)
  ['#ffc25c', '#fff1cd', 1, '-baer-hlytt', 1.15],   // 2: hlýrri gull-glóð
  ['#ffd27f', '#fff7e0', 1, '-baer-hlytt', 1.35],   // 3: björt hlý halo + úthverfa-ljós
];

// Úthverfa-punktar kringum Reykjavík og Akureyri — kvikna aðeins í góðæris-glóð (ljos=3).
const UTHVERFI = [
  [180, 300], [192, 288], [195, 297],  // kringum Reykjavík (Hafnarfj./Mosó/Árbær-átt)
  [357, 133], [366, 131],              // kringum Akureyri (beggja vegna fjarðar)
];

function klemma03(v, sjalfgefid) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : sjalfgefid;
  return Math.max(0, Math.min(3, n));
}

// — Smátákn sem hrein strengja-föll — samræmdur stíll: INK-útlínur ~1.2-1.4,
//   flatar fyllingar úr litaspjaldinu, fastar stærðir. ——————————————————

/** Skólahús: dökkur bolur með INK-útlínu, gult þak, hurð og lítill gull-fáni. */
function skoli(x, y) {
  return `<g transform="translate(${x} ${y})">` +
    `<rect x="-7" y="-0.5" width="14" height="9.5" rx="0.8" fill="${LAND}" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M-9 0 L0 -7.5 L9 0 Z" fill="${GULL}" stroke="${SJOR}" stroke-width="0.7" stroke-linejoin="round"/>` +
    `<rect x="-1.1" y="-13.5" width="2.2" height="6.5" fill="${INK}"/>` +
    `<path d="M1.1 -13.5 L6.5 -11.8 L1.1 -10.1 Z" fill="${GULL}"/>` +
    `<rect x="-1.6" y="3.4" width="3.2" height="5.6" rx="0.6" fill="${DEMPAD}"/>` +
    `<rect x="-5.4" y="2.6" width="2.2" height="2.2" fill="${DEMPAD}"/>` +
    `<rect x="3.2" y="2.6" width="2.2" height="2.2" fill="${DEMPAD}"/>` +
    `</g>`;
}

/** Fiskur: boginn búkur, klofinn sporður og auga; kvarði og speglun úr gögnum. */
function fiskur([x, y, s, spegla]) {
  const sx = spegla ? -s : s;
  return `<g class="kt-fisk" transform="translate(${x} ${y}) scale(${sx} ${s})" opacity="0.6">` +
    `<path d="M-7 0 Q0 -4.6 6 0 Q0 4.6 -7 0 Z" fill="${INK}"/>` +
    `<path d="M6 0 L10.5 -3.4 L9.2 0 L10.5 3.4 Z" fill="${INK}"/>` +
    `<circle cx="-3.6" cy="-0.9" r="0.7" fill="${SJOR}"/>` +
    `</g>`;
}

/** Grænt tré: stofn + tvöföld þríhyrnings-króna. */
function tre(x, y) {
  return `<g transform="translate(${x} ${y})">` +
    `<rect x="-1" y="3.5" width="2" height="4.5" fill="${DEMPAD}"/>` +
    `<path d="M-5 4.5 L0 -3.5 L5 4.5 Z" fill="${GRAENT}" opacity="0.85"/>` +
    `<path d="M-3.8 0.5 L0 -7 L3.8 0.5 Z" fill="${GRAENT}"/>` +
    `</g>`;
}

/** Verksmiðjuhús með sagtenntu þaki, strompi og reyk (álver). */
function taknAlver([x, y]) {
  return `<g class="kt-takn kt-takn-alver" transform="translate(${x} ${y})">` +
    `<rect x="-12" y="-8" width="24" height="11" rx="0.8" fill="${DEMPAD}" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M-12 -8 L-12 -15 L-4 -8 L-4 -15 L4 -8 Z" fill="${DEMPAD}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<rect x="6" y="-21" width="4.5" height="13" fill="${DEMPAD}" stroke="${INK}" stroke-width="1.2"/>` +
    `<rect x="-8" y="-4.5" width="4" height="4" fill="${SJOR}" opacity="0.55"/>` +
    `<rect x="-1" y="-4.5" width="4" height="4" fill="${SJOR}" opacity="0.55"/>` +
    `<circle cx="8.5" cy="-25" r="2.4" fill="${INK}" opacity="0.4"/>` +
    `<circle cx="11.5" cy="-29.5" r="3" fill="${INK}" opacity="0.22"/>` +
    `</g>`;
}

/** Server-kassi með raufum og grænni díóðu (gagnaver). */
function taknGagnaver([x, y]) {
  return `<g class="kt-takn kt-takn-gagnaver" transform="translate(${x} ${y})">` +
    `<rect x="-7" y="-10" width="14" height="20" rx="1.5" fill="${LAND}" stroke="${INK}" stroke-width="1.2"/>` +
    `<rect x="-4.5" y="-6.5" width="9" height="2" rx="0.6" fill="${DEMPAD}"/>` +
    `<rect x="-4.5" y="-1" width="9" height="2" rx="0.6" fill="${DEMPAD}"/>` +
    `<rect x="-4.5" y="4.5" width="9" height="2" rx="0.6" fill="${DEMPAD}"/>` +
    `<circle cx="4" cy="-8" r="1.3" fill="${GRAENT}"/>` +
    `</g>`;
}

/** Lítill ESB-fáni: blár dúkur með hring úr 8 gulum punktum, á stöng. */
function taknEsb([x, y]) {
  let punktar = '';
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const px = (Math.cos(a) * 3.4).toFixed(2);
    const py = (Math.sin(a) * 3.4).toFixed(2);
    punktar += `<circle cx="${px}" cy="${py}" r="0.8" fill="${GULL}"/>`;
  }
  return `<g class="kt-takn kt-takn-esb" transform="translate(${x} ${y})">` +
    `<rect x="-0.7" y="-16" width="1.4" height="18" rx="0.7" fill="${INK}"/>` +
    `<g transform="translate(8 -11)">` +
    `<rect x="-7.5" y="-5" width="15" height="10" rx="0.8" fill="#274690" stroke="${INK}" stroke-width="0.8"/>` +
    punktar +
    `</g></g>`;
}

/** Gull-kista: bolur, bogadregið lok, gjörð og dökk skrá (þjóðarsjóður). */
function taknSjodur([x, y]) {
  return `<g class="kt-takn kt-takn-sjodur" transform="translate(${x} ${y})">` +
    `<rect x="-9" y="-4" width="18" height="10" rx="1" fill="${GULL}" stroke="${SJOR}" stroke-width="0.9"/>` +
    `<path d="M-9 -4 Q0 -12 9 -4 Z" fill="${GULL}" stroke="${SJOR}" stroke-width="0.9"/>` +
    `<rect x="-9" y="-4.6" width="18" height="1.6" fill="${SJOR}" opacity="0.5"/>` +
    `<rect x="-1.6" y="-2.5" width="3.2" height="4.5" rx="0.8" fill="${SJOR}"/>` +
    `<circle cx="0" cy="-6.8" r="1" fill="#ffe9b8"/>` +
    `</g>`;
}

/** Lás: INK-bogi og gull-bolur með skráargati (gjaldeyrishöft). */
function taknHoft([x, y]) {
  return `<g class="kt-takn kt-takn-hoft" transform="translate(${x} ${y})">` +
    `<path d="M-4 -3 a4 4 0 0 1 8 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<rect x="-6" y="-3" width="12" height="9.5" rx="1.5" fill="${GULL}" stroke="${SJOR}" stroke-width="0.8"/>` +
    `<circle cx="0" cy="0.8" r="1.5" fill="${SJOR}"/>` +
    `<rect x="-0.7" y="1.2" width="1.4" height="2.6" rx="0.6" fill="${SJOR}"/>` +
    `</g>`;
}

const TAKN_TEIKNARAR = {
  alver: taknAlver,
  gagnaver: taknGagnaver,
  esb: taknEsb,
  sjodur: taknSjodur,
  hoft: taknHoft,
};

// — Lögin ————————————————————————————————————————————————————————

/** Byggða-lag: punktar með radial-glóð. TVÆR AÐSKILDAR víddir (sjá LJOS_STILL):
 *  byggð-ÞREPIÐ ræður stærð og fjölda punktanna (jöfnuður), NÆTURLJÓSIN (lj 0-3)
 *  ræða birtu og hita — ljos=0 daufir kaldir punktar (kreppan slökkti á landinu),
 *  1 hlutlaust, 2 hlýrri gull-glóð, 3 björt hlý halo + úthverfa-ljós við RVK/Akureyri. */
function lagByggd(th, p, lj) {
  // Stillingar per byggða-þrep: [radíus-stuðull, kjarna-opacity, glóðar-stuðull, glóðar-opacity]
  const still = [
    [0.8, 0.5, 0, 0],       // 0: aðeins RVK, dauf, engin glóð
    [0.9, 0.68, 2.6, 0.5],  // 1: allir bæir, daufir, lítil glóð
    [1, 0.88, 3.2, 0.75],   // 2: allir, bjartari, meiri glóð
    [1.12, 1, 4.2, 1],      // 3: allir bjartir, full glóð + geislabaugur
  ][th];
  const [rk, op, gm, gop] = still;
  const [kjarni, ljosKjarni, opStudull, glodVidskeyti, glodStudull] = LJOS_STILL[lj];
  const kjOp = Math.min(1, op * opStudull).toFixed(2);
  const glOp = Math.min(1, gop * glodStudull).toFixed(2);
  let inni = '';
  for (const b of BAEIR) {
    if (th === 0 && b.tier > 0) continue; // byggða-þrep 0 → aðeins Reykjavík
    const r = (b.r * rk).toFixed(2);
    if (lj === 3) { // björt hlý halo utan um hvert ljós (birtu-vídd, óháð byggða-glóðinni)
      inni += `<circle cx="${b.x}" cy="${b.y}" r="${(b.r * 5).toFixed(2)}" fill="url(#${p}-baer-hlytt)" opacity="0.55"/>`;
    }
    if (gm > 0) {
      inni += `<circle cx="${b.x}" cy="${b.y}" r="${(b.r * gm).toFixed(2)}" fill="url(#${p}${glodVidskeyti})" opacity="${glOp}"/>`;
    }
    if (th === 3) { // geislabaugur: mjór ytri hringur (fylgir byggða-þrepinu)
      inni += `<circle cx="${b.x}" cy="${b.y}" r="${(b.r * rk * 1.9).toFixed(2)}" fill="none" stroke="${kjarni}" stroke-width="0.7" opacity="0.35"/>`;
    }
    inni += `<circle cx="${b.x}" cy="${b.y}" r="${r}" fill="${kjarni}" opacity="${kjOp}"/>`;
    if (b.tier === 0) { // Reykjavík fær ljósan kjarna
      inni += `<circle cx="${b.x}" cy="${b.y}" r="${(b.r * rk * 0.42).toFixed(2)}" fill="${ljosKjarni}" opacity="${kjOp}"/>`;
    }
  }
  if (lj === 3) { // örfá auka-ljós í úthverfum RVK/Akureyrar — aðeins í góðæris-glóð
    for (const [x, y] of UTHVERFI) {
      inni += `<circle cx="${x}" cy="${y}" r="1.3" fill="${kjarni}" opacity="0.8"/>`;
    }
  }
  return `<g class="kt-lag kt-byggd" data-throp="${th}" data-ljos="${lj}">${inni}</g>`;
}

/** Menntunar-lag: 0-3 skólahús við RVK/Akureyri/Egilsstaði. */
function lagMenntun(th) {
  let inni = '';
  for (let i = 0; i < Math.min(th, SKOLAR.length); i++) {
    inni += skoli(SKOLAR[i][0], SKOLAR[i][1]);
  }
  return `<g class="kt-lag kt-menntun" data-throp="${th}">${inni}</g>`;
}

/** Fiski-lag: 2/4/7/10 fiskar í sjónum eftir þrepi (compact: mest 4). */
function lagFiskur(th, compact) {
  const n = Math.min(FISKAFJOLDI[th], compact ? 4 : 10);
  let inni = '';
  for (let i = 0; i < n; i++) inni += fiskur(FISKAR[i]);
  return `<g class="kt-lag kt-fiskur" data-throp="${th}">${inni}</g>`;
}

/** Losunar-lag: mjúkt brúnleitt mistur yfir iðnaðarsvæðum (opacity eftir þrepi);
 *  þrep 0 → græn tré á suðurlandi í staðinn. compact sleppir mistrinu. */
function lagLosun(th, compact, p) {
  let inni = '';
  if (th === 0) {
    for (const [x, y] of TRE) inni += tre(x, y);
  } else if (!compact) {
    const op = MISTUR_OP[th];
    inni += `<g filter="url(#${p}-blur)" fill="#a38f74" opacity="${op}">` +
      `<ellipse cx="183" cy="290" rx="64" ry="34"/>` +   // suðvesturhornið (höfuðborgarsvæðið+Grundartangi)
      `<ellipse cx="548" cy="197" rx="44" ry="28"/>` +   // Austfirðir (stóriðja)
      (th === 3 ? `<ellipse cx="365" cy="128" rx="36" ry="20"/>` : '') + // Eyjafjörður við hæsta þrep
      `</g>`;
  }
  return `<g class="kt-lag kt-losun" data-throp="${th}">${inni}</g>`;
}

/** Tákn-lag: föst tákn á föstum hnitum, aðeins þau sem eru í listanum. */
function lagTakn(taknmyndir) {
  let ut = '';
  for (const nafn of taknmyndir) {
    const teikna = TAKN_TEIKNARAR[nafn];
    if (teikna) ut += teikna(TAKN_HNIT[nafn]);
  }
  return ut;
}

// — Atviks-lagið ————————————————————————————————————————————————————
// Eitt sjónrænt lag per líðandi atvik (threp.atvik frá kort-throp.mjs). Öll hnit
// eru fastar tölur (deterministic), engin <text>-element, engir handlerar; defs-
// tilvísanir nota idPrefix. compact:true → aðeins AÐAL-FORMIÐ (engir auka-neistar,
// vind-strik, geislar eða auka-hringir).

/** Eldgos: rauðglóandi sprunga á Reykjanesskaga + öskumökkur + 4 neista-punktar. */
function atvikEldgos(p, compact) {
  const SPRUNGA = 'M148 318 L155 314 L161 317 L168 313 L175 316';
  const sprunga =
    `<path d="${SPRUNGA}" fill="none" stroke="#ff5a36" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${compact ? '' : ` filter="url(#${p}-glow)"`}/>` +
    `<path d="${SPRUNGA}" fill="none" stroke="#ffd0a0" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (compact) return sprunga;
  return sprunga +
    `<ellipse cx="162" cy="296" rx="14" ry="8" fill="#6b6474" opacity="0.5"/>` +
    `<ellipse cx="170" cy="285" rx="9" ry="5.5" fill="#6b6474" opacity="0.32"/>` +
    `<circle cx="152" cy="309" r="1.1" fill="#ffb36b"/>` +
    `<circle cx="158" cy="306" r="0.9" fill="#ff8a4d"/>` +
    `<circle cx="165" cy="308" r="1.2" fill="#ffcf78"/>` +
    `<circle cx="171" cy="305" r="0.7" fill="#ffb36b"/>`;
}

/** Tsunami: hvít-blá storm-slæða yfir norðurströndina + 3 vind-strik. */
function atvikTsunami(p, compact) {
  const slaeda =
    `<path d="M120 30 Q250 8 370 24 Q480 38 600 22 L600 58 Q470 74 350 58 Q230 44 120 62 Z" fill="#bcd9f2" opacity="0.26"/>`;
  if (compact) return slaeda;
  return slaeda +
    `<g fill="none" stroke="#dfeefb" stroke-width="1.4" stroke-linecap="round" opacity="0.7">` +
    `<path d="M170 46 Q210 38 250 46 Q290 54 330 46"/>` +
    `<path d="M320 32 Q360 24 400 32 Q440 40 480 32"/>` +
    `<path d="M430 54 Q470 46 510 54 Q550 62 590 54"/>` +
    `</g>`;
}

/** Verkfall: kröfuspjöld (rect á priki) við Reykjavík — 3 í fullri útgáfu, 1 í compact. */
function atvikVerkfall(p, compact) {
  const spjald = (x, y, halli) => `<g transform="translate(${x} ${y}) rotate(${halli})">` +
    `<rect x="-0.7" y="-4" width="1.4" height="12" rx="0.7" fill="${DEMPAD}"/>` +
    `<rect x="-6" y="-12" width="12" height="8" rx="1" fill="${INK}" stroke="${SJOR}" stroke-width="0.8"/>` +
    `<rect x="-4" y="-10" width="8" height="1.2" fill="${DEMPAD}"/>` +
    `<rect x="-4" y="-7.6" width="5.5" height="1.2" fill="${DEMPAD}"/>` +
    `</g>`;
  if (compact) return spjald(206, 292, 0);
  return spjald(198, 297, -8) + spjald(206, 292, 0) + spjald(214, 297, 7);
}

// Makríl-torfan: föst hnit í sjónum SA/A af landinu — [x, y, kvarði, spegla].
const MAKRILL_TORFA = [
  [560, 318, 0.8, 0], [574, 308, 0.9, 1], [588, 318, 0.85, 0],
  [568, 330, 0.75, 1], [583, 296, 0.8, 0], [598, 308, 0.9, 1],
  [552, 302, 0.7, 0], [594, 330, 0.75, 0], [608, 320, 0.8, 1],
];

/** Makríll: þétt auka-torfa af SILFRUÐUM fiskum SA/A — greinileg viðbót við
 *  venjulegu INK-fiskana (bjartari fylling, hærri opacity). compact: 4 fiskar. */
function atvikMakrill(p, compact) {
  const n = compact ? 4 : MAKRILL_TORFA.length;
  let ut = '';
  for (let i = 0; i < n; i++) {
    const [x, y, s, spegla] = MAKRILL_TORFA[i];
    const sx = spegla ? -s : s;
    ut += `<g transform="translate(${x} ${y}) scale(${sx} ${s})" opacity="0.9">` +
      `<path d="M-7 0 Q0 -4.6 6 0 Q0 4.6 -7 0 Z" fill="#e6edf7"/>` +
      `<path d="M6 0 L10.5 -3.4 L9.2 0 L10.5 3.4 Z" fill="#e6edf7"/>` +
      `<circle cx="-3.6" cy="-0.9" r="0.7" fill="${SJOR}"/>` +
      `</g>`;
  }
  return ut;
}

/** Nýsköpun: gull-stjörnublossi yfir Reykjavík (+ geislar og glit í fullri útgáfu). */
function atvikNyskopun(p, compact) {
  const stjarna =
    `<path d="M0 -10 L2.2 -2.8 L9.5 -2.8 L3.6 1.6 L5.9 8.6 L0 4.2 L-5.9 8.6 L-3.6 1.6 L-9.5 -2.8 L-2.2 -2.8 Z" fill="${GULL}" stroke="#ffe9b8" stroke-width="0.6" stroke-linejoin="round"/>`;
  const geislar =
    `<g stroke="${GULL}" stroke-width="1" stroke-linecap="round" opacity="0.6">` +
    `<path d="M0 -13 L0 -17"/><path d="M9 -9 L12 -12"/><path d="M13 0 L17 0"/>` +
    `<path d="M-9 -9 L-12 -12"/><path d="M-13 0 L-17 0"/>` +
    `</g>` +
    `<circle cx="12" cy="7" r="1" fill="#ffe9b8"/><circle cx="-11" cy="8" r="0.8" fill="#ffe9b8"/>`;
  return `<g transform="translate(190 268)">${stjarna}${compact ? '' : geislar}</g>`;
}

/** Spilling: dökkt ský yfir Reykjavík (+ 3 súldar-strik í fullri útgáfu). */
function atvikSpilling(p, compact) {
  const sky =
    `<path d="M172 272 Q170 264 178 262 Q180 254 190 255 Q198 250 205 256 Q214 256 213 265 Q219 270 211 274 Q206 279 197 276 Q188 281 181 276 Q173 278 172 272 Z" fill="#171c26" opacity="0.85" stroke="#0d111a" stroke-width="0.8"/>`;
  if (compact) return sky;
  return sky +
    `<g stroke="#39445c" stroke-width="1" stroke-linecap="round" opacity="0.7">` +
    `<path d="M184 281 L181 287"/><path d="M193 282 L190 288"/><path d="M202 279 L199 285"/>` +
    `</g>`;
}

/** Gagnaver: púls-hringir um gagnavers-punktinn við Blönduós — táknið sjálft
 *  kemur áfram AÐEINS úr taknmyndir (þ.e. ef valið var 'ja'). compact: 1 hringur. */
function atvikGagnaver(p, compact) {
  const [x, y] = TAKN_HNIT.gagnaver;
  let ut = `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${GRAENT}" stroke-width="1.4" opacity="0.55"/>`;
  if (!compact) {
    ut += `<circle cx="${x}" cy="${y}" r="23" fill="none" stroke="${GRAENT}" stroke-width="1" opacity="0.3"/>` +
      `<circle cx="${x}" cy="${y}" r="30" fill="none" stroke="${GRAENT}" stroke-width="0.7" opacity="0.15"/>`;
  }
  return ut;
}

/** Jafnrétti: fíngerður gull-hringbogi yfir landinu miðju (lágstemmt). */
function atvikJafnretti(p, compact) {
  const bogi =
    `<path d="M210 200 Q320 128 440 196" fill="none" stroke="${GULL}" stroke-width="1.6" opacity="0.35" stroke-linecap="round"/>`;
  if (compact) return bogi;
  return bogi +
    `<path d="M222 208 Q320 146 428 204" fill="none" stroke="#ffe9b8" stroke-width="0.9" opacity="0.22" stroke-linecap="round"/>`;
}

const ATVIK_TEIKNARAR = {
  eldgos: atvikEldgos,
  tsunami: atvikTsunami,
  verkfall: atvikVerkfall,
  makrill: atvikMakrill,
  nyskopun: atvikNyskopun,
  spilling: atvikSpilling,
  gagnaver: atvikGagnaver,
  jafnretti: atvikJafnretti,
};

/** Atviks-lag: <g class="kt-atvik kt-atvik-<id>"> aðeins þegar atvik er þekkt id. */
function lagAtvik(atvik, p, compact) {
  if (typeof atvik !== 'string' || !Object.hasOwn(ATVIK_TEIKNARAR, atvik)) return '';
  return `<g class="kt-atvik kt-atvik-${atvik}">${ATVIK_TEIKNARAR[atvik](p, compact)}</g>`;
}

// — Fastir grunn-hlutar ——————————————————————————————————————————

/** Defs: öll id fá prefix p og eru þrep-óháð (tvö kort á síðu deila skaðlaust). */
function defs(p, compact) {
  let d = `<defs>` +
    // Sjór: djúpblár radial — ljósari um miðbik, dekkri við jaðra.
    `<radialGradient id="${p}-sjor" cx="0.5" cy="0.47" r="0.85">` +
    `<stop offset="0" stop-color="#1a2438"/><stop offset="0.55" stop-color="#131c2c"/><stop offset="1" stop-color="#0c1220"/>` +
    `</radialGradient>` +
    // Land: örlítill hálendisblær — ljósara um miðjuna.
    `<radialGradient id="${p}-land" cx="0.47" cy="0.5" r="0.75">` +
    `<stop offset="0" stop-color="#333f5e"/><stop offset="0.55" stop-color="#2a344c"/><stop offset="1" stop-color="#232c3e"/>` +
    `</radialGradient>` +
    // Jöklar: hvít/ljósblá glóð sem fjarar út.
    `<radialGradient id="${p}-jokull" cx="0.5" cy="0.45" r="0.72">` +
    `<stop offset="0" stop-color="#eef5fc" stop-opacity="0.9"/><stop offset="0.6" stop-color="#d5e4f3" stop-opacity="0.7"/><stop offset="1" stop-color="#d5e4f3" stop-opacity="0"/>` +
    `</radialGradient>` +
    // Byggða-glóð: gull sem fjarar út.
    `<radialGradient id="${p}-baer">` +
    `<stop offset="0" stop-color="${GULL}" stop-opacity="0.5"/><stop offset="0.5" stop-color="${GULL}" stop-opacity="0.18"/><stop offset="1" stop-color="${GULL}" stop-opacity="0"/>` +
    `</radialGradient>` +
    // Næturljósa-afbrigði byggða-glóðarinnar (alltaf skilgreind — defs haldast þrep-óháð):
    // kalt (ljos=0, kreppa-dimma) og hlýtt (ljos>=2, góðæris-glóð).
    `<radialGradient id="${p}-baer-kalt">` +
    `<stop offset="0" stop-color="#9fb3d4" stop-opacity="0.35"/><stop offset="0.5" stop-color="#9fb3d4" stop-opacity="0.1"/><stop offset="1" stop-color="#9fb3d4" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<radialGradient id="${p}-baer-hlytt">` +
    `<stop offset="0" stop-color="#ffcf78" stop-opacity="0.6"/><stop offset="0.5" stop-color="#ffb54d" stop-opacity="0.22"/><stop offset="1" stop-color="#ffb54d" stop-opacity="0"/>` +
    `</radialGradient>`;
  if (!compact) {
    d +=
      // Norðurljós: græn slæða sem fjarar út niður á við.
      `<linearGradient id="${p}-nordur" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#6ff5bd" stop-opacity="0.1"/><stop offset="0.5" stop-color="#58e8c0" stop-opacity="0.045"/><stop offset="1" stop-color="#58e8c0" stop-opacity="0"/>` +
      `</linearGradient>` +
      // Strandlínu-glow og mistur-blur.
      `<filter id="${p}-glow" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
      `<filter id="${p}-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="10"/></filter>`;
  }
  return d + `</defs>`;
}

/** Sjórinn: gradient-flötur + örfínir dýptar-baugar (sleppt í compact). */
function sjor(p, compact) {
  let ut = `<rect x="0" y="0" width="640" height="400" fill="url(#${p}-sjor)"/>`;
  if (!compact) {
    ut += `<g fill="none" stroke="${INK}" opacity="0.05" stroke-linecap="round">` +
      `<ellipse cx="320" cy="202" rx="296" ry="188" stroke-width="1" stroke-dasharray="0.5 9"/>` +
      `<ellipse cx="320" cy="202" rx="336" ry="222" stroke-width="1" stroke-dasharray="0.5 12"/>` +
      `</g>` +
      // Norðurljós: mjög lágstemmd græn slæða efst í sjónum (fasti, óháð þrepum).
      `<path class="kt-nordurljos" d="M0 0 H640 V50 Q560 24 470 42 Q360 64 250 44 Q130 22 0 52 Z" fill="url(#${p}-nordur)"/>`;
  }
  return ut;
}

/** Landið: mjúkt út-glow undir tvöfaldri strandlínu + gradient-flötur. */
function land(p, compact) {
  const glow = compact
    ? `<path d="${LAND_D}" fill="none" stroke="#8fc7e8" stroke-width="2.6" opacity="0.18" stroke-linejoin="round"/>`
    : `<path d="${LAND_D}" fill="none" stroke="#8fc7e8" stroke-width="4.2" opacity="0.3" stroke-linejoin="round" filter="url(#${p}-glow)"/>`;
  return glow +
    `<path class="kt-land" d="${LAND_D}" fill="url(#${p}-land)" stroke="#b9c8de" stroke-width="1.1" stroke-linejoin="round"/>`;
}

/** Hringvegurinn: örfín strikalína sem hringar landið (dekóratíft). */
function hringvegur() {
  return `<path class="kt-hringvegur" d="${HRINGVEGUR}" fill="none" stroke="${INK}" stroke-width="0.9" ` +
    `opacity="0.14" stroke-dasharray="3 4" stroke-linejoin="round" stroke-linecap="round"/>`;
}

/** Jöklarnir: mjúkir hvítir/ljósbláir blettir með daufri útlínu. */
function joklar(p) {
  let inni = '';
  for (const d of JOKLAR) {
    inni += `<path d="${d}" fill="url(#${p}-jokull)" stroke="#e3eefa" stroke-width="0.5" stroke-opacity="0.3"/>`;
  }
  return `<g class="kt-joklar">${inni}</g>`;
}

// — Aðalfall ———————————————————————————————————————————————————————

/**
 * renderIslandKort — skilar Íslandskortinu sem SVG-streng.
 *
 * @param {{ byggd?: number, menntun?: number, fiskur?: number, losun?: number, ljos?: number,
 *           atvik?: string|null, taknmyndir?: string[] }} threp
 *        Þrep-hlutur frá kortThrep() í kort-throp.mjs. Vantandi/ógild þrep fá sjálfgefin gildi
 *        (byggd 1, menntun 1, fiskur 1, losun 2, ljos 1 = hlutlaus birta, atvik null).
 * @param {{ compact?: boolean, idPrefix?: string }} [opts]
 *        compact:true → farsíma-útgáfa (mest 4 fiskar, ekkert mistur, engin norðurljós,
 *        einfaldara glow, atviks-lagið aðeins aðal-formið).
 *        idPrefix → forskeyti á öll defs-id (sjálfgefið 'kt'); id-in eru þrep-óháð.
 * @returns {string} SVG-strengur, viewBox="0 0 640 400". Engin <text>-element, engir event-handlerar.
 */
export function renderIslandKort(threp = {}, { compact = false, idPrefix = 'kt' } = {}) {
  const t = threp || {};
  const byggd = klemma03(t.byggd, 1);
  const menntun = klemma03(t.menntun, 1);
  const fisk = klemma03(t.fiskur, 1);
  const losun = klemma03(t.losun, 2);
  const ljos = klemma03(t.ljos, 1);
  const taknmyndir = Array.isArray(t.taknmyndir) ? t.taknmyndir : [];
  const p = String(idPrefix || 'kt').replace(/[^A-Za-z0-9_-]/g, '') || 'kt';

  return `<svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" class="kt-kort" role="img" aria-label="Lifandi Íslandskort — staða landsins">` +
    defs(p, compact) +
    // Sjórinn (gradient + dýptar-baugar + norðurljós)
    sjor(p, compact) +
    // Fiskar synda í sjónum undir landinu
    lagFiskur(fisk, compact) +
    // Landið: glow + nákvæm strandlína + hálendisblær
    land(p, compact) +
    // Hringvegurinn (undir jöklum svo hann skeri þá ekki)
    hringvegur() +
    // Jöklarnir fimm
    joklar(p) +
    // Lög ofan á landinu
    lagByggd(byggd, p, ljos) +
    lagMenntun(menntun) +
    lagTakn(taknmyndir) +
    // Mistur/tré efst (hálfgagnsætt yfir öllu)
    lagLosun(losun, compact, p) +
    // Atviks-lagið efst (dramatíkin sést yfir öllu öðru)
    lagAtvik(t.atvik, p, compact) +
    `</svg>`;
}
