// kort-svg.mjs — teiknar Lifandi Íslandskortið (hönnunarskjal kafli E) sem SVG-streng.
//
// Hrein strengja-eining: ekkert DOM, engir event-handlerar, engin <text>-element.
// Inntakið er þrep-hluturinn frá kort-throp.mjs: { byggd, menntun, fiskur, losun, taknmyndir }.
//
// Litaspjald (sama og annars staðar í leiknum):
//   gull #f6b13b · ljós-ink #cdd6e6 · dempað #5d6b85 · grænt #42d086 · rautt #e78284
//   sjór #131a28 · land #232c3e · útlína #5d6b85

const GULL = '#f6b13b';
const INK = '#cdd6e6';
const DEMPAD = '#5d6b85';
const GRAENT = '#42d086';
const SJOR = '#131a28';
const LAND = '#232c3e';

// — Strandlína Íslands, EIN lokuð path, réttsælis frá Reykjanestá.
//   Hnitakerfi: viewBox 0 0 640 400, landið spannar ~19-625 × ~20-368 (~640×360 hlutföll).
//   Kennileiti í röð: Reykjanesskagi (sv-tota) → Faxaflói m/Hvalfirði → Borgarfjörður →
//   Snæfellsnes (löng v-tota) → Breiðafjörður/Hvammsfjörður → Gilsfjörður (mjói hálsinn) →
//   Látrabjarg → Vestfirðir (tenntir firðir + Ísafjarðardjúp sem djúp rifa) → Hornstrandir →
//   Strandir → Hrútafjörður → Vatnsnes → Skagi → Skagafjörður → Tröllaskagi → Eyjafjörður →
//   Tjörnes → Melrakkaslétta (ne-horn) → Langanes (mjó tota) → Vopnafjörður → Héraðsflói →
//   Austfirðir (tenntir: Seyðisfj./Norðfj.-Gerpir/Reyðarfj./Breiðdalsvík) → Hornafjörður →
//   suðurströnd slétt bogadregin (sandarnir) → Reykjanes aftur.
const ISLAND_PATH =
  'M119 324 L112 302 L128 291 L160 290 L194 263 L155 266 L173 245 L131 238 ' + // Reykjanes → Faxaflói/Hvalfj. → Borgarfj.
  'L55 216 L42 206 L62 196 L120 183 L162 187 L140 168 ' +                       // Snæfellsnes → Breiðafjörður
  'L169 148 L138 151 L108 152 L46 149 L19 138 ' +                               // Gilsfjörður (háls) → Látrabjarg
  'L29 117 L58 104 L34 88 L64 66 L47 45 ' +                                     // vesturfirðir (tennur)
  'L106 87 L121 76 L77 35 L111 25 L133 33 ' +                                   // Ísafjarðardjúp (rifa) → Hornstrandir
  'L148 57 L187 153 L198 189 L212 160 ' +                                       // Strandir → Hrútafjörður
  'L228 128 L250 121 L263 71 L292 116 L331 59 L371 118 L373 52 ' +              // Vatnsnes → Skagi → Skagafj. → Eyjafj.
  'L428 57 L466 28 L484 20 L506 40 ' +                                          // Tjörnes → Melrakkaslétta
  'L529 57 L568 38 L547 63 L548 98 ' +                                          // Langanes → Bakkaflói/Vopnafj.
  'L592 130 L612 141 ' +                                                        // Héraðsflói → Borgarfj. eystri
  'L593 158 L619 166 L594 176 L625 185 L590 196 L610 214 L589 227 L601 236 ' +  // Austfirðir (4 tennur, Gerpir austast)
  'L583 252 L538 271 ' +                                                        // Lónsvík → Hornafjörður/Höfn
  'Q495 296 455 318 Q380 355 318 368 Q230 335 191 321 L156 322 Z';              // suðurströnd (sandar) → Reykjanes

// — 8 byggða-punktar á u.þ.b. réttum stöðum (sama hnitakerfi og strandlínan).
//   tier: 0 = Reykjavík (alltaf sýnileg), 1 = Akureyri, 2 = hinir sex.
const BAEIR = [
  { nafn: 'reykjavik', x: 166, y: 294, r: 8, tier: 0 },
  { nafn: 'akureyri', x: 366, y: 128, r: 5.5, tier: 1 },
  { nafn: 'egilsstadir', x: 573, y: 160, r: 4, tier: 2 },
  { nafn: 'isafjordur', x: 88, y: 92, r: 4, tier: 2 },
  { nafn: 'selfoss', x: 215, y: 312, r: 4, tier: 2 },
  { nafn: 'akranes', x: 167, y: 254, r: 4, tier: 2 },
  { nafn: 'husavik', x: 417, y: 72, r: 4, tier: 2 },
  { nafn: 'hofn', x: 533, y: 264, r: 4, tier: 2 },
];

// Skólahús-staðir í birtingarröð (þrep 1 → RVK, 2 → +Akureyri, 3 → +Egilsstaðir).
const SKOLAR = [
  [184, 281], // við Reykjavík
  [352, 142], // við Akureyri
  [558, 174], // við Egilsstaði
];

// Fiska-hnit í sjónum umhverfis landið, í birtingarröð (þrep 0/1/2/3 → 2/4/7/10 fiskar).
const FISKAR = [
  [45, 255],  // Faxaflói vestur
  [585, 70],  // norðaustur-mið
  [320, 25],  // norðan Tröllaskaga
  [560, 330], // suðaustur-mið
  [66, 300],  // suðvestur-mið
  [430, 18],  // norðan Tjörness
  [200, 30],  // Húnaflóa-mið
  [350, 388], // sunnan lands
  [630, 120], // austan Langaness
  [148, 368], // suðvestan Reykjaness
];
const FISKAFJOLDI = [2, 4, 7, 10]; // per þrep

// Mistur-opacity per losunar-þrep (0 = ekkert mistur → græn tré í staðinn).
const MISTUR_OP = [0, 0.12, 0.25, 0.4];

// Græn tré á suðurlandi þegar losunar-þrep er 0 (skógrækt/hreint land).
const TRE = [[238, 316], [266, 326], [292, 336], [316, 344]];

// Föst hnit táknmynda.
const TAKN_HNIT = {
  alver: [579, 199],    // verksmiðja við Reyðarfjörð (Austfirðir)
  gagnaver: [256, 136], // server-kassi við Blönduós
  esb: [146, 297],      // ESB-fáni við RVK-höfn
  sjodur: [330, 225],   // gull-kista við miðju landsins
  hoft: [183, 302],     // lás við RVK
};

function klemma03(v, sjalfgefid) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : sjalfgefid;
  return Math.max(0, Math.min(3, n));
}

// — Smátákn sem hrein strengja-föll ————————————————————————————————

/** Einfalt skólahús: þríhyrnt gult þak + kross-laus turn + hurð. */
function skoli(x, y) {
  return `<g transform="translate(${x} ${y})">` +
    `<rect x="-1.6" y="-13" width="3.2" height="6.5" fill="${INK}"/>` +
    `<rect x="-7" y="0" width="14" height="9" fill="${LAND}" stroke="${INK}" stroke-width="1.1"/>` +
    `<path d="M-9 0 L0 -7.5 L9 0 Z" fill="${GULL}"/>` +
    `<rect x="-1.5" y="3.6" width="3" height="5.4" fill="${DEMPAD}"/>` +
    `</g>`;
}

/** Einfaldaður fiskur: linsulaga búkur + þríhyrndur sporður. */
function fiskur(x, y) {
  return `<path d="M${x} ${y} q6 -4.5 12 0 q-6 4.5 -12 0 Z m12 0 l5.5 -4 l0 8 Z" ` +
    `fill="${INK}" opacity="0.55"/>`;
}

/** Grænt tré: stofn + tvöföld þríhyrnings-króna. */
function tre(x, y) {
  return `<g transform="translate(${x} ${y})">` +
    `<rect x="-1.2" y="4" width="2.4" height="5" fill="${DEMPAD}"/>` +
    `<path d="M-6 5 L0 -4 L6 5 Z" fill="${GRAENT}" opacity="0.9"/>` +
    `<path d="M-4.5 0 L0 -8 L4.5 0 Z" fill="${GRAENT}"/>` +
    `</g>`;
}

/** Verksmiðjuhús með sagtenntu þaki, strompi og reyk (álver). */
function taknAlver([x, y]) {
  return `<g class="kt-takn kt-takn-alver" transform="translate(${x} ${y})">` +
    `<rect x="-12" y="-8" width="24" height="11" fill="${DEMPAD}"/>` +
    `<path d="M-12 -8 L-12 -15 L-4 -8 L-4 -15 L4 -8 Z" fill="${DEMPAD}"/>` +
    `<rect x="6" y="-21" width="4.5" height="13" fill="${DEMPAD}"/>` +
    `<circle cx="8.5" cy="-25" r="2.4" fill="${INK}" opacity="0.4"/>` +
    `<circle cx="11.5" cy="-29" r="3" fill="${INK}" opacity="0.25"/>` +
    `</g>`;
}

/** Server-kassi með raufum og grænni díóðu (gagnaver). */
function taknGagnaver([x, y]) {
  return `<g class="kt-takn kt-takn-gagnaver" transform="translate(${x} ${y})">` +
    `<rect x="-7" y="-10" width="14" height="20" rx="1.5" fill="${LAND}" stroke="${INK}" stroke-width="1.2"/>` +
    `<rect x="-4.5" y="-6.5" width="9" height="2" fill="${DEMPAD}"/>` +
    `<rect x="-4.5" y="-1" width="9" height="2" fill="${DEMPAD}"/>` +
    `<rect x="-4.5" y="4.5" width="9" height="2" fill="${DEMPAD}"/>` +
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
    `<rect x="-0.7" y="-16" width="1.4" height="18" fill="${INK}"/>` +
    `<g transform="translate(8 -11)">` +
    `<rect x="-7.5" y="-5" width="15" height="10" fill="#274690" stroke="${DEMPAD}" stroke-width="0.6"/>` +
    punktar +
    `</g></g>`;
}

/** Gull-kista: bolur, bogadregið lok og dökk skrá (þjóðarsjóður). */
function taknSjodur([x, y]) {
  return `<g class="kt-takn kt-takn-sjodur" transform="translate(${x} ${y})">` +
    `<rect x="-9" y="-4" width="18" height="10" rx="1" fill="${GULL}"/>` +
    `<path d="M-9 -4 Q0 -12 9 -4 Z" fill="${GULL}" stroke="${SJOR}" stroke-width="0.8"/>` +
    `<rect x="-9" y="-4.6" width="18" height="1.4" fill="${SJOR}" opacity="0.55"/>` +
    `<rect x="-1.6" y="-2.5" width="3.2" height="4.5" rx="0.8" fill="${SJOR}"/>` +
    `</g>`;
}

/** Lás: gull-bolur með ljósum boga og skráargati (gjaldeyrishöft). */
function taknHoft([x, y]) {
  return `<g class="kt-takn kt-takn-hoft" transform="translate(${x} ${y})">` +
    `<path d="M-4 -3 a4 4 0 0 1 8 0" fill="none" stroke="${INK}" stroke-width="1.8"/>` +
    `<rect x="-6" y="-3" width="12" height="9.5" rx="1.5" fill="${GULL}"/>` +
    `<circle cx="0" cy="1.2" r="1.5" fill="${SJOR}"/>` +
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

/** Byggða-lag: gull-hringir; radíus og glow vaxa með þrepinu. */
function lagByggd(th) {
  // Stillingar per þrep: [radíus-stuðull, kjarna-opacity, halo-opacity]
  const still = [
    [0.75, 0.4, 0],     // 0: aðeins RVK, dauf, ekkert halo
    [0.85, 0.55, 0.06], // 1: allir bæir, daufir
    [0.95, 0.8, 0.14],  // 2: allir, bjartari
    [1.1, 1, 0.24],     // 3: allir bjartir með geislabaug
  ][th];
  const [rk, op, halo] = still;
  let inni = '';
  for (const b of BAEIR) {
    if (th === 0 && b.tier > 0) continue; // þrep 0 → aðeins Reykjavík
    const r = (b.r * rk).toFixed(2);
    if (halo > 0) {
      inni += `<circle cx="${b.x}" cy="${b.y}" r="${(b.r * rk * 2.4).toFixed(2)}" fill="${GULL}" opacity="${halo}"/>`;
    }
    if (th === 3) { // geislabaugur: mjór ytri hringur
      inni += `<circle cx="${b.x}" cy="${b.y}" r="${(b.r * rk * 1.8).toFixed(2)}" fill="none" stroke="${GULL}" stroke-width="0.8" opacity="0.35"/>`;
    }
    inni += `<circle cx="${b.x}" cy="${b.y}" r="${r}" fill="${GULL}" opacity="${op}"/>`;
  }
  return `<g class="kt-lag kt-byggd" data-throp="${th}">${inni}</g>`;
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
  for (let i = 0; i < n; i++) inni += fiskur(FISKAR[i][0], FISKAR[i][1]);
  return `<g class="kt-lag kt-fiskur" data-throp="${th}">${inni}</g>`;
}

/** Losunar-lag: grátt mistur yfir sv- og a-hluta (opacity eftir þrepi);
 *  þrep 0 → græn tré á suðurlandi í staðinn. compact sleppir mistrinu. */
function lagLosun(th, compact) {
  let inni = '';
  if (th === 0) {
    for (const [x, y] of TRE) inni += tre(x, y);
  } else if (!compact) {
    const op = MISTUR_OP[th];
    inni += `<g filter="url(#kt-blur)" fill="#aab2c0" opacity="${op}">` +
      `<ellipse cx="175" cy="288" rx="115" ry="58"/>` +  // sv-hluti (höfuðborgarsvæðið)
      `<ellipse cx="585" cy="195" rx="72" ry="55"/>` +   // a-hluti (Austfirðir/stóriðja)
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

// — Aðalfall ———————————————————————————————————————————————————————

/**
 * renderIslandKort — skilar Íslandskortinu sem SVG-streng.
 *
 * @param {{ byggd?: number, menntun?: number, fiskur?: number, losun?: number, taknmyndir?: string[] }} threp
 *        Þrep-hlutur frá kortThrep() í kort-throp.mjs. Vantandi/ógild þrep fá sjálfgefin gildi (1/1/1/2).
 * @param {{ compact?: boolean }} [opts] compact:true → farsíma-útgáfa (mest 4 fiskar, ekkert mistur).
 * @returns {string} SVG-strengur, viewBox="0 0 640 400". Engin <text>-element, engir event-handlerar.
 */
export function renderIslandKort(threp = {}, { compact = false } = {}) {
  const t = threp || {};
  const byggd = klemma03(t.byggd, 1);
  const menntun = klemma03(t.menntun, 1);
  const fisk = klemma03(t.fiskur, 1);
  const losun = klemma03(t.losun, 2);
  const taknmyndir = Array.isArray(t.taknmyndir) ? t.taknmyndir : [];

  return `<svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" class="kt-kort" role="img" aria-label="Lifandi Íslandskort — staða landsins">` +
    `<defs><filter id="kt-blur" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feGaussianBlur stdDeviation="12"/></filter></defs>` +
    // Sjórinn
    `<rect x="0" y="0" width="640" height="400" fill="${SJOR}"/>` +
    // Fiskar synda undir/kringum landið
    lagFiskur(fisk, compact) +
    // Landið: ein útlínu-path
    `<path d="${ISLAND_PATH}" fill="${LAND}" stroke="${DEMPAD}" stroke-width="1.6" stroke-linejoin="round"/>` +
    // Lög ofan á landinu
    lagByggd(byggd) +
    lagMenntun(menntun) +
    lagTakn(taknmyndir) +
    // Mistur/tré efst (hálfgagnsætt yfir öllu)
    lagLosun(losun, compact) +
    `</svg>`;
}
