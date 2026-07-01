// parties.mjs — canonical Icelandic party registry (code → name + colour).
// -------------------------------------------------------------------------
// SOURCE OF TRUTH. Replaces THREE drifted copies in dashboard.html:
//   PCODE (l.2335), PARTY_COLORS (l.2342), PARTYCOLORS (l.6038) — the last two
//   even disagreed on colours (#0093d0 vs #3a8dff for Sjálfstæðisflokkur).
// Extracted faithfully from PCODE 2026-07-01 (#2 Á1). Pure data — no DOM, no globals.

export const PARTIES = {
  S: { name: 'Samfylkingin',         color: '#e8436f' },
  D: { name: 'Sjálfstæðisflokkur',   color: '#3a8dff' },
  B: { name: 'Framsóknarflokkur',    color: '#46c06a' },
  C: { name: 'Viðreisn',             color: '#ff8a3d' },
  M: { name: 'Miðflokkurinn',        color: '#1fb6c9' },
  F: { name: 'Flokkur fólksins',     color: '#f5c542' },
  P: { name: 'Píratar',              color: '#7c5cf7' },
  V: { name: 'Vinstri græn',         color: '#5aa84a' },
  J: { name: 'Sósíalistaflokkurinn', color: '#b01e2e' },
  U: { name: 'utan þingflokka',      color: '#8a98ad' },
};

// pcName / pcCol úr mælaborðinu (l.2593–2594).
export const partyName  = (code) => (PARTIES[code] ? PARTIES[code].name  : code);
export const partyColor = (code) => (PARTIES[code] ? PARTIES[code].color : '#8a98ad');

// Nafn → kóði. Þolir þekkt afbrigði (VG-bandstrik o.fl.) — sbr. PARTYALIAS (l.5989).
const ALIASES = {
  'Vinstrihreyfingin - grænt framboð': 'V', // ASCII-bandstrik
  'Vinstrihreyfingin – grænt framboð': 'V', // en-dash afbrigði (kemur fyrir í gögnunum)
  'Vinstri græn': 'V',
  'Sósíalistaflokkur Íslands': 'J',
};
const NAME2CODE = (() => {
  const m = {};
  for (const c in PARTIES) m[PARTIES[c].name] = c;
  for (const n in ALIASES) m[n] = ALIASES[n];
  return m;
})();

export const codeByName  = (name) => NAME2CODE[name] || null;
export const colorByName = (name) => { const c = codeByName(name); return c ? PARTIES[c].color : '#8a98ad'; };
