// frettavel.mjs — sameiginleg flokka-skilgreining fyrir Fréttavélina (deilt af frettavel.astro + frettavel/[id].astro).
// Ein sannleiksuppspretta per frétta-tegund: merki (emoji+heiti), litur, flokka-mynd (endurnýtt),
// heimild (til birtingar) og „aðferð" (hvaða regla kviknaði — gagnsæi fyrir fréttamenn).
// img → web/public/frettavel/img/<img>.jpg (búið til handvirkt; mjúkt fallback ef vantar).
// Fjölbreytni: fleiri afbrigði per flokk (<img>-2.jpg, <img>-3.jpg…) — imgFor velur eitt fast eftir frétt-id.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAT, SECTIONS, asciiId } from './frettavel-cat.mjs';
export { CAT, SECTIONS, asciiId };

export const catOf = (t) => CAT[t] || { label: 'Frétt', emoji: '📰', color: '#8fa0b8', img: 'annad', heimild: 'Opinber gögn', rule: 'Sjálfvirkur atburður greindur í opinberum gögnum.' };

// Yfir-deildir (fréttamiðils-flokkar) — hópa tegundir í deildir eins og MBL/Vísir (Viðskipti, Stjórnmál…).
const SEC_OF = {}; SECTIONS.forEach((s) => s.types.forEach((t) => { SEC_OF[t] = s; }));
export const sectionOf = (t) => SEC_OF[t] || SECTIONS[0];

// Mikilvægis-vog (1–10) — velur aðalfrétt (hero) + „helstu" á forsíðu. Þung mál (vextir/gjaldþrot/verðbólga)
// vega meira en dagleg markaðs-tíst. Blandast við nýleika við röðun.
const WEIGHT = { vextir: 10, gjaldthrot: 9, stjorntap: 9, verdbolga: 8, radherra: 8, domur: 7, stjorn: 7, spike: 7, atv: 7, lyf: 6, fast: 6, fylgi: 6, styrkur: 6, urslit: 6, glaepir: 6, taep: 6, rebel: 6, einn: 6, utbod: 5, baejarstjori: 5, sendiherra: 5, fjarvist: 5, raedur: 5, ivilnun: 5, vorumerki: 3, mark: 3, sent: 3, gengi: 7, kvoti: 6, ees: 5, vika: 5, birgirthrot: 9, rikisfe: 6, toppar: 6, nefnd: 5, fastthr: 7, leiga: 6, samanburdur: 5, bygging: 5, sveitfe: 6, graent: 5, fyrvik: 6, thema: 8, fonix: 7, eftirlit: 6 };
export const weightOf = (t) => WEIGHT[t] || 4;

export const imgPath = (t) => '/frettavel/img/' + (catOf(t).img) + '.jpg';

// Skannar mynda-möppuna á BYGGINGARTÍMA og finnur öll afbrigði per slug (<slug>.jpg, <slug>-2.jpg …).
let _variants = null;
function scanVariants() {
  if (_variants) return _variants;
  _variants = {};
  try {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'frettavel', 'img');
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^([a-z0-9_]+)(?:-(\d+))?\.jpe?g$/i);
      if (m) { const s = m[1].toLowerCase(); (_variants[s] = _variants[s] || []).push('/frettavel/img/' + f); }
    }
    for (const k in _variants) _variants[k].sort();
  } catch (e) { _variants = {}; }
  return _variants;
}
const _hash = (s) => { let h = 5381; const t = String(s); for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h; };
// Velur flokka-mynd fyrir tiltekna frétt: fast afbrigði eftir id (sama frétt = sama mynd; ólíkar fréttir í
// flokknum dreifast á afbrigðin). Fellur á grunn-slóð ef ekkert afbrigði fannst (þá sér onerror um emoji-fallback).
export const imgFor = (t, id) => {
  const c = catOf(t), sv = scanVariants();
  let s = c.img, v = sv[s];
  if ((!v || !v.length) && c.imgFb) { s = c.imgFb; v = sv[s]; }   // vara-mynd (imgFb) þar til sérmynd flokks er hlaðið upp — engin afturför
  return (v && v.length) ? v[_hash(id || s) % v.length] : ('/frettavel/img/' + s + '.jpg');
};
export const artHref = (id) => '/frettavel/' + asciiId(id) + '/';

// Dagsetning á íslensku (birt).
export const dIS = (d) => { const m = String(d).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]}.${+m[2]}.${m[1]}` : String(d); };

// Smágraf úr tímaröð (spark): SVG-hnit. Skilar null ef of stutt. w/h yfirskrifanlegt fyrir stækkað graf.
export const spark = (arr, w = 130, h = 32) => {
  const a = (arr || []).filter((x) => typeof x === 'number');
  if (a.length < 4) return null;
  const p = 3, mn = Math.min(...a), mx = Math.max(...a), rng = (mx - mn) || 1;
  const xs = (i) => p + (i / (a.length - 1)) * (w - 2 * p);
  const ys = (v) => p + (1 - (v - mn) / rng) * (h - 2 * p);
  const pts = a.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  const area = `${xs(0).toFixed(1)},${h - p} ${pts} ${xs(a.length - 1).toFixed(1)},${h - p}`;
  return { pts, area, w, h, ex: xs(a.length - 1).toFixed(1), ey: ys(a[a.length - 1]).toFixed(1) };
};
