// Vikupóstur Sigrúnar á mánudagsmorgni: sama samantekt og á spjaldinu, send Aroni klukkan 08:10.
// HREIN eining. Allt er sniðið úr tölum; líkan skrifar ekkert hér.
// ⚠ Póst-tónn Arons (15.9): engir tvípunktar og engin strik sem greinarmerki, engir listar, stutt.

import { vikutexti, eintala } from './vikutexti.mjs';
import { laerdomsTexti } from './laerdomur.mjs';

const MANUDIR = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
const KVK_THGF = ['engri', 'einni', 'tveimur', 'þremur', 'fjórum'];   // „á tveimur beiðnum"
const KVK_NF = ['engar', 'eina', 'tvær', 'þrjár', 'fjórar'];          // „legg til tvær", þolfall kvk.
const thgf = (n) => (n < KVK_THGF.length ? KVK_THGF[n] : String(n));
const tf = (n) => (n < KVK_NF.length ? KVK_NF[n] : String(n));
const saman = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' og ' + a[a.length - 1]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** „14. til 20. september" eða „28. september til 4. október". Ekkert strik, sjá póst-tóninn. */
export function vikuOrd(v) {
  const a = new Date(v.fra * 1000), b = new Date((v.til - 86400) * 1000);
  return a.getUTCMonth() === b.getUTCMonth()
    ? a.getUTCDate() + '. til ' + b.getUTCDate() + '. ' + MANUDIR[b.getUTCMonth()]
    : a.getUTCDate() + '. ' + MANUDIR[a.getUTCMonth()] + ' til ' + b.getUTCDate() + '. ' + MANUDIR[b.getUTCMonth()];
}

/** „Ég þarf þig á tveimur beiðnum, #12 (nefnir endurgreiðslu) og #15 (í þriðja sinn á 30 dögum)." */
export function hjalparSetning(hjalp) {
  const h = (Array.isArray(hjalp) ? hjalp : []).filter((x) => x && Number(x.id) > 0).slice(0, 5);
  if (!h.length) return '';
  const alls = (Array.isArray(hjalp) ? hjalp : []).filter((x) => x && Number(x.id) > 0).length;
  return 'Ég þarf þig á ' + thgf(alls) + ' ' + (eintala(alls) ? 'beiðni' : 'beiðnum') + ', ' + (alls > h.length ? 'meðal annars ' : '')
    + saman(h.map((x) => '#' + Number(x.id) + (x.texti ? ' (' + String(x.texti) + ')' : ''))) + '.';
}

/** Heitið í gæsalöppum: efnið kemur úr flokkun líkansins í nefnifalli og þolir ekki „um" á undan sér. */
export function greinaSetning(greinar) {
  const g = (Array.isArray(greinar) ? greinar : []).filter((x) => x && x.efni && Array.isArray(x.ids));
  if (!g.length) return '';
  const n = g.length;
  return 'Ég legg til ' + tf(n) + ' ' + (eintala(n) ? 'nýja hjálpargrein' : 'nýjar hjálpargreinar') + ', '
    + saman(g.map((x) => '„' + String(x.efni) + '“')) + ', því sama spurningin hefur borist þrisvar eða oftar. Drögin skrifa ég þegar þú biður um þau.';
}

/**
 * @returns {{efni:string, html:string, texti:string}}
 *   vika = {ar, vika, fra, til} · tolur = sigrunVika · lifandi = {opnir, lengstOpinn} nú
 *   laerdomur = samantektLaerdoms vikunnar · still = það sem gildir í promptinu nú
 *   hjalp = [{id, texti}] · greinar = [{efni, ids}]
 */
export function vikupostur({ vika, tolur = {}, lifandi = {}, laerdomur = null, still = null, hjalp = [], greinar = [] } = {}) {
  const malsgreinar = [
    'Góðan daginn.',
    vikutexti(Object.assign({}, tolur, lifandi)).join(' '),
    laerdomsTexti({ vika: laerdomur, still }).join(' '),
    hjalparSetning(hjalp),
    greinaSetning(greinar),
  ].filter(Boolean);
  const efni = 'Vikan hjá mér, ' + vikuOrd(vika);
  const html = '<div style="font-family:system-ui,Arial,sans-serif;color:#222;max-width:560px;line-height:1.55">'
    + malsgreinar.map((p) => '<p style="margin:0 0 14px">' + esc(p) + '</p>').join('')
    + '<p style="margin:0 0 14px"><a href="https://karp.is/stjorn/#sigrun" style="color:#1d7348">Spjaldið mitt</a> er alltaf opið.</p>'
    + '<p style="margin:18px 0 0">Kveðja,<br>Sigrún</p></div>';
  const texti = malsgreinar.join('\n\n') + '\n\nSpjaldið mitt er á https://karp.is/stjorn/#sigrun\n\nKveðja,\nSigrún';
  return { efni, html, texti };
}
