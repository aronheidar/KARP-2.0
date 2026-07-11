// web/src/data/lausnir.js — Karp+: ein sannleiksuppspretta (þrep + vörur).
// Þrep-stigveldi: eitt þrep per notandi. Hrein rökvísi hér (node-prófanleg) — auth.js vefur.
export const TIER_LVL = { grunnur: 1, fyrirtaeki: 2, fyrirtaeki_plus: 3 };
export function tierLevelOf(tier, isAdmin) { return isAdmin ? 99 : (TIER_LVL[tier] || 0); }

// Vél-læsileg mörk per þrep — ein sannleiksuppspretta fyrir client OG speglað í PHP
// (karp-entitlement.php). -1 = ótakmarkað. reportsMonth = innifaldar stakar skýrslur/mán.
export const LIMITS = {
  grunnur:         { reportsMonth: 2,  follows: 10, ktWatch: 0,   seats: 1,  fjolmidlavakt: false },
  fyrirtaeki:      { reportsMonth: 10, follows: 50, ktWatch: 25,  seats: 5,  fjolmidlavakt: true },
  fyrirtaeki_plus: { reportsMonth: 20, follows: -1, ktWatch: 100, seats: 10, fjolmidlavakt: true },
};
const LIMITS_FREE = { reportsMonth: 0, follows: 3, ktWatch: 0, seats: 1, fjolmidlavakt: false };
const LIMITS_ADMIN = { reportsMonth: -1, follows: -1, ktWatch: -1, seats: -1, fjolmidlavakt: true };
export function limitsFor(tier, isAdmin) { return isAdmin ? LIMITS_ADMIN : (LIMITS[tier] || LIMITS_FREE); }

export const THREP = [
  { slug: 'grunnur', heiti: 'Grunnur', verd: 2900, adgangar: 1, cta: 'Velja Grunn' },
  { slug: 'fyrirtaeki', heiti: 'Fyrirtæki', verd: 6900, adgangar: 5, cta: 'Velja Fyrirtæki', vinsaelt: true },
  { slug: 'fyrirtaeki_plus', heiti: 'Fyrirtæki+', verd: 12900, adgangar: 10, cta: 'Velja Fyrirtæki+' },
];

// Fylkis-raðir fyrir þrep-töfluna: gildi per þrep [grunnur, fyrirtaeki, fyrirtaeki_plus].
// ⚠ Útboðsvaktin, Verðmat fasteigna og Fjölmiðlavakt (stök) eru SÉRLAUSNIR (sjá SERLAUSNIR neðar) —
// ekki þrep-dálkar. Innifaldar skýrslur er SAMEIGINLEGUR pottur (fyrirtæki · eigendur · KYC).
export const EIGINDIR = [
  { titill: 'Fjöldi aðganga', gildi: ['1', '5', '10'] },
  { titill: 'Innifaldar skýrslur á mánuði (fyrirtækja · eigenda · KYC)', gildi: ['2', '10', '20'] },
  { titill: 'Fyrirtækjaskrá + ársreikningar', gildi: [true, true, true] },
  { titill: 'Endanlegir eigendur (UBO) + eignarhald', gildi: [true, true, true] },
  { titill: 'Áreiðanleikamat (KYC)', gildi: [true, true, true] },
  { titill: 'Fyrirtækjavaktin (fylgja félögum)', gildi: ['10 félög', '50 félög', 'ótakmarkað'] },
  { titill: 'Viðskiptamannavakt (kt-vöktun)', gildi: [false, '25 kt', '100 kt'], minTier: 2 },
  { titill: 'Fjölmiðlavakt', gildi: [false, true, true], minTier: 2 },
  { titill: 'Opnar vaktir (styrkir, Lögbirting, vörumerki, skip, ökutæki…)', gildi: [true, true, true] },
  { titill: 'Mitt svæði + frjálsar vaktir (Leitarorða, Eftirlit)', gildi: [true, true, true] },
  { titill: 'Stakar skýrslur — 990 kr hvenær sem er', gildi: [true, true, true] },
  { titill: 'Lánshæfismat · Vanskilaskrá', gildi: ['Bjóðum ekki', 'Bjóðum ekki', 'Bjóðum ekki'], neikvaett: true },
];

// Sérlausnir — sjálfstæðar þjónustu-áskriftir (staflast, óháðar þrepum, 30 daga frítt). Aðskilin spjöld
// í verðskrá. service = karp_sub_<service>; verd = kr./mán.; tol = síðan þar sem áskriftar-gáttin (subGate) er.
export const SERLAUSNIR = [
  { slug: 'utbod', heiti: 'Útboðsvaktin', emoji: '📋', service: 'utbod', verd: 1900, trialDays: 30,
    lysing: 'Öll opinber útboð á einum stað + leitarorðavakt sniðin að þinni verktöku og samkeppnisgreining.',
    fyrir: 'Verktakar og bjóðendur', href: '/utbod/' },
  { slug: 'fasteignir', heiti: 'Fasteignavakt', emoji: '🏠', service: 'fasteign', verd: 3900, trialDays: 30,
    lysing: 'Ótakmörkuð verðmöt fasteigna — sölusaga, fasteigna- og brunabótamat, hverfagögn og sambærilegar eignir.',
    fyrir: 'Fasteignasalar og fjárfestar', href: '/fasteignavakt/' },
  { slug: 'umfjollun', heiti: 'Fjölmiðlavakt', emoji: '📰', service: 'frettir', verd: 3900, trialDays: 30,
    lysing: 'Öll umfjöllun úr 35+ íslenskum miðlum + leitarorðavakt um fyrirtæki, fólk og málefni.',
    fyrir: 'Almannatengsl og ritstjórnir', href: '/frettir/' },
];

const LEGAL = 'Byggt á opinberum gögnum — hvorki lánshæfismat né vanskilaskrá.';

export const VORUR = [
  {
    slug: 'fyrirtaekjaskyrsla', heiti: 'Fyrirtækjaskýrsla', emoji: '🏢',
    gildisloford: 'Full mynd af hvaða íslensku félagi sem er — á augabragði.',
    inngangur: 'Fyrirtækjaskýrsla Karps safnar öllu sem opinberar skrár segja um félag á einn stað: grunnskrá, ársreikninga, greiðslur frá ríkinu, útboð, umfjöllun og lögbirtingar.',
    eiginleikar: [
      { emoji: '🧾', titill: 'Grunnskrá', texti: 'Kennitala, heimilisfang, rekstrarform, ÍSAT-atvinnugrein, VSK-númer og skil ársreikninga.' },
      { emoji: '📊', titill: 'Ársreikninga-KPI', texti: 'Framlegð, ROE/ROA, eiginfjárhlutfall, tekjuvöxtur — fjölár, beint úr ársreikningaskrá.' },
      { emoji: '💰', titill: 'Greiðslur frá ríkinu', texti: 'Samsvörun við opinberar greiðslur og stærstu birgja ríkisins.' },
      { emoji: '📋', titill: 'Útboð & umfjöllun', texti: 'Opinber innkaup félagsins og öll fjölmiðlaumfjöllun tengd því.' },
      { emoji: '🔔', titill: 'Tilkynningar', texti: 'Lögbirtingablaðið, ný vörumerki og opinberir styrkir — vaktað sjálfvirkt.' },
    ],
    skref: [
      { titill: 'Leitaðu', texti: 'Sláðu inn nafn félags eða kennitölu.' },
      { titill: 'Fáðu skýrsluna', texti: 'Full skýrsla á sekúndum — prentvæn PDF.' },
    ],
    verd: { tegund: 'stak', upphaed: 990 },
    synishorn: { label: 'Sjá sýnishorn', href: '/fyrirtaeki/?q=490522-0500' },
    tol: { label: 'Fletta upp félagi', href: '/fyrirtaeki/' },
    description: 'Fyrirtækjaskýrsla Karps — grunnskrá, ársreikninga-KPI, greiðslur frá ríkinu, útboð og umfjöllun um hvaða íslenskt félag sem er. ' + LEGAL,
  },
  {
    slug: 'eigendur', heiti: 'Endanlegir eigendur', emoji: '🔗',
    gildisloford: 'Sjáðu hverjir raunverulega eiga félagið — gegnum allar keðjur.',
    inngangur: 'Eignarhaldsskýrsla sem rekur eignarhald gegnum allar félagakeðjur og sýnir endanlega eigendur, raunverulega eigendur skv. Skattinum og skráða hluthafa.',
    eiginleikar: [
      { emoji: '🕸️', titill: 'Eignarhaldsnet', texti: 'Litakóðað net sem sýnir alla eigendur og eignatengsl gegnum keðjur.' },
      { emoji: '👤', titill: 'Endanlegir eigendur', texti: 'Reiknað eignarhald hvers aðila gegnum allar félagakeðjur.' },
      { emoji: '🏛️', titill: 'Raunverulegir eigendur', texti: 'Skráðir raunverulegir eigendur (>25%) beint frá Skattinum.' },
      { emoji: '📄', titill: 'Hluthafalisti + PDF', texti: 'Skráðir hluthafar úr ársreikningi og prentvæn skýrsla.' },
    ],
    skref: [
      { titill: 'Leitaðu', texti: 'Sláðu inn félag.' },
      { titill: 'Skoðaðu netið', texti: 'Eignarhaldsnet + töflur + PDF.' },
    ],
    verd: { tegund: 'stak', upphaed: 990 },
    synishorn: { label: 'Sjá sýnishorn', href: '/eigendur/?syni=1' },
    tol: { label: 'Fletta upp félagi', href: '/eigendur/' },
    description: 'Endanlegir eigendur — litakóðað eignarhaldsnet gegnum allar félagakeðjur, raunverulegir eigendur og hluthafar. ' + LEGAL,
  },
  {
    slug: 'fasteignamat', heiti: 'Fasteignamat', emoji: '🏠',
    gildisloford: 'Faglegt verðmat hvaða fasteignar sem er — byggt á sölusögu.',
    inngangur: 'Verðmatsskýrsla sem safnar sölusögu, fasteigna- og brunabótamati, hverfagögnum og verðþróun á einn stað og skilar faglegu mati á augabragði.',
    eiginleikar: [
      { emoji: '📈', titill: 'Sölusaga & verðþróun', texti: 'Öll þinglýst kaup eignarinnar og þróun fermetraverðs yfir tíma.' },
      { emoji: '🏷️', titill: 'Fasteigna- & brunabótamat', texti: 'Opinbert mat borið saman við metið markaðsverð.' },
      { emoji: '🗺️', titill: 'Hverfagögn & kort', texti: 'Staðsetning, hverfi og nágrenni á gagnvirku korti + götumynd.' },
      { emoji: '🏘️', titill: 'Sambærilegar eignir', texti: 'Matið unnið á sambærilegum eignum í nágrenninu.' },
    ],
    skref: [
      { titill: 'Sláðu inn heimilisfang', texti: 'Byrjaðu að skrifa — sjálfvirk uppfletting.' },
      { titill: 'Fáðu matið', texti: 'Verðmat + kort + graf + sambærilegar eignir.' },
    ],
    verd: { tegund: 'stak', upphaed: 990 },
    synishorn: { label: 'Sjá sýnishorn', href: '/fasteignavakt/?syni=1' },
    tol: { label: 'Verðmeta eign', href: '/fasteignavakt/' },
    description: 'Faglegt verðmat fasteigna — sölusaga, fasteigna- og brunabótamat, hverfagögn, kort og sambærilegar eignir. ' + LEGAL,
  },
  {
    slug: 'fyrirtaekjavaktin', heiti: 'Fyrirtækjavaktin', emoji: '📡',
    gildisloford: 'Fylgstu með félögum sem skipta þig máli — sjálfvirkar tilkynningar.',
    inngangur: 'Fylgdu félögum og fáðu tilkynningu um leið og eitthvað breytist: nýr ársreikningur, breytt eignarhald, lögbirting eða umfjöllun.',
    eiginleikar: [
      { emoji: '⭐', titill: 'Fylgja félögum', texti: 'Bættu félögum í vaktina þína og fáðu breytingar beint.' },
      { emoji: '🔔', titill: 'Breytingavakt', texti: 'Ársreikningar, eigendur, lögbirtingar og tilkynningar — sjálfvirkt.' },
      { emoji: '👥', titill: 'Viðskiptamannavakt', texti: 'Vaktaðu heilan lista af kennitölum viðskiptavina í einu.' },
      { emoji: '📬', titill: 'Vikulegt yfirlit', texti: 'Samantekt á tölvupósti yfir allt sem gerðist.' },
    ],
    skref: [
      { titill: 'Veldu félög', texti: 'Fylgdu félögum af prófílsíðu þeirra.' },
      { titill: 'Fáðu tilkynningar', texti: 'Breytingar birtast á Mitt svæði + í pósti.' },
    ],
    verd: { tegund: 'threp', threp: 'Grunnur' },
    synishorn: { label: 'Opna vöktunina (Mitt svæði)', href: '/mitt-svaedi/' },
    tol: { label: 'Fletta upp félagi til að fylgja', href: '/fyrirtaeki/' },
    description: 'Fyrirtækjavaktin — fylgstu með félögum og fáðu sjálfvirkar tilkynningar um ársreikninga, eigendur og lögbirtingar. ' + LEGAL,
  },
  {
    slug: 'fjolmidlavakt', heiti: 'Fjölmiðlavakt', emoji: '📰',
    gildisloford: 'Öll umfjöllun um fyrirtæki og fólk — á einum straumi.',
    inngangur: 'Fjölmiðlavakt Karps safnar umfjöllun úr tugum íslenskra miðla og lætur þig vita þegar fjallað er um það sem þú vaktar.',
    eiginleikar: [
      { emoji: '📡', titill: '35+ miðlar', texti: 'Samfelldur straumur úr öllum helstu íslensku fréttamiðlum.' },
      { emoji: '🔎', titill: 'Leitarorðavakt', texti: 'Vaktaðu fyrirtæki, fólk eða málefni og fáðu tilkynningar.' },
      { emoji: '📊', titill: 'Greining & þróun', texti: 'Fjölmiðlavog og þróun umfjöllunar yfir tíma.' },
    ],
    skref: [
      { titill: 'Veldu leitarorð', texti: 'Bættu við því sem þú vilt fylgjast með.' },
      { titill: 'Fylgstu með', texti: 'Umfjöllun birtist jafnóðum + tilkynningar.' },
    ],
    verd: { tegund: 'askrift', upphaed: 3900, service: 'frettir', trialDays: 30 },   // sérlausn (Umfjöllun) — eða innifalið í Fyrirtæki/Fyrirtæki+ þrepum
    synishorn: { label: 'Skoða vöktun', href: '/frettir/' },
    tol: { label: 'Opna Vöktun', href: '/frettir/' },
    description: 'Fjölmiðlavakt — öll umfjöllun um fyrirtæki og fólk úr 35+ íslenskum miðlum, með leitarorðavakt og greiningu. ' + LEGAL,
  },
  {
    slug: 'utbodsvaktin', heiti: 'Útboðsvaktin', emoji: '📋',
    gildisloford: 'Ekki missa af opinberu útboði — leitað og vaktað fyrir þig.',
    inngangur: 'Útboðsvaktin safnar öllum opinberum útboðum á einn stað, með leitarorðavakt og samkeppnisgreiningu.',
    eiginleikar: [
      { emoji: '📋', titill: 'Öll opinber útboð', texti: 'Samfelldur listi yfir opinber innkaup og útboð.' },
      { emoji: '🔔', titill: 'Leitarorðavakt', texti: 'Fáðu tilkynningu þegar útboð passar við þín leitarorð.' },
      { emoji: '🏁', titill: 'Samkeppnisgreining', texti: 'Sjáðu hverjir vinna útboð og hvernig markaðurinn skiptist.' },
    ],
    skref: [
      { titill: 'Veldu vöktun', texti: 'Bættu við leitarorðum fyrir þinn geira.' },
      { titill: 'Fáðu tilkynningar', texti: 'Ný útboð berast beint til þín.' },
    ],
    verd: { tegund: 'askrift', upphaed: 1900, service: 'utbod', trialDays: 30 },   // sér áskriftarleið (30 daga frítt) — eða innifalið í öllum Karp+ þrepum
    synishorn: { label: 'Skoða útboð', href: '/utbod/' },
    tol: { label: 'Opna Útboðsvaktina', href: '/utbod/' },
    description: 'Útboðsvaktin — öll opinber útboð á einum stað með leitarorðavakt og samkeppnisgreiningu. ' + LEGAL,
  },
  {
    slug: 'areidanleikamat', heiti: 'Áreiðanleikamat', emoji: '✅',
    gildisloford: 'KYC-áreiðanleikamat félags — PEP, eignarhald og staða á einum stað.',
    inngangur: 'Áreiðanleikamat tekur saman það sem þarf fyrir áreiðanleikakönnun: raunverulega eigendur, PEP-skimun stjórnenda og stöðu félagsins í opinberum skrám.',
    eiginleikar: [
      { emoji: '🏛️', titill: 'PEP-skimun', texti: 'Skimun stjórnenda og eigenda gegn lista yfir áhrifafólk í stjórnmálum.' },
      { emoji: '🔗', titill: 'Endanlegir eigendur', texti: 'Raunverulegt eignarhald gegnum allar keðjur.' },
      { emoji: '📑', titill: 'Staða í skrám', texti: 'Skil ársreikninga, lögbirtingar og opinber staða félagsins.' },
      { emoji: '⚠️', titill: 'Áhættumerki', texti: 'Samantekt sem dregur fram það sem þarf að skoða nánar.' },
    ],
    skref: [
      { titill: 'Leitaðu', texti: 'Sláðu inn félag.' },
      { titill: 'Fáðu matið', texti: 'PEP + eigendur + staða + áhættumerki.' },
    ],
    verd: { tegund: 'threp', threp: 'Grunnur' },
    synishorn: { label: 'Sjá sýnishorn', href: '/fyrirtaeki/?vidmot=areidanleiki&q=490522-0500' },
    tol: { label: 'Fletta upp félagi', href: '/fyrirtaeki/?vidmot=areidanleiki' },
    description: 'Áreiðanleikamat (KYC) — PEP-skimun, endanlegir eigendur og staða félags í opinberum skrám. ' + LEGAL,
  },
];

export const VARA_BY_SLUG = Object.fromEntries(VORUR.map((v) => [v.slug, v]));
