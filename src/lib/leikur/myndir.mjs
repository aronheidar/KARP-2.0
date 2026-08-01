// Myndefni RÁS-leiksins (hönnunarskjal 2026-08-01-leikur-upplifun-2, kafli G — þjónar C/D):
// flatar, geometrískar SVG-myndir bakaðar inn sem strengir — engin ytri assets, leikurinn
// getur aldrei brotnað á vöntun myndar. Enginn texti í SVG, engir gradientar, engin id
// (mega birtast mörgum sinnum í sama DOM án árekstra). CSS ræður stærð (ekkert width/height).
// ⚠ Forsætisráðherrann er SKÁLDUÐ persóna — líkist engum raunverulegum stjórnmálamanni.

// Fast litaspjald (AÐEINS þessir litir + gagnsæi):
const BG = '#1a2130'; // dökkur grunnur
const INK = '#cdd6e6'; // ljós-ink
const GULL = '#f6b13b';
const RAUTT = '#e78284';
const BLATT = '#8ca0c8';
const GRAENT = '#42d086';
const DEMPAD = '#5d6b85';

const svg180 = (inner) =>
  `<svg viewBox="0 0 320 180" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
  `<rect width="320" height="180" fill="${BG}"/>` + inner + '</svg>';
const svg120 = (inner) =>
  `<svg viewBox="0 0 120 120" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` + inner + '</svg>';

// ---------- smáhjálparar (endurnýtt form) ----------
const fiskur = (x, y, s, lit, rond = false, op = 1) =>
  `<g transform="translate(${x},${y}) scale(${s})" opacity="${op}">` +
  `<ellipse rx="11" ry="4" fill="${lit}"/>` +
  `<polygon points="9,0 16,-5 16,5" fill="${lit}"/>` +
  `<circle cx="-6.5" cy="-0.8" r=".9" fill="${BG}"/>` +
  (rond ? `<path d="M-7,-2 q4,2.5 8,1.5" stroke="${BG}" stroke-width=".8" fill="none" opacity=".5"/>` : '') +
  '</g>';

const madur = (x, y, op) =>
  `<circle cx="${x}" cy="${y}" r="7" fill="${DEMPAD}" opacity="${op}"/>` +
  `<rect x="${x - 11}" y="${y + 8}" width="22" height="26" rx="8" fill="${DEMPAD}" opacity="${op}"/>`;

const hnefi = (x1, y1, x2, y2, op = 0.9) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${DEMPAD}" stroke-width="5" stroke-linecap="round" opacity="${op}"/>` +
  `<rect x="${x2 - 5.5}" y="${y2 - 6}" width="11" height="10" rx="4" fill="${DEMPAD}" opacity="${op}"/>`;

const skapur = (x, y, w, h, ljos, loftrasir = false) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${DEMPAD}" fill-opacity=".26" stroke="${BLATT}" stroke-opacity=".55" stroke-width="1.4"/>` +
  (loftrasir
    ? `<line x1="${x + 6}" y1="${y + h - 13}" x2="${x + w - 14}" y2="${y + h - 13}" stroke="${INK}" stroke-opacity=".16" stroke-width="2"/>` +
      `<line x1="${x + 6}" y1="${y + h - 7}" x2="${x + w - 14}" y2="${y + h - 7}" stroke="${INK}" stroke-opacity=".16" stroke-width="2"/>`
    : '') +
  ljos.map((l, i) => `<circle cx="${x + w - 7}" cy="${y + 7 + i * 7}" r="1.7" fill="${l}"/>`).join('');

const gluggi = (x, y, w, h, lit = BG, op = 0.9, rx = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${lit}" opacity="${op}"/>`;

// ---------- 8 atviks-myndir (öll SURPRISE_EVENTS-id) ----------

// eldgos: eldfjall með hraunbunu og öskuskýi
const eldgos = svg180(
  `<circle cx="288" cy="28" r="10" fill="${INK}" opacity=".22"/>` +
  `<ellipse cx="158" cy="13" rx="42" ry="12" fill="${DEMPAD}" opacity=".35"/>` +
  `<ellipse cx="118" cy="22" rx="26" ry="11" fill="${DEMPAD}" opacity=".5"/>` +
  `<ellipse cx="188" cy="24" rx="28" ry="12" fill="${DEMPAD}" opacity=".6"/>` +
  `<ellipse cx="150" cy="30" rx="34" ry="14" fill="${DEMPAD}" opacity=".8"/>` +
  `<circle cx="210" cy="44" r="2" fill="${DEMPAD}" opacity=".8"/>` +
  `<circle cx="102" cy="40" r="2.4" fill="${DEMPAD}" opacity=".7"/>` +
  `<circle cx="230" cy="32" r="1.6" fill="${DEMPAD}" opacity=".6"/>` +
  `<polygon points="0,154 64,106 132,152" fill="${DEMPAD}" opacity=".28"/>` +
  `<polygon points="52,180 138,88 148,76 172,76 182,88 268,180" fill="${DEMPAD}" opacity=".55"/>` +
  `<circle cx="160" cy="78" r="40" fill="${GULL}" opacity=".1"/>` +
  `<circle cx="160" cy="78" r="26" fill="${GULL}" opacity=".16"/>` +
  `<circle cx="160" cy="78" r="14" fill="${GULL}" opacity=".26"/>` +
  `<polygon points="152,78 158,34 161,78" fill="${RAUTT}"/>` +
  `<polygon points="157,78 165,46 169,78" fill="${GULL}" opacity=".9"/>` +
  `<polygon points="148,78 146,52 153,78" fill="${GULL}" opacity=".7"/>` +
  `<circle cx="140" cy="60" r="2" fill="${GULL}"/>` +
  `<circle cx="180" cy="54" r="1.8" fill="${GULL}"/>` +
  `<circle cx="160" cy="40" r="2.2" fill="${RAUTT}"/>` +
  `<circle cx="148" cy="30" r="1.5" fill="${GULL}"/>` +
  `<circle cx="174" cy="34" r="1.6" fill="${RAUTT}"/>` +
  `<circle cx="190" cy="64" r="2" fill="${RAUTT}"/>` +
  `<circle cx="132" cy="44" r="1.4" fill="${GULL}"/>` +
  `<circle cx="166" cy="22" r="1.6" fill="${GULL}"/>` +
  `<path d="M150,80 Q140,110 118,132" stroke="${RAUTT}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
  `<path d="M168,80 Q178,108 198,128" stroke="${RAUTT}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` +
  `<path d="M160,82 Q160,114 152,142" stroke="${GULL}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".9"/>` +
  `<polygon points="196,180 244,128 320,170 320,180" fill="${DEMPAD}" opacity=".35"/>` +
  `<polygon points="0,180 0,160 44,148 100,180" fill="${DEMPAD}" opacity=".4"/>`
);

// makrill: fiskitorfa (8 einfaldaðir fiskar) í sjó
const makrill = svg180(
  `<rect y="44" width="320" height="136" fill="${BLATT}" opacity=".14"/>` +
  `<rect y="112" width="320" height="68" fill="${BLATT}" opacity=".1"/>` +
  `<path d="M0,46 q20,-7 40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0" stroke="${INK}" stroke-width="2" fill="none" opacity=".55"/>` +
  `<polygon points="60,47 96,47 76,142 58,142" fill="${INK}" opacity=".05"/>` +
  `<polygon points="180,47 208,47 236,142 198,142" fill="${INK}" opacity=".04"/>` +
  fiskur(64, 84, 1.15, BLATT, true) +
  fiskur(114, 72, 1, BLATT) +
  fiskur(162, 88, 1.3, INK, true, 0.92) +
  fiskur(212, 70, 1, BLATT, false, 0.95) +
  fiskur(94, 114, 1.05, GRAENT, true, 0.95) +
  fiskur(148, 124, 0.9, BLATT, false, 0.9) +
  fiskur(200, 112, 1.2, BLATT, true) +
  fiskur(252, 94, 0.95, INK, false, 0.85) +
  `<circle cx="86" cy="66" r="1.6" fill="${INK}" opacity=".3"/>` +
  `<circle cx="180" cy="60" r="2.2" fill="${INK}" opacity=".3"/>` +
  `<circle cx="240" cy="84" r="1.5" fill="${INK}" opacity=".3"/>` +
  `<circle cx="140" cy="100" r="1.3" fill="${INK}" opacity=".3"/>`
);

// verkfall: upprétt kröfuspjöld og hnefar
const verkfall = svg180(
  `<rect y="150" width="320" height="30" fill="${DEMPAD}" opacity=".22"/>` +
  madur(54, 131, 0.9) + madur(96, 134, 0.7) + madur(140, 129, 0.95) +
  madur(184, 133, 0.65) + madur(228, 130, 0.85) + madur(270, 134, 0.75) +
  `<line x1="68" y1="66" x2="60" y2="128" stroke="${DEMPAD}" stroke-width="3"/>` +
  `<rect x="38" y="30" width="60" height="36" rx="3" fill="${INK}"/>` +
  `<rect x="46" y="40" width="44" height="5" fill="${DEMPAD}"/>` +
  `<rect x="46" y="50" width="30" height="5" fill="${DEMPAD}" opacity=".7"/>` +
  `<line x1="159" y1="56" x2="150" y2="126" stroke="${DEMPAD}" stroke-width="3"/>` +
  `<rect x="126" y="16" width="66" height="40" rx="3" fill="${GULL}"/>` +
  `<rect x="134" y="28" width="50" height="6" fill="${BG}" opacity=".8"/>` +
  `<rect x="134" y="38" width="34" height="6" fill="${BG}" opacity=".8"/>` +
  `<line x1="242" y1="66" x2="248" y2="128" stroke="${DEMPAD}" stroke-width="3"/>` +
  `<rect x="214" y="34" width="56" height="32" rx="3" fill="${RAUTT}"/>` +
  `<rect x="222" y="44" width="40" height="5" fill="${INK}"/>` +
  `<rect x="222" y="52" width="26" height="5" fill="${INK}" opacity=".7"/>` +
  `<line x1="114" y1="96" x2="118" y2="130" stroke="${DEMPAD}" stroke-width="2.5"/>` +
  `<rect x="96" y="72" width="36" height="24" rx="2" fill="${BLATT}"/>` +
  `<rect x="102" y="80" width="24" height="4" fill="${BG}" opacity=".75"/>` +
  hnefi(30, 128, 24, 104) +
  hnefi(200, 126, 206, 92) +
  hnefi(292, 130, 288, 106)
);

// gagnaver: raðir af server-skápum með ljósdíóðum
const gagnaver = svg180(
  `<rect x="40" y="8" width="70" height="4" rx="2" fill="${INK}" opacity=".14"/>` +
  `<rect x="190" y="8" width="70" height="4" rx="2" fill="${INK}" opacity=".14"/>` +
  `<line x1="0" y1="20" x2="320" y2="20" stroke="${DEMPAD}" stroke-width="2" opacity=".5"/>` +
  `<rect y="152" width="320" height="28" fill="${BLATT}" opacity=".07"/>` +
  `<line x1="0" y1="152" x2="320" y2="152" stroke="${BLATT}" stroke-width="1.5" opacity=".35"/>` +
  skapur(40, 36, 42, 52, [GRAENT, GULL]) +
  skapur(106, 36, 42, 52, [GRAENT, GRAENT]) +
  skapur(172, 36, 42, 52, [GULL, GRAENT]) +
  skapur(238, 36, 42, 52, [RAUTT, GRAENT]) +
  skapur(44, 100, 64, 56, [GRAENT, GRAENT, GULL], true) +
  skapur(124, 100, 64, 56, [GRAENT, RAUTT, GRAENT], true) +
  skapur(204, 100, 64, 56, [GULL, GRAENT, GRAENT], true)
);

// spilling: dagblaðssíða með stækkunargleri (rauðu línurnar stækkaðar undir glerinu)
const spilling = svg180(
  `<rect x="62" y="26" width="168" height="132" rx="2" fill="${DEMPAD}" opacity=".5"/>` +
  `<rect x="56" y="20" width="168" height="132" rx="2" fill="${INK}"/>` +
  `<rect x="68" y="30" width="104" height="13" rx="1" fill="${BG}" opacity=".88"/>` +
  `<rect x="184" y="34" width="28" height="5" fill="${DEMPAD}" opacity=".8"/>` +
  `<rect x="68" y="52" width="144" height="8" fill="${DEMPAD}"/>` +
  `<rect x="68" y="64" width="96" height="8" fill="${DEMPAD}" opacity=".85"/>` +
  `<rect x="68" y="80" width="58" height="42" fill="${BLATT}"/>` +
  `<circle cx="86" cy="94" r="6" fill="${INK}" opacity=".85"/>` +
  `<polygon points="68,122 88,104 106,114 126,102 126,122" fill="${DEMPAD}" opacity=".8"/>` +
  `<rect x="134" y="82" width="80" height="4" fill="${DEMPAD}" opacity=".7"/>` +
  `<rect x="134" y="90" width="72" height="4" fill="${DEMPAD}" opacity=".7"/>` +
  `<rect x="134" y="98" width="80" height="4" fill="${DEMPAD}" opacity=".7"/>` +
  `<rect x="68" y="138" width="140" height="4" fill="${DEMPAD}" opacity=".6"/>` +
  `<rect x="68" y="145" width="92" height="4" fill="${DEMPAD}" opacity=".45"/>` +
  `<circle cx="200" cy="118" r="33" fill="${BLATT}" opacity=".16"/>` +
  `<rect x="176" y="112" width="46" height="7" rx="1" fill="${RAUTT}"/>` +
  `<rect x="176" y="126" width="34" height="7" rx="1" fill="${RAUTT}" opacity=".85"/>` +
  `<circle cx="200" cy="118" r="27.5" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".35"/>` +
  `<circle cx="200" cy="118" r="33" fill="none" stroke="${GULL}" stroke-width="5"/>` +
  `<path d="M184,102 q7,-8 18,-8" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".7"/>` +
  `<rect x="220.5" y="138" width="13" height="42" rx="6" fill="${GULL}" transform="rotate(-45 227 140)"/>`
);

// tsunami (óveður og samgöngurof): stormbylgja/snjókoma yfir raflínumastri, slitin lína
const tsunami = svg180(
  `<ellipse cx="70" cy="20" rx="46" ry="13" fill="${DEMPAD}" opacity=".55"/>` +
  `<ellipse cx="170" cy="14" rx="56" ry="14" fill="${DEMPAD}" opacity=".45"/>` +
  `<ellipse cx="262" cy="24" rx="44" ry="12" fill="${DEMPAD}" opacity=".5"/>` +
  `<line x1="6" y1="50" x2="58" y2="59" stroke="${BLATT}" stroke-width="2" opacity=".5"/>` +
  `<line x1="64" y1="84" x2="116" y2="93" stroke="${BLATT}" stroke-width="2" opacity=".45"/>` +
  `<line x1="30" y1="120" x2="82" y2="129" stroke="${BLATT}" stroke-width="2" opacity=".4"/>` +
  `<line x1="210" y1="58" x2="262" y2="67" stroke="${BLATT}" stroke-width="2" opacity=".5"/>` +
  `<line x1="248" y1="100" x2="300" y2="109" stroke="${BLATT}" stroke-width="2" opacity=".45"/>` +
  `<circle cx="46" cy="66" r="1.8" fill="${INK}" opacity=".7"/>` +
  `<circle cx="92" cy="48" r="1.4" fill="${INK}" opacity=".6"/>` +
  `<circle cx="120" cy="96" r="2" fill="${INK}" opacity=".75"/>` +
  `<circle cx="196" cy="40" r="1.5" fill="${INK}" opacity=".6"/>` +
  `<circle cx="232" cy="76" r="1.8" fill="${INK}" opacity=".7"/>` +
  `<circle cx="276" cy="58" r="1.4" fill="${INK}" opacity=".55"/>` +
  `<circle cx="148" cy="64" r="1.5" fill="${INK}" opacity=".6"/>` +
  `<circle cx="290" cy="122" r="1.9" fill="${INK}" opacity=".7"/>` +
  `<rect y="158" width="320" height="22" fill="${INK}" opacity=".13"/>` +
  `<ellipse cx="120" cy="160" rx="60" ry="7" fill="${INK}" opacity=".1"/>` +
  `<line x1="136" y1="158" x2="152" y2="46" stroke="${DEMPAD}" stroke-width="3.5"/>` +
  `<line x1="184" y1="158" x2="168" y2="46" stroke="${DEMPAD}" stroke-width="3.5"/>` +
  `<line x1="152" y1="46" x2="168" y2="46" stroke="${DEMPAD}" stroke-width="3"/>` +
  `<line x1="140" y1="134" x2="180" y2="118" stroke="${DEMPAD}" stroke-width="1.5" opacity=".8"/>` +
  `<line x1="180" y1="134" x2="140" y2="118" stroke="${DEMPAD}" stroke-width="1.5" opacity=".8"/>` +
  `<line x1="146" y1="96" x2="174" y2="84" stroke="${DEMPAD}" stroke-width="1.5" opacity=".8"/>` +
  `<line x1="174" y1="96" x2="146" y2="84" stroke="${DEMPAD}" stroke-width="1.5" opacity=".8"/>` +
  `<line x1="118" y1="60" x2="202" y2="60" stroke="${DEMPAD}" stroke-width="3.5"/>` +
  `<line x1="128" y1="80" x2="192" y2="80" stroke="${DEMPAD}" stroke-width="3"/>` +
  `<rect x="118.5" y="60" width="2.5" height="7" fill="${INK}" opacity=".8"/>` +
  `<rect x="199" y="60" width="2.5" height="7" fill="${INK}" opacity=".8"/>` +
  `<rect x="128.5" y="80" width="2.5" height="6" fill="${INK}" opacity=".8"/>` +
  `<rect x="189" y="80" width="2.5" height="6" fill="${INK}" opacity=".8"/>` +
  `<path d="M-6,38 Q56,64 120,67" stroke="${INK}" stroke-width="1.6" fill="none" opacity=".75"/>` +
  `<path d="M130,86 Q70,98 -6,88" stroke="${INK}" stroke-width="1.6" fill="none" opacity=".7"/>` +
  `<path d="M200,67 q8,24 -4,48" stroke="${INK}" stroke-width="1.6" fill="none" opacity=".75"/>` +
  `<path d="M326,46 Q292,56 262,54" stroke="${INK}" stroke-width="1.6" fill="none" opacity=".6"/>` +
  `<circle cx="198" cy="117" r="7" fill="${GULL}" opacity=".25"/>` +
  `<path d="M196,114 l6,-7 l-3,8 l7,-2 l-9,10" stroke="${GULL}" stroke-width="2" fill="none" stroke-linejoin="round"/>`
);

// nyskopun: ljósapera með geislum og ör upp á við
const nyskopun = svg180(
  `<circle cx="120" cy="72" r="46" fill="${GULL}" opacity=".06"/>` +
  `<circle cx="120" cy="72" r="34" fill="${GULL}" opacity=".1"/>` +
  `<circle cx="120" cy="72" r="24" fill="${GULL}" opacity=".15"/>` +
  `<circle cx="120" cy="72" r="30" fill="${GULL}" opacity=".16"/>` +
  `<circle cx="120" cy="72" r="30" fill="none" stroke="${GULL}" stroke-width="2.5"/>` +
  `<path d="M112,82 q4,-14 8,0 q4,-14 8,0" stroke="${GULL}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
  `<line x1="112" y1="82" x2="112" y2="97" stroke="${GULL}" stroke-width="2"/>` +
  `<line x1="128" y1="82" x2="128" y2="97" stroke="${GULL}" stroke-width="2"/>` +
  `<rect x="107" y="100" width="26" height="6" rx="2" fill="${DEMPAD}"/>` +
  `<rect x="109" y="108" width="22" height="5" rx="2" fill="${DEMPAD}" opacity=".85"/>` +
  `<rect x="111" y="115" width="18" height="5" rx="2" fill="${DEMPAD}" opacity=".7"/>` +
  `<rect x="115" y="122" width="10" height="4" rx="2" fill="${DEMPAD}" opacity=".6"/>` +
  `<line x1="120" y1="36" x2="120" y2="22" stroke="${GULL}" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>` +
  `<line x1="156" y1="72" x2="170" y2="72" stroke="${GULL}" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>` +
  `<line x1="84" y1="72" x2="70" y2="72" stroke="${GULL}" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>` +
  `<line x1="145" y1="46" x2="155" y2="37" stroke="${GULL}" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>` +
  `<line x1="95" y1="46" x2="85" y2="37" stroke="${GULL}" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>` +
  `<line x1="138" y1="41" x2="145" y2="29" stroke="${GULL}" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>` +
  `<line x1="102" y1="41" x2="95" y2="29" stroke="${GULL}" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>` +
  `<line x1="89" y1="54" x2="77" y2="47" stroke="${GULL}" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>` +
  `<polyline points="196,134 224,110 242,120 284,82" stroke="${GRAENT}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<polygon points="288,78 282,92 274,83" fill="${GRAENT}"/>` +
  `<polygon points="84,109 86,114 91,116 86,118 84,123 82,118 77,116 82,114" fill="${INK}" opacity=".8"/>` +
  `<circle cx="196" cy="52" r="1.8" fill="${INK}" opacity=".6"/>` +
  `<circle cx="254" cy="140" r="2" fill="${GULL}" opacity=".6"/>`
);

// jafnretti: vogarskálar í jafnvægi með hnattkúlu
const jafnretti = svg180(
  `<circle cx="160" cy="62" r="33" fill="${BLATT}" opacity=".92"/>` +
  `<ellipse cx="160" cy="62" rx="14" ry="33" fill="none" stroke="${INK}" stroke-width="1.4" opacity=".5"/>` +
  `<ellipse cx="160" cy="62" rx="33" ry="12" fill="none" stroke="${INK}" stroke-width="1.4" opacity=".5"/>` +
  `<path d="M140,54 q8,-12 22,-9 q7,2 3,8 q-11,9 -21,5 z" fill="${GRAENT}" opacity=".85"/>` +
  `<path d="M162,74 q12,-7 19,1 q3,7 -8,9 q-11,1 -11,-10 z" fill="${GRAENT}" opacity=".75"/>` +
  `<rect x="64" y="98" width="192" height="5" rx="2.5" fill="${INK}"/>` +
  `<circle cx="160" cy="100" r="5.5" fill="${GULL}"/>` +
  `<rect x="156" y="100" width="8" height="52" rx="2" fill="${DEMPAD}"/>` +
  `<rect x="132" y="150" width="56" height="7" rx="3" fill="${DEMPAD}"/>` +
  `<rect x="118" y="159" width="84" height="6" rx="3" fill="${DEMPAD}" opacity=".6"/>` +
  `<line x1="70" y1="103" x2="54" y2="124" stroke="${INK}" stroke-width="1.6" opacity=".7"/>` +
  `<line x1="70" y1="103" x2="86" y2="124" stroke="${INK}" stroke-width="1.6" opacity=".7"/>` +
  `<line x1="250" y1="103" x2="234" y2="124" stroke="${INK}" stroke-width="1.6" opacity=".7"/>` +
  `<line x1="250" y1="103" x2="266" y2="124" stroke="${INK}" stroke-width="1.6" opacity=".7"/>` +
  `<circle cx="70" cy="119.5" r="4.5" fill="${GRAENT}"/>` +
  `<circle cx="250" cy="119.5" r="4.5" fill="${GRAENT}"/>` +
  `<path d="M46,124 h48 q-3,15 -24,15 q-21,0 -24,-15 z" fill="${GULL}"/>` +
  `<path d="M226,124 h48 q-3,15 -24,15 q-21,0 -24,-15 z" fill="${GULL}"/>`
);

export const EVENT_MYNDIR = { eldgos, makrill, verkfall, gagnaver, spilling, tsunami, nyskopun, jafnretti };

// ---------- Forsætisráðherrann (SKÁLDUÐ persóna) — 4 pósar á SAMA grunni ----------
// Grunnformin (bakhringur, jakkaföt, skyrta, bindi+gull-næla, andlit, hár, augu+pm-blikk-lok,
// nef) eru afrituð óbreytt í alla pósa; pósinn stýrir aðeins augabrúnum, munni, öxlum og
// auka-lögum (kreppa: úfið hár, skakkt bindi, svitadropi).
const BRUN = `stroke="${DEMPAD}" stroke-width="2.4" fill="none" stroke-linecap="round"`;
const MUNN = `stroke="${BG}" stroke-width="2.4" fill="none" stroke-linecap="round"`;

function pmMynd({ vl = 0, hl = 0, brunir, munnur, harAuka = '', andlitAuka = '', bindiSkakkt = false }) {
  const bindi =
    `<g${bindiSkakkt ? ` transform="rotate(9 60 86)"` : ''}>` +
    `<polygon points="56,83 64,83 60,89" fill="${RAUTT}"/>` +
    `<polygon points="57.5,88 62.5,88 63.5,102 60,106 56.5,102" fill="${RAUTT}"/>` +
    `<circle cx="60" cy="94" r="1.8" fill="${GULL}"/>` +
    '</g>';
  return svg120(
    `<circle cx="60" cy="60" r="57" fill="${BG}"/>` +
    `<circle cx="60" cy="60" r="57" fill="${BLATT}" opacity=".08"/>` +
    `<circle cx="60" cy="60" r="56" fill="none" stroke="${DEMPAD}" stroke-width="1.5" opacity=".6"/>` +
    `<rect x="53" y="68" width="14" height="16" rx="3" fill="${INK}"/>` +
    `<path d="M13,118 L15,${100 + vl} Q27,${84 + vl} 60,82 Q93,${84 + hl} 105,${100 + hl} L107,118 Z" fill="${DEMPAD}" opacity=".9"/>` +
    `<polygon points="60,82 46,87 56,103 60,90" fill="${BG}" opacity=".6"/>` +
    `<polygon points="60,82 74,87 64,103 60,90" fill="${BG}" opacity=".6"/>` +
    `<polygon points="53,82 67,82 60,95" fill="${INK}"/>` +
    bindi +
    `<circle cx="39" cy="52" r="4" fill="${INK}"/>` +
    `<circle cx="81" cy="52" r="4" fill="${INK}"/>` +
    `<ellipse cx="60" cy="50" rx="20" ry="23" fill="${INK}"/>` +
    `<path d="M40,47 q0,-20 20,-20 q20,0 20,20 q-7,-11 -20,-11 q-13,0 -20,11 z" fill="${DEMPAD}"/>` +
    harAuka +
    `<circle cx="52" cy="50" r="2.7" fill="${BG}"/>` +
    `<circle cx="68" cy="50" r="2.7" fill="${BG}"/>` +
    `<rect class="pm-blikk" x="48.4" y="45.8" width="7.2" height="8" rx="3.4" fill="${INK}" opacity="0"/>` +
    `<rect class="pm-blikk" x="64.4" y="45.8" width="7.2" height="8" rx="3.4" fill="${INK}" opacity="0"/>` +
    `<path d="M60,52 q2.5,5 -1,8" stroke="${DEMPAD}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
    brunir + munnur + andlitAuka
  );
}

export const PM_MYNDIR = {
  // bjartsýnn: lyftar brúnir, bros, opnar axlir, roði í kinnum
  bjartsynn: pmMynd({
    vl: -2, hl: -2,
    brunir: `<path d="M45,42.5 q6,-4 12,-2" ${BRUN}/><path d="M63,40.5 q6,-2 12,2" ${BRUN}/>`,
    munnur: `<path d="M50,64 q10,9 20,0" ${MUNN}/>`,
    andlitAuka: `<circle cx="44" cy="60" r="3" fill="${RAUTT}" opacity=".3"/><circle cx="76" cy="60" r="3" fill="${RAUTT}" opacity=".3"/>`,
  }),
  // hlutlaus: beinar brúnir, beinn munnur
  hlutlaus: pmMynd({
    brunir: `<path d="M46,43.5 h11" ${BRUN}/><path d="M63,43.5 h11" ${BRUN}/>`,
    munnur: `<path d="M52,65.5 h16" ${MUNN}/>`,
  }),
  // áhyggjufullur: innri brúna-endar upp, skeifa, kreppt/lyftar axlir
  ahyggjufullur: pmMynd({
    vl: -7, hl: -7,
    brunir: `<path d="M45,45 q6,0 12,-3.5" ${BRUN}/><path d="M63,41.5 q6,3.5 12,3.5" ${BRUN}/>`,
    munnur: `<path d="M51,67.5 q9,-7 18,0" ${MUNN}/>`,
  }),
  // kreppa: úfið hár, skakkar brúnir, skjálfandi munnur, sigin/skökk öxl, skakkt bindi, svitadropi
  kreppa: pmMynd({
    vl: 5, hl: -3, bindiSkakkt: true,
    brunir: `<path d="M44,40 q7,-3 13,.5" ${BRUN}/><path d="M63,45 q6,-3.5 12,1" ${BRUN}/>`,
    munnur: `<path d="M50,66 q5,5 10,0 q5,5 10,0" ${MUNN}/>`,
    harAuka:
      `<polygon points="41,33 33,26 43,29" fill="${DEMPAD}"/>` +
      `<polygon points="57,27 55,17 62,25" fill="${DEMPAD}"/>` +
      `<polygon points="76,30 85,24 79,33" fill="${DEMPAD}"/>` +
      `<path d="M50,30 q4,7 0,12" stroke="${DEMPAD}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    andlitAuka: `<path d="M84,38 q5.5,8.5 0,11.5 q-5.5,-3 0,-11.5" fill="${BLATT}"/>`,
  }),
};

// ---------- Alþingishúsið: einföld steingrá framhlið, þrjár gluggaraðir, gull-depill ----------
export const ALTHINGI_MYND = svg180(
  `<circle cx="36" cy="30" r="1.6" fill="${INK}" opacity=".5"/>` +
  `<circle cx="292" cy="46" r="1.3" fill="${INK}" opacity=".4"/>` +
  `<circle cx="262" cy="18" r="1.8" fill="${INK}" opacity=".35"/>` +
  `<rect y="156" width="320" height="24" fill="${BLATT}" opacity=".05"/>` +
  `<circle cx="160" cy="22" r="8" fill="${GULL}" opacity=".25"/>` +
  `<circle cx="160" cy="22" r="5" fill="${GULL}"/>` +
  `<rect x="78" y="28" width="164" height="6" rx="2" fill="${DEMPAD}" opacity=".5"/>` +
  `<rect x="74" y="34" width="172" height="12" fill="${DEMPAD}" opacity=".75"/>` +
  `<rect x="66" y="46" width="188" height="7" rx="1" fill="${INK}" opacity=".5"/>` +
  `<rect x="70" y="52" width="180" height="104" fill="${DEMPAD}" opacity=".88"/>` +
  `<rect x="70" y="144" width="180" height="12" fill="${DEMPAD}"/>` +
  `<rect x="70" y="144" width="180" height="12" fill="${BG}" opacity=".25"/>` +
  `<line x1="70" y1="88" x2="250" y2="88" stroke="${INK}" stroke-width="1.5" opacity=".22"/>` +
  `<line x1="70" y1="120" x2="250" y2="120" stroke="${INK}" stroke-width="1.5" opacity=".22"/>` +
  gluggi(86, 37, 8, 8, BG, 0.85) + gluggi(114, 37, 8, 8, BG, 0.85) + gluggi(142, 37, 8, 8, BG, 0.85) +
  gluggi(170, 37, 8, 8, BG, 0.85) + gluggi(198, 37, 8, 8, BG, 0.85) + gluggi(226, 37, 8, 8, BG, 0.85) +
  gluggi(83.5, 92, 13, 19, BG, 0.9, 3) + gluggi(111.5, 92, 13, 19, GULL, 0.85, 3) +
  gluggi(139.5, 92, 13, 19, BG, 0.9, 3) + gluggi(167.5, 92, 13, 19, BG, 0.9, 3) +
  gluggi(195.5, 92, 13, 19, GULL, 0.7, 3) + gluggi(223.5, 92, 13, 19, BG, 0.9, 3) +
  gluggi(83.5, 124, 13, 16, BG, 0.92) + gluggi(111.5, 124, 13, 16, BG, 0.92) +
  gluggi(195.5, 124, 13, 16, BG, 0.92) + gluggi(223.5, 124, 13, 16, BG, 0.92) +
  `<rect x="150" y="124" width="20" height="32" rx="2" fill="${BG}" opacity=".95"/>` +
  `<circle cx="166" cy="141" r="1.2" fill="${GULL}"/>` +
  `<rect x="140" y="156" width="44" height="5" rx="1" fill="${INK}" opacity=".3"/>` +
  `<rect x="132" y="162" width="60" height="5" rx="1" fill="${INK}" opacity=".18"/>`
);

// Mynd fyrir atviks-id — null ef engin til (client fellur þá á emoji-icon atviksins).
export function myndFyrirAtvik(id) {
  return Object.prototype.hasOwnProperty.call(EVENT_MYNDIR, id) ? EVENT_MYNDIR[id] : null;
}
