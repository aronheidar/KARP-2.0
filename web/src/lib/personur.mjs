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
    id: 'hrafn', nafn: 'Hrafn', hlutverk: 'forritari', emoji: '🛠️', kyn: 'kk', litur: '#5b8dd6',
    sjonarhorn: 'Tækni, kóðaáhætta og endurtekning villu. Nefnir slóð eða einingu þegar hún kemur fram í gögnum og merkir ágiskun um orsök sem tilgátu.',
    spyr: 'Er þetta endurtakanlegt og hvar liggur rótin?',
    undirskrift: 'Hrafn — forritari Karp',
    svipur: { hud: 1, har: 0, harStill: 'stutt', augu: 'kringlott', gler: false, skegg: 'rot' },
  },
  {
    id: 'elin', nafn: 'Elín', hlutverk: 'fjármálastjóri', emoji: '💰', kyn: 'kvk', litur: '#f6b13b',
    sjonarhorn: 'Kostnaður, tekjur, endurgreiðslur og MRR-áhrif. Talar í krónum og hlutföllum en giskar ekki á tölur sem ekki standa í gögnunum.',
    spyr: 'Hvað kostar þetta — og hvað kostar að gera ekkert?',
    undirskrift: 'Elín — fjármálastjóri Karp',
    svipur: { hud: 0, har: 1, harStill: 'hnutur', augu: 'mondlu', gler: true, eyrnalokkar: true },
  },
  {
    id: 'bjarki', nafn: 'Bjarki', hlutverk: 'markaðsfulltrúi', emoji: '📣', kyn: 'kk', litur: '#ff8f5b',
    sjonarhorn: 'Orðspor og markaðssjónarmið: hvernig þetta lítur út ef notandinn segir frá því og hvort hægt sé að snúa reynslunni í meðmæli.',
    spyr: 'Hvernig lítur þetta út ef notandinn segir frá því?',
    undirskrift: 'Bjarki — markaðsfulltrúi Karp',
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

/** Starfsmenn sem hafa VÉL sem má slökkva á → lykill í stjorn_sync. Persóna án vélar (Moot-sæti eitt og sér)
 *  fær engan rofa. ⚠ Sigrún heldur upprunalega lyklinum 'hjalp_agent_off': flæðið sem er í loftinu les hann
 *  (processNewTicket) og endurnefning myndi þagga sjálfvirknina án þess að nokkuð sýndist að. */
export const ROFAR = { sigrun: 'hjalp_agent_off', hrafn: 'rofi_hrafn', bjarki: 'rofi_bjarki', elin: 'rofi_elin' };
export function rofiLykill(id) {
  return (typeof id === 'string' && Object.prototype.hasOwnProperty.call(ROFAR, id)) ? ROFAR[id] : null;
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
  // ── Portrett-tónar, AFTAST og aldrei fremst: HUD- og HAR-sneiðarnar hér fyrir neðan
  //    lesa slice(0,4) og slice(4,10), svo röðin fremst má ALDREI hnikast.
  '#fbe9db', '#e0b79a', '#c6926f', '#f0a89a', '#e7c9b4',   // húð 0: ljós, skuggi, kjarnaskuggi, kinnroði, endurkast
  '#b07c48', '#cf9a5e',                                     // hár 2: ljós, glans
  '#f4efe8', '#2f4b63', '#5b84a3', '#8fb3c9',               // auga: hvíta, lithimnubrún, lithimna, ljós
  '#b95f5c', '#dc8a84', '#f0b8b0',                          // varir: efri, neðri, ljós
  '#2f3848', '#4b5670',                                     // heyrnartól: mið, ljós
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


// ═══════════════════════════════════════════════════════════════════════════════════════
//  MÁLAÐ PORTRETT — aðeins persónur í MALADAR fá það. Hinar halda _teiknaPersonu óbreyttu.
//  Rýni 17.9 sýndi að innsetning á öllum átta í einu gerir sjö sköllóttar (hvorugt hárlagið
//  er teiknað fyrir aðrar hárgreiðslur en 'sitt') og fellir ~230 fullyrðingar í P5. Þess vegna
//  er þetta rofi per persónu og ekki innsetning á öllu settinu.
//  ⚠ _path, _size og _svgOpen eru sameiginleg að ofan — ekki afrita þau hingað.
// ═══════════════════════════════════════════════════════════════════════════════════════
/** Tónastigi húðar per HUD-index: [ljós, grunnur, skuggi, kjarnaskuggi, kinnroði, endurkast]. Aðeins 0 (Sigrún) er málað enn;
 *  index án raðar fær alla tóna = grunnlit (flöt teikning — ekkert brotnar hjá hinum sjö). */
const HUD_TONAR = { 0: ['#fbe9db', '#f3d7c3', '#e0b79a', '#c6926f', '#f0a89a', '#e7c9b4'] };
/** Tónastigi hárs per HAR-index: [djúpt, skuggi, grunnur, ljós, glans]. Aðeins 2 (Sigrún) er málað enn. */
const HAR_TONAR = { 2: ['#2b2118', '#5a3825', '#8b5a2b', '#b07c48', '#cf9a5e'] };
const AUGA = { hvita: '#f4efe8', brun: '#2f4b63', lit: '#5b84a3', ljos: '#8fb3c9' };
const VOR = { efri: '#b95f5c', nedri: '#dc8a84', ljos: '#f0b8b0' };
const HT = { dokkt: LINA, mid: '#2f3848', ljos: '#4b5670' };

function _tonar(tafla, i, grunnur, n) {
  if (Object.prototype.hasOwnProperty.call(tafla, i)) return tafla[i];
  const a = []; for (let k = 0; k < n; k++) a.push(grunnur); return a;
}
const R = (v) => String(Math.round(v * 100) / 100); // hnit með ≤2 aukastöfum, engin flotvillu-hali
function _el(cx, cy, rx, ry, fill, extra) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (extra || '') + '/>'; }
function _ci(cx, cy, r, fill, extra) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"' + (extra || '') + '/>'; }
function _lina(d, stroke, w, extra) { return '<path d="' + d + '" stroke="' + stroke + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"' + (extra || '') + '/>'; }
/** Andlitsformið (kvk): breitt enni og kinnbein, mjórri haka. */
const ANDLIT_KVK = 'M32 15.6Q21.6 15.6 20.9 27Q20.5 35 25.6 40.6Q29 43.5 32 43.5Q35 43.5 38.4 40.6Q43.5 35 43.1 27Q42.4 15.6 32 15.6Z';

/** Eitt auga: hvíta, lithimna í þremur tónum, sjáaldur, ljósglampi (efst til vinstri — sama ljós og annars staðar),
 *  blikk-lok (falið sjálfgefið um transform-eigind; CSS-klasinn .av-lok yfirtekur og hreyfir), loklína, augnhár. */
function _auga(cx, tn, lag, stor, ytri) {
  const cy = 29.6, x0 = R(cx - 2.9), x1 = R(cx + 2.9), c = R(cx), ci = R(cx + 0.1);
  const efri = 'M' + x0 + ' ' + cy + 'Q' + c + ' 26.9 ' + x1 + ' ' + cy;
  const nedri = 'M' + x0 + ' ' + cy + 'Q' + c + ' 31.9 ' + x1 + ' ' + cy;
  const mondlu = efri + 'Q' + c + ' 31.9 ' + x0 + ' ' + cy + 'Z';
  const L = [];
  L.push(_el(c, 29.4, 3.5, 2.3, tn[2], ' fill-opacity=".36"'));                // augntóft (létt — annars „þreytt“)
  L.push(_path(mondlu, AUGA.hvita));                                             // hvíta
  if (lag) {
    // Í 32px er augað 2,9 punktar á breidd. Ljósblá lithimna ofan á hvítu leysist þá upp í
    // fölan blett (mælt í stiganum) — augun urðu starandi og lituð. Þar er einn dökkur
    // kjarni rétta svarið, ekki minnkuð útgáfa af því stóra.
    L.push('<g class="av-lithimna">' + _el(ci, 29.6, 2, 1.5, AUGA.brun) + '</g>');
  } else {
    // lithimna + sjáaldur + glampi í EINUM hóp: augnastefna færir þau saman, hvítan kyrr
    L.push('<g class="av-lithimna">');
    L.push(_el(ci, 29.55, 1.5, 1.25, AUGA.brun));                                // lithimnu-brún (dökk)
    L.push(_el(ci, 29.55, 1.1, 0.9, AUGA.lit));                                  // lithimna
    L.push(_el(ci, 30.05, 0.7, 0.38, AUGA.ljos));                                // ljós neðst í lithimnu
    L.push(_ci(ci, 29.55, 0.6, BAK));                                            // sjáaldur
    L.push(_ci(R(cx - 0.35), 29.05, 0.42, HVITT));                               // ljósglampi efst til vinstri
    L.push('</g>');
  }
  if (stor) L.push(_ci(R(cx + 0.75), 30.25, 0.2, HVITT, ' fill-opacity=".7"'));  // annar, minni glampi
  L.push('<g class="av-lok" transform="scale(1 0)">' + _path(mondlu, tn[2]) + _lina(nedri, LINA, lag ? '1.1' : '.8') + '</g>');
  L.push(_lina(efri, LINA, lag ? '1.1' : '.85'));                                // efri loklína
  if (!lag) L.push(_lina('M' + R(cx - 2.6) + ' 29.85Q' + c + ' 31.75 ' + R(cx + 2.6) + ' 29.85', LINA, '.4', ' stroke-opacity=".35"'));
  if (!lag) L.push(_lina('M' + R(cx + ytri * 2.6) + ' 29.3Q' + R(cx + ytri * 3.4) + ' 28.6 ' + R(cx + ytri * 3.7) + ' 27.9', LINA, '.8', ' class="augnhar"'));
  return L.join('');
}
/** Málað portrett: lag í fastri röð, aftast → fremst. Aðeins fastar tölur og palettu-litir fara inn. */
function _teiknaSigrun(p, S, talar) {
  const lag = S < 48, stor = S > 100;
  const sw = (n) => (lag ? String(Math.round(n * 14) / 10) : String(n)); // strokes ×1.4 í smæstu stærð
  const sv = p.svipur || {};
  const hi = HUD[sv.hud] ? sv.hud : 0, ri = HAR[sv.har] ? sv.har : 0;
  const tn = _tonar(HUD_TONAR, hi, HUD[hi], 6);   // [ljós, grunnur, skuggi, kjarnaskuggi, kinnroði, endurkast]
  const hr = _tonar(HAR_TONAR, ri, HAR[ri], 5);   // [djúpt, skuggi, grunnur, ljós, glans]
  const kvk = p.kyn === 'kvk';
  const sitt = sv.harStill === 'sitt';
  const L = [];
  L.push(_svgOpen(S, talar, 'role="img" aria-label="' + p.nafn + ', ' + p.hlutverk + '"'));
  L.push(kvk ? '<!--kvk-->' : '<!--kk-->');
  // (1) bakhringur í lit persónunnar (+ tal-ljómi, + innri rammi í stóru stærðinni)
  L.push(_ci(32, 32, 31, p.litur, ' fill-opacity=".16" stroke="' + p.litur + '" stroke-width="2"'));
  if (talar) L.push('<circle class="av-ljomi" cx="32" cy="32" r="28.5" fill="none" stroke="' + GULL + '" stroke-width="1.5" stroke-opacity=".85"/>');
  if (stor) L.push(_ci(32, 32, 29.5, 'none', ' stroke="' + p.litur + '" stroke-width="1" stroke-opacity=".35"'));
  L.push('<g class="av-likami">');
  // (2) hár-bak — SAMI av-haus-klasi og andlitið, í sérhóp: z-röðin krefst þess að það
  //     liggi á undan öxlunum, en það verður samt að fylgja höfðinu þegar það hreyfist.
  L.push('<g class="av-haus">');
  if (sitt) {
    L.push(_path('M17.6 52.4Q15.2 36 18.2 24.6Q21.6 13.2 32 12.8Q42.4 13.2 45.8 24.6Q48.8 36 46.4 52.4Q40 55.4 32 55Q24 55.4 17.6 52.4Z', hr[1]));
    L.push(_path('M22.4 38Q21 46 23.2 52.2Q27.4 53.8 32 53.6Q36.6 53.8 40.8 52.2Q43 46 41.6 38Q37.6 45.6 32 46.2Q26.4 45.6 22.4 38Z', hr[0]));
  }
  L.push('</g>');   // av-haus (bak)
  // (3) axlir — hlutverkslitur; skuggi hægra megin, ljós á vinstri öxl, hálsmál
  L.push(_path('M15.4 57Q17 48 25 46L28.6 45.2Q32 48.6 35.4 45.2L39 46Q47 48 48.6 57A30 30 0 0 1 15.4 57Z', p.litur));
  L.push(_path('M36.2 45.5L39 46Q47 48 48.6 57A30 30 0 0 1 37 62.4Q45 55 41.6 49Q39.6 46.6 36.2 45.5Z', BAK, ' fill-opacity=".26"'));
  L.push(_path('M15.4 57Q17 48 25 46L27.6 46.5Q20.6 49.2 18.4 57Z', HVITT, ' fill-opacity=".13"'));
  L.push(_lina('M28.6 45.2Q32 48.6 35.4 45.2', BAK, '.6', ' stroke-opacity=".35"'));
  // (4) háls — í skugga undir höku, kjarnaskuggi efst, þunn ljósrönd vinstra megin
  L.push(_path('M28.2 37.6L28.6 46.8Q32 48.3 35.4 46.8L35.8 37.6Z', tn[2]));
  L.push(_path('M28.2 37.6L35.8 37.6L35.4 43.4Q32 45.2 28.6 43.4Z', tn[3]));
  L.push(_path('M28.6 43.6Q29.6 45.4 30.4 46.9L28.6 46.8Z', tn[1]));
  // ── HAUS: eigin hópur svo halla/kinka/snúa hreyfi höfuðið eitt, ekki bolinn.
  L.push('<g class="av-haus">');
  // (5) eyru — á undan andlitinu svo aðeins ytri hlutinn sjáist
  L.push(_el(20.7, 30.8, 1.8, 2.5, tn[1])); L.push(_el(21, 31, 0.9, 1.4, tn[2]));
  L.push(_el(43.3, 30.8, 1.8, 2.5, tn[2])); L.push(_el(43, 31, 0.9, 1.4, tn[3]));
  // (6) andlit — grunnur
  L.push(_path(ANDLIT_KVK, tn[1]));
  // (7) form-mótun húðar — EIN ljósstefna, efst til vinstri
  L.push(_path('M35.8 16.2Q43 19.2 43.1 27Q43.5 35 38.4 40.6Q35 43.5 32 43.5Q37.2 41.4 40.2 35.4Q42.4 29 40.2 22.6Q38.8 18.8 35.8 16.2Z', tn[2])); // hægri hlið í skugga
  L.push(_path('M23.6 38Q27.8 42.8 32 43.5Q36.2 42.8 40.4 38Q36.6 41.2 32 41.4Q27.4 41.2 23.6 38Z', tn[2]));     // kjálki
  L.push(_path('M39.4 38.6Q36.8 42 32 43.5Q37.4 42.4 40.6 38Z', tn[3]));                                        // kjarnaskuggi undir kjálka
  L.push(_path('M26.8 41.8Q29.6 43.5 32 43.5Q34.4 43.5 37.2 41.8Q34.6 42.7 32 42.7Q29.4 42.7 26.8 41.8Z', tn[5])); // endurkast neðst á kjálka
  // ennis-glampi felldur: ennið er nú ~11 einingar breitt og hver bjartur blettur á því
  // les sem blettur, ekki ljós. Ljósa hliðin kemur frá grunntóninum sjálfum.
  L.push(_el(25.6, 33, 2.3, 1.4, tn[0]));       // ljós á vinstra kinnbeini
  L.push(_el(31.6, 41.6, 1.3, 0.5, tn[0], ' fill-opacity=".55"'));     // ljós á höku
  L.push(_el(25.9, 34.8, 2.9, 1.7, tn[4], ' fill-opacity=".5"')); L.push(_el(38.5, 34.8, 2.9, 1.7, tn[4], ' fill-opacity=".38"')); // kinnroði
  // (8) augu
  L.push(_auga(26.8, tn, lag, stor, -1)); L.push(_auga(37.2, tn, lag, stor, 1));
  // (9) brúnir — fylltar, í hár-skugga; sleppt í 'lag'
  if (!lag) L.push('<g class="av-brun-v"><path class="brun" d="M24.6 26.9Q27 24.7 30.4 25.3Q30.7 26.3 29.7 26.5Q27.1 26.1 24.6 26.9Z" fill="' + hr[1] + '"/></g>'
    + '<g class="av-brun-h"><path class="brun" d="M39.4 26.9Q37 24.7 33.6 25.3Q33.3 26.3 34.3 26.5Q36.9 26.1 39.4 26.9Z" fill="' + hr[1] + '"/></g>');
  // (10) nef — skuggi hægra megin við nefbeinið, undirskuggi, ljós á nefbeini og nefbroddi, nasir í stóru stærðinni
  L.push(_path('M32.5 27Q34.4 31 34.9 34.3Q34.1 35.4 32.6 35.1Q33.4 31.4 32.5 27Z', tn[2]));
  L.push(_el(32.3, 35.55, 2.3, 0.75, tn[2]));
  L.push(_el(31.4, 31, 0.55, 1.8, tn[0], ' fill-opacity=".6"'));
  L.push(_el(31.5, 33.7, 0.95, 0.55, tn[0]));
  if (stor) { L.push(_el(30.75, 35.45, 0.55, 0.3, tn[3])); L.push(_el(33.75, 35.45, 0.55, 0.3, tn[3])); }
  // (11) munnur — efri vör dekkri, neðri ljósari með ljósi; opinn (ellipse í munnlit) þegar talað er
  L.push(_el(32.3, 40.35, 2.3, 0.55, tn[2]));   // skuggi undir neðri vör
  if (talar) {
    L.push('<g class="av-munnur">' + _path('M29 40.4Q32 42.7 35 40.4Q32 41.2 29 40.4Z', VOR.nedri) +
      '<ellipse cx="32" cy="39.3" rx="2.9" ry="1.75" fill="' + MUNNUR + '"/>' +
      (lag ? '</g>' : '<rect x="29.9" y="38.5" width="4.2" height=".95" rx=".3" fill="' + HVITT + '" fill-opacity=".85"/></g>'));
    L.push(_path('M28.6 38.3Q30.4 37.1 32 37.7Q33.6 37.1 35.4 38.3Q32 38.8 28.6 38.3Z', VOR.efri));
  } else {
    if (lag) {
      // Mælt á móti núverandi personur.mjs í 20 og 32 punktum: fylltu varirnar renna saman
      // í bleika móðu og 0,8-strikið hverfur undir henni. Þar er eitt dökkt strik rétta
      // svarið — varir sem lesast ekki eru verri en enginn munnur.
      // Núverandi personur.mjs notar breidd 2,2 á 10 eininga boga í 32px. Mælt: 1,3 á 6,2
      // einingum hverfur. Hér er 2,0 á 7,6 — sama lestrarþyngd, mjórra andlit.
      L.push(_lina('M28.2 38.5Q32 40.6 35.8 38.5', MUNNUR, '2', ' class="av-munnur"'));
    } else {
      L.push(_path('M28.6 38.5Q30.4 37.2 32 37.8Q33.6 37.2 35.4 38.5Q32 39.2 28.6 38.5Z', VOR.efri));
      L.push(_path('M28.8 38.7Q32 41.3 35.2 38.7Q32 39.4 28.8 38.7Z', VOR.nedri));
      L.push(_el(31.3, 39.7, 1.2, 0.38, VOR.ljos));
      L.push('<g class="av-munnur">' + _lina('M28.7 38.4Q32 39.9 35.3 38.4', MUNNUR, sw(0.6), ' stroke-opacity=".8"') + '</g>');
    }
  }
  // (12) hár-framan — kúpa með skugga við hárlínu hægra megin og ljósi efst til vinstri; lokkar fram yfir axlir
  if (sitt) {
    L.push(_path('M19.3 31Q18.7 14.2 32 13.9Q45.3 14.2 44.7 31Q41.6 27.4 38.9 24.6Q38.4 22.4 36.6 21.2Q34.6 20.2 32 20.2Q29.4 20.2 27.4 21.2Q25.6 22.4 25.1 24.6Q22.4 27.4 19.3 31Z', hr[2]));
    L.push(_path('M34.6 20.6Q40 22.6 44.7 31Q43 25.6 38.4 22.6Q36.4 21.4 34.6 20.6Z', hr[1]));
    L.push(_path('M20.6 26.6Q24.2 17.4 32.2 15.4Q27.2 17.8 24 21.8Q22 24.4 20.6 26.6Z', hr[3], ' fill-opacity=".6"'));
    if (!lag) L.push(_lina('M23 24.4Q26 18.6 30.6 16.4', hr[4], sw(0.55)));
    // sveipur frá skiptingunni vinstra megin yfir ennið til hægri — kastar þunnum skugga á ennið undir sér
    L.push(_path('M19.9 22.4Q17.2 33 18.2 46.4Q19.4 50.6 23.2 49.6Q23.2 35 25.4 23.2Z', hr[2]));       // vinstri lokkur (í ljósi)
    L.push(_path('M21 26Q19.4 34 20.4 45.4L22 45.4Q21.2 34 22.8 26Z', hr[3]));
    L.push(_path('M44.1 22.4Q46.8 33 45.8 46.4Q44.6 50.6 40.8 49.6Q40.8 35 38.6 23.2Z', hr[1]));       // hægri lokkur (í skugga)
    L.push(_path('M43 26Q44.6 34 44.2 44.6L42.6 44.6Q43.2 34 41.2 26Z', hr[2]));
    if (stor) L.push(_lina('M21.9 29Q21 34 21.3 40', hr[4], '.45', ' stroke-opacity=".8"') + _lina('M42.2 29Q43.2 34 42.9 40', hr[3], '.45', ' stroke-opacity=".7"'));
  }
  // (13) heyrnartól — spöng yfir hárið með ljósbrún, hljóðdós á hægra eyra í þremur tónum, hljóðnemaarmur að munnvikinu
  if (sv.heyrnartol) {
    L.push(_lina('M20.5 30Q19.5 13 32 12.4Q44.5 13 43.5 30', HT.dokkt, sw(2.2)));
    if (!lag) L.push(_lina('M22.6 21.4Q25.8 14.2 32 13.5', HT.ljos, '.7'));
    L.push(_ci(20.6, 30.6, 3.1, HT.dokkt)); L.push(_ci(20.6, 30.6, 2.1, HT.mid));
    L.push(_ci(43.6, 30.6, 3.3, HT.dokkt)); L.push(_ci(43.6, 30.6, 2.3, HT.mid)); L.push(_el(42.8, 29.7, 0.95, 0.65, HT.ljos));
    L.push(_lina('M41.9 33.5Q41 40.4 36.6 40.7', HT.dokkt, sw(1.1)));
    L.push(_ci(36.4, 40.8, 1.05, HT.mid)); if (!lag) L.push(_ci(36.1, 40.5, 0.35, HT.ljos));
  }
  // (14) eyrnalokkar — gullhringir; sleppt í 'lag'
  if (sv.eyrnalokkar && !lag) L.push('<circle cx="20.9" cy="35.4" r="1.05" fill="none" stroke="' + GULL + '" stroke-width=".65"/><circle cx="43.1" cy="35.4" r="1.05" fill="none" stroke="' + GULL + '" stroke-width=".65"/>');
  L.push('</g>');   // av-haus
  L.push('</g>');   // av-likami
  // (15) hlutverks-merki — sami rammi og hinar sjö bera (hringur á 50,50 r=7.5), en glyfan er
  //      TEIKNUÐ, ekki emoji í <text>. Hinar sjö nota <text> með emoji úr PERSONUR, og mælt í
  //      1400px myndun birtast þær sem svartar skuggamyndir á nær-svörtum fleti; 🛟 Sigrúnar
  //      (U+1F6DF) vantar að auki í letrið og kom út sem tofu-kassi. Hringurinn hér er hvítur
  //      með fjórum skorum í persónulit — björgunarhringur, læsilegur hvar sem er.
  if (!lag) {
    L.push(_ci(50, 50, 7.5, BAK, ' stroke="' + p.litur + '" stroke-width="1.5"'));
    L.push(_ci(50, 50, 4.4, 'none', ' stroke="' + HVITT + '" stroke-width="2.3"'));
    L.push(_lina('M51.84 48.16L54.38 45.62M48.16 48.16L45.62 45.62'
      + 'M51.84 51.84L54.38 54.38M48.16 51.84L45.62 54.38', p.litur, '1.9'));
  }
  // ── (16) HÖND. Liggur 26 einingum NEÐAN við myndflötinn í hvíld og klippist burt af
  //      viewBox-inu, svo kyrra teikningin, PNG-in og <img>-data-URI eru nákvæmlega óbreytt.
  //      CSS-klasi yfirtekur transform-eigindina og lyftir henni upp. Engin auðkenni, engin
  //      clipPath — klippingin er sjálf viewBox-brúnin.
  L.push('<g class="av-hond" transform="translate(0 26)">');
  L.push(_lina('M43.4 58.6Q46.6 53.4 48.2 47.8', tn[1], '3.6'));              // framhandleggur
  L.push(_lina('M44.6 58.2Q47.6 53.2 49.1 48', tn[2], '1.2', ' stroke-opacity=".55"'));
  L.push(_el(49.4, 44.8, 3, 3.2, tn[1]));                                      // lófi
  if (!lag) {
    L.push(_lina('M47.7 42.6Q47.4 41 47.3 39.6', tn[1], '1.5'));               // fingur
    L.push(_lina('M49.5 42.2Q49.5 40.6 49.5 39.1', tn[1], '1.5'));
    L.push(_lina('M51.3 42.6Q51.7 41.1 51.9 39.7', tn[1], '1.5'));
    L.push(_lina('M46.9 45.2Q45.9 44 45.4 42.8', tn[1], '1.6'));               // þumall
    L.push(_el(50.6, 46.2, 1.6, 1.4, tn[2], ' fill-opacity=".45"'));           // skuggi í lófa
  }
  L.push('</g>');
  L.push('</svg>');
  return L.join('');
}

/** Hverjar persónur eru málaðar. Ein færsla per portrett sem klárast. */
const MALADAR = new Set(['sigrun']);

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
    s = p ? (MALADAR.has(p.id) ? _teiknaSigrun(p, S, talar) : _teiknaPersonu(p, S, talar))
      : kind === 'aron' ? _teiknaAron(S) : _teiknaOthekkt(S);
    _avCache.set(key, s);
  }
  return s;
}

/** data-URI fyrir <img src> eða CSS background þar sem inline-SVG hentar ekki. */
export function avatarDataUri(id, opts) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(avatarSvg(id, opts));
}
