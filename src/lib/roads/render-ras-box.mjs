// Isomorphic HTML-strengs teiknari fyrir „Samkvæmt RÁS"-kassa (fréttavél + þingmál).
// Litir eftir valens (POLARITY·dir): grænt=gott, rautt=slæmt, blátt=hlutlaust. Sömu gildi og hermir.astro.
const COL = { '1': '#54d08a', '0': '#6ea8fe', '-1': '#e78284' };
const arrow = (dir) => dir > 0 ? '▲' : dir < 0 ? '▼' : '■';
function fmt(delta, unit) {
  const u = unit === '% VLF' ? '%' : unit;
  const dec = Math.abs(delta) < 1 ? 2 : 1;
  return (delta > 0 ? '+' : '') + delta.toLocaleString('is-IS', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (u ? ' ' + u : '');
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderRasBox(p) {
  if (!p || !Array.isArray(p.topEffects) || !p.topEffects.length) return '';
  const badge = p.illustrative ? '<span class="r-ras-badge">dæmi til skýringar</span>' : '';
  const perNote = p.mode === 'links' ? ' <span class="r-ras-per">(á hverja +1 ' + esc((p.perUnit === '' || p.perUnit == null) ? 'ein.' : p.perUnit) + ')</span>' : '';
  const rows = p.topEffects.map((e) => {
    const c = COL[String(e.valence)] || COL['0'];
    return '<div class="r-ras-row"><span class="r-ras-lbl">' + esc(e.label) + '</span>'
      + '<span class="r-ras-val" style="color:' + c + '">' + arrow(e.dir) + ' ' + esc(fmt(e.delta, e.unit)) + '</span></div>';
  }).join('');
  const disc = 'Stílfærð sviðsmynd úr opna RÁS-hermin um — ekki spá.' + (p.illustrative ? ' Byggt á dæmi-stærð.' : '');
  const cta = p.deepLink ? '<a class="r-ras-cta" href="' + esc(p.deepLink) + '">Prófa í RÁS →</a>' : '';
  return '<div class="r-ras">'
    + '<div class="r-ras-h">📊 Samkvæmt RÁS-hermi' + perNote + ' ' + badge + '</div>'
    + (p.inputLabel ? '<div class="r-ras-in">' + esc(p.inputLabel) + '</div>' : '')
    + '<div class="r-ras-rows">' + rows + '</div>'
    + (p.sentence ? '<p class="r-ras-s">' + esc(p.sentence) + '</p>' : '')
    + '<div class="r-ras-foot"><span class="r-ras-disc">' + esc(disc) + '</span>' + cta + '</div>'
    + '</div>';
}
