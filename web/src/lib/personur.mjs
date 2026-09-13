// personur.mjs — HREIN, isomorphic eining um persónur Moot-ráðsins (Bobiverse-ráðsalurinn).
// Engin node-import, engin DOM, engin Math.random, engin Date → sama útkoma í worker, í Vite-bundle og í node --test.
// Flutt inn af web/src/worker/moot.mjs (fundarmenn, aðgerðir, gátun), web/src/worker/hjalp_agent.mjs (persona →
// undirskrift Sigrúnar) og web/src/pages/stjorn.astro (avatarar + hnappatextar). Próf í personur.test.mjs.
//
// Öryggisreglur sem gilda hér:
//  · avatarSvg() tekur aðeins gilt persónu-id (eða 'aron'); inntaks-strengurinn fer ALDREI inn í SVG-ið.
//  · Öll lit-gildi í SVG koma úr AVATAR_PALETTE (föst tafla) — próf staðfestir.
//  · Engin id=, defs, clipPath, url(#), <script>, on*-eigindir eða href — strengurinn er öruggur í innerHTML
//    og margfaldar eintök á sömu síðu rekast ekki.
//  · MOOT_ADGERDIR er EIN uppspretta hnappatexta (UI) og gátunar (worker) — módel-texti ratar aldrei í hnapp.

/** Persónurnar í FASTRI röð (4 kk / 4 kvk). id án broddstafa, lágstafir. */
export const PERSONUR = [
  {
    id: 'sigrun', nafn: 'Sigrún', hlutverk: 'þjónustufulltrúi', emoji: '🛟', kyn: 'kvk', litur: '#46e08a',
    sjonarhorn: 'Notendaupplifun, tónn og skýr svör. Les málið frá sjónarhóli notandans og segir hvað hann þarf að heyra næst — án þess að lofa neinu um tíma eða endurgreiðslur.',
    spyr: 'Hvað upplifir notandinn og hvað þarf hann að heyra næst?',
    undirskrift: 'Sigrún — þjónustufulltrúi Karp',
    svipur: { hud: 0, har: 2, harStill: 'sitt', augu: 'mondlu', gler: false, eyrnalokkar: true, heyrnartol: true },
  },
  {
    id: 'hrafn', nafn: 'Hrafn', hlutverk: 'CTO', emoji: '🛠️', kyn: 'kk', litur: '#5b8dd6',
    sjonarhorn: 'Tækni, kóðaáhætta og endurtekning villu. Nefnir slóð eða einingu þegar hún kemur fram í gögnum og merkir ágiskun um orsök sem tilgátu.',
    spyr: 'Er þetta endurtakanlegt og hvar liggur rótin?',
    undirskrift: 'Hrafn — CTO Karp',
    svipur: { hud: 1, har: 0, harStill: 'stutt', augu: 'kringlott', gler: false, skegg: 'rot' },
  },
  {
    id: 'elin', nafn: 'Elín', hlutverk: 'CFO', emoji: '💰', kyn: 'kvk', litur: '#f6b13b',
    sjonarhorn: 'Kostnaður, tekjur, endurgreiðslur og MRR-áhrif. Talar í krónum og hlutföllum en giskar ekki á tölur sem ekki standa í gögnunum.',
    spyr: 'Hvað kostar þetta — og hvað kostar að gera ekkert?',
    undirskrift: 'Elín — CFO Karp',
    svipur: { hud: 0, har: 1, harStill: 'hnutur', augu: 'mondlu', gler: true, eyrnalokkar: true },
  },
  {
    id: 'bjarki', nafn: 'Bjarki', hlutverk: 'CMO', emoji: '📣', kyn: 'kk', litur: '#ff8f5b',
    sjonarhorn: 'Orðspor og markaðssjónarmið: hvernig þetta lítur út ef notandinn segir frá því og hvort hægt sé að snúa reynslunni í meðmæli.',
    spyr: 'Hvernig lítur þetta út ef notandinn segir frá því?',
    undirskrift: 'Bjarki — CMO Karp',
    svipur: { hud: 2, har: 2, harStill: 'toppur', augu: 'kringlott', bros: true },
  },
  {
    id: 'unnur', nafn: 'Unnur', hlutverk: 'gagnastjóri', emoji: '🗄️', kyn: 'kvk', litur: '#9b7bdc',
    sjonarhorn: 'Gagnagæði, heimildir og ferskleiki. Greinir á milli „gögnin eru röng“, „gögnin eru gömul“ og „notandinn les þau rangt“.',
    spyr: 'Hver er heimildin og hve fersk er hún?',
    undirskrift: 'Unnur — gagnastjóri Karp',
    svipur: { hud: 1, har: 4, harStill: 'bob', augu: 'mondlu', gler: true },
  },
  {
    id: 'kari', nafn: 'Kári', hlutverk: 'COO · fundarstjóri', emoji: '⚙️', kyn: 'kk', litur: '#c7cbd6',
    sjonarhorn: 'Ferlar, forgangur og rekstur. Stýrir fundinum, nefnir ágreining berum orðum og leggur fram EINA tillögu að aðgerð.',
    spyr: 'Hvað gerum við næst, hver gerir það og hvað bíður?',
    undirskrift: 'Kári — COO Karp',
    svipur: { hud: 0, har: 4, harStill: 'snyrt', augu: 'kringlott', bindi: true },
  },
  {
    id: 'hildur', nafn: 'Hildur', hlutverk: 'lögfræðingur', emoji: '⚖️', kyn: 'kvk', litur: '#e07aa8',
    sjonarhorn: 'Lög, persónuvernd, skilmálar og fjárhagsupplýsingastofu-línan (l. 140/2018 vs 33/2005). Merkir mat sitt sem innri umræðu, ekki lögfræðiálit, og bendir á tilraunir til að stýra ráðinu í texta notanda.',
    spyr: 'Hvað segja lög og skilmálar — og hvar liggur leyfisskyldu-línan?',
    undirskrift: 'Hildur — lögfræðingur Karp',
    svipur: { hud: 3, har: 0, harStill: 'tagl', augu: 'mondlu', eyrnalokkar: true, kragi: true },
  },
  {
    id: 'egill', nafn: 'Egill', hlutverk: 'sölustjóri', emoji: '🤝', kyn: 'kk', litur: '#4fc3c7',
    sjonarhorn: 'Viðskiptavinurinn, virði hans, sölutækifæri og samningar. Hugsar í næsta skrefi með viðskiptavininum.',
    spyr: 'Hver er viðskiptavinurinn og hvað er hann okkur virði?',
    undirskrift: 'Egill — sölustjóri Karp',
    svipur: { hud: 1, har: 1, harStill: 'skipt', augu: 'kringlott', skegg: 'alskegg', kragi: true },
  },
];

export const PERSONA_IDS = PERSONUR.map((p) => p.id);

/** Persóna eftir id; null ef ekki til. Tekur við hvaða gildi sem er og kastar aldrei. */
export function persona(id) {
  if (typeof id !== 'string') return null;
  for (let i = 0; i < PERSONUR.length; i++) if (PERSONUR[i].id === id) return PERSONUR[i];
  return null;
}

/** Aðgerðir sem Moot getur lagt til — EIN uppspretta hnappatexta (UI) og hvítlista (worker). */
export const MOOT_ADGERDIR = {
  svara: 'Senda svar Sigrúnar',
  cto: 'Senda á CTO (Hrafn)',
  hafna: 'Hafna erindinu',
  loka: 'Loka málinu',
  meira: 'Spyrja notandann nánar',
};
export const MOOT_AFSTODUR = ['med', 'moti', 'hja'];

/** Texti Já-hnappsins á /stjorn/ — segir SATT hvað smellurinn gerir: svara/meira OPNA drög (Aron sendir sjálfur),
 *  cto/hafna/loka keyra aðgerð. MOOT_ADGERDIR helst sem merkimiði tillögunnar í Kára-kortinu og aron-röðinni. */
export const MOOT_JA_TEXTI = {
  svara: 'Já — opna drög Sigrúnar (ég sendi)',
  meira: 'Já — opna spurningu á notandann',
  cto: 'Já — senda á CTO (Hrafn)',
  hafna: 'Já — hafna erindinu',
  loka: 'Já — loka málinu',
};

/** Villukóðar Moot → íslenska (EIN uppspretta fyrir þráðarlínu, stöðulínu og villufall á /stjorn/). */
export const MOOT_VILLUR = {
  parse: 'ónothæf fundargerð',
  max_tokens: 'fundargerð of löng',
  timi: 'tímamörk',
  lykill: 'lykill vantar',
  bid: 'klukkustundarþak',
  dagthak: 'dagþak',
  vistun: 'fundargerð vistaðist ekki',
  'ai json': 'ónothæft svar þjónustu',
  net: 'netvilla',
};
export function mootVilluTexti(e) {
  const s = String(e || '');
  if (MOOT_VILLUR[s]) return MOOT_VILLUR[s];
  if (/^ai \d+$/.test(s)) return 'þjónusta svaraði ' + s.slice(3);
  return 'villa';
}

/** Fundarmenn í RÆÐURÖÐ: 'sigrun' alltaf fyrst, 'kari' alltaf síðastur (talar aðeins í niðurstöðu), 4–5 alls
 *  (≥2 ræðumenn auk Sigrúnar svo ágreiningur „með nafni“ sé mögulegur). Deterministísk — sama (tegund, texti) gefur alltaf sama fylki. */
export function veljaFundarmenn(tegund, texti) {
  const l = String(texti || '').toLowerCase();
  const extras = [];
  const add = (id) => { if (!extras.includes(id)) extras.push(id); };
  const GOGN = /töl|tala|gögn|heimild|hvaðan|áreiðanle|uppfær|hvenær|mat\b|rangt|graf|vísital|fasteign|kvót|ársreikn/;
  const KOSTN = /kostar|kostnað|verðskrá|verðið|krón|\bkr\b|endurgreið|áskrift|þrep|reikning|rukk/;
  const VILLA = /villa|virkar ekki|virki ekki|bilun|hrun|hrynur|404|500/;
  switch (tegund) {
    case 'villa':
      add('hrafn');
      add(GOGN.test(l) ? 'unnur' : 'egill');
      break;
    case 'spurning':
      add('egill');
      if (GOGN.test(l)) add('unnur');
      if (KOSTN.test(l)) add('elin');
      if (extras.length < 2) add('unnur');
      break;
    case 'adgangur':
      add('hrafn'); add('hildur');
      break;
    case 'reikningur':
      add('elin');
      if (/endurgreið|skilmál/.test(l)) add('hildur');
      if (/fyrirtæki|samning|sæti/.test(l)) add('egill');
      if (extras.length < 2) add('egill');
      break;
    case 'osk':
      add('egill'); add('bjarki'); add('hrafn');
      break;
    default: // 'annad' / undefined / óþekkt gildi
      add('egill');
      if (VILLA.test(l)) add('hrafn');
      if (KOSTN.test(l)) add('elin');
      if (extras.length < 2) add('unnur');
  }
  // Þvert á tegund — bætt aftast ef ekki komin
  if (/kennital|\bkt\b|persónu|gdpr|skilmál|lögfr|eyð(a|ið|ing)|þriðja aðila/.test(l)) add('hildur');
  if (/linkedin|fjölmið|opinber|orðspor|twitter|facebook/.test(l)) add('bjarki');
  if (KOSTN.test(l)) add('elin');
  while (extras.length < 2) add(extras.includes('egill') ? 'unnur' : 'egill'); // getur ekki gerst með reglunum að ofan — vörn
  return ['sigrun', ...extras.slice(0, 3), 'kari'];
}

// ─── Avatarar ────────────────────────────────────────────────────────────────────────────────────────

/** EINU litirnir sem nokkru sinni fara í SVG. HUD=[0..3], HAR=[4..9], svo föst kerfislit, svo persónulitir. */
export const AVATAR_PALETTE = [
  '#f3d7c3', '#e8bfa0', '#d9a77f', '#b98461',                         // húð 0..3
  '#2b2118', '#5a3825', '#8b5a2b', '#c98a4b', '#d9c27a', '#7d7d7d',   // hár 0..5 (svart, dökkbrúnt, brúnt, ljósbrúnt, ljóst, grátt)
  '#1b2230', '#5a2a2a', '#0b0f1a', '#f6b13b', '#6f7789', '#ffffff',   // lína, munnur, bak, gull, faint, hvítt
  ...PERSONUR.map((p) => p.litur),
];
const HUD = AVATAR_PALETTE.slice(0, 4);
const HAR = AVATAR_PALETTE.slice(4, 10);
const LINA = '#1b2230', MUNNUR = '#5a2a2a', BAK = '#0b0f1a', GULL = '#f6b13b', FAINT = '#6f7789', HVITT = '#ffffff';
const XMLNS = 'http://www.w3.org/2000/svg'; // þarf að vera með svo data-URI virki í <img src>
const FONT = 'system-ui,sans-serif';

// Hár-kúpur (framhluti) — kk höfuð rx12.5 (toppur y16), kvk rx11.5 (toppur y15.5); kúpan situr 1–1,5 ofan við.
const KUPA_KK = 'M19.5 30Q19.5 14.5 32 14.5Q44.5 14.5 44.5 30Q43.5 23 39 21Q32 18.5 25 21Q20.5 23 19.5 30Z';
const KUPA_KVK = 'M20.5 28Q20.5 14.5 32 14.5Q43.5 14.5 43.5 28Q42.5 22 38 20Q32 18 26 20Q21.5 22 20.5 28Z';

function _path(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>'; }

function _size(v) {
  const n = Number(v);
  const r = Number.isFinite(n) ? Math.round(n) : 64;
  return Math.max(16, r);
}

function _svgOpen(S, talar, aria) {
  return '<svg xmlns="' + XMLNS + '" class="stj-moot-av' + (talar ? ' talar' : '') + '" width="' + S + '" height="' + S +
    '" viewBox="0 0 64 64" ' + aria + ' focusable="false">';
}

/** Persónu-andlit: lag í fastri röð (sjá forskrift kafla 7). Aðeins fastar tölur og palettu-litir fara inn. */
function _teiknaPersonu(p, S, talar) {
  const lag = S < 48, stor = S > 100;
  const sw = (n) => (lag ? String(Math.round(n * 14) / 10) : String(n)); // strokes ×1.4 í smæstu stærð
  const sv = p.svipur || {};
  const hud = HUD[sv.hud] || HUD[0];
  const har = HAR[sv.har] || HAR[0];
  const kvk = p.kyn === 'kvk';
  const L = [];
  L.push(_svgOpen(S, talar, 'role="img" aria-label="' + p.nafn + ', ' + p.hlutverk + '"'));
  L.push(kvk ? '<!--kvk-->' : '<!--kk-->');
  // (1) bakhringur í lit persónunnar (+ tal-ljómi, + innri rammi í stóru stærðinni)
  L.push('<circle cx="32" cy="32" r="31" fill="' + p.litur + '" fill-opacity=".16" stroke="' + p.litur + '" stroke-width="2"/>');
  if (talar) L.push('<circle cx="32" cy="32" r="28.5" fill="none" stroke="' + GULL + '" stroke-width="1.5" stroke-opacity=".85"/>');
  if (stor) L.push('<circle cx="32" cy="32" r="29.5" fill="none" stroke="' + p.litur + '" stroke-width="1" stroke-opacity=".35"/>');
  // (2) hár-bak — aðeins sítt/bob/tagl
  if (sv.harStill === 'sitt') L.push(_path('M18 30Q17 14 32 13Q47 14 46 30L47 51Q40 53 32 53Q24 53 17 51Z', har));
  else if (sv.harStill === 'bob') L.push(_path('M19 28Q18 14 32 13Q46 14 45 28L45 43Q38 45 32 45Q26 45 19 43Z', har));
  else if (sv.harStill === 'tagl') L.push(_path('M20 28Q19 14 32 13Q45 14 44 28L44 35L20 35Z', har) + _path('M43 23Q53 27 51 45Q48 38 42 33Z', har));
  // (3) axlir — klæðnaður ber hlutverkslitinn; boginn fylgir r30 svo hann haldist innan hringsins
  L.push(_path('M15.4 57Q17 48 25 46L32 46.5L39 46Q47 48 48.6 57A30 30 0 0 1 15.4 57Z', p.litur));
  if (sv.kragi && !lag) L.push(_path('M25.5 45.5L30 46.5L28.5 51Z', HVITT) + _path('M38.5 45.5L34 46.5L35.5 51Z', HVITT));
  if (sv.bindi) L.push(_path('M32 46.5L30 48.5L31 58L32 60L33 58L34 48.5Z', BAK));
  // (4) háls
  L.push('<rect x="29" y="38" width="6" height="8" fill="' + hud + '"/>');
  // (5) höfuð — kk með kjálka, kvk mýkri sporbaugur
  if (kvk) L.push('<ellipse cx="32" cy="29" rx="11.5" ry="13.5" fill="' + hud + '"/>');
  else L.push('<ellipse cx="32" cy="29" rx="12.5" ry="13" fill="' + hud + '"/>' + _path('M20.5 30L21.5 37Q26 43.5 32 43.5Q38 43.5 42.5 37L43.5 30Z', hud));
  // (6) eyru
  L.push('<circle cx="19.5" cy="30" r="2.2" fill="' + hud + '"/><circle cx="44.5" cy="30" r="2.2" fill="' + hud + '"/>');
  // (7) hár-framan
  switch (sv.harStill) {
    case 'stutt': L.push(_path(KUPA_KK, har)); break;
    case 'snyrt': L.push(_path('M20.5 27Q21 16.5 32 16Q43 16.5 43.5 27Q42 22 38 21Q32 19.5 26 21Q22 22 20.5 27Z', HAR[5])); break; // þynnri kúpa, grátt (Kári)
    case 'skipt':
      L.push(_path(KUPA_KK, har) + _path('M22 22Q26 27 31 21Q27 18.5 22 22Z', har) +
        '<path d="M28.5 15.5L27 21.5" stroke="' + LINA + '" stroke-width="' + sw(0.8) + '" stroke-opacity=".5" fill="none"/>');
      break;
    case 'toppur': L.push(_path(KUPA_KK, har) + _path('M22 21Q28 10.5 40 13Q46 16 44.5 23Q38 17.5 30 18.5Q25 19.5 22 21Z', har)); break;
    case 'sitt': L.push(_path(KUPA_KVK, har) + _path('M19.5 22Q18 30 19 42L23 42Q22 30 25 22Z', har) + _path('M44.5 22Q46 30 45 42L41 42Q42 30 39 22Z', har)); break;
    case 'bob': L.push(_path(KUPA_KVK, har) + _path('M20 26L20 43L24 43L24 28Z', har) + _path('M44 26L44 43L40 43L40 28Z', har)); break;
    case 'hnutur': L.push(_path(KUPA_KVK, har) + '<circle cx="32" cy="15" r="4.5" fill="' + har + '"/>'); break;
    case 'tagl': L.push(_path(KUPA_KVK, har)); break; // taglið sjálft er í hár-bak-laginu
    default: L.push(_path(kvk ? KUPA_KVK : KUPA_KK, har));
  }
  // (8) augu — kringlótt eða möndlulaga; kvk fá augnhár (sleppt í 'lag')
  if (sv.augu === 'mondlu') L.push('<ellipse cx="27" cy="29" rx="2" ry="1.4" fill="' + LINA + '"/><ellipse cx="37" cy="29" rx="2" ry="1.4" fill="' + LINA + '"/>');
  else L.push('<circle cx="27" cy="29" r="1.7" fill="' + LINA + '"/><circle cx="37" cy="29" r="1.7" fill="' + LINA + '"/>');
  if (kvk && !lag) L.push('<path class="augnhar" d="M24.6 27.7Q27 26.2 29.4 27.7M34.6 27.7Q37 26.2 39.4 27.7" stroke="' + LINA + '" stroke-width=".9" fill="none" stroke-linecap="round"/>');
  // (9) brúnir — sleppt í 'lag'
  if (!lag) L.push('<path class="brun" d="M24.5 25.6L29.5 25M34.5 25L39.5 25.6" stroke="' + LINA + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>');
  // (10) munnur — opinn þegar persónan talar
  if (talar) L.push('<ellipse cx="32" cy="38" rx="3" ry="2" fill="' + MUNNUR + '"/>');
  else L.push('<path d="' + (sv.bros ? 'M26 36Q32 42 38 36' : 'M27 37Q32 40 37 37') + '" stroke="' + MUNNUR + '" stroke-width="' + sw(1.6) + '" fill="none" stroke-linecap="round"/>');
  // (11) fylgihlutir
  if (sv.gler) L.push('<circle cx="27" cy="29" r="4.6" stroke="' + LINA + '" stroke-width="' + sw(1.4) + '" fill="none"/><circle cx="37" cy="29" r="4.6" stroke="' + LINA + '" stroke-width="' + sw(1.4) + '" fill="none"/><path d="M31.6 29L32.4 29" stroke="' + LINA + '" stroke-width="' + sw(1.4) + '" fill="none"/>');
  if (sv.heyrnartol) L.push('<path d="M20 30Q20 12 32 12Q44 12 44 30" stroke="' + LINA + '" stroke-width="' + sw(2) + '" fill="none" stroke-linecap="round"/><circle cx="44.5" cy="30" r="2.5" fill="' + LINA + '"/><path d="M44.5 32.5Q43 40 37 39.5" stroke="' + LINA + '" stroke-width="' + sw(1.4) + '" fill="none" stroke-linecap="round"/><circle cx="37" cy="39.5" r="1.2" fill="' + LINA + '"/>');
  if (sv.skegg) L.push(_path('M21 31Q23 41.5 32 43.5Q41 41.5 43 31Q41 37 36 40.5Q32 41.5 28 40.5Q23 37 21 31Z', har, ' fill-opacity="' + (sv.skegg === 'alskegg' ? '.9' : '.3') + '"'));
  if (sv.eyrnalokkar && !lag) L.push('<circle cx="19.5" cy="33.2" r="1.3" fill="' + GULL + '"/><circle cx="44.5" cy="33.2" r="1.3" fill="' + GULL + '"/>');
  if (stor) L.push('<ellipse cx="29" cy="22.5" rx="4" ry="2.2" fill="' + HUD[0] + '" fill-opacity=".25"/>');
  // (12) hlutverks-merki — emoji úr PERSONUR (fast), sleppt í 'lag'
  if (!lag) L.push('<circle cx="50" cy="50" r="7.5" fill="' + BAK + '" stroke="' + p.litur + '" stroke-width="1.5"/><text x="50" y="53.2" text-anchor="middle" font-family="' + FONT + '" font-size="8.5">' + p.emoji + '</text>');
  L.push('</svg>');
  return L.join('');
}

/** Aron er ekki í PERSONUR — tómur stóll með gullnu A: mennska ákvörðunin sést strax frá AI-ráðgjöfinni. */
function _teiknaAron(S) {
  return _svgOpen(S, false, 'role="img" aria-label="Aron, lokaatkvæði"') + '<!--aron-->' +
    '<circle class="stj-moot-aron-stoll" cx="32" cy="32" r="31" fill="' + BAK + '" stroke="' + FAINT + '" stroke-width="2" stroke-dasharray="4 3"/>' +
    '<path d="M21 47V24Q32 19.5 43 24V47" stroke="' + FAINT + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<rect x="18" y="45" width="28" height="5" rx="1.5" stroke="' + FAINT + '" stroke-width="1.6" fill="none"/>' +
    '<text x="32" y="38" text-anchor="middle" font-family="' + FONT + '" font-weight="800" font-size="18" fill="' + GULL + '">A</text>' +
    '</svg>';
}

/** Óþekkt id → grár varahringur. Inntakið fer ALDREI inn í úttakið. */
function _teiknaOthekkt(S) {
  return _svgOpen(S, false, 'role="presentation" aria-hidden="true"') + '<!--othekkt-->' +
    '<circle cx="32" cy="32" r="31" fill="' + FAINT + '" fill-opacity=".2" stroke="' + FAINT + '" stroke-width="2"/>' +
    '<text x="32" y="39" text-anchor="middle" font-family="' + FONT + '" font-weight="800" font-size="18" fill="' + FAINT + '">?</text>' +
    '</svg>';
}

const _avCache = new Map(); // lykill = tegund|stærð|talar — takmarkað mengi (10 tegundir), vex ekki með rusl-inntaki

/** Inline SVG-strengur fyrir persónu (eða 'aron'). opts: {size=64 (≥16), talar=false}. Deterministískt. */
export function avatarSvg(id, opts) {
  const o = opts || {};
  const S = _size(o.size);
  const talar = !!o.talar;
  const p = persona(id);
  const kind = p ? p.id : (id === 'aron' ? 'aron' : '');
  const key = kind + '|' + S + '|' + (talar ? 1 : 0);
  let s = _avCache.get(key);
  if (s === undefined) {
    s = p ? _teiknaPersonu(p, S, talar) : kind === 'aron' ? _teiknaAron(S) : _teiknaOthekkt(S);
    _avCache.set(key, s);
  }
  return s;
}

/** data-URI fyrir <img src> eða CSS background þar sem inline-SVG hentar ekki. */
export function avatarDataUri(id, opts) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(avatarSvg(id, opts));
}
