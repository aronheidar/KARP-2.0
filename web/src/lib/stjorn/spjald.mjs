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
  const bidurHtml = (bidur || []).map((r) => '<a class="stj-bidur-rod' + (r.adkallandi ? ' stj-bidur-rod--adkallandi' : '') + '" href="' + esc(r.slod) + '" data-tegund="' + esc(r.tegund) + '">'
    + '<span class="stj-bidur-titill">' + esc(r.titill) + '</span>'
    + (r.vidbot ? '<span class="stj-bidur-vidbot">' + esc(r.vidbot) + '</span>' : '')
    + '<span class="stj-bidur-bid">' + esc(bidTexti(r.bid)) + '</span></a>').join('');
  const vinnslaHtml = (vinnsla || []).map((v) => '<li><span class="stj-vinnsla-texti">' + esc(v.texti) + '</span>'
    + (v.hvenaer ? '<span class="stj-vinnsla-hvenaer">' + esc(v.hvenaer) + '</span>' : '') + '</li>').join('');
  const tolurHtml = (tolur || []).map((t) => '<div class="stj-card"><div class="n">' + esc(t.n) + '</div><div class="l">' + esc(t.l) + '</div>'
    + (t.s ? '<div class="s">' + esc(t.s) + '</div>' : '') + '</div>').join('');
  const heimildirHtml = (heimildir || []).map((h) => '<li>' + esc(h) + '</li>').join('');
  const rofiHtml = rofi && rofi.lykill
    ? '<button type="button" class="stj-btn stj-btn-sm stj-rofi" data-rofi="' + esc(rofi.lykill) + '" data-off="' + (rofi.off ? '1' : '0') + '">'
      + (rofi.off ? '⛔ Sjálfvirkni slökkt — kveikja' : '🟢 Sjálfvirkni á — slökkva') + '</button>'
    : '';

  return '<div class="stj-spjald" data-starfsmadur="' + esc(id) + '">'
    + '<div class="stj-spjald-haus">' + avatar
    + '<div class="stj-spjald-nafn"><h2>' + esc(nafn) + ' <span>' + esc(hlutverk) + '</span></h2>'
    + (stada ? '<p class="stj-spjald-stada">' + esc(stada) + '</p>' : '')
    + (sidast ? '<p class="stj-spjald-sidast">síðast virk(ur): ' + esc(sidast) + '</p>' : '') + '</div>'
    + rofiHtml + '</div>'
    + hola('Bíður þín', bidurHtml, (bidur || []).length, 'stj-hola--bidur')
    + hola('Í vinnslu / síðast gert', vinnslaHtml ? '<ul class="stj-vinnsla">' + vinnslaHtml + '</ul>' : '')
    + hola('Tölur sem ég vakta', tolurHtml ? '<div class="stj-cards">' + tolurHtml + '</div>' : '')
    + hola('Það sem ég má gera', heimildirHtml ? '<ul class="stj-heimildir">' + heimildirHtml + '</ul>' : '')
    + '</div>';
}
