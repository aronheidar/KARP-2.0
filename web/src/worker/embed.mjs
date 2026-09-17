// embed.mjs — innfelldir gluggar á vefjum samstarfsaðila (allt.is fyrst).
//
// ⚠⚠ TELJARINN GEYMIR EKKERT PERSÓNUGREINANLEGT. Heimilisfang er persónugreinanlegt, og manneskja
// sem flettir upp sínu eigin húsi á fasteignasöluvef er að gefa sterkt til kynna að hún sé að íhuga
// sölu. Sá listi fer hvorki til samstarfsaðilans né í okkar geymslu. Karp selur áreiðanleikakannanir
// og má ekki vera fyrirtækið sem lekur uppflettingum.
//
// Ein notkun telst hvert skipti sem verðbil er BIRT. Ekki misheppnuð uppfletting, ekki hætt við.

/** Lokaður listi. Nýr samstarfsaðili kemur inn hér, hvergi annars staðar. */
export const EMBED_LEN = ['allt'];

/** Lén sem mega ramma inn gluggann. Lykill = uppspretta úr EMBED_LEN. */
export const EMBED_RAMMAR = { allt: ['https://allt.is', 'https://www.allt.is'] };

const embedSvar = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function embedTalningHandler(request, env) {
  if (request.method !== 'POST') return embedSvar(405, { error: 'method' });
  const u = new URL(request.url).searchParams.get('u') || '';
  if (!EMBED_LEN.includes(u)) return embedSvar(400, { error: 'uppspretta' });
  const dagur = new Date().toISOString().slice(0, 10);
  try {
    // ⚠ Aðeins dagur og uppspretta fara inn. Ekkert annað úr beiðninni snertir gagnagrunninn.
    await env.TENGSL.prepare(
      'INSERT INTO embed_notkun (dagur, uppspretta, fjoldi) VALUES (?,?,1) '
      + 'ON CONFLICT(dagur, uppspretta) DO UPDATE SET fjoldi = fjoldi + 1',
    ).bind(dagur, u).run();
  } catch (e) {
    // ⚠ Talning má ALDREI fella gluggann. Matið er aðalatriðið, talningin er reikningsgerð.
  }
  return embedSvar(200, { ok: true });
}

/**
 * Ber fram innfelldu síðuna með RÉTTUM ramma-hausum.
 *
 * ⚠⚠ `web/public/_headers` setur `X-Frame-Options: SAMEORIGIN` og `frame-ancestors 'self'` á allt.
 * Hvort tveggja lokar glugganum úti hjá samstarfsaðilanum, og X-Frame-Options er HARÐARI en CSP —
 * enginn CSP-haus vinnur hana upp í eldri vöfrum. Hún verður að hverfa fyrir ÞESSA leið eina.
 *
 * ⚠ Undantekningin nær aðeins til /embed/. Aldrei víðar. Skilar null fyrir aðrar leiðir svo
 * venjulega leiðavalið taki við óbreytt.
 *
 * @returns {Promise<Response|null>}
 */
export async function embedSidaHandler(request, env) {
  const slod = new URL(request.url).pathname;
  if (!slod.startsWith('/embed/')) return null;
  const upp = await env.ASSETS.fetch(request);
  const h = new Headers(upp.headers);
  h.delete('x-frame-options');
  const len = [...new Set(Object.values(EMBED_RAMMAR).flat())].join(' ');
  h.set('content-security-policy', "frame-ancestors 'self' " + len);
  return new Response(upp.body, { status: upp.status, headers: h });
}
