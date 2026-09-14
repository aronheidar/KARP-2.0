// spjald.mjs — HREIN eining: beinagrindin starfsmannaspjalds → HTML-strengur.
//
// Fimm hólf, alltaf í sömu röð: haus · bíður þín · í vinnslu · tölur · það sem ég má gera.
// Það er þessi endurtekning sem gerir spjöldin að liði frekar en ólíkum mælaborðum — og hún
// er ástæða þess að beinagrindin er ein eining en ekki afrituð inn í hvert spjald.
//
// ⚠ ALLT sem kemur úr gögnum fer gegnum esc(). EINA hráa innsetningin er `avatar` — fast,
//   forritað SVG úr personur.mjs (sama regla og Moot-salurinn fylgir).

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Gögn utan úr heimi eru ekki alltaf það sem þau eiga að vera. Spjaldið á að teikna það sem það
 *  skilur og sleppa hinu — aldrei hverfa af því eitt svið kom rangt. */
function fylki(x) {
  return Array.isArray(x) ? x.filter((i) => i && typeof i === 'object') : [];
}

function strengir(x) {
  return Array.isArray(x) ? x.filter((i) => typeof i === 'string' && i) : [];
}

/** Aðeins kjölfestur á sömu síðu og https-slóðir. `javascript:` og `data:` eiga ekkert erindi í href
 *  sem er byggt úr gögnum — og stafa-escape stöðvar þau ekki. */
function slodOrugg(s) {
  const t = String(s == null ? '' : s);
  return /^(#|https:\/\/)/.test(t) ? t : '#';
}

/** esc() ver `< > & " '` — nóg til að ekkert NÝTT eigindi verði til. En hún lætur `=` ósnert, svo
 *  strengur sem apar eftir heilu eigindi (t.d. `" onmouseover="alert(1)" x="`) skilur orðið eftir
 *  sýnilegt í úttakinu þótt gæsalappirnar séu escape-aðar og engin árás komist í gegn. Þetta er
 *  notað ofan á esc() á öllum ytri gagnasviðum spjaldsins svo ekkert eigindalíkt sjáist yfirhöfuð —
 *  esc() sjálf helst óbreytt (hún er prófuð stök annars staðar). */
function escOrugg(s) {
  return esc(s).replace(/=/g, '&#61;');
}

/** „fyrir 2 klst" / „fyrir 3 daga" — biðtími er það sem segir hvort eitthvað sé að gleymast. */
export function bidTexti(sek) {
  const s = Math.max(0, Math.floor(Number(sek) || 0));
  if (s < 3600) return 'fyrir ' + Math.max(1, Math.round(s / 60)) + ' mín';
  if (s < 86400) return 'fyrir ' + Math.round(s / 3600) + ' klst';
  return 'fyrir ' + Math.round(s / 86400) + ' daga';
}

function hola(titill, innihald, n, aukastett) {
  if (!innihald) return '';
  return '<section class="stj-hola' + (aukastett ? ' ' + aukastett : '') + '"><h3>' + esc(titill)
    + (n ? ' <span class="stj-hola-n">' + esc(String(n)) + '</span>' : '') + '</h3>' + innihald + '</section>';
}

export function spjald({ id, nafn, hlutverk, avatar = '', stada = '', sidast = '', bidur = [], vinnsla = [], tolur = [], heimildir = [], rofi = null } = {}) {
  const bidurListi = fylki(bidur);
  const bidurHtml = bidurListi.map((r) => '<a class="stj-bidur-rod' + (r.adkallandi ? ' stj-bidur-rod--adkallandi' : '') + '" href="' + escOrugg(slodOrugg(r.slod)) + '" data-tegund="' + escOrugg(r.tegund) + '">'
    + '<span class="stj-bidur-titill">' + escOrugg(r.titill) + '</span>'
    + (r.vidbot ? '<span class="stj-bidur-vidbot">' + escOrugg(r.vidbot) + '</span>' : '')
    + '<span class="stj-bidur-bid">' + esc(bidTexti(r.bid)) + '</span></a>').join('');
  const vinnslaHtml = fylki(vinnsla).map((v) => '<li><span class="stj-vinnsla-texti">' + escOrugg(v.texti) + '</span>'
    + (v.hvenaer ? '<span class="stj-vinnsla-hvenaer">' + escOrugg(v.hvenaer) + '</span>' : '') + '</li>').join('');
  const tolurHtml = fylki(tolur).map((t) => '<div class="stj-card"><div class="n">' + escOrugg(t.n) + '</div><div class="l">' + escOrugg(t.l) + '</div>'
    + (t.s ? '<div class="s">' + escOrugg(t.s) + '</div>' : '') + '</div>').join('');
  const heimildirHtml = strengir(heimildir).map((h) => '<li>' + escOrugg(h) + '</li>').join('');
  const rofiHtml = rofi && rofi.lykill
    ? '<button type="button" class="stj-btn stj-btn-sm stj-rofi" data-rofi="' + escOrugg(rofi.lykill) + '" data-off="' + (rofi.off ? '1' : '0') + '">'
      + (rofi.off ? '⛔ Sjálfvirkni slökkt — kveikja' : '🟢 Sjálfvirkni á — slökkva') + '</button>'
    : '';

  return '<div class="stj-spjald" data-starfsmadur="' + escOrugg(id) + '">'
    + '<div class="stj-spjald-haus">' + avatar
    + '<div class="stj-spjald-nafn"><h2>' + escOrugg(nafn) + ' <span>' + escOrugg(hlutverk) + '</span></h2>'
    + (stada ? '<p class="stj-spjald-stada">' + escOrugg(stada) + '</p>' : '')
    + (sidast ? '<p class="stj-spjald-sidast">síðast virk(ur): ' + escOrugg(sidast) + '</p>' : '') + '</div>'
    + rofiHtml + '</div>'
    + hola('Bíður þín', bidurHtml, bidurListi.length, 'stj-hola--bidur')
    + hola('Í vinnslu / síðast gert', vinnslaHtml ? '<ul class="stj-vinnsla">' + vinnslaHtml + '</ul>' : '')
    + hola('Tölur sem ég vakta', tolurHtml ? '<div class="stj-cards">' + tolurHtml + '</div>' : '')
    + hola('Það sem ég má gera', heimildirHtml ? '<ul class="stj-heimildir">' + heimildirHtml + '</ul>' : '')
    + '</div>';
}
