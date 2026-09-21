// skriptur/lib/nikotinpudar.mjs — þáttun á vörusíðum Svens fyrir /furduhagfraedi/#nikotingjald.
//
// ⚠ Töflur Svens eru <td> í BÁÐUM dálkum, ekkert <th>. Fyrsta talningin (21.9.2026) leitaði að <th>
//   og fékk ekkert. Hér er tekið við hvoru tveggja.
// ⚠ Styrkur er „mg/púði – mg/g", t.d. „13,5 – 19,3" eða „12,5-20". Annað snið („12mg, 20mg") er
//   skilað sem óþáttuðu og TALIÐ SÉR. Aldrei giskað á hvor talan er hvað.

const dec = (s) => Number(String(s).trim().replace(',', '.'));

const hreinsa = (s) => String(s)
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&ndash;/g, '–')
  .replace(/\s+/g, ' ').trim();

/** Slóðir vörusíðna úr product-sitemap.xml. */
export const thattaSitemap = (xml) => [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].trim()).filter((u) => /\/products\//.test(u));

/** Merking → gildi úr öllum tveggja dálka töfluröðum síðunnar. */
export function thattaToflu(html) {
  const ut = {};
  for (const m of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const reitir = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => hreinsa(c[1]));
    if (reitir.length === 2 && reitir[0]) ut[reitir[0]] = reitir[1];
  }
  return ut;
}

/** „13,5 – 19,3" → { mgPudi: 13.5, mgG: 19.3 }; annað snið → null. */
export function thattaStyrk(s) {
  const m = String(s ?? '').replace(/[–—]/g, '-').replace(/\s+/g, '')
    .match(/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)$/);
  return m ? { mgPudi: dec(m[1]), mgG: dec(m[2]) } : null;
}

/**
 * Núverandi verð vörunnar. JSON-LD Product → offers → priceSpecification ÁN priceType
 * (sú MEÐ priceType er ListPrice, verðið fyrir útsölu). Varaleið: <ins> í <p class="price">.
 */
export function thattaVerd(html) {
  for (const m of String(html).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    const hlutir = Array.isArray(j) ? j : (j['@graph'] || [j]);
    for (const g of hlutir) {
      const tegund = [].concat(g?.['@type'] || []);
      if (!tegund.includes('Product')) continue;
      for (const o of [].concat(g.offers || [])) {
        const nu = [].concat(o.priceSpecification || []).find((p) => p && !p.priceType);
        const v = Number(nu ? nu.price : o.price);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
  }
  const p = String(html).match(/<p class="price">([\s\S]*?)<\/p>/);
  const s = p && (p[1].match(/<ins[\s\S]*?<bdi>([\d.]+)/) || p[1].match(/<bdi>([\d.]+)/));
  return s ? Number(s[1].replace(/\./g, '')) : null;
}

/**
 * Flokkar færslu: 'pudi' (styrkur þáttaður), 'rafretta' (ein tala), 'othattad' (annað snið, talið
 * sér) eða null (enginn nikótínstyrkur, t.d. aukahlutur).
 * ⚠ 21.9.2026 voru ALLAR 163 síður með eina tölu rafrettur eða áfyllingar (Elfbar, Fuyl, Blys …),
 *   gildið 20 eða 0 mg/ml. Án þessa flokks sagði loggurinn „169 á öðru sniði" þegar púðarnir á
 *   öðru sniði voru sex.
 */
export function flokka(v) {
  if (v.strengur == null) return null;
  if (v.mgG != null) return 'pudi';
  return /^\d+(?:[.,]\d+)?$/.test(String(v.strengur).trim()) ? 'rafretta' : 'othattad';
}

/** Ein vörusíða → færsla. strengur=null þýðir að síðan er ekki púði. */
export function thattaVoru(html, slod) {
  const tafla = thattaToflu(html);
  const lykill = (re) => Object.keys(tafla).find((k) => re.test(k));
  const kStyrkur = lykill(/nikótínstyrkur/i);
  const kDos = lykill(/magn í dós/i);
  const strengur = kStyrkur ? tafla[kStyrkur] : null;
  const styrkur = thattaStyrk(strengur);
  return {
    nafn: hreinsa((String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || ''),
    slod,
    verd: thattaVerd(html),
    dosG: kDos ? dec(tafla[kDos]) : null,
    strengur,
    mgPudi: styrkur ? styrkur.mgPudi : null,
    mgG: styrkur ? styrkur.mgG : null,
  };
}
