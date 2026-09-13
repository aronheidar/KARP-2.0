// takn.mjs — HÚSTÁKNIN SEX sem SVG-strengir fyrir innerHTML/sniðmátsstrengi (skýrslur, hnappar, hleðsla).
//
// Af hverju (13.9.2026, afvélvæðing fasi 2): aðgerðahnappar og stöðumerki í greiddu skýrslunum báru
// emojí (🖨️ 🔄 ⭐ 🔔 🔒 🔎) — kerfisletur með eigin litum ofan á einlita palettu, ólíkt á hverju stýrikerfi.
// Þetta eru EINU myndtáknin sem úttektin taldi eiga rétt á sér sem tákn (viðmótsaðgerðir sem notandi
// þekkir úr öðrum kerfum); allt annað er orð, litur eða ekkert.
//
// Reglur: 24×24 viewBox · stroke="currentColor" fill="none" · 1.75 breidd · aria-hidden (textinn við
// hliðina ber merkinguna; sé tákn EITT á hnappi verður hnappurinn að bera aria-label). Erfa lit og þema.
// Í Astro-sniðmátum má líma sömu SVG inline; þessi eining er fyrir JS-strengi.

const svg = (body, size) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '
  + 'style="display:inline-block;vertical-align:-.2em;flex:none">' + body + '</svg>';

export const TAKN = {
  /** stækkunargler — leit */
  leit:      (s = 16) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>', s),
  /** prentari — PDF / prenta */
  prenta:    (s = 16) => svg('<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>', s),
  /** hringör — sækja aftur / endurhlaða */
  endurnyja: (s = 16) => svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>', s),
  /** bókamerki — fylgja */
  fylgja:    (s = 16) => svg('<path d="M6 3h12v18l-6-4-6 4z"/>', s),
  /** bjalla — vakta */
  vakta:     (s = 16) => svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>', s),
  /** hengilás — læst / áskrift þarf */
  laest:     (s = 16) => svg('<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', s),
};

/** Tákn + orð með réttu bili, fyrir hnappatexta: takn('prenta') + 'PDF' */
export const takn = (nafn, size) => (TAKN[nafn] ? TAKN[nafn](size) + ' ' : '');
