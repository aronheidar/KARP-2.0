// lobbyvakt.mjs — hrein rökvél Lobbývaktar (engin I/O; einingaprófuð). Sjá spec 2026-07-27.
// Deilt af build_lobbyvakt.mjs (nætur-flokkun), worker.js (/api/lobbyvakt + digest) og /lobbyvakt/ (UI-forfylling).
// item-form: { id, kind:'thingmal'|'samrad', titill, hlekkur, greinar:[], brief, stig, efni:[], frestur:ISO|null, stada, dags:ISO }

// ── Taxonomy (ein uppspretta — ekkert harðkóða greina annars staðar) ───────
export const SECTORS = {
  sjavarutvegur: 'Sjávarútvegur',
  landbunadur: 'Landbúnaður & matvæli',
  ferdathjonusta: 'Ferðaþjónusta',
  bygging: 'Bygging & mannvirki',
  fasteignir: 'Fasteignir & leiga',
  verslun: 'Verslun & þjónusta',
  idnadur: 'Framleiðsla & iðnaður',
  orka: 'Orka & veitur',
  fjarmal: 'Fjármál & tryggingar',
  ut: 'UT & fjarskipti',
  heilbrigdi: 'Heilbrigði & lyf',
  menntun: 'Menntun & rannsóknir',
  flutningar: 'Flutningar & samgöngur',
  fjolmidlar: 'Fjölmiðlar & skapandi',
  umhverfi: 'Umhverfi & úrgangur',
  almennt: 'Þvert á greinar',
};

export const ALL_SECTORS = Object.keys(SECTORS);

// Leitarorð (lágstafir, stofnar) fyrir heuristík-flokkun án ANTHROPIC_API_KEY. classifyHeuristic
// ber lágstafað (titill+' '+lysing) saman við þessa stofna með substring-test (case-insensitive).
export const SECTOR_HINTS = {
  sjavarutvegur: ['fiskveið', 'aflamark', 'veiðigjald', 'fiskeldi', 'kvóti', 'útgerð', 'sjávarútveg'],
  landbunadur: ['landbúnað', 'matvæla', 'sauðfjár', 'nautgripa', 'garðyrkju', 'dýravelferð', 'bænda'],
  ferdathjonusta: ['ferðaþjón', 'ferðamanna', 'gistin', 'áfangastað'],
  bygging: ['byggingar', 'mannvirki', 'skipulag', 'verktak'],
  fasteignir: ['fasteign', 'leigumark', 'leigusamn', 'fjöleignarhús'],
  verslun: ['verslun', 'smásölu', 'netverslun', 'neytendavernd'],
  idnadur: ['iðnað', 'framleiðsl', 'stóriðju', 'álframleiðsl', 'orkufrek'],
  orka: ['orku', 'raforka', 'hitaveit', 'virkjun'],
  fjarmal: ['fjármálafyrirtæk', 'vátrygg', 'banka', 'lífeyri', 'verðbréf'],
  ut: ['fjarskipt', 'upplýsingatækni', 'hugbúnað', 'netörygg', 'farsímaþjónust'],
  heilbrigdi: ['heilbrigð', 'lyf', 'sjúkra', 'lækn'],
  menntun: ['menntun', 'skólastarf', 'háskóla', 'rannsókna', 'nemenda'],
  flutningar: ['samgöng', 'flutninga', 'umferðar', 'hafnarmannvirk', 'flugvallar'],
  fjolmidlar: ['fjölmiðl', 'ritstjórnar', 'útvarps', 'sjónvarps', 'höfundarrétt'],
  umhverfi: ['umhverfis', 'úrgangs', 'loftslags', 'endurvinnslu', 'mengunar'],
  almennt: ['skatt', 'virðisaukaskatt', 'tekjuskatt', 'vinnurétt', 'vinnumarkað', 'félagarétt', 'persónuvernd', 'bókhald', 'ársreikning'],
};

// ── matchItem / filterFeed / newSince ──────────────────────────────────────

// true ef item.greinar skarast við userSectors, EÐA item.greinar inniheldur 'almennt' (þá óháð userSectors).
// Vantar/tómt item.greinar → false (nema almennt-tilfellið, sem er þá líka ófullnægt → false).
export function matchItem(item, userSectors) {
  const greinar = Array.isArray(item && item.greinar) ? item.greinar : [];
  if (greinar.includes('almennt')) return true;
  const sectors = Array.isArray(userSectors) ? userSectors : [];
  return greinar.some((g) => sectors.includes(g));
}

// Nýtt fylki (mutar ekki inntak), síað með matchItem, raðað: virkur (truthy) frestur fyrst
// (næsti frestur efst = hækkandi), svo frestlaus mál eftir dags lækkandi (nýjast efst).
export function filterFeed(items, userSectors) {
  const filtered = (Array.isArray(items) ? items : []).filter((it) => matchItem(it, userSectors));
  const withFrestur = [];
  const without = [];
  for (const it of filtered) {
    if (it && it.frestur) withFrestur.push(it);
    else without.push(it);
  }
  withFrestur.sort((a, b) => Date.parse(a.frestur) - Date.parse(b.frestur));
  without.sort((a, b) => Date.parse(b.dags) - Date.parse(a.dags));
  return [...withFrestur, ...without];
}

// Mál til að tilkynna í digest: dags (Date.parse — því er sinceTs í MILLISEKÚNDUM, ekki unix-sekúndum)
// strangt meira en sinceTs, OG id ekki í seenIds (Set eða plain array, hvort tveggja stutt).
export function newSince(items, sinceTs, seenIds) {
  const seen = seenIds instanceof Set ? seenIds : new Set(Array.isArray(seenIds) ? seenIds : []);
  const since = Number(sinceTs) || 0;
  return (Array.isArray(items) ? items : []).filter((it) => {
    if (!it) return false;
    const t = Date.parse(it.dags);
    if (Number.isNaN(t) || t <= since) return false;
    return !seen.has(it.id);
  });
}

// ── classifyHeuristic ───────────────────────────────────────────────────────
// Öll grein sem á stofn í texta (case-insensitive substring); tómt → ['almennt'] (fail-open svo mál týnist ekki).
export function classifyHeuristic(titill, lysing) {
  const text = `${titill || ''} ${lysing || ''}`.toLowerCase();
  const hits = ALL_SECTORS.filter((code) => (SECTOR_HINTS[code] || []).some((kw) => text.includes(kw)));
  return hits.length ? hits : ['almennt'];
}

// ── stigRank ────────────────────────────────────────────────────────────────
export function stigRank(stig) {
  return { 'Mikil': 3, 'Miðlungs': 2, 'Lítil': 1 }[stig] || 2;
}

// ── isatToSector ──────────────────────────────────────────────────────────
// Gróf ÍSAT(NACE Rev.2)-bálkur → grein. Tekur við bókstaf (t.d. 'F') EÐA tölukóða (t.d. '41', '4120').
// Sértilvik (deild ræður fram yfir bálk): 03 (fiskveiðar, innan A) → sjavarutvegur; 10-11 (matvæli, innan C)
// → landbunadur; 58-60 (útgáfa/mynd/útvarp, innan J) → fjolmidlar. M/N/O/S/T/U eru ekki í taxonomy → null.
const LETTER_SECTOR = {
  A: 'landbunadur', B: 'idnadur', C: 'idnadur', D: 'orka', E: 'umhverfi',
  F: 'bygging', G: 'verslun', H: 'flutningar', I: 'ferdathjonusta', J: 'ut',
  K: 'fjarmal', L: 'fasteignir', P: 'menntun', Q: 'heilbrigdi', R: 'fjolmidlar',
};

function sectorFromDivision(n) {
  if (n === 3) return 'sjavarutvegur';                 // A03 fiskveiðar/fiskeldi
  if (n === 10 || n === 11) return 'landbunadur';      // C10-11 matvæli/drykkjarvöru
  if (n >= 1 && n <= 3) return 'landbunadur';          // A (annað en 03)
  if (n >= 5 && n <= 9) return 'idnadur';              // B
  if (n >= 10 && n <= 33) return 'idnadur';            // C (annað en 10/11)
  if (n === 35) return 'orka';                         // D
  if (n >= 36 && n <= 39) return 'umhverfi';           // E
  if (n >= 41 && n <= 43) return 'bygging';            // F
  if (n >= 45 && n <= 47) return 'verslun';            // G
  if (n >= 49 && n <= 53) return 'flutningar';         // H
  if (n >= 55 && n <= 56) return 'ferdathjonusta';     // I
  if (n >= 58 && n <= 60) return 'fjolmidlar';         // J58-60 útgáfa/mynd/útvarp
  if (n >= 61 && n <= 63) return 'ut';                 // J (annað) fjarskipti/upplýsingatækni
  if (n >= 64 && n <= 66) return 'fjarmal';            // K
  if (n === 68) return 'fasteignir';                   // L
  if (n === 85) return 'menntun';                      // P
  if (n >= 86 && n <= 88) return 'heilbrigdi';         // Q
  if (n >= 90 && n <= 93) return 'fjolmidlar';         // R
  return null;                                         // M/N/O/S/T/U + óskilgreind bil
}

export function isatToSector(isat) {
  if (isat === null || isat === undefined) return null;
  const raw = String(isat).trim();
  if (!raw) return null;
  if (/^[A-Za-z]$/.test(raw)) return LETTER_SECTOR[raw.toUpperCase()] || null;
  const m = raw.match(/\d+/);
  if (m) {
    const bySector = sectorFromDivision(parseInt(m[0].slice(0, 2), 10));
    if (bySector) return bySector;
  }
  const lm = raw.match(/^([A-Za-z])/);
  return lm ? (LETTER_SECTOR[lm[1].toUpperCase()] || null) : null;
}
