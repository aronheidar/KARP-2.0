// rsk_fetch.mjs — sókn á www.skatturinn.is fyrir tengsla-crawlið, með sundurliðuðum
// villum og beinni varaleið þegar RSK-proxy workersins dugar ekki.
//
// ⚠ Bakgrunnur (greining 13.9.2026): crawl_tengsl.mjs hafði `fetchText` sem skilaði `null`
// fyrir ALLT — net-fall, 403, 500 og „HTTP 200 með tómri niðurstöðusíðu" (svona throttlar
// www.skatturinn.is). Kallandinn taldi 5 samfelld núll og hætti skrapi þeirrar nætur.
// Þegar leiðin gegnum PROXY_BASE hætti að skila kennitölum gerðist það á hverri einustu nótt:
// „0 uppgötvuð · 0 úr sweep" í 12 nætur samfleytt, en keyrslan endaði samt í `success` svo
// ekkert lét vita. Þáttun og uppspretta voru í lagi allan tímann (staðfest: bein sókn skilar
// 100 kt á forskeyti) — það var LEIÐIN sem brást, og log-línan gat ekki sagt okkur það.
//
// Þess vegna: (1) villur taldar eftir orsök og birtar í nætur-samantekt, (2) `gilt`-próf á
// innihaldinu svo 200-tómt sé meðhöndlað sem bilun en ekki sem gild niðurstaða, (3) bein
// varaleið á www.skatturinn.is, (4) proxy slekkur á sér eftir samfelldar bilanir svo bilaður
// proxy tvöfaldi ekki álagið á RSK alla nóttina.

const RSK_ROT = 'https://www.skatturinn.is';
const UA = 'karp.is tengslagrunnur (aronheidars@gmail.com)';

/**
 * @param {object} o
 * @param {string} o.proxyBase   Tómt = aðeins bein sókn (GH-IP).
 * @param {string} o.rskKey      Gátt proxy-sins. Fer ALDREI á www.skatturinn.is.
 * @param {number} [o.timeout]   ms; hangandi tengingar eru throttl-aðferð hjá RSK.
 * @param {number} [o.proxyMaxFail] Samfelldar proxy-bilanir áður en slökkt er á honum.
 * @param {Function} [o.fetchImpl]
 */
export function buildScrapeFetcher({ proxyBase = '', rskKey = '', timeout = 12000, proxyMaxFail = 3, fetchImpl = fetch } = {}) {
  const villur = {};
  let proxyFails = 0, proxyDautt = false;
  const telja = (k) => { villur[k] = (villur[k] || 0) + 1; };

  const sokn = async (url, headers, merki, gilt) => {
    let r;
    try {
      r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      telja(merki + (e && e.name === 'TimeoutError' ? ':timeout' : ':net'));
      return null;
    }
    if (!r.ok) { telja(merki + ':http-' + r.status); return null; }
    const html = await r.text().catch(() => null);
    if (html == null) { telja(merki + ':lestur'); return null; }
    // 200 en ónothæft = hvernig www.skatturinn.is throttlar (skilar tómri niðurstöðusíðu).
    if (gilt && !gilt(html)) { telja(merki + ':200-ognothaeft'); return null; }
    return html;
  };

  /**
   * @param {string} path  /fyrirtaekjaskra/... (SSRF-vörn proxy-sins krefst þessa forskeytis)
   * @param {(html: string) => boolean} [gilt]  Satt ef innihaldið er nothæft.
   * @returns {Promise<string|null>}
   */
  const fetchText = async (path, gilt) => {
    if (proxyBase && !proxyDautt) {
      const html = await sokn(
        proxyBase + '/api/rskproxy?p=' + encodeURIComponent(path),
        { 'User-Agent': UA, 'X-Karp-Proxy': rskKey },
        'proxy', gilt,
      );
      if (html != null) { proxyFails = 0; return html; }
      if (++proxyFails >= proxyMaxFail) {
        proxyDautt = true;
        console.error(`⚠ ${proxyMaxFail} samfelldar proxy-bilanir — slekk á RSK-proxy þessa nótt og sæki BEINT (sundurliðun í samantekt).`);
      }
    }
    return await sokn(RSK_ROT + path, { 'User-Agent': UA }, 'beint', gilt);
  };

  return { fetchText, stats: () => ({ villur, proxyDautt, proxyFails }) };
}
