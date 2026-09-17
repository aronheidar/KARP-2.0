// verdmat-gluggi.mjs — rökvísi verðmatsgluggans á allt.is. Engin I/O, ekkert DOM.
//
// Hér liggur allt sem hægt er að hafa rangt fyrir sér um. Skráin embed/verdmat.astro tengir aðeins
// DOM við þessi föll og tekur engar ákvarðanir sjálf.
//
// ⚠ 47% eigna á Reykjanesi eru ekki í kaupskránni (mælt 17.9.2026). Þá kemur stærðin frá notandanum
// og það VERÐUR að standa undir niðurstöðunni, svo enginn haldi að við höfum flett henni upp.

const nlyk = (s) => String(s == null ? '' : s).trim().toLowerCase();

/** „Heiðarbraut 12, 230" -> { fang:'heiðarbraut 12', pn:'230' }. Kommað er valfrjálst. */
export function thattaFang(s) {
  const t = String(s == null ? '' : s).trim();
  const m = t.match(/^(.*?)[,\s]+(\d{3})\s*$/);
  return m ? { fang: nlyk(m[1]), pn: m[2] } : { fang: nlyk(t), pn: null };
}

/**
 * Velur forsendur matsins. Skráð eign gengur fyrir; annars innsláttur notandans.
 * @returns {{teg:string, fm:number, ar:(number|null), fraNotanda:boolean}|null}
 */
export function veljaForsendur(eign, innslattur) {
  if (eign && Number(eign.fm) > 15) {
    return { teg: eign.teg, fm: Number(eign.fm), ar: Number(eign.ar) || null, fraNotanda: false };
  }
  if (!innslattur) return null;
  const fm = Number(innslattur.fm);
  if (!Number.isFinite(fm) || fm <= 15) return null;
  return { teg: innslattur.teg, fm, ar: Number(innslattur.ar) || null, fraNotanda: true };
}

/** Línan undir bilinu. Nefnir AÐEINS þær síur sem voru raunverulega virkar. */
export function grunnurTexti(r, pn, fraNotanda) {
  return [
    (r && r.n) + ' sambærilegar sölur í ' + pn,
    r && r.arSia ? 'byggingarár ±15 ár' : null,
    r && r.radiusKm ? 'innan ' + r.radiusKm + ' km' : null,
    fraNotanda ? 'miðað við stærð og byggingarár sem þú slóst inn' : null,
  ].filter(Boolean).join(' · ');
}

/** ⚠ Lyklar hnitaskrárinnar eru LÁGSTAFA. Skilar [lat, lon] eða null. */
export function hnitAfFangi(hnit, fang) {
  const h = hnit && hnit[nlyk(fang)];
  return (h && Number.isFinite(h[0]) && Number.isFinite(h[1])) ? [h[0], h[1]] : null;
}
