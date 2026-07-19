// frettavel.mjs — sameiginleg flokka-skilgreining fyrir Fréttavélina (deilt af frettavel.astro + frettavel/[id].astro).
// Ein sannleiksuppspretta per frétta-tegund: merki (emoji+heiti), litur, flokka-mynd (endurnýtt),
// heimild (til birtingar) og „aðferð" (hvaða regla kviknaði — gagnsæi fyrir fréttamenn).
// img → web/public/frettavel/img/<img>.jpg (búið til handvirkt; mjúkt fallback ef vantar).
// Fjölbreytni: fleiri afbrigði per flokk (<img>-2.jpg, <img>-3.jpg…) — imgFor velur eitt fast eftir frétt-id.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAT = {
  // ── Alþingi (deila althingi-mynd) ──
  rebel:      { label: 'Atkvæði gegn flokki', emoji: '🗳️', color: '#e0655f', img: 'althingi', heimild: 'Alþingi', rule: 'Þingmaður kaus gegn ≥75% meirihluta eigin þingflokks í atkvæðagreiðslu.' },
  taep:       { label: 'Tæp atkvæðagreiðsla', emoji: '⚖️', color: '#ff8a3d', img: 'althingi', heimild: 'Alþingi', rule: 'Atkvæðagreiðsla réðst á ≤5 atkvæðum (raunveruleg atkvæðagreiðsla, ekki formsatriði).' },
  fjarvist:   { label: 'Fjarvistir', emoji: '🪑', color: '#e0655f', img: 'althingi', heimild: 'Alþingi', rule: 'Þingmaður greiddi ekki atkvæði í ≥25% atkvæðagreiðslna þingsins (fjarvistir geta átt eðlilegar skýringar).' },
  raedur:     { label: 'Ræðustóllinn', emoji: '🎤', color: '#9d86ff', img: 'althingi', heimild: 'Alþingi', rule: 'Þingmaður átti flestar ræðumínútur vikunnar (breyting á ræðugreiningu).' },
  stjorntap:  { label: 'Stjórnartap', emoji: '⚡', color: '#ff8a3d', img: 'althingi', heimild: 'Alþingi', rule: 'Mál var fellt þótt meirihluti stjórnarþingmanna styddi það.' },
  einn:       { label: 'Einn gegn öllum', emoji: '🗳️', color: '#e0655f', img: 'althingi', heimild: 'Alþingi', rule: 'Einn þingflokkur greiddi einróma atkvæði gegn máli sem allir aðrir studdu.' },
  radherra:   { label: 'Ný skipan', emoji: '🏛️', color: '#9d86ff', img: 'althingi', heimild: 'Alþingi', rule: 'Ný ráðherraskipan skv. uppfærðri ráðherraskrá Alþingis.' },
  // ── Kannanir ──
  fylgi:      { label: 'Kannanir', emoji: '📊', color: '#3aa0ff', img: 'kannanir', heimild: 'Kannanasafn Karp', rule: 'Flokkur mældist hæst/lægst í kannanasögu Karp, fór yfir/undir 5%-þröskuld eða varð stærsti flokkurinn.' },
  stjorn:     { label: 'Stjórnarfylgi', emoji: '🏛️', color: '#3aa0ff', img: 'kannanir', heimild: 'Kannanasafn Karp', rule: 'Samanlagt fylgi ríkisstjórnarflokkanna náði lágmarki eða fór yfir/undir 50% í könnunum.' },
  // ── Efnahagur ──
  fast:       { label: 'Fasteignamet', emoji: '🏠', color: '#42d086', img: 'fasteignir', heimild: 'Kaupskrá HMS', rule: 'Meðalfermetraverð á höfuðborgarsvæðinu náði sögulegu hámarki (mánaðarröð HMS).' },
  mark:       { label: 'Kauphöllin', emoji: '📈', color: '#f6b13b', img: 'markadir', heimild: 'Kauphöll Íslands', rule: 'Hlutabréf hreyfðist ≥4% á dag eða setti nýtt hæsta/lægsta gildi í gagnaröð Karp.' },
  spike:      { label: 'Greiðslufrávik', emoji: '💸', color: '#f6b13b', img: 'rikisgreidslur', heimild: 'Opnir reikningar ríkisins', rule: 'Greiðslur ríkisins til birgja voru ≥2,5× ellefu mánaða meðaltal síðasta mánuðinn.' },
  vextir:     { label: 'Stýrivextir', emoji: '🏦', color: '#3aa0ff', img: 'vextir', heimild: 'Seðlabanki Íslands', rule: 'Meginvextir Seðlabankans breyttust frá fyrri ákvörðun.' },
  verdbolga:  { label: 'Verðbólga', emoji: '🛒', color: '#ff8a3d', img: 'verdbolga', heimild: 'Seðlabanki Íslands', rule: 'Ný mæling ársverðbólgu (vísitala neysluverðs) birt.' },
  // ── Viðskipti / lögbirting ──
  gjaldthrot: { label: 'Gjaldþrot', emoji: '💼', color: '#e0655f', img: 'gjaldthrot', heimild: 'Lögbirtingablaðið', rule: 'Ný gjaldþrotaskiptabeiðni eða skiptabeiðni lögaðila birt í Lögbirtingablaðinu.' },
  utbod:      { label: 'Útboðsbylgja', emoji: '📋', color: '#9d86ff', img: 'utbod', heimild: 'Útboðsgáttir', rule: '≥3 ný opinber útboð í sama flokki auglýst á einum degi.' },
  urslit:     { label: 'Útboðsniðurstaða', emoji: '🏆', color: '#f6b13b', img: 'utbod', heimild: 'TED / útboðsgáttir', rule: 'Samningur gerður eða tilboð opnuð í opinberu útboði.' },
  styrkur:    { label: 'Styrkur', emoji: '💰', color: '#42d086', img: 'styrkir', heimild: 'Opinberir sjóðir', rule: 'Nýr styrkur ≥15 m.kr. úthlutaður úr opinberum sjóði.' },
  vorumerki:  { label: 'Vörumerki', emoji: '🏷️', color: '#3aa0ff', img: 'vorumerki', heimild: 'Hugverkastofan', rule: 'Nýtt vörumerki íslensks aðila skráð hjá Hugverkastofunni.' },
  ivilnun:    { label: 'Ívilnun', emoji: '📜', color: '#f6b13b', img: 'ivilnun', heimild: 'Ráðuneyti', rule: 'Ný ríkisívilnun skráð.' },
  // ── Dómsmál ──
  domur:      { label: 'Dómsmál', emoji: '⚖️', color: '#9d86ff', img: 'domsmal', heimild: 'Dómstólar', rule: 'Nýr dómur Hæstaréttar eða Landsréttar (einfölduð reifun).' },
  // ── Samfélag ──
  glaepir:    { label: 'Afbrot', emoji: '🚓', color: '#e0655f', img: 'afbrot', heimild: 'Ríkislögreglustjóri', rule: 'Hegningarlagabrotum á 1.000 íbúa fjölgaði/fækkaði um ≥15% milli ára í landshluta.' },
  atv:        { label: 'Vinnumarkaður', emoji: '👷', color: '#42d086', img: 'vinnumarkadur', heimild: 'Vinnumálastofnun', rule: 'Skráð atvinnuleysi náði ≥12 mánaða hæsta/lægsta gildi.' },
  baejarstjori:{ label: 'Sveitarstjórn', emoji: '🏘️', color: '#42d086', img: 'sveitarstjorn', heimild: 'Samband ísl. sveitarfélaga', rule: 'Nýr sveitarstjóri/bæjarstjóri skv. uppfærðri skrá.' },
  sendiherra: { label: 'Utanríkis', emoji: '🌍', color: '#3aa0ff', img: 'utanrikis', heimild: 'Utanríkisráðuneytið', rule: 'Ný skipan sendiherra Íslands skv. uppfærðri sendiráðaskrá.' },
  lyf:        { label: 'Lyfjaskortur', emoji: '💊', color: '#ff8a3d', img: 'lyf', heimild: 'Sérlyfjaskrá', rule: 'Skráður skortur á nauðsynlegu lyfi (Lyfjastofnun).' },
  sent:       { label: 'Umfjöllun', emoji: '🗣️', color: '#3aa0ff', img: 'fjolmidlar', heimild: 'Fjölmiðlavöktun Karp', rule: 'Tónn fjölmiðlaumfjöllunar um fyrirtæki breyttist skarpt (≥40 stig á -100…+100 kvarða).' },
  // ── Fasi 3: fleiri fjölbreytt fréttaefni ──
  kvoti:      { label: 'Sjávarútvegur', emoji: '🐟', color: '#2bb7a3', img: 'sjavarutvegur', heimild: 'Fiskistofa', rule: 'Aflamark fisktegundar nálgast fullnýtingu (≥85% nýtt).' },
  gengi:      { label: 'Gengi krónu', emoji: '💱', color: '#3aa0ff', img: 'markadir', heimild: 'Seðlabanki Íslands', rule: 'Gengisvísitala krónunnar setti nýtt hæsta eða lægsta gildi.' },
  ees:        { label: 'Evrópusambandið', emoji: '🇪🇺', color: '#5a8fe0', img: 'utanrikis', heimild: 'Stjórnartíðindi ESB / EES', rule: 'Ný gerð ESB sem kann að verða tekin upp í EES-samninginn.' },
  vika:       { label: 'Vika í tölum', emoji: '📅', color: '#f6b13b', img: 'annad', heimild: 'Samantekt Karp', rule: 'Vikulegur útdráttur lykil-hagtalna (birt á mánudögum).' },
};

export const catOf = (t) => CAT[t] || { label: 'Frétt', emoji: '📰', color: '#8fa0b8', img: 'annad', heimild: 'Opinber gögn', rule: 'Sjálfvirkur atburður greindur í opinberum gögnum.' };

// Yfir-deildir (fréttamiðils-flokkar) — hópa tegundir í deildir eins og MBL/Vísir (Viðskipti, Stjórnmál…).
export const SECTIONS = [
  { key: 'vidskipti', label: 'Viðskipti', types: ['mark', 'gjaldthrot', 'spike', 'styrkur', 'vorumerki', 'urslit', 'utbod', 'ivilnun', 'kvoti'] },
  { key: 'stjornmal', label: 'Stjórnmál', types: ['rebel', 'taep', 'fylgi', 'stjorn', 'fjarvist', 'raedur', 'stjorntap', 'einn', 'radherra', 'ees'] },
  { key: 'efnahagur', label: 'Efnahagur', types: ['vextir', 'verdbolga', 'fast', 'atv', 'gengi', 'vika'] },
  { key: 'domsmal', label: 'Dómsmál', types: ['domur', 'glaepir'] },
  { key: 'samfelag', label: 'Samfélag', types: ['baejarstjori', 'sendiherra', 'lyf', 'sent'] },
];
const SEC_OF = {}; SECTIONS.forEach((s) => s.types.forEach((t) => { SEC_OF[t] = s; }));
export const sectionOf = (t) => SEC_OF[t] || SECTIONS[0];

// Mikilvægis-vog (1–10) — velur aðalfrétt (hero) + „helstu" á forsíðu. Þung mál (vextir/gjaldþrot/verðbólga)
// vega meira en dagleg markaðs-tíst. Blandast við nýleika við röðun.
const WEIGHT = { vextir: 10, gjaldthrot: 9, stjorntap: 9, verdbolga: 8, radherra: 8, domur: 7, stjorn: 7, spike: 7, atv: 7, lyf: 6, fast: 6, fylgi: 6, styrkur: 6, urslit: 6, glaepir: 6, taep: 6, rebel: 6, einn: 6, utbod: 5, baejarstjori: 5, sendiherra: 5, fjarvist: 5, raedur: 5, ivilnun: 5, vorumerki: 3, mark: 3, sent: 3, gengi: 7, kvoti: 6, ees: 5, vika: 5 };
export const weightOf = (t) => WEIGHT[t] || 4;

// ASCII-hreint slóðar-id (SEO): íslenskir stafir → ascii, aðeins [a-z0-9-]. Nota BÆÐI á forsíðu-hlekkjum
// og í getStaticPaths svo þau stemmi. Deterministic → sama id gefur sömu slóð.
export const asciiId = (id) => String(id).toLowerCase()
  .replace(/[áàäâ]/g, 'a').replace(/æ/g, 'ae').replace(/[öøô]/g, 'o').replace(/þ/g, 'th').replace(/ð/g, 'd')
  .replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/[úü]/g, 'u').replace(/ý/g, 'y')
  .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

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
  const s = catOf(t).img;
  const v = scanVariants()[s];
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
