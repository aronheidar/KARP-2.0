// frettavel.mjs — sameiginleg flokka-skilgreining fyrir Fréttavélina (deilt af frettavel.astro + frettavel/[id].astro).
// Ein sannleiksuppspretta per frétta-tegund: merki (emoji+heiti), litur, flokka-mynd (endurnýtt),
// heimild (til birtingar) og „aðferð" (hvaða regla kviknaði — gagnsæi fyrir fréttamenn).
// img → web/public/frettavel/img/<img>.webp (búið til handvirkt; mjúkt fallback ef vantar).

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
};

export const catOf = (t) => CAT[t] || { label: 'Frétt', emoji: '📰', color: '#8fa0b8', img: 'annad', heimild: 'Opinber gögn', rule: 'Sjálfvirkur atburður greindur í opinberum gögnum.' };

// ASCII-hreint slóðar-id (SEO): íslenskir stafir → ascii, aðeins [a-z0-9-]. Nota BÆÐI á forsíðu-hlekkjum
// og í getStaticPaths svo þau stemmi. Deterministic → sama id gefur sömu slóð.
export const asciiId = (id) => String(id).toLowerCase()
  .replace(/[áàäâ]/g, 'a').replace(/æ/g, 'ae').replace(/[öøô]/g, 'o').replace(/þ/g, 'th').replace(/ð/g, 'd')
  .replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/[úü]/g, 'u').replace(/ý/g, 'y')
  .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export const imgPath = (t) => '/frettavel/img/' + (catOf(t).img) + '.jpg';
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
