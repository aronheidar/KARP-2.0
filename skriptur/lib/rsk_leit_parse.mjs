// rsk_leit_parse.mjs — les niðurstöðutöflu nafnaleitar fyrirtækjaskrár.
//
// www.skatturinn.is/fyrirtaekjaskra/leit?nafn=<q> skilar töflu með ÞREMUR dálkum:
// kennitala (tengill), nafn (+ tómur <em>-merkjareitur) og póstfang. lib/sweep.mjs
// dró aðeins kennitöluna út; nafnið liggur í sömu sókn og er það sem fyrirtækjaskráin
// á karp.is (/fyrirtaeki/skra/) og sitemap þurfa. Ein sókn, þrír reitir.
//
// ⚠ Aðeins lögaðilar (kt 41–71 í fyrstu tveimur). Leitin getur skilað einstaklingum
// í sumum tilvikum og þeir eiga hvergi heima í fyrirtækjaskránni okkar.

const EININGAR = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', yacute: 'ý',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Yacute: 'Ý',
  eth: 'ð', ETH: 'Ð', thorn: 'þ', THORN: 'Þ', aelig: 'æ', AElig: 'Æ',
  ouml: 'ö', Ouml: 'Ö', ooo: '', oslash: 'ø',
};

const afkoda = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (EININGAR[n] !== undefined ? EININGAR[n] : m));

const hreint = (html) => afkoda(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const erLogadili = (kt) => /^\d{10}$/.test(kt) && +kt.slice(0, 2) >= 41 && +kt.slice(0, 2) <= 71;

/**
 * Hvað sagði leitin? Síðan orðar það sjálf, og það er EINA áreiðanlega leiðin til að
 * greina „forskeytið á engin félög“ frá „RSK þrengir að okkur“ — bæði skila HTTP 200
 * með engum kennitölum. Sweep sem ruglar þessu saman bíður endalaust eftir glugga sem
 * var aldrei lokaður (kom fyrir 13.9 á forskeytinu „ð“).
 *
 * @returns {'nidurstodur'|'tomt'|'obrugdid'}
 */
export function flokkaLeit(html) {
  const t = afkoda(String(html || '')).replace(/\s+/g, ' ');
  if (/skilaði engri niðurstöðu/i.test(t)) return 'tomt';
  if (/skilaði eftirfarandi niðurstöðum/i.test(t)) return 'nidurstodur';
  return 'obrugdid';
}

/**
 * @param {string} html  Heil niðurstöðusíða EÐA brot með <tr>-röðum.
 * @returns {{kt: string, nafn: string, postfang: string, merki: string}[]}
 */
export function parseLeit(html) {
  const ut = [];
  const sed = new Set();
  for (const m of String(html || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rod = m[1];
    const kt = (rod.match(/kennitala\/(\d{10})/) || [])[1];
    if (!kt || !erLogadili(kt) || sed.has(kt)) continue;
    const tds = [...rod.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1]);
    // [0] = kennitölu-tengill, [1] = nafn (+ <em>-merki), [2] = póstfang.
    const nafnHolf = tds[1] || '';
    const merki = hreint((nafnHolf.match(/<em[^>]*>([\s\S]*?)<\/em>/i) || [])[1] || '');
    const nafn = hreint(nafnHolf.replace(/<em[^>]*>[\s\S]*?<\/em>/gi, ''));
    if (!nafn) continue;
    sed.add(kt);
    ut.push({ kt, nafn, postfang: hreint(tds[2] || ''), merki });
  }
  return ut;
}
