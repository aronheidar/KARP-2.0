// Vikusamantekt í rödd starfsmanns — SNIÐIN ÚR TÖLUM, aldrei skrifuð af líkani.
// Ástæðan: samantekt sem fer rangt með tölu er verri en engin, og texti sem líkan skrifar
// sama hvað les sem vélaður eftir þrjár vikur. Hér getur hver setning aðeins sagt það sem
// tölurnar segja. Hrein eining: engin import, enginn tími, ekkert Math.random.

// ÍSLENSKT TALNASAMRÆMI: tala sem endar á 1 en ekki 11 tekur EINTÖLU.
// 1 beiðni barst · 21 beiðni barst · 11 beiðnir bárust · 2 beiðnir bárust.
export function eintala(n) {
  const k = Math.abs(Math.trunc(Number(n) || 0));
  return k % 10 === 1 && k % 100 !== 11;
}
const b = (n, et, ft) => (eintala(n) ? et : ft);
const tala = (n) => String(Math.max(0, Math.trunc(Number(n) || 0)));

/** Svartími í mannlegu máli: „undir klukkustund", „3 klst.", „2 sólarhringar". */
export function svartimi(klst) {
  const h = Number(klst);
  if (!Number.isFinite(h) || h < 0) return '';
  if (h < 1) return 'undir klukkustund';
  if (h < 48) return Math.round(h) + ' klst.';
  const d = Math.round(h / 24);
  return d + ' ' + b(d, 'sólarhringur', 'sólarhringar');
}

/**
 * @param {object} t tölur vikunnar
 *   barust, svaradHenni, svaradAroni, tilHrafns, lokad, hafnad, opnir, svartimiKlst (miðgildi),
 *   algengastFlokkur ({ heiti, hlutfall 0..1 }), lengstOpinn ({ id, dagar }),
 *   aaetlad (lokanir/afhendingar áætlaðar — vikan var á undan atburðaskránni)
 * @returns {string[]} setningar — kallandinn ræður hvernig þær eru settar fram
 */
export function vikutexti(t) {
  const s = [];
  const n = Number(t && t.barust) || 0;
  if (n === 0) {
    s.push('Engin beiðni barst í vikunni.');
  } else {
    s.push(tala(n) + ' ' + b(n, 'beiðni barst', 'beiðnir bárust') + ' í vikunni.');
    const hun = Number(t.svaradHenni) || 0, hann = Number(t.svaradAroni) || 0, hr = Number(t.tilHrafns) || 0;
    const hlutar = [];
    if (hun) hlutar.push('ég svaraði ' + tala(hun));
    // Kynhlutlaust: „þú tókst 4 sjálfur" gerði ráð fyrir kyni lesandans út frá nafni.
    if (hann) hlutar.push('þú svaraðir ' + tala(hann));
    if (hr) hlutar.push((t.aaetlad ? 'um það bil ' : '') + tala(hr) + ' ' + b(hr, 'fór', 'fóru') + ' áfram til Hrafns');
    if (hlutar.length) s.push(fyrstiStor(saman(hlutar)) + '.');
  }
  const l = Number(t && t.lokad) || 0, h = Number(t && t.hafnad) || 0;
  if (l || h) {
    const lh = [];
    // „loka"/„hafna" taka þágufall og ópersónulega sögn: 7 var lokað. Sögnin stendur einu sinni:
    // „6 var lokað og 1 hafnað", en „3 var hafnað" þegar engu var lokað (rýnin 21.9: „3 hafnað.").
    if (l) lh.push(tala(l) + ' var lokað');
    if (h) lh.push(tala(h) + (l ? ' hafnað' : ' var hafnað'));
    s.push(fyrstiStor((t.aaetlad ? 'um það bil ' : '') + saman(lh)) + '.');
  }
  const st = svartimi(t && t.svartimiKlst);
  // '3 klst.' ber þegar styttingarpunkt; annar punktur yrði '3 klst..' (sást í vafra 21.9)
  if (st && n) s.push('Miðgildi svartíma var ' + st + (st.endsWith('.') ? '' : '.'));
  // EIN athugasemd, valin eftir reglu — tilbreyting án þess að líkan giski
  const f = t && t.algengastFlokkur, lo = t && t.lengstOpinn;
  if (f && f.heiti && Number(f.hlutfall) >= 0.4 && n >= 3) s.push('Flestar snerust um ' + String(f.heiti) + '.');
  else if (lo && lo.id && Number(lo.dagar) >= 3) s.push('Lengst hefur #' + tala(lo.id) + ' beðið, í ' + tala(lo.dagar) + ' ' + b(lo.dagar, 'dag', 'daga') + '.');
  const o = Number(t && t.opnir) || 0;
  s.push(o === 0 ? 'Engin er opin núna.' : tala(o) + ' ' + b(o, 'er enn opin', 'eru enn opnar') + '.');
  return s;
}

function saman(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' og ' + a[a.length - 1]; }
function fyrstiStor(x) { return x ? x[0].toUpperCase() + x.slice(1) : x; }
