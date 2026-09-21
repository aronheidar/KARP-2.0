// Samtal við starfsmann á /stjorn/: birting spjallsins og tillögunnar sem hún gerir.
// ÖRYGGI: allt sem kemur frá líkaninu er ÓTRAUST. Hver strengur fer gegnum esc(), og tillaga
// ber aðeins tölur (miðanúmer) sem þjónninn hefur þegar sannreynt gegn raunverulegum miðum —
// birtingin treystir því samt ekki og síar aftur hér. Hrein eining: aðeins esc() úr spjald.mjs.
import { esc } from './spjald.mjs';

const HAMARK_SAGA = 12;   // skilaboð sem birtast og fara með sem samhengi — samtalið er ekki skjalasafn

/** Heilbrigð saga: aðeins þekktir sendendur, aðeins strengir, aðeins síðustu HAMARK_SAGA. */
export function hreinsaSogu(saga) {
  return (Array.isArray(saga) ? saga : [])
    .filter((m) => m && (m.hver === 'aron' || m.hver === 'sigrun') && typeof m.texti === 'string' && m.texti.trim())
    .map((m) => ({ hver: m.hver, texti: m.texti.slice(0, 2000), ...(m.tillaga ? { tillaga: m.tillaga } : {}) }))
    .slice(-HAMARK_SAGA);
}

/** Tillaga um að loka: { adgerd: 'loka', midar: [{ id, efni, astaeda }] } → gátlisti sem Aron staðfestir. */
export function tillagaHtml(t, lykill) {
  if (!t || t.adgerd !== 'loka' || !Array.isArray(t.midar)) return '';
  const midar = t.midar.filter((m) => m && Number.isInteger(Number(m.id)) && Number(m.id) > 0);
  if (!midar.length) return '';
  return '<div class="stj-tillaga" data-lykill="' + esc(lykill) + '">'
    + '<ul>' + midar.map((m) => '<li><label><input type="checkbox" checked data-id="' + Number(m.id) + '"> '
      + '<b>#' + Number(m.id) + '</b> ' + esc(m.efni || '') + (m.astaeda ? ' <span>' + esc(m.astaeda) + '</span>' : '') + '</label></li>').join('')
    + '</ul><button type="button" class="stj-btn stj-btn-sm stj-tillaga-ja">Loka völdum</button>'
    + '<button type="button" class="stj-btn stj-btn-sm stj-tillaga-nei">Ekki núna</button></div>';
}

/** Allt samtalið. Sendandinn sést á stöðu og lit, ekki á nafnamerki fyrir framan hverja línu. */
export function samtalHtml(saga) {
  const s = hreinsaSogu(saga);
  if (!s.length) return '';
  return s.map((m, i) => '<div class="stj-skilabod stj-skilabod--' + m.hver + '">'
    + '<p>' + esc(m.texti).replace(/\n/g, '<br>') + '</p>'
    + (m.hver === 'sigrun' && m.tillaga ? tillagaHtml(m.tillaga, String(i)) : '') + '</div>').join('');
}
